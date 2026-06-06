// Suppress TensorFlow / oneDNN informational logs from Magika
process.env.TF_ENABLE_ONEDNN_OPTS = '0';
process.env.TF_CPP_MIN_LOG_LEVEL = '2';

import express from "express";
import http from "http";
import cors from "cors";
import { WebSocketServer } from "ws";
import fileUpload from "express-fileupload";
import path from "path";
import { fileURLToPath } from "url";
import cookieParser from "cookie-parser";
import fs from "fs";
import jwt from "jsonwebtoken";
import { FileUploadRequest } from "./src/server/types";
import { db, initDb as initializeDatabase } from "./src/server/db/index";
import { runMigrations } from "./src/server/db/migrations";
import { MigrationRunner } from "./src/server/db/migrationRunner";
import { versionedMigrations } from "./src/server/db/versionedMigrations";
import { setupRoutes } from "./src/server/routes/index";
import { startAutomationJobs } from "./src/server/cron/index";
import { initializeInfrastructure, shutdownInfrastructure } from "./src/server/services/infrastructure";
import { ALLOWED_EXTENSIONS, MIME_TO_EXT, createSaveFile, createLogError, createEncryptedSaveFile } from "./src/server/utils/serverUtils";
import { SecurityService } from "./src/server/services/SecurityService";
import { globalErrorHandler, notFoundHandler } from "./src/server/middleware/error";
import { csrfMiddleware } from "./src/server/middleware/csrf";
import logger from "./src/server/utils/logger";
import { KeyStore, resolveDataDir } from "./src/server/utils/keyStore";
import { correlationIdMiddleware } from "./src/server/middleware/correlationId";
import { createRateLimiter } from "./src/server/middleware/rateLimiter";
import { createResponseWrapper } from "./src/server/middleware/responseWrapper";
import { createRequestLogger } from "./src/server/middleware/requestLogger";
import { createSecureFileMiddleware } from "./src/server/middleware/secureFile";
import { createAuthMiddlewares } from "./src/server/middleware/auth";
import { createHelmetMiddleware } from "./src/server/middleware/helmet";
import { createCompressionMiddleware } from "./src/server/middleware/compression";
import { runSecretsValidation } from "./src/server/utils/secretsValidator";

// Permission Module Registry - importing triggers module registration
import "./src/permissions/modules";
import { seedModules } from "./src/permissions/seeder";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── Secrets Validation (MUST run before any other initialization) ────────────
// In production: exits with code 1 if critical secrets are weak/missing
// In development: logs warnings but never blocks startup
const secretsValidation = runSecretsValidation();
if (process.env.NODE_ENV === 'production' && !secretsValidation.isValid) {
  process.exit(1);
}

// Setup Directories
let uploadDir = path.join(process.cwd(), 'uploads');
let tmpDir = path.join(process.cwd(), 'tmp');

const ensureDir = (dir: string): boolean => {
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    // Test writability
    const testFile = path.join(dir, '.write-test');
    fs.writeFileSync(testFile, '');
    fs.unlinkSync(testFile);
    return true;
  } catch (e) {
    return false;
  }
};

if (!ensureDir(uploadDir)) {
  logger.error(`[CRITICAL] Upload directory ${uploadDir} is not writable! File uploads will fail unless the directory permissions are fixed or a volume is mounted.`);
  // We intentionally do not fall back to /tmp to prevent silent data loss on container restart.
}

if (!ensureDir(tmpDir)) {
  logger.warn(`[SETUP] Temp directory ${tmpDir} not writable, falling back to /tmp/alsaqi_tmp`);
  tmpDir = path.resolve('/tmp', 'alsaqi_tmp');
  ensureDir(tmpDir);
}

const saveFile = createEncryptedSaveFile(uploadDir, db);
const logError = createLogError(db);

