import { ADMIN_ROLES } from '../../constants';
import { Router } from "express";
import { RegulatoryService } from "../services/RegulatoryService";
import { asyncHandler } from "../utils/asyncHandler";
import { ValidationError } from "../utils/errors";
import { z } from "zod";

export const createRegulatoryRoutes = (db: any, authenticate: any, authorize: any, logError: any) => {
  const router = Router();

  router.get("/central-bank-instructions", authenticate, asyncHandler(async (req, res) => {
    const instructions = await RegulatoryService.getCentralBankInstructions();
    res.json(instructions);
  }));

  router.get("/law-bank", authenticate, asyncHandler(async (req, res) => {
    const laws = await RegulatoryService.getLawBank();
    res.json(laws);
  }));

  router.post("/central-bank-instructions", authenticate, authorize(ADMIN_ROLES), asyncHandler(async (req, res) => {
    res.status(501).json({ error: "Not implemented" });
  }));

  return router;
};
