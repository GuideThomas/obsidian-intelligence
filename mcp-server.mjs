#!/usr/bin/env node

/**
 * Obsidian Intelligence MCP Server
 *
 * Exposes vault analysis tools via Model Context Protocol (stdio transport).
 * Uses createRequire() to bridge ES Module (MCP SDK) with CommonJS lib/ modules.
 *
 * Usage:
 *   node mcp-server.mjs
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Resolve paths relative to this script (not CWD)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from script directory
const require = createRequire(import.meta.url);
const dotenv = require('dotenv');
dotenv.config({ path: join(__dirname, '.env') });

// Import CommonJS lib modules via createRequire
const { getConfig } = require('./lib/config.js');
const { initDatabase, getDb, getNoteCount, getMeta, closeDatabase } = require('./lib/database.js');
const { findOrphans, findHubs, findBacklinks, findRelated, getTagCloud, findNotesByTag } = require('./lib/graph.js');
const { classifyAll, getStats, findDormantConnected } = require('./lib/engagement.js');
const { listCatalysts } = require('./lib/catalyst.js');
const { buildSnapshot } = require('./lib/snapshot.js');

// Initialize config and database
try {
  getConfig();
  initDatabase();
  console.error('[vault-intelligence] Database initialized');
} catch (err) {
  console.error('[vault-intelligence] Database init failed:', err.message);
  process.exit(1);
}

// --- MCP Server ---

const server = new Server(
  { name: 'obsidian-intelligence', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

// --- Tool Definitions ---

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'vault_status',
      description: 'Quick vault overview: note count, tag count, link count, DB size, last index time.',
      inputSchema: { type: 'object', properties: {}, required: [] }
    },
    {
      name: 'vault_snapshot',
      description: 'Complete vault snapshot: engagement distribution, graph stats, active notes, revival candidates, open catalysts, folder activity.',
      inputSchema: { type: 'object', properties: {}, required: [] }
    },
    {
      name: 'find_orphans',
      description: 'Find orphan notes that have no incoming links, no outgoing links, and no tags.',
      inputSchema: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Maximum results (default: 50)', default: 50 }
        },
        required: []
      }
    },
    {
      name: 'find_hubs',
      description: 'Find the most connected notes in the vault.',
      inputSchema: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Maximum results (default: 10)', default: 10 }
        },
        required: []
      }
    },
    {
      name: 'find_backlinks',
      description: 'Find all notes that link TO a specific note.',
      inputSchema: {
        type: 'object',
        properties: {
          note: { type: 'string', description: 'Note title, path, or partial match' }
        },
        required: ['note']
      }
    },
    {
      name: 'find_related',
      description: 'Find notes related to a specific note by shared tags or direct links.',
      inputSchema: {
        type: 'object',
        properties: {
          note: { type: 'string', description: 'Note title, path, or partial match' },
          limit: { type: 'number', description: 'Maximum results per category (default: 15)', default: 15 }
        },
        required: ['note']
      }
    },
    {
      name: 'get_tag_cloud',
      description: 'Get all tags with their note counts. Optionally filter by substring.',
      inputSchema: {
        type: 'object',
        properties: {
          filter: { type: 'string', description: 'Optional substring filter for tag names' }
        },
        required: []
      }
    },
    {
      name: 'find_notes_by_tag',
      description: 'Find all notes that have a specific tag.',
      inputSchema: {
        type: 'object',
        properties: {
          tag: { type: 'string', description: 'Tag name (with or without #)' }
        },
        required: ['tag']
      }
    },
    {
      name: 'engagement_stats',
      description: 'Get engagement statistics: activity distribution, top active notes, most modified notes, and revival candidates.',
      inputSchema: { type: 'object', properties: {}, required: [] }
    },
    {
      name: 'list_catalysts',
      description: 'List open AI-generated catalyst questions for vault exploration.',
      inputSchema: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Maximum results (default: 20)', default: 20 }
        },
        required: []
      }
    }
  ]
}));

// --- Tool Handlers ---

function successResponse(data) {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }]
  };
}

function errorResponse(message) {
  return {
    content: [{ type: 'text', text: JSON.stringify({ error: message }) }],
    isError: true
  };
}

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {

      case 'vault_status': {
        const db = getDb();
        const noteCount = getNoteCount();
        const tagCount = db.prepare('SELECT COUNT(DISTINCT tag_id) as count FROM note_tags').get().count;
        const linkCount = db.prepare('SELECT COUNT(*) as count FROM links').get().count;
        const brokenLinks = db.prepare('SELECT COUNT(*) as count FROM links WHERE target_id IS NULL').get().count;
        const lastIndex = getMeta('last_full_index') || 'never';
        const dbSizeRow = db.prepare("SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()").get();
        const dbSizeMB = dbSizeRow ? (dbSizeRow.size / 1024 / 1024).toFixed(1) : 'unknown';

        return successResponse({
          notes: noteCount,
          tags: tagCount,
          links: linkCount,
          broken_links: brokenLinks,
          last_index: lastIndex,
          db_size_mb: dbSizeMB
        });
      }

      case 'vault_snapshot': {
        const snapshot = buildSnapshot();
        return successResponse(snapshot);
      }

      case 'find_orphans': {
        const limit = args?.limit ?? 50;
        const orphans = findOrphans(limit);
        return successResponse({ count: orphans.length, orphans });
      }

      case 'find_hubs': {
        const limit = args?.limit ?? 10;
        const hubs = findHubs(limit);
        return successResponse({ count: hubs.length, hubs });
      }

      case 'find_backlinks': {
        if (!args?.note) return errorResponse('Parameter "note" is required');
        const result = findBacklinks(args.note);
        if (result.error) return errorResponse(result.error);
        return successResponse({
          note_id: result.noteId,
          count: result.results.length,
          backlinks: result.results
        });
      }

      case 'find_related': {
        if (!args?.note) return errorResponse('Parameter "note" is required');
        const limit = args?.limit ?? 15;
        const result = findRelated(args.note, limit);
        if (result.error) return errorResponse(result.error);
        return successResponse({
          note_id: result.noteId,
          by_tags: result.byTags,
          by_links: result.byLinks
        });
      }

      case 'get_tag_cloud': {
        const filter = args?.filter || null;
        const tags = getTagCloud(filter);
        return successResponse({ count: tags.length, tags });
      }

      case 'find_notes_by_tag': {
        if (!args?.tag) return errorResponse('Parameter "tag" is required');
        const notes = findNotesByTag(args.tag);
        return successResponse({ tag: args.tag, count: notes.length, notes });
      }

      case 'engagement_stats': {
        classifyAll();
        const stats = getStats();
        const revivalCandidates = findDormantConnected(10);
        return successResponse({
          distribution: stats.distribution,
          total: stats.total,
          top_active: stats.topActive,
          most_modified: stats.mostModified,
          revival_candidates: revivalCandidates
        });
      }

      case 'list_catalysts': {
        const limit = args?.limit ?? 20;
        const catalysts = listCatalysts(limit);
        return successResponse({
          count: catalysts.length,
          catalysts: catalysts.map(c => ({
            id: c.id,
            category: c.category,
            question: c.question,
            context: c.context,
            created_at: c.created_at
          }))
        });
      }

      default:
        return errorResponse(`Unknown tool: ${name}`);
    }
  } catch (err) {
    console.error(`[vault-intelligence] Error in ${name}:`, err.message);
    return errorResponse(`${name} failed: ${err.message}`);
  }
});

// --- Startup ---

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[vault-intelligence] MCP server running on stdio');
}

function cleanup() {
  try {
    closeDatabase();
  } catch { /* ignore */ }
  process.exit(0);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

main().catch((err) => {
  console.error('[vault-intelligence] Fatal:', err);
  process.exit(1);
});
