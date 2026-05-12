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
import crypto from "crypto";
import cookieParser from "cookie-parser";
import fs from "fs";
import { FileUploadRequest } from "./src/server/types";
import { db, initDb as initializeDatabase } from "./src/server/db/index";
import { getPersistentDataDir } from "./src/server/db/index";
import { runMigrations } from "./src/server/db/migrations";
import { setupRoutes } from "./src/server/routes/index";
import { startAutomationJobs } from "./src/server/cron/index";
import { ALLOWED_EXTENSIONS, MIME_TO_EXT, createSaveFile, createLogError } from "./src/server/utils/serverUtils";
import { SecurityService } from "./src/server/services/SecurityService";
import { globalErrorHandler, notFoundHandler } from "./src/server/middleware/error";
import logger from "./src/server/utils/logger";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Debug session eece07: local NDJSON + ingest. Tries cwd and __dirname; logs to stderr if all writes fail. */
function agentDebugLog(entry: { hypothesisId: string; location: string; message: string; data?: Record<string, unknown> }) {
  const payload = { sessionId: 'eece07', timestamp: Date.now(), ...entry };
  const line = JSON.stringify(payload) + '\n';
  const logPaths = [...new Set([path.join(process.cwd(), 'debug-eece07.log'), path.join(__dirname, 'debug-eece07.log')])];
  let written = false;
  for (const p of logPaths) {
    try {
      fs.appendFileSync(p, line);
      written = true;
    } catch {
      /* try next */
    }
  }
  if (!written) {
    console.error('[eece07 agentDebugLog] could not write to:', logPaths.join(' | '), 'payload:', line.trim());
  }
  // Terminal mirror so debugging works even when *.log is blocked or cwd differs
  console.log('[EECE07_DEBUG]', line.trim());
  void fetch('http://127.0.0.1:7867/ingest/326691e5-3449-4a3b-a19c-cba3f2dac09e', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'eece07' },
    body: JSON.stringify(payload),
  }).catch(() => {});
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

const saveFile = createSaveFile(uploadDir);
const logError = createLogError(db);

if (process.env.NODE_ENV === 'production' && (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'alsaqi-dev-secret-key-123')) {
  logger.warn("WARNING: JWT_SECRET is missing or using default value in production. Using a fallback secret.");
}

