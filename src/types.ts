import { Type } from "@google/genai";

export { Language } from "./constants";

export interface User {
  id?: number | string;
  username: string;
  password?: string;
  name: string;
  email: string;
  department: string;
  job_title?: string;
  role: 'Admin' | 'Administrator' | 'Internal Auditor' | 'Compliance Officer' | 'Risk Officer' | 'Manager' | 'Viewer' | 'Compliance';
  profile_picture?: string;
  status: 'Active' | 'Disabled';
  last_login?: string;
  theme?: 'light' | 'dark';
}

export interface AuditPlan {
  id?: string;
  plan_code?: string;
  title: string;
  department: string;
  type: 'Operational' | 'Compliance' | 'Financial' | 'IT' | 'AML';
  risk_rating: 'Low' | 'Medium' | 'High' | 'Critical';
  planned_start_date: string;
  planned_end_date: string;
  actual_start_date?: string;
  actual_end_date?: string;
  status: 'Planned' | 'Fieldwork' | 'Reporting' | 'Closed';
  lead_auditor: string;
  notes?: string;
}

export interface AuditTask {
  id?: number | string;
  task_number: string;
  title: string;
  plan_id: string; // audit_plans(id)
  program_id?: string;
  audit_type: string;
  status: 'draft' | 'in_progress' | 'review' | 'approved' | 'completed';
  assigned_to?: string;
  audited_unit_id?: string;
  planned_hours?: number;
  actual_hours?: number;
  period_from?: string;
  period_to?: string;
  due_date?: string;
  approved_by?: string;
  approved_at?: string;
  created_by?: string;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string;
  
  // legacy props to satisfy old code until fully removed
  audit_id?: number | string;
  procedure?: string;
  responsible?: string;
  evidence_link?: string;
  evidence_id?: number;
}

export interface AuditProgram {
  id?: number;
  program_code: string;
  program_title: string;
  audit_area: string;
  department: string;
  audit_type: 'Operational' | 'Financial' | 'Compliance' | 'IT' | 'AML' | 'Governance';
  audit_objective: string;
  audit_scope: string;
  key_risks: string;
  control_objectives: string;
  reference_standard: string;
  status: 'Active' | 'Archived' | 'Draft' | 'Submitted' | 'Approved';
  version_number: number;
  created_by: string;
  created_at?: string;
  updated_at?: string;
}

export interface AuditProcedure {
  id?: number;
  program_id: number;
  procedure_number: string;
  audit_step: string;
  audit_test_description: string;
  risk_addressed: string;
  control_test_type: 'Walkthrough' | 'Inspection' | 'Observation' | 'Recalculation' | 'Reperformance' | 'Inquiry' | 'Analytical Review';
  expected_evidence: string;
  sampling_method: string;
  responsible_auditor: string;
  remarks?: string;
}

export interface AuditFinding {
  id?: number | string;
  audit_id: number | string;
  finding_number?: string;
  plan_code?: string;
  condition: string;
  criteria: string;
  cause: string;
  consequence: string;
  recommendation: string;
  risk_level: 'Low' | 'Medium' | 'High';
  status: 'Open' | 'In Progress' | 'Closed';
}

export interface AuditEvidence {
  id?: number | string;
  audit_id: number | string;
  finding_id: number | string;
  type: 'Document' | 'Email' | 'Screenshot' | 'System Log' | 'Contract';
  description: string;
  uploaded_by: string;
  upload_date: string;
  file_name: string;
  file_data?: string;
}

export interface Recommendation {
  id?: number;
  finding_id: number;
  department: string;
  responsible: string;
  due_date: string;
  status: 'Open' | 'In Progress' | 'Implemented' | 'Overdue';
  risk_level: 'Low' | 'Medium' | 'High';
}

export interface RiskItem {
  id?: string;
  risk_id: string;
  description: string;
  owner: string;
  source: string;
  early_warning: string;
  type: string;
  likelihood: string;
  impact: string;
  score: number;
  rating: string;
  controls: string;
  control_assessment: string;
  mitigation: string;
  treatment_option: string;
  residual_likelihood: string;
  residual_impact: string;
  residual_score: number;
  residual_rating: string;
  status: string;
  target_date: string;
  review_date: string;
  notes: string;
  entry_date: string;
  entered_by: string;
}

export interface CentralBankInstruction {
  id?: string;
  title: string;
  issue_date: string;
  reference_number: string;
  category: string;
  description: string;
  related_department: string;
  attachment?: string;
  status: string;
}

export interface LawBankItem {
  id?: number;
  title: string;
  type: string;
  authority: string;
  issue_date: string;
  description: string;
  related_risk_area: string;
  attachment?: string;
  keywords: string;
}

export interface FraudCase {
  id?: number;
  description: string;
  department: string;
  detection_method: string;
  status: string;
  notes?: string;
}

export interface Notification {
  id?: string | number;
  recipient_row_id?: string;
  user_id?: number;
  event_type: string;
  title?: string | null;
  description: string;
  related_module: string;
  date: string;
  status?: 'Read' | 'Unread';
  is_read?: boolean;
  read_at?: string | null;
  link?: string;
  actor_id?: string;
  entity_id?: string;
  entity_type?: string;
  data?: Record<string, any>;
}

export interface AuditTrail {
  id: number;
  user: string;
  action: string;
  module: string;
  timestamp: string;
  details: string;
}

export interface OrgPosition {
  id: number;
  title: string;
  department: string;
  unit?: string;
  employee_name: string;
  reporting_to?: number;
  role_description: string;
  access_level: 'High' | 'Medium' | 'Low';
  status: 'Active' | 'Archived';
}

export interface AuditReport {
  id?: number | string;
  audit_id?: number | string;
  title: string;
  report_type?: string;
  generated_by: string;
  date_generated: string;
  status: 'Draft' | 'Final';
  content: string; // JSON string containing selected findings and report configuration
}
