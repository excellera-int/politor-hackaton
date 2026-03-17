const Anthropic = require('@anthropic-ai/sdk');
const { query } = require('../config/db');
const { driver: neo4jDriver, testConnection: testNeo4j } = require('../config/graph');
const { testConnection: testPostgres } = require('../config/db');
const { tools: neo4jTools } = require('../mcp_tools/neo4j_tools');

const anthropic = new Anthropic.default({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const SYSTEM_PROMPT = `You are Politor, an AI assistant specialised in analysing Italian Council of Ministers (Consiglio dei Ministri) sessions stored in a Neo4j knowledge graph.

You have access to tools that query the graph directly. Always retrieve data before answering — never answer from memory.

## Tool selection rules

- Question about a topic/law → search_by_issue or search_paragraphs
- Question about a person/ministry → search_by_stakeholder or get_stakeholder_profile
- Question about a specific sector → search_by_industry
- Question about a specific meeting → list_sessions (to find the ID), then get_session_paragraphs
- Ranking question ("chi ha proposto più...") → list_stakeholders or list_issues

## Date filtering — CRITICAL

When the question mentions ANY time period (month, year, quarter, "recent", "last N sessions"):
- ALWAYS pass date_from and date_to to the search tools
- Format: YYYY-MM-DD (e.g. date_from="2025-12-01", date_to="2025-12-31")
- Never fetch all data and filter mentally — always filter at the query level
- For "last N sessions": first call list_sessions with a limit to find their date range, then search within it

## Response rules

1. Cite session number and date for every claim (e.g. "CdM n. 163, 26 febbraio 2026").
2. If no data is found after filtering, say so explicitly — do not invent information.
3. Keep answers structured: use headers for sessions, bullet points for agenda items.
4. Respond in the same language the user uses (Italian or English).`;

/**
 * Group raw tool result rows by sessionId for the frontend right panel.
 */
function buildSessionResults(rows) {
  const sessionMap = new Map();
  for (const row of rows) {
    if (!row.sessionId) continue;
    if (!sessionMap.has(row.sessionId)) {
      sessionMap.set(row.sessionId, {
        sessionId: row.sessionId,
        sessionTitle: row.sessionTitle || row.mainTitle || '',
        date: row.date || row.sessionDate || '',
        url: row.url || '',
        paragraphs: new Map(),
      });
    }
    const session = sessionMap.get(row.sessionId);
    const pid = row.paragraphId;
    if (pid && !session.paragraphs.has(pid)) {
      session.paragraphs.set(pid, {
        paragraphId: pid,
        title: row.title || row.paragraphTitle || '',
        contentPreview: row.contentPreview || '',
        issue: row.issue || '',
        subIssue: row.subIssue || '',
        issueCode: row.issueCode || row.code || '',
        stakeholders: row.stakeholders ? JSON.stringify(row.stakeholders) : '',
      });
    }
  }
  return Array.from(sessionMap.values())
    .sort((a, b) => (b.date > a.date ? 1 : -1))
    .map((s) => ({ ...s, paragraphs: Array.from(s.paragraphs.values()) }));
}

/**
 * Execute an MCP tool by name with the given input.
 */
async function executeTool(toolName, toolInput) {
  const tool = neo4jTools.find((t) => t.name === toolName);
  if (!tool) {
    console.error(`[CHAT] Unknown tool requested: ${toolName}`);
    return { error: `Unknown tool: ${toolName}` };
  }
  console.log(`[CHAT] → tool: ${toolName}`, JSON.stringify(toolInput));
  try {
    const result = await tool.handler(toolInput, neo4jDriver);
    console.log(`[CHAT] ← tool: ${toolName} returned ${Array.isArray(result) ? result.length + ' rows' : 'object'}`);
    return result;
  } catch (err) {
    console.error(`[CHAT] tool error (${toolName}):`, err.message);
    return { error: err.message };
  }
}

/**
 * Agentic loop: call Claude, execute tool calls, feed results back, repeat
 * until Claude produces a final text response (stop_reason === 'end_turn').
 */
async function agenticChat(userMessage, conversationHistory) {
  const toolDefs = neo4jTools.map(({ name, description, input_schema }) => ({
    name,
    description,
    input_schema,
  }));

  // Build message list from conversation history + new user message
  const messages = [
    ...(conversationHistory || []).map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: userMessage },
  ];

  const toolsUsed = [];
  const allToolResults = []; // collect raw rows from every tool call
  const MAX_ITERATIONS = 8;

  console.log(`[CHAT] New request: "${userMessage.slice(0, 80)}..."`);

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    console.log(`[CHAT] Iteration ${i + 1} — calling Claude (${messages.length} messages in context)`);
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      tools: toolDefs,
      messages,
    });

    // Append assistant message to history
    messages.push({ role: 'assistant', content: response.content });

    console.log(`[CHAT] stop_reason: ${response.stop_reason}`);

    if (response.stop_reason === 'end_turn') {
      const textBlock = response.content.find((b) => b.type === 'text');
      console.log(`[CHAT] Done. Tools used: ${toolsUsed.map(t => t.tool).join(', ') || 'none'}`);
      return { message: textBlock ? textBlock.text : '', toolsUsed, sessionResults: buildSessionResults(allToolResults) };
    }

    if (response.stop_reason === 'tool_use') {
      // Execute all tool calls in parallel
      const toolBlocks = response.content.filter((b) => b.type === 'tool_use');
      const results = await Promise.all(
        toolBlocks.map(async (block) => {
          const result = await executeTool(block.name, block.input);
          toolsUsed.push({ tool: block.name, input: block.input });
          // Only collect results from retrieval tools (not discovery tools)
          const toolDef = neo4jTools.find((t) => t.name === block.name);
          if (toolDef && toolDef.retrieval) {
            const rows = Array.isArray(result) ? result : result.activity || [];
            rows.forEach((row) => { if (row.sessionId) allToolResults.push(row); });
          }
          return { type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result) };
        })
      );
      messages.push({ role: 'user', content: results });
      continue;
    }

    // max_tokens or other stop reason — return whatever text we have
    const textBlock = response.content.find((b) => b.type === 'text');
    return { message: textBlock ? textBlock.text : '(no response)', toolsUsed, sessionResults: buildSessionResults(allToolResults) };
  }

  return { message: 'Reached maximum tool-call iterations without a final answer.', toolsUsed, sessionResults: buildSessionResults(allToolResults) };
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
      try {
        const { message: aiMessage, sessionResults } = await agenticChat(message, conversation_history);
        return { message: aiMessage, context_used: [], sessions: sessionResults || [] };
      } catch (err) {
        console.error('[CHAT] Fatal error:', err.message);
        throw err;
      }
    },
  },
};

module.exports = { resolvers };
