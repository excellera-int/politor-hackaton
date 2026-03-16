/**
 * Neo4j MCP Tools — Politor
 *
 * Dataset: 41 CdM sessions, 330 paragraphs, 294 stakeholders, 45 issues, 8 industries.
 * All sessions are Italian Council of Ministers (Consiglio dei Ministri) press releases.
 *
 * Graph schema:
 *   (Session)-[:HAS_PARAGRAPH]->(Paragraph)-[:ABOUT]->(Issue)
 *   (Paragraph)-[:INVOLVES_INDUSTRY]->(Industry)
 *   (Paragraph)-[r:MENTIONS]->(Stakeholder)
 *     r.mentionType: proposer | responsible_ministry | cited_institution | co_signer | named_person
 *     r.role: institutional role text
 *     r.mentionContent: verbatim excerpt
 *
 * Stakeholder types: person (83) | institution (141) | ministry (38) | company (14) | eu_body (9) | association (9)
 * Industries (English labels): Finance | Energy & Utilities | Infrastructure & Transportation |
 *   Manufacturing & Industrial Production | Healthcare | Technology, Media & Telecommunications |
 *   Professional Services & Education / Culture | Consumer Goods & Retail
 */

async function cypher(driver, query, params = {}) {
  // Neo4j requires integer literals for LIMIT/SKIP — coerce all JS numbers to integers
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

// ─── Tool definitions ────────────────────────────────────────────────────────

const tools = [
  // ── 1. Full-text search on paragraph title + content ─────────────────────
  {
    name: 'search_paragraphs',
    description:
      'Search Council of Ministers paragraphs by keyword in title or content. ' +
      'Returns matching paragraphs with session, issue classification, and involved stakeholders. ' +
      'Use this as the primary tool for topic or law searches (e.g. "decreto fiscale", "immigrazione", "PNRR").',
    input_schema: {
      type: 'object',
      properties: {
        keyword: {
          type: 'string',
          description: 'Keyword or phrase to search (Italian preferred, case-insensitive)',
        },
        limit: { type: 'integer', description: 'Max results (default 8, max 20)' },
      },
      required: ['keyword'],
    },
    handler: async ({ keyword, limit = 8 }, driver) => {
      return cypher(
        driver,
        `CALL db.index.fulltext.queryNodes('paragraph_fulltext', $kw)
         YIELD node AS p, score
         MATCH (s:Session)-[:HAS_PARAGRAPH]->(p)
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
        { kw: keyword, limit: Math.min(limit, 20) }
      );
    },
  },

  // ── 2. Find all mentions of a stakeholder ────────────────────────────────
  {
    name: 'search_by_stakeholder',
    description:
      'Find all paragraphs and sessions that mention a specific person, ministry, or institution. ' +
      'Shows their role, mention type (proposer/co_signer/cited_institution/named_person/responsible_ministry), ' +
      'and the policy issue discussed. ' +
      'Use this when asked about a specific minister (e.g. "Giorgetti", "Piantedosi", "Meloni"), ' +
      'ministry, or institution (e.g. "CONSOB", "Banca d\'Italia").',
    input_schema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Full or partial name of the person, ministry, or institution',
        },
        mention_type: {
          type: 'string',
          description:
            'Optional filter by role in the act: proposer | responsible_ministry | co_signer | cited_institution | named_person',
        },
        limit: { type: 'integer', description: 'Max results (default 12)' },
      },
      required: ['name'],
    },
    handler: async ({ name, mention_type, limit = 12 }, driver) => {
      const mentionFilter = mention_type
        ? 'AND toLower(r.mentionType) = toLower($mentionType)'
        : '';
      return cypher(
        driver,
        `CALL db.index.fulltext.queryNodes('stakeholder_fulltext', $name)
         YIELD node AS st
         MATCH (p:Paragraph)-[r:MENTIONS]->(st)
         WHERE 1=1 ${mentionFilter}
         MATCH (s:Session)-[:HAS_PARAGRAPH]->(p)
         OPTIONAL MATCH (p)-[:ABOUT]->(i:Issue)
         RETURN
           st.name       AS stakeholder,
           st.type       AS stakeholderType,
           r.role        AS role,
           r.mentionType AS mentionType,
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
        { name, mentionType: mention_type || '', limit: Math.min(limit, 30) }
      );
    },
  },

  // ── 3. Full stakeholder profile ───────────────────────────────────────────
  {
    name: 'get_stakeholder_profile',
    description:
      'Get a comprehensive profile of a stakeholder: all sessions they appear in, ' +
      'their roles, the policy issues they are linked to, and who they are most often cited alongside. ' +
      'Use when the user wants a complete picture of a minister or institution\'s activity ' +
      '(e.g. "cosa ha fatto Musumeci?", "quali temi ha trattato il MEF?").',
    input_schema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Full or partial name of the stakeholder',
        },
      },
      required: ['name'],
    },
    handler: async ({ name }, driver) => {
      const [activity, coStakeholders, issues] = await Promise.all([
        cypher(
          driver,
          `CALL db.index.fulltext.queryNodes('stakeholder_fulltext', $name)
           YIELD node AS st
           MATCH (p:Paragraph)-[r:MENTIONS]->(st)
           MATCH (s:Session)-[:HAS_PARAGRAPH]->(p)
           OPTIONAL MATCH (p)-[:ABOUT]->(i:Issue)
           RETURN
             st.name       AS stakeholder,
             st.type       AS type,
             r.mentionType AS mentionType,
             r.role        AS role,
             p.title       AS paragraphTitle,
             p.date        AS date,
             s.sessionId   AS sessionId,
             s.mainTitle   AS sessionTitle,
             s.url         AS url,
             i.issue       AS issue,
             i.subIssue    AS subIssue,
             i.code        AS issueCode
           ORDER BY p.date DESC`,
          { name }
        ),
        cypher(
          driver,
          `CALL db.index.fulltext.queryNodes('stakeholder_fulltext', $name)
           YIELD node AS st
           MATCH (p:Paragraph)-[:MENTIONS]->(st)
           MATCH (p)-[:MENTIONS]->(other:Stakeholder)
           WHERE other.name <> st.name
           RETURN other.name AS coStakeholder, other.type AS type, count(*) AS coOccurrences
           ORDER BY coOccurrences DESC LIMIT 10`,
          { name }
        ),
        cypher(
          driver,
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

  // ── 4. Search by policy issue / sub-issue ─────────────────────────────────
  {
    name: 'search_by_issue',
    description:
      'Find paragraphs classified under a specific policy issue or sub-issue from the taxonomy. ' +
      'Macro-areas: Economia & finanza pubblica | Energia & ambiente | Protezione civile & emergenze | ' +
      'Lavoro & politiche sociali | Infrastrutture & territorio | Sicurezza & giustizia | ' +
      'Immigrazione | Affari europei & internazionali | Salute & istruzione | Pubblica amministrazione. ' +
      'Also accepts issue codes like "6.2" or "8.2". ' +
      'Use when the user asks about a policy area or legislative topic.',
    input_schema: {
      type: 'object',
      properties: {
        issue: {
          type: 'string',
          description: 'Macro-area name, sub-issue name, or code (e.g. "giustizia", "6.2", "PNRR")',
        },
        limit: { type: 'integer', description: 'Max results (default 10)' },
      },
      required: ['issue'],
    },
    handler: async ({ issue, limit = 10 }, driver) => {
      return cypher(
        driver,
        `CALL db.index.fulltext.queryNodes('issue_fulltext', $issue)
         YIELD node AS i
         MATCH (p:Paragraph)-[:ABOUT]->(i)
         MATCH (s:Session)-[:HAS_PARAGRAPH]->(p)
         OPTIONAL MATCH (p)-[r:MENTIONS]->(st:Stakeholder)
         WITH s, p, i, collect(DISTINCT {name: st.name, role: r.role, mentionType: r.mentionType}) AS stakeholders
         RETURN
           i.issue                      AS issue,
           i.subIssue                   AS subIssue,
           i.code                       AS code,
           p.paragraphId                AS paragraphId,
           p.title                      AS title,
           p.date                       AS date,
           s.sessionId                  AS sessionId,
           s.mainTitle                  AS sessionTitle,
           s.url                        AS url,
           substring(p.content, 0, 500) AS contentPreview,
           stakeholders
         ORDER BY p.date DESC
         LIMIT toInteger($limit)`,
        { issue, limit: Math.min(limit, 20) }
      );
    },
  },

  // ── 5. Get all paragraphs of a session ────────────────────────────────────
  {
    name: 'get_session_paragraphs',
    description:
      'Get the full agenda (all paragraphs) of a specific Council of Ministers session. ' +
      'Accepts the session number as it appears in the press release title (e.g. "163") ' +
      'OR the internal session ID (e.g. "2307"). ' +
      'Use when the user asks what was decided in a specific meeting.',
    input_schema: {
      type: 'object',
      properties: {
        session_number: {
          type: 'string',
          description: 'Official session number from the press release title (e.g. "163")',
        },
        session_id: {
          type: 'string',
          description: 'Internal session ID (e.g. "2307") — alternative to session_number',
        },
      },
    },
    handler: async ({ session_number, session_id }, driver) => {
      // Support lookup by official number (embedded in mainTitle) or by internal ID
      const matchClause = session_id
        ? 'MATCH (s:Session {sessionId: $sessionId})'
        : 'MATCH (s:Session) WHERE s.mainTitle CONTAINS $sessionNumber';
      const params = session_id
        ? { sessionId: session_id }
        : { sessionNumber: `n. ${session_number}` };

      return cypher(
        driver,
        `${matchClause}
         MATCH (s)-[:HAS_PARAGRAPH]->(p:Paragraph)
         OPTIONAL MATCH (p)-[:ABOUT]->(i:Issue)
         OPTIONAL MATCH (p)-[r:MENTIONS]->(st:Stakeholder)
         WITH s, p, i, collect(DISTINCT {name: st.name, role: r.role, mentionType: r.mentionType}) AS stakeholders
         RETURN
           s.sessionId                  AS sessionId,
           s.mainTitle                  AS sessionTitle,
           s.date                       AS sessionDate,
           s.url                        AS url,
           p.paragraphId                AS paragraphId,
           p.title                      AS title,
           i.issue                      AS issue,
           i.subIssue                   AS subIssue,
           i.code                       AS issueCode,
           stakeholders,
           substring(p.content, 0, 400) AS contentPreview
         ORDER BY p.paragraphId`,
        params
      );
    },
  },

  // ── 6. Most active stakeholders ranking ───────────────────────────────────
  {
    name: 'list_stakeholders',
    description:
      'List stakeholders ranked by number of mentions, optionally filtered by type or mention role. ' +
      'Types: person | ministry | institution | company | eu_body | association. ' +
      'Mention roles: proposer | responsible_ministry | co_signer | cited_institution | named_person. ' +
      'Use for ranking questions like "chi ha proposto più decreti?", "quali ministeri sono più attivi?", ' +
      '"chi compare più spesso?".',
    input_schema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          description: 'Filter by stakeholder type: person | ministry | institution | company | eu_body | association',
        },
        mention_type: {
          type: 'string',
          description: 'Filter by mention role: proposer | responsible_ministry | co_signer | cited_institution | named_person',
        },
        limit: { type: 'integer', description: 'Max results (default 20)' },
      },
    },
    handler: async ({ type, mention_type, limit = 20 }, driver) => {
      const conditions = [];
      if (type) conditions.push('toLower(st.type) = toLower($type)');
      if (mention_type) conditions.push('toLower(r.mentionType) = toLower($mentionType)');
      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

      return cypher(
        driver,
        `MATCH (st:Stakeholder)<-[r:MENTIONS]-(p:Paragraph)
         ${where}
         RETURN
           st.name     AS name,
           st.type     AS type,
           st.category AS category,
           count(r)    AS mentions,
           count(DISTINCT (()-[:HAS_PARAGRAPH]->(p))) AS sessions
         ORDER BY mentions DESC
         LIMIT toInteger($limit)`,
        { type: type || '', mentionType: mention_type || '', limit: Math.min(limit, 100) }
      );
    },
  },

  // ── 7. List policy issues with counts ─────────────────────────────────────
  {
    name: 'list_issues',
    description:
      'List all policy issues and sub-issues in the database ranked by how many paragraphs they cover. ' +
      'Use to understand which topics are most legislated, or to discover issue codes before ' +
      'running a targeted search. Also useful for questions like "quali sono i temi più trattati?".',
    input_schema: {
      type: 'object',
      properties: {
        macro_area: {
          type: 'string',
          description: 'Optional filter by macro-area name (e.g. "Sicurezza", "Economia")',
        },
      },
    },
    handler: async ({ macro_area } = {}, driver) => {
      const where = macro_area ? 'WHERE toLower(i.issue) CONTAINS toLower($macroArea)' : '';
      return cypher(
        driver,
        `MATCH (i:Issue)<-[:ABOUT]-(p:Paragraph)
         ${where}
         RETURN
           i.code     AS code,
           i.issue    AS issue,
           i.subIssue AS subIssue,
           count(p)   AS paragraphs
         ORDER BY paragraphs DESC`,
        { macroArea: macro_area || '' }
      );
    },
  },

  // ── 8. List sessions chronologically ─────────────────────────────────────
  {
    name: 'list_sessions',
    description:
      'List Council of Ministers sessions with their dates and official numbers. ' +
      'Use when the user asks about a date range, wants to see the most recent sessions, ' +
      'or needs to know which session number corresponds to a given date.',
    input_schema: {
      type: 'object',
      properties: {
        limit: { type: 'integer', description: 'Max results (default 10)' },
      },
    },
    handler: async ({ limit = 10 }, driver) => {
      return cypher(
        driver,
        `MATCH (s:Session)
         OPTIONAL MATCH (s)-[:HAS_PARAGRAPH]->(p:Paragraph)
         WITH s, count(p) AS paragraphs
         RETURN
           s.sessionId AS sessionId,
           s.mainTitle AS title,
           s.date      AS date,
           s.url       AS url,
           paragraphs
         ORDER BY s.date DESC
         LIMIT toInteger($limit)`,
        { limit: Math.min(limit, 41) }
      );
    },
  },

  // ── 9. Industry impact analysis ───────────────────────────────────────────
  {
    name: 'search_by_industry',
    description:
      'Find paragraphs that impact a specific economic sector. ' +
      'Industries: Finance | Energy & Utilities | Infrastructure & Transportation | ' +
      'Manufacturing & Industrial Production | Healthcare | ' +
      'Technology, Media & Telecommunications | ' +
      'Professional Services & Education / Culture | Consumer Goods & Retail. ' +
      'Use when the user asks about a specific sector (e.g. "banche", "energia", "sanità", "tech").',
    input_schema: {
      type: 'object',
      properties: {
        industry: {
          type: 'string',
          description: 'Industry name or keyword (e.g. "Finance", "Energy", "Healthcare")',
        },
        limit: { type: 'integer', description: 'Max results (default 10)' },
      },
      required: ['industry'],
    },
    handler: async ({ industry, limit = 10 }, driver) => {
      return cypher(
        driver,
        `MATCH (ind:Industry)
         WHERE toLower(ind.name) CONTAINS toLower($industry)
         MATCH (p:Paragraph)-[:INVOLVES_INDUSTRY]->(ind)
         MATCH (s:Session)-[:HAS_PARAGRAPH]->(p)
         OPTIONAL MATCH (p)-[:ABOUT]->(i:Issue)
         OPTIONAL MATCH (p)-[r:MENTIONS]->(st:Stakeholder)
         WITH ind, s, p, i, collect(DISTINCT {name: st.name, role: r.role, mentionType: r.mentionType}) AS stakeholders
         RETURN
           ind.name                     AS industry,
           p.title                      AS title,
           p.date                       AS date,
           s.sessionId                  AS sessionId,
           s.mainTitle                  AS sessionTitle,
           s.url                        AS url,
           i.issue                      AS issue,
           i.subIssue                   AS subIssue,
           substring(p.content, 0, 400) AS contentPreview,
           stakeholders
         ORDER BY p.date DESC
         LIMIT toInteger($limit)`,
        { industry, limit: Math.min(limit, 20) }
      );
    },
  },
];

module.exports = { tools };
