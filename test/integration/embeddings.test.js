// Integration tests for the embeddings module.
// Uses a deterministic mock embedder so no real API calls happen.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';

const {
  initDatabase,
  indexParsedNote,
  upsertEmbedding,
  getEmbedding,
  getAllEmbeddings,
  getUnembeddedNotes,
  getEmbeddingStats,
  closeDatabase
} = require('../../lib/database');
const {
  cosineSimilarity,
  findSimilar,
  embedBatch,
  semanticSearch,
  buildEmbeddingText
} = require('../../lib/embeddings');
const { resetConfig } = require('../../lib/config');

let tmpDir;

function makeNote(id, title, folder = '') {
  return {
    id,
    path: id,
    title,
    folder,
    wordCount: 10,
    contentHash: `hash-${id}`,
    mtime: Date.now(),
    ctime: Date.now(),
    frontmatter: {},
    tags: [],
    links: [],
    headings: []
  };
}

// Deterministic mock vector: hash-based, normalized.
function mockVector(text, dim = 8) {
  const v = new Float32Array(dim);
  for (let i = 0; i < text.length; i++) {
    v[i % dim] += text.charCodeAt(i) / 100;
  }
  return v;
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'oi-emb-'));
  mkdirSync(tmpDir, { recursive: true });
  process.env.VAULT_INTEL_DB = join(tmpDir, 'test.db');
  resetConfig();
  initDatabase();

  const allIds = new Set(['a.md', 'b.md', 'c.md']);
  indexParsedNote(makeNote('a.md', 'Alpha'), allIds, 'apple banana cherry');
  indexParsedNote(makeNote('b.md', 'Beta'), allIds, 'banana cherry date');
  indexParsedNote(makeNote('c.md', 'Gamma'), allIds, 'something completely different');
});

afterEach(() => {
  closeDatabase();
  delete process.env.VAULT_INTEL_DB;
  resetConfig();
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
});

describe('cosineSimilarity', () => {
  it('returns 1.0 for identical vectors', () => {
    const a = new Float32Array([1, 2, 3]);
    expect(cosineSimilarity(a, a)).toBeCloseTo(1.0, 5);
  });

  it('returns 0.0 for orthogonal vectors', () => {
    const a = new Float32Array([1, 0]);
    const b = new Float32Array([0, 1]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(0.0, 5);
  });

  it('returns -1.0 for opposite vectors', () => {
    const a = new Float32Array([1, 0]);
    const b = new Float32Array([-1, 0]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(-1.0, 5);
  });

  it('returns 0 for zero vectors (avoids NaN)', () => {
    const a = new Float32Array([0, 0]);
    const b = new Float32Array([1, 2]);
    expect(cosineSimilarity(a, b)).toBe(0);
  });

  it('throws on dimension mismatch', () => {
    const a = new Float32Array([1, 2]);
    const b = new Float32Array([1, 2, 3]);
    expect(() => cosineSimilarity(a, b)).toThrow(/dimension mismatch/);
  });
});

describe('embedding storage', () => {
  it('stores and retrieves a vector', () => {
    const v = new Float32Array([0.1, 0.2, 0.3, 0.4]);
    upsertEmbedding('a.md', v, 'mock-model', 4, 'hash-a.md');
    const got = getEmbedding('a.md');
    expect(got).toBeTruthy();
    expect(got.dimensions).toBe(4);
    expect(got.model).toBe('mock-model');
    expect(got.vector[0]).toBeCloseTo(0.1);
    expect(got.vector[3]).toBeCloseTo(0.4);
  });

  it('upserts overwrites existing embedding', () => {
    upsertEmbedding('a.md', new Float32Array([1, 2]), 'm1', 2, 'h1');
    upsertEmbedding('a.md', new Float32Array([5, 6]), 'm2', 2, 'h2');
    const got = getEmbedding('a.md');
    expect(got.model).toBe('m2');
    expect(got.vector[0]).toBeCloseTo(5);
  });

  it('returns null when missing', () => {
    expect(getEmbedding('nonexistent.md')).toBeNull();
  });

  it('getAllEmbeddings filters by model', () => {
    upsertEmbedding('a.md', new Float32Array([1, 2]), 'm1', 2, '');
    upsertEmbedding('b.md', new Float32Array([3, 4]), 'm2', 2, '');
    expect(getAllEmbeddings('m1').length).toBe(1);
    expect(getAllEmbeddings('m2').length).toBe(1);
    expect(getAllEmbeddings().length).toBe(2);
  });
});

describe('getUnembeddedNotes', () => {
  it('lists notes without embeddings', () => {
    const before = getUnembeddedNotes(10);
    expect(before.length).toBe(3);

    upsertEmbedding('a.md', mockVector('a'), 'm', 8, 'hash-a.md');
    const after = getUnembeddedNotes(10);
    expect(after.length).toBe(2);
    expect(after.find(n => n.note_id === 'a.md')).toBeUndefined();
  });

  it('detects stale embeddings (content_hash mismatch)', () => {
    upsertEmbedding('a.md', mockVector('a'), 'm', 8, 'OLD_HASH');
    const stale = getUnembeddedNotes(10);
    expect(stale.find(n => n.note_id === 'a.md')).toBeTruthy();
  });
});

describe('getEmbeddingStats', () => {
  it('returns counts and model breakdown', () => {
    upsertEmbedding('a.md', mockVector('a'), 'model-x', 8, 'hash-a.md');
    upsertEmbedding('b.md', mockVector('b'), 'model-x', 8, 'hash-b.md');
    upsertEmbedding('c.md', mockVector('c'), 'model-y', 8, 'WRONG');

    const stats = getEmbeddingStats();
    expect(stats.total).toBe(3);
    expect(stats.embedded).toBe(3);
    expect(stats.fresh).toBe(2); // c is stale
    expect(stats.stale).toBe(1);
    expect(stats.models).toHaveLength(2);
  });
});

describe('findSimilar', () => {
  beforeEach(() => {
    // Build vectors where a/b are similar and c is orthogonal
    upsertEmbedding('a.md', new Float32Array([1, 0, 0, 0, 0, 0, 0, 0]), 'm', 8, 'hash-a.md');
    upsertEmbedding('b.md', new Float32Array([0.9, 0.1, 0, 0, 0, 0, 0, 0]), 'm', 8, 'hash-b.md');
    upsertEmbedding('c.md', new Float32Array([0, 0, 0, 0, 0, 0, 0, 1]), 'm', 8, 'hash-c.md');
  });

  it('returns most similar notes first', () => {
    const results = findSimilar('a.md', 5);
    expect(results[0].note_id).toBe('b.md');
    expect(results[0].score).toBeGreaterThan(0.9);
    expect(results[1].note_id).toBe('c.md');
  });

  it('excludes the query note itself', () => {
    const results = findSimilar('a.md');
    expect(results.find(r => r.note_id === 'a.md')).toBeUndefined();
  });

  it('returns empty when query note has no embedding', () => {
    expect(findSimilar('nonexistent.md')).toEqual([]);
  });

  it('respects topN limit', () => {
    expect(findSimilar('a.md', 1).length).toBe(1);
  });
});

describe('embedBatch with mock embedder', () => {
  let originalFetch;
  beforeEach(() => { originalFetch = global.fetch; });
  afterEach(() => { global.fetch = originalFetch; });

  it('throws helpful error when no provider configured', async () => {
    // No env vars => createEmbedder returns NoneEmbeddings
    const cfg = require('../../lib/config').loadConfig();
    await expect(embedBatch({ config: cfg })).rejects.toThrow(/not configured/i);
  });

  it('embeds notes via OpenAI mock', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { embedding: new Array(1536).fill(0.1) },
          { embedding: new Array(1536).fill(0.2) },
          { embedding: new Array(1536).fill(0.3) }
        ]
      })
    });

    const cfg = {
      embeddings: { provider: 'openai', apiKey: 'sk-test', model: 'text-embedding-3-small' }
    };
    const result = await embedBatch({ limit: 10, batchSize: 10, delayMs: 0, config: cfg });
    expect(result.embedded).toBe(3);
    expect(result.errors).toBe(0);
    expect(getEmbeddingStats().embedded).toBe(3);
  });

  it('records errors when embedder fails', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'server error'
    });
    const cfg = { embeddings: { provider: 'openai', apiKey: 'k' } };
    const result = await embedBatch({ limit: 10, batchSize: 10, delayMs: 0, config: cfg });
    expect(result.errors).toBeGreaterThan(0);
    expect(result.embedded).toBe(0);
  });
});

