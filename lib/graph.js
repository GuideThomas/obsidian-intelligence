const path = require('path');
const { getDb } = require('./database');

function findOrphans(limit = 50) {
  return getDb().prepare(`
    SELECT n.note_id, n.path, n.title, n.word_count, n.folder
    FROM notes n
    WHERE n.note_id NOT IN (SELECT source_id FROM links)
      AND n.note_id NOT IN (SELECT COALESCE(target_id, '') FROM links WHERE target_id IS NOT NULL)
      AND n.note_id NOT IN (SELECT note_id FROM note_tags)
    ORDER BY n.mtime DESC
    LIMIT ?
  `).all(limit);
}

function findHubs(limit = 10) {
  return getDb().prepare(`
    SELECT
      n.note_id, n.path, n.title,
      (SELECT COUNT(*) FROM links WHERE source_id = n.note_id) as outgoing,
      (SELECT COUNT(*) FROM links WHERE target_id = n.note_id) as incoming,
      (SELECT COUNT(*) FROM note_tags WHERE note_id = n.note_id) as tag_count,
      (SELECT COUNT(*) FROM links WHERE source_id = n.note_id)
        + (SELECT COUNT(*) FROM links WHERE target_id = n.note_id)
        + (SELECT COUNT(*) FROM note_tags WHERE note_id = n.note_id) as total_connections
    FROM notes n
    ORDER BY total_connections DESC
    LIMIT ?
  `).all(limit);
}

function findBacklinks(noteQuery) {
  const noteId = resolveNoteQuery(noteQuery);
  if (!noteId) return { error: `Note not found: ${noteQuery}` };

  const results = getDb().prepare(`
    SELECT n.note_id, n.path, n.title, l.alias
    FROM links l
    JOIN notes n ON n.note_id = l.source_id
    WHERE l.target_id = ?
    ORDER BY n.title
  `).all(noteId);

  return { noteId, results };
}

function findLinks(noteQuery) {
  const noteId = resolveNoteQuery(noteQuery);
  if (!noteId) return { error: `Note not found: ${noteQuery}` };

  const results = getDb().prepare(`
    SELECT l.target_raw, l.target_id, l.alias,
      CASE WHEN l.target_id IS NOT NULL THEN
        (SELECT title FROM notes WHERE note_id = l.target_id)
      ELSE NULL END as target_title
    FROM links l
    WHERE l.source_id = ?
    ORDER BY l.target_raw
  `).all(noteId);

  return { noteId, results };
}

function getTagCloud(filter = null) {
  let query = `
    SELECT t.name, COUNT(nt.note_id) as count
    FROM tags t
    JOIN note_tags nt ON nt.tag_id = t.tag_id
    GROUP BY t.tag_id
  `;
  const params = [];

  if (filter) {
    query = `
      SELECT t.name, COUNT(nt.note_id) as count
      FROM tags t
      JOIN note_tags nt ON nt.tag_id = t.tag_id
      WHERE t.name LIKE ?
      GROUP BY t.tag_id
    `;
    params.push(`%${filter}%`);
  }

  query += ' ORDER BY count DESC';
  return getDb().prepare(query).all(...params);
}

