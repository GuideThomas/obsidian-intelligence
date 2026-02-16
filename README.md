# Obsidian Intelligence

Structural analysis and engagement tracking for [Obsidian](https://obsidian.md) vaults.

I built this because I wanted to understand my ~800 note Obsidian vault better. Which notes are orphaned? Which ones are hubs that everything links to? What did I write 6 months ago that I completely forgot about but is actually well-connected?

It indexes your vault into a local SQLite database and gives you graph queries, engagement classification, and an MCP server so your AI assistant can answer questions about your vault structure.

## What it does

- **Graph queries** -- orphans, hubs, backlinks, broken links, tag cloud, related notes
- **Engagement tracking** -- classifies notes as active/moderate/dormant/archived based on when you last touched them
- **AI catalyst questions** -- optionally uses an LLM to generate questions about dormant but well-connected notes (no note content is sent, only structural metadata)
- **HTML reports** -- self-contained vault health report with charts
- **MCP server** -- expose analysis tools to Claude, ChatGPT, etc. via [Model Context Protocol](https://modelcontextprotocol.io)
- **Watch mode** -- re-indexes on file changes
- **CouchDB support** -- for [Obsidian LiveSync](https://github.com/vrtmrz/obsidian-livesync) users

### What it doesn't do

- It doesn't read or send your note *content* anywhere (except to the optional LLM, and even then only titles/tags/structure)
- It doesn't modify your vault -- the SQLite DB is the only thing it writes
- It's not a plugin -- it runs outside Obsidian as a CLI tool

## Quick Start

```bash
# Install globally
npm install -g obsidian-intelligence

# Index your vault
vault-intelligence index --vault /path/to/your/vault

# View status
vault-intelligence status

# Generate an HTML report
vault-intelligence report --open
```

Or use environment variables:

```bash
export VAULT_PATH=/path/to/your/vault
vault-intelligence index
```

## CLI Reference

### Indexing

```bash
vault-intelligence index [--force] [--vault <path>]   # Full index
vault-intelligence status                              # Show statistics
vault-intelligence test                                # Test connections
```

### Graph Queries

```bash
vault-intelligence graph orphans            # Notes without links or tags
vault-intelligence graph hubs [n]           # Top N connected notes
vault-intelligence graph backlinks <note>   # Who links to this note?
vault-intelligence graph links <note>       # Where does this note link?
vault-intelligence graph tags [filter]      # Tag cloud with counts
vault-intelligence graph tag <tag>          # All notes with this tag
vault-intelligence graph related <note>     # Related notes
vault-intelligence graph broken             # Broken links
```

### Engagement

```bash
vault-intelligence engagement [level]    # Filter by level (active|moderate|dormant|archived)
vault-intelligence engagement stats      # Distribution summary
```

### AI Catalysts

Requires an OpenAI-compatible LLM endpoint (see [Configuration](#configuration)).

```bash
vault-intelligence catalyst generate [n]   # Generate n questions (default: 3)
vault-intelligence catalyst list           # Show open questions
vault-intelligence catalyst dismiss <id>   # Dismiss a question
```

### Reports & Snapshots

```bash
vault-intelligence report [--output <file>] [--open]   # HTML report
vault-intelligence snapshot [path]                      # JSON snapshot
```

### Watch Mode

```bash
vault-intelligence watch   # Watch for vault changes and re-index
```

### Global Options

| Flag | Description |
|------|-------------|
| `--vault <path>` | Path to Obsidian vault (overrides `VAULT_PATH`) |
| `--db <path>` | Database path (overrides `VAULT_INTEL_DB`) |
| `--lang <en\|de>` | Language for AI content (default: `en`) |
| `--force` | Force re-index all notes |
| `--output <file>` | Output file for report |
| `--open` | Open report in browser |

## MCP Server Setup

The MCP server exposes vault analysis as tools for AI assistants.

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "obsidian-intelligence": {
      "command": "node",
      "args": ["/path/to/obsidian-intelligence/mcp-server.mjs"],
      "env": {
        "VAULT_PATH": "/path/to/your/vault"
      }
    }
  }
}
```

### Available MCP Tools

| Tool | Description |
|------|-------------|
| `vault_status` | Quick vault overview (note count, tags, links, DB size) |
| `vault_snapshot` | Full JSON snapshot of vault state |
| `find_orphans` | Notes without incoming links or tags |
| `find_hubs` | Most connected notes in the vault |
| `find_backlinks` | Notes linking to a specific note |
| `find_related` | Related notes by shared tags and links |
| `get_tag_cloud` | Tag usage statistics |
| `find_notes_by_tag` | All notes with a specific tag |
| `engagement_stats` | Engagement level distribution |
| `list_catalysts` | Open AI-generated catalyst questions |

## Configuration

Configuration is via environment variables or a `.env` file in the project directory.

### Required

| Variable | Description |
|----------|-------------|
| `VAULT_PATH` | Path to your Obsidian vault |

### Optional

| Variable | Default | Description |
|----------|---------|-------------|
| `VAULT_INTEL_DB` | `<vault>/.vault-intelligence.db` | SQLite database path |
| `VAULT_SOURCE` | `filesystem` | Source type (`filesystem` or `couchdb`) |
| `LLM_API_URL` | `https://api.openai.com/v1` | OpenAI-compatible API URL |
| `LLM_MODEL` | `gpt-4o-mini` | Model name |
| `LLM_API_KEY` | - | API key for LLM |
| `VAULT_INTEL_LANG` | `en` | Language for AI content (`en` or `de`) |
| `ENGAGEMENT_ACTIVE_DAYS` | `7` | Days threshold for "active" |
| `ENGAGEMENT_MODERATE_DAYS` | `30` | Days threshold for "moderate" |
| `ENGAGEMENT_DORMANT_DAYS` | `90` | Days threshold for "dormant" |

### CouchDB (Obsidian LiveSync)

For users with [Obsidian LiveSync](https://github.com/vrtmrz/obsidian-livesync):

| Variable | Description |
|----------|-------------|
| `COUCHDB_HOST` | CouchDB hostname |
| `COUCHDB_PORT` | CouchDB port (default: 5984) |
| `COUCHDB_DATABASE` | Database name |
| `COUCHDB_USER` | CouchDB username |
| `COUCHDB_PASSWORD` | CouchDB password |

Set `VAULT_SOURCE=couchdb` to use the CouchDB adapter.

## How It Works

1. **Index** - Reads all `.md` files from your vault (or CouchDB), parses frontmatter, tags, wiki-links, and headings, then stores everything in a local SQLite database.

2. **Analyze** - Graph queries run against the SQLite database to find structural patterns: orphans (isolated notes), hubs (highly connected notes), broken links, tag distributions, and more.

3. **Engage** - Each note is classified by engagement level based on modification timestamps. Revival candidates are dormant notes with many connections that might benefit from revisiting.

4. **Catalyze** - An optional LLM generates thought-provoking questions about dormant but well-connected notes to spark new ideas.

5. **Report** - Generates a self-contained HTML file with Chart.js visualizations: engagement donut chart, tag cloud, hub rankings, folder activity, and a vault health score.

## Development

```bash
# Clone and install
git clone https://github.com/GuideThomas/obsidian-intelligence.git
cd obsidian-intelligence
npm install

# Run tests
npm test

# Run with coverage
npm run test:coverage

# Index a test vault
node vault-intelligence.js index --vault /path/to/vault
```

## Requirements

- Node.js >= 18.0.0
- An Obsidian vault (or CouchDB with LiveSync)

## License

[MIT](LICENSE)
