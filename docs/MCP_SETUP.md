# MCP Setup

`obsidian-intelligence` ships an MCP (Model Context Protocol) server that exposes
**13 tools** for graph analysis, full-text search, semantic search, and hybrid
RRF search over your Obsidian vault. Any MCP-capable client can use it.

## Prerequisites

1. Install globally:
   ```bash
   npm install -g obsidian-intelligence
   ```
2. Index your vault once:
   ```bash
   VAULT_PATH=/path/to/your/vault vault-intelligence index
   ```
3. Verify the MCP server starts:
   ```bash
   VAULT_PATH=/path/to/your/vault node $(npm root -g)/obsidian-intelligence/mcp-server.mjs
   ```
   It should print nothing and wait on stdio. Press Ctrl+C.

## Available tools

| # | Tool | Purpose |
|---|------|---------|
| 1 | `vault_status` | Quick stats: notes, tags, links, embeddings |
| 2 | `vault_snapshot` | Full snapshot: engagement + graph + activity |
| 3 | `find_orphans` | Notes with no incoming/outgoing links and no tags |
| 4 | `find_hubs` | Most connected notes |
| 5 | `find_backlinks` | Notes linking *to* a given note |
| 6 | `find_related` | Related via shared tags/links |
| 7 | `get_tag_cloud` | All tags with counts |
| 8 | `find_notes_by_tag` | Notes carrying a specific tag |
| 9 | `engagement_stats` | active/moderate/dormant/archived + revival candidates |
| 10 | `list_catalysts` | Open AI-generated thought-prompts |
| 11 | `search_content` | BM25 full-text search (FTS5) |
| 12 | `find_similar` | Semantic similarity for a given note (vectors) |
| 13 | `semantic_search` | Free-text semantic search |
| 14 | `hybrid_search` | RRF re-ranking of FTS + semantic |

> Tools 11–14 require the database to be indexed. Tools 12–14 additionally
> require an embeddings provider to be configured. See
> [PROVIDERS.md](PROVIDERS.md).

## Client setup

### Claude Desktop

Edit your `claude_desktop_config.json`:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- Linux: `~/.config/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "obsidian-intelligence": {
      "command": "node",
      "args": ["/absolute/path/to/obsidian-intelligence/mcp-server.mjs"],
      "env": {
        "VAULT_PATH": "/absolute/path/to/your/vault"
      }
    }
  }
}
```

Restart Claude Desktop. The 14 tools appear in the MCP picker.

### Claude Code

Add to `.mcp.json` in your project (or globally):

```json
{
  "mcpServers": {
    "obsidian-intelligence": {
      "command": "node",
      "args": ["/absolute/path/to/obsidian-intelligence/mcp-server.mjs"],
      "env": {
        "VAULT_PATH": "/absolute/path/to/your/vault"
      }
    }
  }
}
```

Then `/mcp` in Claude Code to verify the connection.

### Cursor

In Cursor settings → MCP, add:

```json
{
  "obsidian-intelligence": {
    "command": "node",
    "args": ["/absolute/path/to/obsidian-intelligence/mcp-server.mjs"],
    "env": { "VAULT_PATH": "/absolute/path/to/your/vault" }
  }
}
```

### Open WebUI / generic MCP clients

Any client that speaks MCP over stdio can launch the server with the command
above. Pass `VAULT_PATH` (and optionally provider env vars — see
[PROVIDERS.md](PROVIDERS.md)) via the `env` block.

## Optional: enable semantic + hybrid search

Add embeddings env vars to the `env` block:

```json
"env": {
  "VAULT_PATH": "/path/to/vault",
  "EMBEDDINGS_PROVIDER": "ollama"
}
```

Then re-index to populate embeddings:

```bash
EMBEDDINGS_PROVIDER=ollama VAULT_PATH=/path/to/vault vault-intelligence index
```

Tools 12–14 will then return results.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| MCP client says "no tools" | Verify the absolute path to `mcp-server.mjs` and that `VAULT_PATH` is set in `env` |
| Tools list shows but every call returns errors | Run `vault-intelligence index` first |
| `find_similar` / `semantic_search` empty | No embeddings provider configured — see [PROVIDERS.md](PROVIDERS.md) |
| "database is locked" | Close any other process indexing the same vault |
| Permission denied on Windows | Use forward slashes `/` in JSON paths, or escape backslashes `\\` |