const JWT_SECRET = process.env.JWT_SECRET || 'alsaqi-dev-secret-key-123';
let JWT_PRIVATE_KEY = process.env.JWT_PRIVATE_KEY?.replace(/\\n/g, '\n').replace(/\\r/g, '').replace(/^["']|["']$/g, '').trim();
let JWT_PUBLIC_KEY = process.env.JWT_PUBLIC_KEY?.replace(/\\n/g, '\n').replace(/\\r/g, '').replace(/^["']|["']$/g, '').trim();

if (!JWT_PRIVATE_KEY || !JWT_PUBLIC_KEY || !JWT_PRIVATE_KEY.includes('-----BEGIN') || !JWT_PUBLIC_KEY.includes('-----BEGIN')) {
  
  const persistentDir = getPersistentDataDir();
  const keysPath = path.join(persistentDir, '.rsa_keys.json');

  if (fs.existsSync(keysPath)) {
    logger.info("Loaded persisted RSA JWT keys from local storage.");
    try {
      const storedKeys = JSON.parse(fs.readFileSync(keysPath, 'utf8'));
      JWT_PRIVATE_KEY = storedKeys.privateKey;
      JWT_PUBLIC_KEY = storedKeys.publicKey;
    } catch (e) {
      logger.error("Failed to read persisted RSA keys. Regenerating...");
    }
  }

  if (!JWT_PRIVATE_KEY || !JWT_PUBLIC_KEY || !JWT_PRIVATE_KEY.includes('-----BEGIN') || !JWT_PUBLIC_KEY.includes('-----BEGIN')) {
    if (process.env.NODE_ENV === 'production') {
      logger.warn("WARNING: RSA JWT keys are missing in production environment.");
      logger.warn("Generating keys dynamically. Setting them via ENV vars is strongly recommended.");
    } else {
      logger.warn("RSA JWT keys are missing. Generating temporary RSA keys for development.");
    }
  
    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: {
        type: 'spki',
        format: 'pem'
      },
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem'
      }
    });
    JWT_PRIVATE_KEY = privateKey;
    JWT_PUBLIC_KEY = publicKey;

    try {
      fs.writeFileSync(keysPath, JSON.stringify({ privateKey, publicKey }));
      logger.info("Persisted newly generated RSA keys safely to disk.");
    } catch (e) {
      logger.error("Failed to persist RSA keys to disk. Sessions will reset on reboot.");
    }
  }
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
      logger.info("Database instance ready. Running migrations...");
      await runMigrations();
      logger.info("Migrations completed.");
      isDbReady = true;
      // #region agent log
      agentDebugLog({ hypothesisId: 'H4', location: 'server.ts:runDbMigrations', message: 'db_ready', data: { attempts, isDbReady: true } });
      // #endregion
      logger.info("[SUCCESS] Database initialized and seeded successfully.");
      
      // Start automation jobs after DB is ready
      startAutomationJobs();
      break; 
    } catch (error: any) {
      logger.error(`Database initialization attempt ${attempts} failed:`, error.message);
      
      if (attempts >= maxAttempts) {
        logger.error("CRITICAL: Database failed to initialize after maximum retries. Application will remain in degraded mode.");
        // #region agent log
        agentDebugLog({ hypothesisId: 'H4', location: 'server.ts:runDbMigrations', message: 'db_init_exhausted', data: { attempts, maxAttempts, isDbReady, err: String(error?.message || error) } });
        // #endregion
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
  // #region agent log
  agentDebugLog({ hypothesisId: 'H3', location: 'server.ts:startServer', message: 'startServer_enter', data: { nodeEnv: process.env.NODE_ENV || null, hasGemini: Boolean(process.env.GEMINI_API_KEY) } });
  // #endregion
  const app = express();
  
  // Enable CORS
  app.use(cors({
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true
  }));

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server });
  wss.on('error', (err) => {
    logger.error('WebSocketServer Error:', err);
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

  // Serve uploaded files statically
  app.use('/uploads', express.static(uploadDir));

  // Setup API Routes
  setupRoutes(app, JWT_SECRET, JWT_PRIVATE_KEY!, JWT_PUBLIC_KEY!, saveFile, logError);

  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    // #region agent log
    agentDebugLog({ hypothesisId: 'H1', location: 'server.ts:startServer', message: 'vite_ready', data: { ok: true } });
    // #endregion
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
    server.close(() => {
      logger.info('Closed out remaining connections.');
      process.exit(0);
    });
    
    // Force shutdown after 10s
    setTimeout(() => {
      logger.error('Could not close connections in time, forcefully shutting down');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('uncaughtException', (err) => {
    // #region agent log
    agentDebugLog({ hypothesisId: 'H5', location: 'server.ts:uncaughtException', message: 'uncaught', data: { err: String((err as Error)?.message || err) } });
    // #endregion
    logger.error('UNCAUGHT EXCEPTION:', err);
    process.exit(1);
  });
  process.on('unhandledRejection', (reason, promise) => {
    logger.error('UNHANDLED REJECTION:', reason);
  });

  server.on('error', (err) => {
    logger.error('HTTP Server Error:', err);
    // #region agent log
    agentDebugLog({ hypothesisId: 'H2', location: 'server.ts:server.on(error)', message: 'listen_error', data: { code: (err as NodeJS.ErrnoException).code, message: String((err as Error).message) } });
    // #endregion
  });

  // #region agent log
  agentDebugLog({ hypothesisId: 'H2', location: 'server.ts:startServer', message: 'before_listen', data: { port: PORT } });
  // #endregion
  server.listen(PORT, "0.0.0.0", () => {
    // #region agent log
    agentDebugLog({ hypothesisId: 'H2', location: 'server.ts:listen', message: 'listening', data: { port: PORT } });
    // #endregion
    logger.info(`[SUCCESS] Server is live at http://0.0.0.0:${PORT}`);
    logger.info(`[INFO] Environment: ${process.env.NODE_ENV || 'development'}`);
    
    // Start DB migrations in background after server is listening
    runDbMigrations();
  });
}

// #region agent log
agentDebugLog({ hypothesisId: 'H0', location: 'server.ts:bootstrap', message: 'invoking_startServer', data: { cwd: process.cwd(), dirname: __dirname } });
// #endregion
startServer().catch(err => {
  // #region agent log
  agentDebugLog({ hypothesisId: 'H3', location: 'server.ts:startServer.catch', message: 'startServer_throw', data: { err: String((err as Error)?.message || err) } });
  // #endregion
  logger.error("Failed to start server:", err);
});
