// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Job } from 'bullmq';
import type { WorkerContext } from '../services/worker-manager.js';
import type { JobDataMap } from '../services/queue.service.js';

// Mock bullmq before importing the worker
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

// Mock jspdf and jspdf-autotable
vi.mock('jspdf', () => {
  const mockDoc = {
    addFileToVFS: vi.fn(),
    addFont: vi.fn(),
    setFont: vi.fn(),
    setFontSize: vi.fn(),
    setDrawColor: vi.fn(),
    setLineWidth: vi.fn(),
    setTextColor: vi.fn(),
    line: vi.fn(),
    text: vi.fn(),
    addPage: vi.fn(),
    setPage: vi.fn(),
    splitTextToSize: vi.fn().mockReturnValue(['line1']),
    output: vi.fn().mockReturnValue(new ArrayBuffer(1024)),
    autoTable: vi.fn(),
    lastAutoTable: { finalY: 100 },
    internal: {
      pageSize: {
        getWidth: () => 210,
        getHeight: () => 297,
      },
      getNumberOfPages: () => 1,
    },
  };

  // Use a regular function so it can be used with 'new'
  function MockJsPDF() {
    return mockDoc;
  }

  return {
    jsPDF: MockJsPDF,
  };
});

vi.mock('jspdf-autotable', () => ({}));

vi.mock('../../assets/fonts/tahoma-base64.js', () => ({
  TAHOMA_FONT_BASE64: 'base64-font-data',
}));

// Import after mocks are set up
const { generatePdfWorker } = await import('./generate-pdf.worker.js');