const JWT_SECRET = process.env.JWT_SECRET || 'alsaqi-dev-secret-key-123';
let JWT_PRIVATE_KEY = process.env.JWT_PRIVATE_KEY?.replace(/\\n/g, '\n').replace(/\\r/g, '').replace(/^["']|["']$/g, '').trim();
let JWT_PUBLIC_KEY = process.env.JWT_PUBLIC_KEY?.replace(/\\n/g, '\n').replace(/\\r/g, '').replace(/^["']|["']$/g, '').trim();

if (!JWT_PRIVATE_KEY || !JWT_PUBLIC_KEY || !JWT_PRIVATE_KEY.includes('-----BEGIN') || !JWT_PUBLIC_KEY.includes('-----BEGIN')) {
  // Keys will be loaded/generated via KeyStore during server startup
  const keyStore = new KeyStore({
    dataDir: resolveDataDir(),
    encryptionSecret: JWT_SECRET,
  });
  const keys = await keyStore.getOrCreate();
  JWT_PRIVATE_KEY = keys.privateKey;
  JWT_PUBLIC_KEY = keys.publicKey;
}

// Initialize Database Schema
let isDbReady = false;
async function runDbMigrations() {
  let attempts = 0;
  const maxAttempts = 5;
  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  while (attempts < maxAttempts) {
    try {
      attempts++;
      logger.info(`Starting database initialization (Attempt ${attempts}/${maxAttempts})...`);
      await initializeDatabase();
      logger.info("Database instance ready. Running base schema migrations...");
      await runMigrations();
      logger.info("Base schema migrations completed.");

      // Run versioned migrations via MigrationRunner
      const migrationRunner = new MigrationRunner(db);
      await migrationRunner.initialize();
      logger.info("Migration versioning system initialized. Running versioned migrations...");
      await migrationRunner.run(versionedMigrations);
      logger.info("Versioned migrations completed.");

      // Seed permission modules into the database (Req 2.1, 2.7)
      // Runs after DB is ready but before marking the app as ready for requests
      try {
        const seedResult = await seedModules();
        logger.info(`[Permissions] Seeder complete: ${seedResult.added.length} added, ${seedResult.skipped.length} skipped`);
      } catch (seedError: any) {
        logger.warn(`[Permissions] Seeder failed: ${seedError.message}. Application will continue with potentially incomplete permissions.`);
      }

      isDbReady = true;
      logger.info("[SUCCESS] Database initialized and seeded successfully.");
      
      // Start automation jobs after DB is ready
      startAutomationJobs();

      // Initialize infrastructure services (MinIO, Redis/BullMQ, Workers, TLS)
      try {
        await initializeInfrastructure();
      } catch (infraError: any) {
        logger.error('[Infrastructure] Failed to initialize infrastructure services. Application will continue without storage/queue capabilities.', infraError.message);
      }
      break; 
    } catch (error: any) {
      logger.error(`Database initialization attempt ${attempts} failed:`, error.message);
      
      if (attempts >= maxAttempts) {
        logger.error("CRITICAL: Database failed to initialize after maximum retries. Application will remain in degraded mode.");
        break;
      }
      
      // Exponential backoff or simple delay
      const waitTime = Math.min(1000 * Math.pow(2, attempts), 10000);
      logger.info(`Waiting ${waitTime}ms before next database retry...`);
      await delay(waitTime);
    }
  }
}

async function startServer() {
  const app = express();
  
  // Validate critical environment variables in production
  if (process.env.NODE_ENV === 'production') {
    const recommendedEnvVars = ['DATABASE_URL', 'CORS_ORIGIN', 'DATA_DIR'];
    
    for (const envVar of recommendedEnvVars) {
      if (!process.env[envVar]) {
        logger.warn(`WARNING: ${envVar} is not set. Using defaults which may not be suitable for production.`);
      }
    }
  }

  // Security Headers (Helmet.js)
  app.use(createHelmetMiddleware(process.env.NODE_ENV || 'development'));

  // Response Compression (gzip for text-based content > 1KB)
  // Placed after security headers, before routes
  app.use(createCompressionMiddleware());

  // Enable CORS
  const corsOrigin = process.env.CORS_ORIGIN;
  app.use(cors({
    origin: corsOrigin ? corsOrigin.split(',').map(o => o.trim()) : (process.env.NODE_ENV === 'production' ? false : true),
    credentials: true
  }));

  const server = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });

  // Manual WebSocket upgrade handling (noServer mode)
  // Requires JWT token in query parameter ?token= for immediate authentication
  server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url!, `http://${request.headers.host}`);
    const token = url.searchParams.get('token');

    if (!token) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    try {
      const decoded = jwt.verify(token, JWT_PUBLIC_KEY!, { algorithms: ['RS256'] }) as any;

      wss.handleUpgrade(request, socket, head, (ws) => {
        (ws as any).userId = decoded.id;
        (ws as any).username = decoded.username;
        (ws as any).authenticated = true;
        (ws as any).connectedAt = Date.now();
        wss.emit('connection', ws, request);
      });
    } catch (err) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
    }
  });
  
  // WebSocket Connection Handler
  // All connections are pre-authenticated during the upgrade phase (token verified in query param)
  wss.on('connection', (ws, req) => {
    (ws as any).isAlive = true;
    ws.on('pong', () => { (ws as any).isAlive = true; });
  });
  
  wss.on('error', (err) => {
    logger.error('WebSocketServer Error:', err);
  });

  // WebSocket heartbeat to detect stale connections
  const wsHeartbeatInterval = setInterval(() => {
    wss.clients.forEach((ws: any) => {
      if (ws.isAlive === false) {
        return ws.terminate();
      }
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  wss.on('close', () => {
    clearInterval(wsHeartbeatInterval);
  });

  // Make wss accessible to routes
  (app as any).wss = wss;

  app.set('trust proxy', 1);
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  // Root Health Check for Cloud Run Probe
  // MUST be before any conditional middleware or routes
  app.get('/health', (req, res) => {
    res.status(200).send('OK');
  });

  // Explicit root route for production SPA
  if (process.env.NODE_ENV === "production") {
    app.get("/", (req, res) => {
      const distPath = path.join(process.cwd(), "dist");
      const indexPath = path.join(distPath, "index.html");
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).send("Application starting... please refresh.");
      }
    });
  }

  // Middleware to handle "Starting up" state
  app.use((req, res, next) => {
    if (!isDbReady && req.path.startsWith('/api') && req.path !== '/api/health') {
      return res.status(503).json({ 
        error: "Server is starting up, please wait...",
        retryAfter: 5
      });
    }
    next();
  });
  
  app.use(express.json({ limit: '30mb' }));
  app.use(express.urlencoded({ extended: true, limit: '30mb' }));
  app.use(fileUpload({
    limits: { fileSize: 30 * 1024 * 1024 }, // 30MB limit
    abortOnLimit: true,
    responseOnLimit: "File size limit has been reached (Max 30MB)",
    useTempFiles: true,
    tempFileDir: tmpDir
  }));

  // Global File Validation Middleware
  app.use(async (req, res, next) => {
    try {
      const typedReq = req as unknown as FileUploadRequest;
      if (typedReq.files) {
        for (const key of Object.keys(typedReq.files)) {
          const fileOrFiles = typedReq.files[key];
          const filesArray = Array.isArray(fileOrFiles) ? fileOrFiles : [fileOrFiles];
          
          for (const file of filesArray) {
            const ext = path.extname(file.name).toLowerCase();
            
            // 1. Check if extension is allowed
            if (!ALLOWED_EXTENSIONS.includes(ext)) {
              return res.status(400).json({ error: `File extension ${ext} is not allowed.` });
            }

            // 2. Cross-verify with Mimetype
            const expectedExts = MIME_TO_EXT[file.mimetype];
            if (!expectedExts || !expectedExts.includes(ext)) {
              return res.status(400).json({ error: `Security Alert: File content mismatch for ${file.name}.` });
            }

            // 3. AI Security Check (Magika) - Deep Content Identification
            const source = file.tempFilePath || file.data;
            if (source) {
              const isSafe = await SecurityService.validateFileSafety(source, ext);
              if (!isSafe) {
                return res.status(400).json({ 
                  error: `Security Alert: AI analysis detected content mismatch for ${file.name}. The file's internal structure does not match its ${ext} extension.` 
                });
              }
            }
          }
        }
      }
      next();
    } catch (error) {
      logger.error("Middleware Validation Error:", error);
      next(error);
    }
  });

  app.use(cookieParser());

  // ─── Middleware Order (per API Audit spec) ─────────────────────────────────
  // 1. Rate Limiter (per-user sliding window) - only on API routes
  app.use('/api', createRateLimiter());

  // 2. Correlation ID Middleware for request tracing
  app.use(correlationIdMiddleware);

  // 3. Response Wrapper (unified envelope for all JSON responses)
  app.use(createResponseWrapper({ excludePaths: ['/health'] }));

  // 4. CSRF Protection Middleware
  // Validates CSRF tokens on state-changing requests (POST, PUT, PATCH, DELETE)
  // Must be after cookieParser (reads csrf-token cookie) and before routes
  app.use(csrfMiddleware({
    exemptPaths: ['/api/auth/login', '/api/auth/refresh', '/api/system-errors', '/api/log-error', '/api/security/events', '/health'],
    tokenHeader: 'x-csrf-token',
    cookieName: 'csrf-token',
    tokenByteLength: 32,
  }));

  // 5. Auth - applied per-route in setupRoutes
  // 6. Validation - applied per-route in setupRoutes
  // 7. Idempotency - applied per-route in setupRoutes (needs user context)

  // 8. Request Logger (records method, path, status, duration, user, IP)
  app.use(createRequestLogger());

  // Secure File Access (replaces express.static for /uploads)
  // Requires authentication and module-level permission checks
  const { authenticate: fileAuthenticate } = createAuthMiddlewares(db, JWT_SECRET, JWT_PUBLIC_KEY!);
  app.use('/uploads', createSecureFileMiddleware(fileAuthenticate, uploadDir));

  // Setup API Routes
  setupRoutes(app, JWT_SECRET, JWT_PRIVATE_KEY!, JWT_PUBLIC_KEY!, saveFile, logError);

  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    
    // SPA Fallback
    app.get('*all', (req, res) => {
      const indexPath = path.join(distPath, "index.html");
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).send("Application not ready. Please try again in 30 seconds.");
      }
    });
  }

  // 404 Handler
  app.use(notFoundHandler);

  // Global Error Handler (Must be defined after all routes)
  app.use(globalErrorHandler);

  // Graceful Shutdown
  const shutdown = (signal: string) => {
    logger.info(`[${signal}] received, shutting down gracefully...`);

    // Shutdown infrastructure services (workers, queues, cert watchers)
    shutdownInfrastructure().catch(err => {
      logger.error('Error during infrastructure shutdown:', err);
    }).finally(() => {
      server.close(() => {
        logger.info('Closed out remaining connections.');
        process.exit(0);
      });

      // Force shutdown after 10s
      setTimeout(() => {
        logger.error('Could not close connections in time, forcefully shutting down');
        process.exit(1);
      }, 10000);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('uncaughtException', (err) => {
    logger.error('UNCAUGHT EXCEPTION:', err);
    process.exit(1);
  });
  process.on('unhandledRejection', (reason, promise) => {
    logger.error('UNHANDLED REJECTION:', reason);
  });

  server.on('error', (err) => {
    logger.error('HTTP Server Error:', err);
  });

  server.listen(PORT, "0.0.0.0", () => {
    logger.info(`[SUCCESS] Server is live at http://0.0.0.0:${PORT}`);
    logger.info(`[INFO] Environment: ${process.env.NODE_ENV || 'development'}`);
    
    // Start DB migrations in background after server is listening
    runDbMigrations();
  });
}

startServer().catch(err => {
  logger.error("Failed to start server:", err);
});