function findNotesByTag(tagName) {
  const normalized = tagName.toLowerCase().replace(/^#/, '');
  return getDb().prepare(`
    SELECT n.note_id, n.path, n.title, n.folder, nt.source
    FROM notes n
    JOIN note_tags nt ON nt.note_id = n.note_id
    JOIN tags t ON t.tag_id = nt.tag_id
    WHERE t.name = ?
    ORDER BY n.mtime DESC
  `).all(normalized);
}

function findRelated(noteQuery, limit = 15) {
  const noteId = resolveNoteQuery(noteQuery);
  if (!noteId) return { error: `Note not found: ${noteQuery}` };

  // Notes sharing tags
  const byTags = getDb().prepare(`
    SELECT n.note_id, n.path, n.title, COUNT(*) as shared_tags, 'tags' as via
    FROM notes n
    JOIN note_tags nt1 ON nt1.note_id = n.note_id
    JOIN note_tags nt2 ON nt2.tag_id = nt1.tag_id AND nt2.note_id = ?
    WHERE n.note_id != ?
    GROUP BY n.note_id
    ORDER BY shared_tags DESC
    LIMIT ?
  `).all(noteId, noteId, limit);

  // Notes linked from/to
  const byLinks = getDb().prepare(`
    SELECT DISTINCT n.note_id, n.path, n.title, 'link' as via
    FROM notes n
    WHERE n.note_id IN (
      SELECT target_id FROM links WHERE source_id = ? AND target_id IS NOT NULL
      UNION
      SELECT source_id FROM links WHERE target_id = ?
    )
    AND n.note_id != ?
    LIMIT ?
  `).all(noteId, noteId, noteId, limit);

  return { noteId, byTags, byLinks };
}

function findBrokenLinks(limit = 50) {
  return getDb().prepare(`
    SELECT l.source_id, l.target_raw, n.path as source_path, n.title as source_title
    FROM links l
    JOIN notes n ON n.note_id = l.source_id
    WHERE l.target_id IS NULL
    ORDER BY n.title, l.target_raw
    LIMIT ?
  `).all(limit);
}

// TODO: this does up to 5 DB queries per resolution -- should probably
// build an in-memory lookup map for interactive use
function resolveNoteQuery(query) {
  if (!query) return null;
  const q = query.replace(/^["']|["']$/g, '');

  // Exact note_id match
  const exact = getDb().prepare('SELECT note_id FROM notes WHERE note_id = ?').get(q);
  if (exact) return exact.note_id;

  // Add .md if missing
  const withMd = q.endsWith('.md') ? q : q + '.md';
  const exactMd = getDb().prepare('SELECT note_id FROM notes WHERE note_id = ?').get(withMd);
  if (exactMd) return exactMd.note_id;

  // Case-insensitive path match
  const ciPath = getDb().prepare('SELECT note_id FROM notes WHERE LOWER(path) = LOWER(?)').get(withMd);
  if (ciPath) return ciPath.note_id;

  // Title match
  const titleMatch = getDb().prepare('SELECT note_id FROM notes WHERE LOWER(title) = LOWER(?) LIMIT 1').get(q);
  if (titleMatch) return titleMatch.note_id;

  // Partial title match
  const partial = getDb().prepare('SELECT note_id FROM notes WHERE LOWER(title) LIKE LOWER(?) LIMIT 1').get(`%${q}%`);
  if (partial) return partial.note_id;

  return null;
}

// --- CLI ---

function handleGraphCommand(subcommand, args) {
  switch (subcommand) {
    case 'orphans': {
      const results = findOrphans(parseInt(args[1]) || 50);
      console.log(`Orphan notes (no links, no tags): ${results.length}\n`);
      for (const r of results) {
        console.log(`  ${r.title}`);
        console.log(`    ${r.path} (${r.word_count} words)`);
      }
      if (results.length === 0) console.log('  None found.');
      break;
    }

    case 'hubs': {
      const n = parseInt(args[1]) || 10;
      const results = findHubs(n);
      console.log(`Top ${n} hub notes:\n`);
      for (const r of results) {
        console.log(`  [${r.total_connections}] ${r.title}`);
        console.log(`    Out: ${r.outgoing} | In: ${r.incoming} | Tags: ${r.tag_count}`);
      }
      break;
    }

    case 'backlinks': {
      const query = args.slice(1).join(' ');
      if (!query) { console.error('Usage: vault-intelligence graph backlinks <note>'); return; }
      const result = findBacklinks(query);
      if (result.error) { console.error(result.error); return; }
      console.log(`Backlinks to "${result.noteId}": ${result.results.length}\n`);
      for (const r of result.results) {
        console.log(`  ${r.title}`);
        console.log(`    ${r.path}`);
      }
      if (result.results.length === 0) console.log('  No backlinks found.');
      break;
    }

    case 'links': {
      const query = args.slice(1).join(' ');
      if (!query) { console.error('Usage: vault-intelligence graph links <note>'); return; }
      const result = findLinks(query);
      if (result.error) { console.error(result.error); return; }
      console.log(`Links from "${result.noteId}": ${result.results.length}\n`);
      for (const r of result.results) {
        const status = r.target_id ? `-> ${r.target_title}` : '(broken)';
        console.log(`  [[${r.target_raw}]] ${status}`);
      }
      break;
    }

    case 'tags': {
      const filter = args[1] || null;
      const results = getTagCloud(filter);
      console.log(`Tags${filter ? ` matching "${filter}"` : ''}: ${results.length}\n`);
      for (const r of results) {
        const bar = '#'.repeat(Math.min(r.count, 40));
        console.log(`  #${r.name.padEnd(30)} ${String(r.count).padStart(4)} ${bar}`);
      }
      break;
    }

    case 'tag': {
      const tag = args[1];
      if (!tag) { console.error('Usage: vault-intelligence graph tag <tag>'); return; }
      const results = findNotesByTag(tag);
      console.log(`Notes with #${tag.toLowerCase().replace(/^#/, '')}: ${results.length}\n`);
      for (const r of results) {
        console.log(`  ${r.title}`);
        console.log(`    ${r.path} [${r.source}]`);
      }
      break;
    }

    case 'related': {
      const query = args.slice(1).join(' ');
      if (!query) { console.error('Usage: vault-intelligence graph related <note>'); return; }
      const result = findRelated(query);
      if (result.error) { console.error(result.error); return; }
      console.log(`Related to "${result.noteId}":\n`);
      if (result.byTags.length > 0) {
        console.log('  By shared tags:');
        for (const r of result.byTags) {
          console.log(`    [${r.shared_tags} shared] ${r.title}`);
        }
      }
      if (result.byLinks.length > 0) {
        console.log('  By links:');
        for (const r of result.byLinks) {
          console.log(`    ${r.title} (${r.path})`);
        }
      }
      if (result.byTags.length === 0 && result.byLinks.length === 0) {
        console.log('  No related notes found.');
      }
      break;
    }

    case 'broken': {
      const results = findBrokenLinks(parseInt(args[1]) || 50);
      console.log(`Broken links: ${results.length}\n`);
      for (const r of results) {
        console.log(`  ${r.source_title} -> [[${r.target_raw}]]`);
      }
      if (results.length === 0) console.log('  No broken links found.');
      break;
    }

    default:
      console.log('Graph commands:');
      console.log('  orphans           Notes without links or tags');
      console.log('  hubs [n]          Top N connected notes');
      console.log('  backlinks <note>  Who links to this note?');
      console.log('  links <note>      Where does this note link?');
      console.log('  tags [filter]     Tag cloud with counts');
      console.log('  tag <tag>         All notes with this tag');
      console.log('  related <note>    Related notes (shared tags/links)');
      console.log('  broken            Broken links');
  }
}

module.exports = {
  handleGraphCommand,
  findOrphans,
  findHubs,
  findBacklinks,
  findLinks,
  getTagCloud,
  findNotesByTag,
  findRelated,
  findBrokenLinks,
  resolveNoteQuery
};
