import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';
import _path from 'path';
import _fs from 'fs';
import _os from 'os';

// Use createRequire to ensure all modules share the same CJS module instances
// This prevents ESM/CJS module duplication where graph.js and the test
// would otherwise see different database.js singletons.
const require = createRequire(import.meta.url);

const tmpDir = _path.join(_os.tmpdir(), 'vault-intel-graph-' + Date.now());
const testDbPath = _path.join(tmpDir, 'graph-test.db');

// Set env before requiring config
process.env.VAULT_INTEL_DB = testDbPath;
process.env.VAULT_PATH = '';

const { initDatabase, closeDatabase, indexParsedNote } = require('../../lib/database.js');
const { parseNote } = require('../../lib/parser.js');
const {
  findOrphans, findHubs, findBacklinks, findLinks,
  getTagCloud, findNotesByTag, findRelated, findBrokenLinks,
  resolveNoteQuery
} = require('../../lib/graph.js');

describe('Graph Queries', () => {
  beforeAll(() => {
    if (!_fs.existsSync(tmpDir)) _fs.mkdirSync(tmpDir, { recursive: true });
    initDatabase(testDbPath);

    // Build a test graph
    const notes = [
      {
        id: 'hub.md', path: 'hub.md',
        content: '---\ntags: [project, important]\n---\n# Hub Note\nLinks: [[spoke1]] [[spoke2]] [[spoke3]] #central',
        mtime: Date.now(), ctime: Date.now()
      },
      {
        id: 'spoke1.md', path: 'spoke1.md',
        content: '---\ntags: [project]\n---\n# Spoke 1\nBack to [[hub]] and [[spoke2]]',
        mtime: Date.now() - 5 * 86400000, ctime: Date.now() - 30 * 86400000
      },
      {
        id: 'spoke2.md', path: 'spoke2.md',
        content: '#project\n# Spoke 2\nLinks to [[hub]]',
        mtime: Date.now() - 15 * 86400000, ctime: Date.now() - 60 * 86400000
      },
      {
        id: 'spoke3.md', path: 'folder/spoke3.md',
        content: '# Spoke 3\nLinks to [[hub]] and [[nonexistent]]',
        mtime: Date.now() - 100 * 86400000, ctime: Date.now() - 200 * 86400000
      },
      {
        id: 'orphan.md', path: 'orphan.md',
        content: '# Orphan Note\nNo tags, no links to anyone.',
        mtime: Date.now() - 50 * 86400000, ctime: Date.now() - 50 * 86400000
      }
    ];

    const allIds = new Set(notes.map(n => n.id));
    for (const note of notes) {
      indexParsedNote(parseNote(note), allIds);
    }
  });

  afterAll(() => {
    closeDatabase();
    delete process.env.VAULT_INTEL_DB;
    try {
      if (_fs.existsSync(testDbPath)) _fs.unlinkSync(testDbPath);
      if (_fs.existsSync(testDbPath + '-wal')) _fs.unlinkSync(testDbPath + '-wal');
      if (_fs.existsSync(testDbPath + '-shm')) _fs.unlinkSync(testDbPath + '-shm');
    } catch (e) { /* ignore */ }
  });

  describe('findOrphans', () => {
    it('should find the orphan note', () => {
      const orphans = findOrphans();
      expect(orphans.length).toBeGreaterThanOrEqual(1);
      const orphanIds = orphans.map(o => o.note_id);
      expect(orphanIds).toContain('orphan.md');
    });

    it('should not include hub note', () => {
      const orphans = findOrphans();
      const ids = orphans.map(o => o.note_id);
      expect(ids).not.toContain('hub.md');
    });
  });

  describe('findHubs', () => {
    it('should rank hub note first', () => {
      const hubs = findHubs(5);
      expect(hubs.length).toBeGreaterThanOrEqual(1);
      expect(hubs[0].note_id).toBe('hub.md');
      expect(hubs[0].total_connections).toBeGreaterThan(0);
    });
  });

  describe('findBacklinks', () => {
    it('should find notes linking to hub', () => {
      const result = findBacklinks('hub');
      expect(result.error).toBeUndefined();
      expect(result.results.length).toBeGreaterThanOrEqual(2);
    });

    it('should return error for nonexistent note', () => {
      const result = findBacklinks('does-not-exist-anywhere');
      expect(result.error).toBeDefined();
    });
  });

  describe('findLinks', () => {
    it('should find outgoing links from hub', () => {
      const result = findLinks('hub');
      expect(result.error).toBeUndefined();
      expect(result.results.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('getTagCloud', () => {
    it('should return tags with counts', () => {
      const tags = getTagCloud();
      expect(tags.length).toBeGreaterThan(0);
      expect(tags[0]).toHaveProperty('name');
      expect(tags[0]).toHaveProperty('count');
    });

    it('should filter tags', () => {
      const tags = getTagCloud('project');
      expect(tags.length).toBeGreaterThanOrEqual(1);
      expect(tags.every(t => t.name.includes('project'))).toBe(true);
    });
  });

  describe('findNotesByTag', () => {
    it('should find notes with project tag', () => {
      const notes = findNotesByTag('project');
      expect(notes.length).toBeGreaterThanOrEqual(2);
    });

    it('should strip # prefix', () => {
      const notes = findNotesByTag('#project');
      expect(notes.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('findRelated', () => {
    it('should find related notes for hub', () => {
      const result = findRelated('hub');
      expect(result.error).toBeUndefined();
      expect(result.byTags.length + result.byLinks.length).toBeGreaterThan(0);
    });
  });

  describe('findBrokenLinks', () => {
    it('should find the broken link to nonexistent', () => {
      const broken = findBrokenLinks();
      expect(broken.length).toBeGreaterThanOrEqual(1);
      const targets = broken.map(b => b.target_raw);
      expect(targets).toContain('nonexistent');
    });
  });

  describe('resolveNoteQuery', () => {
    it('should resolve by exact id', () => {
      expect(resolveNoteQuery('hub.md')).toBe('hub.md');
    });

    it('should resolve without .md extension', () => {
      expect(resolveNoteQuery('hub')).toBe('hub.md');
    });

    it('should resolve by title', () => {
      expect(resolveNoteQuery('Hub Note')).toBe('hub.md');
    });

    it('should resolve by partial title', () => {
      expect(resolveNoteQuery('Spoke 1')).toBe('spoke1.md');
    });

    it('should return null for unknown note', () => {
      expect(resolveNoteQuery('completely-unknown-note')).toBeNull();
    });
  });
});
