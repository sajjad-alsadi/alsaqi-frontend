import { db } from '../db/index';
import { ValidationError } from '../utils/errors';
import { N8nService } from '../utils/n8nService';

export class AuditService {
  static async getFindings(params: any = {}) {
    const page = parseInt(params.page) || 1;
    const pageSize = parseInt(params.pageSize) || 20;
    const offset = (page - 1) * pageSize;

    let query = "SELECT * FROM audit_findings";
    let countQuery = "SELECT COUNT(*) as total FROM audit_findings";
    const args: any[] = [];
    let whereClause = "";

    if (params.audit_id) {
      whereClause = " WHERE audit_id = ?";
      args.push(params.audit_id);
    }

    query += whereClause + " ORDER BY created_at DESC LIMIT ? OFFSET ?";
    countQuery += whereClause;

    const [data, countRes] = await Promise.all([
      db.prepare(query).all(...args, pageSize, offset),
      db.prepare(countQuery).get(...args)
    ]) as [any[], any];

    const total = countRes?.total || 0;

    return {
      data,
      pagination: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize)
      }
    };
  }

  static async createFinding(body: any) {
    return await db.transaction(async () => {
      const keys = Object.keys(body).map(k => db.validateIdentifier(k));
      const values = Object.values(body);
      
      if (keys.length === 0) {
        throw new ValidationError("No data provided");
      }

      const placeholders = keys.map(() => "?").join(",");
      const stmt = db.prepare(`INSERT INTO audit_findings (${keys.join(",")}) VALUES (${placeholders})`);
      const info = await stmt.run(...values) as any;
      const findingId = info.lastInsertRowid;

      // Automatically create a recommendation
      const plan = await db.prepare("SELECT department FROM audit_plans WHERE id = ?").get(body.audit_id) as any;
      const department = plan ? plan.department : 'Unknown';
      
      await db.prepare(`INSERT INTO recommendations (finding_id, department, responsible, due_date, status, risk_level) 
                  VALUES (?, ?, ?, ?, ?, ?)`)
        .run(findingId, department, 'TBD', '', 'Pending', body.risk_level || 'Medium');

      // --- AUTOMATION: Send event to n8n ---
      await N8nService.sendEvent('finding.created', {
        findingId,
        title: body.title,
        auditId: body.audit_id,
        riskLevel: body.risk_level
      });

      return findingId;
    });
  }

  static async updateFinding(id: string, body: any) {
    return await db.transaction(async () => {
      const data = { ...body };
      delete data.id;

      const keys = Object.keys(data).map(k => db.validateIdentifier(k));
      const values = Object.values(data);
      
      if (keys.length === 0) {
        throw new ValidationError("No data provided for update");
      }

      const setClause = keys.map(k => `${k} = ?`).join(",");
      await db.prepare(`UPDATE audit_findings SET ${setClause} WHERE id = ?`).run(...values, id);

      // Sync risk level to recommendation
      if (data.risk_level) {
        await db.prepare("UPDATE recommendations SET risk_level = ? WHERE finding_id = ?").run(data.risk_level, id);
      }

      // --- AUTOMATION: Send event to n8n ---
      await N8nService.sendEvent('finding.updated', {
        findingId: id,
        updates: data
      });
    });
  }

  static async deleteFinding(id: string) {
    return await db.transaction(async () => {
      await db.prepare("DELETE FROM recommendations WHERE finding_id = ?").run(id);
      await db.prepare("DELETE FROM audit_findings WHERE id = ?").run(id);

      // --- AUTOMATION: Send event to n8n ---
      await N8nService.sendEvent('finding.deleted', {
        findingId: id
      });
    });
  }
}

