/**
 * MCP Tool Registry — Politor
 *
 * Defines the tool interfaces available to the AI agent.
 * These are stubs — implementations will be wired in Phase 2
 * once the data ingestion pipeline and Neo4j graph are populated.
 */

const tools = [
  {
    name: 'search_sessions',
    description:
      'Search Council of Ministers sessions by keyword, date range, branch, type, or topic. Returns a list of matching sessions with metadata.',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Natural language search query or keywords',
        },
        date_from: {
          type: 'string',
          description: 'Start date filter in ISO 8601 format (YYYY-MM-DD)',
        },
        date_to: {
          type: 'string',
          description: 'End date filter in ISO 8601 format (YYYY-MM-DD)',
        },
        branch: {
          type: 'string',
          description: 'Branch of government to filter by',
        },
        limit: {
          type: 'integer',
          description: 'Maximum number of results to return (default 10)',
        },
      },
      required: ['query'],
    },
    // TODO: Wire to resolvers.searchRelevantSessions() + Neo4j Cypher traversal
    handler: null,
  },

  {
    name: 'get_session_detail',
    description:
      'Get the full transcript, agenda items, and metadata of a specific Council of Ministers session by ID or session number.',
    input_schema: {
      type: 'object',
      properties: {
        session_id: {
          type: 'string',
          description: 'Database ID of the session',
        },
        session_number: {
          type: 'string',
          description: 'Official session number (e.g. "450")',
        },
      },
    },
    // TODO: Wire to Query.session resolver + Neo4j node detail query
    handler: null,
  },
];

module.exports = { tools };
