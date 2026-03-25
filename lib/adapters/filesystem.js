const fs = require('fs');
const path = require('path');

const IGNORE_DIRS = new Set(['.obsidian', '.trash', '.git', 'node_modules']);

function findMarkdownFiles(dir, base, results = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name.startsWith('.') && IGNORE_DIRS.has(entry.name)) continue;
    if (IGNORE_DIRS.has(entry.name)) continue;

    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      findMarkdownFiles(fullPath, base, results);
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      results.push(fullPath);
    }
  }

  return results;
}

function createFilesystemSource({ vaultPath }) {
  if (!vaultPath) {
    throw new Error('vaultPath is required for filesystem adapter');
  }

  const resolvedPath = path.resolve(vaultPath);

  return {
    async getAllNotes() {
      if (!fs.existsSync(resolvedPath)) {
        throw new Error(`Vault path does not exist: ${resolvedPath}`);
      }

      const stat = fs.statSync(resolvedPath);
      if (!stat.isDirectory()) {
        throw new Error(`Vault path is not a directory: ${resolvedPath}`);
      }

      const files = findMarkdownFiles(resolvedPath, resolvedPath);
      const notes = [];

      for (const filePath of files) {
        try {
          const content = fs.readFileSync(filePath, 'utf8');
          const fileStat = fs.statSync(filePath);
          const relativePath = path.relative(resolvedPath, filePath).replace(/\\/g, '/');

          notes.push({
            id: relativePath,
            path: relativePath,
            content,
            mtime: fileStat.mtimeMs,
            ctime: fileStat.birthtimeMs || fileStat.ctimeMs
          });
        } catch (e) {
          // Skip unreadable files
        }
      }

      return notes;
    },

    async testConnection() {
      if (!fs.existsSync(resolvedPath)) {
        return { error: `Path does not exist: ${resolvedPath}` };
      }

      const stat = fs.statSync(resolvedPath);
      if (!stat.isDirectory()) {
        return { error: `Not a directory: ${resolvedPath}` };
      }

      const files = findMarkdownFiles(resolvedPath, resolvedPath);
      return {
        source: 'filesystem',
        vault_path: resolvedPath,
        md_files: files.length
      };
    },

    getSourceType() {
      return 'filesystem';
    }
  };
}

module.exports = { createFilesystemSource, findMarkdownFiles };
