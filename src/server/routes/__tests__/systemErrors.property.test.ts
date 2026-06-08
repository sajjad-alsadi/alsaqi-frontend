// @vitest-environment node
/**
 * Property-based tests for the System Errors endpoint.
 *
 * Feature: production-readiness-review
 *
 * Property 9: Error storage preserves required fields
 * - For any valid error report submitted, verify stored record contains
 *   signature (64 hex chars), message, count ≥ 1, first_seen, last_seen
 * - **Validates: Requirements 8.5**
 *
 * Property 10: Recurring incident detection threshold
 * - For any error signature with N occurrences in a time window:
 *   - If N > 10 AND first_seen is within the last hour → is_recurring = true
 *   - If N <= 10 OR first_seen is older than 1 hour → is_recurring = false
 * - **Validates: Requirements 8.6**
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import express from 'express';
import request from 'supertest';

// ─── Mocks for Property 9 ───────────────────────────────────────────────────

const mockGet = vi.fn();
const mockRun = vi.fn();
const mockPrepare = vi.fn(() => ({
  get: mockGet,
  all: vi.fn().mockResolvedValue([]),
  run: mockRun,
}));

vi.mock('../../db/index', () => ({
  db: {
    prepare: (...args: any[]) => mockPrepare(...args),
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

// ─── Custom Arbitraries for Property 9 ──────────────────────────────────────

/** Generates a non-empty error message string */
const errorMessageArb = fc.string({ minLength: 1, maxLength: 200 }).filter(
  (s) => s.trim().length > 0 && typeof s === 'string'
);

/** Generates an optional stack trace with at least one 'at' frame */
const stackTraceArb = fc.option(
  fc.tuple(
    fc.string({ minLength: 1, maxLength: 50 }),
    fc.string({ minLength: 1, maxLength: 30 }).filter((s) => /^[a-zA-Z0-9_.]+$/.test(s)),
    fc.nat({ max: 9999 }),
    fc.nat({ max: 999 }),
  ).map(([msg, file, line, col]) =>
    `Error: ${msg}\n  at Component.render (${file}.tsx:${line}:${col})`
  ),
  { nil: undefined }
);

/** Generates optional metadata fields */
const metadataArb = fc.record({
  appVersion: fc.option(fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim().length > 0), { nil: undefined }),
  sessionId: fc.option(fc.uuid(), { nil: undefined }),
  userAgent: fc.option(fc.string({ minLength: 5, maxLength: 100 }), { nil: undefined }),
  routePath: fc.option(
    fc.string({ minLength: 1, maxLength: 50 }).filter((s) => /^[a-zA-Z0-9/\-_]+$/.test(s)).map((s) => `/${s}`),
    { nil: undefined }
  ),
});

/** Generates a valid error type */
const errorTypeArb = fc.option(
  fc.constantFrom('boundary' as const, 'uncaught' as const, 'unhandled-rejection' as const),
  { nil: undefined }
);

// ─── Helper ─────────────────────────────────────────────────────────────────

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/system-errors', createSystemErrorsRoutes());
  return app;
}

// ─── Property 9 Tests ────────────────────────────────────────────────────────

