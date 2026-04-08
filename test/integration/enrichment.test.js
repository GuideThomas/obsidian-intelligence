// Integration tests for LLM metadata enrichment.
// Uses mocked fetch to simulate LLM responses.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';

const {
  initDatabase,
  indexParsedNote,
  upsertEnrichment,
  getEnrichment,
  getUnenrichedNotes,
  getEnrichmentStats,
  closeDatabase
} = require('../../lib/database');
const {
  CATEGORIES,
  parseEnrichmentResponse,
  enrichBatch
} = require('../../lib/enrichment');
const { resetConfig } = require('../../lib/config');

let tmpDir;

function makeNote(id, title, folder = '') {
  return {
    id, path: id, title, folder,
    wordCount: 10,
    contentHash: `hash-${id}`,
    mtime: Date.now(), ctime: Date.now(),
    frontmatter: {}, tags: [], links: [], headings: []
  };
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'oi-enrich-'));
  mkdirSync(tmpDir, { recursive: true });
  process.env.VAULT_INTEL_DB = join(tmpDir, 'test.db');
  resetConfig();
  initDatabase();

  const allIds = new Set(['a.md', 'b.md', 'c.md']);
  indexParsedNote(makeNote('a.md', 'LED driver basics', 'tech'), allIds, 'A long-enough body about constant-current LED drivers and dimming techniques used in modern lighting.');
  indexParsedNote(makeNote('b.md', 'Sprint planning', 'work'), allIds, 'Notes from this week sprint planning meeting with the team about the catalog migration project.');
  indexParsedNote(makeNote('c.md', 'Tiny', 'misc'), allIds, 'short');
});

afterEach(() => {
  closeDatabase();
  delete process.env.VAULT_INTEL_DB;
  resetConfig();
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
});

describe('parseEnrichmentResponse', () => {
  it('parses valid JSON', () => {
    const r = parseEnrichmentResponse('{"category":"tech","summary":"about LEDs","entities":["LED"],"language":"en"}');
    expect(r.category).toBe('tech');
    expect(r.summary).toBe('about LEDs');
    expect(r.entities).toEqual(['LED']);
    expect(r.language).toBe('en');
  });

  it('extracts JSON wrapped in markdown code fences', () => {
    const wrapped = '```json\n{"category":"tech","summary":"x","entities":[],"language":"en"}\n```';
    const r = parseEnrichmentResponse(wrapped);
    expect(r).toBeTruthy();
    expect(r.category).toBe('tech');
  });

  it('extracts JSON with leading prose', () => {
    const wrapped = 'Here is the metadata:\n{"category":"ai","summary":"test","entities":[],"language":"en"}';
    const r = parseEnrichmentResponse(wrapped);
    expect(r.category).toBe('ai');
  });

  it('coerces invalid category to "other"', () => {
    const r = parseEnrichmentResponse('{"category":"unicorns","summary":"x","entities":[],"language":"en"}');
    expect(r.category).toBe('other');
  });

  it('coerces invalid language to "en"', () => {
    const r = parseEnrichmentResponse('{"category":"tech","summary":"x","entities":[],"language":"klingon"}');
    expect(r.language).toBe('en');
  });

  it('truncates summary to 500 chars', () => {
    const long = 'x'.repeat(1000);
    const r = parseEnrichmentResponse(`{"category":"tech","summary":"${long}","entities":[],"language":"en"}`);
    expect(r.summary.length).toBe(500);
  });

  it('caps entities to 8', () => {
    const arr = JSON.stringify(new Array(20).fill('Tool'));
    const r = parseEnrichmentResponse(`{"category":"tech","summary":"x","entities":${arr},"language":"en"}`);
    expect(r.entities.length).toBe(8);
  });

  it('returns null for missing JSON', () => {
    expect(parseEnrichmentResponse('not json')).toBeNull();
    expect(parseEnrichmentResponse('')).toBeNull();
    expect(parseEnrichmentResponse(null)).toBeNull();
  });

  it('returns null for malformed JSON', () => {
    expect(parseEnrichmentResponse('{not valid')).toBeNull();
  });

  it('handles missing fields gracefully', () => {
    const r = parseEnrichmentResponse('{"category":"tech"}');
    expect(r.category).toBe('tech');
    expect(r.summary).toBe('');
    expect(r.entities).toEqual([]);
    expect(r.language).toBe('en');
  });
});

