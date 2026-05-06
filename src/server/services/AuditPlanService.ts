import { db } from '../db/index';
import { BaseService } from './BaseService';
import { NotificationService } from './NotificationService';
import { N8nService } from '../utils/n8nService';

export class AuditPlanService extends BaseService {
  static async generatePlanCode(departmentName?: string): Promise<string> {
    const currentYear = new Date().getFullYear();
    const shortYear = currentYear.toString().slice(-2);
    
    // Attempt to resolve department code
    let deptCode = 'IA'; // Internal Audit by default
    if (departmentName) {
      try {
        const dept = await db.prepare("SELECT entity_code FROM org_entities WHERE name_ar = ? OR name_en = ?").get(departmentName, departmentName) as any;
        if (dept && dept.entity_code) {
          deptCode = dept.entity_code;
        }
      } catch (e) {
        // ignore
      }
    }

    const docType = 'PL'; // Plan
    const prefix = `${deptCode}-${docType}-${shortYear}-`;
    
    try {
      // Find the latest plan code with this format
      const latestPlan = await db.prepare(
        `SELECT plan_code FROM audit_plans 
         WHERE plan_code LIKE ? 
         ORDER BY plan_code DESC LIMIT 1`
      ).get(`${prefix}%`) as any;

      let nextNumber = 1;
      if (latestPlan && latestPlan.plan_code) {
        const parts = latestPlan.plan_code.split('-');
        const lastNumber = parseInt(parts[parts.length - 1]);
        if (!isNaN(lastNumber)) {
          nextNumber = lastNumber + 1;
        }
      }

      // Format with leading zeros (e.g., 001)
      const formattedNumber = nextNumber.toString().padStart(3, '0');
      const newCode = `${prefix}${formattedNumber}`;
      return newCode;
    } catch (error) {
      console.error('[AuditPlanService] Error generating plan code:', error);
      return `${prefix}ERR-${Date.now().toString().slice(-3)}`;
    }
  }

  static async create(tableName: string, data: any) {
    const planCode = await this.generatePlanCode(data.department);
    const body = { ...data, plan_code: planCode };
    const result = await super.create(tableName, body);
    
    // --- AUTOMATION: Send event to n8n ---
    await N8nService.sendEvent('audit_plan.created', {
      planId: result.id,
      title: body.title,
      department: body.department,
      planCode: body.plan_code
    });

    return result;
  }

  static async update(tableName: string, id: string | number, data: any) {
    // Get the current status before update
    const currentPlan = await db.prepare("SELECT status, title, lead_auditor FROM audit_plans WHERE id = ?").get(id) as any;
    
    const result = await super.update(tableName, id, data);

    // --- AUTOMATION: Send event to n8n ---
    if (data.status && currentPlan && currentPlan.status !== data.status) {
      await N8nService.sendEvent('audit_plan.status_changed', {
        planId: id,
        oldStatus: currentPlan.status,
        newStatus: data.status,
        title: data.title || currentPlan.title
      });
    }

    // --- AUTOMATION: Auto-generate report when audit plan is completed ---
    if (data.status === 'Completed' || data.status === 'Closed') {
      if (currentPlan && currentPlan.status !== data.status) {
        try {
          // Check if a report already exists for this audit
          const existingReport = await db.prepare("SELECT id FROM audit_reports WHERE audit_id = ?").get(id);
          
          if (!existingReport) {
            // Generate a new report
            const reportTitle = `Final Audit Report: ${data.title || currentPlan.title}`;
            const reportSummary = `This is an automatically generated final report for the audit engagement: ${data.title || currentPlan.title}. The audit has been marked as ${data.status}.`;
            
            await db.prepare(`
              INSERT INTO audit_reports (title, type, audit_id, summary, findings_included, status, created_by) 
              VALUES (?, ?, ?, ?, ?, ?, ?)
            `).run(reportTitle, 'Audit Report', id, reportSummary, 1, 'Final', 'System');

            await this.logAudit('System', `Auto-generated final report for Audit ID: ${id}`, "audit_reports", JSON.stringify({ title: reportTitle }));

            // Notify the lead auditor
            const leadAuditor = data.lead_auditor || currentPlan.lead_auditor;
            if (leadAuditor) {
              const user = await db.prepare("SELECT id FROM users WHERE name = ? OR username = ?").get(leadAuditor, leadAuditor) as any;
              if (user) {
                await NotificationService.create(
                  user.id,
                  'Report Auto-Generated',
                  `The final audit report for "${data.title || currentPlan.title}" has been automatically generated.`,
                  'audit_reports',
                  '/reports'
                );
              }
            }
          }
        } catch (err: any) {
          console.error('[Automation Error] Failed to auto-generate report:', err);
          
          try {
            // Un-silence the error by escalating it to the system error logs for Administrator visibility
            await db.prepare(`
              INSERT INTO system_error_log (user_id, module, url, message, stack, user_agent, request_data, severity)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
              null, "AuditPlanService.update", "System_Job", 
              err?.message || "Unknown error generating report", err?.stack ? err.stack.substring(0, 2000) : "", 
              "System_Job", null, "error"
            );
          } catch (loggingErr) {
            console.error("Critical failure writing to system_error_log", loggingErr);
          }
        }
      }
    }
    // ------------------------------------------------------------------------

    return result;
  }
}
