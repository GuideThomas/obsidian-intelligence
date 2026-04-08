# Privacy

`obsidian-intelligence` is built around one principle: **your vault is yours.**
This document spells out exactly what data leaves your machine, and when.

## TL;DR

- **No telemetry. Ever.** The tool makes zero network calls of its own.
- **The default install (no providers) is 100 % offline.**
- **Network calls only happen if you explicitly configure a provider** for LLM
  catalysts/enrichment or embeddings — and only to the URL you configured.
- **No analytics, no crash reporting, no update checks.**
- **MIT-licensed and open source.** You can audit every line.

## What runs locally, always

These features never make network calls:

- File system / CouchDB indexing
- SQLite database (`vault-intelligence.db`)
- Graph analysis (orphans, hubs, backlinks, related, tag cloud)
- Engagement metrics (active / dormant / revival candidates)
- Full-text search (FTS5 / BM25)
- HTML report generation
- All MCP graph and FTS tools

## What can talk to a network — and only if you configure it

### LLM provider (catalysts + enrichment)

| If `LLM_PROVIDER=` | Network destination |
|---|---|
| `none` (or unset, and Ollama not detected) | **Nothing.** Catalysts/enrichment disabled. |
| `auto` + Ollama running locally | `http://localhost:11434` only |
| `ollama` | The `OLLAMA_HOST` you set (default `localhost:11434`) |
| `openai` | The exact `LLM_API_URL` you set |

**What is sent:** for catalysts, only **structural metadata** (titles, tag
counts, link counts) — never note bodies. For enrichment (opt-in, off by
default in MCP mode), the note body of the specific note being enriched.

### Embeddings provider (semantic search)

| If `EMBEDDINGS_PROVIDER=` | Network destination |
|---|---|
| `none` (or unset, and Ollama not detected) | **Nothing.** Semantic search disabled. |
| `auto` + Ollama running locally | `http://localhost:11434` only |
| `ollama` | The `OLLAMA_HOST` you set |
| `gemini` | `https://generativelanguage.googleapis.com` |
| `openai` | The exact `LLM_API_URL` / `EMBEDDINGS_API_URL` you set |

**What is sent:** the **plain text content of each note** during indexing, so
the provider can compute its embedding vector. Embeddings are then stored in
your local SQLite database — the provider never sees them again.

> If this matters to you (and it should, for sensitive vaults), use the
> **Ollama** embeddings adapter. It runs entirely on your machine and the text
> never leaves localhost.

## What is never sent, ever

- Your full vault to any cloud service in bulk
- Note content during catalyst generation (only structural metadata)
- File paths beyond the file currently being processed
- Authentication credentials, beyond the API key you configured for the
  provider you chose
- Anything to a domain owned by the maintainer

## How to verify

You can verify the network behavior yourself:

1. **Run with no providers configured.** Confirm the tool indexes, searches,
   and reports without any outgoing network traffic.
   ```bash
   LLM_PROVIDER=none EMBEDDINGS_PROVIDER=none vault-intelligence index
   ```

2. **Audit the source.** Provider adapters live in
   `lib/adapters/llm/` and `lib/adapters/embeddings/`. Each adapter has exactly
   one function that does HTTP, and it points at the URL from your config.

3. **Sniff the traffic.** With a tool like Little Snitch, mitmproxy, or
   `tcpdump`, confirm that with `*_PROVIDER=none` there are zero outgoing
   connections beyond DNS lookups Node.js makes for `localhost`.

## MCP server privacy

When you connect the MCP server to Claude Desktop, Claude Code, Cursor, or any
other MCP client, **the client decides which tools to call** and which results
to send to its model. That is governed by the privacy policy of *that* client,
not this project. Read it.

This project's MCP server only does what its tools say they do. It does not
report tool invocations, results, or usage anywhere.

## Reporting privacy issues

If you find a network call that this document doesn't explain, please open a
GitHub issue immediately, or email **mail@thomaswinkler.art**. Privacy bugs are
treated as critical.
