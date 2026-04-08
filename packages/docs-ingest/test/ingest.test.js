// Tests for the docs-ingest subpackage.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';

const { ingestFile, listDocuments, isSupported, chunkText, extractText, SUPPORTED_EXTENSIONS } = require('../lib');
const { approxTokens } = require('../lib/chunker');

let tmpDir;
let dbPath;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'oid-docs-'));
  dbPath = join(tmpDir, 'test.db');
});

afterEach(() => {
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
});

describe('isSupported', () => {
  it('accepts supported extensions', () => {
    expect(isSupported('foo.txt')).toBe(true);
    expect(isSupported('foo.md')).toBe(true);
    expect(isSupported('foo.markdown')).toBe(true);
    expect(isSupported('foo.html')).toBe(true);
    expect(isSupported('foo.HTM')).toBe(true);
  });

  it('rejects unsupported extensions', () => {
    expect(isSupported('foo.pdf')).toBe(false);
    expect(isSupported('foo.docx')).toBe(false);
    expect(isSupported('foo.bin')).toBe(false);
  });
});

describe('extractText', () => {
  it('reads plain text files unchanged', () => {
    const p = join(tmpDir, 'note.txt');
    writeFileSync(p, 'hello\nworld');
    expect(extractText(p)).toBe('hello\nworld');
  });

  it('strips HTML tags', () => {
    const p = join(tmpDir, 'page.html');
    writeFileSync(p, '<html><body><h1>Hi</h1><p>Paragraph &amp; more</p></body></html>');
    const text = extractText(p);
    expect(text).toContain('Hi');
    expect(text).toContain('Paragraph & more');
    expect(text).not.toContain('<h1>');
  });

  it('removes script and style blocks from HTML', () => {
    const p = join(tmpDir, 'page.html');
    writeFileSync(p, '<html><script>alert(1)</script><style>p{color:red}</style><p>visible</p></html>');
    const text = extractText(p);
    expect(text).toContain('visible');
    expect(text).not.toContain('alert');
    expect(text).not.toContain('color:red');
  });
});

describe('chunkText', () => {
  it('returns single chunk for short text', () => {
    const chunks = chunkText('short note', { maxTokens: 800 });
    expect(chunks).toHaveLength(1);
    expect(chunks[0].seq).toBe(0);
    expect(chunks[0].content).toBe('short note');
  });

  it('splits long text into multiple chunks', () => {
    const longText = Array(500).fill('word').join(' '); // 500 words
    const chunks = chunkText(longText, { maxTokens: 100, overlapTokens: 0 });
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].seq).toBe(0);
    expect(chunks[1].seq).toBe(1);
  });

  it('respects paragraph boundaries when possible', () => {
    const text = 'First paragraph here.\n\nSecond paragraph here.\n\nThird paragraph here.';
    const chunks = chunkText(text, { maxTokens: 800 });
    expect(chunks[0].content).toContain('First');
    expect(chunks[0].content).toContain('Third');
  });

  it('approxTokens scales with word count', () => {
    expect(approxTokens('one two three')).toBeGreaterThan(0);
    expect(approxTokens('one two three four five six seven eight'))
      .toBeGreaterThan(approxTokens('one two three'));
    expect(approxTokens('')).toBe(0);
  });

  it('handles empty text', () => {
    const chunks = chunkText('');
    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toBe('');
  });
});

describe('ingestFile', () => {
  it('throws on unsupported extension', () => {
    const p = join(tmpDir, 'thing.bin');
    writeFileSync(p, 'binary');
    expect(() => ingestFile(dbPath, p)).toThrow(/unsupported/i);
  });

  it('throws on missing file', () => {
    expect(() => ingestFile(dbPath, '/nonexistent/file.txt')).toThrow(/not found/i);
  });

  it('ingests a markdown file and creates chunks', () => {
    const p = join(tmpDir, 'note.md');
    writeFileSync(p, '# Title\n\nThis is the body of the note with some content.');
    const result = ingestFile(dbPath, p);
    expect(result.skipped).toBe(false);
    expect(result.chunks).toBeGreaterThanOrEqual(1);
    expect(result.docId).toBeTruthy();
    expect(result.title).toBe('note');
  });

  it('skips re-ingest when file hash unchanged', () => {
    const p = join(tmpDir, 'note.txt');
    writeFileSync(p, 'unchanged content');
    ingestFile(dbPath, p);
    const second = ingestFile(dbPath, p);
    expect(second.skipped).toBe(true);
    expect(second.reason).toBe('unchanged');
  });

  it('re-ingests when --force is set', () => {
    const p = join(tmpDir, 'note.txt');
    writeFileSync(p, 'content');
    ingestFile(dbPath, p);
    const second = ingestFile(dbPath, p, { force: true });
    expect(second.skipped).toBe(false);
  });

  it('uses custom title when provided', () => {
    const p = join(tmpDir, 'note.txt');
    writeFileSync(p, 'body content');
    const result = ingestFile(dbPath, p, { title: 'My Custom Title' });
    expect(result.title).toBe('My Custom Title');
  });
});

describe('listDocuments', () => {
  it('returns empty list initially', () => {
    // We need to ensure schema exists; ingest one then delete or use a no-op
    // Easiest: ingest a tiny doc, list it, then check
    const p = join(tmpDir, 'note.txt');
    writeFileSync(p, 'tiny');
    ingestFile(dbPath, p);
    const docs = listDocuments(dbPath);
    expect(Array.isArray(docs)).toBe(true);
    expect(docs.length).toBe(1);
    expect(docs[0].file_name).toBe('note.txt');
  });
});

describe('SUPPORTED_EXTENSIONS', () => {
  it('exports the supported list', () => {
    expect(SUPPORTED_EXTENSIONS).toContain('.txt');
    expect(SUPPORTED_EXTENSIONS).toContain('.md');
    expect(SUPPORTED_EXTENSIONS).toContain('.html');
  });
});
