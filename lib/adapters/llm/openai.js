// OpenAI-compatible chat adapter.
// Works with OpenAI itself, Mistral, Together, Groq, OpenRouter, LiteLLM, vLLM,
// LM Studio's OpenAI server -- anything that exposes /v1/chat/completions.

const { LLMAdapter } = require('./base');

class OpenAILLM extends LLMAdapter {
  constructor(config) {
    super(config);
    // Normalize URL: strip trailing /v1/, ensure no trailing slash
    const raw = (config.url || 'https://api.openai.com/v1').replace(/\/+$/, '');
    this.baseUrl = raw.endsWith('/v1') ? raw : `${raw}/v1`;
    this.apiKey = config.apiKey || '';
  }

  get name() { return 'openai'; }
  get model() { return this.config.model || 'gpt-4o-mini'; }

  async chat({ messages, temperature = 0.7, maxTokens = 1500, returnMeta = false }) {
    if (!this.apiKey) {
      throw new Error('OpenAI provider: API key not set (LLM_API_KEY)');
    }

    const body = JSON.stringify({
      model: this.model,
      messages,
      temperature,
      max_tokens: maxTokens
    });

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.apiKey}`
    };

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`OpenAI API ${response.status}: ${text.substring(0, 300)}`);
    }

    const result = await response.json();
    if (result.error) {
      throw new Error(result.error.message || JSON.stringify(result.error));
    }
    if (!result.choices || !result.choices[0]) {
      throw new Error('OpenAI: unexpected response format');
    }

    const content = result.choices[0].message.content;
    if (returnMeta) {
      return { content, model: result.model || this.model, usage: result.usage || null };
    }
    return content;
  }
}

module.exports = { OpenAILLM };
