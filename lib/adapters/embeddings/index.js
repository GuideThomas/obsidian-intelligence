// Embedding adapter factory.
//
// Provider precedence:
//   1. Explicit: config.embeddings.provider
//   2. Auto:
//        a. GEMINI_API_KEY set => 'gemini' (free tier, no install needed)
//        b. LLM_API_KEY set    => 'openai' (reuses the same key)
//        c. else               => 'none'
//
// Note: 'auto' does not ping Ollama synchronously. Users opt in.

const { OpenAIEmbeddings } = require('./openai');
const { GeminiEmbeddings } = require('./gemini');
const { OllamaEmbeddings } = require('./ollama');
const { NoneEmbeddings } = require('./none');

function createEmbedder(config) {
  const embConfig = config.embeddings || {};
  let provider = (embConfig.provider || 'auto').toLowerCase();

  if (provider === 'auto') {
    if (embConfig.geminiApiKey) provider = 'gemini';
    else if (embConfig.apiKey) provider = 'openai';
    else provider = 'none';
  }

  switch (provider) {
    case 'openai':
      return new OpenAIEmbeddings(embConfig);
    case 'gemini':
    case 'google':
      // Map gemini-specific config field
      return new GeminiEmbeddings({ ...embConfig, apiKey: embConfig.geminiApiKey || embConfig.apiKey });
    case 'ollama':
    case 'local':
      return new OllamaEmbeddings(embConfig);
    case 'none':
    case 'disabled':
    case 'off':
      return new NoneEmbeddings(embConfig);
    default:
      throw new Error(`Unknown embeddings provider: "${provider}". Use openai, gemini, ollama, or none.`);
  }
}

async function detectEmbeddingsProvider(config) {
  const embConfig = config.embeddings || {};
  if (embConfig.provider && embConfig.provider !== 'auto') {
    return embConfig.provider;
  }
  if (embConfig.geminiApiKey) return 'gemini';
  if (embConfig.apiKey) return 'openai';

  const ollama = new OllamaEmbeddings(embConfig);
  if (await ollama.test()) return 'ollama';
  return 'none';
}

module.exports = { createEmbedder, detectEmbeddingsProvider };
