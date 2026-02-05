/**
 * CouchDB Vault Source Adapter
 *
 * Reads notes from CouchDB (Obsidian LiveSync). Optional adapter.
 * Note ID = CouchDB document ID.
 *
 * @implements {VaultSource}
 */

const http = require('http');
const https = require('https');

/**
 * Make an HTTP request to CouchDB
 */
function couchRequest(config, method, urlPath, body = null) {
  return new Promise((resolve, reject) => {
    const auth = Buffer.from(`${config.user}:${config.password}`).toString('base64');
    const isHttps = config.host.startsWith('https://');
    const cleanHost = config.host.replace(/^https?:\/\//, '');
    const transport = isHttps ? https : http;

    const options = {
      hostname: cleanHost,
      port: config.port,
      path: `/${config.database}${urlPath}`,
      method,
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    };

    const req = transport.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(data);
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

/**
 * Fetch content from LiveSync's chunked storage
 */
async function fetchDocumentContent(config, doc) {
  if (!doc.children || doc.children.length === 0) return '';

  const chunks = [];
  for (const leafId of doc.children) {
    try {
      const leaf = await couchRequest(config, 'GET', `/${encodeURIComponent(leafId)}`);
      if (leaf && leaf.data && leaf.type === 'leaf') {
        chunks.push(leaf.data);
      }
    } catch (e) {
      // Leaf might be missing
    }
  }
  return chunks.join('');
}

/**
 * Create a CouchDB vault source
 * @param {Object} options
 * @param {string} options.host - CouchDB hostname
 * @param {number} options.port - CouchDB port
 * @param {string} options.database - Database name
 * @param {string} options.user - CouchDB username
 * @param {string} options.password - CouchDB password
 * @returns {VaultSource}
 */
function createCouchDBSource({ host, port, database, user, password }) {
  const config = { host, port, database, user, password };

  return {
    async getAllNotes() {
      const result = await couchRequest(config, 'GET', '/_all_docs?include_docs=true');
      if (!result.rows) throw new Error('Failed to fetch documents from CouchDB');

      const noteDocs = [];
      for (const row of result.rows) {
        const doc = row.doc;
        if (!doc || doc._id.startsWith('_') || doc._id.startsWith('h:')) continue;
        const docPath = doc.path || doc._id;
        if (docPath.endsWith('.md') && !doc.deleted && doc.type === 'plain') {
          noteDocs.push(doc);
        }
      }

      console.log(`Found ${noteDocs.length} markdown documents`);

      const notes = [];
      for (let i = 0; i < noteDocs.length; i++) {
        const doc = noteDocs[i];
        const content = await fetchDocumentContent(config, doc);

        if (content && content.trim().length > 0) {
          notes.push({
            id: doc._id,
            path: doc.path || doc._id,
            content,
            mtime: doc.mtime || Date.now(),
            ctime: doc.ctime || doc.mtime || Date.now()
          });
        }

        if ((i + 1) % 100 === 0) {
          process.stdout.write(`\rFetched ${i + 1}/${noteDocs.length} notes...`);
        }
      }
      if (noteDocs.length > 100) console.log('');

      return notes;
    },

    async testConnection() {
      try {
        const info = await couchRequest(config, 'GET', '');
        return {
          source: 'couchdb',
          db_name: info.db_name,
          doc_count: info.doc_count
        };
      } catch (e) {
        return { error: e.message };
      }
    },

    getSourceType() {
      return 'couchdb';
    }
  };
}

/**
 * Get CouchDB database info (for watcher's update_seq)
 */
async function getDbInfo(config) {
  return await couchRequest(config, 'GET', '');
}

module.exports = { createCouchDBSource, couchRequest, fetchDocumentContent, getDbInfo };
