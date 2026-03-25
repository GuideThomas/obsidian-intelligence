// Type definitions for vault source adapters.
// These are just for IDE hints -- no runtime enforcement.

/**
 * @typedef {Object} VaultNote
 * @property {string} id - Unique note identifier
 * @property {string} path - Relative path within vault
 * @property {string} content - Full markdown content
 * @property {number} mtime - Last modification time (ms)
 * @property {number} ctime - Creation time (ms)
 */

/**
 * @typedef {Object} VaultSource
 * @property {() => Promise<VaultNote[]>} getAllNotes
 * @property {() => Promise<Object>} testConnection
 * @property {() => string} getSourceType
 */

/**
 * @typedef {Object} VaultWatcher
 * @property {(onChange: function) => void} start
 * @property {() => void} stop
 */

module.exports = {};
