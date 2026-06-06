// @vitest-environment node
/**
 * Property-based tests for Presigned URL Scoping.
 *
 * **Validates: Requirements 3.1, 3.4**
 *
 * Property 4: Presigned URL Scoping
 * For any file download request, a Presigned_URL SHALL be generated only when
 * the corresponding FileRecord has status `ready`. The generated URL SHALL be
 * scoped to the exact object key and contain the configured expiry duration parameter.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import fc from 'fast-check';
import type { FileRecord, BucketName, FileStatus } from '../../../models/file-record.model.js';

// ─── Mocks ─────────────────────────────────────────────────────────────────────

const mockSend = vi.hoisted(() => vi.fn());

// Track calls to getSignedUrl with key/bucket/expiry info
const mockGetSignedUrl = vi.hoisted(() =>
  vi.fn().mockImplementation((_client, command, options) => {
    const key = command.input?.Key ?? 'unknown';
    const bucket = command.input?.Bucket ?? 'unknown';
    const expiry = options?.expiresIn ?? 3600;
    return Promise.resolve(
      `https://minio:9000/${bucket}/${encodeURIComponent(key)}?X-Amz-Expires=${expiry}&X-Amz-Signature=mock`,
    );
  }),
);

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: class MockS3Client {
    send = mockSend;
  },
  PutObjectCommand: class PutObjectCommand {
    constructor(public input: any) {}
  },
  GetObjectCommand: class GetObjectCommand {
    constructor(public input: any) {}
  },
  DeleteObjectCommand: class DeleteObjectCommand {
    constructor(public input: any) {}
  },
  HeadObjectCommand: class HeadObjectCommand {
    constructor(public input: any) {}
  },
  CopyObjectCommand: class CopyObjectCommand {
    constructor(public input: any) {}
  },
  ListObjectsV2Command: class ListObjectsV2Command {
    constructor(public input: any) {}
  },
}));

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: mockGetSignedUrl,
}));

vi.mock('@smithy/node-http-handler', () => ({
  NodeHttpHandler: class MockNodeHttpHandler {
    constructor(_opts?: any) {}
  },
}));

vi.mock('../../utils/logger.js', () => ({
  default: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../config/storage.config.js', () => ({
  getStorageConfig: () => ({
    endpoint: 'localhost',
    port: 9000,
    accessKey: 'minioadmin',
    secretKey: 'minioadmin',
    useSSL: false,
    region: 'us-east-1',
    buckets: {
      evidence: 'evidence',
      reports: 'reports',
      temp: 'temp',
      backups: 'backups',
    },
    maxFileSize: {
      evidence: 50 * 1024 * 1024,
      reports: 100 * 1024 * 1024,
    },
    presignedUrlExpiry: 3600,
    uploadTimeoutMs: 120000,
  }),
}));

import { StorageService, FileNotReadyError } from '../storage.service.js';

// ─── Generators ────────────────────────────────────────────────────────────────

const allStatuses: FileStatus[] = ['uploading', 'processing', 'ready', 'failed', 'deleted'];
const nonReadyStatuses: FileStatus[] = ['uploading', 'processing', 'failed', 'deleted'];

const fileStatusArb: fc.Arbitrary<FileStatus> = fc.constantFrom(...allStatuses);
const nonReadyStatusArb: fc.Arbitrary<FileStatus> = fc.constantFrom(...nonReadyStatuses);
const bucketArb: fc.Arbitrary<BucketName> = fc.constantFrom('evidence', 'reports', 'temp', 'backups');

/**
 * Generate valid storage keys matching the pattern {entityType}/{entityId}/{timestamp}-{uuid}.{ext}
 */
const storageKeyArb: fc.Arbitrary<string> = fc.tuple(
  fc.constantFrom('audit', 'finding', 'recommendation', 'report'),
  fc.stringMatching(/^[a-zA-Z0-9]{1,36}$/),
  fc.stringMatching(/^[a-z]{2,6}$/),
).map(([entityType, entityId, ext]) =>
  `${entityType}/${entityId}/20250101T120000-aaaaaaaa-bbbb-4ccc-9ddd-eeeeeeeeeeee.${ext}`,
);

/**
 * Generate a valid SHA-256 checksum (64 hex characters).
 */
const checksumArb: fc.Arbitrary<string> = fc.stringMatching(/^[0-9a-f]{64}$/);

/**
 * Generate arbitrary FileRecords with a specific or random status.
 */
function fileRecordArb(status?: FileStatus): fc.Arbitrary<FileRecord> {
  return fc.record({
    id: fc.uuid(),
    originalName: fc.stringMatching(/^[a-zA-Z0-9_-]{1,32}\.[a-z]{2,4}$/),
    storageKey: storageKeyArb,
    bucket: bucketArb,
    contentType: fc.constantFrom(
      'application/pdf',
      'image/png',
      'image/jpeg',
    ),
    size: fc.integer({ min: 1, max: 50 * 1024 * 1024 }),
    checksum: checksumArb,
    uploadedBy: fc.uuid(),
    status: status ? fc.constant(status) : fileStatusArb,
    createdAt: fc.constant(new Date('2025-01-01T00:00:00Z')),
    updatedAt: fc.constant(new Date('2025-01-01T00:00:00Z')),
  });
}

/**
 * Generate arbitrary expiry durations including values below, within, and above
 * the valid range [60, 86400].
 */
