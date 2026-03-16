const neo4j = require('neo4j-driver');

const driver = neo4j.driver(
  process.env.NEO4J_URI,
  neo4j.auth.basic(process.env.NEO4J_USER, process.env.NEO4J_PASSWORD)
);

/**
 * Verify that Neo4j is reachable on startup.
 * Retries up to 20 times with 5s delay — Neo4j can take 60-90s to initialise on first run.
 * Throws on final failure — caller handles process.exit(1).
 */
async function testConnection(retries = 20, delayMs = 5000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    const session = driver.session();
    try {
      await session.run('RETURN 1 AS health');
      console.log('[GRAPH] Neo4j connected');
      return;
    } catch (err) {
      await session.close();
      if (attempt === retries) throw err;
      console.log(`[GRAPH] Neo4j not ready (attempt ${attempt}/${retries}), retrying in ${delayMs}ms…`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

module.exports = { driver, testConnection };
