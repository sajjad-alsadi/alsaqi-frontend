import { db } from '../db/index';
import { NotFoundError } from '../utils/errors';
import { QueryBuilder } from '../utils/QueryBuilder';

export class DashboardService {
  private static db = db;

  static async getDashboardStats(filters: { department?: string; riskLevel?: string } = {}) {
    const { department, riskLevel } = filters;
    const isFiltered = !!(department && department !== 'all');
    
    // Map lowercase filter to database values
    const deptMap: Record<string, string> = {
      'operational': 'Operational',
      'financial': 'Financial',
      'it': 'IT',
      'compliance': 'Compliance'
    };
    const mappedDept = isFiltered ? (deptMap[department!.toLowerCase()] || department) : null;

    // Plans Builder
    const auditQb = new QueryBuilder("FROM audit_plans").whereIf(isFiltered, "type = ?", mappedDept);
    
    // Findings Builder
    const findingsBase = isFiltered ? "FROM audit_findings f JOIN audit_plans p ON f.audit_id = p.id" : "FROM audit_findings f";
    const findingsQb = new QueryBuilder(findingsBase)
      .whereIf(isFiltered, "p.type = ?", mappedDept)
      .whereIf(!!riskLevel, "f.risk_level = ?", riskLevel);
      
    // Recommendations Builder
    const recBase = isFiltered ? "FROM recommendations r JOIN audit_findings f ON r.finding_id = f.id JOIN audit_plans p ON f.audit_id = p.id" : "FROM recommendations r";
    const recQb = new QueryBuilder(recBase)
      .whereIf(isFiltered, "p.type = ?", mappedDept)
      .whereIf(!!riskLevel, "r.risk_level = ?", riskLevel);
      
    // Risk Builder
    const riskQb = new QueryBuilder("FROM risk_register").whereIf(isFiltered, "type = ?", mappedDept);

    // Compliance Builder
    const complianceQb = new QueryBuilder("FROM central_bank_instructions")
      .where("status = 'Active'")
      .whereIf(isFiltered, "category = ?", mappedDept);

    // Execute queries concurrently using standardized payload
    const promises = [
      this.db.prepare(`
        SELECT 
          COUNT(*) as total,
          COALESCE(SUM(CASE WHEN status = 'Closed' THEN 1 ELSE 0 END), 0) as completed,
          COALESCE(SUM(CASE WHEN status IN ('Fieldwork', 'Reporting') THEN 1 ELSE 0 END), 0) as in_progress,
          COALESCE(SUM(CASE WHEN status != 'Closed' AND planned_end_date < TO_CHAR(CURRENT_DATE, 'YYYY-MM-DD') THEN 1 ELSE 0 END), 0) as delayed
        ${auditQb.buildCountQuery()}
      `).get(...auditQb.buildParams()),
      
      this.db.prepare(`
        SELECT 
          COUNT(*) as total,
          COALESCE(SUM(CASE WHEN f.status != 'Closed' THEN 1 ELSE 0 END), 0) as open_count,
          COALESCE(SUM(CASE WHEN f.risk_level IN ('High', 'Critical') AND f.status != 'Closed' THEN 1 ELSE 0 END), 0) as high_risk_open
        ${findingsQb.buildCountQuery()}
      `).get(...findingsQb.buildParams()),
      
      this.db.prepare(`SELECT f.risk_level as level, COUNT(*) as count ${findingsQb.buildCountQuery()} GROUP BY f.risk_level`).all(...findingsQb.buildParams()),
      
      this.db.prepare(`
        SELECT 
          COUNT(*) as total,
          COALESCE(SUM(CASE WHEN r.status != 'Implemented' THEN 1 ELSE 0 END), 0) as pending_count,
          COALESCE(SUM(CASE WHEN r.status != 'Implemented' AND r.due_date < TO_CHAR(CURRENT_DATE, 'YYYY-MM-DD') THEN 1 ELSE 0 END), 0) as overdue_count
        ${recQb.buildCountQuery()}
      `).get(...recQb.buildParams()),
      
      this.db.prepare(`
        SELECT 
          COUNT(*) as total,
          COALESCE(SUM(CASE WHEN rating IN ('High', 'Critical') THEN 1 ELSE 0 END), 0) as high_count
        ${riskQb.buildCountQuery()}
      `).get(...riskQb.buildParams()),
      
      this.db.prepare(`SELECT rating as level, COUNT(*) as count ${riskQb.buildCountQuery()} GROUP BY rating`).all(...riskQb.buildParams()),
      
      this.db.prepare(`
        SELECT 
          (SELECT COUNT(*) FROM incoming_correspondence) as incoming_total,
          (SELECT COUNT(*) FROM outgoing_letters) as outgoing_total,
          (SELECT COUNT(*) FROM incoming_correspondence WHERE response_required = 1 AND status != 'Closed') as pending_responses
      `).get(),
      
      this.db.prepare(`SELECT COUNT(*) as count ${complianceQb.buildCountQuery()}`).get(...complianceQb.buildParams()),

      this.db.prepare('SELECT id, "user", action, module, timestamp, details FROM audit_trail ORDER BY timestamp DESC LIMIT 10').all(),
      this.db.prepare(`
        SELECT 
          type,
          COUNT(*) as planned,
          COALESCE(SUM(CASE WHEN status = 'Closed' THEN 1 ELSE 0 END), 0) as completed
        FROM audit_plans
        GROUP BY type
      `).all()
    ];

    const [
      auditStats,
      findingsStats,
      findingsByRisk,
      recStats,
      riskStats,
      risksByLevel,
      corrStats,
      complianceStats,
      recentActivity,
      auditProgress
    ] = await Promise.all(promises) as any[];

    return {
      audits: {
        total: Number(auditStats?.total || 0),
        completed: Number(auditStats?.completed || 0),
        in_progress: Number(auditStats?.in_progress || 0),
        delayed: Number(auditStats?.delayed || 0),
        progress_by_type: auditProgress || []
      },
      findings: {
        summary: {
          total: Number(findingsStats?.total || 0),
          open: Number(findingsStats?.open_count || 0),
          high_risk_open: Number(findingsStats?.high_risk_open || 0)
        },
        byRisk: findingsByRisk
      },
      recommendations: {
        total: Number(recStats?.total || 0),
        open: Number(recStats?.pending_count || 0),
        overdue: Number(recStats?.overdue_count || 0)
      },
      risks: {
        summary: {
          total: Number(riskStats?.total || 0),
          high: Number(riskStats?.high_count || 0)
        },
        byLevel: risksByLevel
      },
      correspondence: {
        incoming_total: Number(corrStats?.incoming_total || 0),
        outgoing_total: Number(corrStats?.outgoing_total || 0),
        pending_responses: Number(corrStats?.pending_responses || 0)
      },
      compliance: {
        total: Number(complianceStats?.count || 0)
      },
      activity: recentActivity
    };
  }

  static async getMyTasks(userId: string | number) {
    return await this.db.prepare(`
      SELECT * FROM audit_tasks 
      WHERE assigned_to = ?
      ORDER BY created_at DESC
    `).all(userId);
  }
}
