// Engagement classification -- how actively are notes being used?
// Thresholds are configurable via ENGAGEMENT_*_DAYS env vars.

const { getDb } = require('./database');

function getThresholds() {
  const { getConfig } = require('./config');
  const config = getConfig();
  return {
    active: config.engagement.active,
    moderate: config.engagement.moderate,
    dormant: config.engagement.dormant
  };
}

function classifyLevel(mtimeMs) {
  const thresholds = getThresholds();
  const daysAgo = (Date.now() - mtimeMs) / (1000 * 60 * 60 * 24);
  if (daysAgo <= thresholds.active) return 'active';
  if (daysAgo <= thresholds.moderate) return 'moderate';
  if (daysAgo <= thresholds.dormant) return 'dormant';
  return 'archived';
}

function classifyAll() {
  const db = getDb();
  const notes = db.prepare('SELECT note_id, mtime FROM notes').all();
  const now = new Date().toISOString();

  const upsert = db.prepare(`
    INSERT INTO engagement (note_id, level, modification_count, last_classified)
    VALUES (?, ?, (SELECT COUNT(*) FROM engagement_snapshots WHERE note_id = ?), ?)
    ON CONFLICT(note_id) DO UPDATE SET
      level = excluded.level,
      modification_count = (SELECT COUNT(*) FROM engagement_snapshots WHERE note_id = excluded.note_id),
      last_classified = excluded.last_classified
  `);

  const txn = db.transaction(() => {
    for (const note of notes) {
      const level = classifyLevel(note.mtime);
      upsert.run(note.note_id, level, note.note_id, now);
    }
  });
  txn();

  return notes.length;
}

function getStats() {
  const db = getDb();
  const distribution = db.prepare(`
    SELECT level, COUNT(*) as count
    FROM engagement
    GROUP BY level
    ORDER BY CASE level
      WHEN 'active' THEN 1
      WHEN 'moderate' THEN 2
      WHEN 'dormant' THEN 3
      WHEN 'archived' THEN 4
    END
  `).all();

  const total = distribution.reduce((sum, r) => sum + r.count, 0);

  // Top active notes
  const topActive = db.prepare(`
    SELECT n.title, n.path, e.modification_count
    FROM engagement e
    JOIN notes n ON n.note_id = e.note_id
    WHERE e.level = 'active'
    ORDER BY e.modification_count DESC
    LIMIT 5
  `).all();

  // Most modified overall
  const mostModified = db.prepare(`
    SELECT n.title, n.path, e.modification_count, e.level
    FROM engagement e
    JOIN notes n ON n.note_id = e.note_id
    ORDER BY e.modification_count DESC
    LIMIT 5
  `).all();

  return { distribution, total, topActive, mostModified };
}

function getNotesByLevel(level, limit = 30) {
  return getDb().prepare(`
    SELECT n.note_id, n.title, n.path, n.folder, n.mtime, e.modification_count
    FROM engagement e
    JOIN notes n ON n.note_id = e.note_id
    WHERE e.level = ?
    ORDER BY n.mtime DESC
    LIMIT ?
  `).all(level, limit);
}

// "Revival candidates" -- dormant notes that are well-connected.
// These are worth revisiting because other notes still reference them.
function findDormantConnected(limit = 10) {
  return getDb().prepare(`
    SELECT n.title, n.path, e.level, e.modification_count,
      (SELECT COUNT(*) FROM links WHERE target_id = n.note_id) as incoming,
      (SELECT COUNT(*) FROM note_tags WHERE note_id = n.note_id) as tags
    FROM engagement e
    JOIN notes n ON n.note_id = e.note_id
    WHERE e.level IN ('dormant', 'archived')
    ORDER BY incoming + tags DESC
    LIMIT ?
  `).all(limit);
}

// --- CLI ---

function handleEngagementCommand(subcommand, args) {
  // Always reclassify first
  const classified = classifyAll();

  switch (subcommand) {
    case 'stats': {
      const stats = getStats();
      const thresholds = getThresholds();
      console.log(`Engagement Stats (${stats.total} notes):\n`);
      console.log(`  Thresholds: active <${thresholds.active}d | moderate <${thresholds.moderate}d | dormant <${thresholds.dormant}d\n`);

      for (const row of stats.distribution) {
        const pct = ((row.count / stats.total) * 100).toFixed(1);
        const bar = '#'.repeat(Math.round(row.count / stats.total * 40));
        console.log(`  ${row.level.padEnd(10)} ${String(row.count).padStart(5)} (${pct.padStart(5)}%) ${bar}`);
      }

      if (stats.topActive.length > 0) {
        console.log('\n  Most active:');
        for (const n of stats.topActive) {
          console.log(`    [${n.modification_count} edits] ${n.title}`);
        }
      }

      if (stats.mostModified.length > 0) {
        console.log('\n  Most modified (all time):');
        for (const n of stats.mostModified) {
          console.log(`    [${n.modification_count} edits] ${n.title} (${n.level})`);
        }
      }
      break;
    }

    case 'active':
    case 'moderate':
    case 'dormant':
    case 'archived': {
      const results = getNotesByLevel(subcommand, parseInt(args[1]) || 30);
      console.log(`${subcommand.charAt(0).toUpperCase() + subcommand.slice(1)} notes: ${results.length}\n`);
      for (const r of results) {
        const ago = Math.round((Date.now() - r.mtime) / (1000 * 60 * 60 * 24));
        console.log(`  ${r.title}`);
        console.log(`    ${r.path} | ${ago}d ago | ${r.modification_count} edits`);
      }
      break;
    }

    case 'revival': {
      const results = findDormantConnected(parseInt(args[1]) || 10);
      console.log(`Revival candidates (dormant but well-connected): ${results.length}\n`);
      for (const r of results) {
        console.log(`  ${r.title} [${r.level}]`);
        console.log(`    ${r.incoming} backlinks | ${r.tags} tags | ${r.modification_count} edits`);
      }
      break;
    }

    default: {
      if (!subcommand) {
        handleEngagementCommand('stats', args);
        return;
      }
      console.log('Engagement commands:');
      console.log('  stats              Distribution summary');
      console.log('  active             Active notes');
      console.log('  moderate           Moderate notes');
      console.log('  dormant            Dormant notes');
      console.log('  archived           Archived notes');
      console.log('  revival            Dormant but well-connected notes');
    }
  }
}

module.exports = {
  handleEngagementCommand,
  classifyAll,
  classifyLevel,
  getStats,
  getNotesByLevel,
  findDormantConnected
};
