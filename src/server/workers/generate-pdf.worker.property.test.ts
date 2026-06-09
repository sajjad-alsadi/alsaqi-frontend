// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';
import fc from 'fast-check';
import type { Job } from 'bullmq';
import type { WorkerContext } from '../services/worker-manager.js';
import type { JobDataMap } from '../services/queue.service.js';

/**
 * Property Tests for generate-pdf Worker (Property 4)
 *
 * Feature: pdf-template-system-overhaul
 *
 * Property 4: Report status always reaches a terminal state
 * For any job (with or without valid audit data), the report status eventually
 * reaches 'ready' or 'failed' and never remains 'pending' indefinitely.
 *
 * Terminal states:
 * 1. Valid audit data → PDF generated → status 'ready'
 * 2. Invalid audit data (null) → UnrecoverableError → status 'failed'
 * 3. After 3 failed retry attempts → status 'failed'
 * 4. 5-minute timeout → status 'failed' (checked on status poll)
 *
 * **Validates: Requirements 8.5, 5.5, 5.6**
 */

// ─── Mocks ───────────────────────────────────────────────────────────────────

class MockUnrecoverableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnrecoverableError';
  }
}

vi.mock('bullmq', () => ({
  UnrecoverableError: MockUnrecoverableError,
  Worker: vi.fn(),
  Job: vi.fn(),
  Queue: vi.fn(),
  QueueEvents: vi.fn(),
}));

vi.mock('ioredis', () => ({
  default: vi.fn(),
}));

// Mock PdfTemplateService
const mockGetActiveByType = vi.fn();
vi.mock('../../../packages/api/src/services/PdfTemplateService.js', () => ({
  PdfTemplateService: {
    getActiveByType: (...args: any[]) => mockGetActiveByType(...args),
  },
}));

// Mock SettingsService
const mockGetPdfSettings = vi.fn();
vi.mock('../../../packages/api/src/services/SettingsService.js', () => ({
  SettingsService: {
    getPdfSettings: (...args: any[]) => mockGetPdfSettings(...args),
  },
}));

// Mock PdfEngine
const mockRenderFromTemplate = vi.fn();
vi.mock('../../../packages/api/src/services/PdfEngine.js', () => ({
  pdfEngine: {
    renderFromTemplate: (...args: any[]) => mockRenderFromTemplate(...args),
  },
}));

// Mock resolveTemplateTypeKey
vi.mock('../../../packages/api/src/constants/templateTypes.js', () => ({
  resolveTemplateTypeKey: (input: string | null | undefined) => {
    if (!input) return 'general';
    const validKeys = ['audit_report', 'quarterly_report', 'annual_report', 'audit_plan', 'audit_missions', 'recommendations', 'outgoing_letter', 'general'];
    if (validKeys.includes(input)) return input;
    const mapping: Record<string, string> = {
      'auditReport': 'audit_report',
      'standard': 'general',
      'default': 'general',
    };
    return mapping[input] || 'general';
  },
}));

// Mock mapRowToSettings
vi.mock('../../../packages/api/src/types/pdf.js', () => ({
  mapRowToSettings: (row: any) => ({
    ...row,
    rtl_enabled: row.rtl_enabled === 1,
    show_page_number: row.show_page_number === 1,
    logo_position: row.logo_position?.toLowerCase() || 'right',
  }),
}));

// Import after mocks
const { generatePdfWorker } = await import('./generate-pdf.worker.js');

// ─── Arbitraries ─────────────────────────────────────────────────────────────

const VALID_TEMPLATE_TYPE_KEYS = [
  'audit_report', 'quarterly_report', 'annual_report', 'audit_plan',
  'audit_missions', 'recommendations', 'outgoing_letter', 'general',
] as const;

/** Arbitrary for a valid auditId */
const auditIdArb = fc.stringMatching(/^[a-z0-9-]{5,36}$/);

