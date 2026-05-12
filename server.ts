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
import jwt from "jsonwebtoken";
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
  logger.error("FATAL: JWT_SECRET must be set to a secure value in production. Exiting.");
  process.exit(1);
}

const JWT_SECRET = process.env.JWT_SECRET || 'alsaqi-dev-secret-key-123';
let JWT_PRIVATE_KEY = process.env.JWT_PRIVATE_KEY?.replace(/\\n/g, '\n').replace(/\\r/g, '').replace(/^["']|["']$/g, '').trim();
let JWT_PUBLIC_KEY = process.env.JWT_PUBLIC_KEY?.replace(/\\n/g, '\n').replace(/\\r/g, '').replace(/^["']|["']$/g, '').trim();

if (!JWT_PRIVATE_KEY || !JWT_PUBLIC_KEY || !JWT_PRIVATE_KEY.includes('-----BEGIN') || !JWT_PUBLIC_KEY.includes('-----BEGIN')) {
  
  const persistentDir = getPersistentDataDir();
  const keysPath = path.join(persistentDir, '.rsa_keys.enc');

  // Derive encryption key from JWT_SECRET for at-rest protection
  const deriveEncKey = () => crypto.createHash('sha256').update(JWT_SECRET + '_rsa_enc').digest();

  const encryptKeys = (data: string): string => {
    const key = deriveEncKey();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    let encrypted = cipher.update(data, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    const tag = cipher.getAuthTag();
    return JSON.stringify({ iv: iv.toString('base64'), tag: tag.toString('base64'), data: encrypted });
  };

  const decryptKeys = (encStr: string): string => {
    const key = deriveEncKey();
    const { iv, tag, data } = JSON.parse(encStr);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    let decrypted = decipher.update(data, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  };

  // Try loading encrypted keys
  if (fs.existsSync(keysPath)) {
    try {
      const encContent = fs.readFileSync(keysPath, 'utf8');
      const decrypted = decryptKeys(encContent);
      const storedKeys = JSON.parse(decrypted);
      JWT_PRIVATE_KEY = storedKeys.privateKey;
      JWT_PUBLIC_KEY = storedKeys.publicKey;
      logger.info("Loaded persisted RSA JWT keys from encrypted storage.");
    } catch (e) {
      logger.error("Failed to decrypt persisted RSA keys. Regenerating...");
    }
  }

  // Migrate from old plaintext format if exists
  const legacyPath = path.join(persistentDir, '.rsa_keys.json');
  if ((!JWT_PRIVATE_KEY || !JWT_PUBLIC_KEY || !JWT_PRIVATE_KEY.includes('-----BEGIN')) && fs.existsSync(legacyPath)) {
    try {
      const storedKeys = JSON.parse(fs.readFileSync(legacyPath, 'utf8'));
      JWT_PRIVATE_KEY = storedKeys.privateKey;
      JWT_PUBLIC_KEY = storedKeys.publicKey;
      // Re-save encrypted and remove legacy
      fs.writeFileSync(keysPath, encryptKeys(JSON.stringify(storedKeys)));
      fs.unlinkSync(legacyPath);
      logger.info("Migrated RSA keys from plaintext to encrypted storage.");
    } catch (e) {
      logger.error("Failed to migrate legacy RSA keys.");
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
      fs.writeFileSync(keysPath, encryptKeys(JSON.stringify({ privateKey, publicKey })));
      logger.info("Persisted newly generated RSA keys (encrypted) to disk.");
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
      logger.info("[SUCCESS] Database initialized and seeded successfully.");
      
      // Start automation jobs after DB is ready
      startAutomationJobs();
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
  
  // Security Headers
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (process.env.NODE_ENV === 'production') {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
  });

  // Enable CORS
  const corsOrigin = process.env.CORS_ORIGIN;
  app.use(cors({
    origin: corsOrigin ? corsOrigin.split(',').map(o => o.trim()) : (process.env.NODE_ENV === 'production' ? false : true),
    credentials: true
  }));

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server });
  
  // WebSocket Connection Handler
  // Supports authenticated (message-based) and unauthenticated (notification-only) modes
  wss.on('connection', (ws, req) => {
    (ws as any).authenticated = false;

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'auth' && msg.token) {
          const decoded = jwt.verify(msg.token, JWT_PUBLIC_KEY!, { algorithms: ['RS256'] }) as any;
          (ws as any).userId = decoded.id;
          (ws as any).username = decoded.username;
          (ws as any).authenticated = true;
          ws.send(JSON.stringify({ type: 'auth_ok' }));
        }
      } catch (err) {
        // Auth failed — connection stays in unauthenticated mode (receives broadcasts only)
      }
    });
  });
  
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