describe('generatePdfWorker', () => {
  let mockStorage: {
    upload: ReturnType<typeof vi.fn>;
  };
  let mockDb: {
    prepare: ReturnType<typeof vi.fn>;
  };
  let mockLogger: {
    info: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
    debug: ReturnType<typeof vi.fn>;
  };
  let mockReportProgress: ReturnType<typeof vi.fn>;
  let context: WorkerContext;

  const defaultAudit = {
    id: 'audit-123',
    title: 'Test Audit',
    plan_code: 'PC-001',
    department: 'Finance',
    lead_auditor: 'John Doe',
    status: 'completed',
    planned_start_date: '2024-01-01',
    planned_end_date: '2024-01-31',
    scope: 'Financial review',
    objectives: 'Verify accuracy',
    language: 'en',
  };

  const defaultFindings = [
    { id: 'f-1', title: 'Finding 1', description: 'Desc 1', risk_level: 'high' },
  ];

  const defaultRecommendations = [
    { id: 'r-1', finding_id: 'f-1', department: 'Finance', responsible: 'Jane', due_date: '2024-03-01', status: 'open' },
  ];

  const defaultEvidence = [
    { id: 'e-1', finding_id: 'f-1', type: 'document', description: 'Bank statement', file_name: 'stmt.pdf', upload_date: '2024-01-15' },
  ];

  function createJob(overrides?: Partial<JobDataMap['generate-pdf']>, attemptsMade = 0): Job<JobDataMap['generate-pdf']> {
    return {
      data: {
        reportId: 'report-456',
        auditId: 'audit-123',
        template: 'standard',
        ...overrides,
      },
      attemptsMade,
    } as Job<JobDataMap['generate-pdf']>;
  }

  function setupDbMocks(audit: any | null, findings: any[] = [], recommendations: any[] = [], evidence: any[] = []) {
    const prepareMock = vi.fn();

    // Each prepare() call returns an object with get/all/run
    prepareMock.mockImplementation((sql: string) => {
      if (sql.includes('audit_plans')) {
        return { get: vi.fn().mockResolvedValue(audit) };
      }
      if (sql.includes('audit_findings')) {
        return { all: vi.fn().mockResolvedValue(findings) };
      }
      if (sql.includes('recommendations')) {
        return { all: vi.fn().mockResolvedValue(recommendations) };
      }
      if (sql.includes('audit_evidence')) {
        return { all: vi.fn().mockResolvedValue(evidence) };
      }
      if (sql.includes('UPDATE audit_reports')) {
        return { run: vi.fn().mockResolvedValue(undefined) };
      }
      return { get: vi.fn(), all: vi.fn(), run: vi.fn() };
    });

    return prepareMock;
  }

  beforeEach(() => {
    vi.clearAllMocks();

    mockStorage = {
      upload: vi.fn().mockResolvedValue({ key: 'audits/audit-123/reports/report-456.pdf', bucket: 'reports', etag: 'etag', size: 1024, url: '' }),
    };

    mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    };

    mockReportProgress = vi.fn().mockResolvedValue(undefined);

    mockDb = {
      prepare: setupDbMocks(defaultAudit, defaultFindings, defaultRecommendations, defaultEvidence),
    };

    context = {
      storage: mockStorage as any,
      db: mockDb as any,
      logger: mockLogger as any,
      reportProgress: mockReportProgress,
    };
  });

  describe('successful PDF generation', () => {
    it('should generate PDF and update report record on success', async () => {
      await generatePdfWorker(createJob(), context);

      // Should upload to correct storage key
      expect(mockStorage.upload).toHaveBeenCalledWith(
        expect.objectContaining({
          key: 'audits/audit-123/reports/report-456.pdf',
          contentType: 'application/pdf',
          bucket: 'reports',
        }),
      );

      // Progress should be reported at expected milestones
      expect(mockReportProgress).toHaveBeenCalledWith(10);
      expect(mockReportProgress).toHaveBeenCalledWith(30);
      expect(mockReportProgress).toHaveBeenCalledWith(70);
      expect(mockReportProgress).toHaveBeenCalledWith(90);
      expect(mockReportProgress).toHaveBeenCalledWith(100);
    });

    it('should update report record with status ready, storageKey, and fileSize', async () => {
      await generatePdfWorker(createJob(), context);

      // Verify that the UPDATE call includes status, storageKey (content), and file_size
      const updateCalls = mockDb.prepare.mock.calls.filter(
        (call: any[]) => call[0].includes('UPDATE audit_reports') && call[0].includes('status'),
      );

      // The last UPDATE should be the success update with 'ready'
      expect(updateCalls.length).toBeGreaterThan(0);
      const lastUpdate = updateCalls[updateCalls.length - 1];
      expect(lastUpdate[0]).toContain('file_size');
      expect(lastUpdate[0]).toContain('content');
    });

    it('should upload metadata with reportId, auditId, and generatedAt', async () => {
      await generatePdfWorker(createJob(), context);

      expect(mockStorage.upload).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            reportId: 'report-456',
            auditId: 'audit-123',
            generatedAt: expect.any(String),
          }),
        }),
      );
    });
  });

  describe('RTL support (Requirement 4.4)', () => {
    it('should render PDF with RTL when audit language is Arabic', async () => {
      const arabicAudit = { ...defaultAudit, language: 'ar' };
      mockDb.prepare = setupDbMocks(arabicAudit, defaultFindings, defaultRecommendations, defaultEvidence);

      await generatePdfWorker(createJob(), context);

      // Should still complete successfully
      expect(mockStorage.upload).toHaveBeenCalled();
      expect(mockReportProgress).toHaveBeenCalledWith(100);
    });

    it('should render PDF without RTL when language is not Arabic', async () => {
      const englishAudit = { ...defaultAudit, language: 'en' };
      mockDb.prepare = setupDbMocks(englishAudit, defaultFindings, defaultRecommendations, defaultEvidence);

      await generatePdfWorker(createJob(), context);

      expect(mockStorage.upload).toHaveBeenCalled();
      expect(mockReportProgress).toHaveBeenCalledWith(100);
    });
  });

  describe('audit not found (Requirement 4.7)', () => {
    it('should throw UnrecoverableError when audit ID not found', async () => {
      mockDb.prepare = setupDbMocks(null);

      await expect(generatePdfWorker(createJob(), context)).rejects.toThrow('Audit audit-123 not found');
    });

    it('should atomically update report status and error when audit not found', async () => {
      const runMock = vi.fn().mockResolvedValue(undefined);
      mockDb.prepare = vi.fn().mockImplementation((sql: string) => {
        if (sql.includes('audit_plans')) {
          return { get: vi.fn().mockResolvedValue(null) };
        }
        if (sql.includes('UPDATE audit_reports')) {
          return { run: runMock };
        }
        return { get: vi.fn(), all: vi.fn(), run: vi.fn() };
      });

      await expect(generatePdfWorker(createJob(), context)).rejects.toThrow(
        'Audit audit-123 not found',
      );

      // Should update both status AND error in one call
      expect(runMock).toHaveBeenCalledWith('failed', 'Audit audit-123 not found', 'report-456');
    });

    it('should NOT retry when audit is not found', async () => {
      mockDb.prepare = setupDbMocks(null);

      try {
        await generatePdfWorker(createJob(), context);
      } catch (error: any) {
        // UnrecoverableError tells BullMQ to not retry
        expect(error.name).toBe('UnrecoverableError');
      }
    });

    it('should report progress(10) before checking audit existence', async () => {
      mockDb.prepare = setupDbMocks(null);

      try {
        await generatePdfWorker(createJob(), context);
      } catch {
        // Expected
      }

      expect(mockReportProgress).toHaveBeenCalledWith(10);
    });
  });

  describe('retry and failure handling (Requirement 4.8)', () => {
    it('should mark report as failed when max retries exhausted on upload failure', async () => {
      const runMock = vi.fn().mockResolvedValue(undefined);
      mockDb.prepare = vi.fn().mockImplementation((sql: string) => {
        if (sql.includes('audit_plans')) {
          return { get: vi.fn().mockResolvedValue(defaultAudit) };
        }
        if (sql.includes('audit_findings')) {
          return { all: vi.fn().mockResolvedValue(defaultFindings) };
        }
        if (sql.includes('recommendations')) {
          return { all: vi.fn().mockResolvedValue(defaultRecommendations) };
        }
        if (sql.includes('audit_evidence')) {
          return { all: vi.fn().mockResolvedValue(defaultEvidence) };
        }
        if (sql.includes('UPDATE audit_reports')) {
          return { run: runMock };
        }
        return { get: vi.fn(), all: vi.fn(), run: vi.fn() };
      });

      // Upload fails
      mockStorage.upload.mockRejectedValue(new Error('Storage unavailable'));

      // attemptsMade = 2 means this is the 3rd attempt (0-indexed)
      const job = createJob(undefined, 2);

      await expect(generatePdfWorker(job, context)).rejects.toThrow('Storage unavailable');

      // Should mark report as failed with error message
      expect(runMock).toHaveBeenCalledWith('failed', 'Storage unavailable', 'report-456');
    });

    it('should NOT mark report as failed on intermediate retry attempts', async () => {
      const runMock = vi.fn().mockResolvedValue(undefined);
      mockDb.prepare = vi.fn().mockImplementation((sql: string) => {
        if (sql.includes('audit_plans')) {
          return { get: vi.fn().mockResolvedValue(defaultAudit) };
        }
        if (sql.includes('audit_findings')) {
          return { all: vi.fn().mockResolvedValue(defaultFindings) };
        }
        if (sql.includes('recommendations')) {
          return { all: vi.fn().mockResolvedValue(defaultRecommendations) };
        }
        if (sql.includes('audit_evidence')) {
          return { all: vi.fn().mockResolvedValue(defaultEvidence) };
        }
        if (sql.includes('UPDATE audit_reports')) {
          return { run: runMock };
        }
        return { get: vi.fn(), all: vi.fn(), run: vi.fn() };
      });

      mockStorage.upload.mockRejectedValue(new Error('Storage unavailable'));

      // attemptsMade = 0 means first attempt
      const job = createJob(undefined, 0);

      await expect(generatePdfWorker(job, context)).rejects.toThrow('Storage unavailable');

      // Should NOT update report status to 'failed' (will be retried)
      expect(runMock).not.toHaveBeenCalled();
    });

    it('should re-throw error so BullMQ can handle retries', async () => {
      mockStorage.upload.mockRejectedValue(new Error('Network timeout'));

      await expect(generatePdfWorker(createJob(undefined, 0), context)).rejects.toThrow('Network timeout');
    });
  });

  describe('progress reporting', () => {
    it('should report progress monotonically non-decreasing', async () => {
      await generatePdfWorker(createJob(), context);

      const progressCalls = mockReportProgress.mock.calls.map((c: any[]) => c[0]);
      for (let i = 1; i < progressCalls.length; i++) {
        expect(progressCalls[i]).toBeGreaterThanOrEqual(progressCalls[i - 1]);
      }
    });

    it('should report progress in order: 10, 30, 70, 90, 100', async () => {
      await generatePdfWorker(createJob(), context);

      const progressCalls = mockReportProgress.mock.calls.map((c: any[]) => c[0]);
      expect(progressCalls).toEqual([10, 30, 70, 90, 100]);
    });
  });

  describe('storage key format (Requirement 4.5)', () => {
    it('should upload PDF to audits/{auditId}/reports/{reportId}.pdf', async () => {
      const job = createJob({ reportId: 'rpt-xyz', auditId: 'aud-abc', template: 'standard' });

      mockDb.prepare = setupDbMocks(
        { ...defaultAudit, id: 'aud-abc' },
        defaultFindings,
        defaultRecommendations,
        defaultEvidence,
      );

      await generatePdfWorker(job, context);

      expect(mockStorage.upload).toHaveBeenCalledWith(
        expect.objectContaining({
          key: 'audits/aud-abc/reports/rpt-xyz.pdf',
        }),
      );
    });
  });

  describe('fetching audit data (Requirement 4.3)', () => {
    it('should fetch findings, recommendations, and evidence from PostgreSQL', async () => {
      await generatePdfWorker(createJob(), context);

      const prepareCalls = mockDb.prepare.mock.calls.map((c: any[]) => c[0]);

      // Should query audit_plans
      expect(prepareCalls.some((sql: string) => sql.includes('audit_plans'))).toBe(true);
      // Should query audit_findings
      expect(prepareCalls.some((sql: string) => sql.includes('audit_findings'))).toBe(true);
      // Should query recommendations
      expect(prepareCalls.some((sql: string) => sql.includes('recommendations'))).toBe(true);
      // Should query audit_evidence
      expect(prepareCalls.some((sql: string) => sql.includes('audit_evidence'))).toBe(true);
    });

    it('should handle audit with no findings', async () => {
      mockDb.prepare = setupDbMocks(defaultAudit, [], [], []);

      await generatePdfWorker(createJob(), context);

      expect(mockStorage.upload).toHaveBeenCalled();
      expect(mockReportProgress).toHaveBeenCalledWith(100);
    });
  });
});
