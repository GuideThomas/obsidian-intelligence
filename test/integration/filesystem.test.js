import { describe, it, expect } from 'vitest';
import path from 'path';
import { createFilesystemSource, findMarkdownFiles } from '../../lib/adapters/filesystem.js';

const FIXTURE_VAULT = path.resolve(__dirname, '../fixtures/vault');

describe('findMarkdownFiles', () => {
  it('should find all .md files in fixture vault', () => {
    const files = findMarkdownFiles(FIXTURE_VAULT, FIXTURE_VAULT);
    expect(files.length).toBeGreaterThanOrEqual(5);
    expect(files.every(f => f.endsWith('.md'))).toBe(true);
  });

  it('should find files in subdirectories', () => {
    const files = findMarkdownFiles(FIXTURE_VAULT, FIXTURE_VAULT);
    const hasSubfolder = files.some(f => f.includes('subfolder'));
    expect(hasSubfolder).toBe(true);
  });
});

describe('createFilesystemSource', () => {
  it('should create a source with correct type', () => {
    const source = createFilesystemSource({ vaultPath: FIXTURE_VAULT });
    expect(source.getSourceType()).toBe('filesystem');
  });

  it('should throw when no vaultPath provided', () => {
    expect(() => createFilesystemSource({})).toThrow('vaultPath is required');
  });

  describe('getAllNotes', () => {
    it('should return notes with required fields', async () => {
      const source = createFilesystemSource({ vaultPath: FIXTURE_VAULT });
      const notes = await source.getAllNotes();

      expect(notes.length).toBeGreaterThanOrEqual(5);

      for (const note of notes) {
        expect(note).toHaveProperty('id');
        expect(note).toHaveProperty('path');
        expect(note).toHaveProperty('content');
        expect(note).toHaveProperty('mtime');
        expect(note).toHaveProperty('ctime');
        expect(note.id).toBe(note.path); // For filesystem, id = relative path
        expect(note.path.endsWith('.md')).toBe(true);
        expect(note.content.length).toBeGreaterThan(0);
      }
    });

    it('should use forward slashes in paths', async () => {
      const source = createFilesystemSource({ vaultPath: FIXTURE_VAULT });
      const notes = await source.getAllNotes();

      for (const note of notes) {
        expect(note.path).not.toContain('\\');
      }
    });

    it('should find the Welcome note', async () => {
      const source = createFilesystemSource({ vaultPath: FIXTURE_VAULT });
      const notes = await source.getAllNotes();
      const welcome = notes.find(n => n.path === 'Welcome.md');

      expect(welcome).toBeDefined();
      expect(welcome.content).toContain('Welcome to My Vault');
    });

    it('should find notes in subdirectories', async () => {
      const source = createFilesystemSource({ vaultPath: FIXTURE_VAULT });
      const notes = await source.getAllNotes();
      const arch = notes.find(n => n.path.includes('Architecture'));

      expect(arch).toBeDefined();
      expect(arch.path).toContain('subfolder/');
    });
  });

  describe('testConnection', () => {
    it('should return success for valid vault', async () => {
      const source = createFilesystemSource({ vaultPath: FIXTURE_VAULT });
      const result = await source.testConnection();

      expect(result.source).toBe('filesystem');
      expect(result.md_files).toBeGreaterThanOrEqual(5);
      expect(result.vault_path).toBeTruthy();
    });

    it('should return error for nonexistent path', async () => {
      const source = createFilesystemSource({ vaultPath: '/nonexistent/path' });
      const result = await source.testConnection();

      expect(result.error).toBeDefined();
    });
  });
});
