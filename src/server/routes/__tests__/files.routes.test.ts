// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

/**
 * Unit Tests - File Upload Endpoint (Task 9.1)
 *
 * Tests POST /api/files/upload:
 * - Validates file presence
 * - Validates file with file-validation module
 * - Streams to temp bucket, computes SHA-256
 * - Creates FileRecord in DB
 * - Enqueues process-file job
 * - Returns 202 with jobId and fileId
 * - Returns 503 if MinIO unreachable
 * - Logs to audit trail
 *
 * Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 11.5
 */

// ─── Mocks ───────────────────────────────────────────────────────────────────

// Mock @aws-sdk modules to avoid dependency issues in tests
vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn(),
  PutObjectCommand: vi.fn(),
  GetObjectCommand: vi.fn(),
  DeleteObjectCommand: vi.fn(),
  HeadObjectCommand: vi.fn(),
  CopyObjectCommand: vi.fn(),
  ListObjectsV2Command: vi.fn(),
}));
vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn(),
}));
vi.mock('@smithy/node-http-handler', () => ({
  NodeHttpHandler: vi.fn(),
}));

vi.mock('../../config/storage.config', () => ({
  getStorageConfig: vi.fn().mockReturnValue({
    endpoint: 'localhost',
    port: 9000,
    accessKey: 'test',
    secretKey: 'test',
    useSSL: false,
    region: 'us-east-1',
    buckets: { evidence: 'evidence', reports: 'reports', temp: 'temp', backups: 'backups' },
    presignedUrlExpiry: 3600,
    uploadTimeoutMs: 120000,
  }),
}));

vi.mock('../../services/certificate-manager', () => ({}));

const mockDbRun = vi.fn().mockResolvedValue({ changes: 1 });
const mockDbGet = vi.fn().mockResolvedValue(null);
vi.mock('../../db/index', () => ({
  db: {
    prepare: vi.fn(() => ({
      run: mockDbRun,
      get: (...args: any[]) => mockDbGet(...args),
      all: vi.fn().mockResolvedValue([]),
    })),
  },
}));

vi.mock('../../services/AuthService', () => ({
  AuthService: {
    logAudit: vi.fn().mockResolvedValue(undefined),
  },
}));

const mockValidateFile = vi.fn();
vi.mock('../../utils/file-validation', () => ({
  validateFile: (...args: any[]) => mockValidateFile(...args),
}));

const mockGenerateStorageKey = vi.fn().mockReturnValue('audit/test-entity/20240101T120000-uuid-v4.pdf');
vi.mock('../../utils/storage-key', () => ({
  generateStorageKey: (...args: any[]) => mockGenerateStorageKey(...args),
}));

vi.mock('uuid', () => ({
  v4: () => 'test-file-id-uuid',
}));

// ─── Test Setup ──────────────────────────────────────────────────────────────

import { createFileRoutes } from '../files.routes';
import { AuthService } from '../../services/AuthService';

const mockStorageService = {
  upload: vi.fn().mockResolvedValue({
    key: 'pending/audit/test-entity/20240101T120000-uuid-v4.pdf',
    bucket: 'temp',
    etag: 'abc123',
    size: 1024,
    url: 'http://minio:9000/temp/pending/audit/test-entity/20240101T120000-uuid-v4.pdf',
  }),
  getPresignedUrl: vi.fn().mockResolvedValue('https://minio.example.com/evidence/audit/entity-1/20240101T120000-uuid-v4.pdf?X-Amz-Signature=abc123&X-Amz-Expires=3600'),
};

const mockQueueService = {
  enqueue: vi.fn().mockResolvedValue({
    jobId: 'job-123',
    queue: 'process-file',
    estimatedWaitMs: 500,
  }),
};

const mockAuthenticate = (req: any, _res: any, next: any) => {
  req.user = { id: 'user-123', username: 'testuser', role: 'Internal Auditor' };
  next();
};

function createTestApp() {
  const app = express();
  app.use(express.json());

  // Simulate express-fileupload by injecting req.files
  const fileRouter = createFileRoutes(
    mockAuthenticate,
    mockStorageService as any,
    mockQueueService as any,
    vi.fn(),
  );

  app.use('/api/files', fileRouter);
  return app;
}

