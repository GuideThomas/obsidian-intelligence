const path = require('path');

function loadConfig(overrides = {}) {
  const vaultPath = overrides.vaultPath || process.env.VAULT_PATH || '';
  const source = process.env.VAULT_SOURCE || (process.env.COUCHDB_PASSWORD ? 'couchdb' : 'filesystem');

  // Default DB location: inside vault or current directory
  const defaultDbPath = vaultPath
    ? path.join(vaultPath, '.vault-intelligence.db')
    : './vault-intelligence.db';

  // LLM provider config (chat / catalysts / enrichment)
  const llm = {
    provider: process.env.LLM_PROVIDER || 'auto',
    url: process.env.LLM_API_URL || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    model: process.env.LLM_MODEL || 'gpt-4o-mini',
    apiKey: process.env.LLM_API_KEY || process.env.OPENAI_API_KEY || ''
  };

  // Embeddings provider config (semantic / hybrid search)
  // Falls back to LLM credentials if EMBEDDINGS_* not set, so users with one
  // OpenAI key get embeddings for free.
  const embeddings = {
    provider: process.env.EMBEDDINGS_PROVIDER || 'auto',
    url: process.env.EMBEDDINGS_API_URL || llm.url,
    model: process.env.EMBEDDINGS_MODEL || '',
    apiKey: process.env.EMBEDDINGS_API_KEY || llm.apiKey,
    geminiApiKey: process.env.GEMINI_API_KEY || '',
    dimensions: process.env.EMBEDDINGS_DIMENSIONS
      ? parseInt(process.env.EMBEDDINGS_DIMENSIONS)
      : 0
  };

  return {
    vaultPath,
    source,
    sqlite: {
      path: overrides.dbPath || process.env.VAULT_INTEL_DB || defaultDbPath
    },
    couchdb: {
      host: process.env.COUCHDB_HOST || 'localhost',
      port: parseInt(process.env.COUCHDB_PORT || '5984'),
      database: process.env.COUCHDB_DATABASE || 'obsidian',
      user: process.env.COUCHDB_USER || 'admin',
      password: process.env.COUCHDB_PASSWORD || ''
    },
    llm,
    embeddings,
    engagement: {
      active: parseInt(process.env.ENGAGEMENT_ACTIVE_DAYS || '7'),
      moderate: parseInt(process.env.ENGAGEMENT_MODERATE_DAYS || '30'),
      dormant: parseInt(process.env.ENGAGEMENT_DORMANT_DAYS || '90')
    },
    lang: overrides.lang || process.env.VAULT_INTEL_LANG || 'en'
  };
}

// Singleton for backward compatibility - initialized once, can be overridden
let CONFIG = null;

function getConfig(overrides) {
  if (!CONFIG || overrides) {
    CONFIG = loadConfig(overrides);
  }
  return CONFIG;
}

function resetConfig() {
  CONFIG = null;
}

module.exports = { getConfig, loadConfig, resetConfig };
