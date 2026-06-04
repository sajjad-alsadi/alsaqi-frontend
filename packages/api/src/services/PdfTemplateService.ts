import { db } from '../db/index';
import { NotFoundError, ValidationError } from '../utils/errors';
import { BaseService } from './BaseService';

export class PdfTemplateService {
  static async getAll() {
    return await db.prepare("SELECT * FROM pdf_templates ORDER BY created_at DESC").all();
  }

  static async getById(id: string) {
    const template = await db.prepare("SELECT * FROM pdf_templates WHERE id = ?::uuid").get(id);
    if (!template) throw new NotFoundError("Template not found");
    return template;
  }
  
  static async getActiveByType(type: string) {
    const template = await db.prepare("SELECT * FROM pdf_templates WHERE template_type = ? AND status = 'Approved' AND is_default = 1 LIMIT 1").get(type);
    return template;
  }

  static async create(data: any, username: string) {
    if (!data.template_name || !data.template_type || !data.content) {
      throw new ValidationError("Missing required fields for PDF template");
    }

    return await db.transaction(async () => {
      // If saving as default, unset others of same type
      if (data.is_default && String(data.is_default) === '1') {
        await db.prepare("UPDATE pdf_templates SET is_default = 0 WHERE template_type = ?").run(data.template_type);
      }

      const stmt = db.prepare(`
        INSERT INTO pdf_templates (template_name, template_type, content, status, is_default, version, created_by, updated_by)
        VALUES (?, ?, ?, ?, ?, 1, ?, ?)
        RETURNING *
      `);
      
      const newTemplate = await stmt.get(
        data.template_name,
        data.template_type,
        data.content,
        data.status || 'Draft',
        data.is_default ? 1 : 0,
        username,
        username
      );

      await db.prepare("INSERT INTO audit_trail (user, action, module, details) VALUES (?, ?, ?, ?)").run(
        username, 'Created PDF Template', 'Settings', `Template ID: ${newTemplate.id}`
      );

      return newTemplate;
    });
  }

  static async update(id: string, data: any, username: string) {
    const existing = await this.getById(id);
    
    return await db.transaction(async () => {
      if (data.is_default && String(data.is_default) === '1') {
        await db.prepare("UPDATE pdf_templates SET is_default = 0 WHERE template_type = ?").run(data.template_type || existing.template_type);
      }

      // If content changed and not just status, maybe bump version
      let version = existing.version;
      if (data.content && data.content !== existing.content) {
        version += 1;
      }

      const stmt = db.prepare(`
        UPDATE pdf_templates 
        SET template_name = COALESCE(?, template_name),
            template_type = COALESCE(?, template_type),
            content = COALESCE(?, content),
            status = COALESCE(?, status),
            is_default = COALESCE(?, is_default),
            version = ?,
            updated_by = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?::uuid
        RETURNING *
      `);

      const updated = await stmt.get(
        data.template_name,
        data.template_type,
        data.content,
        data.status,
        data.is_default !== undefined ? (data.is_default ? 1 : 0) : null,
        version,
        username,
        id
      );

      await db.prepare("INSERT INTO audit_trail (user, action, module, details) VALUES (?, ?, ?, ?)").run(
        username, 'Updated PDF Template', 'Settings', `Template ID: ${id}, Status: ${updated.status}`
      );

      return updated;
    });
  }

  static async approve(id: string, username: string) {
    return await this.update(id, { status: 'Approved' }, username);
  }

  static async delete(id: string, username: string) {
    return await db.transaction(async () => {
      await db.prepare("DELETE FROM pdf_templates WHERE id = ?::uuid").run(id);
      
      await db.prepare("INSERT INTO audit_trail (user, action, module, details) VALUES (?, ?, ?, ?)").run(
        username, 'Deleted PDF Template', 'Settings', `Template ID: ${id}`
      );
      return true;
    });
  }
}
