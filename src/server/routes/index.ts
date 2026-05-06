import express from "express";
import { db } from "../db/index";
import { createAuthMiddlewares } from "../middleware/auth";
import { createAuthRoutes } from "./auth";
import { createUserRoutes } from "./users";
import { createRoleRoutes } from "./roles";
import { createJobTitleRoutes } from "./jobTitles";
import { createSessionRoutes } from "./sessions";
import { createLogRoutes } from "./logs";
import { createSettingsRoutes } from "./settings";
import { createPdfTemplatesRoutes } from "./pdfTemplates";
import { createProfileRoutes } from "./profile";
import { createDashboardRoutes } from "./dashboard";
import { createCorrespondenceRoutes } from "./correspondence";
import { createOrgEntitiesRoutes } from "./orgEntities";
import { createCoiRoutes } from "./coi";
import { createPoliciesRoutes } from "./policies";
import { createAppSettingsRoutes } from "./appSettings";
import { createExecutiveReportsRoutes } from "./executiveReports";
import { createDepartmentRoutes } from "./departments";
import { createCrudRoutes } from "../utils/crudGenerator";
import { createAnalyticsRoutes } from "./analytics";
import { createIntegrityRoutes } from "./integrity";
import { createAuditProgramRoutes } from "./auditPrograms";
import { createFraudRoutes } from "./fraud";
import { createComplianceRoutes } from "./compliance";
import { createNotificationRoutes } from "./notifications";
import { createCommentRoutes } from "./comments";
import { createAuditTaskRoutes } from "./auditTasks";
import { createRecommendationRoutes } from "./recommendations";
import { NotificationService } from "../services/NotificationService";

import rateLimit from "express-rate-limit";

const createNotification = NotificationService.create.bind(NotificationService);

export const setupRoutes = (
  app: express.Application,
  JWT_SECRET: string,
  JWT_PRIVATE_KEY: string,
  JWT_PUBLIC_KEY: string,
  saveFile: any,
  logError: any
) => {
  // Global API Rate Limiter
  const globalApiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 150, // limit each IP to 150 requests per windowMs
    message: { error: "Too many requests from this IP, please try again after a minute" },
    standardHeaders: true,
    legacyHeaders: false,
  });

  // Apply to all API routes
  app.use('/api/', globalApiLimiter);

  // Auth Middleware
  const { authenticate, checkPermission, authorize, authLimiter } = createAuthMiddlewares(db, JWT_SECRET, JWT_PUBLIC_KEY);

  // Health Check
  app.get("/api/health", (req, res) => {
    let dbType = 'PostgreSQL';
    let persistence = 'persistent';
    
    if (!db.isExternal) {
      dbType = 'PGlite';
      // PGlite instance has dataDir if it's persistent
      persistence = db.client?.dataDir ? 'persistent' : 'in-memory';
    }

    res.json({ 
      status: "ok", 
      timestamp: new Date().toISOString(), 
      database: dbType,
      persistence: persistence
    });
  });

  // Auth Routes
  app.use("/api/auth", createAuthRoutes(db, JWT_SECRET, JWT_PRIVATE_KEY, authLimiter, authenticate, authorize, createNotification, logError));
  
  // Generic CRUD API Generator with Auth & Logging
  app.use("/api", createCrudRoutes(db, authenticate, checkPermission, logError, createNotification, saveFile));

  // Notification Routes
  app.use("/api/notifications", createNotificationRoutes(db, authenticate));
  
  // Comments Routes
  app.use("/api/comments", createCommentRoutes(db, authenticate, logError));

  // Modular Routes
  app.use("/api/job-titles", createJobTitleRoutes(db, authenticate, authorize, logError));
  app.use("/api/users", createUserRoutes(db, authenticate, authorize, logError));
  app.use("/api", createRoleRoutes(db, authenticate, authorize, logError));
  app.use("/api/user-sessions", createSessionRoutes(db, authenticate, authorize, logError));
  app.use("/api", createLogRoutes(db, authenticate, authorize, logError));
  app.use("/api", createSettingsRoutes(db, authenticate, authorize, logError));
  app.use("/api", createPdfTemplatesRoutes(db, authenticate, authorize, logError));
  app.use("/api", createProfileRoutes(db, authenticate, authorize, logError));
  app.use("/api", createDashboardRoutes(db, authenticate, authorize, logError));
  app.use("/api/correspondence", createCorrespondenceRoutes(db, authenticate, authorize, logError, saveFile));
  app.use("/api", createOrgEntitiesRoutes(db, authenticate, authorize, logError));
  app.use("/api", createCoiRoutes(db, authenticate, authorize, logError));
  app.use("/api", createPoliciesRoutes(db, authenticate, authorize, logError));
  app.use("/api", createAppSettingsRoutes(db, authenticate, authorize, logError));
  app.use("/api", createExecutiveReportsRoutes(db, authenticate, authorize, logError));
  app.use("/api/departments", createDepartmentRoutes(db, authenticate, authorize, logError));
  
  // Newly Extracted Routes
  app.use("/api/analytics", createAnalyticsRoutes(db, authenticate, authorize, logError));
  app.use("/api", createIntegrityRoutes(authenticate));
  app.use("/api/audit-programs", createAuditProgramRoutes(db, authenticate, authorize, logError));
  app.use("/api/audit-tasks", createAuditTaskRoutes(db, authenticate, logError));
  app.use("/api/recommendations", createRecommendationRoutes(db, authenticate, logError));
  app.use("/api/fraud-access-requests", createFraudRoutes(db, authenticate, authorize, logError, createNotification));
  app.use("/api/compliance", createComplianceRoutes(db, authenticate, authorize, logError, saveFile));

  // Global API 404 Handler - MUST be after all API routes
  app.use("/api", (req, res) => {
    res.status(404).json({ error: `API endpoint ${req.originalUrl} not found` });
  });
};
