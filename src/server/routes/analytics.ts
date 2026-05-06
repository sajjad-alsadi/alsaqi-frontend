import { ADMIN_ROLES } from '../../constants';
import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { AnalyticsService } from "../services/AnalyticsService";

export const createAnalyticsRoutes = (db: any, authenticate: any, authorize: any, logError: any) => {
  const router = Router();

  router.get("/findings-by-risk", authenticate, authorize(ADMIN_ROLES), asyncHandler(async (req, res) => {
    const data = await AnalyticsService.getFindingsByRisk();
    res.json(data);
  }));

  router.get("/findings-by-status", authenticate, authorize(ADMIN_ROLES), asyncHandler(async (req, res) => {
    const data = await AnalyticsService.getFindingsByStatus();
    res.json(data);
  }));

  router.get("/recommendations-by-status", authenticate, authorize(ADMIN_ROLES), asyncHandler(async (req, res) => {
    const data = await AnalyticsService.getRecommendationsByStatus();
    res.json(data);
  }));

  return router;
};