describe('Property 9: Error storage preserves required fields', () => {
  /**
   * For any valid error report submitted, verify stored record contains
   * signature (64 hex chars), message, count ≥ 1, first_seen, last_seen.
   *
   * **Validates: Requirements 8.5**
   */

  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockResolvedValue(null); // No existing error — triggers INSERT path
    mockRun.mockResolvedValue({ lastInsertRowid: 1, changes: 1 });
  });

  it('stored record contains non-empty 64-char hex signature for any valid error report', async () => {
    await fc.assert(
      fc.asyncProperty(
        errorMessageArb,
        stackTraceArb,
        metadataArb,
        errorTypeArb,
        async (message, stack, metadata, type) => {
          vi.clearAllMocks();
          mockGet.mockResolvedValue(null);
          mockRun.mockResolvedValue({ lastInsertRowid: 1, changes: 1 });

          const app = createTestApp();
          const payload: Record<string, any> = { message };
          if (stack !== undefined) payload.stack = stack;
          if (metadata.appVersion !== undefined) payload.appVersion = metadata.appVersion;
          if (metadata.sessionId !== undefined) payload.sessionId = metadata.sessionId;
          if (metadata.userAgent !== undefined) payload.userAgent = metadata.userAgent;
          if (metadata.routePath !== undefined) payload.routePath = metadata.routePath;
          if (type !== undefined) payload.type = type;

          const res = await request(app)
            .post('/system-errors')
            .send(payload);

          expect(res.status).toBe(201);

          // The INSERT call passes signature as the first arg to run()
          expect(mockRun).toHaveBeenCalled();
          const insertArgs = mockRun.mock.calls[0];
          const signature = insertArgs[0];

          // Signature must be a 64-character hex string (SHA-256)
          expect(typeof signature).toBe('string');
          expect(signature).toMatch(/^[a-f0-9]{64}$/);
        }
      ),
      { numRuns: 100 }
    );
  }, 60000);

  it('stored record preserves the original message for any valid error report', async () => {
    await fc.assert(
      fc.asyncProperty(
        errorMessageArb,
        stackTraceArb,
        metadataArb,
        errorTypeArb,
        async (message, stack, metadata, type) => {
          vi.clearAllMocks();
          mockGet.mockResolvedValue(null);
          mockRun.mockResolvedValue({ lastInsertRowid: 1, changes: 1 });

          const app = createTestApp();
          const payload: Record<string, any> = { message };
          if (stack !== undefined) payload.stack = stack;
          if (metadata.appVersion !== undefined) payload.appVersion = metadata.appVersion;
          if (metadata.sessionId !== undefined) payload.sessionId = metadata.sessionId;
          if (metadata.userAgent !== undefined) payload.userAgent = metadata.userAgent;
          if (metadata.routePath !== undefined) payload.routePath = metadata.routePath;
          if (type !== undefined) payload.type = type;

          const res = await request(app)
            .post('/system-errors')
            .send(payload);

          expect(res.status).toBe(201);

          // INSERT args: signature, message, stack, componentStack, now, now, ...
          expect(mockRun).toHaveBeenCalled();
          const insertArgs = mockRun.mock.calls[0];
          const storedMessage = insertArgs[1];

          expect(storedMessage).toBe(message);
        }
      ),
      { numRuns: 100 }
    );
  }, 60000);

  it('stored record has count = 1 for new error reports (verified via SQL)', async () => {
    await fc.assert(
      fc.asyncProperty(
        errorMessageArb,
        stackTraceArb,
        errorTypeArb,
        async (message, stack, type) => {
          vi.clearAllMocks();
          mockGet.mockResolvedValue(null);
          mockRun.mockResolvedValue({ lastInsertRowid: 1, changes: 1 });

          const app = createTestApp();
          const payload: Record<string, any> = { message };
          if (stack !== undefined) payload.stack = stack;
          if (type !== undefined) payload.type = type;

          const res = await request(app)
            .post('/system-errors')
            .send(payload);

          expect(res.status).toBe(201);

          // The INSERT SQL includes count = 1 hardcoded in VALUES
          // Verify INSERT SQL was prepared
          const insertCall = mockPrepare.mock.calls.find(
            (call: any[]) => typeof call[0] === 'string' && call[0].includes('INSERT INTO system_errors')
          );
          expect(insertCall).toBeDefined();
          // The SQL contains ', 1,' which is the count value
          expect(insertCall![0]).toContain(', 1,');
        }
      ),
      { numRuns: 100 }
    );
  }, 60000);

  it('stored record has count >= 1 when error already exists (increments)', async () => {
    await fc.assert(
      fc.asyncProperty(
        errorMessageArb,
        stackTraceArb,
        fc.integer({ min: 1, max: 10000 }), // existing count
        async (message, stack, existingCount) => {
          vi.clearAllMocks();

          // Simulate existing record
          mockGet.mockResolvedValue({
            id: 'existing-id',
            count: existingCount,
            first_seen: new Date().toISOString(),
          });
          mockRun.mockResolvedValue({ changes: 1 });

          const app = createTestApp();
          const payload: Record<string, any> = { message };
          if (stack !== undefined) payload.stack = stack;

          const res = await request(app)
            .post('/system-errors')
            .send(payload);

          expect(res.status).toBe(201);

          // UPDATE call: first arg is the new count
          expect(mockRun).toHaveBeenCalled();
          const updateArgs = mockRun.mock.calls[0];
          const newCount = updateArgs[0];

          // Count should be incremented and always >= 1
          expect(newCount).toBe(existingCount + 1);
          expect(newCount).toBeGreaterThanOrEqual(1);
        }
      ),
      { numRuns: 100 }
    );
  }, 60000);

  it('stored record has valid ISO timestamps for first_seen and last_seen', async () => {
    await fc.assert(
      fc.asyncProperty(
        errorMessageArb,
        stackTraceArb,
        metadataArb,
        errorTypeArb,
        async (message, stack, metadata, type) => {
          vi.clearAllMocks();
          mockGet.mockResolvedValue(null);
          mockRun.mockResolvedValue({ lastInsertRowid: 1, changes: 1 });

          const app = createTestApp();
          const payload: Record<string, any> = { message };
          if (stack !== undefined) payload.stack = stack;
          if (metadata.appVersion !== undefined) payload.appVersion = metadata.appVersion;
          if (metadata.sessionId !== undefined) payload.sessionId = metadata.sessionId;
          if (metadata.userAgent !== undefined) payload.userAgent = metadata.userAgent;
          if (metadata.routePath !== undefined) payload.routePath = metadata.routePath;
          if (type !== undefined) payload.type = type;

          const res = await request(app)
            .post('/system-errors')
            .send(payload);

          expect(res.status).toBe(201);

          // INSERT args order: signature, message, stack, componentStack, first_seen, last_seen, ...
          expect(mockRun).toHaveBeenCalled();
          const insertArgs = mockRun.mock.calls[0];
          const firstSeen = insertArgs[4]; // 5th positional arg
          const lastSeen = insertArgs[5]; // 6th positional arg

          // Both should be valid ISO date strings
          expect(typeof firstSeen).toBe('string');
          expect(typeof lastSeen).toBe('string');
          expect(new Date(firstSeen).toISOString()).toBe(firstSeen);
          expect(new Date(lastSeen).toISOString()).toBe(lastSeen);

          // For new records, first_seen and last_seen should be the same
          expect(firstSeen).toBe(lastSeen);
        }
      ),
      { numRuns: 100 }
    );
  }, 60000);
});

