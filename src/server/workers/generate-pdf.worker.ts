/**
 * Generate PDF Worker
 *
 * Background worker that generates PDF audit reports using stored templates,
 * the unified PdfEngine (Puppeteer), and MinIO storage.
 *
 * Pipeline:
 * 1. Fetch audit data from DB (findings, recommendations, evidence)
 * 2. Fetch active template via PdfTemplateService.getActiveByType
 * 3. Fetch PDF settings via SettingsService
 * 4. Render PDF via PdfEngine.renderFromTemplate (or renderFallback if no template)
 * 5. Upload to MinIO under audits/{auditId}/reports/{reportId}.pdf
 * 6. Update report record to status='ready' with storage_key and file_size
 *
 * Error handling:
 * - Missing audit data: mark report 'failed', throw UnrecoverableError (no retries)
 * - Template compilation errors: PdfEngine falls back to built-in template + logs warning
 * - Storage upload failure: let BullMQ retry without updating status to 'ready'
 * - After 3 failed attempts: update report status to 'failed' with error message
 *
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.8, 5.9, 8.2, 8.3
 */

import { UnrecoverableError } from 'bullmq';
import { type JobProcessor } from '../services/worker-manager.js';
import { PdfTemplateService } from '../../../packages/api/src/services/PdfTemplateService.js';
import { SettingsService } from '../../../packages/api/src/services/SettingsService.js';
import { pdfEngine } from '../../../packages/api/src/services/PdfEngine.js';
import { resolveTemplateTypeKey } from '../../../packages/api/src/constants/templateTypes.js';
import { mapRowToSettings } from '../../../packages/api/src/types/pdf.js';
import type { PdfSettings } from '../../../packages/api/src/types/pdf.js';
import type { TemplateTypeKey } from '../../../packages/api/src/constants/templateTypes.js';

// ─── Types ───────────────────────────────────────────────────────────────────

interface AuditData {
  id: string;
  title: string;
  plan_code?: string;
  department?: string;
  lead_auditor?: string;
  status?: string;
  planned_start_date?: string;
  planned_end_date?: string;
  scope?: string;
  objectives?: string;
  language?: string;
  findings: AuditFinding[];
  recommendations: AuditRecommendation[];
  evidence: AuditEvidence[];
}

interface AuditFinding {
  id: string;
  title: string;
  description?: string;
  risk_level?: string;
  status?: string;
  criteria?: string;
  condition?: string;
  cause?: string;
  consequence?: string;
}

interface AuditRecommendation {
  id: string;
  finding_id?: string;
  department?: string;
  responsible?: string;
  due_date?: string;
  status?: string;
  risk_level?: string;
  action_plan?: string;
}

interface AuditEvidence {
  id: string;
  finding_id?: string;
  type?: string;
  description?: string;
  file_name?: string;
  upload_date?: string;
}

// ─── Worker Implementation ───────────────────────────────────────────────────

/**
 * generate-pdf worker processor.
 *
 * Steps:
 * 1. Resolve templateTypeKey from job data
 * 2. Fetch audit data from DB — if missing, mark failed + throw UnrecoverableError
 * 3. Fetch active template via PdfTemplateService.getActiveByType
 * 4. Fetch PDF settings via SettingsService
 * 5. Render PDF via PdfEngine (uses template or falls back automatically)
 * 6. Upload PDF to MinIO storage
 * 7. Update report record (status 'ready', storageKey, fileSize)
 */