const expiryDurationArb: fc.Arbitrary<number> = fc.oneof(
  // Below minimum (should clamp to 60)
  fc.integer({ min: -1000, max: 59 }),
  // Within valid range
  fc.integer({ min: 60, max: 86400 }),
  // Above maximum (should clamp to 86400)
  fc.integer({ min: 86401, max: 500000 }),
);

// ─── Property Tests ────────────────────────────────────────────────────────────

describe('Property 4: Presigned URL Scoping', () => {
  let service: StorageService;
  const mockCertManager = {
    getMinioSSLConfig: vi.fn().mockReturnValue({ secure: false }),
    getPostgresSSLConfig: vi.fn(),
    getRedisSSLConfig: vi.fn(),
    reloadCertificates: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    service = new StorageService(undefined, mockCertManager as any);
  });

  /**
   * **Validates: Requirements 3.4**
   *
   * For records with status 'ready': getFileDownloadUrl() succeeds and returns a URL
   * scoped to the exact object key.
   */
  it('generates a presigned URL only for FileRecords with status ready', async () => {
    await fc.assert(
      fc.asyncProperty(fileRecordArb('ready'), async (record) => {
        mockGetSignedUrl.mockClear();

        const url = await service.getFileDownloadUrl(record);

        // URL must be a non-empty string
        expect(url).toBeTruthy();
        expect(typeof url).toBe('string');

        // getSignedUrl must have been called exactly once
        expect(mockGetSignedUrl).toHaveBeenCalledTimes(1);

        // The command passed to getSignedUrl must contain the exact storage key
        const callArgs = mockGetSignedUrl.mock.calls[0];
        const commandInput = callArgs[1].input;
        expect(commandInput.Key).toBe(record.storageKey);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 3.4**
   *
   * For records with any non-ready status: getFileDownloadUrl() throws FileNotReadyError.
   */
  it('throws FileNotReadyError for FileRecords with non-ready status', async () => {
    await fc.assert(
      fc.asyncProperty(fileRecordArb(), nonReadyStatusArb, async (record, nonReadyStatus) => {
        mockGetSignedUrl.mockClear();

        const nonReadyRecord: FileRecord = { ...record, status: nonReadyStatus };

        try {
          await service.getFileDownloadUrl(nonReadyRecord);
          expect.fail('Expected FileNotReadyError to be thrown');
        } catch (error) {
          expect(error).toBeInstanceOf(FileNotReadyError);
          expect((error as FileNotReadyError).fileId).toBe(nonReadyRecord.id);
          expect((error as FileNotReadyError).fileStatus).toBe(nonReadyRecord.status);
        }

        // getSignedUrl must NOT have been called
        expect(mockGetSignedUrl).not.toHaveBeenCalled();
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 3.1**
   *
   * The generated URL is scoped to the exact object key — it must reference
   * the correct bucket and key from the FileRecord.
   */
  it('presigned URL is scoped to the exact object key and bucket', async () => {
    await fc.assert(
      fc.asyncProperty(fileRecordArb('ready'), async (record) => {
        mockGetSignedUrl.mockClear();

        const url = await service.getFileDownloadUrl(record);

        // URL must be a non-empty string
        expect(url).toBeTruthy();

        // The command was issued for the correct bucket and key
        const callArgs = mockGetSignedUrl.mock.calls[0];
        const commandInput = callArgs[1].input;
        expect(commandInput.Key).toBe(record.storageKey);
        expect(commandInput.Bucket).toBe(record.bucket);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 3.1**
   *
   * Expiry durations are clamped to [60, 86400] range. Values below 60 are clamped
   * to 60; values above 86400 are clamped to 86400; values within range are used as-is.
   */
  it('expiry duration is clamped to [60, 86400] range', async () => {
    await fc.assert(
      fc.asyncProperty(fileRecordArb('ready'), expiryDurationArb, async (record, requestedExpiry) => {
        mockGetSignedUrl.mockClear();

        await service.getFileDownloadUrl(record, requestedExpiry);

        // Retrieve the actual expiry passed to getSignedUrl
        const callArgs = mockGetSignedUrl.mock.calls[0];
        const actualExpiry = callArgs[2].expiresIn;

        // Verify clamping behavior
        const expectedExpiry = Math.min(86400, Math.max(60, requestedExpiry));
        expect(actualExpiry).toBe(expectedExpiry);

        // Verify it's within valid bounds
        expect(actualExpiry).toBeGreaterThanOrEqual(60);
        expect(actualExpiry).toBeLessThanOrEqual(86400);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 3.1, 3.4**
   *
   * Combined property: For any arbitrary FileRecord with any status, the system
   * SHALL generate a URL if and only if status is 'ready', and SHALL throw otherwise.
   */
  it('URL generation partitions correctly on file status', async () => {
    await fc.assert(
      fc.asyncProperty(fileRecordArb(), async (record) => {
        mockGetSignedUrl.mockClear();

        if (record.status === 'ready') {
          const url = await service.getFileDownloadUrl(record);
          expect(url).toBeTruthy();
          expect(mockGetSignedUrl).toHaveBeenCalledTimes(1);

          const callArgs = mockGetSignedUrl.mock.calls[0];
          expect(callArgs[1].input.Key).toBe(record.storageKey);
        } else {
          try {
            await service.getFileDownloadUrl(record);
            expect.fail('Expected FileNotReadyError for non-ready status');
          } catch (error) {
            expect(error).toBeInstanceOf(FileNotReadyError);
            expect((error as FileNotReadyError).fileStatus).toBe(record.status);
          }
          expect(mockGetSignedUrl).not.toHaveBeenCalled();
        }
      }),
      { numRuns: 100 },
    );
  });
});
