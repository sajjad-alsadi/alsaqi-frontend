import { db } from '../db/index';

export class CommentService {
  static async getComments(type: string, id: string | number) {
    return await db.prepare(`
      SELECT c.*, u.name as user_name 
      FROM comments c
      JOIN users u ON c.user_id = u.id
      WHERE c.related_type = ? AND c.related_id = ?
      ORDER BY c.created_at ASC
    `).all(type, id);
  }

  static async createComment(userId: string | number, data: any) {
    const { related_type, related_id, content } = data;
    const stmt = db.prepare(`
      INSERT INTO comments (related_type, related_id, user_id, content)
      VALUES (?, ?, ?, ?)
    `);
    const result = await stmt.run(related_type, related_id, userId, content);
    return { id: result.lastInsertRowid };
  }
}
