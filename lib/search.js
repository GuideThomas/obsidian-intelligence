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

async function handleSearchCommand(args) {
  const queryParts = [];
  let limit = 20;
  let folder = null;
  let tag = null;
  let hybrid = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--limit' && args[i + 1]) {
      limit = parseInt(args[++i]);
    } else if (args[i] === '--folder' && args[i + 1]) {
      folder = args[++i];
    } else if (args[i] === '--tag' && args[i + 1]) {
      tag = args[++i];
    } else if (args[i] === '--hybrid') {
      hybrid = true;
    } else if (!args[i].startsWith('--')) {
      queryParts.push(args[i]);
    }
  }

  // First positional arg is the subcommand ('search'); skip it.
  if (queryParts[0] === 'search') queryParts.shift();
  const query = queryParts.join(' ');

  if (!query) {
    console.log('Usage: vault-intelligence search <query> [--hybrid] [--limit N] [--folder path] [--tag name]');
    return;
  }

  if (hybrid) {
    return handleHybridSearchCommand(query, { limit, folder, tag });
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

// ============================================================================
// Hybrid Search (Reciprocal Rank Fusion)
// ============================================================================
//
// Combines FTS5 (BM25) keyword results with semantic similarity results
// using Reciprocal Rank Fusion. RRF score for a doc d is the sum over all
// rankers r of 1/(k + rank_r(d)), where k=60 is the standard constant that
// dampens the effect of high rankings (so a doc that's #1 in two rankers
// dominates over a doc that's #1 in one and absent in the other).
//
// Falls back gracefully:
//   - if embeddings are missing or the embeddings provider is 'none', the
//     hybrid call still works -- it just returns FTS-only results, marked
//     as found_in='keyword'.
//   - if FTS is empty, returns semantic-only results.

const RRF_K = 60;
const CANDIDATE_LIMIT = 50;

async function hybridSearch(query, options = {}) {
  const {
    limit = 15,
    ftsWeight = 1.0,
    semanticWeight = 1.0,
    folder = null,
    tag = null,
    config = null
  } = options;

  if (!query || !query.trim()) {
    return { results: [], fts_count: 0, semantic_count: 0, merged_count: 0 };
  }

  // Run both searches. Semantic is best-effort: missing/no provider => skip.
  const ftsResults = searchContent(query, { limit: CANDIDATE_LIMIT, folder, tag });

  let semanticResults = [];
  let semanticUsed = true;
  try {
    const { semanticSearch } = require('./embeddings');
    semanticResults = await semanticSearch(query, CANDIDATE_LIMIT, config);
  } catch {
    semanticUsed = false;
  }

  // Build RRF score map
  const scoreMap = new Map();

  ftsResults.forEach((r, idx) => {
    const rank = idx + 1;
    scoreMap.set(r.note_id, {
      rrfScore: ftsWeight * (1 / (RRF_K + rank)),
      ftsRank: rank,
      semanticRank: null,
      semanticScore: null,
      snippet: r.snippet,
      title: r.title,
      folder: r.folder
    });
  });

  semanticResults.forEach((r, idx) => {
    const rank = idx + 1;
    const contribution = semanticWeight * (1 / (RRF_K + rank));
    if (scoreMap.has(r.note_id)) {
      const existing = scoreMap.get(r.note_id);
      existing.rrfScore += contribution;
      existing.semanticRank = rank;
      existing.semanticScore = r.score;
    } else {
      scoreMap.set(r.note_id, {
        rrfScore: contribution,
        ftsRank: null,
        semanticRank: rank,
        semanticScore: r.score,
        snippet: null,
        title: null,
        folder: null
      });
    }
  });

  // Sort and take top N
  const merged = [...scoreMap.entries()]
    .sort((a, b) => b[1].rrfScore - a[1].rrfScore)
    .slice(0, limit);

  // Enrich entries that came only from semantic results (they don't have title/folder yet)
  const db = getDb();
  const results = merged.map(([noteId, data]) => {
    let title = data.title;
    let folderVal = data.folder;
    if (!title) {
      const note = db.prepare('SELECT title, folder FROM notes WHERE note_id = ?').get(noteId);
      title = note?.title;
      folderVal = note?.folder;
    }
    return {
      note_id: noteId,
      title,
      folder: folderVal,
      snippet: data.snippet,
      rrf_score: parseFloat(data.rrfScore.toFixed(6)),
      fts_rank: data.ftsRank,
      semantic_rank: data.semanticRank,
      semantic_similarity: data.semanticScore !== null
        ? parseFloat((data.semanticScore * 100).toFixed(1))
        : null,
      found_in: data.ftsRank && data.semanticRank ? 'both'
        : data.ftsRank ? 'keyword'
          : 'semantic'
    };
  });

  return {
    results,
    fts_count: ftsResults.length,
    semantic_count: semanticResults.length,
    merged_count: results.length,
    semantic_used: semanticUsed
  };
}

async function handleHybridSearchCommand(query, options) {
  console.log(`Hybrid search (keyword + semantic): "${query}"\n`);
  const result = await hybridSearch(query, options);

  if (result.results.length === 0) {
    console.log('No results found.');
    if (!result.semantic_used) {
      console.log('(Semantic search was unavailable - is an embeddings provider configured?)');
    }
    return;
  }

  const semNote = result.semantic_used ? '' : ' (semantic unavailable - keyword only)';
  console.log(`  FTS: ${result.fts_count} | Semantic: ${result.semantic_count} | Merged: ${result.merged_count}${semNote}\n`);

  for (const r of result.results) {
    const source = r.found_in === 'both' ? '[K+S]'
      : r.found_in === 'keyword' ? '[K]  '
        : '[S]  ';
    const sim = r.semantic_similarity !== null ? `${r.semantic_similarity}%` : '-';
    console.log(`  ${source} ${r.title || r.note_id}`);
    console.log(`         ${(r.folder || '').padEnd(25)} RRF: ${r.rrf_score.toFixed(4)} | Sim: ${sim}`);
    if (r.snippet) {
      console.log(`         ${r.snippet.replace(/\s+/g, ' ').substring(0, 110)}`);
    }
    console.log('');
  }
}

module.exports = {
  searchContent,
  getFtsStats,
  handleSearchCommand,
  hybridSearch,
  handleHybridSearchCommand
};
