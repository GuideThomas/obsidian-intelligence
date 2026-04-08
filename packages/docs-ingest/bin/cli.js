#!/usr/bin/env node

// obsidian-intelligence-docs CLI
//
// Usage:
//   obsidian-intelligence-docs ingest <file>     Ingest a single file
//   obsidian-intelligence-docs list              List ingested documents
//
// The database path is taken from VAULT_INTEL_DB or defaults to
// ./vault-intelligence.db (matches the core package).

const path = require('path');

const { ingestFile, listDocuments, SUPPORTED_EXTENSIONS } = require('../lib');

function getDbPath() {
  return process.env.VAULT_INTEL_DB || './vault-intelligence.db';
}

function showUsage() {
  console.log(`obsidian-intelligence-docs - optional document ingestion for obsidian-intelligence

Usage:
  obsidian-intelligence-docs ingest <file> [--force] [--title <title>]
  obsidian-intelligence-docs list

Environment:
  VAULT_INTEL_DB    Path to the SQLite database (must match core)

Supported file types: ${SUPPORTED_EXTENSIONS.join(', ')}
PDF and DOCX support is planned for v0.2.

Examples:
  obsidian-intelligence-docs ingest ~/Documents/notes.md
  obsidian-intelligence-docs ingest article.html --force
  obsidian-intelligence-docs list`);
}

function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === '--help' || command === '-h') {
    showUsage();
    return;
  }

  const dbPath = getDbPath();

  try {
    switch (command) {
      case 'ingest': {
        const filePath = args[1];
        if (!filePath) { console.error('Usage: ingest <file>'); process.exit(1); }
        const flags = parseFlags(args.slice(2));
        const result = ingestFile(dbPath, path.resolve(filePath), flags);
        if (result.skipped) {
          console.log(`Skipped (${result.reason}): ${path.basename(filePath)} [${result.docId}]`);
        } else {
          console.log(`Ingested: ${result.title} [${result.docId}] -> ${result.chunks} chunks`);
        }
        break;
      }
      case 'list': {
        const docs = listDocuments(dbPath);
        if (docs.length === 0) {
          console.log('No documents ingested yet.');
          return;
        }
        console.log(`${docs.length} documents:\n`);
        for (const d of docs) {
          console.log(`  ${d.title || d.file_name}`);
          console.log(`    [${d.doc_id}] ${d.total_chunks} chunks  ${d.file_path}`);
        }
        break;
      }
      default:
        console.error(`Unknown command: ${command}`);
        showUsage();
        process.exit(1);
    }
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

function parseFlags(args) {
  const flags = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--force') flags.force = true;
    else if (args[i] === '--title' && args[i + 1]) flags.title = args[++i];
  }
  return flags;
}

main();