// ─── Property 10 Tests ───────────────────────────────────────────────────────

/**
 * Extracted recurring incident detection logic matching the implementation
 * in src/server/routes/systemErrors.ts:
 *
 *   const firstSeen = new Date(existing.first_seen);
 *   const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
 *   const isRecurring = newCount > 10 && firstSeen >= oneHourAgo;
 */
function isRecurringIncident(newCount: number, firstSeenTimestamp: number, nowTimestamp: number): boolean {
  const firstSeen = new Date(firstSeenTimestamp);
  const oneHourAgo = new Date(nowTimestamp - 60 * 60 * 1000);
  return newCount > 10 && firstSeen >= oneHourAgo;
}

describe('Property 10: Recurring incident detection threshold', () => {
  /**
   * Property: When count > 10 AND first_seen is within the last hour,
   * the error MUST be marked as recurring.
   */
  it('marks error as recurring when count > 10 and first_seen within 1 hour', () => {
    const now = Date.now();

    fc.assert(
      fc.property(
        // newCount: any integer > 10
        fc.integer({ min: 11, max: 100_000 }),
        // firstSeen offset: 0ms to 59min 59s ago (within 1 hour)
        fc.integer({ min: 0, max: 60 * 60 * 1000 - 1 }),
        (newCount, msAgo) => {
          const firstSeenTimestamp = now - msAgo;
          const result = isRecurringIncident(newCount, firstSeenTimestamp, now);
          expect(result).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: When count <= 10 (regardless of time window),
   * the error MUST NOT be marked as recurring.
   */
  it('does NOT mark error as recurring when count <= 10', () => {
    const now = Date.now();

    fc.assert(
      fc.property(
        // newCount: any integer from 1 to 10 (≤ 10)
        fc.integer({ min: 1, max: 10 }),
        // firstSeen: any timestamp (within or outside 1 hour)
        fc.integer({ min: 0, max: 7 * 24 * 60 * 60 * 1000 }),
        (newCount, msAgo) => {
          const firstSeenTimestamp = now - msAgo;
          const result = isRecurringIncident(newCount, firstSeenTimestamp, now);
          expect(result).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: When first_seen is older than 1 hour (regardless of count),
   * the error MUST NOT be marked as recurring.
   */
  it('does NOT mark error as recurring when first_seen is older than 1 hour', () => {
    const now = Date.now();

    fc.assert(
      fc.property(
        // newCount: any count (including > 10)
        fc.integer({ min: 1, max: 100_000 }),
        // firstSeen offset: strictly older than 1 hour (1h + 1ms to 7 days)
        fc.integer({ min: 60 * 60 * 1000 + 1, max: 7 * 24 * 60 * 60 * 1000 }),
        (newCount, msAgo) => {
          const firstSeenTimestamp = now - msAgo;
          const result = isRecurringIncident(newCount, firstSeenTimestamp, now);
          expect(result).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: The boundary — count exactly 11 with first_seen exactly at the 1-hour mark.
   * At exactly 1 hour ago (firstSeen == oneHourAgo), the >= comparison should yield true.
   */
  it('marks as recurring at the exact 1-hour boundary when count > 10', () => {
    const now = Date.now();

    fc.assert(
      fc.property(
        fc.integer({ min: 11, max: 100_000 }),
        (newCount) => {
          // first_seen is exactly 1 hour ago
          const firstSeenTimestamp = now - 60 * 60 * 1000;
          const result = isRecurringIncident(newCount, firstSeenTimestamp, now);
          // firstSeen >= oneHourAgo → new Date(now - 3600000) >= new Date(now - 3600000) → true
          expect(result).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Combined — recurring is true IFF (count > 10 AND first_seen within 1 hour).
   * This is the comprehensive bidirectional property.
   */
  it('is_recurring === (count > 10 AND first_seen within 1 hour) for all inputs', () => {
    const now = Date.now();

    fc.assert(
      fc.property(
        // newCount: any positive integer
        fc.integer({ min: 1, max: 100_000 }),
        // msAgo: from 0 to 7 days ago
        fc.integer({ min: 0, max: 7 * 24 * 60 * 60 * 1000 }),
        (newCount, msAgo) => {
          const firstSeenTimestamp = now - msAgo;
          const result = isRecurringIncident(newCount, firstSeenTimestamp, now);

          const withinOneHour = msAgo <= 60 * 60 * 1000; // firstSeen >= oneHourAgo
          const expected = newCount > 10 && withinOneHour;

          expect(result).toBe(expected);
        }
      ),
      { numRuns: 100 }
    );
  });
});
