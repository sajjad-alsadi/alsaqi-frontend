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
    fileSize: 1024,
  };

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

    // Default mock implementations
    mockGetActiveByType.mockResolvedValue(null); // No stored template (use fallback)
    mockGetPdfSettings.mockResolvedValue(defaultPdfSettings);
    mockRenderFromTemplate.mockResolvedValue(defaultPdfResult);
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
      expect(mockReportProgress).toHaveBeenCalledWith(20);
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

      expect(updateCalls.length).toBeGreaterThan(0);
      const lastUpdate = updateCalls[updateCalls.length - 1];
      expect(lastUpdate[0]).toContain('file_size');
      expect(lastUpdate[0]).toContain('content');
    });

    it('should upload metadata with reportId, auditId, templateTypeKey, and generatedAt', async () => {
      await generatePdfWorker(createJob(), context);

      expect(mockStorage.upload).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            reportId: 'report-456',
            auditId: 'audit-123',
            templateTypeKey: 'general',
            generatedAt: expect.any(String),
          }),
        }),
      );
    });
  });

  describe('template and settings fetching (Req 5.1, 5.2, 5.3)', () => {
    it('should call PdfTemplateService.getActiveByType with resolved templateTypeKey', async () => {
      await generatePdfWorker(createJob({ template: 'audit_report' }), context);

      expect(mockGetActiveByType).toHaveBeenCalledWith('audit_report');
    });

    it('should resolve legacy template names via resolveTemplateTypeKey', async () => {
      await generatePdfWorker(createJob({ template: 'auditReport' }), context);

      expect(mockGetActiveByType).toHaveBeenCalledWith('audit_report');
    });

    it('should fetch PDF settings via SettingsService', async () => {
      await generatePdfWorker(createJob(), context);

      expect(mockGetPdfSettings).toHaveBeenCalled();
    });

    it('should pass active template to PdfEngine.renderFromTemplate when found', async () => {
      const mockTemplate = {
        id: 'tpl-1',
        template_name: 'Audit Report',
        template_type_key: 'audit_report',
        content: '<h1>{{auditTitle}}</h1>',
        status: 'Approved',
        is_default: true,
        version: 1,
        created_by: 'admin',
        updated_by: 'admin',
        created_at: '2024-01-01',
        updated_at: '2024-01-01',
      };
      mockGetActiveByType.mockResolvedValue(mockTemplate);

      await generatePdfWorker(createJob({ template: 'audit_report' }), context);

      expect(mockRenderFromTemplate).toHaveBeenCalledWith(
        expect.objectContaining({
          template: mockTemplate,
        }),
      );
    });

    it('should pass undefined template to PdfEngine when no active template exists', async () => {
      mockGetActiveByType.mockResolvedValue(null);

      await generatePdfWorker(createJob(), context);

      expect(mockRenderFromTemplate).toHaveBeenCalledWith(
        expect.objectContaining({
          template: undefined,
        }),
      );
    });

    it('should pass formatted audit data to PdfEngine', async () => {
      await generatePdfWorker(createJob(), context);

      expect(mockRenderFromTemplate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            auditTitle: 'Test Audit',
            auditorName: 'John Doe',
            departmentName: 'Finance',
            findings: expect.arrayContaining([
              expect.objectContaining({ title: 'Finding 1' }),
            ]),
          }),
        }),
      );
    });

    it('should pass PdfSettings (with boolean conversions) to PdfEngine', async () => {
      await generatePdfWorker(createJob(), context);

      expect(mockRenderFromTemplate).toHaveBeenCalledWith(
        expect.objectContaining({
          settings: expect.objectContaining({
            rtl_enabled: true,
            show_page_number: true,
            margin_top: 20,
          }),
        }),
      );
    });
  });

  describe('language handling', () => {
    it('should pass language "ar" when audit language is Arabic', async () => {
      const arabicAudit = { ...defaultAudit, language: 'ar' };
      mockDb.prepare = setupDbMocks(arabicAudit, defaultFindings, defaultRecommendations, defaultEvidence);

      await generatePdfWorker(createJob(), context);

      expect(mockRenderFromTemplate).toHaveBeenCalledWith(
        expect.objectContaining({
          language: 'ar',
        }),
      );
    });

    it('should pass language "en" when audit language is English', async () => {
      const englishAudit = { ...defaultAudit, language: 'en' };
      mockDb.prepare = setupDbMocks(englishAudit, defaultFindings, defaultRecommendations, defaultEvidence);

      await generatePdfWorker(createJob(), context);

      expect(mockRenderFromTemplate).toHaveBeenCalledWith(
        expect.objectContaining({
          language: 'en',
        }),
      );
    });

    it('should default to "ar" when no language specified', async () => {
      const noLangAudit = { ...defaultAudit, language: undefined };
      mockDb.prepare = setupDbMocks(noLangAudit, defaultFindings, defaultRecommendations, defaultEvidence);

      await generatePdfWorker(createJob(), context);

      expect(mockRenderFromTemplate).toHaveBeenCalledWith(
        expect.objectContaining({
          language: 'ar',
        }),
      );
    });
  });

  describe('audit not found (Requirement 5.5)', () => {
    it('should throw UnrecoverableError when audit ID not found', async () => {
      mockDb.prepare = setupDbMocks(null);

      await expect(generatePdfWorker(createJob(), context)).rejects.toThrow('Audit audit-123 not found');
    });

    it('should mark report status as failed when audit not found', async () => {
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

      expect(runMock).toHaveBeenCalledWith('failed', 'Audit audit-123 not found', 'report-456');
    });

    it('should NOT retry when audit is not found (UnrecoverableError)', async () => {
      mockDb.prepare = setupDbMocks(null);

      try {
        await generatePdfWorker(createJob(), context);
      } catch (error: any) {
        expect(error.name).toBe('UnrecoverableError');
      }
    });
  });

  describe('retry and failure handling (Requirement 5.6, 5.9, 8.3)', () => {
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

      mockStorage.upload.mockRejectedValue(new Error('Storage unavailable'));

      // attemptsMade = 2 means this is the 3rd attempt (0-indexed)
      const job = createJob(undefined, 2);

      await expect(generatePdfWorker(job, context)).rejects.toThrow('Storage unavailable');

      expect(runMock).toHaveBeenCalledWith('failed', 'Storage unavailable', 'report-456');
    });

    it('should NOT mark report as failed on intermediate retry attempts (Req 5.9)', async () => {
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

      // attemptsMade = 0 means first attempt — should retry, NOT mark failed
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

    it('should report progress in expected order: 10, 20, 30, 70, 90, 100', async () => {
      await generatePdfWorker(createJob(), context);

      const progressCalls = mockReportProgress.mock.calls.map((c: any[]) => c[0]);
      expect(progressCalls).toEqual([10, 20, 30, 70, 90, 100]);
    });
  });

  describe('storage key format (Requirement 5.4)', () => {
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

  describe('fetching audit data', () => {
    it('should fetch findings, recommendations, and evidence from PostgreSQL', async () => {
      await generatePdfWorker(createJob(), context);

      const prepareCalls = mockDb.prepare.mock.calls.map((c: any[]) => c[0]);

      expect(prepareCalls.some((sql: string) => sql.includes('audit_plans'))).toBe(true);
      expect(prepareCalls.some((sql: string) => sql.includes('audit_findings'))).toBe(true);
      expect(prepareCalls.some((sql: string) => sql.includes('recommendations'))).toBe(true);
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
