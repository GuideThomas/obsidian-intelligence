// OpenAI embeddings adapter.
// Default model: text-embedding-3-small (1536 dim, $0.02/M tokens).
// Also works with any OpenAI-compatible /v1/embeddings endpoint.

const { EmbeddingsAdapter } = require('./base');

const MODEL_DIMS = {
  'text-embedding-3-small': 1536,
  'text-embedding-3-large': 3072,
  'text-embedding-ada-002': 1536
};

class OpenAIEmbeddings extends EmbeddingsAdapter {
  constructor(config) {
    super(config);
    const raw = (config.url || 'https://api.openai.com/v1').replace(/\/+$/, '');
    this.baseUrl = raw.endsWith('/v1') ? raw : `${raw}/v1`;
    this.apiKey = config.apiKey || '';
    this._model = config.model || 'text-embedding-3-small';
    this._dimensions = config.dimensions || MODEL_DIMS[this._model] || 1536;
  }

  get name() { return 'openai'; }
  get model() { return this._model; }
  get dimensions() { return this._dimensions; }

  async embed(texts, _taskType = 'document') {
    if (!this.apiKey) {
      throw new Error('OpenAI embeddings: API key not set');
    }
    if (!Array.isArray(texts) || texts.length === 0) return [];

    const body = JSON.stringify({
      model: this._model,
      input: texts,
      // Only set dimensions for models that support it (3-small, 3-large)
      ...(this._model.startsWith('text-embedding-3') ? { dimensions: this._dimensions } : {})
    });

    const response = await fetch(`${this.baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`OpenAI embeddings ${response.status}: ${text.substring(0, 300)}`);
    }

    const result = await response.json();
    if (!result.data) {
      throw new Error('OpenAI embeddings: unexpected response format');
    }
    return result.data.map(d => new Float32Array(d.embedding));
  }
}

module.exports = { OpenAIEmbeddings };
