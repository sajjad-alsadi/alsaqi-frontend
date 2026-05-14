import express from 'express';
import { SessionService } from '../../services/SessionService';
import { AuthService } from '../../services/AuthService';
import { asyncHandler } from '../../utils/asyncHandler';
import { AuthError } from '../../utils/errors';

export const createSessionRoutes = (
  db: any,
  JWT_SECRET: string,
  JWT_PRIVATE_KEY: string,
  authenticate: any,
  logError: any
) => {
  const router = express.Router();

  // Current User
  router.get("/me", authenticate, asyncHandler(async (req, res) => {
    const user = (req as any).user;
    
    // Fetch permissions from DB for the current user
    let permissions: Array<{ module: string; action: string }> = [];
    try {
      permissions = await db.prepare(`
        SELECT p.module, p.action FROM permissions p
        JOIN role_permissions rp ON p.id = rp.permission_id
        WHERE rp.role_id = (SELECT role_id FROM users WHERE id = ?)
        UNION
        SELECT p.module, p.action FROM permissions p
        JOIN user_permissions up ON p.id = up.permission_id
        WHERE up.user_id = ? AND up.is_allowed = 1
      `).all(user.id, user.id) as Array<{ module: string; action: string }>;
    } catch (e) {
      console.error("[Session] Failed to fetch permissions:", e);
    }

    res.json({ user: { ...user, permissions } });
  }));

  // Refresh Token
  router.post("/refresh", asyncHandler(async (req, res) => {
    const refreshToken = req.cookies.refreshToken;
    
    if (!refreshToken) {
      // If no refresh token is present, just return 401 without throwing (to avoid noisy logs)
      return res.status(401).json({ 
        success: false, 
        error: { code: 'UNAUTHORIZED', message: "No refresh token" } 
      });
    }

    try {
      const result = await SessionService.refresh(refreshToken, JWT_SECRET, JWT_PRIVATE_KEY);

      // Always use sameSite: 'none' and secure: true to support AI Studio iframe preview
      const cookieOptions: any = {
        httpOnly: true,
        secure: true,
        sameSite: 'none',
        path: '/'
      };

      // Refresh Token: Cookie-Only Storage
      res.cookie('refreshToken', result.refreshToken, {
        httpOnly: true,
        secure: true,
        sameSite: 'none',
        path: '/api/auth/refresh', // Restrict cookie path
        maxAge: result.rememberMe ? 30 * 24 * 60 * 60 * 1000 : 8 * 60 * 60 * 1000 // 30 days or 8 hours in ms
      });

      res.cookie('token', result.token, {
        ...cookieOptions,
        maxAge: 15 * 60 * 1000 // 15 minutes
      });

      await AuthService.logAudit(result.user.username, "Refresh Token", "Auth", "Token refreshed successfully");

      res.json({ success: true });
    } catch (error) {
      // Clear cookies with same options
      const clearOptions: any = { httpOnly: true, secure: true, sameSite: 'none', path: '/' };
      const refreshClearOptions: any = { ...clearOptions, path: '/api/auth/refresh' };
      res.clearCookie('refreshToken', refreshClearOptions);
      res.clearCookie('token', clearOptions);
      throw error;
    }
  }));

  // Logout
  router.post("/logout", asyncHandler(async (req, res) => {
    const refreshToken = req.cookies.refreshToken;
    const username = await SessionService.logout(refreshToken);
    
    if (username) {
      await AuthService.logAudit(username, "Logout", "Auth", "User logged out");
    }

    // Clear cookies with same options
    const clearOptions: any = { httpOnly: true, secure: true, sameSite: 'none', path: '/' };
    const refreshClearOptions: any = { ...clearOptions, path: '/api/auth/refresh' };
    res.clearCookie('refreshToken', refreshClearOptions);
    res.clearCookie('token', clearOptions);
    res.json({ success: true });
  }));

  // Logout All
  router.post("/logout-all", authenticate, asyncHandler(async (req, res) => {
    const userId = (req as any).user.id;
    await SessionService.logoutAll(userId);
    
    await AuthService.logAudit((req as any).user.username, "Logout All", "Settings", "User invalidated all active sessions");

    res.json({ success: true });
  }));

  return router;
};
