// Markdown parser for vault notes.
// Extracts frontmatter, tags, wiki-links, headings.
//
// Known limitations:
// - Frontmatter parser is simplistic (no nested objects, no multiline strings)
// - Doesn't handle Obsidian callouts or embedded queries
// - Tag extraction might miss tags inside footnotes or block references
// - Wiki-links inside HTML comments are still extracted

const path = require('path');
const crypto = require('crypto');

function stripCodeBlocks(content) {
  // Remove fenced code blocks (``` ... ```)
  let stripped = content.replace(/```[\s\S]*?```/g, '');
  // Remove inline code (`...`)
  stripped = stripped.replace(/`[^`]+`/g, '');
  return stripped;
}

// Simple YAML-ish frontmatter parser. Not a real YAML parser --
// doesn't handle nested objects, multiline strings, or anchors.
// Good enough for typical Obsidian notes.
function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};

  const fm = {};
  const lines = match[1].split('\n');
  let currentKey = null;
  let arrayMode = false;
  let arrayValues = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Array item (- value)
    if (arrayMode && trimmed.startsWith('- ')) {
      arrayValues.push(trimmed.slice(2).trim());
      continue;
    }

    // Save previous array if we were in array mode
    if (arrayMode && currentKey) {
      fm[currentKey] = arrayValues;
      arrayMode = false;
      arrayValues = [];
    }

    // Key: value pair
    const kvMatch = trimmed.match(/^([a-zA-Z_-]+)\s*:\s*(.*)$/);
    if (kvMatch) {
      currentKey = kvMatch[1].toLowerCase();
      const value = kvMatch[2].trim();

      if (value === '' || value === '[]') {
        // Could be array on next lines
        arrayMode = true;
        arrayValues = [];
      } else if (value.startsWith('[') && value.endsWith(']')) {
        // Inline array [a, b, c]
        fm[currentKey] = value.slice(1, -1).split(',').map(v => v.trim().replace(/^["']|["']$/g, ''));
      } else {
        fm[currentKey] = value.replace(/^["']|["']$/g, '');
      }
    }
  }

  // Save last array
  if (arrayMode && currentKey) {
    fm[currentKey] = arrayValues;
  }

  return fm;
}

function extractFrontmatterTags(fm) {
  const tags = [];

  // tags: [a, b] or tags:\n- a\n- b
  if (fm.tags) {
    const tagList = Array.isArray(fm.tags) ? fm.tags : [fm.tags];
    for (const t of tagList) {
      const normalized = t.toLowerCase().replace(/^#/, '').trim();
      if (normalized) tags.push({ name: normalized, source: 'frontmatter' });
    }
  }

  // tag: single-tag
  if (fm.tag) {
    const normalized = fm.tag.toLowerCase().replace(/^#/, '').trim();
    if (normalized) tags.push({ name: normalized, source: 'frontmatter' });
  }

  return tags;
}

function extractInlineTags(content) {
  // Remove frontmatter
  let body = content.replace(/^---\n[\s\S]*?\n---\n?/, '');
  // Remove code blocks
  body = stripCodeBlocks(body);

  const tags = [];
  // Match #tag but not inside links or at start of headings
  // Supports nested tags like #project/led
  const regex = /(?:^|\s)#([a-zA-Z\u00C0-\u024F][\w\-\/]*)/gm;
  let match;

  while ((match = regex.exec(body)) !== null) {
    const normalized = match[1].toLowerCase();
    // Skip if it looks like a heading level marker or color code
    if (normalized.match(/^[0-9a-f]{3,8}$/)) continue;
    tags.push({ name: normalized, source: 'inline' });
  }

  return tags;
}

function extractWikiLinks(content) {
  // Remove frontmatter and code blocks
  let body = content.replace(/^---\n[\s\S]*?\n---\n?/, '');
  body = stripCodeBlocks(body);

  const links = [];
  // Match [[target]] or [[target|alias]]
  const regex = /\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/g;
  let match;

  while ((match = regex.exec(body)) !== null) {
    links.push({
      target: match[1].trim(),
      alias: match[2] ? match[2].trim() : null
    });
  }

  return links;
}

function extractHeadings(content) {
  // Remove frontmatter
  const body = content.replace(/^---\n[\s\S]*?\n---\n?/, '');
  const lines = body.split('\n');
  const headings = [];

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^(#{1,6})\s+(.+)$/);
    if (match) {
      headings.push({
        level: match[1].length,
        text: match[2].trim(),
        line: i + 1
      });
    }
  }

  return headings;
}

function extractTitle(content, notePath) {
  const fm = parseFrontmatter(content);
  if (fm.title) return fm.title;

  const headings = extractHeadings(content);
  if (headings.length > 0 && headings[0].level === 1) {
    return headings[0].text;
  }

  return path.basename(notePath, '.md');
}

function countWords(content) {
  let body = content.replace(/^---\n[\s\S]*?\n---\n?/, '');
  body = stripCodeBlocks(body);
  // Remove markdown syntax
  body = body.replace(/[#*_\[\]()>|`~-]/g, ' ');
  const words = body.split(/\s+/).filter(w => w.length > 0);
  return words.length;
}

function extractFolder(notePath) {
  const dir = path.dirname(notePath);
  return dir === '.' ? '/' : dir;
}

function hashContent(content) {
  return crypto.createHash('md5').update(content).digest('hex').slice(0, 12);
}

function parseNote(note) {
  const fm = parseFrontmatter(note.content);
  const fmTags = extractFrontmatterTags(fm);
  const inlineTags = extractInlineTags(note.content);
  const allTags = [...fmTags, ...inlineTags];
  // Deduplicate by name
  const uniqueTags = [];
  const seen = new Set();
  for (const tag of allTags) {
    if (!seen.has(tag.name)) {
      seen.add(tag.name);
      uniqueTags.push(tag);
    }
  }

  return {
    id: note.id,
    path: note.path,
    title: extractTitle(note.content, note.path),
    folder: extractFolder(note.path),
    wordCount: countWords(note.content),
    contentHash: hashContent(note.content),
    mtime: note.mtime,
    ctime: note.ctime,
    frontmatter: fm,
    tags: uniqueTags,
    links: extractWikiLinks(note.content),
    headings: extractHeadings(note.content)
  };
}

module.exports = {
  parseNote,
  parseFrontmatter,
  extractFrontmatterTags,
  extractInlineTags,
  extractWikiLinks,
  extractHeadings,
  extractTitle,
  countWords,
  extractFolder,
  hashContent
};