// Helper to create a request with a file-like object
function injectFile(app: express.Application, fileData?: any) {
  // We need a middleware that simulates express-fileupload's behavior
  const wrappedApp = express();
  wrappedApp.use((req: any, _res, next) => {
    if (fileData !== undefined) {
      req.files = fileData;
    }
    next();
  });
  wrappedApp.use(app);
  return wrappedApp;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('POST /api/files/upload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockValidateFile.mockResolvedValue({
      valid: true,
      detectedMimeType: 'application/pdf',
      errors: [],
    });
  });

  it('should return 400 when no file is provided', async () => {
    const app = createTestApp();
    const wrappedApp = injectFile(app, null);

    const res = await request(wrappedApp)
      .post('/api/files/upload')
      .send();

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('NO_FILE');
  });

  it('should return 400 when files object has no "file" field', async () => {
    const app = createTestApp();
    const wrappedApp = injectFile(app, { other: { data: Buffer.from('test') } });

    const res = await request(wrappedApp)
      .post('/api/files/upload')
      .send();

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('NO_FILE');
  });

  it('should return 400 when multiple files are uploaded', async () => {
    const app = createTestApp();
    const wrappedApp = injectFile(app, {
      file: [
        { data: Buffer.from('file1'), name: 'a.pdf', mimetype: 'application/pdf' },
        { data: Buffer.from('file2'), name: 'b.pdf', mimetype: 'application/pdf' },
      ],
    });

    const res = await request(wrappedApp)
      .post('/api/files/upload')
      .send();

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('MULTIPLE_FILES');
  });

  it('should return 400 when file validation fails', async () => {
    mockValidateFile.mockResolvedValue({
      valid: false,
      detectedMimeType: 'text/plain',
      errors: [{ code: 'MIME_NOT_ALLOWED', message: 'text/plain is not allowed' }],
    });

    const app = createTestApp();
    const wrappedApp = injectFile(app, {
      file: { data: Buffer.from('not a pdf'), name: 'test.txt', mimetype: 'text/plain' },
    });

    const res = await request(wrappedApp)
      .post('/api/files/upload')
      .send();

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(res.body.error.details).toHaveLength(1);
    expect(res.body.error.details[0].code).toBe('MIME_NOT_ALLOWED');
  });

  it('should return 202 Accepted with jobId and fileId on successful upload', async () => {
    const app = createTestApp();
    const fileBuffer = Buffer.from('fake pdf content');
    const wrappedApp = injectFile(app, {
      file: { data: fileBuffer, name: 'report.pdf', mimetype: 'application/pdf' },
    });

    const res = await request(wrappedApp)
      .post('/api/files/upload')
      .send({ entityType: 'audit', entityId: 'entity-456' });

    expect(res.status).toBe(202);
    expect(res.body.success).toBe(true);
    expect(res.body.jobId).toBe('job-123');
    expect(res.body.fileId).toBe('test-file-id-uuid');
  });

  it('should call validateFile with correct parameters', async () => {
    const app = createTestApp();
    const fileBuffer = Buffer.from('fake pdf content');
    const wrappedApp = injectFile(app, {
      file: { data: fileBuffer, name: 'doc.pdf', mimetype: 'application/pdf' },
    });

    await request(wrappedApp)
      .post('/api/files/upload')
      .send({ entityType: 'audit', entityId: 'entity-1' });

    expect(mockValidateFile).toHaveBeenCalledWith({
      buffer: fileBuffer,
      filename: 'doc.pdf',
      declaredContentType: 'application/pdf',
      bucket: 'evidence',
    });
  });

  it('should resolve target bucket to "reports" when entityType is "report"', async () => {
    const app = createTestApp();
    const fileBuffer = Buffer.from('report content');
    const wrappedApp = injectFile(app, {
      file: { data: fileBuffer, name: 'report.pdf', mimetype: 'application/pdf' },
    });

    await request(wrappedApp)
      .post('/api/files/upload')
      .send({ entityType: 'report', entityId: 'report-1' });

    expect(mockValidateFile).toHaveBeenCalledWith(
      expect.objectContaining({ bucket: 'reports' }),
    );
  });

  it('should upload to temp bucket via StorageService', async () => {
    const app = createTestApp();
    const fileBuffer = Buffer.from('upload test');
    const wrappedApp = injectFile(app, {
      file: { data: fileBuffer, name: 'evidence.pdf', mimetype: 'application/pdf' },
    });

    await request(wrappedApp)
      .post('/api/files/upload')
      .send({ entityType: 'audit', entityId: 'audit-1' });

    expect(mockStorageService.upload).toHaveBeenCalledWith(
      expect.objectContaining({
        key: expect.stringContaining('pending/'),
        body: fileBuffer,
        contentType: 'application/pdf',
        bucket: 'temp',
      }),
    );
  });

  it('should create a FileRecord in the database with status "uploading"', async () => {
    const app = createTestApp();
    const fileBuffer = Buffer.from('db test');
    const wrappedApp = injectFile(app, {
      file: { data: fileBuffer, name: 'doc.pdf', mimetype: 'application/pdf' },
    });

    await request(wrappedApp)
      .post('/api/files/upload')
      .send({ entityType: 'finding', entityId: 'finding-1' });

    expect(mockDbRun).toHaveBeenCalledWith(
      'test-file-id-uuid',     // id
      'doc.pdf',               // original_name
      expect.any(String),      // storage_key
      'evidence',              // bucket
      'application/pdf',       // content_type
      fileBuffer.length,       // size
      expect.stringMatching(/^[0-9a-f]{64}$/), // checksum (SHA-256)
      'user-123',              // uploaded_by
      'finding-1',             // associated_entity
      'finding',               // associated_entity_type
      'uploading',             // status
      expect.any(String),      // created_at
      expect.any(String),      // updated_at
    );
  });

  it('should enqueue a process-file job with correct data', async () => {
    const app = createTestApp();
    const fileBuffer = Buffer.from('queue test');
    const wrappedApp = injectFile(app, {
      file: { data: fileBuffer, name: 'evidence.pdf', mimetype: 'application/pdf' },
    });

    await request(wrappedApp)
      .post('/api/files/upload')
      .send({ entityType: 'audit', entityId: 'audit-1' });

    expect(mockQueueService.enqueue).toHaveBeenCalledWith(
      'process-file',
      expect.objectContaining({
        tempKey: expect.stringContaining('pending/'),
        targetBucket: 'evidence',
        metadata: expect.objectContaining({
          fileId: 'test-file-id-uuid',
          storageKey: expect.any(String),
          checksum: expect.stringMatching(/^[0-9a-f]{64}$/),
          contentType: 'application/pdf',
        }),
      }),
      expect.objectContaining({
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
      }),
    );
  });

  it('should return 503 when MinIO is unreachable', async () => {
    const connectionError = new Error('connect ECONNREFUSED 127.0.0.1:9000');
    (connectionError as any).code = 'ECONNREFUSED';
    mockStorageService.upload.mockRejectedValueOnce(connectionError);

    const app = createTestApp();
    const wrappedApp = injectFile(app, {
      file: { data: Buffer.from('test'), name: 'test.pdf', mimetype: 'application/pdf' },
    });

    const res = await request(wrappedApp)
      .post('/api/files/upload')
      .send();

    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('STORAGE_UNAVAILABLE');
    expect(res.body.error.message).toContain('temporarily unavailable');
  });

  it('should log upload to audit trail on success', async () => {
    const app = createTestApp();
    const wrappedApp = injectFile(app, {
      file: { data: Buffer.from('audit test'), name: 'audit.pdf', mimetype: 'application/pdf' },
    });

    await request(wrappedApp)
      .post('/api/files/upload')
      .send();

    expect(AuthService.logAudit).toHaveBeenCalledWith(
      'testuser',
      'UPLOAD',
      'Files',
      expect.stringContaining('[success]'),
    );
  });

  it('should log validation failure to audit trail', async () => {
    mockValidateFile.mockResolvedValue({
      valid: false,
      detectedMimeType: null,
      errors: [{ code: 'FILE_EMPTY', message: 'File is empty' }],
    });

    const app = createTestApp();
    const wrappedApp = injectFile(app, {
      file: { data: Buffer.from(''), name: 'empty.pdf', mimetype: 'application/pdf' },
    });

    await request(wrappedApp)
      .post('/api/files/upload')
      .send();

    expect(AuthService.logAudit).toHaveBeenCalledWith(
      'testuser',
      'UPLOAD',
      'Files',
      expect.stringContaining('[failure]'),
    );
  });
});

