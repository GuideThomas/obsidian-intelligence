#!/usr/bin/env node
const path = require('path');
const fs = require('fs');

require('dotenv').config();

const { getConfig } = require('./lib/config');
const { createSource } = require('./lib/adapters');
const { initDatabase, getNoteHash, getNoteCount, indexParsedNote, setMeta, getMeta, deleteNote, closeDatabase, getDb } = require('./lib/database');
const { parseNote, hashContent } = require('./lib/parser');

function parseFlags(args) {
  const flags = {};
  const positional = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--vault' && args[i + 1]) {
      flags.vaultPath = args[++i];
    } else if (args[i] === '--output' && args[i + 1]) {
      flags.output = args[++i];
    } else if (args[i] === '--lang' && args[i + 1]) {
      flags.lang = args[++i];
    } else if (args[i] === '--force') {
      flags.force = true;
    } else if (args[i] === '--rebuild-fts') {
      flags.rebuildFts = true;
    } else if (args[i] === '--open') {
      flags.open = true;
    } else if (args[i] === '--db' && args[i + 1]) {
      flags.dbPath = args[++i];
    } else if (!args[i].startsWith('--')) {
      positional.push(args[i]);
    }
  }

  return { flags, positional };
}

// --- Commands ---

async function cmdRebuildFts(flags = {}) {
  // Re-fetches all notes from the source and rebuilds notes_fts. Use after
  // upgrading from a pre-1.1 database that has notes but no FTS rows.
  const config = getConfig(flags);
  const source = createSource(config);
  const { rebuildFts } = require('./lib/database');

  console.log('Fetching notes for FTS rebuild...');
  const notes = await source.getAllNotes();
  const contentMap = new Map();
  for (const n of notes) contentMap.set(n.id, n.content);

  console.log(`Rebuilding FTS index for ${notes.length} notes...`);
  const result = rebuildFts((noteId) => contentMap.get(noteId) || '');
  console.log(`FTS rebuild complete: ${result.written}/${result.total} rows written`);
}

async function cmdIndex(flags = {}) {
  if (flags.rebuildFts) {
    return cmdRebuildFts(flags);
  }
  const config = getConfig(flags);
  const source = createSource(config);
  const force = flags.force || false;

  const startTime = Date.now();
  console.log(`Fetching notes from ${source.getSourceType()}...`);
  const notes = await source.getAllNotes();
  const total = notes.length;

  // Build set of all note IDs for link resolution
  const allNoteIds = new Set(notes.map(n => n.id));

  let indexed = 0, skipped = 0, errors = 0;
  console.log(`\nParsing ${total} notes...`);

  for (let i = 0; i < notes.length; i++) {
    try {
      const note = notes[i];
      const contentHash = hashContent(note.content);

      // Skip if unchanged (unless --force)
      if (!force && getNoteHash(note.id) === contentHash) {
        skipped++;
      } else {
        const parsed = parseNote(note);
        // Pass raw content to populate FTS5 in the same transaction.
        indexParsedNote(parsed, allNoteIds, note.content);
        indexed++;
      }
    } catch (e) {
      errors++;
      if (errors <= 5) console.error(`\nError: ${notes[i].path}: ${e.message}`);
    }

    if ((i + 1) % 100 === 0) {
      process.stdout.write(`\r[${i + 1}/${total}] Indexed: ${indexed} | Skipped: ${skipped} | Errors: ${errors}`);
    }
  }

  // Clean up deleted notes
  const dbNotes = getDb().prepare('SELECT note_id FROM notes').all();
  let deleted = 0;
  for (const row of dbNotes) {
    if (!allNoteIds.has(row.note_id)) {
      deleteNote(row.note_id);
      deleted++;
    }
  }

  // Update metadata
  setMeta('last_full_index', new Date().toISOString());
  setMeta('total_notes', total.toString());

  const duration = Math.round((Date.now() - startTime) / 1000);
  console.log(`\n\nIndex complete in ${duration}s:`);
  console.log(`  Notes:   ${total}`);
  console.log(`  Indexed: ${indexed}`);
  console.log(`  Skipped: ${skipped} (unchanged)`);
  console.log(`  Deleted: ${deleted}`);
  console.log(`  Errors:  ${errors}`);
}

function cmdStatus() {
  const config = getConfig();
  const noteCount = getNoteCount();
  const tagCount = getDb().prepare('SELECT COUNT(*) as c FROM tags').get().c;
  const linkCount = getDb().prepare('SELECT COUNT(*) as c FROM links').get().c;
  const brokenLinks = getDb().prepare('SELECT COUNT(*) as c FROM links WHERE target_id IS NULL').get().c;
  const lastIndex = getMeta('last_full_index') || 'never';
  const dbPath = config.sqlite.path;
  const dbSize = fs.existsSync(dbPath)
    ? Math.round(fs.statSync(dbPath).size / 1024)
    : 0;

  const folders = getDb().prepare('SELECT COUNT(DISTINCT folder) as c FROM notes').get().c;

  const { getFtsCount } = require('./lib/database');
  const ftsCount = getFtsCount();
  const ftsHint = ftsCount === 0 && noteCount > 0
    ? ' (run: index --rebuild-fts)'
    : '';

  console.log('Obsidian-Intelligence Status:');
  console.log(`  Source:       ${config.source}`);
  if (config.vaultPath) console.log(`  Vault:        ${config.vaultPath}`);
  console.log(`  Notes:        ${noteCount}`);
  console.log(`  Tags:         ${tagCount}`);
  console.log(`  Links:        ${linkCount} (${brokenLinks} broken)`);
  console.log(`  Folders:      ${folders}`);
  console.log(`  FTS indexed:  ${ftsCount}${ftsHint}`);
  console.log(`  Last index:   ${lastIndex}`);
  console.log(`  Database:     ${dbPath}`);
  console.log(`  DB size:      ${dbSize} KB`);
}

