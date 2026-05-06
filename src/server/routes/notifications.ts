import express from 'express';
import { NotificationService } from '../services/NotificationService';
import { asyncHandler } from '../utils/asyncHandler';

export const createNotificationRoutes = (db: any, authenticate: any) => {
  const router = express.Router();

  router.get("/", authenticate, asyncHandler(async (req, res) => {
    const data = await NotificationService.getNotifications((req as any).user.id);
    res.json(data);
  }));

  router.get("/unread-count", authenticate, asyncHandler(async (req, res) => {
    const count = await NotificationService.getUnreadCount((req as any).user.id);
    res.json(count);
  }));

  router.put("/:id/read", authenticate, asyncHandler(async (req, res) => {
    await NotificationService.markAsRead(req.params.id as string, (req as any).user.id);
    res.json({ success: true });
  }));

  router.put("/mark-all-read", authenticate, asyncHandler(async (req, res) => {
    await NotificationService.markAllRead((req as any).user.id);
    res.json({ success: true });
  }));

  router.delete("/:id", authenticate, asyncHandler(async (req, res) => {
    await NotificationService.delete(req.params.id as string, (req as any).user.id);
    res.json({ success: true });
  }));

  return router;
};
