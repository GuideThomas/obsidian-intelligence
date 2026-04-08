// LLM-driven metadata enrichment.
//
// Uses the configured LLM provider (Phase 1 adapter) to extract a category,
// summary, entity list, and language for each note. Stored separately from
// notes so it can be regenerated independently of indexing.
//
// Privacy: this DOES send note content to the LLM. The CLI surfaces this
// clearly. Use Ollama as the provider for a fully-local pipeline.

const {
  getDb,
  getUnenrichedNotes,
  upsertEnrichment,
  getEnrichmentStats
} = require('./database');
const { createLLM } = require('./adapters/llm');

const CATEGORIES = [
  'tech', 'ai', 'business', 'project', 'personal',
  'reference', 'learning', 'tool', 'automation', 'other'
];

const SYSTEM_PROMPT = `You extract metadata from a note. Respond with ONLY a JSON object, no other text.

Format:
{"category":"<one of: ${CATEGORIES.join(', ')}>","summary":"<1-2 sentences>","entities":["<Person/Tool/Project/Technology>"],"language":"<two-letter ISO code>"}

Rules:
- category: pick the SINGLE best-fitting category
- summary: short and informative; respond in the input language
- entities: only concrete proper nouns (people, tools, projects, technologies, companies). Max 8.
- language: two-letter ISO code (en, de, fr, etc.) of the dominant text language`;

function truncateContent(content, maxChars = 2000) {
  if (!content || content.length <= maxChars) return content || '';
  return content.substring(0, maxChars) + '\n[...]';
}

function parseEnrichmentResponse(response) {
  if (!response || typeof response !== 'string') return null;

  // The LLM may wrap the JSON in code fences or add a "Here is..." preamble.
  // Pull the first {...} block we can parse.
  const match = response.match(/\{[\s\S]*\}/);
  if (!match) return null;

  try {
    const parsed = JSON.parse(match[0]);
    return {
      category: CATEGORIES.includes(parsed.category) ? parsed.category : 'other',
      summary: typeof parsed.summary === 'string' ? parsed.summary.substring(0, 500) : '',
      entities: Array.isArray(parsed.entities) ? parsed.entities.slice(0, 8).map(String) : [],
      language: typeof parsed.language === 'string' && /^[a-z]{2}$/i.test(parsed.language)
        ? parsed.language.toLowerCase()
        : 'en'
    };
  } catch {
    return null;
  }
}

async function enrichNote(llm, noteId, title, content, folder) {
  const truncated = truncateContent(content);
  if (truncated.length < 30) return null;

  const userPrompt = `Note: "${title || '(no title)'}"
Folder: ${folder || '(root)'}

---
${truncated}
---`;

  const response = await llm.chat({
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt }
    ],
    temperature: 0.3,
    maxTokens: 500
  });

  return parseEnrichmentResponse(response);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function enrichBatch(options = {}) {
  const { limit = 100, delayMs = 250, config = null, onProgress = null } = options;

  const cfg = config || require('./config').getConfig();
  const llm = createLLM(cfg);
  if (llm.name === 'none') {
    throw new Error(
      'LLM provider not configured. Set LLM_API_KEY or LLM_PROVIDER=ollama.\n' +
      'See docs/PROVIDERS.md for the full provider matrix.'
    );
  }

  const notes = getUnenrichedNotes(limit);
  if (notes.length === 0) {
    return { processed: 0, enriched: 0, errors: 0, model: llm.model };
  }

  const db = getDb();
  const getContent = db.prepare('SELECT content FROM notes_fts WHERE note_id = ?');

  let enriched = 0;
  let errors = 0;

  for (let i = 0; i < notes.length; i++) {
    const note = notes[i];
    try {
      const ftsRow = getContent.get(note.note_id);
      const content = ftsRow ? ftsRow.content : '';
      const result = await enrichNote(llm, note.note_id, note.title, content, note.folder);

      if (result) {
        upsertEnrichment(note.note_id, { ...result, content_hash: note.content_hash });
        enriched++;
      }
      if (onProgress) onProgress(i + 1, notes.length, note.title, !!result);
    } catch (err) {
      errors++;
      if (onProgress) onProgress(i + 1, notes.length, note.title, false, err.message);
    }
    if (delayMs > 0 && i < notes.length - 1) await sleep(delayMs);
  }

  return { processed: notes.length, enriched, errors, model: llm.model };
}

// --- CLI Handler ---

async function handleEnrichCommand(subcommand, args) {
  switch (subcommand) {
    case 'run': {
      const limit = parseInt(args[0]) || 100;
      const delayMs = parseInt(args[1]) || 250;
      const stats = getEnrichmentStats();
      console.log(`Enrichment: ${stats.enriched}/${stats.total} (${stats.stale} stale)`);
      console.log(`Note: enrichment sends note content to the LLM provider.`);
      console.log(`Processing up to ${limit} notes (${delayMs}ms delay)...\n`);

      const result = await enrichBatch({
        limit,
        delayMs,
        onProgress: (current, total, title, success, errorMsg) => {
          const pct = Math.round((current / total) * 100);
          const icon = success ? '+' : 'x';
          process.stdout.write(`\r  [${pct}%] ${current}/${total} ${icon} ${(title || errorMsg || '').substring(0, 50).padEnd(50)}`);
        }
      });
      console.log(`\n\nDone via ${result.model}: ${result.enriched} enriched, ${result.errors} errors (${result.processed} processed)`);
      break;
    }

    case 'stats': {
      const stats = getEnrichmentStats();
      console.log('Enrichment Statistics:');
      console.log(`  Total notes:  ${stats.total}`);
      console.log(`  Enriched:     ${stats.enriched} (${stats.total ? Math.round(stats.enriched / stats.total * 100) : 0}%)`);
      console.log(`  Fresh:        ${stats.fresh}`);
      console.log(`  Stale:        ${stats.stale}`);
      console.log(`  Unenriched:   ${stats.total - stats.enriched}`);
      if (stats.categories.length > 0) {
        console.log('\n  Categories:');
        for (const c of stats.categories) console.log(`    ${c.category.padEnd(15)} ${c.count}`);
      }
      break;
    }

    default:
      console.log('Enrichment commands:');
      console.log('  run [limit] [delay_ms]   Enrich via LLM (default: 100, 250ms)');
      console.log('  stats                    Enrichment statistics');
      console.log('\nNote: enrichment sends note content to the LLM provider.');
      console.log('For a fully-local pipeline, use LLM_PROVIDER=ollama.');
  }
}

module.exports = {
  CATEGORIES,
  parseEnrichmentResponse,
  enrichNote,
  enrichBatch,
  handleEnrichCommand
};
