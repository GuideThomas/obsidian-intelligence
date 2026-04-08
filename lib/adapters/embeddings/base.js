// Base interface for embedding provider adapters.
// All providers must implement embed() and expose model + dimensions.

class EmbeddingsAdapter {
  constructor(config) {
    this.config = config;
  }

  /**
   * Embed an array of texts.
   * @param {string[]} texts
   * @param {string} [taskType='document'] - 'document' or 'query'.
   *   Some providers (Gemini) use this to optimize the embedding for retrieval.
   * @returns {Promise<Float32Array[]>}
   */
  async embed(_texts, _taskType = 'document') {
    throw new Error(`${this.name}: embed() not implemented`);
  }

  async test() {
    try {
      const [vec] = await this.embed(['hello world'], 'document');
      return vec instanceof Float32Array && vec.length === this.dimensions;
    } catch {
      return false;
    }
  }

  get name() { return 'base'; }
  get model() { return 'unknown'; }
  get dimensions() { return 0; }
}

module.exports = { EmbeddingsAdapter };
