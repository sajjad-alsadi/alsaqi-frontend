import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { asyncHandler } from '../utils/asyncHandler';
import { QueueService } from '../services/queue.service';
import { StorageService } from '../services/storage.service';

/**
 * Creates the PDF report generation and download routes.
 *
 * POST /reports/generate - Enqueue a generate-pdf job, return 202 with jobId and reportId
 * GET /reports/:id/download - Download a completed report via presigned URL redirect
 *
 * Requirements: 4.1, 4.2
 */
export const createReportRoutes = (
  db: any,
  authenticate: any,
  queueService: QueueService,
  storageService: StorageService,
) => {
  const router = express.Router();

  /**
   * POST /reports/generate
   *
   * Accepts { auditId, template? } in request body.
   * Creates a report record in the database, enqueues a generate-pdf job,
   * and returns 202 Accepted with the jobId and reportId.
   *
   * Requirements: 4.1, 4.2
   */
  router.post(
    '/generate',
    authenticate,
    asyncHandler(async (req: any, res: any) => {
      const { auditId, template } = req.body;

      if (!auditId) {
        return res.status(400).json({ error: 'auditId is required' });
      }

      // Create a report record in the database with status 'pending'
      const reportId = uuidv4();
      const templateName = template || 'default';

      await db.prepare(
        `INSERT INTO audit_reports (id, audit_id, title, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
      ).run(reportId, auditId, `Generated Report - ${templateName}`, 'pending');

      // Enqueue generate-pdf job
      const jobRef = await queueService.enqueue('generate-pdf', {
        reportId,
        auditId,
        template: templateName,
      }, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
      });

      return res.status(202).json({
        jobId: jobRef.jobId,
        reportId,
      });
    }),
  );

  /**
   * GET /reports/:id/download
   *
   * Looks up the report record by ID. If the report status is 'ready',
   * generates a presigned URL for the PDF in storage and redirects (302).
   * If the report is not ready or not found, returns 404.
   *
   * Requirements: 4.2
   */
  router.get(
    '/:id/download',
    authenticate,
    asyncHandler(async (req: any, res: any) => {
      const { id } = req.params;

      const report = await db.prepare(
        `SELECT id, audit_id, status, content FROM audit_reports WHERE id = ?`
      ).get(id);

      if (!report) {
        return res.status(404).json({ error: 'Report not found' });
      }

      if (report.status !== 'ready') {
        return res.status(404).json({
          error: 'Report is not available for download',
          status: report.status,
        });
      }

      // The 'content' column stores the storage key (set by generate-pdf worker)
      const storageKey = report.content;

      if (!storageKey) {
        return res.status(404).json({ error: 'Report file not found in storage' });
      }

      // Generate presigned URL and redirect
      const presignedUrl = await storageService.getPresignedUrl(storageKey, 'reports', 3600);

      return res.redirect(302, presignedUrl);
    }),
  );

  return router;
};
