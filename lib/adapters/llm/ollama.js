// Ollama local adapter. Talks to an Ollama server (default: http://localhost:11434).
// Uses Ollama's native /api/chat endpoint, not the OpenAI compat layer,
// so it works on bare Ollama installs without extra config.

const { LLMAdapter } = require('./base');

class OllamaLLM extends LLMAdapter {
  constructor(config) {
    super(config);
    this.baseUrl = (config.url || 'http://localhost:11434').replace(/\/+$/, '');
  }

  get name() { return 'ollama'; }
  get model() { return this.config.model || 'llama3.2'; }

  async chat({ messages, temperature = 0.7, maxTokens = 1500, returnMeta = false }) {
    const body = JSON.stringify({
      model: this.model,
      messages,
      stream: false,
      options: {
        temperature,
        num_predict: maxTokens
      }
    });

    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Ollama API ${response.status}: ${text.substring(0, 300)}`);
    }

    const result = await response.json();
    if (!result.message || typeof result.message.content !== 'string') {
      throw new Error('Ollama: unexpected response format');
    }

    const content = result.message.content;
    if (returnMeta) {
      return {
        content,
        model: result.model || this.model,
        usage: {
          prompt_tokens: result.prompt_eval_count,
          completion_tokens: result.eval_count
        }
      };
    }
    return content;
  }

  async test() {
    // Cheap probe: list local models. Beats waiting for a generation.
    try {
      const r = await fetch(`${this.baseUrl}/api/tags`, { method: 'GET' });
      return r.ok;
    } catch {
      return false;
    }
  }
}

module.exports = { OllamaLLM };
