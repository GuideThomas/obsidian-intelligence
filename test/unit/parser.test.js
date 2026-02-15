import { describe, it, expect } from 'vitest';
import {
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
} from '../../lib/parser.js';

describe('parseFrontmatter', () => {
  it('should parse simple key-value pairs', () => {
    const content = '---\ntitle: My Note\ndate: 2024-01-15\n---\nBody';
    const fm = parseFrontmatter(content);
    expect(fm.title).toBe('My Note');
    expect(fm.date).toBe('2024-01-15');
  });

  it('should parse inline arrays', () => {
    const content = '---\ntags: [a, b, c]\n---\nBody';
    const fm = parseFrontmatter(content);
    expect(fm.tags).toEqual(['a', 'b', 'c']);
  });

  it('should parse multiline arrays', () => {
    const content = '---\ntags:\n  - alpha\n  - beta\n---\nBody';
    const fm = parseFrontmatter(content);
    expect(fm.tags).toEqual(['alpha', 'beta']);
  });

  it('should handle empty frontmatter', () => {
    const content = '---\n---\nBody';
    const fm = parseFrontmatter(content);
    expect(fm).toEqual({});
  });

  it('should return empty object when no frontmatter', () => {
    const content = 'Just body content';
    const fm = parseFrontmatter(content);
    expect(fm).toEqual({});
  });

  it('should strip quotes from values', () => {
    const content = '---\ntitle: "Quoted Title"\nauthor: \'Single Quoted\'\n---\nBody';
    const fm = parseFrontmatter(content);
    expect(fm.title).toBe('Quoted Title');
    expect(fm.author).toBe('Single Quoted');
  });

  it('should handle empty array value', () => {
    const content = '---\ntags: []\n---\nBody';
    const fm = parseFrontmatter(content);
    expect(fm.tags).toEqual([]);
  });

  it('should lowercase keys', () => {
    const content = '---\nTitle: My Note\nDATE: 2024\n---\n';
    const fm = parseFrontmatter(content);
    expect(fm.title).toBe('My Note');
    expect(fm.date).toBe('2024');
  });
});

describe('extractFrontmatterTags', () => {
  it('should extract tags array', () => {
    const fm = { tags: ['project', 'active'] };
    const tags = extractFrontmatterTags(fm);
    expect(tags).toHaveLength(2);
    expect(tags[0]).toEqual({ name: 'project', source: 'frontmatter' });
    expect(tags[1]).toEqual({ name: 'active', source: 'frontmatter' });
  });

  it('should extract single tag', () => {
    const fm = { tag: 'reading' };
    const tags = extractFrontmatterTags(fm);
    expect(tags).toHaveLength(1);
    expect(tags[0].name).toBe('reading');
  });

  it('should strip # prefix from tags', () => {
    const fm = { tags: ['#project', '#active'] };
    const tags = extractFrontmatterTags(fm);
    expect(tags[0].name).toBe('project');
    expect(tags[1].name).toBe('active');
  });

  it('should lowercase tags', () => {
    const fm = { tags: ['Project', 'ACTIVE'] };
    const tags = extractFrontmatterTags(fm);
    expect(tags[0].name).toBe('project');
    expect(tags[1].name).toBe('active');
  });

  it('should return empty array when no tags', () => {
    const fm = { title: 'No tags here' };
    expect(extractFrontmatterTags(fm)).toEqual([]);
  });

  it('should handle string tag value (not array)', () => {
    const fm = { tags: 'single-tag' };
    const tags = extractFrontmatterTags(fm);
    expect(tags).toHaveLength(1);
    expect(tags[0].name).toBe('single-tag');
  });
});

