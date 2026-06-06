import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  generateStorageKey,
  sanitizeFilename,
  extractExtension,
  generateTimestamp,
  MAX_KEY_LENGTH,
  EntityType,
  EntityRef,
} from './storage-key';

describe('Storage Key Generation', () => {
  describe('sanitizeFilename', () => {
    it('removes forward slashes', () => {
      expect(sanitizeFilename('path/to/file.txt')).toBe('pathtofile.txt');
    });

    it('removes backslashes', () => {
      expect(sanitizeFilename('path\\to\\file.txt')).toBe('pathtofile.txt');
    });

    it('removes dot-dot sequences', () => {
      expect(sanitizeFilename('../etc/passwd')).toBe('etcpasswd');
    });

    it('removes null bytes', () => {
      expect(sanitizeFilename('file\0.txt')).toBe('file.txt');
    });

    it('handles multiple dangerous sequences together', () => {
      expect(sanitizeFilename('../path/to\\file\0.txt')).toBe('pathtofile.txt');
    });

    it('handles nested dot-dot sequences (....)', () => {
      expect(sanitizeFilename('....file.txt')).toBe('file.txt');
    });

    it('preserves valid filenames', () => {
      expect(sanitizeFilename('report-2024.pdf')).toBe('report-2024.pdf');
    });

    it('preserves underscores and dashes', () => {
      expect(sanitizeFilename('my_file-name.doc')).toBe('my_file-name.doc');
    });
  });

  describe('extractExtension', () => {
    it('extracts and lowercases extension', () => {
      expect(extractExtension('report.PDF')).toBe('pdf');
    });

    it('handles multi-part filenames (takes last extension)', () => {
      expect(extractExtension('archive.tar.gz')).toBe('gz');
    });

    it('returns undefined for no extension', () => {
      expect(extractExtension('README')).toBeUndefined();
    });

    it('returns undefined for dot at the end', () => {
      expect(extractExtension('file.')).toBeUndefined();
    });

    it('returns undefined for hidden files (dot at start only)', () => {
      // .gitignore has a dot only at position 0 — treated as no extension
      expect(extractExtension('.gitignore')).toBeUndefined();
    });

    it('extracts extension from hidden files with an extension', () => {
      // .config.json has dot at 0 and dot at 7 — extension is json
      expect(extractExtension('.config.json')).toBe('json');
    });

    it('lowercases mixed case extensions', () => {
      expect(extractExtension('photo.JpEg')).toBe('jpeg');
    });
  });

  describe('generateTimestamp', () => {
    it('generates correct format YYYYMMDDTHHmmss', () => {
      const date = new Date('2024-03-15T10:30:45Z');
      expect(generateTimestamp(date)).toBe('20240315T103045');
    });

    it('pads single digit months and days', () => {
      const date = new Date('2024-01-05T08:05:02Z');
      expect(generateTimestamp(date)).toBe('20240105T080502');
    });

    it('uses current time when no date provided', () => {
      const result = generateTimestamp();
      // Should match the pattern
      expect(result).toMatch(/^\d{8}T\d{6}$/);
    });
  });

  describe('generateStorageKey', () => {
    it('generates key matching expected pattern', () => {
      const entityRef: EntityRef = { type: 'audit', id: 'abc123' };
      const key = generateStorageKey(entityRef, 'report.pdf');

      // Pattern: {entityType}/{entityId}/{timestamp}-{uuid}.{ext}
      const parts = key.split('/');
      expect(parts[0]).toBe('audit');
      expect(parts[1]).toBe('abc123');

      const filePart = parts[2];
      // timestamp-uuid.ext
      expect(filePart).toMatch(/^\d{8}T\d{6}-[0-9a-f\-]{36}\.pdf$/);
    });

    it('lowercases the file extension', () => {
      const entityRef: EntityRef = { type: 'finding', id: 'xyz' };
      const key = generateStorageKey(entityRef, 'Document.DOCX');

      expect(key).toContain('.docx');
      expect(key).not.toContain('.DOCX');
    });

    it('omits extension when filename has none', () => {
      const entityRef: EntityRef = { type: 'recommendation', id: 'rec1' };
      const key = generateStorageKey(entityRef, 'README');

      // Should not end with a dot
      expect(key).not.toContain('.');
      // Pattern: {entityType}/{entityId}/{timestamp}-{uuid}
      const filePart = key.split('/')[2];
      expect(filePart).toMatch(/^\d{8}T\d{6}-[0-9a-f\-]{36}$/);
    });

    it('omits extension when filename ends with a dot', () => {
      const entityRef: EntityRef = { type: 'report', id: 'rpt1' };
      const key = generateStorageKey(entityRef, 'file.');

      const filePart = key.split('/')[2];
      expect(filePart).not.toMatch(/\.$/);
      expect(filePart).toMatch(/^\d{8}T\d{6}-[0-9a-f\-]{36}$/);
    });

    it('sanitizes dangerous filenames before extracting extension', () => {
      const entityRef: EntityRef = { type: 'audit', id: 'a1' };
      const key = generateStorageKey(entityRef, '../../../etc/passwd.txt');

      // Should NOT contain path traversal
      expect(key).not.toContain('..');
      // Extension should still be extracted from sanitized filename
      expect(key).toContain('.txt');
    });

    it('generates unique keys for identical inputs', () => {
      const entityRef: EntityRef = { type: 'audit', id: 'abc' };
      const key1 = generateStorageKey(entityRef, 'file.pdf');
      const key2 = generateStorageKey(entityRef, 'file.pdf');

      expect(key1).not.toBe(key2);
    });

    it('includes UUID v4 in the key', () => {
      const entityRef: EntityRef = { type: 'finding', id: 'f1' };
      const key = generateStorageKey(entityRef, 'doc.pdf');

      // UUID v4 pattern
      const uuidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/;
      expect(key).toMatch(uuidPattern);
    });

    it('sanitizes entity IDs with invalid S3 characters', () => {
      const entityRef: EntityRef = { type: 'audit', id: 'entity id with spaces!' };
      const key = generateStorageKey(entityRef, 'file.pdf');

      expect(key).toMatch(/^[a-zA-Z0-9\/\-_.]+$/);
      expect(key).not.toContain(' ');
      expect(key).not.toContain('!');
    });

    it('generates key within 1024 character limit', () => {
      const entityRef: EntityRef = { type: 'audit', id: 'a'.repeat(100) };
      const key = generateStorageKey(entityRef, 'file.pdf');

      expect(key.length).toBeLessThanOrEqual(MAX_KEY_LENGTH);
    });

    it('throws when key would exceed 1024 characters', () => {
      const entityRef: EntityRef = { type: 'audit', id: 'a'.repeat(1000) };
      expect(() => generateStorageKey(entityRef, 'file.pdf')).toThrow(
        /exceeds 1024 characters/,
      );
    });

    it('produces only valid S3 key characters', () => {
      const entityRef: EntityRef = { type: 'report', id: 'rpt-123_v2' };
      const key = generateStorageKey(entityRef, 'Annual Report (2024).pdf');

      // After sanitization, the key should only contain valid chars
      expect(key).toMatch(/^[a-zA-Z0-9\/\-_.]+$/);
    });

    it('works with all entity types', () => {
      const types: EntityType[] = ['audit', 'finding', 'recommendation', 'report'];
      for (const type of types) {
        const entityRef: EntityRef = { type, id: 'test-123' };
        const key = generateStorageKey(entityRef, 'file.pdf');
        expect(key).toContain(`${type}/`);
      }
    });

    it('handles filename with only null bytes', () => {
      const entityRef: EntityRef = { type: 'audit', id: 'a1' };
      // After sanitization, filename becomes empty, so no extension
      const key = generateStorageKey(entityRef, '\0\0\0');
      const filePart = key.split('/')[2];
      expect(filePart).toMatch(/^\d{8}T\d{6}-[0-9a-f\-]{36}$/);
    });

    it('handles filename with only path separators', () => {
      const entityRef: EntityRef = { type: 'audit', id: 'a1' };
      const key = generateStorageKey(entityRef, '///\\\\');
      const filePart = key.split('/')[2];
      // No extension since sanitized filename is empty
      expect(filePart).toMatch(/^\d{8}T\d{6}-[0-9a-f\-]{36}$/);
    });
  });
});
