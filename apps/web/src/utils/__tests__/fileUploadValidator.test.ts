// @vitest-environment jsdom
/**
 * Unit tests for fileUploadValidator utility.
 *
 * Validates: Requirements 12.1, 12.2, 12.3, 12.4, 12.5, 12.6
 */
import { describe, it, expect } from 'vitest';
import {
  validateFiles,
  getDefaultAllowedTypes,
  type ValidatorOptions,
  type ValidationResult,
} from '../fileUploadValidator';

// --- Helpers ---

/**
 * Create a mock File with the given properties and optional content bytes.
 */
function createMockFile(
  name: string,
  sizeOrContent: number | Uint8Array,
  type: string,
): File {
  let content: BlobPart[];
  let size: number;

  if (typeof sizeOrContent === 'number') {
    // Create a file with arbitrary content of the given size
    content = [new Uint8Array(sizeOrContent)];
    size = sizeOrContent;
  } else {
    content = [sizeOrContent];
    size = sizeOrContent.byteLength;
  }

  const file = new File(content, name, { type });
  // Override size if needed (File API size is determined by content)
  if (typeof sizeOrContent === 'number' && file.size !== size) {
    Object.defineProperty(file, 'size', { value: size });
  }
  return file;
}

/**
 * Create a file with valid PDF magic bytes.
 */
function createPdfFile(name: string, sizeMB = 0.001): File {
  // %PDF magic bytes followed by padding
  const header = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
  const totalSize = Math.max(header.length, Math.floor(sizeMB * 1024 * 1024));
  const content = new Uint8Array(totalSize);
  content.set(header);
  return new File([content], name, { type: 'application/pdf' });
}

/**
 * Create a file with valid JPEG magic bytes.
 */
function createJpegFile(name: string, sizeMB = 0.001): File {
  const header = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
  const totalSize = Math.max(header.length, Math.floor(sizeMB * 1024 * 1024));
  const content = new Uint8Array(totalSize);
  content.set(header);
  return new File([content], name, { type: 'image/jpeg' });
}

/**
 * Create a file with valid PNG magic bytes.
 */
function createPngFile(name: string, sizeMB = 0.001): File {
  const header = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const totalSize = Math.max(header.length, Math.floor(sizeMB * 1024 * 1024));
  const content = new Uint8Array(totalSize);
  content.set(header);
  return new File([content], name, { type: 'image/png' });
}

/**
 * Create a file with PK (ZIP) magic bytes (DOCX/XLSX).
 */
function createZipBasedFile(name: string, mimeType: string, sizeMB = 0.001): File {
  const header = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
  const totalSize = Math.max(header.length, Math.floor(sizeMB * 1024 * 1024));
  const content = new Uint8Array(totalSize);
  content.set(header);
  return new File([content], name, { type: mimeType });
}

// --- Tests ---

