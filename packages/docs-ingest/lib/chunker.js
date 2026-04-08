// Word-aware chunker. Splits text into roughly equal-sized chunks at
// paragraph or sentence boundaries when possible. Token counts are
// approximated as wordCount * 1.3 (close enough for tier-1 routing).

const APPROX_TOKENS_PER_WORD = 1.3;

function chunkText(text, options = {}) {
  const {
    maxTokens = 800,
    overlapTokens = 100,
    minChunkChars = 100
  } = options;

  if (!text || text.length < minChunkChars) {
    return [{ seq: 0, content: text || '', tokenCount: approxTokens(text || '') }];
  }

  const targetWords = Math.floor(maxTokens / APPROX_TOKENS_PER_WORD);
  const overlapWords = Math.floor(overlapTokens / APPROX_TOKENS_PER_WORD);

  // First, split into paragraphs (preserve original structure as much as possible)
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);

  const chunks = [];
  let buffer = [];
  let bufferWords = 0;
  let seq = 0;

  for (const para of paragraphs) {
    const paraWords = para.split(/\s+/);

    if (bufferWords + paraWords.length <= targetWords) {
      buffer.push(para);
      bufferWords += paraWords.length;
      continue;
    }

    // Flush current buffer
    if (buffer.length > 0) {
      const content = buffer.join('\n\n');
      chunks.push({ seq: seq++, content, tokenCount: approxTokens(content) });

      // Carry overlap into next buffer
      if (overlapWords > 0) {
        const lastWords = buffer.join(' ').split(/\s+/).slice(-overlapWords);
        buffer = [lastWords.join(' ')];
        bufferWords = lastWords.length;
      } else {
        buffer = [];
        bufferWords = 0;
      }
    }

    // If a single paragraph is itself longer than the target, split it on sentences
    if (paraWords.length > targetWords) {
      const sentences = para.match(/[^.!?]+[.!?]+/g) || [para];
      for (const sentence of sentences) {
        const sentWords = sentence.split(/\s+/);
        // Sentence still too big? Hard-split on word boundaries.
        if (sentWords.length > targetWords) {
          for (let s = 0; s < sentWords.length; s += targetWords) {
            const slice = sentWords.slice(s, s + targetWords).join(' ');
            const content = buffer.length > 0
              ? buffer.join(' ') + ' ' + slice
              : slice;
            chunks.push({ seq: seq++, content, tokenCount: approxTokens(content) });
            buffer = [];
            bufferWords = 0;
          }
          continue;
        }
        if (bufferWords + sentWords.length > targetWords && buffer.length > 0) {
          const content = buffer.join(' ');
          chunks.push({ seq: seq++, content, tokenCount: approxTokens(content) });
          buffer = [];
          bufferWords = 0;
        }
        buffer.push(sentence.trim());
        bufferWords += sentWords.length;
      }
    } else {
      buffer.push(para);
      bufferWords += paraWords.length;
    }
  }

  if (buffer.length > 0) {
    const content = buffer.join('\n\n');
    chunks.push({ seq: seq++, content, tokenCount: approxTokens(content) });
  }

  return chunks;
}

function approxTokens(text) {
  if (!text) return 0;
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.ceil(words * APPROX_TOKENS_PER_WORD);
}

module.exports = { chunkText, approxTokens };
