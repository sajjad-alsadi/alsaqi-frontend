import express from 'express';
import crypto from 'crypto';
import { asyncHandler } from '../utils/asyncHandler';
import { db } from '../db/index';
import logger from '../utils/logger';

/**
 * Computes a SHA-256 signature from the error message and the first stack frame.
 * This groups identical errors even if metadata differs.
 */
function computeSignature(message: string, stack?: string): string {
  const firstFrame = stack
    ? stack.split('\n').find((line) => line.trim().startsWith('at ')) || ''
    : '';
  const input = `${message}|${firstFrame.trim()}`;
  return crypto.createHash('sha256').update(input).digest('hex');
}

/**
 * Creates the /api/system-errors route for frontend error reporting.
 * - POST / — accepts error reports, computes signature, upserts into system_errors table
 */
export const createSystemErrorsRoutes = () => {
  const router = express.Router();

  /**
   * POST /api/system-errors
   * Accepts a frontend error report, computes a signature, and upserts it.
   * No authentication required — fire-and-forget from client.
   */
  router.post(
    '/',
    asyncHandler(async (req, res) => {
      const {
        message,
        stack,
        componentStack,
        appVersion,
        sessionId,
        userAgent,
        routePath,
        timestamp,
        type,
      } = req.body;

      // Basic validation
      if (!message || typeof message !== 'string') {
        return res.status(400).json({ error: 'message is required' });
      }

      const validTypes = ['boundary', 'uncaught', 'unhandled-rejection'];
      if (type && !validTypes.includes(type)) {
        return res.status(400).json({ error: `type must be one of: ${validTypes.join(', ')}` });
      }

      const signature = computeSignature(message, stack);
      const now = new Date().toISOString();

      try {
        // Check if an error with this signature already exists
        const existing = await db
          .prepare(
            'SELECT id, count, first_seen FROM system_errors WHERE signature = ?'
          )
          .get(signature);

        if (existing) {
          const newCount = (existing.count || 1) + 1;

          // Determine if recurring: count > 10 within 1-hour window
          const firstSeen = new Date(existing.first_seen);
          const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
          const isRecurring = newCount > 10 && firstSeen >= oneHourAgo;

          await db
            .prepare(
              `UPDATE system_errors 
               SET count = ?, last_seen = ?, is_recurring = ?,
                   app_version = COALESCE(?, app_version),
                   session_id = COALESCE(?, session_id),
                   user_agent = COALESCE(?, user_agent),
                   route_path = COALESCE(?, route_path)
               WHERE id = ?`
            )
            .run(
              newCount,
              now,
              isRecurring,
              appVersion || null,
              sessionId || null,
              userAgent || null,
              routePath || null,
              existing.id
            );
        } else {
          // Insert new error record
          await db
            .prepare(
              `INSERT INTO system_errors 
               (signature, message, stack, component_stack, count, first_seen, last_seen, is_recurring, app_version, session_id, user_agent, route_path)
               VALUES (?, ?, ?, ?, 1, ?, ?, FALSE, ?, ?, ?, ?)`
            )
            .run(
              signature,
              message,
              stack || null,
              componentStack || null,
              now,
              now,
              appVersion || null,
              sessionId || null,
              userAgent || null,
              routePath || null
            );
        }

        res.status(201).json({ received: true });
      } catch (error: any) {
        logger.error('[SystemErrors] Failed to store error report', {
          error: error.message,
          signature,
        });
        // Still return 201 to avoid cascading errors on the client
        res.status(201).json({ received: true });
      }
    })
  );

  return router;
};
