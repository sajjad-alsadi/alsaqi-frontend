import { ADMIN_ROLES } from '../../constants';
import express from 'express';
import { SessionService } from '../services/SessionService';
import { asyncHandler } from '../utils/asyncHandler';

export const createSessionRoutes = (
  db: any,
  authenticate: any,
  authorize: any,
  logError: any
) => {
  const router = express.Router();

  router.get(`/`, authenticate, authorize(ADMIN_ROLES), asyncHandler(async (req, res) => {
    const sessions = await SessionService.getActiveSessions();
    res.json(sessions);
  }));

  router.delete(`/:id`, authenticate, authorize(ADMIN_ROLES), asyncHandler(async (req, res) => {
    await SessionService.terminateSession(req.params.id as string);
    res.json({ success: true });
  }));

  return router;
};
