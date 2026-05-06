import { db } from '../db/index';

export class NotificationService {
  static async getNotifications(userId: string | number) {
    return await db.prepare("SELECT * FROM notifications WHERE user_id = ?::uuid ORDER BY date DESC").all(userId);
  }

  static async getUnreadCount(userId: string | number) {
    return await db.prepare("SELECT COUNT(*) as count FROM notifications WHERE user_id = ?::uuid AND status = 'Unread'").get(userId) as any;
  }

  static async markAsRead(id: string | number, userId: string | number) {
    await db.prepare("UPDATE notifications SET status = 'Read' WHERE id = ?::uuid AND user_id = ?::uuid").run(id, userId);
    return true;
  }

  static async markAllRead(userId: string | number) {
    await db.prepare("UPDATE notifications SET status = 'Read' WHERE user_id = ?::uuid").run(userId);
    return true;
  }

  static async delete(id: string | number, userId: string | number) {
    await db.prepare("DELETE FROM notifications WHERE id = ?::uuid AND user_id = ?::uuid").run(id, userId);
    return true;
  }

  static async create(userId: string | number | 'all', type: string, message: string, module: string, link: string) {
    if (userId === 'all') {
      const users = await db.prepare("SELECT id FROM users WHERE status = 'Active'").all() as any[];
      const stmt = db.prepare("INSERT INTO notifications (user_id, event_type, description, related_module, link, status) VALUES (?::uuid, ?::text, ?::text, ?::text, ?::text, 'Unread')");
      for (const user of users) {
        await stmt.run(user.id, type, message, module, link);
      }
    } else {
      await db.prepare("INSERT INTO notifications (user_id, event_type, description, related_module, link, status) VALUES (?::uuid, ?::text, ?::text, ?::text, ?::text, 'Unread')")
        .run(userId, type, message, module, link);
    }
    return true;
  }
}