describe('enrichment storage', () => {
  it('upserts and retrieves enrichment', () => {
    upsertEnrichment('a.md', {
      category: 'tech',
      summary: 'LED stuff',
      entities: ['LED', 'driver'],
      language: 'en',
      content_hash: 'hash-a.md'
    });
    const got = getEnrichment('a.md');
    expect(got).toBeTruthy();
    expect(got.category).toBe('tech');
    expect(got.entities).toEqual(['LED', 'driver']);
  });

  it('overwrites on duplicate insert', () => {
    upsertEnrichment('a.md', { category: 'tech', summary: 'v1', entities: [], language: 'en' });
    upsertEnrichment('a.md', { category: 'ai', summary: 'v2', entities: [], language: 'en' });
    const got = getEnrichment('a.md');
    expect(got.category).toBe('ai');
    expect(got.summary).toBe('v2');
  });

  it('returns null when missing', () => {
    expect(getEnrichment('nonexistent.md')).toBeNull();
  });
});

describe('getUnenrichedNotes', () => {
  it('lists notes without enrichment', () => {
    expect(getUnenrichedNotes(10).length).toBe(3);
    upsertEnrichment('a.md', { category: 'tech', summary: 'x', entities: [], language: 'en', content_hash: 'hash-a.md' });
    expect(getUnenrichedNotes(10).length).toBe(2);
  });

  it('detects stale enrichment via content_hash mismatch', () => {
    upsertEnrichment('a.md', { category: 'tech', summary: 'x', entities: [], language: 'en', content_hash: 'OLD' });
    const stale = getUnenrichedNotes(10);
    expect(stale.find(n => n.note_id === 'a.md')).toBeTruthy();
  });
});

describe('getEnrichmentStats', () => {
  it('reports counts and category breakdown', () => {
    upsertEnrichment('a.md', { category: 'tech', summary: 'x', entities: [], language: 'en', content_hash: 'hash-a.md' });
    upsertEnrichment('b.md', { category: 'tech', summary: 'x', entities: [], language: 'en', content_hash: 'hash-b.md' });
    upsertEnrichment('c.md', { category: 'work', summary: 'x', entities: [], language: 'en', content_hash: 'WRONG' });

    const stats = getEnrichmentStats();
    expect(stats.total).toBe(3);
    expect(stats.enriched).toBe(3);
    expect(stats.fresh).toBe(2);
    expect(stats.stale).toBe(1);
    expect(stats.categories.find(c => c.category === 'tech').count).toBe(2);
  });
});

describe('enrichBatch with mocked LLM', () => {
  let originalFetch;
  beforeEach(() => { originalFetch = global.fetch; });
  afterEach(() => { global.fetch = originalFetch; });

  it('throws when no LLM provider is configured', async () => {
    await expect(enrichBatch({ config: {} })).rejects.toThrow(/not configured/i);
  });

  it('enriches notes via openai mock', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: '{"category":"tech","summary":"about LEDs","entities":["LED"],"language":"en"}'
          }
        }]
      })
    });

    const cfg = { llm: { provider: 'openai', apiKey: 'k', model: 'gpt-4o-mini' } };
    const result = await enrichBatch({ limit: 10, delayMs: 0, config: cfg });

    // Note 'c.md' has body 'short' (< 30 chars) so it gets skipped
    expect(result.enriched).toBe(2);
    expect(result.errors).toBe(0);
    expect(getEnrichment('a.md')).toBeTruthy();
    expect(getEnrichment('a.md').category).toBe('tech');
  });

  it('records errors when LLM call fails', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'server error'
    });
    const cfg = { llm: { provider: 'openai', apiKey: 'k' } };
    const result = await enrichBatch({ limit: 10, delayMs: 0, config: cfg });
    expect(result.errors).toBeGreaterThan(0);
    expect(result.enriched).toBe(0);
  });

  it('skips notes when LLM returns unparseable JSON', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'sorry I cannot do that' } }] })
    });
    const cfg = { llm: { provider: 'openai', apiKey: 'k' } };
    const result = await enrichBatch({ limit: 10, delayMs: 0, config: cfg });
    expect(result.enriched).toBe(0);
    expect(result.errors).toBe(0);
  });
});

describe('CATEGORIES export', () => {
  it('exposes the category list', () => {
    expect(CATEGORIES).toContain('tech');
    expect(CATEGORIES).toContain('other');
    expect(CATEGORIES.length).toBeGreaterThanOrEqual(10);
  });
});
