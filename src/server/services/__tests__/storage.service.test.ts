// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Readable } from 'stream';

// Use vi.hoisted to create mock that can be referenced in vi.mock factories
const mockSend = vi.hoisted(() => vi.fn());

// Mock @aws-sdk/client-s3
vi.mock('@aws-sdk/client-s3', () => {
  return {
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
    AbortMultipartUploadCommand: class AbortMultipartUploadCommand {
      constructor(public input: any) {}
    },
    ListMultipartUploadsCommand: class ListMultipartUploadsCommand {
      constructor(public input: any) {}
    },
  };
});

// Mock @aws-sdk/s3-request-presigner
vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockResolvedValue('https://minio:9000/evidence/test-key?X-Amz-Signature=abc123'),
}));

// Mock @smithy/node-http-handler
vi.mock('@smithy/node-http-handler', () => ({
  NodeHttpHandler: class MockNodeHttpHandler {
    constructor(_opts?: any) {}
  },
}));

// Mock logger
vi.mock('../../utils/logger.js', () => ({
  default: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock config
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

import { StorageService, FileNotReadyError, UploadTimeoutError } from '../storage.service.js';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

describe('StorageService', () => {
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

  describe('upload()', () => {
    it('should upload a Buffer to MinIO and return StorageResult', async () => {
      mockSend.mockResolvedValueOnce({ ETag: '"abc123etag"' });

      const result = await service.upload({
        key: 'audit/123/20250101T120000-uuid.pdf',
        body: Buffer.from('file content'),
        contentType: 'application/pdf',
      });

      expect(result.key).toBe('audit/123/20250101T120000-uuid.pdf');
      expect(result.bucket).toBe('evidence'); // default bucket
      expect(result.etag).toBe('abc123etag');
      expect(result.size).toBe(12); // 'file content'.length
      expect(result.url).toContain('localhost:9000');

      // Verify PutObjectCommand was called with correct args
      expect(mockSend).toHaveBeenCalledTimes(1);
      const command = mockSend.mock.calls[0][0];
      expect(command.input.Bucket).toBe('evidence');
      expect(command.input.Key).toBe('audit/123/20250101T120000-uuid.pdf');
      expect(command.input.ContentType).toBe('application/pdf');
    });

    it('should upload to the specified bucket', async () => {
      mockSend.mockResolvedValueOnce({ ETag: '"etag456"' });

      const result = await service.upload({
        key: 'pending/file.pdf',
        body: Buffer.from('data'),
        contentType: 'application/pdf',
        bucket: 'temp',
      });

      expect(result.bucket).toBe('temp');
      const command = mockSend.mock.calls[0][0];
      expect(command.input.Bucket).toBe('temp');
    });

    it('should pass metadata to PutObjectCommand', async () => {
      mockSend.mockResolvedValueOnce({ ETag: '"etag789"' });

      await service.upload({
        key: 'file.pdf',
        body: Buffer.from('data'),
        contentType: 'application/pdf',
        metadata: { checksum: 'abc123', uploadedBy: 'user1' },
      });

      const command = mockSend.mock.calls[0][0];
      expect(command.input.Metadata).toEqual({ checksum: 'abc123', uploadedBy: 'user1' });
    });

    it('should handle Readable stream body (streaming upload)', async () => {
      mockSend.mockResolvedValueOnce({ ETag: '"stream-etag"' });

      const readable = Readable.from(Buffer.from('stream content'));

      const result = await service.upload({
        key: 'streamed.pdf',
        body: readable,
        contentType: 'application/pdf',
      });

      expect(result.key).toBe('streamed.pdf');
      expect(result.size).toBe(0); // size unknown for streams
      expect(mockSend).toHaveBeenCalledTimes(1);
    });
  });

  describe('download()', () => {
    it('should return a Readable stream from MinIO', async () => {
      const mockBody = Readable.from(Buffer.from('downloaded content'));
      mockSend.mockResolvedValueOnce({ Body: mockBody });

      const result = await service.download('audit/123/file.pdf');

      expect(result).toBeInstanceOf(Readable);
      const command = mockSend.mock.calls[0][0];
      expect(command.input.Bucket).toBe('evidence');
      expect(command.input.Key).toBe('audit/123/file.pdf');
    });

    it('should download from specified bucket', async () => {
      const mockBody = Readable.from(Buffer.from('data'));
      mockSend.mockResolvedValueOnce({ Body: mockBody });

      await service.download('pending/file.pdf', 'temp');

      const command = mockSend.mock.calls[0][0];
      expect(command.input.Bucket).toBe('temp');
    });

    it('should throw if response body is empty', async () => {
      mockSend.mockResolvedValueOnce({ Body: null });

      await expect(service.download('missing.pdf')).rejects.toThrow(
        'Empty response body for object: missing.pdf',
      );
    });
  });

  describe('delete()', () => {
    it('should delete an object from MinIO', async () => {
      mockSend.mockResolvedValueOnce({});

      await service.delete('audit/123/file.pdf');

      const command = mockSend.mock.calls[0][0];
      expect(command.input.Bucket).toBe('evidence');
      expect(command.input.Key).toBe('audit/123/file.pdf');
    });

    it('should delete from specified bucket', async () => {
      mockSend.mockResolvedValueOnce({});

      await service.delete('old-file.pdf', 'temp');

      const command = mockSend.mock.calls[0][0];
      expect(command.input.Bucket).toBe('temp');
    });
  });

  describe('copy()', () => {
    it('should copy an object from temp to permanent bucket', async () => {
      mockSend.mockResolvedValueOnce({
        CopyObjectResult: { ETag: '"copy-etag"' },
      });

      const result = await service.copy(
        'pending/file.pdf',
        'audit/123/file.pdf',
        'temp',
        'evidence',
      );

      expect(result.key).toBe('audit/123/file.pdf');
      expect(result.bucket).toBe('evidence');
      expect(result.etag).toBe('copy-etag');

      const command = mockSend.mock.calls[0][0];
      expect(command.input.Bucket).toBe('evidence');
      expect(command.input.Key).toBe('audit/123/file.pdf');
      expect(command.input.CopySource).toBe('temp/pending/file.pdf');
    });

    it('should default source and dest buckets to evidence', async () => {
      mockSend.mockResolvedValueOnce({
        CopyObjectResult: { ETag: '"etag"' },
      });

      await service.copy('source-key', 'dest-key');

      const command = mockSend.mock.calls[0][0];
      expect(command.input.Bucket).toBe('evidence');
      expect(command.input.CopySource).toBe('evidence/source-key');
    });
  });

  describe('exists()', () => {
    it('should return true when object exists', async () => {
      mockSend.mockResolvedValueOnce({});

      const result = await service.exists('audit/123/file.pdf');

      expect(result).toBe(true);
      const command = mockSend.mock.calls[0][0];
      expect(command.input.Bucket).toBe('evidence');
      expect(command.input.Key).toBe('audit/123/file.pdf');
    });

    it('should return false when object does not exist (NotFound)', async () => {
      const error = Object.assign(new Error('NotFound'), {
        name: 'NotFound',
        $metadata: { httpStatusCode: 404 },
      });
      mockSend.mockRejectedValueOnce(error);

      const result = await service.exists('nonexistent.pdf');

      expect(result).toBe(false);
    });

    it('should return false when object does not exist (NoSuchKey)', async () => {
      const error = Object.assign(new Error('NoSuchKey'), {
        name: 'NoSuchKey',
        $metadata: { httpStatusCode: 404 },
      });
      mockSend.mockRejectedValueOnce(error);

      const result = await service.exists('nonexistent.pdf');

      expect(result).toBe(false);
    });

    it('should rethrow non-404 errors', async () => {
      mockSend.mockRejectedValueOnce(new Error('Network timeout'));

      await expect(service.exists('file.pdf')).rejects.toThrow('Network timeout');
    });
  });

  describe('listObjects()', () => {
    it('should return a list of storage objects', async () => {
      mockSend.mockResolvedValueOnce({
        Contents: [
          {
            Key: 'pending/file1.pdf',
            Size: 1024,
            LastModified: new Date('2025-01-01T12:00:00Z'),
            ETag: '"etag1"',
          },
          {
            Key: 'pending/file2.pdf',
            Size: 2048,
            LastModified: new Date('2025-01-02T12:00:00Z'),
            ETag: '"etag2"',
          },
        ],
        IsTruncated: false,
      });

      const result = await service.listObjects('pending/', 'temp');

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        key: 'pending/file1.pdf',
        size: 1024,
        lastModified: new Date('2025-01-01T12:00:00Z'),
        etag: 'etag1',
      });
      expect(result[1]).toEqual({
        key: 'pending/file2.pdf',
        size: 2048,
        lastModified: new Date('2025-01-02T12:00:00Z'),
        etag: 'etag2',
      });
    });

    it('should handle pagination with ContinuationToken', async () => {
      // First page
      mockSend.mockResolvedValueOnce({
        Contents: [
          { Key: 'file1.pdf', Size: 100, LastModified: new Date(), ETag: '"e1"' },
        ],
        IsTruncated: true,
        NextContinuationToken: 'token123',
      });
      // Second page
      mockSend.mockResolvedValueOnce({
        Contents: [
          { Key: 'file2.pdf', Size: 200, LastModified: new Date(), ETag: '"e2"' },
        ],
        IsTruncated: false,
      });

      const result = await service.listObjects('', 'temp');

      expect(result).toHaveLength(2);
      expect(mockSend).toHaveBeenCalledTimes(2);
    });

    it('should return empty array when no objects found', async () => {
      mockSend.mockResolvedValueOnce({
        Contents: undefined,
        IsTruncated: false,
      });

      const result = await service.listObjects('nonexistent/', 'temp');

      expect(result).toEqual([]);
    });

    it('should skip items with missing required fields', async () => {
      mockSend.mockResolvedValueOnce({
        Contents: [
          { Key: 'valid.pdf', Size: 100, LastModified: new Date(), ETag: '"ok"' },
          { Key: undefined, Size: 100, LastModified: new Date(), ETag: '"no-key"' },
          { Key: 'no-size.pdf', Size: undefined, LastModified: new Date(), ETag: '"e"' },
        ],
        IsTruncated: false,
      });

      const result = await service.listObjects('', 'evidence');

      expect(result).toHaveLength(1);
      expect(result[0].key).toBe('valid.pdf');
    });
  });

  describe('getPresignedUrl()', () => {
    it('should generate a presigned URL with default expiry', async () => {
      const result = await service.getPresignedUrl('audit/123/file.pdf');

      expect(result).toContain('https://minio:9000');
      expect(getSignedUrl).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        { expiresIn: 3600 },
      );
    });

    it('should clamp expiry to minimum 60 seconds', async () => {
      await service.getPresignedUrl('file.pdf', 'evidence', 10);

      expect(getSignedUrl).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        { expiresIn: 60 },
      );
    });

    it('should clamp expiry to maximum 86400 seconds', async () => {
      await service.getPresignedUrl('file.pdf', 'evidence', 200000);

      expect(getSignedUrl).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        { expiresIn: 86400 },
      );
    });

    it('should use custom expiry within valid range', async () => {
      await service.getPresignedUrl('file.pdf', 'reports', 7200);

      expect(getSignedUrl).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        { expiresIn: 7200 },
      );
    });
  });

  describe('getFileDownloadUrl()', () => {
    const createFileRecord = (overrides: Partial<import('../../../models/file-record.model.js').FileRecord> = {}) => ({
      id: 'file-uuid-123',
      originalName: 'report.pdf',
      storageKey: 'audit/abc/20250101T120000-uuid.pdf',
      bucket: 'evidence' as const,
      contentType: 'application/pdf',
      size: 1024,
      checksum: 'a'.repeat(64),
      uploadedBy: 'user-1',
      status: 'ready' as const,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    });

    it('should generate a presigned URL for a file with status ready', async () => {
      const file = createFileRecord({ status: 'ready' });

      const url = await service.getFileDownloadUrl(file);

      expect(url).toContain('https://minio:9000');
      expect(getSignedUrl).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        { expiresIn: 3600 },
      );
    });

    it('should pass custom expiry to getPresignedUrl', async () => {
      const file = createFileRecord({ status: 'ready' });

      await service.getFileDownloadUrl(file, 7200);

      expect(getSignedUrl).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        { expiresIn: 7200 },
      );
    });

    it('should clamp expiry below 60s to 60s', async () => {
      const file = createFileRecord({ status: 'ready' });

      await service.getFileDownloadUrl(file, 10);

      expect(getSignedUrl).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        { expiresIn: 60 },
      );
    });

    it('should clamp expiry above 86400s to 86400s', async () => {
      const file = createFileRecord({ status: 'ready' });

      await service.getFileDownloadUrl(file, 100000);

      expect(getSignedUrl).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        { expiresIn: 86400 },
      );
    });

    it('should throw FileNotReadyError for status uploading', async () => {
      const file = createFileRecord({ status: 'uploading' });

      await expect(service.getFileDownloadUrl(file)).rejects.toThrow('Cannot generate presigned URL');
      await expect(service.getFileDownloadUrl(file)).rejects.toMatchObject({
        name: 'FileNotReadyError',
        fileId: 'file-uuid-123',
        fileStatus: 'uploading',
      });
    });

    it('should throw FileNotReadyError for status processing', async () => {
      const file = createFileRecord({ status: 'processing' });

      await expect(service.getFileDownloadUrl(file)).rejects.toThrow('Cannot generate presigned URL');
      await expect(service.getFileDownloadUrl(file)).rejects.toMatchObject({
        name: 'FileNotReadyError',
        fileId: 'file-uuid-123',
        fileStatus: 'processing',
      });
    });

    it('should throw FileNotReadyError for status failed', async () => {
      const file = createFileRecord({ status: 'failed' });

      await expect(service.getFileDownloadUrl(file)).rejects.toThrow('Cannot generate presigned URL');
      await expect(service.getFileDownloadUrl(file)).rejects.toMatchObject({
        name: 'FileNotReadyError',
        fileId: 'file-uuid-123',
        fileStatus: 'failed',
      });
    });

    it('should throw FileNotReadyError for status deleted', async () => {
      const file = createFileRecord({ status: 'deleted' });

      await expect(service.getFileDownloadUrl(file)).rejects.toThrow('Cannot generate presigned URL');
      await expect(service.getFileDownloadUrl(file)).rejects.toMatchObject({
        name: 'FileNotReadyError',
        fileId: 'file-uuid-123',
        fileStatus: 'deleted',
      });
    });

    it('should not call getPresignedUrl when file is not ready', async () => {
      const file = createFileRecord({ status: 'uploading' });

      await expect(service.getFileDownloadUrl(file)).rejects.toThrow();
      // getSignedUrl should NOT have been called since we reject before reaching it
      expect(getSignedUrl).not.toHaveBeenCalled();
    });
  });

  describe('bucket resolution', () => {
    it('should default to evidence bucket when no bucket specified', async () => {
      mockSend.mockResolvedValueOnce({ ETag: '"etag"' });

      const result = await service.upload({
        key: 'test.pdf',
        body: Buffer.from('data'),
        contentType: 'application/pdf',
      });

      expect(result.bucket).toBe('evidence');
    });
  });

  describe('upload timeout (Requirement 9.4)', () => {
    it('should throw UploadTimeoutError when upload is aborted due to timeout', async () => {
      // Simulate an abort error from the SDK
      const abortError = new Error('Request was aborted');
      abortError.name = 'AbortError';
      mockSend.mockRejectedValueOnce(abortError);

      // Mock the cleanup call (ListMultipartUploadsCommand)
      mockSend.mockResolvedValueOnce({ Uploads: [] });

      const promise = service.upload({
        key: 'large-file.pdf',
        body: Buffer.from('data'),
        contentType: 'application/pdf',
        bucket: 'temp',
      });

      await expect(promise).rejects.toThrow(UploadTimeoutError);

      // Re-setup mocks for the second assertion
      const abortError2 = new Error('Request was aborted');
      abortError2.name = 'AbortError';
      mockSend.mockRejectedValueOnce(abortError2);
      mockSend.mockResolvedValueOnce({ Uploads: [] });

      await expect(service.upload({
        key: 'large-file.pdf',
        body: Buffer.from('data'),
        contentType: 'application/pdf',
        bucket: 'temp',
      })).rejects.toMatchObject({
        name: 'UploadTimeoutError',
        key: 'large-file.pdf',
        bucket: 'temp',
        timeoutMs: 120000,
      });
    });

    it('should abort incomplete multipart uploads on timeout', async () => {
      // First call: PutObject throws abort error
      const abortError = new Error('Request was aborted');
      abortError.name = 'AbortError';
      mockSend.mockRejectedValueOnce(abortError);

      // Second call: ListMultipartUploadsCommand returns an incomplete upload
      mockSend.mockResolvedValueOnce({
        Uploads: [
          { Key: 'large-file.pdf', UploadId: 'upload-123' },
        ],
      });

      // Third call: AbortMultipartUploadCommand succeeds
      mockSend.mockResolvedValueOnce({});

      await expect(service.upload({
        key: 'large-file.pdf',
        body: Buffer.from('data'),
        contentType: 'application/pdf',
        bucket: 'temp',
      })).rejects.toThrow(UploadTimeoutError);

      // Verify the abort command was called
      expect(mockSend).toHaveBeenCalledTimes(3);
      const abortCmd = mockSend.mock.calls[2][0];
      expect(abortCmd.input.Bucket).toBe('temp');
      expect(abortCmd.input.Key).toBe('large-file.pdf');
      expect(abortCmd.input.UploadId).toBe('upload-123');
    });

    it('should handle cleanup errors gracefully when aborting incomplete uploads', async () => {
      // PutObject abort
      const abortError = new Error('Request was aborted');
      abortError.name = 'AbortError';
      mockSend.mockRejectedValueOnce(abortError);

      // ListMultipartUploadsCommand fails
      mockSend.mockRejectedValueOnce(new Error('Network error'));

      // Should still throw UploadTimeoutError (cleanup failure doesn't prevent it)
      await expect(service.upload({
        key: 'file.pdf',
        body: Buffer.from('data'),
        contentType: 'application/pdf',
        bucket: 'temp',
      })).rejects.toThrow(UploadTimeoutError);
    });

    it('should not throw UploadTimeoutError for non-abort errors', async () => {
      mockSend.mockRejectedValueOnce(new Error('Permission denied'));

      await expect(service.upload({
        key: 'file.pdf',
        body: Buffer.from('data'),
        contentType: 'application/pdf',
      })).rejects.toThrow('Permission denied');
    });

    it('should pass abortSignal to the S3 client send command', async () => {
      mockSend.mockResolvedValueOnce({ ETag: '"etag"' });

      await service.upload({
        key: 'test.pdf',
        body: Buffer.from('data'),
        contentType: 'application/pdf',
      });

      // Verify send was called with options containing abortSignal
      expect(mockSend).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          abortSignal: expect.any(AbortSignal),
        }),
      );
    });
  });

  describe('copy timeout (Requirement 9.4)', () => {
    it('should throw UploadTimeoutError when copy is aborted due to timeout', async () => {
      const abortError = new Error('Request was aborted');
      abortError.name = 'AbortError';
      mockSend.mockRejectedValueOnce(abortError);

      await expect(service.copy(
        'pending/file.pdf',
        'audit/123/file.pdf',
        'temp',
        'evidence',
      )).rejects.toThrow(UploadTimeoutError);
    });

    it('should pass abortSignal to the S3 client for copy operations', async () => {
      mockSend.mockResolvedValueOnce({
        CopyObjectResult: { ETag: '"etag"' },
      });

      await service.copy('source', 'dest', 'temp', 'evidence');

      expect(mockSend).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          abortSignal: expect.any(AbortSignal),
        }),
      );
    });
  });
});