async function cmdTest(flags = {}) {
  const config = getConfig(flags);
  console.log('Testing Vault-Intelligence setup...\n');

  // Test source
  console.log(`1. Vault source (${config.source})...`);
  try {
    const source = createSource(config);
    const info = await source.testConnection();
    if (info.error) throw new Error(info.error);
    if (config.source === 'couchdb') {
      console.log(`   OK - Database: ${info.db_name}, Docs: ${info.doc_count}`);
    } else {
      console.log(`   OK - Path: ${info.vault_path}, Files: ${info.md_files}`);
    }
  } catch (e) {
    console.error(`   FAIL - ${e.message}`);
  }

  // Test SQLite
  console.log('\n2. SQLite database...');
  try {
    const count = getNoteCount();
    console.log(`   OK - ${count} notes indexed`);
    console.log(`   Path: ${config.sqlite.path}`);
  } catch (e) {
    console.error(`   FAIL - ${e.message}`);
  }

  // Test LLM (if configured)
  console.log('\n3. LLM connection...');
  try {
    if (!config.llm.apiKey) {
      console.log('   SKIP - LLM_API_KEY not configured');
    } else {
      const { testLLM } = require('./lib/catalyst');
      const ok = await testLLM(config);
      console.log(`   ${ok ? 'OK' : 'FAIL'} - ${config.llm.url} (model: ${config.llm.model})`);
    }
  } catch (e) {
    console.error(`   FAIL - ${e.message}`);
  }

  console.log('\nTest complete.');
}

// --- CLI ---

function showUsage() {
  console.log(`Obsidian Intelligence - Structural analysis for Obsidian vaults

Usage:
  vault-intelligence index [--force] [--vault <path>]  Full index
  vault-intelligence index --rebuild-fts               Rebuild FTS search index
  vault-intelligence status                            Show statistics
  vault-intelligence test                              Test connections
  vault-intelligence report [--output <file>] [--open] Generate HTML report

  vault-intelligence search <query> [--limit N] [--folder p] [--tag name]
                                                        Full-text search (BM25)

  vault-intelligence graph orphans           Notes without links or tags
  vault-intelligence graph hubs [n]          Top N connected notes
  vault-intelligence graph backlinks <note>  Who links to this note?
  vault-intelligence graph links <note>      Where does this note link?
  vault-intelligence graph tags [filter]     Tag cloud with counts
  vault-intelligence graph tag <tag>         All notes with this tag
  vault-intelligence graph related <note>    Related notes
  vault-intelligence graph broken            Broken links

  vault-intelligence engagement [level]      Filter by level
  vault-intelligence engagement stats        Distribution summary

  vault-intelligence catalyst generate [n]   Generate n questions (default: 3)
  vault-intelligence catalyst list           Show open questions
  vault-intelligence catalyst dismiss <id>   Dismiss a question

  vault-intelligence snapshot [path]         Generate JSON snapshot
  vault-intelligence watch                   Watch for vault changes

Options:
  --vault <path>    Path to Obsidian vault (overrides VAULT_PATH)
  --db <path>       Database path (overrides VAULT_INTEL_DB)
  --lang <en|de>    Language for AI content (default: en)
  --force           Force re-index all notes
  --output <file>   Output file for report
  --open            Open report in browser`);
}

async function main() {
  const { flags, positional } = parseFlags(process.argv.slice(2));
  const command = positional[0];
  const subcommand = positional[1];
  const subArgs = positional.slice(1);

  if (!command || command === '--help' || command === '-h') {
    showUsage();
    return;
  }

  // Initialize config with CLI overrides
  const config = getConfig(flags);

  // Initialize database for all commands
  initDatabase();

  try {
    switch (command) {
      case 'index':
        await cmdIndex(flags);
        break;

      case 'status':
        cmdStatus();
        break;

      case 'test':
        await cmdTest(flags);
        break;

      case 'report': {
        const { generateReport } = require('./lib/report');
        generateReport(flags);
        break;
      }

      case 'graph': {
        const { handleGraphCommand } = require('./lib/graph');
        await handleGraphCommand(subcommand, subArgs);
        break;
      }

      case 'search': {
        const { handleSearchCommand } = require('./lib/search');
        handleSearchCommand(positional);
        break;
      }

      case 'engagement': {
        const { handleEngagementCommand } = require('./lib/engagement');
        await handleEngagementCommand(subcommand, subArgs);
        break;
      }

      case 'catalyst': {
        const { handleCatalystCommand } = require('./lib/catalyst');
        await handleCatalystCommand(subcommand, subArgs);
        break;
      }

      case 'snapshot': {
        const { handleSnapshotCommand } = require('./lib/snapshot');
        handleSnapshotCommand(subArgs);
        break;
      }

      case 'watch': {
        const { startWatch } = require('./lib/watch');
        startWatch(flags);
        return; // Don't close DB - watcher keeps running
      }

      default:
        console.error(`Unknown command: ${command}`);
        showUsage();
        process.exit(1);
    }
  } finally {
    if (command !== 'watch') {
      closeDatabase();
    }
  }
}

if (require.main === module) {
  main().catch(e => {
    console.error('Error:', e.message);
    process.exit(1);
  });
}

module.exports = { cmdIndex, cmdStatus, cmdTest };
