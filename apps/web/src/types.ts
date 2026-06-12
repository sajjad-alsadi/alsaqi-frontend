export { Language } from "./constants";

// ─── Shared types (single source of truth) ─────────────────────────────────────
// These types are defined once in `@alsaqi/shared` and re-exported here so that
// existing consumers importing from `src/types` keep working while every shared
// data-model type resolves to the single `@alsaqi/shared` definition. (FIX-FE-2)
// Do NOT redefine any of these locally — that would reintroduce a duplicate
// Local_Type. Reconciliation of divergent types (below) is tracked under
// FIX-FE-1 / FIX-FE-3.
export type {
  User,
  AuditTask,
  AuditProgram,
  AuditProcedure,
  AuditEvidence,
  RiskItem,
  CentralBankInstruction,
  Notification,
  AuditTrail,
  AuditReport,
} from "@alsaqi/shared";

// ─── Divergent local types (needs-reconciliation) ──────────────────────────────
// The following types intentionally differ from their `@alsaqi/shared`
// counterparts and are kept local until reconciled with the backend under
// FIX-FE-1 / FIX-FE-3. They must NOT be deleted as part of FIX-FE-2.
//
//  - AuditPlan:      local `type` is a string-literal union rather than the
//                    enum-derived `${AuditType}` used by the shared type.
//  - AuditFinding:   adds a local `title?` field not present in the shared type.
//  - Recommendation: adds local `plan_id` and `rec_number` fields and uses a
//                    different `finding_id` type than the shared type.

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

export interface AuditFinding {
  id?: number | string;
  audit_id: number | string;
  finding_number?: string;
  plan_code?: string;
  title?: string;
  condition: string;
  criteria: string;
  cause: string;
  consequence: string;
  recommendation: string;
  risk_level: 'Low' | 'Medium' | 'High';
  status: 'Open' | 'In Progress' | 'Closed';
}

export interface Recommendation {
  id?: number;
  finding_id: number;
  plan_id?: number | string;
  rec_number?: string;
  department: string;
  responsible: string;
  due_date: string;
  status: 'Open' | 'In Progress' | 'Implemented' | 'Overdue';
  risk_level: 'Low' | 'Medium' | 'High';
}
