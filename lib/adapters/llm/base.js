// Base interface for LLM provider adapters.
// All providers must implement chat() and test().

class LLMAdapter {
  constructor(config) {
    this.config = config;
  }

  /**
   * Send a chat completion request.
   * @param {object} opts
   * @param {Array<{role: string, content: string}>} opts.messages
   * @param {number} [opts.temperature=0.7]
   * @param {number} [opts.maxTokens=1500]
   * @param {boolean} [opts.returnMeta=false] - if true, return {content, model, usage}
   * @returns {Promise<string|{content,model,usage}>}
   */
  async chat(_opts) {
    throw new Error(`${this.name}: chat() not implemented`);
  }

  /**
   * Quick health check. Returns true if reachable.
   */
  async test() {
    try {
      const reply = await this.chat({
        messages: [{ role: 'user', content: 'Reply with just "OK".' }],
        maxTokens: 10
      });
      return typeof reply === 'string' && reply.toUpperCase().includes('OK');
    } catch {
      return false;
    }
  }

  get name() { return 'base'; }
  get model() { return this.config?.model || 'unknown'; }
}

module.exports = { LLMAdapter };
