const { createFilesystemSource } = require('./filesystem');
const { createCouchDBSource } = require('./couchdb');
const { createFsWatcher } = require('./fs-watcher');
const { createCouchDBWatcher } = require('./couchdb-watcher');

function createSource(config) {
  if (config.source === 'couchdb') {
    if (!config.couchdb || !config.couchdb.password) {
      throw new Error('CouchDB source requires COUCHDB_PASSWORD in .env');
    }
    return createCouchDBSource(config.couchdb);
  }

  if (!config.vaultPath) {
    throw new Error('VAULT_PATH not set. Use --vault <path> or set VAULT_PATH in .env');
  }
  return createFilesystemSource({ vaultPath: config.vaultPath });
}

function createWatcher(config) {
  if (config.source === 'couchdb') {
    return createCouchDBWatcher(config.couchdb);
  }
  return createFsWatcher({ vaultPath: config.vaultPath });
}

module.exports = { createSource, createWatcher };
