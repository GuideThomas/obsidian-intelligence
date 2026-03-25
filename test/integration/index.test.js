import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import path from 'path';
import fs from 'fs';
import os from 'os';

const FIXTURE_VAULT = path.resolve(__dirname, '../fixtures/vault');

const { tmpDir, testDbPath } = vi.hoisted(() => {
  const _path = require('path');
  const _os = require('os');
  const tmpDir = _path.join(_os.tmpdir(), 'vault-intel-idx-' + Date.now());
  return { tmpDir, testDbPath: _path.join(tmpDir, 'index-test.db') };
});

vi.mock('../../lib/config.js', () => ({
  getConfig: (overrides) => ({
    sqlite: { path: testDbPath },
    engagement: { active: 7, moderate: 30, dormant: 90 },
    source: 'filesystem',
    vaultPath: FIXTURE_VAULT,
    llm: { url: '', model: '', apiKey: '' },
    lang: 'en',
    ...overrides
  }),
  loadConfig: () => ({}),
  resetConfig: () => {}
}));

import { initDatabase, closeDatabase, getNoteCount, getDb } from '../../lib/database.js';
import { createFilesystemSource } from '../../lib/adapters/filesystem.js';
import { parseNote, hashContent } from '../../lib/parser.js';
import { indexParsedNote, getNoteHash, deleteNote, setMeta, getMeta } from '../../lib/database.js';

describe('Full Index Workflow', () => {
  beforeAll(() => {
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    initDatabase(testDbPath);
  });

  afterAll(() => {
    closeDatabase();
    try {
      if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
      if (fs.existsSync(testDbPath + '-wal')) fs.unlinkSync(testDbPath + '-wal');
      if (fs.existsSync(testDbPath + '-shm')) fs.unlinkSync(testDbPath + '-shm');
    } catch (e) { /* ignore */ }
  });

  it('should index the entire fixture vault', async () => {
    const source = createFilesystemSource({ vaultPath: FIXTURE_VAULT });
    const notes = await source.getAllNotes();
    const allNoteIds = new Set(notes.map(n => n.id));

    let indexed = 0;
    for (const note of notes) {
      const parsed = parseNote(note);
      indexParsedNote(parsed, allNoteIds);
      indexed++;
    }

    expect(indexed).toBeGreaterThanOrEqual(5);
    expect(getNoteCount()).toBe(indexed);
  });

  it('should have stored tags', () => {
    const db = getDb();
    const tagCount = db.prepare('SELECT COUNT(*) as c FROM tags').get().c;
    expect(tagCount).toBeGreaterThan(0);
  });

  it('should have stored links', () => {
    const db = getDb();
    const linkCount = db.prepare('SELECT COUNT(*) as c FROM links').get().c;
    expect(linkCount).toBeGreaterThan(0);
  });

  it('should detect broken links', () => {
    const db = getDb();
    const broken = db.prepare('SELECT COUNT(*) as c FROM links WHERE target_id IS NULL').get().c;
    // The fixture vault has at least one broken link ([[Nonexistent Note]])
    expect(broken).toBeGreaterThanOrEqual(1);
  });

  it('should skip unchanged notes on re-index', async () => {
    const source = createFilesystemSource({ vaultPath: FIXTURE_VAULT });
    const notes = await source.getAllNotes();
    const allNoteIds = new Set(notes.map(n => n.id));

    let skipped = 0;
    for (const note of notes) {
      const contentHash = hashContent(note.content);
      if (getNoteHash(note.id) === contentHash) {
        skipped++;
      } else {
        indexParsedNote(parseNote(note), allNoteIds);
      }
    }

    // All notes should be skipped since we just indexed them
    expect(skipped).toBe(notes.length);
  });

  it('should store and retrieve metadata', () => {
    setMeta('last_full_index', new Date().toISOString());
    setMeta('total_notes', '5');
    expect(getMeta('last_full_index')).toBeTruthy();
    expect(getMeta('total_notes')).toBe('5');
  });
});