const generatePdfWorker: JobProcessor<'generate-pdf'> = async (job, context) => {
  const { reportId, auditId, template } = job.data;
  const { storage, db, logger, reportProgress } = context;

  const dbClient = db as any;

  // Resolve templateTypeKey from job data (supports legacy camelCase and Arabic labels)
  const templateTypeKey: TemplateTypeKey = resolveTemplateTypeKey(template);

  // Step 1: Fetch full audit data
  logger.info('[generate-pdf] Fetching audit data', { auditId, reportId, templateTypeKey });

  const auditData = await fetchAuditData(dbClient, auditId);
  await reportProgress(10);

  // Step 2: If audit not found, mark report 'failed' + throw UnrecoverableError (Req 5.5)
  if (!auditData) {
    const errorMsg = `Audit ${auditId} not found`;
    logger.error('[generate-pdf] Audit not found', { auditId, reportId });

    try {
      await dbClient.prepare(
        `UPDATE audit_reports SET status = ?, error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
      ).run('failed', errorMsg, reportId);
    } catch (dbErr: unknown) {
      logger.error('[generate-pdf] Failed to update report status to failed', {
        reportId,
        error: dbErr instanceof Error ? dbErr.message : String(dbErr),
      });
    }

    throw new UnrecoverableError(errorMsg);
  }

  // Step 3: Fetch the active template by type key (Req 5.1)
  const activeTemplate = await PdfTemplateService.getActiveByType(templateTypeKey);
  await reportProgress(20);

  // Step 4: Fetch PDF settings (Req 5.1)
  const rawSettings = await SettingsService.getPdfSettings();
  const settings: PdfSettings = mapRowToSettings(rawSettings as any);
  await reportProgress(30);

  // Determine language from audit data
  const language: 'ar' | 'en' = (auditData.language === 'en') ? 'en' : 'ar';

  logger.info('[generate-pdf] Rendering PDF', {
    auditId,
    reportId,
    templateTypeKey,
    hasTemplate: !!activeTemplate,
    language,
    findingsCount: auditData.findings.length,
    recommendationsCount: auditData.recommendations.length,
    evidenceCount: auditData.evidence.length,
  });

  // Steps 5–7: PDF generation, upload, and DB update
  const maxAttempts = 3;

  try {
    // Step 5: Generate PDF via PdfEngine (Req 5.2, 5.3, 5.8)
    // If activeTemplate is found, use renderFromTemplate with it.
    // If no template, PdfEngine.renderFromTemplate handles fallback automatically (Req 4.5, 4.11)
    const templateData = formatAuditDataForTemplate(auditData);

    const result = await pdfEngine.renderFromTemplate({
      template: activeTemplate || undefined,
      data: templateData,
      settings,
      language,
    });
    await reportProgress(70);

    // Step 6: Upload PDF to MinIO storage (Req 5.4)
    const storageKey = `audits/${auditId}/reports/${reportId}.pdf`;
    logger.info('[generate-pdf] Uploading PDF to storage', { storageKey, size: result.fileSize });

    await storage.upload({
      key: storageKey,
      body: result.buffer,
      contentType: 'application/pdf',
      bucket: 'reports',
      metadata: {
        reportId,
        auditId,
        templateTypeKey,
        generatedAt: new Date().toISOString(),
      },
    });
    await reportProgress(90);

    // Step 7: Update report record — status 'ready', storageKey, fileSize (Req 5.4, 8.2)
    await dbClient.prepare(
      `UPDATE audit_reports 
       SET status = ?, content = ?, file_size = ?, updated_at = CURRENT_TIMESTAMP 
       WHERE id = ?`
    ).run('ready', storageKey, result.fileSize, reportId);

    await reportProgress(100);

    logger.info('[generate-pdf] PDF report generated successfully', {
      reportId,
      auditId,
      storageKey,
      fileSize: result.fileSize,
      templateTypeKey,
      usedTemplate: activeTemplate ? activeTemplate.id : 'fallback',
    });
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const attemptsMade = job.attemptsMade + 1; // Current attempt (0-indexed in BullMQ)

    logger.error('[generate-pdf] PDF generation/upload failed', {
      reportId,
      auditId,
      attemptsMade,
      maxAttempts,
      error: errorMsg,
    });

    // Req 5.6, 8.3: If this is the last attempt, mark report as 'failed'
    if (attemptsMade >= maxAttempts) {
      logger.error('[generate-pdf] Max retries exhausted, marking report as failed', {
        reportId,
        auditId,
        attemptsMade,
      });

      try {
        await dbClient.prepare(
          `UPDATE audit_reports SET status = ?, error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
        ).run('failed', errorMsg, reportId);
      } catch (dbErr: unknown) {
        logger.error('[generate-pdf] Failed to update report status after max retries', {
          reportId,
          error: dbErr instanceof Error ? dbErr.message : String(dbErr),
        });
      }
    }

    // Re-throw so BullMQ handles the retry logic (Req 5.9)
    // For storage upload failures, status is NOT updated to 'ready', allowing retry
    throw error;
  }
};

