// Tests for LLM provider adapters and the factory.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const { createLLM, detectProvider } = require('../../lib/adapters/llm');
const { OpenAILLM } = require('../../lib/adapters/llm/openai');
const { OllamaLLM } = require('../../lib/adapters/llm/ollama');
const { NoneLLM } = require('../../lib/adapters/llm/none');
const { LLMAdapter } = require('../../lib/adapters/llm/base');

describe('LLM adapter factory', () => {
  it('returns NoneLLM when provider=none', () => {
    const llm = createLLM({ llm: { provider: 'none' } });
    expect(llm).toBeInstanceOf(NoneLLM);
    expect(llm.name).toBe('none');
  });

  it('returns OpenAILLM when provider=openai', () => {
    const llm = createLLM({ llm: { provider: 'openai', apiKey: 'sk-test', model: 'gpt-4' } });
    expect(llm).toBeInstanceOf(OpenAILLM);
    expect(llm.name).toBe('openai');
    expect(llm.model).toBe('gpt-4');
  });

  it('returns OllamaLLM when provider=ollama', () => {
    const llm = createLLM({ llm: { provider: 'ollama', model: 'llama3.2' } });
    expect(llm).toBeInstanceOf(OllamaLLM);
    expect(llm.name).toBe('ollama');
  });

  it('auto: picks openai when apiKey is set', () => {
    const llm = createLLM({ llm: { provider: 'auto', apiKey: 'sk-test' } });
    expect(llm.name).toBe('openai');
  });

  it('auto: picks none when no apiKey is set', () => {
    const llm = createLLM({ llm: { provider: 'auto' } });
    expect(llm.name).toBe('none');
  });

  it('throws on unknown provider', () => {
    expect(() => createLLM({ llm: { provider: 'huggingface' } })).toThrow(/unknown LLM provider/i);
  });

  it('handles missing llm config gracefully (defaults to auto/none)', () => {
    const llm = createLLM({});
    expect(llm.name).toBe('none');
  });
});

describe('NoneLLM', () => {
  it('chat() throws helpful error', async () => {
    const llm = new NoneLLM({});
    await expect(llm.chat({ messages: [] })).rejects.toThrow(/disabled/i);
  });

  it('test() returns false', async () => {
    const llm = new NoneLLM({});
    expect(await llm.test()).toBe(false);
  });
});

describe('OpenAILLM url normalization', () => {
  it('keeps /v1 suffix if present', () => {
    const llm = new OpenAILLM({ url: 'https://api.openai.com/v1', apiKey: 'k' });
    expect(llm.baseUrl).toBe('https://api.openai.com/v1');
  });

  it('appends /v1 if missing', () => {
    const llm = new OpenAILLM({ url: 'https://api.example.com', apiKey: 'k' });
    expect(llm.baseUrl).toBe('https://api.example.com/v1');
  });

  it('strips trailing slash', () => {
    const llm = new OpenAILLM({ url: 'https://api.example.com/v1/', apiKey: 'k' });
    expect(llm.baseUrl).toBe('https://api.example.com/v1');
  });

  it('throws if no apiKey', async () => {
    const llm = new OpenAILLM({ url: 'https://api.openai.com/v1' });
    await expect(llm.chat({ messages: [{ role: 'user', content: 'hi' }] })).rejects.toThrow(/api key/i);
  });
});

describe('OpenAILLM via mocked fetch', () => {
  let originalFetch;
  beforeEach(() => { originalFetch = global.fetch; });
  afterEach(() => { global.fetch = originalFetch; });

  it('parses successful response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        model: 'gpt-4o-mini',
        choices: [{ message: { content: 'hello world' } }],
        usage: { prompt_tokens: 5, completion_tokens: 2 }
      })
    });

    const llm = new OpenAILLM({ url: 'https://api.openai.com/v1', apiKey: 'sk-test', model: 'gpt-4o-mini' });
    const reply = await llm.chat({ messages: [{ role: 'user', content: 'hi' }] });
    expect(reply).toBe('hello world');
    expect(global.fetch).toHaveBeenCalledOnce();
    expect(global.fetch.mock.calls[0][0]).toBe('https://api.openai.com/v1/chat/completions');
  });

  it('returnMeta returns full object', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        model: 'gpt-4o-mini',
        choices: [{ message: { content: 'OK' } }],
        usage: { prompt_tokens: 5, completion_tokens: 1 }
      })
    });

    const llm = new OpenAILLM({ apiKey: 'k' });
    const result = await llm.chat({ messages: [{ role: 'user', content: 'hi' }], returnMeta: true });
    expect(result).toMatchObject({ content: 'OK', model: 'gpt-4o-mini' });
    expect(result.usage).toBeTruthy();
  });

  it('throws on HTTP error', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => '{"error":"unauthorized"}'
    });

    const llm = new OpenAILLM({ apiKey: 'bad' });
    await expect(llm.chat({ messages: [{ role: 'user', content: 'hi' }] })).rejects.toThrow(/401/);
  });

  it('throws on API error in body', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ error: { message: 'rate limit' } })
    });

    const llm = new OpenAILLM({ apiKey: 'k' });
    await expect(llm.chat({ messages: [{ role: 'user', content: 'hi' }] })).rejects.toThrow(/rate limit/);
  });
});

describe('OllamaLLM via mocked fetch', () => {
  let originalFetch;
  beforeEach(() => { originalFetch = global.fetch; });
  afterEach(() => { global.fetch = originalFetch; });

  it('parses successful response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        model: 'llama3.2',
        message: { role: 'assistant', content: 'hi from ollama' },
        prompt_eval_count: 4,
        eval_count: 5
      })
    });

    const llm = new OllamaLLM({ model: 'llama3.2' });
    const reply = await llm.chat({ messages: [{ role: 'user', content: 'hello' }] });
    expect(reply).toBe('hi from ollama');
    expect(global.fetch.mock.calls[0][0]).toBe('http://localhost:11434/api/chat');
  });

  it('test() pings /api/tags (cheap probe)', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true });
    const llm = new OllamaLLM({});
    expect(await llm.test()).toBe(true);
    expect(global.fetch.mock.calls[0][0]).toBe('http://localhost:11434/api/tags');
  });

  it('test() returns false on network error', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const llm = new OllamaLLM({});
    expect(await llm.test()).toBe(false);
  });
});

describe('detectProvider (async)', () => {
  let originalFetch;
  beforeEach(() => { originalFetch = global.fetch; });
  afterEach(() => { global.fetch = originalFetch; });

  it('returns explicit provider when set', async () => {
    const provider = await detectProvider({ llm: { provider: 'openai', apiKey: 'k' } });
    expect(provider).toBe('openai');
  });

  it('returns openai when apiKey is set and provider=auto', async () => {
    const provider = await detectProvider({ llm: { provider: 'auto', apiKey: 'k' } });
    expect(provider).toBe('openai');
  });

  it('returns ollama when ollama is reachable', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true });
    const provider = await detectProvider({ llm: {} });
    expect(provider).toBe('ollama');
  });

  it('returns none when nothing is reachable', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('refused'));
    const provider = await detectProvider({ llm: {} });
    expect(provider).toBe('none');
  });
});

describe('LLMAdapter base', () => {
  it('chat() throws not-implemented', async () => {
    const a = new LLMAdapter({});
    await expect(a.chat({})).rejects.toThrow(/not implemented/);
  });
});
