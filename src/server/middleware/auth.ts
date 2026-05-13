import jwt from 'jsonwebtoken';
import { rateLimit } from 'express-rate-limit';

// Simple in-memory cache to reduce DB load
// In a distributed environment, use Redis. Since this often runs locally/embedded, memory is fine.
const cache = new Map<string, { data: any, expires: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Invalidate all cache entries for a specific user (call after role/permission/status changes)
export const invalidateUserCache = (userId: string) => {
  for (const key of cache.keys()) {
    if (key.includes(userId)) {
      cache.delete(key);
    }
  }
};

// Clear all permission cache entries (call after role permission changes)
export const clearPermissionCache = () => {
  for (const key of cache.keys()) {
    if (key.startsWith('perm_')) {
      cache.delete(key);
    }
  }
};

export const createAuthMiddlewares = (db: any, JWT_SECRET: string, JWT_PUBLIC_KEY: string) => {
  const getCachedOrDb = async (key: string, fetcher: () => Promise<any>) => {
    const cached = cache.get(key);
    if (cached && cached.expires > Date.now()) return cached.data;
    const data = await fetcher();
    cache.set(key, { data, expires: Date.now() + CACHE_TTL });
    return data;
  };

  const authenticate = async (req: any, res: any, next: any) => {
    let token = req.cookies.token;
    
    // Also check Authorization header
    if (!token && req.headers.authorization) {
      const parts = req.headers.authorization.split(' ');
      if (parts.length === 2 && parts[0] === 'Bearer') {
        token = parts[1];
      }
    }

    if (!token) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    
    try {
      const decodedToken = jwt.verify(token, JWT_PUBLIC_KEY, { algorithms: ['RS256'] }) as any;
      
      const user = await getCachedOrDb(`user_${decodedToken.id}_${decodedToken.session_version}`, async () => {
        return await db.prepare("SELECT id, role, status, username, name, email, session_version, requires_password_change FROM users WHERE id = ?").get(decodedToken.id) as any;
      });
      
      if (!user) {
        return res.status(401).json({ error: "User not found in database" });
      }

      if (user.status === 'Suspended' || user.status === 'Disabled' || user.status === 'Archived') {
        return res.status(403).json({ error: "Account suspended, disabled or archived" });
      }

      if (user.session_version !== decodedToken.session_version) {
        return res.status(401).json({ error: "Session invalidated" });
      }

      req.user = { 
        id: user.id, 
        role: user.role, 
        username: user.username, 
        name: user.name, 
        email: user.email,
        requires_password_change: !!user.requires_password_change 
      };

      // If password change is required, only allow access to auth routes (like password change)
      if (req.user.requires_password_change && !req.originalUrl.startsWith('/api/auth/password') && !req.originalUrl.startsWith('/api/auth/change-password') && !req.originalUrl.startsWith('/api/auth/session')) {
        return res.status(403).json({ 
          error: "Password change required", 
          code: "PASSWORD_CHANGE_REQUIRED" 
        });
      }

      next();
    } catch (err) {
      if (!(err instanceof jwt.TokenExpiredError) && !(err instanceof jwt.JsonWebTokenError)) {
        console.error("Auth error:", err);
      }
      res.status(401).json({ error: "Invalid token" });
    }
  };

  const checkPermission = (module: string, action: string) => {
    return async (req: any, res: any, next: any) => {
      const user = req.user;
      if (user.role === 'Admin') return next();

      const cacheKey = `perm_${user.id}_${module}_${action}`;
      const hasPermission = await getCachedOrDb(cacheKey, async () => {
        const queryResult = await db.prepare(`
          SELECT 1 FROM permissions p
          JOIN role_permissions rp ON p.id = rp.permission_id
          JOIN roles r ON rp.role_id = r.id
          JOIN users u ON r.name = u.role
          WHERE u.id = ? AND p.module = ? AND p.action = ?
          UNION
          SELECT 1 FROM permissions p
          JOIN user_permissions up ON p.id = up.permission_id
          WHERE up.user_id = ? AND p.module = ? AND p.action = ? AND up.is_allowed = 1
        `).get(user.id, module, action, user.id, module, action);
        return !!queryResult;
      });

      if (!hasPermission) {
        return res.status(403).json({ error: `Forbidden: Missing permission ${action} on ${module}` });
      }
      next();
    };
  };

  const authorize = (allowedRoles: string[]) => {
    return (req: any, res: any, next: any) => {
      if (!allowedRoles.includes(req.user.role)) {
        return res.status(403).json({ error: "Forbidden: Insufficient permissions" });
      }
      next();
    };
  };

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // Limit each IP+username combination to 10 login requests per windowMs
    message: { error: "TOO_MANY_ATTEMPTS" },
    standardHeaders: true,
    legacyHeaders: false,
    validate: { keyGeneratorIpFallback: false },
    // Key by IP + username so that blocking one user doesn't affect others
    keyGenerator: (req: any) => {
      const username = (req.body && req.body.usernameOrEmail) ? String(req.body.usernameOrEmail).toLowerCase() : 'unknown';
      return `${req.ip || 'no-ip'}_${username}`;
    },
  });

  return { authenticate, checkPermission, authorize, authLimiter, cache };
};
