const { Pool } = require('pg');

const pool = new Pool({
  host:     process.env.POSTGRES_HOST || 'postgres',
  port:     parseInt(process.env.POSTGRES_PORT || '5432', 10),
  database: process.env.POSTGRES_DB,
  user:     process.env.APP_USER,
  password: process.env.APP_USER_PASSWORD,
});

/**
 * Execute a parameterized SQL query.
 * @param {string} text - SQL string with $1, $2 placeholders
 * @param {Array}  params - Parameter values
 */
async function query(text, params) {
  return pool.query(text, params);
}

/**
 * Verify that PostgreSQL is reachable on startup.
 * Retries up to 10 times with 3s delay — PostgreSQL may not be ready immediately.
 * Throws on final failure — caller handles process.exit(1).
 */
async function testConnection(retries = 10, delayMs = 3000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const client = await pool.connect();
      try {
        await client.query('SELECT 1');
        console.log('[DB] PostgreSQL connected');
        return;
      } finally {
        client.release();
      }
    } catch (err) {
      if (attempt === retries) throw err;
      console.log(`[DB] PostgreSQL not ready (attempt ${attempt}/${retries}), retrying in ${delayMs}ms…`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

module.exports = { query, testConnection };
