// Full-text search via SQLite FTS5 (BM25 ranking).
//
// Indexed columns: title (col 1) and content (col 2). folder and note_id
// are stored UNINDEXED for filter access without bloating the term index.
//
// Query syntax: standard FTS5 -- supports words, "phrases", AND, OR, NOT.
// Invalid syntax falls back to a quoted literal so common-language queries
// like "what is x?" don't crash with a syntax error.

const { getDb } = require('./database');

/**
 * @param {string} query
 * @param {object} [options]
 * @param {number} [options.limit=20]
 * @param {string} [options.folder] - prefix-match filter
 * @param {string} [options.tag] - exact tag-name filter
 * @returns {Array<{note_id, title, folder, snippet, rank}>}
 */
function searchContent(query, options = {}) {
  const { limit = 20, folder = null, tag = null } = options;
  if (!query || !query.trim()) return [];

  const params = [];
  const joins = [];
  const wheres = ['f.notes_fts MATCH ?'];
  params.push(query);

  if (tag) {
    joins.push('JOIN note_tags nt ON nt.note_id = f.note_id');
    joins.push('JOIN tags t ON t.tag_id = nt.tag_id');
    wheres.push('t.name = ?');
    params.push(String(tag).toLowerCase().replace(/^#/, ''));
  }

  if (folder) {
    wheres.push('f.folder LIKE ?');
    params.push(folder + '%');
  }

  const sql = `
    SELECT
      f.note_id,
      f.title,
      f.folder,
      snippet(notes_fts, 2, '»', '«', '...', 40) as snippet,
      rank
    FROM notes_fts f
    ${joins.join('\n    ')}
    WHERE ${wheres.join(' AND ')}
    ORDER BY rank
    LIMIT ?
  `;
  params.push(limit);

  try {
    return getDb().prepare(sql).all(...params);
  } catch (e) {
    if (e.message && e.message.includes('fts5: syntax error')) {
      // Fall back to literal phrase search.
      params[0] = `"${query.replace(/"/g, '')}"`;
      return getDb().prepare(sql).all(...params);
    }
    throw e;
  }
}

function getFtsStats() {
  const { getFtsCount } = require('./database');
  return { indexed_notes: getFtsCount() };
}

// --- CLI Handler ---

function handleSearchCommand(args) {
  const queryParts = [];
  let limit = 20;
  let folder = null;
  let tag = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--limit' && args[i + 1]) {
      limit = parseInt(args[++i]);
    } else if (args[i] === '--folder' && args[i + 1]) {
      folder = args[++i];
    } else if (args[i] === '--tag' && args[i + 1]) {
      tag = args[++i];
    } else if (!args[i].startsWith('--')) {
      queryParts.push(args[i]);
    }
  }

  // First positional arg is the subcommand ('search'); skip it.
  if (queryParts[0] === 'search') queryParts.shift();
  const query = queryParts.join(' ');

  if (!query) {
    console.log('Usage: vault-intelligence search <query> [--limit N] [--folder path] [--tag name]');
    return;
  }

  const results = searchContent(query, { limit, folder, tag });

  if (results.length === 0) {
    console.log(`No results for "${query}"`);
    if (getFtsStats().indexed_notes === 0) {
      console.log('FTS index is empty. Run: vault-intelligence index --rebuild-fts');
    }
    return;
  }

  console.log(`Search results for "${query}": ${results.length}\n`);
  for (const r of results) {
    console.log(`  ${r.title || r.note_id}`);
    console.log(`    ${r.folder || '(root)'} | rank: ${r.rank.toFixed(2)}`);
    if (r.snippet) {
      console.log(`    ${r.snippet.replace(/\s+/g, ' ').substring(0, 140)}`);
    }
    console.log('');
  }
}

module.exports = { searchContent, getFtsStats, handleSearchCommand };
