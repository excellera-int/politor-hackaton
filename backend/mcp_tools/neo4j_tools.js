/**
 * Neo4j MCP Tools — Politor
 *
 * Each tool has:
 *   - name, description, input_schema  → sent to Claude as tool definitions
 *   - handler(input, driver)           → executes Cypher, returns rows
 *   - retrieval: true/false            → true = results shown in right panel
 *                                        false = discovery only (list/count tools)
 *
 * Dataset: 41 CdM sessions (2025-2026), 330 paragraphs, 294 stakeholders, 45 issues, 8 industries.
 * Date format in DB: "2026-02-26 11:37:00" — string comparison works for range filtering.
 *
 * Stakeholder types: person | institution | ministry | company | eu_body | association
 * mentionType:       proposer | responsible_ministry | co_signer | cited_institution | named_person
 * Industries:        Finance | Energy & Utilities | Infrastructure & Transportation |
 *                    Manufacturing & Industrial Production | Healthcare |
 *                    Technology, Media & Telecommunications |
 *                    Professional Services & Education / Culture | Consumer Goods & Retail
 */

async function cypher(driver, query, params = {}) {
  const safeParams = {};
  for (const [k, v] of Object.entries(params)) {
    safeParams[k] = typeof v === 'number' ? Math.floor(v) : v;
  }
  const session = driver.session();
  try {
    const result = await session.run(query, safeParams);
    return result.records.map((r) => {
      const obj = {};
      r.keys.forEach((k) => {
        const val = r.get(k);
        obj[k] =
          val && typeof val === 'object' && val.constructor.name === 'Integer'
            ? val.toNumber()
            : val;
      });
      return obj;
    });
  } finally {
    await session.close();
  }
}

/** Build a Cypher WHERE clause for optional date range filtering on p.date */
function dateFilter(dateFrom, dateTo, prefix = 'AND') {
  const clauses = [];
  if (dateFrom) clauses.push(`p.date >= $dateFrom`);
  if (dateTo)   clauses.push(`p.date <= $dateTo`);
  return clauses.length ? `${prefix} ${clauses.join(' AND ')}` : '';
}

// ─── Tools ───────────────────────────────────────────────────────────────────

