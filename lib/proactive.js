// "Proactive" view: a one-shot summary of what to look at right now.
//
// Slimmed down from the original VI version: no external briefing files,
// no snapshot.json on disk - it queries the live DB. Three subcommands:
//   summary  - compact 5-line status (default)
//   active   - active notes from the last 7 days
//   revival  - dormant but well-connected notes worth revisiting

const { getDb, getMeta, getFtsCount, getEnrichmentStats, getEmbeddingStats } = require('./database');
const { classifyAll, getStats, findDormantConnected } = require('./engagement');
const { listCatalysts } = require('./catalyst');

function getProactiveData() {
  classifyAll();
  const db = getDb();
  const stats = getStats();
  const dist = {};
  for (const e of stats.distribution) dist[e.level] = e.count;

  const totalNotes = db.prepare('SELECT COUNT(*) as c FROM notes').get().c;
  const totalLinks = db.prepare('SELECT COUNT(*) as c FROM links').get().c;
  const orphanCount = db.prepare(`
    SELECT COUNT(*) as c FROM notes n
    WHERE n.note_id NOT IN (SELECT source_id FROM links)
      AND n.note_id NOT IN (SELECT COALESCE(target_id, '') FROM links WHERE target_id IS NOT NULL)
      AND n.note_id NOT IN (SELECT note_id FROM note_tags)
  `).get().c;

  const recentlyModified24h = db.prepare(`
    SELECT note_id, title, folder
    FROM notes
    WHERE (? - mtime) / 86400000.0 <= 1
    ORDER BY mtime DESC
    LIMIT 30
  `).all(Date.now());

  const recentlyCreated7d = db.prepare(`
    SELECT note_id, title, folder
    FROM notes
    WHERE (? - ctime) / 86400000.0 <= 7
    ORDER BY ctime DESC
    LIMIT 30
  `).all(Date.now());

  const activeNotes = db.prepare(`
    SELECT n.note_id, n.title, n.folder, n.mtime, e.modification_count
    FROM engagement e
    JOIN notes n ON n.note_id = e.note_id
    WHERE e.level = 'active'
    ORDER BY e.modification_count DESC
    LIMIT 15
  `).all();

  let revival = [];
  try { revival = findDormantConnected(10); } catch { /* ignore */ }

  let openCatalysts = [];
  try { openCatalysts = listCatalysts(10); } catch { /* ignore */ }

  return {
    last_index: getMeta('last_full_index') || 'never',
    totals: {
      notes: totalNotes,
      links: totalLinks,
      orphans: orphanCount
    },
    distribution: dist,
    recently_modified_24h: recentlyModified24h,
    recently_created_7d: recentlyCreated7d,
    active_notes: activeNotes,
    revival_candidates: revival,
    open_catalysts: openCatalysts,
    indexes: {
      fts: safeStat(() => getFtsCount()),
      enrichment: safeStat(() => getEnrichmentStats()),
      embeddings: safeStat(() => getEmbeddingStats())
    }
  };
}

function safeStat(fn) {
  try { return fn(); } catch { return null; }
}

function cmdSummary() {
  const data = getProactiveData();
  const t = data.totals;
  const d = data.distribution;
  console.log(`Vault: ${t.notes} notes, ${t.links} links, ${t.orphans} orphans`);
  console.log(`Engagement: ${d.active || 0} active, ${d.moderate || 0} moderate, ${d.dormant || 0} dormant, ${d.archived || 0} archived`);
  console.log(`24h: ${data.recently_modified_24h.length} modified | 7d: ${data.recently_created_7d.length} created`);
  console.log(`Revival: ${data.revival_candidates.length} candidates | Catalysts: ${data.open_catalysts.length} open`);
  const idx = data.indexes;
  const fts = idx.fts || 0;
  const emb = idx.embeddings ? idx.embeddings.embedded : 0;
  const enr = idx.enrichment ? idx.enrichment.enriched : 0;
  console.log(`Indexes: ${fts} FTS, ${emb} embedded, ${enr} enriched`);
}

function cmdActive() {
  const data = getProactiveData();
  if (data.active_notes.length === 0) {
    console.log('No active notes (last 7 days).');
    return;
  }
  console.log(`Active Notes (last 7 days): ${data.active_notes.length}\n`);
  for (const n of data.active_notes) {
    const editStr = n.modification_count ? `[${n.modification_count} edits] ` : '';
    console.log(`  ${editStr}${n.title || n.note_id}`);
    if (n.folder) console.log(`    ${n.folder}`);
  }
}

function cmdRevival() {
  const data = getProactiveData();
  if (data.revival_candidates.length === 0) {
    console.log('No revival candidates found.');
    return;
  }
  console.log(`Revival Candidates (dormant but connected):\n`);
  for (const r of data.revival_candidates) {
    console.log(`  ${r.title || r.note_id}`);
    console.log(`    [${r.level}] ${r.incoming || 0} backlinks, ${r.tags || 0} tags`);
  }
}

function handleProactiveCommand(subcommand) {
  switch (subcommand) {
    case 'active':
      cmdActive();
      break;
    case 'revival':
      cmdRevival();
      break;
    case 'summary':
    case undefined:
    case null:
      cmdSummary();
      break;
    default:
      console.log('Proactive commands:');
      console.log('  summary  Compact status (default)');
      console.log('  active   Active notes from the last 7 days');
      console.log('  revival  Dormant but well-connected notes');
  }
}

module.exports = { getProactiveData, handleProactiveCommand };
