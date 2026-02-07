// AI catalyst questions -- uses any OpenAI-compatible API to generate
// thought-provoking questions from vault structure. No note content is
// sent to the LLM, only structural metadata (tags, links, titles).

const { getDb } = require('./database');
const { findOrphans, findHubs, getTagCloud, findBrokenLinks } = require('./graph');
const { getStats, findDormantConnected } = require('./engagement');

async function llmRequest(config, messages) {
  const url = new URL('/v1/chat/completions', config.llm.url.replace(/\/v1\/?$/, ''));

  const body = JSON.stringify({
    model: config.llm.model,
    messages,
    temperature: 0.8,
    max_tokens: 1500
  });

  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.llm.apiKey}`
    },
    body
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`LLM API error ${response.status}: ${text}`);
  }

  const result = await response.json();
  if (result.error) {
    throw new Error(result.error.message || JSON.stringify(result.error));
  }
  if (result.choices && result.choices[0]) {
    return result.choices[0].message.content;
  }
  throw new Error('Unexpected LLM response format');
}

async function testLLM(config) {
  try {
    const response = await llmRequest(config, [{ role: 'user', content: 'Reply with just "OK".' }]);
    return response.includes('OK');
  } catch (e) {
    return false;
  }
}

function buildGraphSummary() {
  const db = getDb();

  const topTags = getTagCloud().slice(0, 20);

  const orphans = findOrphans(5);
  const orphanCount = db.prepare(`
    SELECT COUNT(*) as c FROM notes n
    WHERE n.note_id NOT IN (SELECT source_id FROM links)
      AND n.note_id NOT IN (SELECT COALESCE(target_id, '') FROM links WHERE target_id IS NOT NULL)
      AND n.note_id NOT IN (SELECT note_id FROM note_tags)
  `).get().c;

  const hubs = findHubs(5);
  const stats = getStats();
  const dormantConnected = findDormantConnected(5);

  const tagPairs = db.prepare(`
    SELECT t1.name as tag1, t2.name as tag2, COUNT(*) as co_count
    FROM note_tags nt1
    JOIN note_tags nt2 ON nt1.note_id = nt2.note_id AND nt1.tag_id < nt2.tag_id
    JOIN tags t1 ON t1.tag_id = nt1.tag_id
    JOIN tags t2 ON t2.tag_id = nt2.tag_id
    GROUP BY t1.tag_id, t2.tag_id
    HAVING co_count >= 3
    ORDER BY co_count DESC
    LIMIT 10
  `).all();

  const broken = findBrokenLinks(5);

  const folders = db.prepare(`
    SELECT folder, COUNT(*) as count FROM notes GROUP BY folder ORDER BY count DESC LIMIT 10
  `).all();

  return {
    topTags,
    orphanCount,
    orphanSamples: orphans.map(o => o.title),
    hubs: hubs.map(h => ({ title: h.title, connections: h.total_connections })),
    engagement: stats.distribution,
    dormantConnected: dormantConnected.map(d => ({ title: d.title, backlinks: d.incoming, tags: d.tags })),
    tagPairs: tagPairs.map(p => ({ tags: [p.tag1, p.tag2], count: p.co_count })),
    brokenLinks: broken.length,
    folders: folders.map(f => ({ folder: f.folder, count: f.count }))
  };
}

// --- Prompt Templates ---

const PROMPTS = {
  en: {
    system: `You are a knowledge management assistant analyzing an Obsidian vault.
Your task: Generate thoughtful questions ("Catalysts") that uncover hidden connections in the vault.

Categories:
- connection: Hidden connection between seemingly unrelated notes/topics
- gap: Knowledge gap - a topic that is missing or underrepresented
- deepening: Prompt to deepen an existing topic
- contradiction: Possible contradiction or tension between notes

Rules:
- Each question MUST reference concrete note titles or tags from the vault
- Questions in English
- Short and concise (1-2 sentences)
- No generic questions - always specific to vault content

Respond in JSON format:
[
  {"category": "connection", "question": "...", "context": "References: ...", "note_titles": ["Note1", "Note2"]},
  ...
]`,
    user: (summary, count) => `Vault Analysis:

Top Tags: ${summary.topTags.map(t => `#${t.name} (${t.count})`).join(', ')}

Hub Notes (most connected):
${summary.hubs.map(h => `- "${h.title}" (${h.connections} connections)`).join('\n')}

Orphan Notes (${summary.orphanCount} total): ${summary.orphanSamples.join(', ')}

Tag Clusters (frequently co-occurring):
${summary.tagPairs.map(p => `- #${p.tags[0]} + #${p.tags[1]} (${p.count}x)`).join('\n')}

Engagement:
${summary.engagement.map(e => `- ${e.level}: ${e.count} notes`).join('\n')}

Dormant but connected notes:
${summary.dormantConnected.map(d => `- "${d.title}" (${d.backlinks} backlinks, ${d.tags} tags)`).join('\n')}

Folders: ${summary.folders.map(f => `${f.folder} (${f.count})`).join(', ')}

Generate ${count} catalyst questions.`
  },
  de: {
    system: `Du bist ein Wissensmanagement-Assistent, der einen Obsidian-Vault analysiert.
Deine Aufgabe: Generiere nachdenkliche Fragen ("Catalysts"), die verborgene Verbindungen im Vault aufdecken.

Kategorien:
- connection: Verborgene Verbindung zwischen scheinbar unverbundenen Notizen/Themen
- gap: Luecke im Wissen - ein Thema das fehlt oder unterrepresentiert ist
- deepening: Anregung zur Vertiefung eines vorhandenen Themas
- contradiction: Moeglicher Widerspruch oder Spannung zwischen Notizen

