// Google Gemini embeddings adapter.
// Default model: gemini-embedding-001 (768 dim, free tier available).
// Uses the batchEmbedContents endpoint for efficient batching.

const { EmbeddingsAdapter } = require('./base');

class GeminiEmbeddings extends EmbeddingsAdapter {
  constructor(config) {
    super(config);
    this.apiKey = config.apiKey || '';
    this._model = config.model || 'gemini-embedding-001';
    this._dimensions = config.dimensions || 768;
    this.baseUrl = (config.url || 'https://generativelanguage.googleapis.com').replace(/\/+$/, '');
  }

  get name() { return 'gemini'; }
  get model() { return this._model; }
  get dimensions() { return this._dimensions; }

  async embed(texts, taskType = 'document') {
    if (!this.apiKey) {
      throw new Error('Gemini embeddings: GEMINI_API_KEY not set');
    }
    if (!Array.isArray(texts) || texts.length === 0) return [];

    const apiTaskType = taskType === 'query' ? 'RETRIEVAL_QUERY' : 'RETRIEVAL_DOCUMENT';

    const body = JSON.stringify({
      requests: texts.map(text => ({
        model: `models/${this._model}`,
        content: { parts: [{ text }] },
        taskType: apiTaskType,
        outputDimensionality: this._dimensions
      }))
    });

    const url = `${this.baseUrl}/v1beta/models/${this._model}:batchEmbedContents?key=${this.apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Gemini embeddings ${response.status}: ${text.substring(0, 300)}`);
    }

    const result = await response.json();
    if (!result.embeddings) {
      throw new Error('Gemini embeddings: unexpected response format');
    }
    return result.embeddings.map(e => new Float32Array(e.values));
  }
}

module.exports = { GeminiEmbeddings };
