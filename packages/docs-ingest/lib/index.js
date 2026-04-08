// obsidian-intelligence-docs - main entry point.
//
// Pure-Node text/markdown/html ingestion. PDF and DOCX support is planned
// for v0.2 (will use peerDependencies on pdfjs-dist and mammoth so the
// core install stays slim).

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');

const { ensureDocsSchema } = require('./schema');
const { chunkText } = require('./chunker');

const SUPPORTED_EXTENSIONS = ['.txt', '.md', '.markdown', '.html', '.htm'];

function isSupported(filePath) {
  return SUPPORTED_EXTENSIONS.includes(path.extname(filePath).toLowerCase());
}

function extractText(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const raw = fs.readFileSync(filePath, 'utf8');

  if (ext === '.html' || ext === '.htm') {
    // Strip tags. For richer extraction, users can install jsdom themselves
    // and pre-process. Keeping zero deps here is the whole point.
    return raw
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // .txt, .md, .markdown
  return raw;
}

function fileHash(filePath) {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function ingestFile(dbPath, filePath, options = {}) {
  if (!isSupported(filePath)) {
    throw new Error(`Unsupported file type: ${path.extname(filePath)}. ` +
      `Currently supported: ${SUPPORTED_EXTENSIONS.join(', ')}. ` +
      `PDF/DOCX coming in v0.2.`);
  }
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  ensureDocsSchema(db);

  const fileName = path.basename(filePath);
  const hash = fileHash(filePath);
  const docId = crypto.createHash('sha1').update(filePath).digest('hex').slice(0, 16);

  // Skip re-ingest if hash matches
  const existing = db.prepare('SELECT file_hash FROM documents WHERE doc_id = ?').get(docId);
  if (existing && existing.file_hash === hash && !options.force) {
    db.close();
    return { docId, skipped: true, reason: 'unchanged', chunks: 0 };
  }

  const text = extractText(filePath);
  const chunks = chunkText(text, {
    maxTokens: options.maxTokens || 800,
    overlapTokens: options.overlapTokens || 100
  });

  const now = new Date().toISOString();
  const title = options.title || path.basename(filePath, path.extname(filePath));

  const txn = db.transaction(() => {
    // Wipe old chunks if re-ingesting
    db.prepare('DELETE FROM document_chunks WHERE doc_id = ?').run(docId);
    db.prepare('DELETE FROM chunks_fts WHERE doc_id = ?').run(docId);

    db.prepare(`
      INSERT OR REPLACE INTO documents
        (doc_id, file_path, file_name, file_hash, mime_type, page_count,
         total_chunks, title, summary, ingested_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      docId, filePath, fileName, hash,
      'text/plain', 0, chunks.length, title, null,
      existing ? existing.ingested_at || now : now,
      now
    );

    const insertChunk = db.prepare(`
      INSERT INTO document_chunks (chunk_id, doc_id, seq, content, token_count)
      VALUES (?, ?, ?, ?, ?)
    `);
    const insertFts = db.prepare(`
      INSERT INTO chunks_fts (chunk_id, doc_id, title, content) VALUES (?, ?, ?, ?)
    `);

    for (const c of chunks) {
      const chunkId = `${docId}-${c.seq}`;
      insertChunk.run(chunkId, docId, c.seq, c.content, c.tokenCount);
      insertFts.run(chunkId, docId, title, c.content);
    }
  });
  txn();

  db.close();
  return { docId, skipped: false, chunks: chunks.length, title };
}

function listDocuments(dbPath) {
  const db = new Database(dbPath, { readonly: true });
  ensureDocsSchema(db); // safe even on readonly opened then re-opened
  const rows = db.prepare(`
    SELECT doc_id, file_name, file_path, total_chunks, title, ingested_at
    FROM documents ORDER BY ingested_at DESC
  `).all();
  db.close();
  return rows;
}

module.exports = {
  ingestFile,
  listDocuments,
  isSupported,
  SUPPORTED_EXTENSIONS,
  extractText,
  chunkText
};
