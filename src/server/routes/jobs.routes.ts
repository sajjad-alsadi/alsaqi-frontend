import express from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { QueueService } from '../services/queue.service';

/**
 * Creates the job status routes.
 *
 * GET /jobs/:jobId/status - Returns current job state, progress, timestamps, result/error.
 *
 * Requirements: 5.1, 5.2, 5.4, 5.5
 */
export const createJobRoutes = (
  authenticate: any,
  queueService: QueueService,
) => {
  const router = express.Router();

  /**
   * GET /jobs/:jobId/status
   *
   * Returns the current status of a background job.
   * Response includes: id, state, progress, result, failedReason,
   * createdAt, processedAt, completedAt, attemptsMade.
   *
   * Returns 404 if the job is not found.
   */
  router.get(
    '/:jobId/status',
    authenticate,
    asyncHandler(async (req, res) => {
      const { jobId } = req.params;

      const status = await queueService.getJobStatus(jobId);

      if (!status) {
        return res.status(404).json({ error: 'Job not found' });
      }

      return res.status(200).json({
        id: status.id,
        state: status.state,
        progress: status.progress,
        result: status.result,
        failedReason: status.failedReason,
        createdAt: status.createdAt,
        processedAt: status.processedAt,
        completedAt: status.completedAt,
        attemptsMade: status.attemptsMade,
      });
    }),
  );

  return router;
};
