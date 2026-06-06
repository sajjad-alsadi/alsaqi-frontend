import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  validateFile,
  containsPathTraversal,
  ALLOWED_MIME_TYPES,
  BUCKET_MAX_SIZE,
  MAX_FILENAME_LENGTH,
  _resetMagikaForTesting,
  type BucketName,
  type FileValidationInput,
} from '../file-validation';

// Mock magika module
vi.mock('magika', () => {
  const mockIdentifyBytes = vi.fn();
  return {
    Magika: {
      create: vi.fn().mockResolvedValue({
        identifyBytes: mockIdentifyBytes,
      }),
    },
    __mockIdentifyBytes: mockIdentifyBytes,
  };
});

// Get reference to the mock function
async function getMockIdentifyBytes() {
  const mod = await import('magika') as any;
  return mod.__mockIdentifyBytes;
}

function createInput(overrides: Partial<FileValidationInput> = {}): FileValidationInput {
  return {
    buffer: Buffer.from('fake file content'),
    filename: 'document.pdf',
    declaredContentType: 'application/pdf',
    bucket: 'evidence' as BucketName,
    ...overrides,
  };
}

describe('file-validation', () => {
  beforeEach(async () => {
    _resetMagikaForTesting();
    const mockFn = await getMockIdentifyBytes();
    mockFn.mockReset();
    // Default: magika detects PDF
    mockFn.mockResolvedValue({
      prediction: { output: { label: 'pdf' }, score: 0.99 },
    });
  });

  describe('validateFile', () => {
    describe('file size validation', () => {
      it('rejects empty files (0 bytes)', async () => {
        const result = await validateFile(createInput({ buffer: Buffer.alloc(0) }));
        expect(result.valid).toBe(false);
        expect(result.errors).toContainEqual(
          expect.objectContaining({ code: 'FILE_EMPTY' })
        );
      });

      it('rejects files exceeding evidence bucket max (50MB)', async () => {
        const overSize = 50 * 1024 * 1024 + 1; // 50MB + 1 byte
        const result = await validateFile(
          createInput({ buffer: Buffer.alloc(overSize), bucket: 'evidence' })
        );
        expect(result.valid).toBe(false);
        expect(result.errors).toContainEqual(
          expect.objectContaining({ code: 'FILE_TOO_LARGE' })
        );
      });

      it('rejects files exceeding reports bucket max (100MB)', async () => {
        const overSize = 100 * 1024 * 1024 + 1; // 100MB + 1 byte
        const result = await validateFile(
          createInput({ buffer: Buffer.alloc(overSize), bucket: 'reports' })
        );
        expect(result.valid).toBe(false);
        expect(result.errors).toContainEqual(
          expect.objectContaining({ code: 'FILE_TOO_LARGE' })
        );
      });

      it('accepts files at exactly the bucket max', async () => {
        const exactSize = 50 * 1024 * 1024; // exactly 50MB
        const result = await validateFile(
          createInput({ buffer: Buffer.alloc(exactSize), bucket: 'evidence' })
        );
        // Should not have FILE_TOO_LARGE error
        expect(result.errors.find(e => e.code === 'FILE_TOO_LARGE')).toBeUndefined();
      });

      it('accepts files with valid size > 0', async () => {
        const result = await validateFile(createInput({ buffer: Buffer.from('valid') }));
        expect(result.errors.find(e => e.code === 'FILE_EMPTY')).toBeUndefined();
        expect(result.errors.find(e => e.code === 'FILE_TOO_LARGE')).toBeUndefined();
      });
    });

    describe('filename validation', () => {
      it('rejects filenames exceeding 255 characters', async () => {
        const longName = 'a'.repeat(252) + '.pdf'; // 256 chars total
        const result = await validateFile(createInput({ filename: longName }));
        expect(result.valid).toBe(false);
        expect(result.errors).toContainEqual(
          expect.objectContaining({ code: 'FILENAME_TOO_LONG' })
        );
      });

      it('accepts filenames at exactly 255 characters', async () => {
        const exactName = 'a'.repeat(251) + '.pdf'; // 255 chars
        const result = await validateFile(createInput({ filename: exactName }));
        expect(result.errors.find(e => e.code === 'FILENAME_TOO_LONG')).toBeUndefined();
      });

      it('rejects filenames with ../ path traversal', async () => {
        const result = await validateFile(createInput({ filename: '../etc/passwd.pdf' }));
        expect(result.valid).toBe(false);
        expect(result.errors).toContainEqual(
          expect.objectContaining({ code: 'FILENAME_PATH_TRAVERSAL' })
        );
      });

      it('rejects filenames with ..\\ path traversal', async () => {
        const result = await validateFile(createInput({ filename: '..\\windows\\system.pdf' }));
        expect(result.valid).toBe(false);
        expect(result.errors).toContainEqual(
          expect.objectContaining({ code: 'FILENAME_PATH_TRAVERSAL' })
        );
      });

      it('rejects filenames with // sequences', async () => {
        const result = await validateFile(createInput({ filename: 'path//to//file.pdf' }));
        expect(result.valid).toBe(false);
        expect(result.errors).toContainEqual(
          expect.objectContaining({ code: 'FILENAME_PATH_TRAVERSAL' })
        );
      });

      it('rejects filenames with null bytes', async () => {
        const result = await validateFile(createInput({ filename: 'file\0.pdf' }));
        expect(result.valid).toBe(false);
        expect(result.errors).toContainEqual(
          expect.objectContaining({ code: 'FILENAME_PATH_TRAVERSAL' })
        );
      });

      it('accepts normal filenames', async () => {
        const result = await validateFile(createInput({ filename: 'my-report_2024.pdf' }));
        expect(result.errors.find(e => e.code === 'FILENAME_TOO_LONG')).toBeUndefined();
        expect(result.errors.find(e => e.code === 'FILENAME_PATH_TRAVERSAL')).toBeUndefined();
      });
    });

    describe('MIME type detection and validation', () => {
      it('accepts a valid PDF file with matching extension', async () => {
        const result = await validateFile(createInput());
        expect(result.valid).toBe(true);
        expect(result.detectedMimeType).toBe('application/pdf');
        expect(result.errors).toHaveLength(0);
      });

      it('rejects when detected MIME is not in allowed list', async () => {
        const mockFn = await getMockIdentifyBytes();
        mockFn.mockResolvedValue({
          prediction: { output: { label: 'elf' }, score: 0.99 },
        });

        const result = await validateFile(createInput());
        expect(result.valid).toBe(false);
        expect(result.errors).toContainEqual(
          expect.objectContaining({ code: 'MIME_NOT_ALLOWED' })
        );
      });

      it('rejects when detected MIME does not match file extension', async () => {
        const mockFn = await getMockIdentifyBytes();
        // Detect as PNG, but filename says .pdf
        mockFn.mockResolvedValue({
          prediction: { output: { label: 'png' }, score: 0.99 },
        });

        const result = await validateFile(createInput({ filename: 'document.pdf' }));
        expect(result.valid).toBe(false);
        expect(result.errors).toContainEqual(
          expect.objectContaining({ code: 'MIME_EXTENSION_MISMATCH' })
        );
      });

      it('rejects when magika returns unknown label', async () => {
        const mockFn = await getMockIdentifyBytes();
        mockFn.mockResolvedValue({
          prediction: { output: { label: 'unknown' }, score: 0.1 },
        });

        const result = await validateFile(createInput());
        expect(result.valid).toBe(false);
        expect(result.errors).toContainEqual(
          expect.objectContaining({ code: 'MIME_DETECTION_FAILED' })
        );
      });

      it('rejects when magika returns empty label', async () => {
        const mockFn = await getMockIdentifyBytes();
        mockFn.mockResolvedValue({
          prediction: { output: { label: 'empty' }, score: 0.5 },
        });

        const result = await validateFile(createInput());
        expect(result.valid).toBe(false);
        expect(result.errors).toContainEqual(
          expect.objectContaining({ code: 'MIME_DETECTION_FAILED' })
        );
      });

      it('rejects when magika throws an error', async () => {
        const mockFn = await getMockIdentifyBytes();
        mockFn.mockRejectedValue(new Error('Magika internal error'));

        const result = await validateFile(createInput());
        expect(result.valid).toBe(false);
        expect(result.errors).toContainEqual(
          expect.objectContaining({ code: 'MIME_DETECTION_FAILED' })
        );
      });

      it('accepts docx files even when magika detects zip (zip-based format)', async () => {
        const mockFn = await getMockIdentifyBytes();
        mockFn.mockResolvedValue({
          prediction: { output: { label: 'zip' }, score: 0.95 },
        });

        const result = await validateFile(
          createInput({
            filename: 'report.docx',
            declaredContentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          })
        );
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('accepts xlsx files even when magika detects zip (zip-based format)', async () => {
        const mockFn = await getMockIdentifyBytes();
        mockFn.mockResolvedValue({
          prediction: { output: { label: 'zip' }, score: 0.95 },
        });

        const result = await validateFile(
          createInput({
            filename: 'spreadsheet.xlsx',
            declaredContentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          })
        );
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('accepts PNG image with matching extension', async () => {
        const mockFn = await getMockIdentifyBytes();
        mockFn.mockResolvedValue({
          prediction: { output: { label: 'png' }, score: 0.99 },
        });

        const result = await validateFile(
          createInput({
            filename: 'screenshot.png',
            declaredContentType: 'image/png',
          })
        );
        expect(result.valid).toBe(true);
      });

      it('accepts JPEG image with .jpg extension', async () => {
        const mockFn = await getMockIdentifyBytes();
        mockFn.mockResolvedValue({
          prediction: { output: { label: 'jpeg' }, score: 0.99 },
        });

        const result = await validateFile(
          createInput({
            filename: 'photo.jpg',
            declaredContentType: 'image/jpeg',
          })
        );
        expect(result.valid).toBe(true);
      });
    });

    describe('multiple errors', () => {
      it('reports multiple validation errors at once', async () => {
        const mockFn = await getMockIdentifyBytes();
        mockFn.mockResolvedValue({
          prediction: { output: { label: 'elf' }, score: 0.99 },
        });

        const longName = '../' + 'a'.repeat(255) + '.exe';
        const result = await validateFile(
          createInput({ filename: longName, buffer: Buffer.alloc(0) })
        );

        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThanOrEqual(2);
        // Should have both empty file and path traversal errors
        expect(result.errors).toContainEqual(
          expect.objectContaining({ code: 'FILE_EMPTY' })
        );
        expect(result.errors).toContainEqual(
          expect.objectContaining({ code: 'FILENAME_PATH_TRAVERSAL' })
        );
      });
    });
  });

  describe('containsPathTraversal', () => {
    it('detects ../ sequences', () => {
      expect(containsPathTraversal('../file.txt')).toBe(true);
      expect(containsPathTraversal('path/../file.txt')).toBe(true);
    });

    it('detects ..\\ sequences', () => {
      expect(containsPathTraversal('..\\file.txt')).toBe(true);
      expect(containsPathTraversal('path\\..\\file.txt')).toBe(true);
    });

    it('detects // sequences', () => {
      expect(containsPathTraversal('path//file.txt')).toBe(true);
    });

    it('detects null bytes', () => {
      expect(containsPathTraversal('file\0.txt')).toBe(true);
    });

    it('allows normal filenames', () => {
      expect(containsPathTraversal('normal-file.txt')).toBe(false);
      expect(containsPathTraversal('path.to.file.pdf')).toBe(false);
      expect(containsPathTraversal('file_name (1).docx')).toBe(false);
    });

    it('allows filenames with single dots', () => {
      expect(containsPathTraversal('file.name.ext')).toBe(false);
    });
  });
});
