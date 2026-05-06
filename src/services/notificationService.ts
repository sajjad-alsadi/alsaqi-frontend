import cron from 'node-cron';
import { db } from '../server/db/index';

export const createNotification = async (userId: number | 'all', eventType: string, description: string, relatedModule: string, link: string = '') => {
  try {
    if (userId === 'all') {
      const users = await db.prepare("SELECT id FROM users").all() as { id: number }[];
      const stmt = db.prepare(`INSERT INTO notifications (user_id, event_type, description, related_module, link) VALUES (?, ?, ?, ?, ?)`);
      const transaction = db.transaction(async (usersList: any[]) => {
        for (const user of usersList) {
          await stmt.run(user.id, eventType, description, relatedModule, link);
        }
      });
      await transaction(users);
    } else {
      await db.prepare(`INSERT INTO notifications (user_id, event_type, description, related_module, link) VALUES (?, ?, ?, ?, ?)`).run(userId, eventType, description, relatedModule, link);
    }
  } catch (error) {
    console.error("Error creating notification:", error);
  }
};

export const initNotificationScheduler = () => {
  // Run every day at 08:00
  cron.schedule('0 8 * * *', () => {
    checkOverdueItems();
  });
};

const checkOverdueItems = async () => {
  // Check overdue recommendations
  const overdueRecs = await db.prepare(`
    SELECT r.*, a.title as audit_title 
    FROM recommendations r
    JOIN audit_plans a ON r.audit_id = a.id
    WHERE r.due_date < CURRENT_DATE AND r.status != 'Closed'
  `).all() as any[];

  for (const rec of overdueRecs) {
    const description = `توصية متأخرة: ${rec.recommendation} في التدقيق ${rec.audit_title}. تاريخ الاستحقاق كان ${rec.due_date}`;
    createNotification(rec.responsible_id || 'all', 'Overdue', description, 'AuditTasks', '/tasks');
  }
};
