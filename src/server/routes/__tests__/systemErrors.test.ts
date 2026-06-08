// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

/**
 * Unit Tests - System Errors Endpoint (Task 6.2)
 *
 * Tests the /api/system-errors POST endpoint:
 * - Accepts error reports with proper validation
 * - Computes SHA-256 signatures from message + first stack frame
 * - Upserts errors: inserts new, increments existing count
 * - Marks errors as recurring when count > 10 within 1-hour window
 *
 * Validates: Requirements 8.5, 8.6
 */

// Track all DB calls for assertion
const mockGet = vi.fn();
const mockRun = vi.fn();

vi.mock('../../db/index', () => ({
  db: {
    prepare: vi.fn(() => ({
      get: mockGet,
      all: vi.fn().mockResolvedValue([]),
      run: mockRun,
    })),
    exec: vi.fn(),
  },
}));

vi.mock('../../utils/logger', () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

import { createSystemErrorsRoutes } from '../systemErrors';

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/system-errors', createSystemErrorsRoutes());
  return app;
}

describe('POST /api/system-errors (Task 6.2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockResolvedValue(null); // No existing error by default
    mockRun.mockResolvedValue({ lastInsertRowid: 1, changes: 1 });
  });

  describe('Basic validation', () => {
    it('should return 400 when message is missing', async () => {
      const app = createTestApp();
      const res = await request(app)
        .post('/system-errors')
        .send({ stack: 'Error\n  at foo.ts:1:1' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('message');
    });

    it('should return 400 when message is not a string', async () => {
      const app = createTestApp();
      const res = await request(app)
        .post('/system-errors')
        .send({ message: 123 });

      expect(res.status).toBe(400);
    });

    it('should return 400 for invalid type', async () => {
      const app = createTestApp();
      const res = await request(app)
        .post('/system-errors')
        .send({ message: 'test error', type: 'invalid' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('type');
    });

    it('should accept valid type values', async () => {
      const app = createTestApp();
      for (const type of ['boundary', 'uncaught', 'unhandled-rejection']) {
        const res = await request(app)
          .post('/system-errors')
          .send({ message: 'test error', type });
        expect(res.status).toBe(201);
      }
    });
  });

  describe('New error insertion', () => {
    it('should return 201 for a valid error report', async () => {
      const app = createTestApp();
      const res = await request(app)
        .post('/system-errors')
        .send({
          message: 'Cannot read properties of null',
          stack: 'TypeError: Cannot read properties of null\n  at Component.render (app.tsx:42:5)',
          appVersion: '1.0.0',
          sessionId: 'session-123',
          userAgent: 'Mozilla/5.0',
          routePath: '/dashboard',
          timestamp: new Date().toISOString(),
          type: 'boundary',
        });

      expect(res.status).toBe(201);
      expect(res.body).toEqual({ received: true });
    });

    it('should insert a new record when no matching signature exists', async () => {
      mockGet.mockResolvedValue(null); // No existing error

      const app = createTestApp();
      await request(app)
        .post('/system-errors')
        .send({
          message: 'New error',
          stack: 'Error\n  at module.ts:10:3',
          appVersion: '1.0.0',
          sessionId: 'sess-1',
          userAgent: 'UA',
          routePath: '/home',
          type: 'uncaught',
        });

      // Should have called run (INSERT)
      expect(mockRun).toHaveBeenCalled();
    });

    it('should accept minimal payload (only message)', async () => {
      const app = createTestApp();
      const res = await request(app)
        .post('/system-errors')
        .send({ message: 'Minimal error' });

      expect(res.status).toBe(201);
    });
  });

  describe('Existing error update (upsert)', () => {
    it('should increment count when signature already exists', async () => {
      const existingError = {
        id: 'existing-id-123',
        count: 5,
        first_seen: new Date().toISOString(),
      };
      mockGet.mockResolvedValue(existingError);

      const app = createTestApp();
      await request(app)
        .post('/system-errors')
        .send({
          message: 'Existing error',
          stack: 'Error\n  at file.ts:1:1',
          type: 'uncaught',
        });

      // Should have called run (UPDATE) with count = 6
      expect(mockRun).toHaveBeenCalled();
      const runCall = mockRun.mock.calls[0];
      expect(runCall[0]).toBe(6); // newCount = 5 + 1
    });
  });

  describe('Recurring incident detection (Requirement 8.6)', () => {
    it('should mark as recurring when count > 10 within 1-hour window', async () => {
      const recentFirstSeen = new Date().toISOString(); // within 1 hour
      const existingError = {
        id: 'recurring-id',
        count: 10, // Will be 11 after increment (> 10)
        first_seen: recentFirstSeen,
      };
      mockGet.mockResolvedValue(existingError);

      const app = createTestApp();
      await request(app)
        .post('/system-errors')
        .send({
          message: 'Frequent error',
          stack: 'Error\n  at busy.ts:1:1',
          type: 'uncaught',
        });

      // Should update with is_recurring = true
      const runCall = mockRun.mock.calls[0];
      expect(runCall[0]).toBe(11); // count
      expect(runCall[2]).toBe(true); // is_recurring
    });

    it('should NOT mark as recurring when count <= 10', async () => {
      const recentFirstSeen = new Date().toISOString();
      const existingError = {
        id: 'not-recurring-id',
        count: 9, // Will be 10 after increment (not > 10)
        first_seen: recentFirstSeen,
      };
      mockGet.mockResolvedValue(existingError);

      const app = createTestApp();
      await request(app)
        .post('/system-errors')
        .send({
          message: 'Infrequent error',
          stack: 'Error\n  at rare.ts:1:1',
          type: 'boundary',
        });

      const runCall = mockRun.mock.calls[0];
      expect(runCall[0]).toBe(10); // count
      expect(runCall[2]).toBe(false); // is_recurring (not > 10)
    });

    it('should NOT mark as recurring when first_seen is older than 1 hour', async () => {
      const oldFirstSeen = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(); // 2 hours ago
      const existingError = {
        id: 'old-error-id',
        count: 15, // > 10 but outside 1-hour window
        first_seen: oldFirstSeen,
      };
      mockGet.mockResolvedValue(existingError);

      const app = createTestApp();
      await request(app)
        .post('/system-errors')
        .send({
          message: 'Old frequent error',
          stack: 'Error\n  at old.ts:1:1',
          type: 'uncaught',
        });

      const runCall = mockRun.mock.calls[0];
      expect(runCall[0]).toBe(16); // count
      expect(runCall[2]).toBe(false); // is_recurring = false (outside window)
    });
  });

  describe('Error resilience', () => {
    it('should return 201 even when DB write fails (fire-and-forget)', async () => {
      mockGet.mockRejectedValue(new Error('DB connection lost'));

      const app = createTestApp();
      const res = await request(app)
        .post('/system-errors')
        .send({
          message: 'Error during outage',
          type: 'uncaught',
        });

      // Still returns 201 to not cascade errors to client
      expect(res.status).toBe(201);
      expect(res.body).toEqual({ received: true });
    });
  });

  describe('Signature computation', () => {
    it('should produce same signature for same message + first stack frame', async () => {
      const app = createTestApp();

      // First call
      await request(app)
        .post('/system-errors')
        .send({
          message: 'Test error',
          stack: 'Error: Test error\n  at Component.render (app.tsx:42:5)\n  at other.ts:10:1',
        });

      const firstGetCall = mockGet.mock.calls[0];

      // Second call with same message/stack
      await request(app)
        .post('/system-errors')
        .send({
          message: 'Test error',
          stack: 'Error: Test error\n  at Component.render (app.tsx:42:5)\n  at different.ts:99:1',
        });

      const secondGetCall = mockGet.mock.calls[1];

      // Both should query with the same signature
      // The signature is passed as the first parameter to db.prepare(...).get(signature)
      expect(firstGetCall[0]).toBe(secondGetCall[0]);
    });

    it('should produce different signatures for different messages', async () => {
      const app = createTestApp();

      await request(app)
        .post('/system-errors')
        .send({ message: 'Error A', stack: 'Error\n  at file.ts:1:1' });

      const firstSignature = mockGet.mock.calls[0][0];

      await request(app)
        .post('/system-errors')
        .send({ message: 'Error B', stack: 'Error\n  at file.ts:1:1' });

      const secondSignature = mockGet.mock.calls[1][0];

      expect(firstSignature).not.toBe(secondSignature);
    });
  });
});
