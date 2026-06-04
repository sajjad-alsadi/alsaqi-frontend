import { AuditReport, AuditPlan, AuditFinding } from '../../types';

export type { AuditReport, AuditPlan, AuditFinding };

export interface ExecData {
  totalAudits: number;
  completedAudits: number;
  highRiskFindings: number;
  topRisks: { description: string; rating: string; owner: string }[];
  findingsByDept: { department: string; count: number }[];
  findingsTrend: { month: string; count: number }[];
}

export interface ReportType {
  id: string;
  label: string;
  description: string;
}
