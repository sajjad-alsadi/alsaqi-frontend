import { ADMIN_ROLES } from '../../constants';
import express from 'express';
import { z } from 'zod';
import { UserService } from '../services/UserService';
import { AuthService } from '../services/AuthService';
import { asyncHandler } from '../utils/asyncHandler';
import { ValidationError, NotFoundError } from '../utils/errors';
import { validateSchema } from '../middleware/validate';

const userSchema = z.object({
  username: z.string().min(3).max(50).optional(),
  password: z.string().min(6).max(100).optional(),
  name: z.string().min(1).max(100),
  email: z.string().email(),
  department: z.string().optional().nullable(),
  job_title_id: z.string().optional().nullable(),
  role: z.string().min(1),
  unit: z.string().optional().nullable(),
  reporting_manager_id: z.string().optional().nullable(),
  access_scope: z.string().optional().nullable(),
  phone_number: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  status: z.string().optional()
});

export const createUserRoutes = (
  db: any,
  authenticate: any,
  authorize: any,
  logError: any
) => {
  const router = express.Router();

  router.get(`/init`, authenticate, authorize(ADMIN_ROLES), asyncHandler(async (req, res) => {
    const data = await UserService.getInitData();
    res.json(data);
  }));

  router.get(`/`, authenticate, authorize(ADMIN_ROLES), asyncHandler(async (req, res) => {
    const result = await UserService.getUsers(req.query);
    res.json(result);
  }));

  router.get(`/summary`, authenticate, authorize(ADMIN_ROLES), asyncHandler(async (req, res) => {
    const summary = await UserService.getUserSummary();
    res.json(summary);
  }));

  router.get(`/list`, authenticate, asyncHandler(async (req, res) => {
    const data = await UserService.getActiveUsers();
    res.json(data);
  }));

  router.get(`/:id`, authenticate, authorize(ADMIN_ROLES), asyncHandler(async (req, res) => {
    const id = req.params.id as string;
    const user = await UserService.getUserById(id);
    if (!user) throw new NotFoundError("User not found");
    res.json(user);
  }));

  router.post(`/`, authenticate, authorize(ADMIN_ROLES), validateSchema(userSchema), asyncHandler(async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
      throw new ValidationError("Username and password are required for new users");
    }

    const user = await UserService.createUser(req.body);
    
    await AuthService.logAudit((req as any).user.username, "Created User", "User Management", `Created user ${user.username} with role ${user.role}`);
      
    res.json(user);
  }));

  router.put(`/:id`, authenticate, authorize(ADMIN_ROLES), validateSchema(userSchema), asyncHandler(async (req, res) => {
    const id = req.params.id as string;
    
    const { oldUser } = await UserService.updateUser(id, req.body);
    const { role, status, access_scope } = req.body;
    
    // Log critical changes
    if (oldUser.role !== role || oldUser.status !== status || oldUser.access_scope !== access_scope) {
      await UserService.logPermissionChange(id, (req as any).user.id, oldUser.role, role || oldUser.role, "Profile update");
    }

    await AuthService.logAudit((req as any).user.username, "Updated User", "User Management", `Updated user ID ${id}`);
      
    res.json({ success: true });
  }));

  router.post(`/:id/suspend`, authenticate, authorize(ADMIN_ROLES), asyncHandler(async (req, res) => {
    const id = req.params.id as string;
    const currentStatus = await UserService.getStatus(id);
    const newStatus = currentStatus === 'Suspended' ? 'Active' : 'Suspended';
    const username = await UserService.setStatus(id, newStatus);
    
    await AuthService.logAudit((req as any).user.username, `${newStatus === 'Suspended' ? 'Suspended' : 'Activated'} User`, "User Management", `Changed status for user ${username} to ${newStatus}`);
      
    res.json({ success: true, status: newStatus });
  }));

  router.post(`/:id/archive`, authenticate, authorize(ADMIN_ROLES), asyncHandler(async (req, res) => {
    const id = req.params.id as string;
    const username = await UserService.setStatus(id, 'Archived');
    await AuthService.logAudit((req as any).user.username, "Archive", "User Management", `Archived user: ${username}`);
    res.json({ success: true });
  }));

  router.post(`/:id/activate`, authenticate, authorize(ADMIN_ROLES), asyncHandler(async (req, res) => {
    const id = req.params.id as string;
    const username = await UserService.activateUser(id);
    await AuthService.logAudit((req as any).user.username, "Activate", "User Management", `Activated user: ${username}`);
    res.json({ success: true });
  }));

  router.delete(`/:id`, authenticate, authorize(ADMIN_ROLES), asyncHandler(async (req, res) => {
    const id = req.params.id as string;
    const username = await UserService.deleteUser(id);
    await AuthService.logAudit((req as any).user.username, "Deleted User", "User Management", `Deleted user ${username}`);
    res.json({ success: true });
  }));

  router.post(`/:id/unlock`, authenticate, authorize(ADMIN_ROLES), asyncHandler(async (req, res) => {
    const id = req.params.id as string;
    const username = await UserService.unlockUser(id);
    await AuthService.logAudit((req as any).user.username, "Unlocked User", "User Management", `Unlocked user ${username} and reset failed attempts`);
    res.json({ success: true });
  }));

  const resetPasswordSchema = z.object({
    newPassword: z.string().min(6).max(100)
  });

  router.post(`/:id/reset-password`, authenticate, authorize(ADMIN_ROLES), asyncHandler(async (req, res) => {
    const id = req.params.id as string;
    const validation = resetPasswordSchema.safeParse(req.body);
    if (!validation.success) {
      throw new ValidationError("Invalid password data", validation.error.format());
    }
    const { newPassword } = validation.data;
    const username = await UserService.resetPassword(id, newPassword);
    
    await AuthService.logAudit((req as any).user.username, "Reset Password", "User Management", `Reset password for user ${username}`);
      
    res.json({ success: true });
  }));

  return router;
};
