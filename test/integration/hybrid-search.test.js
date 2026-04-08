// Integration tests for hybrid search (FTS + semantic via RRF).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';

const {
  initDatabase,
  indexParsedNote,
  upsertEmbedding,
  closeDatabase
} = require('../../lib/database');
const { hybridSearch } = require('../../lib/search');
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
  tmpDir = mkdtempSync(join(tmpdir(), 'oi-hybrid-'));
  mkdirSync(tmpDir, { recursive: true });
  process.env.VAULT_INTEL_DB = join(tmpDir, 'test.db');
  resetConfig();
  initDatabase();

  const allIds = new Set(['a.md', 'b.md', 'c.md', 'd.md']);
  indexParsedNote(makeNote('a.md', 'LED driver basics', 'tech'), allIds, 'constant current LED drivers and dimming');
  indexParsedNote(makeNote('b.md', 'Lighting control', 'tech'), allIds, 'DALI bus protocol for lighting automation');
  indexParsedNote(makeNote('c.md', 'Spectral analysis', 'tech'), allIds, 'CCT and CRI for white LEDs');
  indexParsedNote(makeNote('d.md', 'Gardening', 'home'), allIds, 'tomatoes and full sun');
});

afterEach(() => {
  closeDatabase();
  delete process.env.VAULT_INTEL_DB;
  resetConfig();
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
});

describe('hybridSearch - keyword only (no embeddings)', () => {
  it('falls back to FTS-only when no embeddings exist', async () => {
    const result = await hybridSearch('LED');
    expect(result.fts_count).toBeGreaterThan(0);
    expect(result.semantic_count).toBe(0);
    expect(result.results.every(r => r.found_in === 'keyword')).toBe(true);
  });

  it('marks results as found_in=keyword when no semantic match', async () => {
    const result = await hybridSearch('LED');
    expect(result.results[0].found_in).toBe('keyword');
    expect(result.results[0].rrf_score).toBeGreaterThan(0);
  });

  it('returns empty for empty query', async () => {
    const result = await hybridSearch('');
    expect(result.results).toEqual([]);
  });
});

describe('hybridSearch - keyword + semantic via RRF', () => {
  let originalFetch;
  beforeEach(() => {
    originalFetch = global.fetch;
    // Pre-seed embeddings for all notes (4 dim, mock)
    upsertEmbedding('a.md', new Float32Array([1, 0, 0, 0]), 'text-embedding-3-small', 4, 'hash-a.md');
    upsertEmbedding('b.md', new Float32Array([0.8, 0.2, 0, 0]), 'text-embedding-3-small', 4, 'hash-b.md');
    upsertEmbedding('c.md', new Float32Array([0, 1, 0, 0]), 'text-embedding-3-small', 4, 'hash-c.md');
    upsertEmbedding('d.md', new Float32Array([0, 0, 0, 1]), 'text-embedding-3-small', 4, 'hash-d.md');
  });
  afterEach(() => { global.fetch = originalFetch; });

  it('merges FTS and semantic results, marking overlap as both', async () => {
    // Mock query embedding aligned with a.md
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ embedding: [1, 0, 0, 0] }] })
    });

    const cfg = {
      embeddings: { provider: 'openai', apiKey: 'k', model: 'text-embedding-3-small', dimensions: 4 }
    };
    const result = await hybridSearch('LED', { config: cfg });

    expect(result.fts_count).toBeGreaterThan(0);
    expect(result.semantic_count).toBeGreaterThan(0);
    // a.md should be found in both since it matches LED and is closest semantically
    const a = result.results.find(r => r.note_id === 'a.md');
    expect(a).toBeTruthy();
    expect(a.found_in).toBe('both');
    expect(a.fts_rank).toBeTruthy();
    expect(a.semantic_rank).toBeTruthy();
  });

  it('includes semantic-only matches with found_in=semantic', async () => {
    // Query for something only semantically related (no keyword in any note)
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ embedding: [0, 0, 0, 1] }] })
    });

    const cfg = {
      embeddings: { provider: 'openai', apiKey: 'k', model: 'text-embedding-3-small', dimensions: 4 }
    };
    // Query word that's not in any note
    const result = await hybridSearch('quantum', { config: cfg });

    expect(result.fts_count).toBe(0);
    expect(result.semantic_count).toBeGreaterThan(0);
    expect(result.results.every(r => r.found_in === 'semantic')).toBe(true);
    expect(result.results[0].note_id).toBe('d.md'); // closest to [0,0,0,1]
  });

  it('respects limit parameter', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ embedding: [1, 0, 0, 0] }] })
    });
    const cfg = {
      embeddings: { provider: 'openai', apiKey: 'k', dimensions: 4 }
    };
    const result = await hybridSearch('LED', { limit: 1, config: cfg });
    expect(result.results.length).toBeLessThanOrEqual(1);
  });
});

describe('hybridSearch - semantic provider failure', () => {
  let originalFetch;
  beforeEach(() => { originalFetch = global.fetch; });
  afterEach(() => { global.fetch = originalFetch; });

  it('falls back to FTS when semantic search throws', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network down'));
    const cfg = { embeddings: { provider: 'openai', apiKey: 'k' } };
    const result = await hybridSearch('LED', { config: cfg });
    expect(result.fts_count).toBeGreaterThan(0);
    expect(result.semantic_used).toBe(false);
    expect(result.results.every(r => r.found_in === 'keyword')).toBe(true);
  });

  it('falls back when no embeddings provider configured', async () => {
    const result = await hybridSearch('LED', { config: {} });
    // semanticSearch with NoneEmbeddings throws, hybrid catches and continues
    expect(result.fts_count).toBeGreaterThan(0);
    expect(result.semantic_used).toBe(false);
  });
});

describe('hybridSearch - RRF formula', () => {
  let originalFetch;
  beforeEach(() => { originalFetch = global.fetch; });
  afterEach(() => { global.fetch = originalFetch; });

  it('a doc that ranks #1 in both keyword and semantic should win', async () => {
    // Re-index a and b with a shared keyword 'sharedterm' so FTS finds both.
    indexParsedNote(makeNote('a.md', 'LED driver basics', 'tech'), new Set(['a.md', 'b.md', 'c.md', 'd.md']), 'sharedterm constant current LED drivers');
    indexParsedNote(makeNote('b.md', 'Lighting control', 'tech'), new Set(['a.md', 'b.md', 'c.md', 'd.md']), 'sharedterm DALI bus protocol');

    upsertEmbedding('a.md', new Float32Array([1, 0]), 'm', 2, 'hash-a.md');
    upsertEmbedding('b.md', new Float32Array([0, 1]), 'm', 2, 'hash-b.md');

    // Query embedding aligns with a.md
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ embedding: [1, 0] }] })
    });
    const cfg = { embeddings: { provider: 'openai', apiKey: 'k', model: 'm', dimensions: 2 } };

    const result = await hybridSearch('sharedterm', { config: cfg });

    // Both should match FTS, both should match semantic (model 'm')
    expect(result.fts_count).toBeGreaterThanOrEqual(2);
    expect(result.semantic_count).toBeGreaterThanOrEqual(2);

    const a = result.results.find(r => r.note_id === 'a.md');
    const b = result.results.find(r => r.note_id === 'b.md');
    expect(a).toBeTruthy();
    expect(b).toBeTruthy();
    // a.md should win because it ranks higher semantically
    expect(a.rrf_score).toBeGreaterThanOrEqual(b.rrf_score);
    expect(a.found_in).toBe('both');
  });
});