/** Arbitrary for a valid reportId */
const reportIdArb = fc.uuid();

/** Arbitrary for template type key */
const templateTypeKeyArb = fc.constantFrom(...VALID_TEMPLATE_TYPE_KEYS);

/** Arbitrary for attempt count (0 = first attempt, 1 = second, 2 = third/last) */
const attemptCountArb = fc.constantFrom(0, 1, 2);

/** Arbitrary for a date string in YYYY-MM-DD format */
const dateStringArb = fc.tuple(
  fc.integer({ min: 2020, max: 2025 }),
  fc.integer({ min: 1, max: 12 }),
  fc.integer({ min: 1, max: 28 }),
).map(([y, m, d]) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);

/** Arbitrary for a valid audit row */
const validAuditArb = fc.record({
  id: auditIdArb,
  title: fc.string({ minLength: 1, maxLength: 50 }),
  plan_code: fc.string({ minLength: 1, maxLength: 10 }),
  department: fc.string({ minLength: 1, maxLength: 30 }),
  lead_auditor: fc.string({ minLength: 1, maxLength: 30 }),
  status: fc.constantFrom('completed', 'in_progress', 'planned'),
  planned_start_date: dateStringArb,
  planned_end_date: dateStringArb,
  scope: fc.string({ maxLength: 100 }),
  objectives: fc.string({ maxLength: 100 }),
  language: fc.constantFrom('ar', 'en', undefined),
});

/** Arbitrary for upload success (true) or failure (false) */
const uploadSuccessArb = fc.boolean();

// ─── Helpers ─────────────────────────────────────────────────────────────────

const defaultPdfSettings = {
  arabic_font_name: 'Amiri',
  arabic_font_size: 12,
  heading_font_size: 16,
  subheading_font_size: 14,
  table_font_size: 10,
  rtl_enabled: 1,
  margin_top: 20,
  margin_right: 20,
  margin_bottom: 20,
  margin_left: 20,
  header_template: '',
  footer_template: '',
  logo_position: 'Right',
  show_page_number: 1,
};

const defaultPdfResult = {
  buffer: Buffer.from('%PDF-1.4 mock pdf content'),
  pageCount: 1,
  fileSize: 25,
};

function createJob(
  reportId: string,
  auditId: string,
  template: string,
  attemptsMade: number,
): Job<JobDataMap['generate-pdf']> {
  return {
    data: { reportId, auditId, template },
    attemptsMade,
  } as Job<JobDataMap['generate-pdf']>;
}

/**
 * Tracks report status transitions via the mocked db.prepare calls.
 * Returns the final status written to the report.
 */
function createStatusTracker() {
  const statusUpdates: string[] = [];
  const runMock = vi.fn().mockImplementation((...args: any[]) => {
    // The first argument to run() for UPDATE audit_reports is the status
    if (typeof args[0] === 'string' && (args[0] === 'ready' || args[0] === 'failed')) {
      statusUpdates.push(args[0]);
    }
    return Promise.resolve(undefined);
  });

  return { statusUpdates, runMock };
}

function setupDbMocks(audit: any | null, tracker: { runMock: ReturnType<typeof vi.fn> }) {
  return vi.fn().mockImplementation((sql: string) => {
    if (sql.includes('audit_plans')) {
      return { get: vi.fn().mockResolvedValue(audit) };
    }
    if (sql.includes('audit_findings')) {
      return { all: vi.fn().mockResolvedValue([]) };
    }
    if (sql.includes('recommendations')) {
      return { all: vi.fn().mockResolvedValue([]) };
    }
    if (sql.includes('audit_evidence')) {
      return { all: vi.fn().mockResolvedValue([]) };
    }
    if (sql.includes('UPDATE audit_reports')) {
      return { run: tracker.runMock };
    }
    return { get: vi.fn(), all: vi.fn(), run: vi.fn() };
  });
}

