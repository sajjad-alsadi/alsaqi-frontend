import express from 'express';
import { AuditTaskService } from '../services/AuditTaskService';
import { NotificationService } from '../services/NotificationService';
import { asyncHandler } from '../utils/asyncHandler';
import { methodNotAllowed } from '../utils/routeRegistry';

export const createAuditTaskRoutes = (
  db: any,
  authenticate: any,
  logError: any
) => {
  const router = express.Router();

  // Custom route for status transitions
  router.patch('/:id/status', authenticate, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    
    const typedReq = req as any;
    const userId = typedReq.user.id;
    const userRole = typedReq.user.role;

    try {
      await AuditTaskService.changeStatus(String(id), status, userId, userRole, db);

      // Notify assigned user about status change
      try {
        const task = await db.prepare("SELECT title, assigned_to, created_by FROM audit_tasks WHERE id = ?::uuid").get(id) as any;
        if (task) {
          const recipients: string[] = [];
          if (task.assigned_to && task.assigned_to !== userId) recipients.push(task.assigned_to);
          if (task.created_by && task.created_by !== userId && task.created_by !== task.assigned_to) recipients.push(task.created_by);
          
          if (recipients.length > 0) {
            await NotificationService.create(
              recipients,
              'task_status_changed',
              JSON.stringify({ key: 'notifications.taskStatusChanged', params: { title: task.title, status: status } }),
              'AuditTasks',
              '/tasks',
              {
                actorId: userId,
                entityId: id,
                entityType: 'audit_task',
                title: JSON.stringify({ key: 'notifications.taskStatusChanged' }),
                wss: (req.app as any).wss,
                data: { new_status: status }
              }
            );
          }
        }
      } catch (e) {
        console.error("[AuditTasks] Notification failed:", e);
      }

      res.json({ success: true, message: 'Status updated successfully' });
    } catch (err: any) {
      logError(err, 'PATCH', req.originalUrl, req.ip, userId);
      res.status(400).json({ success: false, error: { message: err.message, code: err.code || 'BAD_REQUEST' } });
    }
  }));

  router.get('/', authenticate, asyncHandler(async (req, res) => {
    const tasks = await AuditTaskService.getTasks(req.query);
    res.json(tasks);
  }));

  // 405 Method Not Allowed for methods not implemented on this custom route
  // This route supports GET (list) and PATCH (status change) only
  router.all('/', methodNotAllowed(['GET']));
  router.all('/:id', methodNotAllowed(['PATCH']));

  return router;
};
