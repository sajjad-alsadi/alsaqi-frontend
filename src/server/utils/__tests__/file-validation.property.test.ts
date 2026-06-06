/**
 * Property-based tests for file validation.
 *
 * Property 2: File Validation Correctness
 *   For any file upload attempt, the StorageService SHALL reject the file if and only if
 *   at least one of the following holds:
 *     (a) the content-detected MIME type is not in the allowed list for the target bucket,
 *     (b) the file size exceeds the per-bucket maximum, or
 *     (c) the filename exceeds 255 characters.
 *   Valid files that satisfy all constraints SHALL be accepted.
 *
 *   **Validates: Requirements 1.1, 1.2, 11.1, 11.2**
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fc from 'fast-check';
import {
  validateFile,
  ALLOWED_MIME_TYPES,
  BUCKET_MAX_SIZE,
  MAX_FILENAME_LENGTH,
  _resetMagikaForTesting,
  type BucketName,
  type FileValidationInput,
} from '../file-validation';

// ─── Mock magika module ─────────────────────────────────────────────────────

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

async function getMockIdentifyBytes() {
  const mod = (await import('magika')) as any;
  return mod.__mockIdentifyBytes;
}

// ─── Constants & Helpers ─────────────────────────────────────────────────────

/** Mapping from magika labels to MIME types (mirrors the source) */
const LABEL_TO_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  png: 'image/png',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  gif: 'image/gif',
};

/** Reverse mapping: MIME type → one valid magika label */
const MIME_TO_LABEL: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'image/png': 'png',
  'image/jpeg': 'jpeg',
  'image/gif': 'gif',
};

/** Extension for each allowed MIME type */
const MIME_TO_EXTENSION: Record<string, string> = {
  'application/pdf': '.pdf',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.ms-excel': '.xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/gif': '.gif',
};

const BUCKETS_WITH_LIMITS: Array<{ bucket: BucketName; maxSize: number }> = [
  { bucket: 'evidence', maxSize: BUCKET_MAX_SIZE.evidence },
  { bucket: 'reports', maxSize: BUCKET_MAX_SIZE.reports },
];

/**
 * Creates a Buffer with a faked `length` property to simulate large files
 * without actually allocating huge amounts of memory. The validation logic
 * only reads `buffer.length` for size checks, and passes the buffer to
 * magika's identifyBytes (which we mock).
 */
function createFakeBuffer(reportedSize: number): Buffer {
  const small = Buffer.alloc(16, 'x');
  Object.defineProperty(small, 'length', { value: reportedSize, writable: false });
  return small;
}

// ─── Arbitraries ─────────────────────────────────────────────────────────────

/** Arbitrary for buckets under test (evidence/reports have distinct size limits) */
const arbBucket = fc.constantFrom<BucketName>('evidence', 'reports');

/** Arbitrary for allowed MIME types */
const arbAllowedMime = fc.constantFrom(...(ALLOWED_MIME_TYPES as unknown as string[]));

/** Arbitrary for disallowed MIME types / magika labels */
const arbDisallowedLabel = fc.constantFrom(
  'elf',
  'html',
  'javascript',
  'python',
  'shell',
  'xml',
  'csv',
  'mp3',
  'mp4',
  'avi'
);

// ─── Property Tests ──────────────────────────────────────────────────────────

