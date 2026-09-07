const path = require('path');

/**
 * Message shown when an OpenAI-compatible adapter is asked to run without a
 * configured endpoint. Kept here, next to the config it talks about, so the
 * wording cannot drift between the chat and the embeddings adapter.
 */
const LLM_URL_MISSING =
  'LLM_API_URL is not set. Point it at your LLM gateway '
  + '(for example LiteLLM: LLM_API_URL=http://localhost:4000/v1). '
  + 'There is no built-in direct route to api.openai.com — if that is really what you want, '
  + 'set LLM_API_URL=https://api.openai.com/v1 explicitly. See docs/PROVIDERS.md.';

/**
 * Guard for the OpenAI-compatible adapters: an endpoint must be configured.
 *
 * 🚨 This is a CONFIGURATION error, raised before any request is built — no
 * network call happens on the way to it. That is the whole point: the previous
 * behaviour was a silent fallback to api.openai.com, and a fallback that works
 * is one nobody reports.
 */
function requireApiUrl(url) {
  const value = typeof url === 'string' ? url.trim() : '';
  if (!value) throw new Error(LLM_URL_MISSING);
  return value;
}

function loadConfig(overrides = {}) {
  const vaultPath = overrides.vaultPath || process.env.VAULT_PATH || '';
  const source = process.env.VAULT_SOURCE || (process.env.COUCHDB_PASSWORD ? 'couchdb' : 'filesystem');

  // Default DB location: inside vault or current directory
  const defaultDbPath = vaultPath
    ? path.join(vaultPath, '.vault-intelligence.db')
    : './vault-intelligence.db';

  // LLM provider config (chat / catalysts / enrichment)
  //
  // 🚨 NO IMPLICIT DEFAULT TO api.openai.com (changed 07.09.2026). Until then
  // this line ended in `|| 'https://api.openai.com/v1'`. Combined with the
  // factory's `auto` mode -- which picked "openai" as soon as ANY key was
  // present -- a plain `OPENAI_API_KEY` in the environment was enough to send
  // every chat, catalyst and enrichment call straight to OpenAI: past the
  // gateway, past its cost accounting, spend guardrails and alias mapping.
  // Nothing failed, nothing was logged, so nothing was noticed -- a fail-open
  // default (see principle-fail-open-default-trap).
  //
  // An empty URL now means "not configured", and that is an error at the point
  // of use (see requireApiUrl below), not a silent fallback. Calling OpenAI
  // directly is still possible -- but only when someone SAYS so, by setting
  // LLM_API_URL=https://api.openai.com/v1 (see docs/PROVIDERS.md).
  const llm = {
    provider: process.env.LLM_PROVIDER || 'auto',
    url: process.env.LLM_API_URL || process.env.OPENAI_BASE_URL || '',
    // ⚠️ This is an ALIAS NAME sent to whatever LLM_API_URL points at -- a
    // gateway typically maps `gpt-4o-mini` onto whichever model currently
    // serves that tier. It is not a promise that an OpenAI model is used, and
    // it is not a route to OpenAI; the route is LLM_API_URL and nothing else.
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

module.exports = { getConfig, loadConfig, resetConfig, requireApiUrl, LLM_URL_MISSING };
