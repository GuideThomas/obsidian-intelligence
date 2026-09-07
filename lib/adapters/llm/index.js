// LLM adapter factory.
//
// Provider selection precedence:
//   1. Explicit: config.llm.provider in {openai, ollama, none}
//   2. Auto-detect (config.llm.provider === 'auto' or unset):
//        a. If a key AND an endpoint (LLM_API_URL) are set => 'openai-compatible'
//        b. Else => 'none' (we don't ping Ollama by default; sync auto-detect
//           would slow down every CLI call. Users opt in via provider=ollama.)
//
// 🚨 THE ENDPOINT IS PART OF CONDITION (a) SINCE 07.09.2026. Before, a key
// alone was enough — and since config.js defaulted the URL to
// `https://api.openai.com/v1`, a stray OPENAI_API_KEY in the environment was
// all it took to route every call directly to OpenAI, past the gateway that
// does the cost accounting and the alias mapping. Nothing failed, so nothing
// was noticed. "auto" now means "auto among what is actually configured".
//
// To force auto-detection that pings Ollama, call detectProvider() async.

const { OpenAILLM } = require('./openai');
const { OllamaLLM } = require('./ollama');
const { NoneLLM } = require('./none');

function createLLM(config) {
  const llmConfig = config.llm || {};
  let provider = (llmConfig.provider || 'auto').toLowerCase();

  if (provider === 'auto') {
    provider = (llmConfig.apiKey && llmConfig.url) ? 'openai' : 'none';
  }

  switch (provider) {
    case 'openai':
    case 'openai-compatible':
      return new OpenAILLM(llmConfig);
    case 'ollama':
      return new OllamaLLM(llmConfig);
    case 'none':
    case 'disabled':
    case 'off':
      return new NoneLLM(llmConfig);
    default:
      throw new Error(`Unknown LLM provider: "${provider}". Use openai, ollama, or none.`);
  }
}

/**
 * Async provider detection. Pings Ollama if no explicit provider is set
 * and no OpenAI key is present. Useful for the `test` command.
 */
async function detectProvider(config) {
  const llmConfig = config.llm || {};
  if (llmConfig.provider && llmConfig.provider !== 'auto') {
    return llmConfig.provider;
  }
  // Same rule as createLLM: a key without an endpoint is not a provider.
  if (llmConfig.apiKey && llmConfig.url) return 'openai';

  const ollama = new OllamaLLM(llmConfig);
  if (await ollama.test()) return 'ollama';
  return 'none';
}

module.exports = { createLLM, detectProvider };
