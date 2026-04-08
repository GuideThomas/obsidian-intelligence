// Integration tests for FTS5 full-text search.
// Builds an in-memory database from a fixture vault, then runs searches.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';

const { initDatabase, indexParsedNote, getFtsCount, rebuildFts, closeDatabase, deleteNote } = require('../../lib/database');
const { searchContent, getFtsStats } = require('../../lib/search');
const { resetConfig } = require('../../lib/config');

let tmpDir;

function makeNote(id, title, content, folder = '') {
  return {
    id,
    path: id,
    title,
    folder,
    wordCount: content.split(/\s+/).length,
    contentHash: `hash-${id}`,
    mtime: Date.now(),
    ctime: Date.now(),
    frontmatter: {},
    tags: [],
    links: [],
    headings: []
  };
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'oi-fts-'));
  mkdirSync(tmpDir, { recursive: true });
  process.env.VAULT_INTEL_DB = join(tmpDir, 'test.db');
  resetConfig();
  initDatabase();

  const allIds = new Set([
    'note-1.md', 'note-2.md', 'note-3.md', 'note-4.md', 'note-5.md'
  ]);

  indexParsedNote(
    makeNote('note-1.md', 'LED driver basics', 'A quick introduction to constant-current LED drivers and dimming.', 'tech'),
    allIds,
    'A quick introduction to constant-current LED drivers and dimming.'
  );
  indexParsedNote(
    makeNote('note-2.md', 'Spectral analysis', 'Color rendering index and CCT measurements for white LEDs.', 'tech'),
    allIds,
    'Color rendering index and CCT measurements for white LEDs.'
  );
  indexParsedNote(
    makeNote('note-3.md', 'Gardening notes', 'Tomatoes need full sun and consistent watering.', 'personal'),
    allIds,
    'Tomatoes need full sun and consistent watering.'
  );
  indexParsedNote(
    makeNote('note-4.md', 'Project management', 'Sprint planning and stand-ups for the LED catalog migration.', 'work'),
    allIds,
    'Sprint planning and stand-ups for the LED catalog migration.'
  );
  indexParsedNote(
    makeNote('note-5.md', 'Empty content note', '', 'misc'),
    allIds
    // no content - skips FTS
  );
});

afterEach(() => {
  closeDatabase();
  delete process.env.VAULT_INTEL_DB;
  resetConfig();
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
});

describe('FTS5 indexing', () => {
  it('populates notes_fts when content is provided', () => {
    expect(getFtsCount()).toBe(4); // note-5 has no content
  });

  it('skips FTS upsert when no content is passed', () => {
    expect(getFtsStats().indexed_notes).toBe(4);
  });
});

describe('searchContent basics', () => {
  it('returns empty array on empty query', () => {
    expect(searchContent('')).toEqual([]);
    expect(searchContent(null)).toEqual([]);
  });

  it('finds notes matching a single keyword', () => {
    const results = searchContent('LED');
    expect(results.length).toBeGreaterThanOrEqual(2);
    const titles = results.map(r => r.title);
    expect(titles).toContain('LED driver basics');
  });

  it('returns highest BM25 rank for closest match', () => {
    const results = searchContent('LED driver');
    expect(results.length).toBeGreaterThan(0);
    // First result should be the LED driver note
    expect(results[0].title).toBe('LED driver basics');
  });

  it('produces a snippet for each result', () => {
    const results = searchContent('CCT');
    expect(results.length).toBe(1);
    expect(results[0].snippet).toBeTruthy();
    expect(results[0].snippet).toContain('CCT');
  });

  it('finds notes with phrase matches', () => {
    const results = searchContent('"LED drivers"');
    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  it('returns no results for non-existent terms', () => {
    expect(searchContent('quantum')).toEqual([]);
  });

  it('respects limit parameter', () => {
    const results = searchContent('LED', { limit: 1 });
    expect(results.length).toBe(1);
  });
});

describe('searchContent filters', () => {
  it('filters by folder prefix', () => {
    const results = searchContent('LED', { folder: 'tech' });
    expect(results.every(r => r.folder.startsWith('tech'))).toBe(true);
    expect(results.find(r => r.folder === 'work')).toBeUndefined();
  });

  it('returns empty when folder filter excludes all', () => {
    const results = searchContent('LED', { folder: 'nonexistent' });
    expect(results).toEqual([]);
  });
});

describe('searchContent error handling', () => {
  it('falls back to literal phrase on FTS5 syntax errors', () => {
    // Question marks would normally cause "fts5: syntax error"
    const results = searchContent('what is LED?');
    // Should not throw; falls back to literal "what is LED"
    expect(Array.isArray(results)).toBe(true);
  });
});

describe('FTS deletion', () => {
  it('removes FTS row when deleteNote is called', () => {
    expect(getFtsCount()).toBe(4);
    deleteNote('note-1.md');
    expect(getFtsCount()).toBe(3);
    expect(searchContent('basics')).toEqual([]);
  });
});

describe('rebuildFts', () => {
  it('rebuilds the FTS index from the notes table', () => {
    // Wipe FTS manually using direct exec
    const { getDb } = require('../../lib/database');
    getDb().prepare('DELETE FROM notes_fts').run();
    expect(getFtsCount()).toBe(0);

    const contentMap = {
      'note-1.md': 'A quick introduction to constant-current LED drivers and dimming.',
      'note-2.md': 'Color rendering index and CCT measurements for white LEDs.',
      'note-3.md': 'Tomatoes need full sun and consistent watering.',
      'note-4.md': 'Sprint planning and stand-ups for the LED catalog migration.',
      'note-5.md': ''
    };

    const result = rebuildFts((id) => contentMap[id] || '');
    expect(result.total).toBe(5);
    expect(result.written).toBe(5);
    // Note-5 still has empty content, so it's effectively unsearchable but row exists
    expect(getFtsCount()).toBe(5);

    // Verify search works again
    expect(searchContent('LED').length).toBeGreaterThan(0);
  });
});