// ─── Helper Functions ────────────────────────────────────────────────────────

/**
 * Fetches full audit data including findings, recommendations, and evidence.
 * Returns null if the audit does not exist.
 */
async function fetchAuditData(db: any, auditId: string): Promise<AuditData | null> {
  const audit = await db.prepare(
    `SELECT * FROM audit_plans WHERE id = ?`
  ).get(auditId) as any;

  if (!audit) {
    return null;
  }

  // Fetch findings for this audit
  const findings = await db.prepare(
    `SELECT * FROM audit_findings WHERE audit_id = ? ORDER BY created_at ASC`
  ).all(auditId) as AuditFinding[];

  // Fetch recommendations for the findings
  const recommendations = findings.length > 0
    ? await db.prepare(
        `SELECT r.* FROM recommendations r 
         INNER JOIN audit_findings f ON r.finding_id = f.id 
         WHERE f.audit_id = ? 
         ORDER BY r.created_at ASC`
      ).all(auditId) as AuditRecommendation[]
    : [];

  // Fetch evidence for this audit
  const evidence = await db.prepare(
    `SELECT * FROM audit_evidence WHERE audit_id = ? ORDER BY created_at ASC`
  ).all(auditId) as AuditEvidence[];

  // Determine language: default to 'ar'
  const language = audit.language || 'ar';

  return {
    id: audit.id,
    title: audit.title,
    plan_code: audit.plan_code,
    department: audit.department,
    lead_auditor: audit.lead_auditor,
    status: audit.status,
    planned_start_date: audit.planned_start_date,
    planned_end_date: audit.planned_end_date,
    scope: audit.scope,
    objectives: audit.objectives,
    language,
    findings,
    recommendations,
    evidence,
  };
}

/**
 * Formats audit data into the template-friendly structure expected by
 * Handlebars templates and the PdfEngine.
 *
 * Maps internal AuditData fields to the AuditDataForTemplate interface
 * used by both stored templates and built-in fallbacks.
 */
function formatAuditDataForTemplate(auditData: AuditData): Record<string, unknown> {
  return {
    // Required fields
    auditTitle: auditData.title,
    auditDate: auditData.planned_start_date || new Date().toISOString().split('T')[0],
    auditorName: auditData.lead_auditor || '',
    departmentName: auditData.department || '',

    // Findings array
    findings: auditData.findings.map((f) => ({
      title: f.title,
      description: f.description,
      risk_level: f.risk_level,
      status: f.status,
      criteria: f.criteria,
      condition: f.condition,
      cause: f.cause,
      consequence: f.consequence,
    })),

    // Recommendations array
    recommendations: auditData.recommendations.map((r) => ({
      action_plan: r.action_plan,
      responsible: r.responsible,
      due_date: r.due_date,
      status: r.status,
      department: r.department,
      risk_level: r.risk_level,
    })),

    // Evidence array
    evidence: auditData.evidence.map((e) => ({
      type: e.type,
      description: e.description,
      file_name: e.file_name,
      upload_date: e.upload_date,
    })),

    // Optional fields
    scope: auditData.scope,
    objectives: auditData.objectives,
    planCode: auditData.plan_code,
    status: auditData.status,

    // Metadata
    generatedAt: new Date().toISOString(),
    isRtl: auditData.language === 'ar',
  };
}

export { generatePdfWorker };
export default generatePdfWorker;
