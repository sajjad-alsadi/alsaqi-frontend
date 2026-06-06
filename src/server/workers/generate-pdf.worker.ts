/**
 * Generate PDF Worker
 *
 * Background worker that generates PDF audit reports from PostgreSQL data,
 * uploads them to MinIO reports bucket, and updates the report record.
 *
 * Features:
 * - Fetches full audit data (findings, recommendations, evidence)
 * - Renders PDF with RTL support for Arabic language
 * - Uploads to reports bucket at audits/{auditId}/reports/{reportId}.pdf
 * - Atomic failure handling when audit not found (UnrecoverableError)
 * - Retry up to 3 attempts with exponential backoff
 *
 * Requirements: 4.1, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8
 */

import { UnrecoverableError } from 'bullmq';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { type JobProcessor } from '../services/worker-manager.js';
import { TAHOMA_FONT_BASE64 } from '../../assets/fonts/tahoma-base64.js';

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
 * 1. Fetch audit data from DB (findings, recommendations, evidence)
 * 2. If audit not found: throw UnrecoverableError (won't retry)
 * 3. Render PDF with RTL support if language is Arabic
 * 4. Upload PDF to reports bucket
 * 5. Update report record in DB (status 'ready', storageKey, fileSize)
 */
const generatePdfWorker: JobProcessor<'generate-pdf'> = async (job, context) => {
  const { reportId, auditId, template } = job.data;
  const { storage, db, logger, reportProgress } = context;

  const dbClient = db as any;

  // Step 1: Fetch full audit data
  logger.info('[generate-pdf] Fetching audit data', { auditId, reportId, template });

  const auditData = await fetchAuditData(dbClient, auditId);
  await reportProgress(10);

  // Step 2: If audit not found, throw UnrecoverableError (no retry)
  if (!auditData) {
    // Atomic: mark job failed + record error (UnrecoverableError won't be retried)
    const errorMsg = `Audit ${auditId} not found`;
    logger.error('[generate-pdf] Audit not found', { auditId, reportId });

    // Atomic: update both status and error in a single DB call (Requirement 4.7)
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

  // Step 3: Determine language and compile report content
  const isArabic = auditData.language === 'ar';
  logger.info('[generate-pdf] Rendering PDF', {
    auditId,
    reportId,
    language: isArabic ? 'ar' : 'en',
    findingsCount: auditData.findings.length,
    recommendationsCount: auditData.recommendations.length,
    evidenceCount: auditData.evidence.length,
  });
  await reportProgress(30);

  // Steps 4–6: PDF generation, upload, and DB update
  // Wrapped in try/catch for Requirement 4.8: if this is the last retry attempt
  // and it fails, mark the report as 'failed' with the error reason.
  const maxAttempts = 3;

  try {
    // Step 4: Render PDF with RTL support
    const pdfBuffer = renderAuditPdf(auditData, isArabic);
    await reportProgress(70);

    // Step 5: Upload PDF to reports bucket
    const storageKey = `audits/${auditId}/reports/${reportId}.pdf`;
    logger.info('[generate-pdf] Uploading PDF to storage', { storageKey, size: pdfBuffer.length });

    await storage.upload({
      key: storageKey,
      body: pdfBuffer,
      contentType: 'application/pdf',
      bucket: 'reports',
      metadata: {
        reportId,
        auditId,
        generatedAt: new Date().toISOString(),
      },
    });
    await reportProgress(90);

    // Step 6: Update report record (status 'ready', storageKey, fileSize)
    // Both upload and this update must succeed for status to be 'ready' (Requirement 4.6)
    await dbClient.prepare(
      `UPDATE audit_reports 
       SET status = ?, content = ?, file_size = ?, updated_at = CURRENT_TIMESTAMP 
       WHERE id = ?`
    ).run('ready', storageKey, pdfBuffer.length, reportId);

    await reportProgress(100);

    logger.info('[generate-pdf] PDF report generated successfully', {
      reportId,
      auditId,
      storageKey,
      fileSize: pdfBuffer.length,
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

    // Requirement 4.8: If this is the last attempt, mark report as 'failed'
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

    // Re-throw so BullMQ handles the retry logic
    throw error;
  }
};

// ─── Helper Functions ────────────────────────────────────────────────────────

/**
 * Fetches full audit data including findings, recommendations, and evidence.
 * Returns null if the audit does not exist.
 */
async function fetchAuditData(db: any, auditId: string): Promise<AuditData | null> {
  // Fetch the audit plan
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

  // Determine language: check if audit has a language field, 
  // or infer from department/lead_auditor, default to 'ar'
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
 * Renders a PDF document from audit data.
 * Supports RTL layout for Arabic language.
 * Returns the PDF as a Buffer.
 */
function renderAuditPdf(data: AuditData, isRtl: boolean): Buffer {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  // Register Arabic font for RTL support
  if (isRtl) {
    doc.addFileToVFS('Tahoma.ttf', TAHOMA_FONT_BASE64);
    doc.addFont('Tahoma.ttf', 'Tahoma', 'normal');
    doc.setFont('Tahoma');
  }

  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;
  let y = 20;

  // ─── Title ──────────────────────────────────────────────────────────────────
  doc.setFontSize(18);
  const title = data.title || (isRtl ? 'تقرير التدقيق' : 'Audit Report');
  doc.text(title, pageWidth / 2, y, { align: 'center' });
  y += 12;

  // Divider line
  doc.setDrawColor(41, 128, 185);
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageWidth - margin, y);
  y += 10;

  // ─── Report Info ────────────────────────────────────────────────────────────
  doc.setFontSize(10);
  const infoItems = isRtl
    ? [
        { label: 'رمز الخطة', value: data.plan_code || '-' },
        { label: 'القسم', value: data.department || '-' },
        { label: 'المدقق الرئيسي', value: data.lead_auditor || '-' },
        { label: 'الحالة', value: data.status || '-' },
        { label: 'تاريخ البدء', value: data.planned_start_date || '-' },
        { label: 'تاريخ الانتهاء', value: data.planned_end_date || '-' },
      ]
    : [
        { label: 'Plan Code', value: data.plan_code || '-' },
        { label: 'Department', value: data.department || '-' },
        { label: 'Lead Auditor', value: data.lead_auditor || '-' },
        { label: 'Status', value: data.status || '-' },
        { label: 'Start Date', value: data.planned_start_date || '-' },
        { label: 'End Date', value: data.planned_end_date || '-' },
      ];

  for (const item of infoItems) {
    const text = `${item.label}: ${item.value}`;
    doc.text(text, isRtl ? pageWidth - margin : margin, y, {
      align: isRtl ? 'right' : 'left',
    });
    y += 6;
  }
  y += 8;

  // ─── Scope & Objectives ─────────────────────────────────────────────────────
  if (data.scope || data.objectives) {
    if (y > 250) { doc.addPage(); y = 20; }

    if (data.scope) {
      doc.setFontSize(13);
      const scopeLabel = isRtl ? 'نطاق التدقيق' : 'Audit Scope';
      doc.text(scopeLabel, isRtl ? pageWidth - margin : margin, y, {
        align: isRtl ? 'right' : 'left',
      });
      y += 7;
      doc.setFontSize(10);
      const scopeLines = doc.splitTextToSize(data.scope, pageWidth - margin * 2);
      doc.text(scopeLines, isRtl ? pageWidth - margin : margin, y, {
        align: isRtl ? 'right' : 'left',
      });
      y += scopeLines.length * 5 + 8;
    }

    if (data.objectives) {
      doc.setFontSize(13);
      const objLabel = isRtl ? 'أهداف التدقيق' : 'Audit Objectives';
      doc.text(objLabel, isRtl ? pageWidth - margin : margin, y, {
        align: isRtl ? 'right' : 'left',
      });
      y += 7;
      doc.setFontSize(10);
      const objLines = doc.splitTextToSize(data.objectives, pageWidth - margin * 2);
      doc.text(objLines, isRtl ? pageWidth - margin : margin, y, {
        align: isRtl ? 'right' : 'left',
      });
      y += objLines.length * 5 + 8;
    }
  }

  // ─── Findings Table ─────────────────────────────────────────────────────────
  if (data.findings.length > 0) {
    if (y > 240) { doc.addPage(); y = 20; }

    doc.setFontSize(13);
    const findingsTitle = isRtl ? 'الملاحظات' : 'Findings';
    doc.text(findingsTitle, isRtl ? pageWidth - margin : margin, y, {
      align: isRtl ? 'right' : 'left',
    });
    y += 8;

    const findingHeaders = isRtl
      ? ['مستوى المخاطر', 'الوصف', 'الملاحظة', '#']
      : ['#', 'Finding', 'Description', 'Risk Level'];

    const findingRows = data.findings.map((f, i) => {
      const row = [
        String(i + 1),
        f.title || '-',
        f.description || '-',
        f.risk_level || '-',
      ];
      return isRtl ? row.reverse() : row;
    });

    (doc as any).autoTable({
      startY: y,
      head: [findingHeaders],
      body: findingRows,
      styles: {
        font: isRtl ? 'Tahoma' : 'helvetica',
        fontSize: 9,
        halign: isRtl ? 'right' : 'left',
        cellPadding: 3,
      },
      headStyles: {
        fillColor: [192, 57, 43],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        halign: 'center',
      },
      margin: { left: margin, right: margin },
    });
    y = (doc as any).lastAutoTable.finalY + 12;
  }

  // ─── Recommendations Table ──────────────────────────────────────────────────
  if (data.recommendations.length > 0) {
    if (y > 240) { doc.addPage(); y = 20; }

    doc.setFontSize(13);
    const recTitle = isRtl ? 'التوصيات' : 'Recommendations';
    doc.text(recTitle, isRtl ? pageWidth - margin : margin, y, {
      align: isRtl ? 'right' : 'left',
    });
    y += 8;

    const recHeaders = isRtl
      ? ['تاريخ الاستحقاق', 'الحالة', 'المسؤول', 'القسم', '#']
      : ['#', 'Department', 'Responsible', 'Status', 'Due Date'];

    const recRows = data.recommendations.map((r, i) => {
      const row = [
        String(i + 1),
        r.department || '-',
        r.responsible || '-',
        r.status || '-',
        r.due_date || '-',
      ];
      return isRtl ? row.reverse() : row;
    });

    (doc as any).autoTable({
      startY: y,
      head: [recHeaders],
      body: recRows,
      styles: {
        font: isRtl ? 'Tahoma' : 'helvetica',
        fontSize: 9,
        halign: isRtl ? 'right' : 'left',
        cellPadding: 3,
      },
      headStyles: {
        fillColor: [39, 174, 96],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        halign: 'center',
      },
      margin: { left: margin, right: margin },
    });
    y = (doc as any).lastAutoTable.finalY + 12;
  }

  // ─── Evidence Table ─────────────────────────────────────────────────────────
  if (data.evidence.length > 0) {
    if (y > 240) { doc.addPage(); y = 20; }

    doc.setFontSize(13);
    const evidenceTitle = isRtl ? 'الأدلة' : 'Evidence';
    doc.text(evidenceTitle, isRtl ? pageWidth - margin : margin, y, {
      align: isRtl ? 'right' : 'left',
    });
    y += 8;

    const evidenceHeaders = isRtl
      ? ['تاريخ الرفع', 'اسم الملف', 'الوصف', 'النوع', '#']
      : ['#', 'Type', 'Description', 'File Name', 'Upload Date'];

    const evidenceRows = data.evidence.map((e, i) => {
      const row = [
        String(i + 1),
        e.type || '-',
        e.description || '-',
        e.file_name || '-',
        e.upload_date || '-',
      ];
      return isRtl ? row.reverse() : row;
    });

    (doc as any).autoTable({
      startY: y,
      head: [evidenceHeaders],
      body: evidenceRows,
      styles: {
        font: isRtl ? 'Tahoma' : 'helvetica',
        fontSize: 9,
        halign: isRtl ? 'right' : 'left',
        cellPadding: 3,
      },
      headStyles: {
        fillColor: [41, 128, 185],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        halign: 'center',
      },
      margin: { left: margin, right: margin },
    });
  }

  // ─── Footer on all pages ────────────────────────────────────────────────────
  const pageCount = (doc as any).internal.getNumberOfPages();
  const pageHeight = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(128);
    const footerText = isRtl
      ? `صفحة ${i} من ${pageCount}`
      : `Page ${i} of ${pageCount}`;
    doc.text(footerText, pageWidth / 2, pageHeight - 10, { align: 'center' });

    const dateText = new Date().toLocaleDateString(isRtl ? 'ar-SA' : 'en-US');
    doc.text(dateText, isRtl ? margin : pageWidth - margin, pageHeight - 10, {
      align: isRtl ? 'left' : 'right',
    });
    doc.setTextColor(0);
  }

  // Output as Buffer (Node.js compatible)
  const arrayBuffer = doc.output('arraybuffer');
  return Buffer.from(arrayBuffer);
}

export { generatePdfWorker };
export default generatePdfWorker;
