# Changelog

## 1.1.0 (unreleased)

The MCP-first release. Adds semantic search, hybrid search, LLM enrichment,
provider abstraction for any LLM/embeddings backend, and an optional document
ingestion subpackage.

### Added

- **MCP server: 13 tools** (was 10). New tools:
  - `search_content` — FTS5 full-text search with BM25 ranking and snippets
  - `find_similar` — vector similarity (semantic) by note id
  - `semantic_search` — vector similarity (semantic) by query string
  - `hybrid_search` — keyword + semantic via Reciprocal Rank Fusion (RRF)
- **FTS5 full-text search** (`vault-intelligence search "query"`)
  - Phrases, AND/OR/NOT, folder/tag filters
  - Falls back to literal phrase on FTS5 syntax errors
  - `index --rebuild-fts` to migrate from 1.0 databases
- **Semantic search via vector embeddings**
  - `vault-intelligence embed run|stats|similar|search`
  - Vectors stored as Float32Array BLOBs in SQLite
  - Pure-JS cosine similarity (no extension needed, scales to ~50k notes)
  - Refuses to mix vectors of different dimensions/models
- **Hybrid search via RRF (k=60)** combining FTS and semantic results
  - `vault-intelligence search --hybrid "query"`
  - Falls back to keyword-only when no embeddings provider is available
- **LLM enrichment** (`vault-intelligence enrich run`)
  - Extracts category, summary, entities, language per note
  - Robust JSON parser handles markdown fences, leading prose, missing fields
  - Surfaces the privacy implication explicitly in the CLI
- **Provider abstraction (`lib/adapters/`)**
  - LLM adapters: OpenAI-compatible, Ollama (local), None
  - Embeddings adapters: OpenAI, Gemini (free tier), Ollama, None
  - Auto-detection: `LLM_API_KEY` set => OpenAI, otherwise None
  - One OpenAI key unlocks both LLM and embeddings features
- **`vault-intelligence proactive [summary|active|revival]`**
  - Compact "what to look at right now" view
- **Document ingestion subpackage** (`packages/docs-ingest/`)
  - Published as `obsidian-intelligence-docs` (separate npm package)
  - Pure-Node text/markdown/html ingestion in v0.1
  - PDF and DOCX support coming in v0.2 via peer dependencies
  - Word-aware chunker with paragraph -> sentence -> hard-split fallback
  - Lazy schema (creates `documents`/`document_chunks`/`chunks_fts` on first use)
- **Snapshot v1.1**: now includes `indexes` section reporting FTS, embeddings,
  and enrichment stats. Backwards-compatible with 1.0 databases (null fields).

### Changed

- `package.json`: workspaces, expanded keywords (mcp, claude-code, openwebui,
  rag, etc.), files whitelist, real author email
- `mcp-server.mjs` version bumped to 1.1.0
- `vault-intelligence test` and `vault-intelligence status` now report the
  configured LLM/embeddings provider and FTS index size

### Migration from 1.0

If you have a database from 1.0:
1. Upgrade: `npm install -g obsidian-intelligence@1.1.0`
2. Run `vault-intelligence index --rebuild-fts` once to populate the new
   FTS index from existing notes
3. Optional: configure an embeddings provider and run `embed run`
4. Optional: configure an LLM provider and run `enrich run`

No data is lost. The 1.0 schema is a strict subset of 1.1.

### Tests

- 255 passing (was 122 in 1.0)

## 1.0.0 (2026-02-16)

First public release.

- Filesystem adapter as default source
- CouchDB adapter for LiveSync users
- HTML report with Chart.js visualizations
- MCP server (10 tools)
- Test suite (vitest, 122 tests)

## 0.3.0 (2026-02-10)

- HTML report generator (dark theme, embedded charts)
- Engagement thresholds now configurable via env vars
- Revival candidates in snapshot output

## 0.2.0 (2026-02-05)

- CouchDB adapter for Obsidian LiveSync
- MCP server (first working version)
- Watch mode for both filesystem and CouchDB
- Catalyst generation with any OpenAI-compatible API

## 0.1.0 (2026-01-28)

- Initial prototype
- Filesystem indexing, SQLite storage
- Basic graph queries (orphans, hubs, backlinks, tags)
- Engagement classification
