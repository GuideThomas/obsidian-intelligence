// Ollama local embeddings adapter.
// Default model: nomic-embed-text (768 dim, ~270 MB, runs on CPU).
// Other good options: mxbai-embed-large (1024 dim), all-minilm (384 dim).
// Pull first: `ollama pull nomic-embed-text`

const { EmbeddingsAdapter } = require('./base');

const MODEL_DIMS = {
  'nomic-embed-text': 768,
  'mxbai-embed-large': 1024,
  'all-minilm': 384,
  'snowflake-arctic-embed': 1024
};

class OllamaEmbeddings extends EmbeddingsAdapter {
  constructor(config) {
    super(config);
    this.baseUrl = (config.url || 'http://localhost:11434').replace(/\/+$/, '');
    this._model = config.model || 'nomic-embed-text';
    this._dimensions = config.dimensions || MODEL_DIMS[this._model] || 768;
  }

  get name() { return 'ollama'; }
  get model() { return this._model; }
  get dimensions() { return this._dimensions; }

  async embed(texts, _taskType = 'document') {
    if (!Array.isArray(texts) || texts.length === 0) return [];

    // Ollama's /api/embed supports batched input as of v0.3.x.
    const body = JSON.stringify({
      model: this._model,
      input: texts
    });

    const response = await fetch(`${this.baseUrl}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Ollama embeddings ${response.status}: ${text.substring(0, 300)}`);
    }

    const result = await response.json();
    if (!result.embeddings || !Array.isArray(result.embeddings)) {
      throw new Error('Ollama embeddings: unexpected response (need v0.3.x or newer)');
    }
    return result.embeddings.map(arr => new Float32Array(arr));
  }
}

module.exports = { OllamaEmbeddings };
