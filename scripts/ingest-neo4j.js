#!/usr/bin/env node
/**
 * Ingests data/enriched_all_batches.json into Neo4j.
 * Idempotent: safe to re-run — uses MERGE to avoid duplicates.
 * Requires: Docker running with the neo4j service up, and a .env file.
 * Usage: node scripts/ingest-neo4j.js
 */

const path = require('path');
const fs = require('fs');

const BACKEND = path.resolve(__dirname, '..', 'backend');

// Load .env from project root manually (no external deps needed)
const envPath = path.resolve(__dirname, '..', '.env');
if (!fs.existsSync(envPath)) {
  console.error('ERROR: .env file not found. Copy .env.example to .env and fill in values.');
  process.exit(1);
}
fs.readFileSync(envPath, 'utf8').split('\n').forEach((line) => {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return;
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx === -1) return;
  const key = trimmed.slice(0, eqIdx).trim();
  const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
  if (key && !(key in process.env)) process.env[key] = val;
});

const neo4j = require(path.join(BACKEND, 'node_modules', 'neo4j-driver'));

const NEO4J_URI = process.env.NEO4J_URI || 'bolt://localhost:7687';
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD;

if (!NEO4J_PASSWORD) {
  console.error('ERROR: NEO4J_PASSWORD not set in .env');
  process.exit(1);
}

const DATA_PATH = path.resolve(__dirname, '..', 'data', 'enriched_all_batches.json');
if (!fs.existsSync(DATA_PATH)) {
  console.error(`ERROR: Data file not found at ${DATA_PATH}`);
  process.exit(1);
}

