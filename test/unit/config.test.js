import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { loadConfig, resetConfig } from '../../lib/config.js';

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
