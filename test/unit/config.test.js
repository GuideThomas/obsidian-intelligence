import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { loadConfig, resetConfig, requireApiUrl } from '../../lib/config.js';
const { createLLM } = require('../../lib/adapters/llm');
const { createEmbedder } = require('../../lib/adapters/embeddings');

describe('loadConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    resetConfig();
  });

  afterEach(() => {
    process.env = originalEnv;
    resetConfig();
  });

  it('should use VAULT_PATH from environment', () => {
    process.env.VAULT_PATH = '/my/vault';
    const config = loadConfig();
    expect(config.vaultPath).toBe('/my/vault');
  });

  it('should default to filesystem source', () => {
    const config = loadConfig();
    expect(config.source).toBe('filesystem');
  });

  it('should auto-detect couchdb source when password set', () => {
    process.env.COUCHDB_PASSWORD = 'secret';
    const config = loadConfig();
    expect(config.source).toBe('couchdb');
  });

  it('should respect explicit VAULT_SOURCE', () => {
    process.env.VAULT_SOURCE = 'filesystem';
    process.env.COUCHDB_PASSWORD = 'secret';
    const config = loadConfig();
    expect(config.source).toBe('filesystem');
  });

  it('should use vault path for default DB location', () => {
    const config = loadConfig({ vaultPath: '/my/vault' });
    expect(config.sqlite.path).toContain('.vault-intelligence.db');
    expect(config.sqlite.path).toContain('vault');
  });

  it('should accept overrides', () => {
    const config = loadConfig({ vaultPath: '/override/path', lang: 'de' });
    expect(config.vaultPath).toBe('/override/path');
    expect(config.lang).toBe('de');
  });

  it('should parse engagement thresholds from env', () => {
    process.env.ENGAGEMENT_ACTIVE_DAYS = '14';
    process.env.ENGAGEMENT_MODERATE_DAYS = '60';
    process.env.ENGAGEMENT_DORMANT_DAYS = '180';
    const config = loadConfig();
    expect(config.engagement.active).toBe(14);
    expect(config.engagement.moderate).toBe(60);
    expect(config.engagement.dormant).toBe(180);
  });

  it('should use defaults for engagement thresholds', () => {
    const config = loadConfig();
    expect(config.engagement.active).toBe(7);
    expect(config.engagement.moderate).toBe(30);
    expect(config.engagement.dormant).toBe(90);
  });

  it('should default language to en', () => {
    const config = loadConfig();
    expect(config.lang).toBe('en');
  });

  it('should respect VAULT_INTEL_LANG', () => {
    process.env.VAULT_INTEL_LANG = 'de';
    const config = loadConfig();
    expect(config.lang).toBe('de');
  });

  it('should parse LLM config from env', () => {
    process.env.LLM_API_URL = 'https://my-api.com/v1';
    process.env.LLM_MODEL = 'gpt-4';
    process.env.LLM_API_KEY = 'sk-test';
    const config = loadConfig();
    expect(config.llm.url).toBe('https://my-api.com/v1');
    expect(config.llm.model).toBe('gpt-4');
    expect(config.llm.apiKey).toBe('sk-test');
  });

  it('should fall back to OPENAI env vars', () => {
    process.env.OPENAI_BASE_URL = 'https://openai.proxy.com';
    process.env.OPENAI_API_KEY = 'sk-openai';
    const config = loadConfig();
    expect(config.llm.url).toBe('https://openai.proxy.com');
    expect(config.llm.apiKey).toBe('sk-openai');
  });
});

// ══════════════════════════════════════════════════════════════════════
// A13 — no silent direct route to OpenAI (07.09.2026)
//
// 🚨 THE BUG: `llm.url` defaulted to `https://api.openai.com/v1`, and the
// adapter factories treated "a key is present" as "use openai". A plain
// OPENAI_API_KEY in the environment therefore sent every chat, catalyst,
// enrichment and embedding call directly to OpenAI — around the gateway that
// does the cost accounting, the spend guardrails and the alias mapping.
// It worked, so nobody reported it: a fail-open default
// (principle-fail-open-default-trap).
//
// These tests hold the NEGATIVE path: no endpoint configured must mean an
// error, and no request. `global.fetch` is replaced by a spy that throws —
// if any of these paths still reached the network, the test would say so.
// ══════════════════════════════════════════════════════════════════════
describe('A13: an unset LLM_API_URL is an error, not a route to OpenAI', () => {
  const originalEnv = process.env;
  let originalFetch;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.LLM_API_URL;
    delete process.env.OPENAI_BASE_URL;
    delete process.env.LLM_PROVIDER;
    resetConfig();
    originalFetch = global.fetch;
    global.fetch = vi.fn(() => { throw new Error('no network call must happen here'); });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env = originalEnv;
    resetConfig();
  });

  it('no LLM_API_URL means no url — not api.openai.com', () => {
    process.env.OPENAI_API_KEY = 'sk-stray';
    const config = loadConfig();
    expect(config.llm.url).toBe('');
    expect(config.llm.url).not.toContain('openai.com');
    expect(config.embeddings.url).toBe('');
  });

  it('provider=auto with a stray key resolves to none, not openai', () => {
    process.env.OPENAI_API_KEY = 'sk-stray';
    const config = loadConfig();
    expect(config.llm.provider).toBe('auto');
    expect(createLLM(config).name).toBe('none');
    expect(createEmbedder(config).name).toBe('none');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('an explicit openai provider without an endpoint fails with a usable message', () => {
    process.env.LLM_PROVIDER = 'openai';
    process.env.OPENAI_API_KEY = 'sk-stray';
    const config = loadConfig();
    expect(() => createLLM(config)).toThrow(/LLM_API_URL is not set/);
    // The message has to say what to do — an error nobody can act on gets
    // worked around instead of fixed.
    expect(() => createLLM(config)).toThrow(/gateway/i);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('requireApiUrl accepts a configured endpoint and trims it', () => {
    // Positive control: without this, the tests above would also pass if the
    // guard simply rejected everything.
    expect(requireApiUrl('  https://gateway.example.com/v1  '))
      .toBe('https://gateway.example.com/v1');
    expect(() => requireApiUrl('   ')).toThrow(/LLM_API_URL is not set/);
    expect(() => requireApiUrl(undefined)).toThrow(/LLM_API_URL is not set/);
  });

  it('OpenAI stays reachable — but only when it is named explicitly', () => {
    process.env.LLM_API_URL = 'https://api.openai.com/v1';
    process.env.OPENAI_API_KEY = 'sk-deliberate';
    const config = loadConfig();
    const llm = createLLM(config);
    expect(llm.name).toBe('openai');
    expect(llm.baseUrl).toBe('https://api.openai.com/v1');
  });
});
