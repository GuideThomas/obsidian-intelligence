// Semantic embeddings: vector generation, storage and similarity search.
//
// This module is provider-agnostic - it uses lib/adapters/embeddings to do the
// actual API calls. Vectors are stored as Float32Array BLOBs in SQLite. Cosine
// similarity is computed in JS (no SQLite extension required), which scales
// comfortably to ~50k notes. Beyond that, swap in sqlite-vec or pgvector.

const {
  getDb,
  upsertEmbedding,
  getEmbedding,
  getAllEmbeddings,
  getUnembeddedNotes,
  getEmbeddingStats
} = require('./database');
const { createEmbedder } = require('./adapters/embeddings');

const MAX_CONTENT_CHARS = 2000;

// --- Cosine similarity ---

function cosineSimilarity(a, b) {
  if (a.length !== b.length) {
    throw new Error(`cosineSimilarity: dimension mismatch (${a.length} vs ${b.length})`);
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

// --- Text builder ---

function buildEmbeddingText(noteId, title, folder, content) {
  const parts = [];
  if (title) parts.push(`Title: ${title}`);
  if (folder) parts.push(`Folder: ${folder}`);

  // Pull tags from the note (cheap join)
  const db = getDb();
  const tags = db.prepare(`
    SELECT t.name FROM note_tags nt JOIN tags t ON t.tag_id = nt.tag_id WHERE nt.note_id = ?
  `).all(noteId).map(t => t.name);
  if (tags.length > 0) parts.push(`Tags: ${tags.join(', ')}`);

  if (content) {
    parts.push(content.length > MAX_CONTENT_CHARS
      ? content.substring(0, MAX_CONTENT_CHARS)
      : content);
  }
  return parts.join('\n');
}

// --- Similarity queries ---

function findSimilar(noteId, topN = 10) {
  const target = getEmbedding(noteId);
  if (!target) return [];

  // Restrict comparison to vectors of the same model. Mixing dimensions
  // would either crash cosineSimilarity or produce nonsense scores.
  const all = getAllEmbeddings(target.model);
  const results = [];
  for (const item of all) {
    if (item.note_id === noteId) continue;
    results.push({ note_id: item.note_id, score: cosineSimilarity(target.vector, item.vector) });
  }
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, topN);
}

async function semanticSearch(query, topN = 10, config) {
  const embedder = createEmbedder(config || require('./config').getConfig());
  const [queryVector] = await embedder.embed([query], 'query');
  if (!queryVector) return [];

  const all = getAllEmbeddings(embedder.model);
  if (all.length === 0) {
    // Fall back: maybe the user has embeddings from a different model.
    // We don't auto-mix; instead, let the caller see an empty result and
    // know they need to re-embed (status command shows the model breakdown).
    return [];
  }

  const results = all.map(item => ({
    note_id: item.note_id,
    score: cosineSimilarity(queryVector, item.vector)
  }));
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, topN);
}

// --- Batch embedding ---

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function embedBatch(options = {}) {
  const {
    limit = 100,
    batchSize = 50,
    delayMs = 200,
    config = null,
    onProgress = null
  } = options;

  const cfg = config || require('./config').getConfig();
  const embedder = createEmbedder(cfg);
  if (embedder.name === 'none') {
    throw new Error(
      'Embeddings provider not configured. Set EMBEDDINGS_PROVIDER, GEMINI_API_KEY, or LLM_API_KEY.\n' +
      'See docs/PROVIDERS.md for the full provider matrix.'
    );
  }

  const notes = getUnembeddedNotes(limit);
  if (notes.length === 0) {
    return { processed: 0, embedded: 0, errors: 0, model: embedder.model };
  }

  const db = getDb();
  const getContent = db.prepare('SELECT content FROM notes_fts WHERE note_id = ?');

  let embedded = 0;
  let errors = 0;

  for (let i = 0; i < notes.length; i += batchSize) {
    const chunk = notes.slice(i, i + batchSize);

    const texts = chunk.map(note => {
      const ftsRow = getContent.get(note.note_id);
      const content = ftsRow ? ftsRow.content : '';
      return buildEmbeddingText(note.note_id, note.title, note.folder, content);
    });

    // Skip very short texts (< 20 chars).
    const validIndices = texts
      .map((t, idx) => (t.length >= 20 ? idx : -1))
      .filter(i => i >= 0);

    if (validIndices.length === 0) continue;

    const validTexts = validIndices.map(idx => texts[idx]);

    try {
      const vectors = await embedder.embed(validTexts, 'document');
      for (let j = 0; j < vectors.length; j++) {
        const noteIdx = validIndices[j];
        const note = chunk[noteIdx];
        upsertEmbedding(
          note.note_id,
          vectors[j],
          embedder.model,
          embedder.dimensions,
          note.content_hash
        );
        embedded++;
      }
    } catch (err) {
      errors += validTexts.length;
      if (onProgress) onProgress(i + chunk.length, notes.length, null, false, err.message);
    }

    if (onProgress) {
      onProgress(
        Math.min(i + chunk.length, notes.length),
        notes.length,
        chunk[chunk.length - 1]?.title,
        true
      );
    }

    if (delayMs > 0 && i + batchSize < notes.length) await sleep(delayMs);
  }

  return { processed: notes.length, embedded, errors, model: embedder.model };
}

