// No-op embeddings adapter. Used when no provider is configured.

const { EmbeddingsAdapter } = require('./base');

class NoneEmbeddings extends EmbeddingsAdapter {
  get name() { return 'none'; }
  get model() { return 'none'; }
  get dimensions() { return 0; }

  async embed() {
    throw new Error(
      'Semantic search is disabled. To enable, set EMBEDDINGS_PROVIDER and provider config in .env.\n' +
      '  - For local Ollama: EMBEDDINGS_PROVIDER=ollama (and `ollama pull nomic-embed-text`)\n' +
      '  - For Gemini (free tier): EMBEDDINGS_PROVIDER=gemini, GEMINI_API_KEY\n' +
      '  - For OpenAI: EMBEDDINGS_PROVIDER=openai, LLM_API_KEY (or EMBEDDINGS_API_KEY)\n' +
      'See docs/PROVIDERS.md for the full provider matrix.'
    );
  }

  async test() { return false; }
}

module.exports = { NoneEmbeddings };