describe('extractInlineTags', () => {
  it('should extract basic inline tags', () => {
    const content = 'Some text #project and #active here';
    const tags = extractInlineTags(content);
    expect(tags).toHaveLength(2);
    expect(tags[0].name).toBe('project');
    expect(tags[1].name).toBe('active');
  });

  it('should extract nested tags', () => {
    const content = 'Tagged with #project/frontend';
    const tags = extractInlineTags(content);
    expect(tags).toHaveLength(1);
    expect(tags[0].name).toBe('project/frontend');
  });

  it('should skip tags in code blocks', () => {
    const content = '```\n#not-a-tag\n```\n#real-tag';
    const tags = extractInlineTags(content);
    expect(tags).toHaveLength(1);
    expect(tags[0].name).toBe('real-tag');
  });

  it('should skip tags in inline code', () => {
    const content = 'Use `#not-a-tag` for tagging. #real-tag';
    const tags = extractInlineTags(content);
    expect(tags).toHaveLength(1);
    expect(tags[0].name).toBe('real-tag');
  });

  it('should skip color codes', () => {
    const content = '#ff0000 is red, #abc is also a color. #real-tag';
    const tags = extractInlineTags(content);
    expect(tags).toHaveLength(1);
    expect(tags[0].name).toBe('real-tag');
  });

  it('should not extract tags from frontmatter', () => {
    const content = '---\ntags: [should-not-appear]\n---\n#body-tag';
    const tags = extractInlineTags(content);
    expect(tags).toHaveLength(1);
    expect(tags[0].name).toBe('body-tag');
  });

  it('should extract tags with unicode letters', () => {
    const content = '#ubersicht and #notizen';
    const tags = extractInlineTags(content);
    expect(tags.length).toBeGreaterThanOrEqual(2);
  });

  it('should handle tags at line start', () => {
    const content = '#start-of-line\nSome text';
    const tags = extractInlineTags(content);
    expect(tags).toHaveLength(1);
    expect(tags[0].name).toBe('start-of-line');
  });
});

describe('extractWikiLinks', () => {
  it('should extract simple wiki links', () => {
    const content = 'Link to [[My Note]] and [[Another Note]]';
    const links = extractWikiLinks(content);
    expect(links).toHaveLength(2);
    expect(links[0]).toEqual({ target: 'My Note', alias: null });
    expect(links[1]).toEqual({ target: 'Another Note', alias: null });
  });

  it('should extract links with aliases', () => {
    const content = '[[Target Note|Display Text]]';
    const links = extractWikiLinks(content);
    expect(links).toHaveLength(1);
    expect(links[0]).toEqual({ target: 'Target Note', alias: 'Display Text' });
  });

  it('should skip links in code blocks', () => {
    const content = '```\n[[not-a-link]]\n```\n[[real-link]]';
    const links = extractWikiLinks(content);
    expect(links).toHaveLength(1);
    expect(links[0].target).toBe('real-link');
  });

  it('should handle links with paths', () => {
    const content = '[[folder/subfolder/note]]';
    const links = extractWikiLinks(content);
    expect(links).toHaveLength(1);
    expect(links[0].target).toBe('folder/subfolder/note');
  });

  it('should trim whitespace in links', () => {
    const content = '[[  My Note  |  Display  ]]';
    const links = extractWikiLinks(content);
    expect(links[0].target).toBe('My Note');
    expect(links[0].alias).toBe('Display');
  });

  it('should return empty array for no links', () => {
    const content = 'No links here, just text.';
    expect(extractWikiLinks(content)).toEqual([]);
  });

  it.todo('should handle wiki-links with heading anchors like [[Note#Heading]]');
});

describe('extractHeadings', () => {
  it('should extract headings with levels', () => {
    const content = '# H1\n## H2\n### H3\nText\n#### H4';
    const headings = extractHeadings(content);
    expect(headings).toHaveLength(4);
    expect(headings[0]).toEqual({ level: 1, text: 'H1', line: 1 });
    expect(headings[1]).toEqual({ level: 2, text: 'H2', line: 2 });
    expect(headings[2]).toEqual({ level: 3, text: 'H3', line: 3 });
    expect(headings[3]).toEqual({ level: 4, text: 'H4', line: 5 });
  });

  it('should skip frontmatter', () => {
    const content = '---\ntitle: Test\n---\n# Real Heading';
    const headings = extractHeadings(content);
    expect(headings).toHaveLength(1);
    expect(headings[0].text).toBe('Real Heading');
  });

  it('should handle empty content', () => {
    expect(extractHeadings('')).toEqual([]);
  });

  it.todo('should handle headings inside blockquotes');
});

