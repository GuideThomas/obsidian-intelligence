/**
 * CouchDB Changes Feed Watcher
 *
 * Listens to CouchDB _changes feed for incremental vault updates.
 *
 * @implements {VaultWatcher}
 */

const http = require('http');
const https = require('https');
const { couchRequest, fetchDocumentContent } = require('./couchdb');

/**
 * Create a CouchDB watcher
 * @param {Object} options - CouchDB connection options
 * @returns {VaultWatcher}
 */
function createCouchDBWatcher(options) {
  let running = false;

  return {
    start(onChange) {
      running = true;
      const isHttps = options.host.startsWith('https://');
      const cleanHost = options.host.replace(/^https?:\/\//, '');
      const transport = isHttps ? https : http;

      let lastSeq = 'now';

      function poll() {
        if (!running) return;

        const auth = Buffer.from(`${options.user}:${options.password}`).toString('base64');

        const req = transport.request({
          hostname: cleanHost,
          port: options.port,
          path: `/${options.database}/_changes?feed=longpoll&since=${lastSeq}&include_docs=true&timeout=30000`,
          method: 'GET',
          headers: {
            'Authorization': `Basic ${auth}`,
            'Accept': 'application/json'
          }
        }, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', async () => {
            try {
              const result = JSON.parse(data);
              if (result.last_seq) lastSeq = result.last_seq;

              if (result.results) {
                for (const change of result.results) {
                  if (!change.doc) continue;
                  if (change.doc._id.startsWith('_') || change.doc._id.startsWith('h:')) continue;
                  const docPath = change.doc.path || change.doc._id;
                  if (!docPath.endsWith('.md')) continue;

                  if (change.deleted || change.doc.deleted) {
                    onChange({ type: 'delete', id: change.doc._id, path: docPath });
                    continue;
                  }

                  if (change.doc.type !== 'plain') continue;

                  const content = await fetchDocumentContent(options, change.doc);
                  if (!content || content.trim().length === 0) continue;

                  onChange({
                    type: 'change',
                    id: change.doc._id,
                    path: docPath,
                    content,
                    mtime: change.doc.mtime || Date.now(),
                    ctime: change.doc.ctime || change.doc.mtime || Date.now()
                  });
                }
              }

              if (running) setTimeout(poll, 1000);
            } catch (e) {
              console.error('Error processing changes:', e.message);
              if (running) setTimeout(poll, 5000);
            }
          });
        });

        req.on('error', (e) => {
          console.error('Changes feed error:', e.message);
          if (running) setTimeout(poll, 5000);
        });

        req.end();
      }

      console.log('Watching CouchDB for vault changes... (Ctrl+C to stop)');
      poll();
    },

    stop() {
      running = false;
    }
  };
}

module.exports = { createCouchDBWatcher };