describe('fileUploadValidator', () => {
  describe('getDefaultAllowedTypes', () => {
    it('returns expected extensions for banking audit app', () => {
      const defaults = getDefaultAllowedTypes();
      expect(defaults.extensions).toContain('.pdf');
      expect(defaults.extensions).toContain('.docx');
      expect(defaults.extensions).toContain('.xlsx');
      expect(defaults.extensions).toContain('.jpg');
      expect(defaults.extensions).toContain('.jpeg');
      expect(defaults.extensions).toContain('.png');
    });

    it('returns expected MIME types for banking audit app', () => {
      const defaults = getDefaultAllowedTypes();
      expect(defaults.mimeTypes).toContain('application/pdf');
      expect(defaults.mimeTypes).toContain('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      expect(defaults.mimeTypes).toContain('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      expect(defaults.mimeTypes).toContain('image/jpeg');
      expect(defaults.mimeTypes).toContain('image/png');
    });
  });

  describe('validateFiles — size validation', () => {
    it('accepts a file within default size limit (10MB)', async () => {
      const file = createPdfFile('report.pdf', 5);
      const results = await validateFiles([file]);
      expect(results[0]?.valid).toBe(true);
      expect(results[0]?.errors).toHaveLength(0);
    });

    it('rejects a file exceeding default size limit', async () => {
      const file = createPdfFile('huge.pdf', 11);
      const results = await validateFiles([file]);
      expect(results[0]?.valid).toBe(false);
      const sizeError = results[0]?.errors.find(e => e.code === 'FILE_TOO_LARGE');
      expect(sizeError).toBeDefined();
      expect(sizeError?.details?.['actualSize']).toBe(file.size);
      expect(sizeError?.details?.['maxSize']).toBe(10 * 1024 * 1024);
    });

    it('rejects a file exceeding custom size limit', async () => {
      const file = createPdfFile('medium.pdf', 3);
      const options: ValidatorOptions = { maxSizeBytes: 2 * 1024 * 1024 };
      const results = await validateFiles([file], options);
      expect(results[0]?.valid).toBe(false);
      expect(results[0]?.errors.some(e => e.code === 'FILE_TOO_LARGE')).toBe(true);
    });

    it('clamps maxSizeBytes to minimum 1MB', async () => {
      const file = createPdfFile('small.pdf', 0.5);
      // Try to set max to 100KB (below 1MB minimum) — should be clamped to 1MB
      const options: ValidatorOptions = { maxSizeBytes: 100 * 1024 };
      const results = await validateFiles([file], options);
      // 0.5MB < 1MB (clamped minimum), so file passes
      expect(results[0]?.valid).toBe(true);
    });

    it('clamps maxSizeBytes to maximum 100MB', async () => {
      // Even if set to 200MB, the max should be 100MB
      const file = createPdfFile('giant.pdf', 101);
      const options: ValidatorOptions = { maxSizeBytes: 200 * 1024 * 1024 };
      const results = await validateFiles([file], options);
      expect(results[0]?.valid).toBe(false);
      expect(results[0]?.errors.some(e => e.code === 'FILE_TOO_LARGE')).toBe(true);
    });
  });

  describe('validateFiles — extension validation', () => {
    it('accepts a file with allowed extension', async () => {
      const file = createPdfFile('report.pdf');
      const results = await validateFiles([file]);
      expect(results[0]?.valid).toBe(true);
    });

    it('rejects a file with disallowed extension', async () => {
      const file = new File([new Uint8Array(100)], 'malware.exe', { type: 'application/x-msdownload' });
      const results = await validateFiles([file]);
      expect(results[0]?.valid).toBe(false);
      const extError = results[0]?.errors.find(e => e.code === 'DISALLOWED_EXTENSION');
      expect(extError).toBeDefined();
      expect(extError?.details?.['actualExtension']).toBe('.exe');
    });

    it('rejects a file with no extension', async () => {
      const file = new File([new Uint8Array(100)], 'noextension', { type: 'application/octet-stream' });
      const results = await validateFiles([file]);
      expect(results[0]?.valid).toBe(false);
      expect(results[0]?.errors.some(e => e.code === 'DISALLOWED_EXTENSION')).toBe(true);
    });

    it('uses custom allowed extensions when provided', async () => {
      const file = createPdfFile('document.pdf');
      const options: ValidatorOptions = {
        allowedExtensions: ['.txt'],
        allowedMimeTypes: ['text/plain'],
      };
      const results = await validateFiles([file], options);
      expect(results[0]?.valid).toBe(false);
      expect(results[0]?.errors.some(e => e.code === 'DISALLOWED_EXTENSION')).toBe(true);
    });
  });

  describe('validateFiles — MIME type validation', () => {
    it('accepts a file with allowed MIME type', async () => {
      const file = createJpegFile('photo.jpg');
      const results = await validateFiles([file]);
      expect(results[0]?.valid).toBe(true);
    });

    it('rejects a file with disallowed MIME type', async () => {
      const file = new File([new Uint8Array(100)], 'script.pdf', { type: 'text/html' });
      const results = await validateFiles([file]);
      expect(results[0]?.valid).toBe(false);
      const mimeError = results[0]?.errors.find(e => e.code === 'DISALLOWED_MIME_TYPE');
      expect(mimeError).toBeDefined();
      expect(mimeError?.details?.['actualMimeType']).toBe('text/html');
    });
  });

  describe('validateFiles — MIME/extension mismatch detection', () => {
    it('detects when a .pdf file has JPEG magic bytes', async () => {
      // File named .pdf but content is actually JPEG
      const header = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
      const file = new File([header], 'fake.pdf', { type: 'application/pdf' });
      const results = await validateFiles([file]);
      expect(results[0]?.valid).toBe(false);
      const mismatchError = results[0]?.errors.find(e => e.code === 'MIME_EXTENSION_MISMATCH');
      expect(mismatchError).toBeDefined();
      expect(mismatchError?.details?.['detectedMime']).toBe('image/jpeg');
      expect(mismatchError?.details?.['extension']).toBe('.pdf');
    });

    it('detects when a .png file has PDF magic bytes', async () => {
      // File named .png but content is actually PDF
      const header = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
      const file = new File([header], 'image.png', { type: 'image/png' });
      const results = await validateFiles([file]);
      expect(results[0]?.valid).toBe(false);
      expect(results[0]?.errors.some(e => e.code === 'MIME_EXTENSION_MISMATCH')).toBe(true);
    });

    it('accepts a .docx file with PK (ZIP) magic bytes', async () => {
      const file = createZipBasedFile(
        'document.docx',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      );
      const results = await validateFiles([file]);
      expect(results[0]?.valid).toBe(true);
    });

    it('accepts a .xlsx file with PK (ZIP) magic bytes', async () => {
      const file = createZipBasedFile(
        'spreadsheet.xlsx',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      const results = await validateFiles([file]);
      expect(results[0]?.valid).toBe(true);
    });

    it('does not flag mismatch for unknown magic bytes', async () => {
      // Arbitrary content that doesn't match any known signature
      const content = new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08]);
      const file = new File([content], 'document.pdf', { type: 'application/pdf' });
      const results = await validateFiles([file]);
      // Should only fail if extension or MIME is disallowed, not mismatch
      const mismatchError = results[0]?.errors.find(e => e.code === 'MIME_EXTENSION_MISMATCH');
      expect(mismatchError).toBeUndefined();
    });
  });

  describe('validateFiles — multi-file validation', () => {
    it('returns per-file results for multiple files', async () => {
      const validFile = createPdfFile('valid.pdf');
      const invalidFile = new File([new Uint8Array(100)], 'malware.exe', { type: 'application/x-msdownload' });
      const results = await validateFiles([validFile, invalidFile]);
      expect(results).toHaveLength(2);
      expect(results[0]?.valid).toBe(true);
      expect(results[1]?.valid).toBe(false);
    });

    it('rejects only invalid files in a batch', async () => {
      const files = [
        createPdfFile('report.pdf'),
        createJpegFile('photo.jpg'),
        createPdfFile('oversized.pdf', 15), // exceeds 10MB default
        createPngFile('screenshot.png'),
      ];
      const results = await validateFiles(files);
      expect(results[0]?.valid).toBe(true);
      expect(results[1]?.valid).toBe(true);
      expect(results[2]?.valid).toBe(false); // oversized
      expect(results[3]?.valid).toBe(true);
    });

    it('handles empty file array', async () => {
      const results = await validateFiles([]);
      expect(results).toHaveLength(0);
    });
  });

  describe('validateFiles — error accumulation', () => {
    it('reports multiple errors for a file that fails multiple checks', async () => {
      // File that is too large AND has disallowed extension AND disallowed MIME
      const content = new Uint8Array(11 * 1024 * 1024); // 11MB
      const file = new File([content], 'virus.exe', { type: 'application/x-msdownload' });
      const results = await validateFiles([file]);
      expect(results[0]?.valid).toBe(false);
      expect(results[0]?.errors.length).toBeGreaterThanOrEqual(3);
      const codes = results[0]?.errors.map(e => e.code) ?? [];
      expect(codes).toContain('FILE_TOO_LARGE');
      expect(codes).toContain('DISALLOWED_EXTENSION');
      expect(codes).toContain('DISALLOWED_MIME_TYPE');
    });
  });

  describe('validateFiles — result structure', () => {
    it('includes file reference in each result', async () => {
      const file = createPdfFile('report.pdf');
      const results = await validateFiles([file]);
      expect(results[0]?.file).toBe(file);
    });

    it('error messages contain human-readable size info', async () => {
      const file = createPdfFile('big.pdf', 15);
      const results = await validateFiles([file]);
      const sizeError = results[0]?.errors.find(e => e.code === 'FILE_TOO_LARGE');
      expect(sizeError?.message).toContain('MB');
    });

    it('error details include allowed extensions list', async () => {
      const file = new File([new Uint8Array(10)], 'file.bat', { type: 'application/x-bat' });
      const results = await validateFiles([file]);
      const extError = results[0]?.errors.find(e => e.code === 'DISALLOWED_EXTENSION');
      expect(extError?.details?.['allowedExtensions']).toBeDefined();
      expect(Array.isArray(extError?.details?.['allowedExtensions'])).toBe(true);
    });
  });
});