async function main() {
  const driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD));

  try {
    await driver.verifyConnectivity();
    console.log('[NEO4J] Connected to', NEO4J_URI);
  } catch (err) {
    console.error('[NEO4J] Connection failed:', err.message);
    driver.close();
    process.exit(1);
  }

  const paragraphs = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  console.log(`[DATA] Loaded ${paragraphs.length} paragraphs`);

  const session = driver.session();

  try {
    // Create constraints (idempotent in Neo4j 5.x)
    console.log('[NEO4J] Creating constraints...');
    await session.run('CREATE CONSTRAINT session_id IF NOT EXISTS FOR (s:Session) REQUIRE s.sessionId IS UNIQUE');
    await session.run('CREATE CONSTRAINT paragraph_id IF NOT EXISTS FOR (p:Paragraph) REQUIRE p.paragraphId IS UNIQUE');
    await session.run('CREATE CONSTRAINT issue_code IF NOT EXISTS FOR (i:Issue) REQUIRE i.code IS UNIQUE');
    await session.run('CREATE CONSTRAINT industry_name IF NOT EXISTS FOR (ind:Industry) REQUIRE ind.name IS UNIQUE');
    await session.run('CREATE CONSTRAINT stakeholder_name IF NOT EXISTS FOR (st:Stakeholder) REQUIRE st.name IS UNIQUE');

    let processed = 0;
    let skipped = 0;

    for (const para of paragraphs) {
      // Always create Session node (even for skipped paragraphs)
      await session.run(
        `MERGE (s:Session {sessionId: $sessionId})
         SET s.mainTitle = $mainTitle,
             s.mainIntro = $mainIntro,
             s.section   = $section,
             s.date      = $date,
             s.branch    = $branch,
             s.type      = $type,
             s.status    = $status,
             s.url       = $url`,
        {
          sessionId: para.session_id,
          mainTitle: para.main_title || '',
          mainIntro: para.main_intro || '',
          section:   para.section || '',
          date:      para.date || '',
          branch:    para.branch || '',
          type:      para.type || '',
          status:    para.status || '',
          url:       para.url || '',
        }
      );

      if (para.skip) {
        skipped++;
        continue;
      }

      // Create Paragraph node
      await session.run(
        `MERGE (p:Paragraph {paragraphId: $paragraphId})
         SET p.title   = $title,
             p.content = $content,
             p.date    = $date,
             p.url     = $url`,
        {
          paragraphId: para.paragraph_id,
          title:       para.title || '',
          content:     para.content || '',
          date:        para.date || '',
          url:         para.url || '',
        }
      );

      // Link Session -> Paragraph
      await session.run(
        `MATCH (s:Session {sessionId: $sessionId}), (p:Paragraph {paragraphId: $paragraphId})
         MERGE (s)-[:HAS_PARAGRAPH]->(p)`,
        { sessionId: para.session_id, paragraphId: para.paragraph_id }
      );

      // Issue node
      if (para.issue && para.issue.code) {
        await session.run(
          `MERGE (i:Issue {code: $code})
           SET i.issue    = $issue,
               i.subIssue = $subIssue`,
          {
            code:     para.issue.code,
            issue:    para.issue.issue || '',
            subIssue: para.issue.sub_issue || '',
          }
        );
        await session.run(
          `MATCH (p:Paragraph {paragraphId: $paragraphId}), (i:Issue {code: $code})
           MERGE (p)-[:ABOUT]->(i)`,
          { paragraphId: para.paragraph_id, code: para.issue.code }
        );
      }

      // Industry nodes
      for (const industry of (para.industries || [])) {
        if (!industry) continue;
        await session.run(
          `MERGE (ind:Industry {name: $name})`,
          { name: industry }
        );
        await session.run(
          `MATCH (p:Paragraph {paragraphId: $paragraphId}), (ind:Industry {name: $name})
           MERGE (p)-[:INVOLVES_INDUSTRY]->(ind)`,
          { paragraphId: para.paragraph_id, name: industry }
        );
      }

      // Stakeholder nodes
      for (const sh of (para.stakeholders || [])) {
        if (!sh.name) continue;
        await session.run(
          `MERGE (st:Stakeholder {name: $name})
           SET st.type     = $type,
               st.category = $category`,
          {
            name:     sh.name,
            type:     sh.type || '',
            category: sh.category || '',
          }
        );
        await session.run(
          `MATCH (p:Paragraph {paragraphId: $paragraphId}), (st:Stakeholder {name: $name})
           MERGE (p)-[r:MENTIONS {mentionType: $mentionType}]->(st)
           SET r.role           = $role,
               r.mentionContent = $mentionContent`,
          {
            paragraphId:    para.paragraph_id,
            name:           sh.name,
            mentionType:    sh.mention_type || '',
            role:           sh.role || '',
            mentionContent: sh.mention_content || '',
          }
        );
      }

      processed++;
      if (processed % 10 === 0) {
        process.stdout.write(`\r[NEO4J] Processed ${processed} paragraphs...`);
      }
    }

    console.log(`\n[NEO4J] Done. Paragraphs ingested: ${processed}, skipped: ${skipped}`);

    // Summary
    const counts = await session.run(`
      MATCH (s:Session) WITH count(s) AS sessions
      MATCH (p:Paragraph) WITH sessions, count(p) AS paragraphs
      MATCH (i:Issue) WITH sessions, paragraphs, count(i) AS issues
      MATCH (ind:Industry) WITH sessions, paragraphs, issues, count(ind) AS industries
      MATCH (st:Stakeholder) WITH sessions, paragraphs, issues, industries, count(st) AS stakeholders
      RETURN sessions, paragraphs, issues, industries, stakeholders
    `);
    if (counts.records.length > 0) {
      const r = counts.records[0];
      console.log('[NEO4J] Node counts:');
      console.log(`  Sessions:     ${r.get('sessions')}`);
      console.log(`  Paragraphs:   ${r.get('paragraphs')}`);
      console.log(`  Issues:       ${r.get('issues')}`);
      console.log(`  Industries:   ${r.get('industries')}`);
      console.log(`  Stakeholders: ${r.get('stakeholders')}`);
    }
  } finally {
    await session.close();
    await driver.close();
  }
}

main().catch((err) => {
  console.error('[NEO4J] Fatal error:', err.message);
  process.exit(1);
});
