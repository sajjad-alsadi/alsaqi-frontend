import { describe, it, expect } from 'vitest';
import {
  validateFilename,
  validateChecksum,
  validateFileSize,
  validateFileRecord,
  MAX_FILENAME_LENGTH,
  CHECKSUM_LENGTH,
} from './file-record.model';

describe('FileRecord Validation', () => {
  describe('validateFilename', () => {
    it('accepts a valid filename', () => {
      expect(validateFilename('report.pdf')).toBeNull();
    });

    it('accepts a filename at max length', () => {
      const name = 'a'.repeat(MAX_FILENAME_LENGTH);
      expect(validateFilename(name)).toBeNull();
    });

    it('rejects an empty filename', () => {
      const error = validateFilename('');
      expect(error).not.toBeNull();
      expect(error!.field).toBe('originalName');
    });

    it('rejects a filename exceeding 255 characters', () => {
      const name = 'a'.repeat(256);
      const error = validateFilename(name);
      expect(error).not.toBeNull();
      expect(error!.field).toBe('originalName');
      expect(error!.message).toContain('256');
    });

    it('rejects a filename with path traversal (..)', () => {
      const error = validateFilename('../etc/passwd');
      expect(error).not.toBeNull();
      expect(error!.message).toContain('path traversal');
    });

    it('rejects a filename with forward slash', () => {
      const error = validateFilename('path/to/file.txt');
      expect(error).not.toBeNull();
      expect(error!.message).toContain('path traversal');
    });

    it('rejects a filename with backslash', () => {
      const error = validateFilename('path\\to\\file.txt');
      expect(error).not.toBeNull();
      expect(error!.message).toContain('path traversal');
    });

    it('rejects a filename with null byte', () => {
      const error = validateFilename('file\0.txt');
      expect(error).not.toBeNull();
      expect(error!.message).toContain('path traversal');
    });
  });

  describe('validateChecksum', () => {
    it('accepts a valid SHA-256 checksum', () => {
      const validChecksum = 'a'.repeat(CHECKSUM_LENGTH);
      expect(validateChecksum(validChecksum)).toBeNull();
    });

    it('accepts a realistic SHA-256 checksum', () => {
      const checksum = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
      expect(validateChecksum(checksum)).toBeNull();
    });

    it('rejects an empty checksum', () => {
      const error = validateChecksum('');
      expect(error).not.toBeNull();
      expect(error!.field).toBe('checksum');
    });

    it('rejects a checksum that is too short', () => {
      const error = validateChecksum('abc123');
      expect(error).not.toBeNull();
      expect(error!.message).toContain('SHA-256');
    });

    it('rejects a checksum with uppercase letters', () => {
      const error = validateChecksum('A'.repeat(64));
      expect(error).not.toBeNull();
      expect(error!.message).toContain('lowercase');
    });

    it('rejects a checksum with non-hex characters', () => {
      const error = validateChecksum('g'.repeat(64));
      expect(error).not.toBeNull();
    });
  });

  describe('validateFileSize', () => {
    it('accepts a valid positive size', () => {
      expect(validateFileSize(1024)).toBeNull();
    });

    it('accepts size of 1 byte', () => {
      expect(validateFileSize(1)).toBeNull();
    });

    it('rejects zero size', () => {
      const error = validateFileSize(0);
      expect(error).not.toBeNull();
      expect(error!.field).toBe('size');
      expect(error!.message).toContain('positive');
    });

    it('rejects negative size', () => {
      const error = validateFileSize(-100);
      expect(error).not.toBeNull();
      expect(error!.message).toContain('positive');
    });

    it('rejects NaN', () => {
      const error = validateFileSize(NaN);
      expect(error).not.toBeNull();
      expect(error!.message).toContain('finite');
    });

    it('rejects Infinity', () => {
      const error = validateFileSize(Infinity);
      expect(error).not.toBeNull();
      expect(error!.message).toContain('finite');
    });

    it('rejects fractional bytes', () => {
      const error = validateFileSize(1.5);
      expect(error).not.toBeNull();
      expect(error!.message).toContain('integer');
    });
  });

  describe('validateFileRecord', () => {
    const validRecord = {
      originalName: 'document.pdf',
      checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      size: 1024,
    };

    it('returns no errors for a valid record', () => {
      expect(validateFileRecord(validRecord)).toEqual([]);
    });

    it('returns multiple errors for an invalid record', () => {
      const errors = validateFileRecord({
        originalName: '',
        checksum: 'invalid',
        size: -1,
      });
      expect(errors.length).toBe(3);
    });

    it('returns only relevant errors', () => {
      const errors = validateFileRecord({
        ...validRecord,
        originalName: 'a'.repeat(256),
      });
      expect(errors.length).toBe(1);
      expect(errors[0].field).toBe('originalName');
    });
  });
});
