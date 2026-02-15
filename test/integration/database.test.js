import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'path';
import fs from 'fs';
import os from 'os';

const { tmpDir, testDbPath } = vi.hoisted(() => {
  const _path = require('path');
  const _os = require('os');
  const tmpDir = _path.join(_os.tmpdir(), 'vault-intel-test-' + Date.now());
  return { tmpDir, testDbPath: _path.join(tmpDir, 'test.db') };
});

vi.mock('../../lib/config.js', () => ({
  getConfig: () => ({
    sqlite: { path: testDbPath },
    engagement: { active: 7, moderate: 30, dormant: 90 },
    source: 'filesystem',
    vaultPath: '',
    llm: { url: '', model: '', apiKey: '' },
    lang: 'en'
  }),
  loadConfig: () => ({}),
  resetConfig: () => {}
}));

import {
  initDatabase, closeDatabase, getDb,
  getNoteCount, getNoteHash, indexParsedNote,
  deleteNote, setMeta, getMeta
} from '../../lib/database.js';
import { parseNote } from '../../lib/parser.js';

describe('Database', () => {
  beforeEach(() => {
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }
    initDatabase(testDbPath);
  });

  afterEach(() => {
    closeDatabase();
    try {
      if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
      if (fs.existsSync(testDbPath + '-wal')) fs.unlinkSync(testDbPath + '-wal');
      if (fs.existsSync(testDbPath + '-shm')) fs.unlinkSync(testDbPath + '-shm');
    } catch (e) { /* ignore */ }
  });

  it('should initialize database with tables', () => {
    const db = getDb();
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    const tableNames = tables.map(t => t.name);
    expect(tableNames).toContain('notes');
    expect(tableNames).toContain('tags');
    expect(tableNames).toContain('links');
    expect(tableNames).toContain('engagement');
    expect(tableNames).toContain('catalysts');
    expect(tableNames).toContain('metadata');
  });

  it('should start with zero notes', () => {
    expect(getNoteCount()).toBe(0);
  });

  describe('indexParsedNote', () => {
    it('should index a note and increment count', () => {
      const note = {
        id: 'test.md',
        path: 'test.md',
        content: '---\ntags: [project]\n---\n# Test\n\nContent with [[link]] and #tag.',
        mtime: Date.now(),
        ctime: Date.now()
      };

      const parsed = parseNote(note);
      const allNoteIds = new Set(['test.md', 'link.md']);
      indexParsedNote(parsed, allNoteIds);

      expect(getNoteCount()).toBe(1);
    });

    it('should store content hash', () => {
      const note = {
        id: 'hash-test.md',
        path: 'hash-test.md',
        content: 'Some content',
        mtime: Date.now(),
        ctime: Date.now()
      };

      const parsed = parseNote(note);
      indexParsedNote(parsed, new Set(['hash-test.md']));

      const hash = getNoteHash('hash-test.md');
      expect(hash).toBeDefined();
      expect(hash).toBe(parsed.contentHash);
    });

    it('should update on re-index', () => {
      const note1 = {
        id: 'update.md',
        path: 'update.md',
        content: 'Version 1',
        mtime: Date.now(),
        ctime: Date.now()
      };

      const note2 = {
        id: 'update.md',
        path: 'update.md',
        content: 'Version 2 with more content',
        mtime: Date.now() + 1000,
        ctime: Date.now()
      };

      const ids = new Set(['update.md']);
      indexParsedNote(parseNote(note1), ids);
      indexParsedNote(parseNote(note2), ids);

      expect(getNoteCount()).toBe(1);
      const db = getDb();
      const row = db.prepare('SELECT word_count FROM notes WHERE note_id = ?').get('update.md');
      expect(row.word_count).toBeGreaterThan(1);
    });

    it('should store tags', () => {
      const note = {
        id: 'tagged.md',
        path: 'tagged.md',
        content: '---\ntags: [alpha, beta]\n---\n#gamma content',
        mtime: Date.now(),
        ctime: Date.now()
      };

      indexParsedNote(parseNote(note), new Set(['tagged.md']));

      const db = getDb();
      const tags = db.prepare(`
        SELECT t.name FROM note_tags nt
        JOIN tags t ON t.tag_id = nt.tag_id
        WHERE nt.note_id = ?
      `).all('tagged.md');

      expect(tags.length).toBeGreaterThanOrEqual(3);
      const names = tags.map(t => t.name);
      expect(names).toContain('alpha');
      expect(names).toContain('beta');
      expect(names).toContain('gamma');
    });

    it('should store links', () => {
      const note = {
        id: 'linker.md',
        path: 'linker.md',
        content: 'Links to [[target1]] and [[target2|alias]]',
        mtime: Date.now(),
        ctime: Date.now()
      };

      const allIds = new Set(['linker.md', 'target1.md']);
      indexParsedNote(parseNote(note), allIds);

      const db = getDb();
      const links = db.prepare('SELECT * FROM links WHERE source_id = ?').all('linker.md');
      expect(links).toHaveLength(2);

      const resolved = links.find(l => l.target_raw === 'target1');
      expect(resolved.target_id).toBe('target1.md');

      const broken = links.find(l => l.target_raw === 'target2');
      expect(broken.target_id).toBeNull();
      expect(broken.alias).toBe('alias');
    });
  });

  describe('deleteNote', () => {
    it('should remove a note', () => {
      const note = {
        id: 'deleteme.md',
        path: 'deleteme.md',
        content: 'Will be deleted',
        mtime: Date.now(),
        ctime: Date.now()
      };

      indexParsedNote(parseNote(note), new Set(['deleteme.md']));
      expect(getNoteCount()).toBe(1);

      deleteNote('deleteme.md');
      expect(getNoteCount()).toBe(0);
    });
  });

  describe('metadata', () => {
    it('should set and get metadata', () => {
      setMeta('test_key', 'test_value');
      expect(getMeta('test_key')).toBe('test_value');
    });

    it('should return null for missing keys', () => {
      expect(getMeta('nonexistent')).toBeNull();
    });

    it('should update existing metadata', () => {
      setMeta('key', 'value1');
      setMeta('key', 'value2');
      expect(getMeta('key')).toBe('value2');
    });
  });
});
