const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

let db = null;

function getDb() {
  if (!db) throw new Error('Database not initialized. Call initDatabase() first.');
  return db;
}

function initDatabase(dbPath) {
  const { getConfig } = require('./config');
  const config = getConfig();
  const resolvedPath = dbPath || config.sqlite.path;

  const dbDir = path.dirname(resolvedPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  db = new Database(resolvedPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    -- Core tables
    CREATE TABLE IF NOT EXISTS notes (
      note_id TEXT PRIMARY KEY,
      path TEXT NOT NULL,
      title TEXT,
      folder TEXT,
      word_count INTEGER DEFAULT 0,
      content_hash TEXT,
      mtime INTEGER,
      ctime INTEGER,
      indexed_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tags (
      tag_id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL
    );

    CREATE TABLE IF NOT EXISTS note_tags (
      note_id TEXT NOT NULL REFERENCES notes(note_id) ON DELETE CASCADE,
      tag_id INTEGER NOT NULL REFERENCES tags(tag_id) ON DELETE CASCADE,
      source TEXT NOT NULL DEFAULT 'inline',
      PRIMARY KEY (note_id, tag_id)
    );

    CREATE TABLE IF NOT EXISTS links (
      source_id TEXT NOT NULL REFERENCES notes(note_id) ON DELETE CASCADE,
      target_raw TEXT NOT NULL,
      target_id TEXT,
      alias TEXT,
      PRIMARY KEY (source_id, target_raw)
    );

    CREATE TABLE IF NOT EXISTS frontmatter (
      note_id TEXT NOT NULL REFERENCES notes(note_id) ON DELETE CASCADE,
      fm_key TEXT NOT NULL,
      fm_value TEXT,
      PRIMARY KEY (note_id, fm_key)
    );

    CREATE TABLE IF NOT EXISTS headings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      note_id TEXT NOT NULL REFERENCES notes(note_id) ON DELETE CASCADE,
      level INTEGER NOT NULL,
      text TEXT NOT NULL,
      line INTEGER
    );

    -- Engagement tables
    CREATE TABLE IF NOT EXISTS engagement (
      note_id TEXT PRIMARY KEY REFERENCES notes(note_id) ON DELETE CASCADE,
      level TEXT NOT NULL DEFAULT 'moderate',
      modification_count INTEGER DEFAULT 0,
      last_classified TEXT
    );

    CREATE TABLE IF NOT EXISTS engagement_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      note_id TEXT NOT NULL REFERENCES notes(note_id) ON DELETE CASCADE,
      content_hash TEXT NOT NULL,
      snapshot_at TEXT NOT NULL
    );

    -- Catalyst table
    CREATE TABLE IF NOT EXISTS catalysts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT NOT NULL,
      question TEXT NOT NULL,
      context TEXT,
      note_ids TEXT,
      dismissed INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    );

    -- Metadata
    CREATE TABLE IF NOT EXISTS metadata (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    -- Indexes
    CREATE INDEX IF NOT EXISTS idx_notes_folder ON notes(folder);
    CREATE INDEX IF NOT EXISTS idx_notes_mtime ON notes(mtime);
    CREATE INDEX IF NOT EXISTS idx_note_tags_tag ON note_tags(tag_id);
    CREATE INDEX IF NOT EXISTS idx_links_target ON links(target_id);
    CREATE INDEX IF NOT EXISTS idx_links_target_raw ON links(target_raw);
    CREATE INDEX IF NOT EXISTS idx_headings_note ON headings(note_id);
    CREATE INDEX IF NOT EXISTS idx_engagement_level ON engagement(level);
    CREATE INDEX IF NOT EXISTS idx_snapshots_note ON engagement_snapshots(note_id);
    CREATE INDEX IF NOT EXISTS idx_catalysts_dismissed ON catalysts(dismissed);

    -- Full-text search via FTS5 with BM25 ranking.
    -- Used by lib/search.js. Populated alongside notes via indexParsedNote.
    CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
      note_id UNINDEXED,
      title,
      content,
      folder UNINDEXED,
      tokenize='unicode61 remove_diacritics 2'
    );

    -- Vector embeddings for semantic search.
    -- One row per note. Provider/model/dimensions are stored so the consumer
    -- can refuse to mix incompatible vectors when the user switches providers.
    CREATE TABLE IF NOT EXISTS embeddings (
      note_id TEXT PRIMARY KEY REFERENCES notes(note_id) ON DELETE CASCADE,
      embedding BLOB NOT NULL,
      model TEXT NOT NULL,
      dimensions INTEGER NOT NULL,
      content_hash TEXT,
      embedded_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_embeddings_model ON embeddings(model);
  `);

  return db;
}

// --- Prepared Statements (lazy-initialized) ---

const stmts = {};

function stmt(name, sql) {
  if (!stmts[name]) stmts[name] = getDb().prepare(sql);
  return stmts[name];
}

// --- Note Operations ---

function upsertNote(parsed) {
  stmt('upsertNote', `
    INSERT OR REPLACE INTO notes (note_id, path, title, folder, word_count, content_hash, mtime, ctime, indexed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(parsed.id, parsed.path, parsed.title, parsed.folder, parsed.wordCount,
    parsed.contentHash, parsed.mtime, parsed.ctime, new Date().toISOString());
}

function deleteNote(noteId) {
  // FTS row is independent (UNINDEXED note_id), wipe it explicitly.
  stmt('deleteFtsByNote', 'DELETE FROM notes_fts WHERE note_id = ?').run(noteId);
  stmt('deleteNote', 'DELETE FROM notes WHERE note_id = ?').run(noteId);
}

// --- FTS5 Operations ---

function upsertFts(noteId, title, content, folder) {
  // FTS5 has no ON CONFLICT, so delete + insert.
  stmt('deleteFts', 'DELETE FROM notes_fts WHERE note_id = ?').run(noteId);
  stmt('insertFts', `
    INSERT INTO notes_fts (note_id, title, content, folder) VALUES (?, ?, ?, ?)
  `).run(noteId, title || '', content || '', folder || '');
}

function deleteFts(noteId) {
  stmt('deleteFtsOnly', 'DELETE FROM notes_fts WHERE note_id = ?').run(noteId);
}

function getFtsCount() {
  return stmt('ftsCount', 'SELECT COUNT(*) as c FROM notes_fts').get().c;
}

// --- Embedding Operations ---

function upsertEmbedding(noteId, vector, model, dimensions, contentHash) {
  // Float32Array -> Buffer (4 bytes per float, little-endian)
  const buf = Buffer.from(vector.buffer, vector.byteOffset, vector.byteLength);
  stmt('upsertEmbedding', `
    INSERT OR REPLACE INTO embeddings
      (note_id, embedding, model, dimensions, content_hash, embedded_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(noteId, buf, model, dimensions, contentHash || '', new Date().toISOString());
}

function getEmbedding(noteId) {
  const row = stmt('getEmbedding', `
    SELECT embedding, model, dimensions, content_hash FROM embeddings WHERE note_id = ?
  `).get(noteId);
  if (!row) return null;
  return {
    note_id: noteId,
    vector: new Float32Array(row.embedding.buffer, row.embedding.byteOffset, row.dimensions),
    model: row.model,
    dimensions: row.dimensions,
    content_hash: row.content_hash
  };
}

function getAllEmbeddings(modelFilter = null) {
  // Returns an array of {note_id, vector, model, dimensions}.
  // If modelFilter is provided, restricts to vectors of that exact model.
  const sql = modelFilter
    ? 'SELECT note_id, embedding, model, dimensions FROM embeddings WHERE model = ?'
    : 'SELECT note_id, embedding, model, dimensions FROM embeddings';
  const rows = modelFilter
    ? getDb().prepare(sql).all(modelFilter)
    : getDb().prepare(sql).all();
  return rows.map(r => ({
    note_id: r.note_id,
    vector: new Float32Array(r.embedding.buffer, r.embedding.byteOffset, r.dimensions),
    model: r.model,
    dimensions: r.dimensions
  }));
}

function getUnembeddedNotes(limit = 100) {
  // Returns notes that either have no embedding row, or whose content_hash
  // has changed since the embedding was generated (stale).
  return getDb().prepare(`
    SELECT n.note_id, n.title, n.folder, n.content_hash
    FROM notes n
    LEFT JOIN embeddings e ON e.note_id = n.note_id
    WHERE e.note_id IS NULL OR e.content_hash != n.content_hash
    LIMIT ?
  `).all(limit);
}

function getEmbeddingStats() {
  const total = getDb().prepare('SELECT COUNT(*) as c FROM notes').get().c;
  const embedded = getDb().prepare('SELECT COUNT(*) as c FROM embeddings').get().c;
  const fresh = getDb().prepare(`
    SELECT COUNT(*) as c FROM embeddings e
    JOIN notes n ON n.note_id = e.note_id
    WHERE e.content_hash = n.content_hash
  `).get().c;
  const models = getDb().prepare(`
    SELECT model, COUNT(*) as c FROM embeddings GROUP BY model ORDER BY c DESC
  `).all();
  return {
    total,
    embedded,
    fresh,
    stale: embedded - fresh,
    models
  };
}

function deleteEmbedding(noteId) {
  stmt('deleteEmbedding', 'DELETE FROM embeddings WHERE note_id = ?').run(noteId);
}

function rebuildFts(getNoteContent) {
  // Wipe and re-populate FTS from notes table. Caller supplies a function
  // (noteId) -> rawContent so we don't have to keep raw content in the DB.
  const handle = getDb();
  const all = handle.prepare('SELECT note_id, title, folder FROM notes').all();
  handle.prepare('DELETE FROM notes_fts').run();
  let written = 0;
  const txn = handle.transaction((rows) => {
    for (const row of rows) {
      const content = getNoteContent ? getNoteContent(row.note_id) : '';
      upsertFts(row.note_id, row.title, content, row.folder);
      written++;
    }
  });
  txn(all);
  return { total: all.length, written };
}

function getNoteHash(noteId) {
  const row = stmt('getNoteHash', 'SELECT content_hash FROM notes WHERE note_id = ?').get(noteId);
  return row ? row.content_hash : null;
}

function getNoteCount() {
  return stmt('noteCount', 'SELECT COUNT(*) as count FROM notes').get().count;
}

// --- Tag Operations ---

function getOrCreateTag(name) {
  const existing = stmt('getTag', 'SELECT tag_id FROM tags WHERE name = ?').get(name);
  if (existing) return existing.tag_id;
  return stmt('insertTag', 'INSERT INTO tags (name) VALUES (?)').run(name).lastInsertRowid;
}

function setNoteTags(noteId, tags) {
  stmt('clearNoteTags', 'DELETE FROM note_tags WHERE note_id = ?').run(noteId);
  const insert = stmt('insertNoteTag', 'INSERT OR IGNORE INTO note_tags (note_id, tag_id, source) VALUES (?, ?, ?)');
  for (const tag of tags) {
    const tagId = getOrCreateTag(tag.name);
    insert.run(noteId, tagId, tag.source);
  }
}

// --- Link Operations ---

function setNoteLinks(noteId, links, allNoteIds) {
  stmt('clearNoteLinks', 'DELETE FROM links WHERE source_id = ?').run(noteId);
  const insert = stmt('insertLink', 'INSERT OR IGNORE INTO links (source_id, target_raw, target_id, alias) VALUES (?, ?, ?, ?)');

  for (const link of links) {
    const targetId = resolveLink(link.target, allNoteIds);
    insert.run(noteId, link.target, targetId, link.alias);
  }
}

// Brute-force link resolution -- iterates all note IDs.
// Fine for vaults <10k notes, might want to build a lookup map for larger ones.
function resolveLink(target, allNoteIds) {
  // Normalize: add .md if missing
  const withMd = target.endsWith('.md') ? target : target + '.md';
  const lower = withMd.toLowerCase();

  // Exact match
  if (allNoteIds.has(lower)) return lower;

  // Case-insensitive filename match
  for (const id of allNoteIds) {
    const basename = path.basename(id);
    if (basename.toLowerCase() === path.basename(lower)) return id;
  }

  // Partial path match (end of path)
  for (const id of allNoteIds) {
    if (id.toLowerCase().endsWith(lower)) return id;
  }

  return null; // Broken link
}

// --- Frontmatter Operations ---

function setNoteFrontmatter(noteId, fm) {
  stmt('clearFM', 'DELETE FROM frontmatter WHERE note_id = ?').run(noteId);
  const insert = stmt('insertFM', 'INSERT OR IGNORE INTO frontmatter (note_id, fm_key, fm_value) VALUES (?, ?, ?)');
  for (const [key, value] of Object.entries(fm)) {
    if (key === 'tags' || key === 'tag') continue; // Tags handled separately
    const strValue = Array.isArray(value) ? value.join(', ') : String(value);
    insert.run(noteId, key, strValue);
  }
}

// --- Heading Operations ---

function setNoteHeadings(noteId, headings) {
  stmt('clearHeadings', 'DELETE FROM headings WHERE note_id = ?').run(noteId);
  const insert = stmt('insertHeading', 'INSERT INTO headings (note_id, level, text, line) VALUES (?, ?, ?, ?)');
  for (const h of headings) {
    insert.run(noteId, h.level, h.text, h.line);
  }
}

// --- Engagement Snapshot ---

function recordSnapshot(noteId, contentHash) {
  const existing = stmt('lastSnapshot', `
    SELECT content_hash FROM engagement_snapshots
    WHERE note_id = ? ORDER BY snapshot_at DESC LIMIT 1
  `).get(noteId);

  // Only record if content actually changed
  if (!existing || existing.content_hash !== contentHash) {
    stmt('insertSnapshot', `
      INSERT INTO engagement_snapshots (note_id, content_hash, snapshot_at) VALUES (?, ?, ?)
    `).run(noteId, contentHash, new Date().toISOString());
  }
}

// --- Metadata ---

function setMeta(key, value) {
  stmt('setMeta', 'INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)').run(key, value);
}

function getMeta(key) {
  const row = stmt('getMeta', 'SELECT value FROM metadata WHERE key = ?').get(key);
  return row ? row.value : null;
}

// --- Full Note Index ---

function indexParsedNote(parsed, allNoteIds, rawContent) {
  const txn = getDb().transaction(() => {
    upsertNote(parsed);
    setNoteTags(parsed.id, parsed.tags);
    setNoteLinks(parsed.id, parsed.links, allNoteIds);
    setNoteFrontmatter(parsed.id, parsed.frontmatter);
    setNoteHeadings(parsed.id, parsed.headings);
    recordSnapshot(parsed.id, parsed.contentHash);
    // Optional: feed raw content into FTS5. Only if caller passed it -
    // backward compatible with code that doesn't have content available.
    if (typeof rawContent === 'string' && rawContent.length > 0) {
      upsertFts(parsed.id, parsed.title, rawContent, parsed.folder);
    }
  });
  txn();
}

function closeDatabase() {
  if (db) {
    db.close();
    db = null;
    // Clear cached statements
    for (const key of Object.keys(stmts)) delete stmts[key];
  }
}

module.exports = {
  initDatabase,
  getDb,
  upsertNote,
  deleteNote,
  getNoteHash,
  getNoteCount,
  getOrCreateTag,
  setNoteTags,
  setNoteLinks,
  setNoteFrontmatter,
  setNoteHeadings,
  recordSnapshot,
  indexParsedNote,
  setMeta,
  getMeta,
  closeDatabase,
  upsertFts,
  deleteFts,
  rebuildFts,
  getFtsCount,
  upsertEmbedding,
  getEmbedding,
  getAllEmbeddings,
  getUnembeddedNotes,
  getEmbeddingStats,
  deleteEmbedding
};
