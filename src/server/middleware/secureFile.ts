import { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import { SecureFileOptions } from '../types/middleware';
import db from '../db/index';
import logger from '../utils/logger';
import { SecureFileService } from '../services/SecureFileService';

/**
 * Maps file path segments to permission module names.
 * Files are stored flat in /uploads/, so we use a general 'Audit' module
 * for permission checking. In the future, if files are organized by module
 * subdirectories, this mapping can be extended.
 */
const FILE_MODULE = 'Audit';
const FILE_PERMISSION_ACTION = 'View';

/**
 * Logs a file access attempt to the file_access_logs table.
 * On failure, writes to stderr and continues without affecting the response.
 */
async function logFileAccess(
  userId: string,
  filePath: string,
  accessType: 'view' | 'download',
  result: 'granted' | 'denied',
  ipAddress: string
): Promise<void> {
  try {
    await db.prepare(
      `INSERT INTO file_access_logs (user_id, file_path, access_type, result, ip_address)
       VALUES (?, ?, ?, ?, ?)`
    ).run(userId, filePath, accessType, result, ipAddress);
  } catch (err) {
    process.stderr.write(
      `[SecureFile] Failed to log file access: ${err instanceof Error ? err.message : String(err)}\n` +
      `  userId=${userId}, filePath=${filePath}, result=${result}\n`
    );
  }
}

/**
 * Checks if a user has module-level permission to access files.
 * Admins are always allowed. Other users need the View permission on the file module.
 */
async function hasFilePermission(userId: string, userRole: string): Promise<boolean> {
  // Admins always have access
  if (userRole === 'Admin') return true;

  try {
    const result = await db.prepare(`
      SELECT 1 FROM permissions p
      JOIN role_permissions rp ON p.id = rp.permission_id
      JOIN users u ON rp.role_id = u.role_id
      WHERE u.id = ? AND p.module = ? AND p.action = ?
      UNION
      SELECT 1 FROM permissions p
      JOIN user_permissions up ON p.id = up.permission_id
      WHERE up.user_id = ? AND p.module = ? AND p.action = ? AND up.is_allowed = 1
    `).get(userId, FILE_MODULE, FILE_PERMISSION_ACTION, userId, FILE_MODULE, FILE_PERMISSION_ACTION);
    return !!result;
  } catch (err) {
    logger.error('Error checking file permission', { userId, error: err });
    return false;
  }
}

/**
 * Creates a secure file access middleware that replaces express.static for /uploads.
 *
 * Features:
 * - Requires valid authentication token (401 if missing/invalid)
 * - Checks module-level permission (403 if unauthorized)
 * - Logs every access attempt (granted/denied) to file_access_logs table
 * - Serves the file if authorized using res.sendFile
 * - Supports signed URLs (handled externally in task 13.2 - for now, just checks auth token)
 *
 * Requirements: 12.1, 12.2, 12.3, 12.4
 */
export function createSecureFileMiddleware(
  authenticate: (req: any, res: any, next: any) => void,
  uploadDir: string,
  options: SecureFileOptions = {}
) {
  const {
    requireAuth = true,
    checkPermission = true,
    auditAccess = true,
  } = options;

  return (req: Request, res: Response, next: NextFunction) => {
    const filePath = req.path; // e.g., /filename.ext (relative to /uploads mount)
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';

    // Step 0: Check for signed URL (allows unauthenticated access with valid signature)
    const { expires, userId: sigUserId, sig } = req.query as {
      expires?: string;
      userId?: string;
      sig?: string;
    };

    if (expires && sigUserId && sig) {
      const expiresNum = parseInt(expires, 10);
      if (!isNaN(expiresNum)) {
        const result = SecureFileService.verifySignedUrl(filePath, sigUserId, expiresNum, sig);

        if (result.valid) {
          // Valid signed URL - log access and serve file without auth
          if (auditAccess) {
            logFileAccess(sigUserId, filePath, 'view', 'granted', ip);
          }
          serveFile(req, res, uploadDir, filePath);
          return;
        }

        // Expired signed URL - return 401 indicating expiration
        if (result.expired) {
          if (auditAccess) {
            logFileAccess(sigUserId || 'anonymous', filePath, 'view', 'denied', ip);
          }
          return res.status(401).json({ error: 'Signed URL has expired' });
        }

        // Invalid signature - fall through to normal auth flow
      }
    }

    // Step 1: Authenticate the user
    if (requireAuth) {
      // Override res.json to intercept auth failure responses and log them
      const originalJson = res.json.bind(res);
      let authIntercepted = false;

      res.json = ((data: any) => {
        // If authenticate sends a 401/403 before our callback runs, log the denial
        if (!authIntercepted && res.statusCode >= 400 && auditAccess) {
          authIntercepted = true;
          logFileAccess('anonymous', filePath, 'view', 'denied', ip);
        }
        return originalJson(data);
      }) as any;

      authenticate(req, res, async (authErr?: any) => {
        // Restore original json
        res.json = originalJson;
        authIntercepted = true;

        if (authErr) {
          // Authentication error passed to next - log and return 401
          if (auditAccess) {
            await logFileAccess('anonymous', filePath, 'view', 'denied', ip);
          }
          return res.status(401).json({ error: 'Unauthorized' });
        }

        // If authenticate called next() without setting req.user, auth failed silently
        if (!(req as any).user) {
          if (auditAccess) {
            await logFileAccess('anonymous', filePath, 'view', 'denied', ip);
          }
          return res.status(401).json({ error: 'Unauthorized' });
        }

        const user = (req as any).user;

        // Step 2: Check module-level permission
        if (checkPermission) {
          const permitted = await hasFilePermission(user.id, user.role);
          if (!permitted) {
            if (auditAccess) {
              await logFileAccess(user.id, filePath, 'view', 'denied', ip);
            }
            return res.status(403).json({ error: 'Forbidden' });
          }
        }

        // Step 3: Log successful access
        if (auditAccess) {
          await logFileAccess(user.id, filePath, 'view', 'granted', ip);
        }

        // Step 4: Serve the file
        serveFile(req, res, uploadDir, filePath);
      });
    } else {
      // No auth required - just serve the file (for signed URL support in task 13.2)
      serveFile(req, res, uploadDir, filePath);
    }
  };
}

/**
 * Serves a file from the upload directory with security checks on the path.
 */
function serveFile(req: Request, res: Response, uploadDir: string, filePath: string): void {
  // Prevent path traversal attacks
  const normalizedPath = path.normalize(filePath).replace(/^(\.\.(\/|\\|$))+/, '');
  const fullPath = path.join(uploadDir, normalizedPath);

  // Ensure the resolved path is within the upload directory
  const resolvedUploadDir = path.resolve(uploadDir);
  const resolvedFilePath = path.resolve(fullPath);

  if (!resolvedFilePath.startsWith(resolvedUploadDir)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  // Check if file exists
  if (!fs.existsSync(resolvedFilePath) || !fs.statSync(resolvedFilePath).isFile()) {
    return res.status(404).json({ error: 'File not found' });
  }

  // Send the file
  res.sendFile(resolvedFilePath);
}
