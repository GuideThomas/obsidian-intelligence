# Architecture

A short tour of how `obsidian-intelligence` is wired internally. If you want
to contribute or just understand what happens when you run `index`, start here.

## High-level view

```
                    ┌───────────────────────────┐
                    │     MCP clients           │
                    │  (Claude Desktop, Code,   │
                    │   Cursor, Open WebUI, …)  │
                    └─────────────┬─────────────┘
                                  │ stdio / MCP
                    ┌─────────────▼─────────────┐
                    │       mcp-server.mjs      │
                    │      (14 tools)           │
                    └─────────────┬─────────────┘
                                  │
        ┌─────────────────────────┼─────────────────────────┐
        │                         │                         │
┌───────▼───────┐        ┌────────▼────────┐       ┌────────▼────────┐
│  lib/graph.js │        │ lib/search.js   │       │ lib/embeddings  │
│  lib/engage…  │        │ lib/database.js │       │ lib/enrichment  │
│  lib/catalyst │        │  (SQLite + FTS5)│       │                 │
└───────┬───────┘        └────────┬────────┘       └────────┬────────┘
        │                         │                         │
        └─────────────────────────┼─────────────────────────┘
                                  │
                       ┌──────────▼──────────┐
                       │ lib/adapters/       │
                       │ ├── sources/        │  filesystem | couchdb
                       │ ├── llm/            │  openai | ollama | none
                       │ └── embeddings/     │  openai | gemini | ollama | none
                       └──────────┬──────────┘
                                  │
                        ┌─────────▼─────────┐
                        │   Your vault      │
                        │  (files or DB)    │
                        └───────────────────┘
```

## Layers

### 1. Source adapters (`lib/adapters/sources/`)
Abstract the vault location. Two implementations:
- **`filesystem.js`** — reads `.md` files directly from disk
- **`couchdb.js`** — reads from an Obsidian LiveSync CouchDB

Both expose the same interface: `iterateNotes()`, `watchNotes()`. Adding a
third source means adding a file here and registering it in
`adapters/sources/index.js` — no other code changes.

### 2. Storage (`lib/database.js`)
Single SQLite file (`vault-intelligence.db`), schema managed lazily:
- `notes` — parsed frontmatter + body, indexed by content hash
- `notes_fts` — FTS5 virtual table for BM25 search
- `tags`, `links` — normalized relations for graph analysis
- `embeddings` — Float32Array BLOBs (dimensions enforced per row)
- `enrichments` — category/summary/entities/language per note
- `catalysts` — open AI-generated questions

Re-indexing is **incremental**: `content_hash` changes only when a note's
body actually changes, so embedding and enrichment costs are paid once.

### 3. Analysis (`lib/graph.js`, `lib/engagement.js`, `lib/catalyst.js`)
Pure SQL + Node. No external services.
- Graph: orphans, hubs, backlinks, related, broken links, tag cloud
- Engagement: active / moderate / dormant / archived buckets, revival candidates
- Catalysts: sends **structural metadata only** (titles + tag/link counts) to
  an LLM adapter; bodies stay local

### 4. Search (`lib/search.js`, `lib/embeddings.js`)
Three modes, composable:
- **Keyword (FTS5):** BM25 over `notes_fts`, with phrases/AND/OR/NOT
- **Semantic:** cosine similarity over SQLite-stored vectors, pure-JS, scales
  to ~50k notes without a native extension
- **Hybrid (RRF):** merges keyword + semantic results via
  Reciprocal Rank Fusion (`k=60`), falls back to keyword-only if no
  embeddings provider is configured

### 5. Provider adapters (`lib/adapters/llm/`, `lib/adapters/embeddings/`)
Each adapter implements a narrow interface:
- LLM: `async chat({ messages, temperature, max_tokens, returnMeta })`
- Embeddings: `async embed(texts, taskType)`

Four LLM backends (auto / openai-compatible / ollama / none) and four
embeddings backends (auto / openai / gemini / ollama / none). Auto-detection
checks `localhost:11434` and falls back to `none` — meaning **the tool works
offline with zero providers**.

### 6. MCP server (`mcp-server.mjs`)
Single file. Exposes 14 tools over **stdio** using
`@modelcontextprotocol/sdk`. Each tool is a thin wrapper around one of the
analysis/search modules — no business logic lives in the MCP layer.

### 7. CLI (`vault-intelligence.js`)
Commander-style CLI. Shares all business logic with the MCP server by
importing the same `lib/` modules. Anything the CLI can do, the MCP tools can
do, and vice versa.

### 8. Report (`lib/report.js`)
Self-contained HTML with Chart.js (loaded from CDN at view time, not bundled).
Dark theme, health score, all graph and engagement metrics in one document.

## Design principles

1. **MCP-first.** The CLI and the MCP server are peers, not one wrapping the
   other. Both import `lib/` directly.
2. **Local-by-default.** No network call unless the user explicitly configured
   a provider. See [PRIVACY.md](PRIVACY.md).
3. **Provider-agnostic.** No vendor is hardcoded. The user picks.
4. **Incremental.** `content_hash` drives re-indexing; stable content never
   re-pays embedding/enrichment cost.
5. **Pure Node.** The only native dep is `better-sqlite3`. Everything else —
   including vector similarity — is pure JavaScript.
6. **Optional heavy features.** Document ingestion (PDF/DOCX) lives in a
   separate subpackage (`packages/docs-ingest/`) so casual users don't pay for
   deps they don't need.
7. **Tested.** 255 tests across 15 suites. CI on Node 18/20/22 ×
   Linux/macOS/Windows.

## Where to look first when contributing

| You want to… | Start in |
|---|---|
| Add a new source (Notion, Logseq, etc.) | `lib/adapters/sources/` |
| Add a new LLM/embeddings provider | `lib/adapters/llm/` or `lib/adapters/embeddings/` |
| Add a new MCP tool | `mcp-server.mjs` + the corresponding `lib/` module |
| Change the search ranking | `lib/search.js` |
| Add a graph metric | `lib/graph.js` |
| Change the report layout | `lib/report.js` |
| Add a database column | `lib/database.js` (watch the migration path!) |

See [CONTRIBUTING.md](../CONTRIBUTING.md) for dev setup and PR guidelines.