const tools = [

  // ── 1. Full-text paragraph search (RETRIEVAL) ────────────────────────────
  {
    name: 'search_paragraphs',
    retrieval: true,
    description:
      'Search paragraphs by keyword in title or content. Returns paragraphs with session metadata, ' +
      'issue classification, and stakeholders. ' +
      'Accepts optional date_from / date_to (YYYY-MM-DD) to restrict to a time period. ' +
      'ALWAYS use date filters when the question specifies a month, year, or period.',
    input_schema: {
      type: 'object',
      properties: {
        keyword:   { type: 'string',  description: 'Keyword or phrase (Italian preferred)' },
        date_from: { type: 'string',  description: 'Start date inclusive (YYYY-MM-DD)' },
        date_to:   { type: 'string',  description: 'End date inclusive (YYYY-MM-DD)' },
        limit:     { type: 'integer', description: 'Max results (default 8, max 20)' },
      },
      required: ['keyword'],
    },
    handler: async ({ keyword, date_from, date_to, limit = 8 }, driver) => {
      return cypher(driver,
        `CALL db.index.fulltext.queryNodes('paragraph_fulltext', $kw)
         YIELD node AS p, score
         MATCH (s:Session)-[:HAS_PARAGRAPH]->(p)
         WHERE 1=1 ${dateFilter(date_from, date_to)}
         OPTIONAL MATCH (p)-[:ABOUT]->(i:Issue)
         OPTIONAL MATCH (p)-[r:MENTIONS]->(st:Stakeholder)
         WITH s, p, i, score, collect(DISTINCT {name: st.name, role: r.role, mentionType: r.mentionType}) AS stakeholders
         RETURN
           p.paragraphId                AS paragraphId,
           p.title                      AS title,
           p.date                       AS date,
           s.sessionId                  AS sessionId,
           s.mainTitle                  AS sessionTitle,
           s.url                        AS url,
           i.issue                      AS issue,
           i.subIssue                   AS subIssue,
           i.code                       AS issueCode,
           substring(p.content, 0, 400) AS contentPreview,
           stakeholders,
           score
         ORDER BY score DESC
         LIMIT toInteger($limit)`,
        { kw: keyword, dateFrom: date_from || '', dateTo: date_to || '', limit: Math.min(limit, 20) }
      );
    },
  },

  // ── 2. Search by stakeholder (RETRIEVAL) ─────────────────────────────────
  {
    name: 'search_by_stakeholder',
    retrieval: true,
    description:
      'Find all paragraphs that mention a specific person, ministry, or institution. ' +
      'Shows their role and mention type in each act. ' +
      'Accepts optional date_from / date_to (YYYY-MM-DD). ' +
      'Use when asked about a minister (e.g. "Giorgetti", "Meloni", "Piantedosi"), ' +
      'ministry, or institution (e.g. "CONSOB", "Banca d\'Italia").',
    input_schema: {
      type: 'object',
      properties: {
        name:         { type: 'string',  description: 'Full or partial name' },
        mention_type: { type: 'string',  description: 'proposer | responsible_ministry | co_signer | cited_institution | named_person' },
        date_from:    { type: 'string',  description: 'Start date inclusive (YYYY-MM-DD)' },
        date_to:      { type: 'string',  description: 'End date inclusive (YYYY-MM-DD)' },
        limit:        { type: 'integer', description: 'Max results (default 12)' },
      },
      required: ['name'],
    },
    handler: async ({ name, mention_type, date_from, date_to, limit = 12 }, driver) => {
      const mentionFilter = mention_type ? 'AND toLower(r.mentionType) = toLower($mentionType)' : '';
      return cypher(driver,
        `CALL db.index.fulltext.queryNodes('stakeholder_fulltext', $name)
         YIELD node AS st
         MATCH (p:Paragraph)-[r:MENTIONS]->(st)
         WHERE 1=1 ${mentionFilter} ${dateFilter(date_from, date_to)}
         MATCH (s:Session)-[:HAS_PARAGRAPH]->(p)
         OPTIONAL MATCH (p)-[:ABOUT]->(i:Issue)
         RETURN
           st.name       AS stakeholder,
           st.type       AS stakeholderType,
           r.role        AS role,
           r.mentionType AS mentionType,
           p.paragraphId AS paragraphId,
           p.title       AS paragraphTitle,
           p.date        AS date,
           s.sessionId   AS sessionId,
           s.mainTitle   AS sessionTitle,
           s.url         AS url,
           i.issue       AS issue,
           i.subIssue    AS subIssue,
           i.code        AS issueCode
         ORDER BY p.date DESC
         LIMIT toInteger($limit)`,
        { name, mentionType: mention_type || '', dateFrom: date_from || '', dateTo: date_to || '', limit: Math.min(limit, 30) }
      );
    },
  },

  // ── 3. Stakeholder full profile (RETRIEVAL) ───────────────────────────────
  {
    name: 'get_stakeholder_profile',
    retrieval: true,
    description:
      'Get a full profile: all sessions, roles, policy issues, and co-cited stakeholders for a person or institution. ' +
      'Use when the user wants a complete picture of a minister or institution\'s activity.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Full or partial name of the stakeholder' },
      },
      required: ['name'],
    },
    handler: async ({ name }, driver) => {
      const [activity, coStakeholders, issues] = await Promise.all([
        cypher(driver,
          `CALL db.index.fulltext.queryNodes('stakeholder_fulltext', $name)
           YIELD node AS st
           MATCH (p:Paragraph)-[r:MENTIONS]->(st)
           MATCH (s:Session)-[:HAS_PARAGRAPH]->(p)
           OPTIONAL MATCH (p)-[:ABOUT]->(i:Issue)
           RETURN
             st.name AS stakeholder, st.type AS type,
             r.mentionType AS mentionType, r.role AS role,
             p.paragraphId AS paragraphId, p.title AS paragraphTitle, p.date AS date,
             s.sessionId AS sessionId, s.mainTitle AS sessionTitle, s.url AS url,
             i.issue AS issue, i.subIssue AS subIssue, i.code AS issueCode
           ORDER BY p.date DESC`,
          { name }
        ),
        cypher(driver,
          `CALL db.index.fulltext.queryNodes('stakeholder_fulltext', $name)
           YIELD node AS st
           MATCH (p:Paragraph)-[:MENTIONS]->(st)
           MATCH (p)-[:MENTIONS]->(other:Stakeholder)
           WHERE other.name <> st.name
           RETURN other.name AS coStakeholder, other.type AS type, count(*) AS coOccurrences
           ORDER BY coOccurrences DESC LIMIT 10`,
          { name }
        ),
        cypher(driver,
          `CALL db.index.fulltext.queryNodes('stakeholder_fulltext', $name)
           YIELD node AS st
           MATCH (p:Paragraph)-[:MENTIONS]->(st)
           MATCH (p)-[:ABOUT]->(i:Issue)
           RETURN i.issue AS issue, i.subIssue AS subIssue, i.code AS code, count(*) AS occurrences
           ORDER BY occurrences DESC`,
          { name }
        ),
      ]);
      return { activity, coStakeholders, issues };
    },
  },

  // ── 4. Search by policy issue (RETRIEVAL) ────────────────────────────────
  {
    name: 'search_by_issue',
    retrieval: true,
    description:
      'Find paragraphs classified under a policy issue or sub-issue. ' +
      'Macro-areas: Economia & finanza pubblica | Energia & ambiente | Protezione civile & emergenze | ' +
      'Lavoro & politiche sociali | Infrastrutture & territorio | Sicurezza & giustizia | ' +
      'Immigrazione | Affari europei & internazionali | Salute & istruzione | Pubblica amministrazione. ' +
      'Also accepts issue codes (e.g. "2.1", "6.2"). ' +
      'Accepts optional date_from / date_to (YYYY-MM-DD). ' +
      'ALWAYS use date filters when the question specifies a time period.',
    input_schema: {
      type: 'object',
      properties: {
        issue:     { type: 'string',  description: 'Macro-area, sub-issue name, or code (e.g. "Energia", "2.1")' },
        date_from: { type: 'string',  description: 'Start date inclusive (YYYY-MM-DD)' },
        date_to:   { type: 'string',  description: 'End date inclusive (YYYY-MM-DD)' },
        limit:     { type: 'integer', description: 'Max results (default 10)' },
      },
      required: ['issue'],
    },
    handler: async ({ issue, date_from, date_to, limit = 10 }, driver) => {
      return cypher(driver,
        `CALL db.index.fulltext.queryNodes('issue_fulltext', $issue)
         YIELD node AS i
         MATCH (p:Paragraph)-[:ABOUT]->(i)
         MATCH (s:Session)-[:HAS_PARAGRAPH]->(p)
         WHERE 1=1 ${dateFilter(date_from, date_to)}
         OPTIONAL MATCH (p)-[r:MENTIONS]->(st:Stakeholder)
         WITH s, p, i, collect(DISTINCT {name: st.name, role: r.role, mentionType: r.mentionType}) AS stakeholders
         RETURN
           i.issue AS issue, i.subIssue AS subIssue, i.code AS code,
           p.paragraphId                AS paragraphId,
           p.title                      AS title,
           p.date                       AS date,
           s.sessionId                  AS sessionId,
           s.mainTitle                  AS sessionTitle,
           s.url                        AS url,
           substring(p.content, 0, 400) AS contentPreview,
           stakeholders
         ORDER BY p.date DESC
         LIMIT toInteger($limit)`,
        { issue, dateFrom: date_from || '', dateTo: date_to || '', limit: Math.min(limit, 20) }
      );
    },
  },

  // ── 5. Get session paragraphs (RETRIEVAL) ────────────────────────────────
  {
    name: 'get_session_paragraphs',
    retrieval: true,
    description:
      'Get the full agenda of a specific Council of Ministers session. ' +
      'Accepts the official session number (e.g. "163") or the internal session ID (e.g. "2307"). ' +
      'Use AFTER list_sessions to get the full content of a specific meeting.',
    input_schema: {
      type: 'object',
      properties: {
        session_number: { type: 'string', description: 'Official session number from the press release title (e.g. "163")' },
        session_id:     { type: 'string', description: 'Internal session ID (e.g. "2307")' },
      },
    },
    handler: async ({ session_number, session_id }, driver) => {
      const matchClause = session_id
        ? 'MATCH (s:Session {sessionId: $sessionId})'
        : 'MATCH (s:Session) WHERE s.mainTitle CONTAINS $sessionNumber';
      const params = session_id
        ? { sessionId: session_id }
        : { sessionNumber: `n. ${session_number}` };
      return cypher(driver,
        `${matchClause}
         MATCH (s)-[:HAS_PARAGRAPH]->(p:Paragraph)
         OPTIONAL MATCH (p)-[:ABOUT]->(i:Issue)
         OPTIONAL MATCH (p)-[r:MENTIONS]->(st:Stakeholder)
         WITH s, p, i, collect(DISTINCT {name: st.name, role: r.role, mentionType: r.mentionType}) AS stakeholders
         RETURN
           s.sessionId AS sessionId, s.mainTitle AS sessionTitle, s.date AS date, s.url AS url,
           p.paragraphId                AS paragraphId,
           p.title                      AS title,
           i.issue AS issue, i.subIssue AS subIssue, i.code AS issueCode,
           substring(p.content, 0, 400) AS contentPreview,
           stakeholders
         ORDER BY p.paragraphId`,
        params
      );
    },
  },

  // ── 6. Search by industry (RETRIEVAL) ────────────────────────────────────
  {
    name: 'search_by_industry',
    retrieval: true,
    description:
      'Find paragraphs that impact a specific economic sector. ' +
      'Industries: Finance | Energy & Utilities | Infrastructure & Transportation | ' +
      'Manufacturing & Industrial Production | Healthcare | ' +
      'Technology, Media & Telecommunications | ' +
      'Professional Services & Education / Culture | Consumer Goods & Retail. ' +
      'Accepts optional date_from / date_to (YYYY-MM-DD).',
    input_schema: {
      type: 'object',
      properties: {
        industry:  { type: 'string',  description: 'Industry name or keyword (e.g. "Energy", "Finance", "Healthcare")' },
        date_from: { type: 'string',  description: 'Start date inclusive (YYYY-MM-DD)' },
        date_to:   { type: 'string',  description: 'End date inclusive (YYYY-MM-DD)' },
        limit:     { type: 'integer', description: 'Max results (default 10)' },
      },
      required: ['industry'],
    },
    handler: async ({ industry, date_from, date_to, limit = 10 }, driver) => {
      return cypher(driver,
        `MATCH (ind:Industry)
         WHERE toLower(ind.name) CONTAINS toLower($industry)
         MATCH (p:Paragraph)-[:INVOLVES_INDUSTRY]->(ind)
         MATCH (s:Session)-[:HAS_PARAGRAPH]->(p)
         WHERE 1=1 ${dateFilter(date_from, date_to)}
         OPTIONAL MATCH (p)-[:ABOUT]->(i:Issue)
         OPTIONAL MATCH (p)-[r:MENTIONS]->(st:Stakeholder)
         WITH ind, s, p, i, collect(DISTINCT {name: st.name, role: r.role, mentionType: r.mentionType}) AS stakeholders
         RETURN
           ind.name AS industry,
           p.paragraphId AS paragraphId, p.title AS title, p.date AS date,
           s.sessionId AS sessionId, s.mainTitle AS sessionTitle, s.url AS url,
           i.issue AS issue, i.subIssue AS subIssue,
           substring(p.content, 0, 400) AS contentPreview,
           stakeholders
         ORDER BY p.date DESC
         LIMIT toInteger($limit)`,
        { industry, dateFrom: date_from || '', dateTo: date_to || '', limit: Math.min(limit, 20) }
      );
    },
  },

  // ── 7. List sessions — DISCOVERY (not shown in right panel) ──────────────
  {
    name: 'list_sessions',
    retrieval: false,
    description:
      'List Council of Ministers sessions with dates and official numbers. ' +
      'Accepts optional date_from / date_to (YYYY-MM-DD) to restrict the listing. ' +
      'Use to discover session IDs before calling get_session_paragraphs, ' +
      'or to answer questions like "how many sessions in January?".',
    input_schema: {
      type: 'object',
      properties: {
        date_from: { type: 'string',  description: 'Start date inclusive (YYYY-MM-DD)' },
        date_to:   { type: 'string',  description: 'End date inclusive (YYYY-MM-DD)' },
        limit:     { type: 'integer', description: 'Max results (default 10)' },
      },
    },
    handler: async ({ date_from, date_to, limit = 10 }, driver) => {
      const where = (date_from || date_to)
        ? `WHERE ${[date_from && 's.date >= $dateFrom', date_to && 's.date <= $dateTo'].filter(Boolean).join(' AND ')}`
        : '';
      return cypher(driver,
        `MATCH (s:Session)
         ${where}
         OPTIONAL MATCH (s)-[:HAS_PARAGRAPH]->(p:Paragraph)
         WITH s, count(p) AS paragraphs
         RETURN s.sessionId AS sessionId, s.mainTitle AS title, s.date AS date, s.url AS url, paragraphs
         ORDER BY s.date DESC
         LIMIT toInteger($limit)`,
        { dateFrom: date_from || '', dateTo: date_to || '', limit: Math.min(limit, 41) }
      );
    },
  },

  // ── 8. List stakeholders ranking — DISCOVERY ──────────────────────────────
  {
    name: 'list_stakeholders',
    retrieval: false,
    description:
      'List stakeholders ranked by mentions. Useful for ranking questions: ' +
      '"chi ha proposto più decreti?", "quali ministeri sono più attivi?". ' +
      'Filter by type (person|ministry|institution) or mention_type (proposer|co_signer|...).',
    input_schema: {
      type: 'object',
      properties: {
        type:         { type: 'string',  description: 'person | ministry | institution | company | eu_body | association' },
        mention_type: { type: 'string',  description: 'proposer | responsible_ministry | co_signer | cited_institution | named_person' },
        limit:        { type: 'integer', description: 'Max results (default 20)' },
      },
    },
    handler: async ({ type, mention_type, limit = 20 }, driver) => {
      const conditions = [];
      if (type) conditions.push('toLower(st.type) = toLower($type)');
      if (mention_type) conditions.push('toLower(r.mentionType) = toLower($mentionType)');
      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
      return cypher(driver,
        `MATCH (st:Stakeholder)<-[r:MENTIONS]-(p:Paragraph)
         ${where}
         RETURN st.name AS name, st.type AS type, count(r) AS mentions
         ORDER BY mentions DESC
         LIMIT toInteger($limit)`,
        { type: type || '', mentionType: mention_type || '', limit: Math.min(limit, 100) }
      );
    },
  },

  // ── 9. List policy issues — DISCOVERY ────────────────────────────────────
  {
    name: 'list_issues',
    retrieval: false,
    description:
      'List all policy issues ranked by paragraph count. ' +
      'Use to discover available topics before a targeted search, ' +
      'or to answer "quali sono i temi più trattati?".',
    input_schema: {
      type: 'object',
      properties: {
        macro_area: { type: 'string', description: 'Optional filter by macro-area (e.g. "Sicurezza", "Economia")' },
      },
    },
    handler: async ({ macro_area } = {}, driver) => {
      const where = macro_area ? 'WHERE toLower(i.issue) CONTAINS toLower($macroArea)' : '';
      return cypher(driver,
        `MATCH (i:Issue)<-[:ABOUT]-(p:Paragraph)
         ${where}
         RETURN i.code AS code, i.issue AS issue, i.subIssue AS subIssue, count(p) AS paragraphs
         ORDER BY paragraphs DESC`,
        { macroArea: macro_area || '' }
      );
    },
  },
];

module.exports = { tools };