// --- CLI Handler ---

async function handleEmbedCommand(subcommand, args) {
  switch (subcommand) {
    case 'run': {
      const limit = parseInt(args[0]) || 100;
      const batchSize = parseInt(args[1]) || 50;
      const stats = getEmbeddingStats();
      console.log(`Embeddings: ${stats.embedded}/${stats.total} (${stats.stale} stale)`);
      console.log(`Generating up to ${limit} embeddings (batch size ${batchSize})...\n`);

      const result = await embedBatch({
        limit,
        batchSize,
        onProgress: (current, total, title, success, errorMsg) => {
          const pct = Math.round((current / total) * 100);
          const icon = success ? '+' : 'x';
          process.stdout.write(`\r  [${pct}%] ${current}/${total} ${icon} ${(title || errorMsg || '').substring(0, 50).padEnd(50)}`);
        }
      });
      console.log(`\n\nDone via ${result.model}: ${result.embedded} embedded, ${result.errors} errors (${result.processed} processed)`);
      break;
    }

    case 'stats': {
      const stats = getEmbeddingStats();
      console.log('Embedding Statistics:');
      console.log(`  Total notes:   ${stats.total}`);
      console.log(`  Embedded:      ${stats.embedded} (${stats.total ? Math.round(stats.embedded / stats.total * 100) : 0}%)`);
      console.log(`  Fresh:         ${stats.fresh}`);
      console.log(`  Stale:         ${stats.stale}`);
      console.log(`  Unembedded:    ${stats.total - stats.embedded}`);
      if (stats.models.length > 0) {
        console.log('\n  Models:');
        for (const m of stats.models) console.log(`    ${m.model.padEnd(30)} ${m.c}`);
      }
      break;
    }

    case 'similar': {
      const noteId = args[0];
      if (!noteId) { console.error('Usage: vault-intelligence embed similar <note-id> [--limit N]'); return; }
      const limitIdx = args.indexOf('--limit');
      const topN = limitIdx >= 0 ? parseInt(args[limitIdx + 1]) : 10;

      const results = findSimilar(noteId, topN);
      if (results.length === 0) {
        console.log(`No similar notes for "${noteId}". Is it embedded? Run: vault-intelligence embed run`);
        return;
      }

      const db = getDb();
      console.log(`Notes similar to "${noteId}":\n`);
      for (const r of results) {
        const note = db.prepare('SELECT title, folder FROM notes WHERE note_id = ?').get(r.note_id);
        const pct = (r.score * 100).toFixed(1);
        console.log(`  ${pct}%  ${(note?.folder || '').padEnd(25)} ${note?.title || r.note_id}`);
      }
      break;
    }

    case 'search': {
      const query = args.filter(a => !a.startsWith('--')).join(' ');
      if (!query) { console.error('Usage: vault-intelligence embed search <query> [--limit N]'); return; }
      const limitIdx = args.indexOf('--limit');
      const topN = limitIdx >= 0 ? parseInt(args[limitIdx + 1]) : 10;

      console.log(`Semantic search: "${query}"\n`);
      const results = await semanticSearch(query, topN);
      if (results.length === 0) {
        console.log('No results. Run: vault-intelligence embed run');
        return;
      }

      const db = getDb();
      for (const r of results) {
        const note = db.prepare('SELECT title, folder FROM notes WHERE note_id = ?').get(r.note_id);
        const pct = (r.score * 100).toFixed(1);
        console.log(`  ${pct}%  ${note?.title || r.note_id} ${note?.folder ? `(${note.folder})` : ''}`);
      }
      break;
    }

    default:
      console.log('Embedding commands:');
      console.log('  run [limit] [batch_size]      Generate embeddings (default: 100, batch 50)');
      console.log('  stats                         Embedding statistics');
      console.log('  similar <note-id> [--limit N] Find semantically similar notes');
      console.log('  search <query> [--limit N]    Semantic search across vault');
  }
}

module.exports = {
  embedBatch,
  findSimilar,
  semanticSearch,
  cosineSimilarity,
  buildEmbeddingText,
  handleEmbedCommand
};
