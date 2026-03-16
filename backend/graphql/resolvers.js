const Anthropic = require('@anthropic-ai/sdk');
const { query } = require('../config/db');
const { testConnection: testNeo4j } = require('../config/graph');
const { testConnection: testPostgres } = require('../config/db');

const anthropic = new Anthropic.default({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// System prompt: instructs Claude to ground every answer in source documents
// and always cite session numbers and dates — Simone's non-negotiable requirement
const SYSTEM_PROMPT = `You are Politor, an AI assistant specialised in analysing Italian Council of Ministers (Consiglio dei Ministri) sessions.

You are given a set of official session records as context. Your task is to answer the user's question accurately and concisely, always grounding your response in the provided source documents.

Rules:
1. Always cite the session number and date when referencing a specific session (e.g. "Session #450, 12 March 2023").
2. If the answer cannot be found in the provided context, say so clearly — do not hallucinate.
3. Keep answers focused and structured. Use bullet points for multi-item answers.
4. Respond in the same language the user uses.
5. The context below represents the relevant sessions retrieved for this question.`;

/**
 * Search sessions by keyword across the data and info JSONB fields.
 * Extracts keywords from the message and uses PostgreSQL full-text / ILIKE search.
 */
async function searchRelevantSessions(message) {
  // Basic keyword extraction — split on whitespace, filter short words
  const keywords = message
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .slice(0, 5);

  if (keywords.length === 0) {
    // Fallback: return the most recent 5 sessions
    const result = await query(
      'SELECT * FROM sessions ORDER BY date DESC NULLS LAST LIMIT 5',
      []
    );
    return result.rows;
  }

  // Build ILIKE conditions across data and info TEXT fields
  const conditions = keywords
    .map((_, i) => `(data ILIKE $${i + 1} OR info ILIKE $${i + 1})`)
    .join(' OR ');
  const params = keywords.map((k) => `%${k}%`);

  const result = await query(
    `SELECT * FROM sessions WHERE ${conditions} ORDER BY date DESC NULLS LAST LIMIT 8`,
    params
  );
  return result.rows;
}

/**
 * Format session rows as readable context for the AI prompt.
 */
function formatSessionContext(sessions) {
  if (sessions.length === 0) {
    return 'No session records are currently available in the database. The data ingestion step has not been run yet.';
  }
  return sessions
    .map((s) => {
      const date = s.date ? new Date(s.date).toLocaleDateString('en-GB') : 'unknown date';
      const dataPreview = s.data ? s.data.slice(0, 400) : '(no data)';
      return `--- Session #${s.number || s.id} | ${date} | Branch: ${s.branch || 'n/a'} | Type: ${s.type || 'n/a'} | Status: ${s.status || 'n/a'}\n${dataPreview}`;
    })
    .join('\n\n');
}

const resolvers = {
  Query: {
    systemHealth: async () => {
      let postgresStatus = 'ok';
      let neo4jStatus = 'ok';

      try {
        await testPostgres();
      } catch {
        postgresStatus = 'error';
      }

      try {
        await testNeo4j();
      } catch {
        neo4jStatus = 'error';
      }

      return {
        postgres: postgresStatus,
        neo4j: neo4jStatus,
        timestamp: new Date().toISOString(),
      };
    },

    sessions: async (_parent, { limit = 20, offset = 0, branch, type, status }) => {
      const conditions = [];
      const params = [];

      if (branch) {
        params.push(branch);
        conditions.push(`branch ILIKE $${params.length}`);
      }
      if (type) {
        params.push(type);
        conditions.push(`type ILIKE $${params.length}`);
      }
      if (status) {
        params.push(status);
        conditions.push(`status ILIKE $${params.length}`);
      }

      params.push(limit);
      params.push(offset);

      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const sql = `SELECT * FROM sessions ${where} ORDER BY date DESC NULLS LAST LIMIT $${params.length - 1} OFFSET $${params.length}`;

      const result = await query(sql, params);
      return result.rows.map((row) => ({ ...row, id: String(row.id) }));
    },

    session: async (_parent, { id }) => {
      const result = await query('SELECT * FROM sessions WHERE id = $1', [id]);
      const row = result.rows[0];
      if (!row) return null;
      return { ...row, id: String(row.id) };
    },

    // TODO: Replace stub with real RBAC once auth is implemented
    me: () => ({
      id: '0',
      email: 'admin@politor.local',
      name: 'Politor Admin',
      role: 'Admin',
      company_id: 1,
    }),

    users: async () => {
      const result = await query(
        'SELECT id, email, name, role, company_id FROM users ORDER BY id ASC',
        []
      );
      return result.rows.map((r) => ({ ...r, id: String(r.id) }));
    },
  },

  Mutation: {
    // TODO: Implement real JWT auth with bcrypt password verification
    // For now: look up the user's role from the DB and encode it in a base64 stub token
    login: async (_parent, { email }) => {
      const result = await query('SELECT role FROM users WHERE email = $1 LIMIT 1', [email]);
      const role = result.rows[0]?.role || 'Member';
      const payload = Buffer.from(JSON.stringify({ email, role })).toString('base64');
      return payload;
    },

    createUser: async (_parent, { email, name, role, password }) => {
      // TODO: hash the password with bcrypt before storing
      const result = await query(
        `INSERT INTO users (email, name, role, password_hash, company_id)
         VALUES ($1, $2, $3, $4,
           (SELECT id FROM organizations LIMIT 1))
         RETURNING id, email, name, role, company_id`,
        [email, name, role, `plain:${password}`]
      );
      const r = result.rows[0];
      return { ...r, id: String(r.id) };
    },

    deleteUser: async (_parent, { id }) => {
      const result = await query('DELETE FROM users WHERE id = $1', [id]);
      return result.rowCount > 0;
    },

    updateUserPassword: async (_parent, { id, newPassword }) => {
      // TODO: hash the password with bcrypt before storing
      const result = await query(
        'UPDATE users SET password_hash = $1 WHERE id = $2',
        [`plain:${newPassword}`, id]
      );
      return result.rowCount > 0;
    },

    updateUserRole: async (_parent, { id, role }) => {
      const result = await query(
        'UPDATE users SET role = $1 WHERE id = $2 RETURNING id, email, name, role, company_id',
        [role, id]
      );
      const r = result.rows[0];
      return { ...r, id: String(r.id) };
    },

    chat: async (_parent, { message, conversation_history = [] }) => {
      // 1. Retrieve relevant sessions from PostgreSQL
      const sessions = await searchRelevantSessions(message);

      // 2. Format sessions as grounded context for the AI
      const contextBlock = formatSessionContext(sessions);

      // 3. Build message history for multi-turn conversation
      const history = (conversation_history || []).map((m) => ({
        role: m.role,
        content: m.content,
      }));

      // 4. Compose the user message with injected context
      const userMessageWithContext = `Context — relevant Council of Ministers sessions:\n\n${contextBlock}\n\n---\n\nUser question: ${message}`;

      const messages = [
        ...history,
        { role: 'user', content: userMessageWithContext },
      ];

      // 5. Call Anthropic Claude
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages,
      });

      const aiMessage = response.content[0].text;

      // 6. Return AI response with the source sessions used
      const contextUsed = sessions.map((row) => ({ ...row, id: String(row.id) }));

      return {
        message: aiMessage,
        context_used: contextUsed,
      };
    },
  },
};

module.exports = { resolvers };