// ─── Download Tests ──────────────────────────────────────────────────────────

describe('GET /api/files/:fileId/download', () => {
  const mockReadyFile = {
    id: 'file-abc-123',
    original_name: 'report.pdf',
    storage_key: 'audit/entity-1/20240101T120000-uuid-v4.pdf',
    bucket: 'evidence',
    content_type: 'application/pdf',
    size: 2048,
    checksum: 'a'.repeat(64),
    uploaded_by: 'user-123',
    associated_entity: 'entity-1',
    associated_entity_type: 'audit',
    status: 'ready',
    created_at: '2024-01-01T12:00:00.000Z',
    updated_at: '2024-01-01T12:01:00.000Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockDbGet.mockResolvedValue(null);
  });

  it('should return 404 when file does not exist', async () => {
    mockDbGet.mockResolvedValue(null);
    const app = createTestApp();

    const res = await request(app)
      .get('/api/files/nonexistent-id/download')
      .send();

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('FILE_NOT_FOUND');
  });

  it('should return 404 when file status is not "ready"', async () => {
    mockDbGet.mockResolvedValue({ ...mockReadyFile, status: 'processing' });
    const app = createTestApp();

    const res = await request(app)
      .get('/api/files/file-abc-123/download')
      .send();

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('FILE_NOT_AVAILABLE');
  });

  it('should return 404 when file status is "uploading"', async () => {
    mockDbGet.mockResolvedValue({ ...mockReadyFile, status: 'uploading' });
    const app = createTestApp();

    const res = await request(app)
      .get('/api/files/file-abc-123/download')
      .send();

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('FILE_NOT_AVAILABLE');
  });

  it('should return 403 when user is not the file owner and not admin', async () => {
    mockDbGet.mockResolvedValue({ ...mockReadyFile, uploaded_by: 'other-user-456' });
    const app = createTestApp();

    const res = await request(app)
      .get('/api/files/file-abc-123/download')
      .send();

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('should return 302 redirect to presigned URL when file owner downloads', async () => {
    mockDbGet.mockResolvedValue(mockReadyFile);
    const app = createTestApp();

    const res = await request(app)
      .get('/api/files/file-abc-123/download')
      .redirects(0)
      .send();

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('https://minio.example.com/evidence/audit/entity-1/20240101T120000-uuid-v4.pdf?X-Amz-Signature=abc123&X-Amz-Expires=3600');
  });

  it('should allow admin user to download any file', async () => {
    // File uploaded by a different user
    mockDbGet.mockResolvedValue({ ...mockReadyFile, uploaded_by: 'other-user-789' });

    // Create app with admin auth middleware
    const adminAuth = (req: any, _res: any, next: any) => {
      req.user = { id: 'admin-user-1', username: 'admin', role: 'Admin' };
      next();
    };
    const app = express();
    app.use(express.json());
    const fileRouter = createFileRoutes(adminAuth, mockStorageService as any, mockQueueService as any, vi.fn());
    app.use('/api/files', fileRouter);

    const res = await request(app)
      .get('/api/files/file-abc-123/download')
      .redirects(0)
      .send();

    expect(res.status).toBe(302);
  });

  it('should allow Manager role to download any file', async () => {
    mockDbGet.mockResolvedValue({ ...mockReadyFile, uploaded_by: 'other-user-789' });

    const managerAuth = (req: any, _res: any, next: any) => {
      req.user = { id: 'manager-1', username: 'manager', role: 'Manager' };
      next();
    };
    const app = express();
    app.use(express.json());
    const fileRouter = createFileRoutes(managerAuth, mockStorageService as any, mockQueueService as any, vi.fn());
    app.use('/api/files', fileRouter);

    const res = await request(app)
      .get('/api/files/file-abc-123/download')
      .redirects(0)
      .send();

    expect(res.status).toBe(302);
  });

  it('should call getPresignedUrl with correct parameters', async () => {
    mockDbGet.mockResolvedValue(mockReadyFile);
    const app = createTestApp();

    await request(app)
      .get('/api/files/file-abc-123/download')
      .redirects(0)
      .send();

    expect(mockStorageService.getPresignedUrl).toHaveBeenCalledWith(
      'audit/entity-1/20240101T120000-uuid-v4.pdf',
      'evidence',
      3600,
    );
  });

  it('should log download success to audit trail', async () => {
    mockDbGet.mockResolvedValue(mockReadyFile);
    const app = createTestApp();

    await request(app)
      .get('/api/files/file-abc-123/download')
      .redirects(0)
      .send();

    expect(AuthService.logAudit).toHaveBeenCalledWith(
      'testuser',
      'DOWNLOAD',
      'Files',
      expect.stringContaining('[success]'),
    );
  });

  it('should log download failure to audit trail when file not found', async () => {
    mockDbGet.mockResolvedValue(null);
    const app = createTestApp();

    await request(app)
      .get('/api/files/missing-file/download')
      .send();

    expect(AuthService.logAudit).toHaveBeenCalledWith(
      'testuser',
      'DOWNLOAD',
      'Files',
      expect.stringContaining('[failure]'),
    );
  });

  it('should log download failure to audit trail when unauthorized', async () => {
    mockDbGet.mockResolvedValue({ ...mockReadyFile, uploaded_by: 'other-user' });
    const app = createTestApp();

    await request(app)
      .get('/api/files/file-abc-123/download')
      .send();

    expect(AuthService.logAudit).toHaveBeenCalledWith(
      'testuser',
      'DOWNLOAD',
      'Files',
      expect.stringContaining('[failure]'),
    );
  });
});
