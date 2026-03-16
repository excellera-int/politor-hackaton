/**
 * Creates full-text and btree indexes on Neo4j for fast chat queries.
 * Run once: node scripts/create-neo4j-indexes.js
 */
const path = require('path');
const fs = require('fs');
const BACKEND = path.resolve(__dirname, '..', 'backend');

fs.readFileSync(path.resolve(__dirname, '..', '.env'), 'utf8').split('\n').forEach((line) => {
  const t = line.trim();
  if (!t || t.startsWith('#')) return;
  const eq = t.indexOf('=');
  if (eq === -1) return;
  const k = t.slice(0, eq).trim(), v = t.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
  if (k && !(k in process.env)) process.env[k] = v;
});

const neo4j = require(path.join(BACKEND, 'node_modules', 'neo4j-driver'));
const driver = neo4j.driver(
  process.env.NEO4J_URI || 'bolt://localhost:7687',
  neo4j.auth.basic(process.env.NEO4J_USER, process.env.NEO4J_PASSWORD)
);

async function run(label, query) {
  const session = driver.session();
  try {
    await session.run(query);
    console.log(`[OK] ${label}`);
  } catch (err) {
    console.error(`[ERR] ${label}: ${err.message}`);
  } finally {
    await session.close();
  }
}

async function main() {
  // Full-text indexes (for CONTAINS searches on large text fields)
  await run(
    'Full-text index: Paragraph title + content',
    `CREATE FULLTEXT INDEX paragraph_fulltext IF NOT EXISTS
     FOR (n:Paragraph) ON EACH [n.title, n.content]`
  );
  await run(
    'Full-text index: Stakeholder name',
    `CREATE FULLTEXT INDEX stakeholder_fulltext IF NOT EXISTS
     FOR (n:Stakeholder) ON EACH [n.name]`
  );
  await run(
    'Full-text index: Issue name + subIssue',
    `CREATE FULLTEXT INDEX issue_fulltext IF NOT EXISTS
     FOR (n:Issue) ON EACH [n.issue, n.subIssue]`
  );

  // Btree indexes (for equality lookups and sorting)
  await run(
    'Btree index: Paragraph.date',
    `CREATE INDEX paragraph_date IF NOT EXISTS FOR (p:Paragraph) ON (p.date)`
  );
  await run(
    'Btree index: Stakeholder.type',
    `CREATE INDEX stakeholder_type IF NOT EXISTS FOR (s:Stakeholder) ON (s.type)`
  );
  await run(
    'Btree index: Session.date',
    `CREATE INDEX session_date IF NOT EXISTS FOR (s:Session) ON (s.date)`
  );

  // Verify
  const session = driver.session();
  try {
    const r = await session.run('SHOW INDEXES YIELD name, type, state WHERE state = "ONLINE" RETURN name, type ORDER BY name');
    console.log('\n=== Active indexes ===');
    r.records.forEach((rec) => console.log(` ${rec.get('type').padEnd(12)} ${rec.get('name')}`));
  } finally {
    await session.close();
  }
}

main().catch(console.error).finally(() => driver.close());
