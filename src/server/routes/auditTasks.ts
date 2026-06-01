import express from 'express';
import { AuditTaskService } from '../services/AuditTaskService';
import { NotificationService } from '../services/NotificationService';
import { asyncHandler } from '../utils/asyncHandler';
import { methodNotAllowed } from '../utils/routeRegistry';
import { UserRole } from '../../constants';

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

  // POST /api/v1/audit-tasks/:id/assign - Assign users to a task
  // Requirements: 4.1, 4.3, 4.5
  router.post('/:id/assign', authenticate, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { userIds } = req.body;

    const typedReq = req as any;
    const userId = typedReq.user.id;
    const userRole = typedReq.user.role;

    // Role validation: only Manager or Admin can assign users
    const allowedRoles = [UserRole.MANAGER, UserRole.ADMIN];
    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({
        success: false,
        error: {
          message: 'لا تملك صلاحية تعيين مستخدمين للمهام. يجب أن يكون دورك مدير أو مسؤول',
          code: 'FORBIDDEN'
        }
      });
    }

    try {
      const result = await AuditTaskService.assignUsers(String(id), userIds, userId);

      // Send notification to each assigned user (Requirement 4.3: within 60 seconds)
      try {
        const task = await db.prepare("SELECT title, task_number FROM audit_tasks WHERE id = ?::uuid").get(id) as any;
        if (task && result.assignments.length > 0) {
          const assignedUserIds = result.assignments.map((a: any) => a.user_id);

          await NotificationService.create(
            assignedUserIds,
            'task_assigned',
            JSON.stringify({ key: 'notifications.taskAssigned', params: { title: task.title, taskNumber: task.task_number } }),
            'AuditTasks',
            '/tasks',
            {
              actorId: userId,
              entityId: id,
              entityType: 'audit_task',
              title: JSON.stringify({ key: 'notifications.taskAssigned' }),
              wss: (req.app as any).wss,
              data: { task_id: id, task_number: task.task_number }
            }
          );
        }
      } catch (e) {
        console.error("[AuditTasks] Assignment notification failed:", e);
      }

      res.status(201).json({ success: true, data: result });
    } catch (err: any) {
      logError(err, 'POST', req.originalUrl, req.ip, userId);
      const statusCode = err.statusCode || 400;
      res.status(statusCode).json({
        success: false,
        error: { message: err.message, code: err.errorCode || 'BAD_REQUEST', details: err.details }
      });
    }
  }));

  // DELETE /api/v1/audit-tasks/:id/assign/:userId - Unassign a user from a task
  // Requirements: 4.4, 4.5
  router.delete('/:id/assign/:userId', authenticate, asyncHandler(async (req, res) => {
    const { id, userId: targetUserId } = req.params;

    const typedReq = req as any;
    const currentUserId = typedReq.user.id;
    const userRole = typedReq.user.role;

    // Role validation: only Manager or Admin can unassign users
    const allowedRoles = [UserRole.MANAGER, UserRole.ADMIN];
    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({
        success: false,
        error: {
          message: 'لا تملك صلاحية إزالة تعيين المستخدمين من المهام. يجب أن يكون دورك مدير أو مسؤول',
          code: 'FORBIDDEN'
        }
      });
    }

    try {
      const result = await AuditTaskService.unassignUser(String(id), String(targetUserId), currentUserId);
      res.json({ success: true, data: result });
    } catch (err: any) {
      logError(err, 'DELETE', req.originalUrl, req.ip, currentUserId);
      const statusCode = err.statusCode || 400;
      res.status(statusCode).json({
        success: false,
        error: { message: err.message, code: err.errorCode || 'BAD_REQUEST' }
      });
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
