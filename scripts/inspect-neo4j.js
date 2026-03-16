const path = require('path');
const fs = require('fs');
const BACKEND = path.resolve(__dirname, '..', 'backend');

fs.readFileSync(path.resolve(__dirname,'..', '.env'), 'utf8').split('\n').forEach(line => {
  const t = line.trim(); if (!t || t.startsWith('#')) return;
  const eq = t.indexOf('='); if (eq === -1) return;
  const k = t.slice(0,eq).trim(), v = t.slice(eq+1).trim().replace(/^["']|["']$/g,'');
  if (k && !(k in process.env)) process.env[k] = v;
});

const neo4j = require(path.join(BACKEND, 'node_modules', 'neo4j-driver'));
const driver = neo4j.driver(
  process.env.NEO4J_URI || 'bolt://localhost:7687',
  neo4j.auth.basic(process.env.NEO4J_USER, process.env.NEO4J_PASSWORD)
);

async function q(query, params = {}) {
  const s = driver.session();
  try {
    const r = await s.run(query, params);
    return r.records.map(rec => {
      const o = {};
      rec.keys.forEach(k => {
        const v = rec.get(k);
        o[k] = v && typeof v === 'object' && v.constructor.name === 'Integer' ? v.toNumber() : v;
      });
      return o;
    });
  } finally { await s.close(); }
}

async function main() {
  console.log('\n=== NODE COUNTS ===');
  const nc = await q('MATCH (n) RETURN labels(n) AS lbl, count(*) AS c ORDER BY c DESC');
  nc.forEach(r => console.log(r.lbl[0], '→', r.c));

  console.log('\n=== RELATIONSHIP TYPES ===');
  const rels = await q('MATCH ()-[r]->() RETURN type(r) AS t, count(*) AS c ORDER BY c DESC');
  rels.forEach(r => console.log(r.t, '→', r.c));

  console.log('\n=== SESSION sample (1) ===');
  const sess = await q('MATCH (s:Session) RETURN s LIMIT 1');
  if (sess[0]) console.log(JSON.stringify(sess[0].s.properties, null, 2));

  console.log('\n=== PARAGRAPH sample (1) ===');
  const para = await q('MATCH (p:Paragraph) RETURN p LIMIT 1');
  if (para[0]) console.log(JSON.stringify(para[0].p.properties, null, 2));

  console.log('\n=== ISSUE sample (3) ===');
  const issues = await q('MATCH (i:Issue) RETURN i LIMIT 3');
  issues.forEach(r => console.log(JSON.stringify(r.i.properties)));

  console.log('\n=== STAKEHOLDER sample (3) ===');
  const shs = await q('MATCH (st:Stakeholder) RETURN st LIMIT 3');
  shs.forEach(r => console.log(JSON.stringify(r.st.properties)));

  console.log('\n=== INDUSTRY sample ===');
  const inds = await q('MATCH (i:Industry) RETURN i');
  inds.forEach(r => console.log(JSON.stringify(r.i.properties)));

  console.log('\n=== MENTIONS rel sample (2) ===');
  const ments = await q('MATCH (p:Paragraph)-[r:MENTIONS]->(st:Stakeholder) RETURN r LIMIT 2');
  ments.forEach(r => console.log(JSON.stringify(r.r.properties)));

  console.log('\n=== STAKEHOLDER types distribution ===');
  const types = await q('MATCH (st:Stakeholder) RETURN st.type AS type, count(*) AS c ORDER BY c DESC');
  types.forEach(r => console.log(r.type, '→', r.c));

  console.log('\n=== MENTION types distribution ===');
  const mt = await q('MATCH ()-[r:MENTIONS]->() RETURN r.mentionType AS t, count(*) AS c ORDER BY c DESC');
  mt.forEach(r => console.log(r.t, '→', r.c));

  console.log('\n=== TOP 10 STAKEHOLDERS by mentions ===');
  const top = await q('MATCH (st:Stakeholder)<-[r:MENTIONS]-() RETURN st.name AS name, st.type AS type, count(r) AS c ORDER BY c DESC LIMIT 10');
  top.forEach(r => console.log(r.c, r.type, r.name));

  console.log('\n=== ISSUES list ===');
  const allIssues = await q('MATCH (i:Issue)<-[:ABOUT]-(p:Paragraph) RETURN i.code AS code, i.issue AS issue, i.subIssue AS sub, count(p) AS c ORDER BY i.code');
  allIssues.forEach(r => console.log(r.code, r.issue, '→', r.sub, '(', r.c, ')'));

  console.log('\n=== INDUSTRIES list ===');
  const allInds = await q('MATCH (i:Industry)<-[:INVOLVES_INDUSTRY]-(p:Paragraph) RETURN i.name AS name, count(p) AS c ORDER BY c DESC');
  allInds.forEach(r => console.log(r.c, r.name));
}

main().catch(e => { console.error(e.message); process.exit(1); }).finally(() => driver.close());
