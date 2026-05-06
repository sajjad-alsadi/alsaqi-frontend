import { db } from '../db/index';
import { NotFoundError, ValidationError, ForbiddenError } from '../utils/errors';
import { N8nService } from '../utils/n8nService';

const ALLOWED_TRANSITIONS: Record<string, Record<string, { roles: string[] }>> = {
  'draft': {
    'in_progress': { roles: ['Auditor', 'Internal Auditor', 'Manager'] }
  },
  'in_progress': {
    'review': { roles: ['Auditor', 'Internal Auditor'] }
  },
  'review': {
    'approved': { roles: ['Manager'] },
    'in_progress': { roles: ['Manager'] }
  },
  'approved': {
    'completed': { roles: ['Manager'] }
  }
};

export class AuditTaskService {
  static async changeStatus(taskId: string, newStatus: string, userId: string, userRole: string, _db: any) {
    const database = _db || db;
    const task = await database.prepare('SELECT id, title, task_number, status, plan_id FROM audit_tasks WHERE id = ?').get(taskId) as any;
    
    if (!task) throw new NotFoundError('IAMS-NOT-001');
    
    const allowed = ALLOWED_TRANSITIONS[task.status.toLowerCase()]?.[newStatus.toLowerCase()];
    if (!allowed) throw new ValidationError('Invalid status transition');
    
    if (!allowed.roles.includes(userRole)) {
      throw new ForbiddenError('IAMS-PERM-001');
    }

    // in_progress -> review: block on open critical/high findings
    if (newStatus === 'review') {
      const blocking = await database.prepare(`
        SELECT id FROM audit_findings 
        WHERE audit_id = ? AND status = 'open' 
        AND risk_level IN ('Critical', 'High')
      `).all(task.plan_id);
      
      if (blocking.length > 0)
        throw new ValidationError('Open critical/high findings block this transition');
    }

    // review -> approved: block if any recommendation lacks an action plan
    if (newStatus === 'approved') {
      const incomplete = await database.prepare(`
        SELECT r.id FROM recommendations r
        JOIN audit_findings f ON r.finding_id = f.id
        WHERE f.audit_id = ? 
        AND (r.action_plan IS NULL OR r.action_plan = '' OR r.due_date IS NULL)
      `).all(task.plan_id);
      
      if (incomplete.length > 0)
        throw new ValidationError('All recommendations must have an action plan and due date');
    }

    const result = await database.prepare(
      'UPDATE audit_tasks SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).run(newStatus, taskId);

    // --- AUTOMATION: Send event to n8n ---
    await N8nService.sendEvent('audit_task.status_changed', {
      taskId: taskId,
      taskNumber: task.task_number,
      title: task.title,
      oldStatus: task.status,
      newStatus: newStatus,
      changedByUserId: userId
    }).catch(e => console.error("n8n send error", e));

    return result;
  }

  static async getTasks(params: any = {}) {
    let query = `
      SELECT t.id, t.title, t.task_number, t.status, t.due_date, t.assigned_to, t.priority,
             p.title as plan_title, u.name as assigned_name, e.name_en as audited_unit_name
      FROM audit_tasks t
      LEFT JOIN audit_plans p ON t.plan_id = p.id
      LEFT JOIN users u ON t.assigned_to = u.id
      LEFT JOIN org_entities e ON t.audited_unit_id = e.id
    `;
    const args: any[] = [];

    if (params.plan_id) {
      query += " WHERE t.plan_id = ?";
      args.push(params.plan_id);
    }

    return await db.prepare(query).all(...args);
  }
}
