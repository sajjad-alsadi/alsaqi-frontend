import { db } from '../db/index';
import { NotFoundError, ValidationError } from '../utils/errors';
import { NotificationService } from './NotificationService';
import { N8nService } from '../utils/n8nService';

export class RecommendationService {
  static async getAll() {
    return await db.prepare("SELECT * FROM recommendations").all();
  }

  static async update(id: string | number, data: any, username: string) {
    const body = { ...data };
    delete body.id;

    const keys = Object.keys(body).map(k => db.validateIdentifier(k));
    const values = Object.values(body);
    
    if (keys.length === 0) {
      throw new ValidationError("No data provided for update");
    }

    const setClause = keys.map(k => `${k} = ?`).join(",");
    await db.prepare(`UPDATE recommendations SET ${setClause} WHERE id = ?`).run(...values, id);

    await db.prepare("INSERT INTO audit_trail (user, action, module, details) VALUES (?::text, ?::text, ?::text, ?::text)")
      .run(username, `Updated recommendations ID: ${id}`, "recommendations", JSON.stringify(body));

    // --- AUTOMATION: Send event to n8n ---
    await N8nService.sendEvent('recommendation.updated', {
      recommendationId: id,
      newStatus: body.status,
      updatedBy: username,
      dueDate: body.due_date
    });

    // --- AUTOMATION: Auto-close finding if all recommendations are implemented ---
    if (body.status === 'Implemented') {
      try {
        // Get the finding_id for this recommendation
        const rec = await db.prepare("SELECT finding_id FROM recommendations WHERE id = ?").get(id) as any;
        if (rec && rec.finding_id) {
          // Check if there are any recommendations for this finding that are NOT 'Implemented'
          const openRecs = await db.prepare("SELECT COUNT(*) as count FROM recommendations WHERE finding_id = ? AND status != 'Implemented'").get(rec.finding_id);
          
          if (openRecs && (openRecs as any).count === 0) {
            // Check if finding is already closed
            const finding = await db.prepare("SELECT status, audit_id, title FROM audit_findings WHERE id = ?").get(rec.finding_id) as any;
            
            if (finding && finding.status !== 'Closed') {
              // All recommendations are implemented, so close the finding
              await db.prepare("UPDATE audit_findings SET status = 'Closed' WHERE id = ?").run(rec.finding_id);
              
              await db.prepare("INSERT INTO audit_trail (user, action, module, details) VALUES (?::text, ?::text, ?::text, ?::text)")
                .run('System', `Auto-closed finding ID: ${rec.finding_id} as all recommendations are implemented`, "audit_findings", JSON.stringify({ status: 'Closed' }));

              // --- AUTOMATION: Send event to n8n ---
              await N8nService.sendEvent('finding.auto_closed', {
                findingId: rec.finding_id,
                title: finding.title,
                auditId: finding.audit_id
              });

              // Get lead auditor to notify
              if (finding.audit_id) {
                const plan = await db.prepare("SELECT lead_auditor FROM audit_plans WHERE id = ?").get(finding.audit_id) as any;
                if (plan && plan.lead_auditor) {
                  const user = await db.prepare("SELECT id FROM users WHERE name = ? OR username = ?").get(plan.lead_auditor, plan.lead_auditor) as any;
                  if (user) {
                    await NotificationService.create(
                      user.id,
                      'Finding Auto-Closed',
                      `The finding "${finding.title}" has been automatically closed because all its recommendations are now implemented.`,
                      'audit_findings',
                      '/findings'
                    );
                  }
                }
              }
            }
          }
        }
      } catch (err) {
        console.error('[Automation Error] Failed to auto-close finding:', err);
      }
    }
    // ------------------------------------------------------------------------

    return { id, ...body };
  }
}
