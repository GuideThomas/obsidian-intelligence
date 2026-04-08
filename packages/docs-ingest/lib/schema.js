// Schema additions for the docs-ingest subpackage. Created lazily on first
// use so the core obsidian-intelligence package can stay slim - users who
// don't install obsidian-intelligence-docs never see these tables.

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS documents (
    doc_id TEXT PRIMARY KEY,
    file_path TEXT,
    file_name TEXT NOT NULL,
    file_hash TEXT NOT NULL,
    mime_type TEXT,
    page_count INTEGER DEFAULT 0,
    total_chunks INTEGER DEFAULT 0,
    title TEXT,
    summary TEXT,
    ingested_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_documents_hash ON documents(file_hash);

  CREATE TABLE IF NOT EXISTS document_chunks (
    chunk_id TEXT PRIMARY KEY,
    doc_id TEXT NOT NULL REFERENCES documents(doc_id) ON DELETE CASCADE,
    seq INTEGER NOT NULL,
    page_start INTEGER,
    page_end INTEGER,
    content TEXT NOT NULL,
    token_count INTEGER DEFAULT 0,
    UNIQUE(doc_id, seq)
  );

  CREATE INDEX IF NOT EXISTS idx_chunks_doc ON document_chunks(doc_id);

  CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
    chunk_id UNINDEXED,
    doc_id UNINDEXED,
    title,
    content,
    tokenize='unicode61 remove_diacritics 2'
  );

  CREATE TABLE IF NOT EXISTS chunk_embeddings (
    chunk_id TEXT PRIMARY KEY REFERENCES document_chunks(chunk_id) ON DELETE CASCADE,
    embedding BLOB NOT NULL,
    model TEXT NOT NULL,
    dimensions INTEGER NOT NULL,
    embedded_at TEXT NOT NULL
  );
`;

function ensureDocsSchema(db) {
  // Multiple statements via prepare-many is not supported by better-sqlite3,
  // but the .exec method on the DB object accepts multi-statement SQL.
  const runner = db.exec.bind(db);
  runner(SCHEMA_SQL);
}

module.exports = { ensureDocsSchema };
