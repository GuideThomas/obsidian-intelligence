// No-op LLM adapter. Used when no provider is configured.
// All chat() calls throw a helpful error pointing to the docs.

const { LLMAdapter } = require('./base');

class NoneLLM extends LLMAdapter {
  get name() { return 'none'; }
  get model() { return 'none'; }

  async chat() {
    throw new Error(
      'LLM features are disabled. To enable, set LLM_PROVIDER and provider config in .env.\n' +
      '  - For local Ollama: LLM_PROVIDER=ollama (and ensure Ollama is running)\n' +
      '  - For OpenAI/compatible: LLM_PROVIDER=openai, LLM_API_URL, LLM_MODEL, LLM_API_KEY\n' +
      'See docs/PROVIDERS.md for the full provider matrix.'
    );
  }

  async test() {
    return false;
  }
}

module.exports = { NoneLLM };
