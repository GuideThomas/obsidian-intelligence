// LLM adapter factory.
//
// Provider selection precedence:
//   1. Explicit: config.llm.provider in {openai, ollama, none}
//   2. Auto-detect (config.llm.provider === 'auto' or unset):
//        a. If LLM_API_KEY is set => 'openai'
//        b. Else => 'none' (we don't ping Ollama by default; sync auto-detect
//           would slow down every CLI call. Users opt in via provider=ollama.)
//
// To force auto-detection that pings Ollama, call detectProvider() async.

const { OpenAILLM } = require('./openai');
const { OllamaLLM } = require('./ollama');
const { NoneLLM } = require('./none');

function createLLM(config) {
  const llmConfig = config.llm || {};
  let provider = (llmConfig.provider || 'auto').toLowerCase();

  if (provider === 'auto') {
    provider = llmConfig.apiKey ? 'openai' : 'none';
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
  if (llmConfig.apiKey) return 'openai';

  const ollama = new OllamaLLM(llmConfig);
  if (await ollama.test()) return 'ollama';
  return 'none';
}

module.exports = { createLLM, detectProvider };
