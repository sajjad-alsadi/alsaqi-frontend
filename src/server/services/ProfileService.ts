import { db } from '../db/index';
import { NotFoundError } from '../utils/errors';

export class ProfileService {
  static async getProfile(userId: string | number) {
    const user = await db.prepare(`
      SELECT u.id, u.employee_id, u.username, u.name, u.email, u.department, u.role, u.profile_picture, u.last_login, u.language, u.dashboard_layout, u.notifications_enabled, u.theme, j.name as job_title 
      FROM users u 
      LEFT JOIN job_titles j ON u.job_title_id = j.id 
      WHERE u.id = ?
    `).get(userId) as any;
    
    if (!user) throw new NotFoundError("User profile not found");
    return user;
  }

  static async updateProfile(userId: string | number, data: any, username: string) {
    const { name, email, department, profile_picture } = data;
    await db.prepare("UPDATE users SET name = ?, email = ?, department = ?, profile_picture = ? WHERE id = ?")
      .run(name, email, department, profile_picture, userId);
    
    await db.prepare("INSERT INTO audit_trail (user, action, module, details) VALUES (?::text, ?::text, ?::text, ?::text)")
      .run(username, "Update Profile", "Settings", "User updated personal profile");
      
    return true;
  }

  static async updatePreferences(userId: string | number, data: any, username: string) {
    const { language, dashboard_layout, notifications_enabled, theme } = data;
    await db.prepare("UPDATE users SET language = ?, dashboard_layout = ?, notifications_enabled = ?, theme = ? WHERE id = ?")
      .run(language, dashboard_layout, notifications_enabled ? 1 : 0, theme || 'light', userId);
    
    await db.prepare("INSERT INTO audit_trail (user, action, module, details) VALUES (?::text, ?::text, ?::text, ?::text)")
      .run(username, "Update Preferences", "Settings", "User updated preferences");
      
    return true;
  }
}
