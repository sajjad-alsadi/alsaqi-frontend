export type ComplianceStatus = 'compliant' | 'partial' | 'non_compliant' | 'under_review';
export type SourceType = 'cbi_instruction' | 'law' | 'internal_policy' | 'admin_decision';

export interface ComplianceItem {
  id: string;
  ref_number: string;
  title: string;
  source_type: SourceType;
  issuing_authority?: string | null;
  category?: string | null;
  issue_date?: string | null;
  effective_date?: string | null;
  review_date?: string | null;
  compliance_status: ComplianceStatus;
  maturity_score?: number | null;
  gap_notes?: string | null;
  responsible_person_id?: string | null;
  responsible_person_name?: string | null;
  department_id?: string | null;
  department_name?: string | null;
  description?: string | null;
  keywords?: string | null;
  version?: string | null;
  attachment_path?: string | null;
  open_findings_count?: number;
}