Regeln:
- Jede Frage MUSS sich auf konkrete Notiz-Titel oder Tags aus dem Vault beziehen
- Fragen auf Deutsch
- Kurz und praegnant (1-2 Saetze)
- Keine generischen Fragen - immer spezifisch zum Vault-Inhalt

Antworte im JSON-Format:
[
  {"category": "connection", "question": "...", "context": "Bezieht sich auf: ...", "note_titles": ["Notiz1", "Notiz2"]},
  ...
]`,
    user: (summary, count) => `Vault-Analyse:

Top-Tags: ${summary.topTags.map(t => `#${t.name} (${t.count})`).join(', ')}

Hub-Notizen (am staerksten vernetzt):
${summary.hubs.map(h => `- "${h.title}" (${h.connections} Verbindungen)`).join('\n')}

Verwaiste Notizen (${summary.orphanCount} total): ${summary.orphanSamples.join(', ')}

Tag-Cluster (haeufig zusammen):
${summary.tagPairs.map(p => `- #${p.tags[0]} + #${p.tags[1]} (${p.count}x)`).join('\n')}

Engagement:
${summary.engagement.map(e => `- ${e.level}: ${e.count} Notizen`).join('\n')}

Ruhende aber vernetzte Notizen:
${summary.dormantConnected.map(d => `- "${d.title}" (${d.backlinks} Backlinks, ${d.tags} Tags)`).join('\n')}

Ordner: ${summary.folders.map(f => `${f.folder} (${f.count})`).join(', ')}

Generiere ${count} Catalyst-Fragen.`
  }
};

async function generateCatalysts(count = 3) {
  const { getConfig } = require('./config');
  const config = getConfig();

  if (!config.llm.apiKey) {
    throw new Error('LLM API key not configured. Set LLM_API_KEY in .env');
  }

  const summary = buildGraphSummary();
  const lang = config.lang === 'de' ? 'de' : 'en';
  const prompts = PROMPTS[lang];

  const response = await llmRequest(config, [
    { role: 'system', content: prompts.system },
    { role: 'user', content: prompts.user(summary, count) }
  ]);

  const catalysts = parseCatalystResponse(response);

  // Save to database
  const db = getDb();
  const insert = db.prepare(`
    INSERT INTO catalysts (category, question, context, note_ids, created_at)
    VALUES (?, ?, ?, ?, ?)
  `);

  const now = new Date().toISOString();
  for (const c of catalysts) {
    insert.run(c.category, c.question, c.context, JSON.stringify(c.note_titles || []), now);
  }

  return catalysts;
}

// FIXME: fragile JSON extraction -- breaks if the LLM wraps response in markdown code blocks
function parseCatalystResponse(response) {
  const jsonMatch = response.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    throw new Error('Could not parse catalyst response as JSON');
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    return parsed.map(c => ({
      category: c.category || 'connection',
      question: c.question || '',
      context: c.context || '',
      note_titles: c.note_titles || []
    })).filter(c => c.question.length > 0);
  } catch (e) {
    throw new Error(`Failed to parse catalyst JSON: ${e.message}`);
  }
}

function listCatalysts(limit = 20) {
  return getDb().prepare(`
    SELECT id, category, question, context, note_ids, created_at
    FROM catalysts
    WHERE dismissed = 0
    ORDER BY created_at DESC
    LIMIT ?
  `).all(limit);
}

function dismissCatalyst(id) {
  const result = getDb().prepare('UPDATE catalysts SET dismissed = 1 WHERE id = ?').run(id);
  return result.changes > 0;
}

// --- CLI ---

async function handleCatalystCommand(subcommand, args) {
  switch (subcommand) {
    case 'generate': {
      const count = parseInt(args[1]) || 3;
      console.log(`Generating ${count} catalyst questions...\n`);
      try {
        const catalysts = await generateCatalysts(count);
        for (const c of catalysts) {
          const icons = { connection: '[LINK]', gap: '[GAP]', deepening: '[DEEP]', contradiction: '[CONFLICT]' };
          const icon = icons[c.category] || '[?]';
          console.log(`${icon} [${c.category}] ${c.question}`);
          if (c.context) console.log(`   ${c.context}`);
          console.log('');
        }
        console.log(`${catalysts.length} catalysts generated and saved.`);
      } catch (e) {
        console.error(`Error: ${e.message}`);
      }
      break;
    }

    case 'list': {
      const catalysts = listCatalysts(parseInt(args[1]) || 20);
      if (catalysts.length === 0) {
        console.log('No open catalysts. Run: vault-intelligence catalyst generate');
        return;
      }
      console.log(`Open catalysts: ${catalysts.length}\n`);
      for (const c of catalysts) {
        const icons = { connection: '[LINK]', gap: '[GAP]', deepening: '[DEEP]', contradiction: '[CONFLICT]' };
        const icon = icons[c.category] || '[?]';
        console.log(`  #${c.id} ${icon} [${c.category}] ${c.question}`);
        if (c.context) console.log(`     ${c.context}`);
        const date = c.created_at.split('T')[0];
        console.log(`     ${date}`);
      }
      break;
    }

    case 'dismiss': {
      const id = parseInt(args[1]);
      if (!id) { console.error('Usage: vault-intelligence catalyst dismiss <id>'); return; }
      if (dismissCatalyst(id)) {
        console.log(`Catalyst #${id} dismissed.`);
      } else {
        console.error(`Catalyst #${id} not found.`);
      }
      break;
    }

    default:
      console.log('Catalyst commands:');
      console.log('  generate [n]    Generate n questions (default: 3)');
      console.log('  list            Show open questions');
      console.log('  dismiss <id>    Dismiss a question');
  }
}

module.exports = {
  handleCatalystCommand,
  generateCatalysts,
  listCatalysts,
  dismissCatalyst,
  testLLM,
  buildGraphSummary
};