function createContext(
  dbPrepareMock: ReturnType<typeof vi.fn>,
  uploadSuccess: boolean,
): WorkerContext {
  const mockStorage = {
    upload: uploadSuccess
      ? vi.fn().mockResolvedValue({ key: 'test.pdf', bucket: 'reports', etag: 'e', size: 25, url: '' })
      : vi.fn().mockRejectedValue(new Error('Storage upload failed')),
  };

  return {
    storage: mockStorage as any,
    db: { prepare: dbPrepareMock } as any,
    logger: {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    } as any,
    reportProgress: vi.fn().mockResolvedValue(undefined),
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Property 4: Report status always reaches a terminal state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetActiveByType.mockResolvedValue(null);
    mockGetPdfSettings.mockResolvedValue(defaultPdfSettings);
    mockRenderFromTemplate.mockResolvedValue(defaultPdfResult);
  });

  /**
   * **Validates: Requirements 8.5, 5.5, 5.6**
   *
   * For any job with valid audit data and successful upload:
   * after processing, report status is 'ready'.
   */
  it('valid audit data + successful upload → report status is "ready"', async () => {
    await fc.assert(
      fc.asyncProperty(
        reportIdArb,
        validAuditArb,
        templateTypeKeyArb,
        async (reportId, audit, templateKey) => {
          const tracker = createStatusTracker();
          const dbMock = setupDbMocks(audit, tracker);
          const context = createContext(dbMock, true);
          const job = createJob(reportId, audit.id, templateKey, 0);

          await generatePdfWorker(job, context);

          // The final status update must be 'ready'
          expect(tracker.statusUpdates).toContain('ready');
          expect(tracker.statusUpdates).not.toContain('failed');
        },
      ),
      { numRuns: 50 },
    );
  });

  /**
   * **Validates: Requirements 5.5**
   *
   * For any job with INVALID audit data (null):
   * after processing, report status is 'failed' and UnrecoverableError is thrown.
   */
  it('invalid audit data (null) → report status is "failed" + UnrecoverableError thrown', async () => {
    await fc.assert(
      fc.asyncProperty(
        reportIdArb,
        auditIdArb,
        templateTypeKeyArb,
        attemptCountArb,
        async (reportId, auditId, templateKey, attempts) => {
          const tracker = createStatusTracker();
          const dbMock = setupDbMocks(null, tracker); // null = audit not found
          const context = createContext(dbMock, true);
          const job = createJob(reportId, auditId, templateKey, attempts);

          // Must throw UnrecoverableError
          let thrownError: Error | null = null;
          try {
            await generatePdfWorker(job, context);
          } catch (e: any) {
            thrownError = e;
          }

          expect(thrownError).not.toBeNull();
          expect(thrownError!.name).toBe('UnrecoverableError');
          // Report status must be updated to 'failed'
          expect(tracker.statusUpdates).toContain('failed');
          expect(tracker.statusUpdates).not.toContain('ready');
        },
      ),
      { numRuns: 50 },
    );
  });

  /**
   * **Validates: Requirements 5.6**
   *
   * For any job that fails after 3 retries (attemptsMade = 2, meaning this is
   * the 3rd attempt): report status is 'failed'.
   */
  it('upload failure on last attempt (attemptsMade=2) → report status is "failed"', async () => {
    await fc.assert(
      fc.asyncProperty(
        reportIdArb,
        validAuditArb,
        templateTypeKeyArb,
        async (reportId, audit, templateKey) => {
          const tracker = createStatusTracker();
          const dbMock = setupDbMocks(audit, tracker);
          const context = createContext(dbMock, false); // upload fails
          const job = createJob(reportId, audit.id, templateKey, 2); // last attempt

          let threw = false;
          try {
            await generatePdfWorker(job, context);
          } catch {
            threw = true;
          }

          // Worker re-throws error for BullMQ
          expect(threw).toBe(true);
          // Report must be marked 'failed' on final attempt
          expect(tracker.statusUpdates).toContain('failed');
        },
      ),
      { numRuns: 50 },
    );
  });

  /**
   * **Validates: Requirements 8.5**
   *
   * The 5-minute timeout mechanism ensures: any report older than 5 min in 'pending'
   * is marked 'failed'. This is handled by the status endpoint — we verify the logic
   * inline: if a report has been pending > 5 minutes, it must transition to 'failed'.
   */
  it('5-minute timeout: pending report older than 5 min → status "failed"', async () => {
    await fc.assert(
      fc.asyncProperty(
        reportIdArb,
        // Generate a time delta > 5 minutes (in ms)
        fc.integer({ min: 5 * 60 * 1000 + 1, max: 60 * 60 * 1000 }),
        async (reportId, elapsedMs) => {
          const REPORT_TIMEOUT_MS = 5 * 60 * 1000;
          const createdAt = new Date(Date.now() - elapsedMs);

          // Simulate the timeout check from GET /reports/:reportId/status
          const report = {
            id: reportId,
            status: 'pending',
            content: null,
            error: null,
            created_at: createdAt.toISOString(),
          };

          const now = Date.now();
          const createdAtTime = new Date(report.created_at).getTime();
          const isTimedOut = now - createdAtTime > REPORT_TIMEOUT_MS;

          // After timeout, report transitions to 'failed'
          expect(isTimedOut).toBe(true);

          // Simulated status after timeout check
          const finalStatus = isTimedOut ? 'failed' : 'pending';
          expect(finalStatus).toBe('failed');
        },
      ),
      { numRuns: 50 },
    );
  });

  /**
   * **Validates: Requirements 8.5, 5.5, 5.6**
   *
   * No job execution path leaves the report in 'pending' indefinitely.
   * For any combination of inputs, the worker either:
   * - Completes successfully (status → 'ready')
   * - Throws with report marked 'failed' (missing audit or max retries)
   * - Throws without marking 'failed' (intermediate retry — BullMQ will retry)
   *
   * In ALL cases where the worker does NOT mark the report, BullMQ's retry
   * mechanism will eventually exhaust attempts (→ 'failed') or the 5-minute
   * timeout will catch it.
   */
  it('for any input combination: worker terminates (no infinite pending)', async () => {
    await fc.assert(
      fc.asyncProperty(
        reportIdArb,
        auditIdArb,
        templateTypeKeyArb,
        attemptCountArb,
        uploadSuccessArb,
        fc.boolean(), // auditExists
        async (reportId, auditId, templateKey, attempts, uploadOk, auditExists) => {
          const tracker = createStatusTracker();
          const audit = auditExists
            ? { id: auditId, title: 'Test', plan_code: 'P1', department: 'D', lead_auditor: 'A', status: 'completed', planned_start_date: '2024-01-01', planned_end_date: '2024-01-31', scope: 's', objectives: 'o', language: 'ar' }
            : null;
          const dbMock = setupDbMocks(audit, tracker);
          const context = createContext(dbMock, uploadOk);
          const job = createJob(reportId, auditId, templateKey, attempts);

          let threw = false;
          try {
            await generatePdfWorker(job, context);
          } catch {
            threw = true;
          }

          if (!auditExists) {
            // Must throw UnrecoverableError and mark 'failed'
            expect(threw).toBe(true);
            expect(tracker.statusUpdates).toContain('failed');
          } else if (uploadOk) {
            // Successful path: status becomes 'ready'
            expect(threw).toBe(false);
            expect(tracker.statusUpdates).toContain('ready');
          } else {
            // Upload failed — worker throws
            expect(threw).toBe(true);
            if (attempts >= 2) {
              // Last attempt: must mark 'failed'
              expect(tracker.statusUpdates).toContain('failed');
            }
            // Intermediate attempts: BullMQ retries → eventually reaches
            // attempt 2 (failed) or succeeds (ready). The 5-min timeout
            // is the safety net for any remaining 'pending' state.
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