describe('semanticSearch', () => {
  let originalFetch;
  beforeEach(() => { originalFetch = global.fetch; });
  afterEach(() => { global.fetch = originalFetch; });

  it('returns ranked notes for a query', async () => {
    // Pre-seed embeddings with known vectors
    upsertEmbedding('a.md', new Float32Array([1, 0, 0, 0]), 'text-embedding-3-small', 4, 'hash-a.md');
    upsertEmbedding('b.md', new Float32Array([0.9, 0.1, 0, 0]), 'text-embedding-3-small', 4, 'hash-b.md');
    upsertEmbedding('c.md', new Float32Array([0, 0, 0, 1]), 'text-embedding-3-small', 4, 'hash-c.md');

    // Mock fetch to return a query vector matching 'a'
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ embedding: [1, 0, 0, 0] }]
      })
    });

    const cfg = {
      embeddings: { provider: 'openai', apiKey: 'k', model: 'text-embedding-3-small', dimensions: 4 }
    };
    const results = await semanticSearch('test query', 5, cfg);
    expect(results.length).toBe(3);
    expect(results[0].note_id).toBe('a.md');
    expect(results[0].score).toBeCloseTo(1.0, 3);
  });

  it('returns empty array when no embeddings exist for the model', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ embedding: [1, 0] }] })
    });
    const cfg = {
      embeddings: { provider: 'openai', apiKey: 'k', dimensions: 2 }
    };
    const results = await semanticSearch('q', 5, cfg);
    expect(results).toEqual([]);
  });
});

describe('buildEmbeddingText', () => {
  it('combines title, folder, tags and content', () => {
    const text = buildEmbeddingText('a.md', 'My Note', 'work/projects', 'body content');
    expect(text).toContain('Title: My Note');
    expect(text).toContain('Folder: work/projects');
    expect(text).toContain('body content');
  });

  it('truncates long content', () => {
    const longContent = 'x'.repeat(5000);
    const text = buildEmbeddingText('a.md', 'T', '', longContent);
    expect(text.length).toBeLessThan(2200);
  });
});
