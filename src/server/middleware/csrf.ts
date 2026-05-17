import crypto from 'crypto';
import type { Request, Response, NextFunction, RequestHandler } from 'express';

export interface CsrfOptions {
  exemptPaths: string[];       // e.g., ['/api/auth/login', '/health']
  tokenHeader: string;         // 'x-csrf-token'
  cookieName: string;          // 'csrf-token'
  tokenByteLength: number;     // 32
}

/**
 * Generates a cryptographically random CSRF token.
 * Uses crypto.randomBytes with the specified byte length (default 32 bytes = 64 hex chars).
 */
export function generateCsrfToken(byteLength: number = 32): string {
  return crypto.randomBytes(byteLength).toString('hex');
}

/**
 * Attaches a CSRF token to the response via both a non-httpOnly cookie
 * and a response header, allowing the client to read and send it back.
 */
export function attachCsrfToken(res: Response, token: string): void {
  // Set as a non-httpOnly cookie so client-side JS can read it
  res.cookie('csrf-token', token, {
    httpOnly: false,
    sameSite: 'strict',
    path: '/',
  });

  // Also set as a response header for convenience
  res.setHeader('x-csrf-token', token);
}

/**
 * Express middleware that validates CSRF tokens on state-changing requests.
 * 
 * - Skips GET, HEAD, OPTIONS requests (read-only methods)
 * - Skips exempt paths (e.g., login, health)
 * - Reads token from the x-csrf-token request header
 * - Compares against the csrf-token cookie value using timing-safe comparison
 * - Returns 403 if the token is missing or invalid
 */
export function csrfMiddleware(options: CsrfOptions): RequestHandler {
  const { exemptPaths, tokenHeader, cookieName } = options;

  return (req: Request, res: Response, next: NextFunction): void => {
    // Skip non-state-changing methods
    const method = req.method.toUpperCase();
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
      next();
      return;
    }

    // Skip exempt paths
    const requestPath = req.path;
    if (exemptPaths.some(path => requestPath === path || requestPath.startsWith(path + '/'))) {
      next();
      return;
    }

    // Read token from request header
    const headerToken = req.headers[tokenHeader.toLowerCase()] as string | undefined;

    // Read expected token from cookie
    const cookieToken = req.cookies?.[cookieName] as string | undefined;

    // Both must be present
    if (!headerToken || !cookieToken) {
      res.status(403).json({ error: 'CSRF token missing' });
      return;
    }

    // Compare using timing-safe comparison to prevent timing attacks
    if (!timingSafeCompare(headerToken, cookieToken)) {
      res.status(403).json({ error: 'CSRF token invalid' });
      return;
    }

    next();
  };
}

/**
 * Performs a timing-safe string comparison using crypto.timingSafeEqual.
 * Returns false if strings have different lengths (without leaking length info
 * beyond the boolean result).
 */
function timingSafeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  const bufA = Buffer.from(a, 'utf-8');
  const bufB = Buffer.from(b, 'utf-8');

  return crypto.timingSafeEqual(bufA, bufB);
}
