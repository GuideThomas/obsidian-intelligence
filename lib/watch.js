const fs = require('fs');
const path = require('path');
const { getConfig } = require('./config');
const { createSource, createWatcher } = require('./adapters');
const { parseNote, hashContent } = require('./parser');
const { getDb, indexParsedNote, deleteNote } = require('./database');
const { classifyAll } = require('./engagement');

function getAllNoteIds() {
  const rows = getDb().prepare('SELECT note_id FROM notes').all();
  return new Set(rows.map(r => r.note_id));
}

function startWatch(flags = {}) {
  const config = getConfig(flags);
  const watcher = createWatcher(config);
  let changeCount = 0;

  watcher.start(async (event) => {
    try {
      if (event.type === 'delete') {
        console.log(`[DELETE] ${event.path}`);
        deleteNote(event.id || event.path);
        changeCount++;
        return;
      }

      // For filesystem watcher, we need to read the file content
      let note;
      if (event.content) {
        // CouchDB watcher provides content directly
        note = {
          id: event.id || event.path,
          path: event.path,
          content: event.content,
          mtime: event.mtime || Date.now(),
          ctime: event.ctime || event.mtime || Date.now()
        };
      } else {
        // Filesystem watcher - read from disk
        const fullPath = path.resolve(config.vaultPath, event.path);
        if (!fs.existsSync(fullPath)) return;

        const content = fs.readFileSync(fullPath, 'utf8');
        const stat = fs.statSync(fullPath);

        note = {
          id: event.path,
          path: event.path,
          content,
          mtime: stat.mtimeMs,
          ctime: stat.birthtimeMs || stat.ctimeMs
        };
      }

      if (!note.content || note.content.trim().length === 0) return;

      const parsed = parseNote(note);
      const allNoteIds = getAllNoteIds();
      allNoteIds.add(note.id);
      indexParsedNote(parsed, allNoteIds);
      console.log(`[${event.type === 'add' ? 'ADD' : 'UPDATE'}] ${event.path} (${parsed.tags.length} tags, ${parsed.links.length} links)`);
      changeCount++;

      // Reclassify engagement periodically
      if (changeCount % 10 === 0) {
        classifyAll();
      }
    } catch (e) {
      console.error(`Error processing ${event.path}:`, e.message);
    }
  });

  process.on('SIGINT', () => {
    watcher.stop();
    console.log(`\nStopped. Processed ${changeCount} changes.`);
    process.exit(0);
  });
}

module.exports = { startWatch };
