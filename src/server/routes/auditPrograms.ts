import { ADMIN_ROLES } from '../../constants';
import { Router } from "express";
import { z } from "zod";
import { AuthenticatedRequest } from "../types";
import { asyncHandler } from "../utils/asyncHandler";
import { AuditProgramService } from "../services/AuditProgramService";
import { AuthService } from "../services/AuthService";
import { ValidationError } from "../utils/errors";
import { methodNotAllowed } from "../utils/routeRegistry";

export const createAuditProgramRoutes = (db: any, authenticate: any, authorize: any, logError: any) => {
  const router = Router();

  router.post("/:id/duplicate", authenticate, asyncHandler(async (req, res) => {
    const typedReq = req as unknown as AuthenticatedRequest;
    const id = req.params.id as string;
    if (!id || id === 'undefined') {
      throw new ValidationError("Invalid audit program ID");
    }
    const user = typedReq.user.username;
    
    const newId = await AuditProgramService.duplicate(id, user);
    
    await AuthService.logAudit(user, "Duplicate", "Audit Program Library", `Duplicated program ID: ${id} to ${newId}`);
      
    res.json({ id: newId });
  }));

  router.post("/:id/approve", authenticate, authorize(ADMIN_ROLES), asyncHandler(async (req, res) => {
    const typedReq = req as unknown as AuthenticatedRequest;
    const id = req.params.id as string;
    if (!id || id === 'undefined') {
      throw new ValidationError("Invalid audit program ID");
    }
    const user = typedReq.user.username;
    
    await AuditProgramService.approve(id);
    
    await AuthService.logAudit(user, "Approve", "Audit Program Library", `Approved program ID: ${id}`);
      
    res.json({ success: true });
  }));

  // 405 Method Not Allowed for methods not implemented on this custom route
  // This route only supports POST (duplicate, approve) - no GET, PUT, DELETE at root level
  router.all("/", methodNotAllowed(['POST']));
  router.all("/:id", methodNotAllowed(['POST']));

  return router;
};
