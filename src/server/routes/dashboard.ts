import express from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { DashboardService } from '../services/DashboardService';

export const createDashboardRoutes = (
  db: any,
  authenticate: any,
  authorize: any,
  logError: any
) => {
  const router = express.Router();

  router.get(`/dashboard-stats`, authenticate, asyncHandler(async (req, res) => {
    const { department, riskLevel } = req.query;
    const stats = await DashboardService.getDashboardStats({ 
      department: department as string, 
      riskLevel: riskLevel as string 
    });
    res.json(stats);
  }));

  router.get(`/my-tasks`, authenticate, asyncHandler(async (req, res) => {
    const typedReq = req as unknown as any;
    const userId = typedReq.user.id;
    const tasks = await DashboardService.getMyTasks(userId);
    res.json(tasks);
  }));

  return router;
};
