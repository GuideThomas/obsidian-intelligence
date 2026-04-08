// Tests for embeddings provider adapters and the factory.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const { createEmbedder, detectEmbeddingsProvider } = require('../../lib/adapters/embeddings');
const { OpenAIEmbeddings } = require('../../lib/adapters/embeddings/openai');
const { GeminiEmbeddings } = require('../../lib/adapters/embeddings/gemini');
const { OllamaEmbeddings } = require('../../lib/adapters/embeddings/ollama');
const { NoneEmbeddings } = require('../../lib/adapters/embeddings/none');
const { EmbeddingsAdapter } = require('../../lib/adapters/embeddings/base');

describe('Embeddings adapter factory', () => {
  it('returns NoneEmbeddings when provider=none', () => {
    const e = createEmbedder({ embeddings: { provider: 'none' } });
    expect(e).toBeInstanceOf(NoneEmbeddings);
    expect(e.dimensions).toBe(0);
  });

  it('returns GeminiEmbeddings when provider=gemini', () => {
    const e = createEmbedder({ embeddings: { provider: 'gemini', geminiApiKey: 'k' } });
    expect(e).toBeInstanceOf(GeminiEmbeddings);
    expect(e.dimensions).toBe(768);
  });

  it('returns OpenAIEmbeddings when provider=openai', () => {
    const e = createEmbedder({ embeddings: { provider: 'openai', apiKey: 'k' } });
    expect(e).toBeInstanceOf(OpenAIEmbeddings);
    expect(e.dimensions).toBe(1536);
    expect(e.model).toBe('text-embedding-3-small');
  });

  it('returns OllamaEmbeddings when provider=ollama', () => {
    const e = createEmbedder({ embeddings: { provider: 'ollama' } });
    expect(e).toBeInstanceOf(OllamaEmbeddings);
    expect(e.dimensions).toBe(768);
    expect(e.model).toBe('nomic-embed-text');
  });

  it('auto: prefers gemini over openai when both keys are set', () => {
    const e = createEmbedder({ embeddings: { provider: 'auto', geminiApiKey: 'g', apiKey: 'o' } });
    expect(e.name).toBe('gemini');
  });

  it('auto: falls back to openai if only LLM key', () => {
    const e = createEmbedder({ embeddings: { provider: 'auto', apiKey: 'o' } });
    expect(e.name).toBe('openai');
  });

  it('auto: returns none if nothing configured', () => {
    const e = createEmbedder({ embeddings: { provider: 'auto' } });
    expect(e.name).toBe('none');
  });

  it('respects custom dimensions override', () => {
    const e = createEmbedder({ embeddings: { provider: 'openai', apiKey: 'k', dimensions: 512 } });
    expect(e.dimensions).toBe(512);
  });

  it('throws on unknown provider', () => {
    expect(() => createEmbedder({ embeddings: { provider: 'cohere' } })).toThrow(/unknown embeddings/i);
  });
});

describe('NoneEmbeddings', () => {
  it('throws on embed()', async () => {
    const e = new NoneEmbeddings({});
    await expect(e.embed(['hi'])).rejects.toThrow(/disabled/i);
  });

  it('test() returns false', async () => {
    const e = new NoneEmbeddings({});
    expect(await e.test()).toBe(false);
  });
});

describe('OpenAIEmbeddings via mocked fetch', () => {
  let originalFetch;
  beforeEach(() => { originalFetch = global.fetch; });
  afterEach(() => { global.fetch = originalFetch; });

  it('embeds texts and returns Float32Array per input', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { embedding: new Array(1536).fill(0.1) },
          { embedding: new Array(1536).fill(0.2) }
        ]
      })
    });

    const e = new OpenAIEmbeddings({ apiKey: 'k' });
    const result = await e.embed(['foo', 'bar']);
    expect(result).toHaveLength(2);
    expect(result[0]).toBeInstanceOf(Float32Array);
    expect(result[0].length).toBe(1536);
    expect(result[0][0]).toBeCloseTo(0.1);
  });

  it('returns empty array on empty input', async () => {
    const e = new OpenAIEmbeddings({ apiKey: 'k' });
    expect(await e.embed([])).toEqual([]);
  });

  it('throws on missing apiKey', async () => {
    const e = new OpenAIEmbeddings({});
    await expect(e.embed(['hi'])).rejects.toThrow(/api key/i);
  });

  it('throws on HTTP error', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => 'rate limited'
    });
    const e = new OpenAIEmbeddings({ apiKey: 'k' });
    await expect(e.embed(['hi'])).rejects.toThrow(/429/);
  });
});

describe('GeminiEmbeddings via mocked fetch', () => {
  let originalFetch;
  beforeEach(() => { originalFetch = global.fetch; });
  afterEach(() => { global.fetch = originalFetch; });

  it('embeds texts and returns Float32Array per input', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        embeddings: [
          { values: new Array(768).fill(0.3) },
          { values: new Array(768).fill(0.4) }
        ]
      })
    });

    const e = new GeminiEmbeddings({ apiKey: 'k' });
    const result = await e.embed(['foo', 'bar'], 'document');
    expect(result).toHaveLength(2);
    expect(result[0]).toBeInstanceOf(Float32Array);
    expect(result[0].length).toBe(768);
  });

  it('uses RETRIEVAL_QUERY task type for queries', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ embeddings: [{ values: new Array(768).fill(0) }] })
    });

    const e = new GeminiEmbeddings({ apiKey: 'k' });
    await e.embed(['query'], 'query');
    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.requests[0].taskType).toBe('RETRIEVAL_QUERY');
  });
});

describe('OllamaEmbeddings via mocked fetch', () => {
  let originalFetch;
  beforeEach(() => { originalFetch = global.fetch; });
  afterEach(() => { global.fetch = originalFetch; });

  it('embeds texts via /api/embed', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        embeddings: [new Array(768).fill(0.5), new Array(768).fill(0.6)]
      })
    });

    const e = new OllamaEmbeddings({});
    const result = await e.embed(['foo', 'bar']);
    expect(result).toHaveLength(2);
    expect(result[1][0]).toBeCloseTo(0.6);
    expect(global.fetch.mock.calls[0][0]).toBe('http://localhost:11434/api/embed');
  });
});

describe('detectEmbeddingsProvider (async)', () => {
  let originalFetch;
  beforeEach(() => { originalFetch = global.fetch; });
  afterEach(() => { global.fetch = originalFetch; });

  it('returns explicit provider when set', async () => {
    const provider = await detectEmbeddingsProvider({ embeddings: { provider: 'openai', apiKey: 'k' } });
    expect(provider).toBe('openai');
  });

  it('prefers gemini over openai when both keys present', async () => {
    const provider = await detectEmbeddingsProvider({ embeddings: { geminiApiKey: 'g', apiKey: 'o' } });
    expect(provider).toBe('gemini');
  });

  it('detects ollama when reachable', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ embeddings: [new Array(768).fill(0)] })
    });
    const provider = await detectEmbeddingsProvider({ embeddings: {} });
    expect(provider).toBe('ollama');
  });

  it('returns none if nothing reachable', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('refused'));
    const provider = await detectEmbeddingsProvider({ embeddings: {} });
    expect(provider).toBe('none');
  });
});

describe('EmbeddingsAdapter base', () => {
  it('embed() throws not-implemented', async () => {
    const a = new EmbeddingsAdapter({});
    await expect(a.embed(['hi'])).rejects.toThrow(/not implemented/);
  });
});