describe('Property 2: File Validation Correctness', () => {
  beforeEach(async () => {
    _resetMagikaForTesting();
    const mockFn = await getMockIdentifyBytes();
    mockFn.mockReset();
  });

  it('valid files (size ≤ max AND filename ≤ 255 chars AND allowed MIME) are accepted', async () => {
    const mockFn = await getMockIdentifyBytes();

    await fc.assert(
      fc.asyncProperty(
        arbBucket,
        arbAllowedMime,
        fc.integer({ min: 1, max: 1024 }), // valid sizes
        fc.integer({ min: 1, max: 200 }), // filename base length (well under 255)
        async (bucket, mime, size, nameLen) => {
          const label = MIME_TO_LABEL[mime];
          const extension = MIME_TO_EXTENSION[mime];

          // Configure magika to return the expected label
          mockFn.mockResolvedValue({
            prediction: { output: { label }, score: 0.99 },
          });

          // Generate a valid filename (short, no traversal)
          const filename = 'f'.repeat(nameLen) + extension;

          const input: FileValidationInput = {
            buffer: Buffer.alloc(size, 'x'),
            filename,
            declaredContentType: mime,
            bucket,
          };

          const result = await validateFile(input);

          expect(result.valid).toBe(true);
          expect(result.errors).toHaveLength(0);
          expect(result.detectedMimeType).not.toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('files with MIME type not in allowed list are rejected', async () => {
    const mockFn = await getMockIdentifyBytes();

    await fc.assert(
      fc.asyncProperty(
        arbBucket,
        arbDisallowedLabel,
        fc.integer({ min: 1, max: 512 }),
        async (bucket, label, size) => {
          // Configure magika to return a disallowed type
          mockFn.mockResolvedValue({
            prediction: { output: { label }, score: 0.99 },
          });

          const input: FileValidationInput = {
            buffer: Buffer.alloc(size, 'x'),
            filename: 'document.pdf', // valid filename
            declaredContentType: 'application/pdf',
            bucket,
          };

          const result = await validateFile(input);

          expect(result.valid).toBe(false);
          const errorCodes = result.errors.map((e) => e.code);
          expect(
            errorCodes.includes('MIME_NOT_ALLOWED') ||
              errorCodes.includes('MIME_EXTENSION_MISMATCH')
          ).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('files exceeding per-bucket max size are rejected', async () => {
    const mockFn = await getMockIdentifyBytes();

    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...BUCKETS_WITH_LIMITS),
        arbAllowedMime,
        fc.integer({ min: 1, max: 10 * 1024 * 1024 }), // offset above max (1B–10MB over)
        async ({ bucket, maxSize }, mime, offset) => {
          const label = MIME_TO_LABEL[mime];
          const extension = MIME_TO_EXTENSION[mime];

          mockFn.mockResolvedValue({
            prediction: { output: { label }, score: 0.99 },
          });

          const overSize = maxSize + offset;
          const filename = `oversize-file${extension}`;

          // Use fake buffer to avoid allocating 50–110MB per test run
          const input: FileValidationInput = {
            buffer: createFakeBuffer(overSize),
            filename,
            declaredContentType: mime,
            bucket,
          };

          const result = await validateFile(input);

          expect(result.valid).toBe(false);
          const errorCodes = result.errors.map((e) => e.code);
          expect(errorCodes).toContain('FILE_TOO_LARGE');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('files with filename exceeding 255 characters are rejected', async () => {
    const mockFn = await getMockIdentifyBytes();

    await fc.assert(
      fc.asyncProperty(
        arbBucket,
        arbAllowedMime,
        fc.integer({ min: 256, max: 500 }), // total filename lengths > 255
        async (bucket, mime, filenameLen) => {
          const label = MIME_TO_LABEL[mime];
          const extension = MIME_TO_EXTENSION[mime];

          mockFn.mockResolvedValue({
            prediction: { output: { label }, score: 0.99 },
          });

          // Build a filename that exceeds 255 chars total
          // Ensure the total including extension exceeds 255
          const baseLen = filenameLen;
          const filename = 'a'.repeat(baseLen) + extension;

          // Double-check it actually exceeds 255
          if (filename.length <= MAX_FILENAME_LENGTH) return;

          const input: FileValidationInput = {
            buffer: Buffer.alloc(10, 'x'), // valid small file
            filename,
            declaredContentType: mime,
            bucket,
          };

          const result = await validateFile(input);

          expect(result.valid).toBe(false);
          const errorCodes = result.errors.map((e) => e.code);
          expect(errorCodes).toContain('FILENAME_TOO_LONG');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('files violating multiple constraints are rejected with all relevant errors', async () => {
    const mockFn = await getMockIdentifyBytes();

    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...BUCKETS_WITH_LIMITS),
        arbDisallowedLabel,
        fc.integer({ min: 1, max: 1024 }), // offset for oversized
        fc.integer({ min: 256, max: 400 }), // long filename base length
        async ({ bucket, maxSize }, label, offset, nameBaseLen) => {
          // MIME not allowed
          mockFn.mockResolvedValue({
            prediction: { output: { label }, score: 0.99 },
          });

          // Filename too long (> 255 chars)
          const longFilename = 'x'.repeat(nameBaseLen) + '.pdf';
          if (longFilename.length <= MAX_FILENAME_LENGTH) return;

          // File too large (use fake buffer)
          const overSize = maxSize + offset;

          const input: FileValidationInput = {
            buffer: createFakeBuffer(overSize),
            filename: longFilename,
            declaredContentType: 'application/pdf',
            bucket,
          };

          const result = await validateFile(input);

          expect(result.valid).toBe(false);
          const errorCodes = result.errors.map((e) => e.code);
          // Should have size and filename errors at minimum
          expect(errorCodes).toContain('FILE_TOO_LARGE');
          expect(errorCodes).toContain('FILENAME_TOO_LONG');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('boundary: files at exactly the bucket max size are accepted', async () => {
    const mockFn = await getMockIdentifyBytes();

    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...BUCKETS_WITH_LIMITS),
        arbAllowedMime,
        async ({ bucket, maxSize }, mime) => {
          const label = MIME_TO_LABEL[mime];
          const extension = MIME_TO_EXTENSION[mime];

          mockFn.mockResolvedValue({
            prediction: { output: { label }, score: 0.99 },
          });

          const filename = `exact-limit${extension}`;

          // Use fake buffer at exactly maxSize
          const input: FileValidationInput = {
            buffer: createFakeBuffer(maxSize),
            filename,
            declaredContentType: mime,
            bucket,
          };

          const result = await validateFile(input);

          // Should not have FILE_TOO_LARGE error
          const errorCodes = result.errors.map((e) => e.code);
          expect(errorCodes).not.toContain('FILE_TOO_LARGE');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('boundary: filenames at exactly 255 characters are accepted', async () => {
    const mockFn = await getMockIdentifyBytes();

    await fc.assert(
      fc.asyncProperty(
        arbBucket,
        arbAllowedMime,
        async (bucket, mime) => {
          const label = MIME_TO_LABEL[mime];
          const extension = MIME_TO_EXTENSION[mime];

          mockFn.mockResolvedValue({
            prediction: { output: { label }, score: 0.99 },
          });

          // Build a filename that is exactly 255 characters
          const baseLen = MAX_FILENAME_LENGTH - extension.length;
          const filename = 'a'.repeat(baseLen) + extension;

          const input: FileValidationInput = {
            buffer: Buffer.alloc(10, 'x'),
            filename,
            declaredContentType: mime,
            bucket,
          };

          const result = await validateFile(input);

          // Should not have FILENAME_TOO_LONG error
          const errorCodes = result.errors.map((e) => e.code);
          expect(errorCodes).not.toContain('FILENAME_TOO_LONG');
        }
      ),
      { numRuns: 100 }
    );
  });
});
