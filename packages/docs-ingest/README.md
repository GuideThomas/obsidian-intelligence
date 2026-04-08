# obsidian-intelligence-docs

> Optional document ingestion subpackage for [obsidian-intelligence](https://github.com/GuideThomas/obsidian-intelligence).

This package extends the core `obsidian-intelligence` SQLite database with a `documents` and `document_chunks` store, so you can ingest external files (txt, markdown, html — pdf/docx coming in v0.2) alongside your vault notes and search them through the same MCP tools.

## Why a separate package?

- **The core package stays slim.** Most users want vault analysis only — they don't need PDF parsing libraries pulling in 50 MB of dependencies.
- **Optional dependencies are explicit.** When v0.2 adds PDF support, `pdfjs-dist` lives here, not in the core install.
- **Same database.** The two packages share the same SQLite file via the `VAULT_INTEL_DB` environment variable. Hybrid search in the core package automatically picks up document chunks if the tables exist.

## Installation

```bash
npm install -g obsidian-intelligence obsidian-intelligence-docs
```

## Usage

```bash
# Make sure the core package is set up first
export VAULT_INTEL_DB=/path/to/your/vault-intelligence.db

# Ingest a single document
obsidian-intelligence-docs ingest ~/Documents/article.md

# Re-ingest (force, even if file hash is unchanged)
obsidian-intelligence-docs ingest article.html --force

# List ingested documents
obsidian-intelligence-docs list
```

## Supported file types (v0.1)

| Extension | Status |
|---|---|
| `.txt` | Yes |
| `.md`, `.markdown` | Yes |
| `.html`, `.htm` | Yes (basic tag stripping) |
| `.pdf` | **v0.2** (via pdfjs-dist) |
| `.docx` | **v0.2** (via mammoth) |

## How chunking works

Documents are split into ~800-token chunks at paragraph boundaries (with sentence-level fallback for long paragraphs). 100 tokens of overlap between consecutive chunks preserves context across boundaries. Each chunk lands in `document_chunks` and the FTS5 index `chunks_fts`.

## Schema

The first time you run `ingest`, the package creates these tables in your existing SQLite file:

- `documents` — file metadata (path, hash, title, chunk count)
- `document_chunks` — text chunks with sequence numbers
- `chunks_fts` — FTS5 virtual table for keyword search
- `chunk_embeddings` — vector embeddings (populated by future hybrid-search integration)

## License

MIT — same as the core package.
