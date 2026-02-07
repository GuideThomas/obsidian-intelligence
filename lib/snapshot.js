const fs = require('fs');
const path = require('path');
const { getDb, getMeta } = require('./database');
const { classifyAll, getStats, findDormantConnected } = require('./engagement');
const { findOrphans, findHubs, getTagCloud, findBrokenLinks } = require('./graph');
const { listCatalysts, buildGraphSummary } = require('./catalyst');

function buildSnapshot() {
  const db = getDb();
  const { getConfig } = require('./config');
  const config = getConfig();

  // Reclassify engagement levels
  classifyAll();

  const engagement = getStats();
  const graphSummary = buildGraphSummary();

  // Active notes (last N days) with details
  const activeNotes = db.prepare(`
    SELECT n.note_id, n.title, n.path, n.folder, n.word_count, n.mtime,
      e.modification_count
    FROM engagement e
    JOIN notes n ON n.note_id = e.note_id
    WHERE e.level = 'active'
    ORDER BY n.mtime DESC
    LIMIT 20
  `).all();

  const revivalCandidates = findDormantConnected(10);

  let openCatalysts = [];
  try {
    openCatalysts = listCatalysts(10);
  } catch (e) {
    // catalysts table might not exist yet
  }

  const folderActivity = db.prepare(`
    SELECT folder, COUNT(*) as total,
      SUM(CASE WHEN (? - mtime) / 86400000.0 <= 7 THEN 1 ELSE 0 END) as active_7d,
      SUM(CASE WHEN (? - mtime) / 86400000.0 <= 30 THEN 1 ELSE 0 END) as active_30d,
      MAX(mtime) as last_modified
    FROM notes
    GROUP BY folder
    HAVING total >= 3
    ORDER BY active_7d DESC, active_30d DESC
    LIMIT 20
  `).all(Date.now(), Date.now());

  const recentlyModified = db.prepare(`
    SELECT n.note_id, n.title, n.path, n.folder, n.mtime
    FROM notes n
    WHERE (? - n.mtime) / 86400000.0 <= 1
    ORDER BY n.mtime DESC
    LIMIT 30
  `).all(Date.now());

  const recentlyCreated = db.prepare(`
    SELECT n.note_id, n.title, n.path, n.folder, n.ctime
    FROM notes n
    WHERE (? - n.ctime) / 86400000.0 <= 7
    ORDER BY n.ctime DESC
    LIMIT 20
  `).all(Date.now());

  const totalNotes = db.prepare('SELECT COUNT(*) as c FROM notes').get().c;
  const totalTags = db.prepare('SELECT COUNT(*) as c FROM tags').get().c;
  const totalLinks = db.prepare('SELECT COUNT(*) as c FROM links').get().c;
  const brokenLinkCount = db.prepare('SELECT COUNT(*) as c FROM links WHERE target_id IS NULL').get().c;
  const lastIndex = getMeta('last_full_index') || 'never';

  return {
    generated_at: new Date().toISOString(),
    version: '1.0',
    source: config.source,
    last_index: lastIndex,
    totals: {
      notes: totalNotes,
      tags: totalTags,
      links: totalLinks,
      broken_links: brokenLinkCount,
      orphans: graphSummary.orphanCount
    },
    engagement: {
      distribution: engagement.distribution,
      top_active: engagement.topActive.map(n => ({
        title: n.title,
        path: n.path,
        edits: n.modification_count
      })),
      most_modified: engagement.mostModified.map(n => ({
        title: n.title,
        path: n.path,
        edits: n.modification_count,
        level: n.level
      }))
    },
    active_notes: activeNotes.map(n => ({
      title: n.title,
      path: n.path,
      folder: n.folder,
      words: n.word_count,
      edits: n.modification_count,
      mtime: new Date(n.mtime).toISOString()
    })),
    recently_modified_24h: recentlyModified.map(n => ({
      title: n.title,
      path: n.path,
      folder: n.folder,
      mtime: new Date(n.mtime).toISOString()
    })),
    recently_created_7d: recentlyCreated.map(n => ({
      title: n.title,
      path: n.path,
      folder: n.folder,
      ctime: new Date(n.ctime).toISOString()
    })),
    revival_candidates: revivalCandidates.map(r => ({
      title: r.title,
      path: r.path,
      level: r.level,
      backlinks: r.incoming,
      tags: r.tags,
      edits: r.modification_count
    })),
    graph: {
      top_tags: graphSummary.topTags.slice(0, 20),
      hubs: graphSummary.hubs,
      tag_pairs: graphSummary.tagPairs,
      folders: graphSummary.folders
    },
    open_catalysts: openCatalysts.map(c => ({
      id: c.id,
      category: c.category,
      question: c.question,
      context: c.context,
      created: c.created_at
    })),
    folder_activity: folderActivity.map(f => ({
      folder: f.folder,
      total: f.total,
      active_7d: f.active_7d,
      active_30d: f.active_30d,
      last_modified: new Date(f.last_modified).toISOString()
    }))
  };
}

function writeSnapshot(outputPath) {
  const { getConfig } = require('./config');
  const config = getConfig();
  const defaultPath = config.vaultPath
    ? path.join(config.vaultPath, '.vault-intelligence-snapshot.json')
    : './vault-snapshot.json';
  const target = outputPath || process.env.SNAPSHOT_PATH || defaultPath;
  const snapshot = buildSnapshot();

  const dir = path.dirname(target);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(target, JSON.stringify(snapshot, null, 2), 'utf8');
  return { path: target, size: JSON.stringify(snapshot).length, snapshot };
}

function handleSnapshotCommand(args) {
  const outputPath = args[0] || null;
  console.log('Generating vault snapshot...');

  const result = writeSnapshot(outputPath);

  console.log(`\nSnapshot written: ${result.path}`);
  console.log(`  Size: ${Math.round(result.size / 1024)} KB`);
  console.log(`  Notes: ${result.snapshot.totals.notes}`);
  console.log(`  Active (7d): ${result.snapshot.active_notes.length}`);
  console.log(`  Modified (24h): ${result.snapshot.recently_modified_24h.length}`);
  console.log(`  Created (7d): ${result.snapshot.recently_created_7d.length}`);
  console.log(`  Revival candidates: ${result.snapshot.revival_candidates.length}`);
  console.log(`  Open catalysts: ${result.snapshot.open_catalysts.length}`);
}

module.exports = {
  buildSnapshot,
  writeSnapshot,
  handleSnapshotCommand
};
