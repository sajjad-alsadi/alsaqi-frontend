import express from 'express';
import { z } from 'zod';
import { AuthService } from '../../services/AuthService';
import { asyncHandler } from '../../utils/asyncHandler';
import { validateSchema } from '../../middleware/validate';

const loginSchema = z.object({
  usernameOrEmail: z.string().min(1, "Username or Email is required").max(100),
  password: z.string().min(1, "Password is required").max(100),
  rememberMe: z.boolean().optional(),
});

export const createLoginRoutes = (
  db: any,
  JWT_SECRET: string,
  JWT_PRIVATE_KEY: string,
  authLimiter: any,
  logError: any
) => {
  const router = express.Router();

  router.post("/login", authLimiter, validateSchema(loginSchema), asyncHandler(async (req, res) => {
    const { usernameOrEmail, password, rememberMe } = req.body; 

    const result = await AuthService.login(usernameOrEmail, password, JWT_SECRET, JWT_PRIVATE_KEY, req.ip, req.get('user-agent'), rememberMe);

    // Always use sameSite: 'none' and secure: true to support AI Studio iframe preview
    // Note: sameSite: 'none' requires secure: true
    const cookieOptions: any = { 
      httpOnly: true, 
      secure: true, 
      sameSite: 'none', 
      path: '/' 
    };

    res.cookie('token', result.token, {
      ...cookieOptions,
      maxAge: 15 * 60 * 1000 // 15 minutes
    });
    
    // Refresh Token: Cookie-Only Storage
    res.cookie('refreshToken', result.refreshToken, {
      httpOnly: true,
      secure: true, 
      sameSite: 'none', 
      path: '/api/auth/refresh', // Restrict cookie path
      maxAge: rememberMe ? 30 * 24 * 60 * 60 * 1000 : 8 * 60 * 60 * 1000 // 30 days or 8 hours in ms
    });

    await AuthService.logAudit(result.user.username, "Login", "Authentication", "User logged in");

    // Return ONLY the access token in the response body:
    res.json({ user: result.user, token: result.token });
  }));

  return router;
};
