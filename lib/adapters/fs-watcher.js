/**
 * Filesystem Watcher
 *
 * Watches a vault directory for .md file changes using chokidar.
 *
 * @implements {VaultWatcher}
 */

const path = require('path');

/**
 * Create a filesystem watcher
 * @param {Object} options
 * @param {string} options.vaultPath - Absolute path to the vault
 * @returns {VaultWatcher}
 */
function createFsWatcher({ vaultPath }) {
  let watcher = null;

  return {
    start(onChange) {
      let chokidar;
      try {
        chokidar = require('chokidar');
      } catch (e) {
        console.error('chokidar is required for filesystem watching. Install it with: npm install chokidar');
        process.exit(1);
      }

      const resolvedPath = path.resolve(vaultPath);
      watcher = chokidar.watch('**/*.md', {
        cwd: resolvedPath,
        ignored: [
          '**/node_modules/**',
          '**/.obsidian/**',
          '**/.trash/**',
          '**/.git/**'
        ],
        persistent: true,
        ignoreInitial: true,
        awaitWriteFinish: { stabilityThreshold: 500 }
      });

      watcher.on('add', filePath => {
        onChange({ type: 'add', path: filePath.replace(/\\/g, '/') });
      });

      watcher.on('change', filePath => {
        onChange({ type: 'change', path: filePath.replace(/\\/g, '/') });
      });

      watcher.on('unlink', filePath => {
        onChange({ type: 'delete', path: filePath.replace(/\\/g, '/') });
      });

      console.log(`Watching for vault changes in ${resolvedPath}... (Ctrl+C to stop)`);
    },

    stop() {
      if (watcher) {
        watcher.close();
        watcher = null;
      }
    }
  };
}

module.exports = { createFsWatcher };
