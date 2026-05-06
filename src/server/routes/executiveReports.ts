import express from 'express';
import { ExecutiveReportService } from '../services/ExecutiveReportService';
import { asyncHandler } from '../utils/asyncHandler';

export const createExecutiveReportsRoutes = (
  db: any,
  authenticate: any,
  authorize: any,
  logError: any
) => {
  const router = express.Router();

  router.get('/executive-summary', authenticate, asyncHandler(async (req, res) => {
    const data = await ExecutiveReportService.getExecutiveSummary();
    res.json(data);
  }));

  return router;
};