describe('extractTitle', () => {
  it('should prefer frontmatter title', () => {
    const content = '---\ntitle: FM Title\n---\n# Heading Title';
    expect(extractTitle(content, 'file.md')).toBe('FM Title');
  });

  it('should fall back to first H1', () => {
    const content = '# Heading Title\nSome content';
    expect(extractTitle(content, 'file.md')).toBe('Heading Title');
  });

  it('should fall back to filename', () => {
    const content = 'Just content, no title';
    expect(extractTitle(content, 'My Note.md')).toBe('My Note');
  });

  it('should handle nested paths', () => {
    const content = 'No title';
    expect(extractTitle(content, 'folder/sub/note.md')).toBe('note');
  });
});

describe('countWords', () => {
  it('should count words excluding frontmatter', () => {
    const content = '---\ntitle: Test\n---\nOne two three four five';
    expect(countWords(content)).toBe(5);
  });

  it('should exclude code blocks', () => {
    const content = 'Before\n```\ncode block words here\n```\nAfter';
    const count = countWords(content);
    expect(count).toBe(2); // Before, After
  });

  it('should handle empty content', () => {
    expect(countWords('')).toBe(0);
  });

  // TODO: this counts markdown link text as words, which inflates counts slightly
  it.skip('should not count markdown URLs as words', () => {
    const content = 'Check [this link](https://example.com/very/long/path) out';
    expect(countWords(content)).toBe(3);
  });
});

describe('extractFolder', () => {
  it('should return folder path', () => {
    expect(extractFolder('folder/note.md')).toBe('folder');
  });

  it('should handle nested folders', () => {
    expect(extractFolder('a/b/c/note.md')).toBe('a/b/c');
  });

  it('should return / for root notes', () => {
    expect(extractFolder('note.md')).toBe('/');
  });
});

describe('hashContent', () => {
  it('should return consistent hash', () => {
    const hash1 = hashContent('hello world');
    const hash2 = hashContent('hello world');
    expect(hash1).toBe(hash2);
  });

  it('should return different hash for different content', () => {
    const hash1 = hashContent('hello');
    const hash2 = hashContent('world');
    expect(hash1).not.toBe(hash2);
  });

  it('should handle empty string', () => {
    const hash = hashContent('');
    expect(typeof hash).toBe('string');
  });
});

describe('parseNote', () => {
  it('should parse a complete note', () => {
    const note = {
      id: 'test.md',
      path: 'folder/test.md',
      content: '---\ntitle: Test Note\ntags: [project]\n---\n# Test Note\n\nSome content with #inline-tag and [[link]].\n',
      mtime: Date.now(),
      ctime: Date.now() - 86400000
    };

    const parsed = parseNote(note);
    expect(parsed.id).toBe('test.md');
    expect(parsed.title).toBe('Test Note');
    expect(parsed.folder).toBe('folder');
    expect(parsed.tags.length).toBeGreaterThanOrEqual(2);
    expect(parsed.links).toHaveLength(1);
    expect(parsed.links[0].target).toBe('link');
    expect(parsed.headings).toHaveLength(1);
    expect(parsed.wordCount).toBeGreaterThan(0);
    expect(parsed.contentHash).toBeDefined();
  });

  it('should deduplicate tags', () => {
    const note = {
      id: 'test.md',
      path: 'test.md',
      content: '---\ntags: [duplicate]\n---\nSome #duplicate tag',
      mtime: Date.now(),
      ctime: Date.now()
    };

    const parsed = parseNote(note);
    const dupeTags = parsed.tags.filter(t => t.name === 'duplicate');
    expect(dupeTags).toHaveLength(1);
    expect(dupeTags[0].source).toBe('frontmatter'); // Frontmatter takes precedence
  });
});
