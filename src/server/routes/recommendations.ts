import express from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ValidationError } from '../utils/errors';

export const createRecommendationRoutes = (
  db: any,
  authenticate: any,
  logError: any
) => {
  const router = express.Router();

  router.patch('/:id/resolve', authenticate, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { closure_evidence_path } = req.body;
    
    if (!closure_evidence_path) {
      throw new ValidationError('Evidence path is mandatory to close a recommendation');
    }
    
    const typedReq = req as any;
    const userId = typedReq.user.id;

    try {
      await db.prepare(`
        UPDATE recommendations 
        SET status = 'closed', 
            closure_evidence_path = ?, 
            closed_by = ?, 
            closed_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(closure_evidence_path, userId, id);
      
      res.json({ success: true });
    } catch (err: any) {
      logError(err, 'PATCH', req.originalUrl, req.ip, userId);
      res.status(500).json({ success: false, error: { message: err.message, code: 'INTERNAL_ERROR' } });
    }
  }));

  return router;
};
