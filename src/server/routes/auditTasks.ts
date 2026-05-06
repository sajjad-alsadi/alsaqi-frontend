import express from 'express';
import { AuditTaskService } from '../services/AuditTaskService';
import { asyncHandler } from '../utils/asyncHandler';

export const createAuditTaskRoutes = (
  db: any,
  authenticate: any,
  logError: any
) => {
  const router = express.Router();

  // Custom route for status transitions
  router.patch('/:id/status', authenticate, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    
    // Notice this uses user token details for RBAC validation inside Service
    const typedReq = req as any;
    const userId = typedReq.user.id;
    const userRole = typedReq.user.role;

    try {
      await AuditTaskService.changeStatus(String(id), status, userId, userRole, db);
      res.json({ success: true, message: 'Status updated successfully' });
    } catch (err: any) {
      logError(err, 'PATCH', req.originalUrl, req.ip, userId);
      res.status(400).json({ success: false, error: { message: err.message, code: err.code || 'BAD_REQUEST' } });
    }
  }));

  router.get('/', authenticate, asyncHandler(async (req, res) => {
    const tasks = await AuditTaskService.getTasks(req.query);
    res.json(tasks);
  }));

  return router;
};
