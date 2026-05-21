/**
 * Test Data Factories
 *
 * Provides factory functions for creating test data with realistic defaults.
 * Each factory accepts optional overrides to customize specific fields.
 */
import { v4 as uuid } from 'uuid';
import {
  UserRole,
  AuditType,
  RiskLevel,
  RiskStatus,
  CorrespondencePriority,
  CorrespondenceClassification,
  CorrespondenceStatus,
  CorrespondenceType,
  SendingMethod,
  EntityType,
  RecommendationStatus,
  ModuleName,
} from '../../constants';
import type {
  User,
  AuditPlan,
  AuditTask,
  AuditFinding,
  Recommendation,
  RiskItem,
  Notification,
} from '../../types';
import type { ComplianceItem, ComplianceStatus, SourceType } from '../../modules/ComplianceMatrix/types';

// ─── User Factory ────────────────────────────────────────────────────────────

export interface TestUser extends User {
  failed_attempts: number;
  locked_until: string | null;
  session_version: number;
  requires_password_change: boolean;
  password_last_changed: string;
}

export function createUser(overrides?: Partial<TestUser>): TestUser {
  const id = uuid();
  return {
    id,
    username: `user_${id.slice(0, 8)}`,
    email: `user_${id.slice(0, 8)}@test.com`,
    password: '$2a$10$hashedpassword',
    name: 'Test User',
    department: 'Internal Audit',
    job_title: 'Auditor',
    role: UserRole.INTERNAL_AUDITOR,
    status: 'Active',
    profile_picture: undefined,
    last_login: new Date().toISOString(),
    theme: 'light',
    permissions: [
      { module: ModuleName.AUDIT, action: 'read' },
      { module: ModuleName.AUDIT, action: 'write' },
    ],
    failed_attempts: 0,
    locked_until: null,
    session_version: 1,
    requires_password_change: false,
    password_last_changed: new Date().toISOString(),
    ...overrides,
  };
}

// ─── Audit Plan Factory ──────────────────────────────────────────────────────

export function createAuditPlan(overrides?: Partial<AuditPlan>): AuditPlan {
  const id = uuid();
  const now = new Date();
  const endDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  return {
    id,
    plan_code: `IA-PL-${now.getFullYear().toString().slice(-2)}-001`,
    title: 'خطة تدقيق اختبارية',
    department: 'Internal Audit',
    type: 'Financial',
    risk_rating: 'High',
    planned_start_date: now.toISOString().split('T')[0],
    planned_end_date: endDate.toISOString().split('T')[0],
    status: 'Planned',
    lead_auditor: uuid(),
    notes: 'Test audit plan notes',
    ...overrides,
  };
}

// ─── Audit Task Factory ──────────────────────────────────────────────────────

export function createAuditTask(overrides?: Partial<AuditTask>): AuditTask {
  const id = uuid();
  const now = new Date();
  return {
    id,
    task_number: `IA-TSK-${now.getFullYear().toString().slice(-2)}-001`,
    title: 'مهمة تدقيق اختبارية',
    plan_id: uuid(),
    audit_type: AuditType.FINANCIAL,
    status: 'draft',
    assigned_to: uuid(),
    planned_hours: 8,
    actual_hours: 0,
    period_from: now.toISOString().split('T')[0],
    period_to: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    due_date: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    created_by: uuid(),
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
    ...overrides,
  };
}

// ─── Audit Finding Factory ───────────────────────────────────────────────────

export function createAuditFinding(overrides?: Partial<AuditFinding>): AuditFinding {
  return {
    id: uuid(),
    audit_id: uuid(),
    finding_number: 'FND-001',
    condition: 'عدم وجود ضوابط كافية على العمليات المالية',
    criteria: 'معايير التدقيق الدولية ISA 315',
    cause: 'ضعف في الرقابة الداخلية',
    consequence: 'احتمال حدوث أخطاء مالية جوهرية',
    recommendation: 'تعزيز الضوابط الرقابية على العمليات المالية',
    risk_level: 'High',
    status: 'Open',
    ...overrides,
  };
}

// ─── Risk Item Factory ───────────────────────────────────────────────────────

export function createRisk(overrides?: Partial<RiskItem>): RiskItem {
  const id = uuid();
  const now = new Date();
  return {
    id,
    risk_id: `RR-${now.getFullYear().toString().slice(-2)}-001`,
    description: 'مخاطر تشغيلية في قسم تقنية المعلومات',
    owner: 'مدير تقنية المعلومات',
    source: 'تقييم المخاطر السنوي',
    early_warning: 'زيادة في حوادث الأمن السيبراني',
    type: 'Operational',
    likelihood: 'Medium',
    impact: 'High',
    score: 12,
    rating: RiskLevel.HIGH,
    controls: 'جدار حماية، نظام كشف التسلل',
    control_assessment: 'Partially Effective',
    mitigation: 'تحديث أنظمة الحماية وتدريب الموظفين',
    treatment_option: 'Mitigate',
    residual_likelihood: 'Low',
    residual_impact: 'Medium',
    residual_score: 6,
    residual_rating: RiskLevel.MEDIUM,
    status: RiskStatus.ACTIVE,
    target_date: new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    review_date: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    notes: 'ملاحظات اختبارية',
    entry_date: now.toISOString().split('T')[0],
    entered_by: uuid(),
    ...overrides,
  };
}

// ─── Correspondence Factory ──────────────────────────────────────────────────

export interface TestCorrespondence {
  id: string;
  type: `${CorrespondenceType}`;
  letter_number: string;
  subject: string;
  letter_date: string;
  classification: `${CorrespondenceClassification}`;
  priority: `${CorrespondencePriority}`;
  status: `${CorrespondenceStatus}`;
  notes: string | null;
  created_at: string;
  // Incoming-specific fields
  sender_entity?: string;
  sender_entity_type?: `${EntityType}`;
  receipt_date?: string;
  method?: `${SendingMethod}`;
  receiving_dept_id?: string | null;
  assigned_dept_id?: string | null;
  assigned_user_id?: string | null;
  follow_up_required?: boolean;
  follow_up_date?: string | null;
  response_required?: boolean;
  response_due_date?: string | null;
  // Outgoing-specific fields
  recipient_entity?: string;
  sending_method?: `${SendingMethod}`;
  attachment_file?: string | null;
}

export function createCorrespondence(
  overrides?: Partial<TestCorrespondence> & { type?: `${CorrespondenceType}` }
): TestCorrespondence {
  const id = uuid();
  const now = new Date();
  const type = overrides?.type || CorrespondenceType.INCOMING;

  const base: TestCorrespondence = {
    id,
    type,
    letter_number: `COR-${now.getFullYear().toString().slice(-2)}-001`,
    subject: 'موضوع مراسلة اختبارية',
    letter_date: now.toISOString().split('T')[0],
    classification: CorrespondenceClassification.GENERAL,
    priority: CorrespondencePriority.NORMAL,
    status: CorrespondenceStatus.RECEIVED,
    notes: null,
    created_at: now.toISOString(),
  };

  if (type === CorrespondenceType.INCOMING) {
    return {
      ...base,
      sender_entity: 'البنك المركزي العراقي',
      sender_entity_type: EntityType.GOVERNMENT,
      receipt_date: now.toISOString().split('T')[0],
      method: SendingMethod.OFFICIAL_MAIL,
      receiving_dept_id: null,
      assigned_dept_id: null,
      assigned_user_id: null,
      follow_up_required: false,
      follow_up_date: null,
      response_required: false,
      response_due_date: null,
      ...overrides,
    };
  }

  return {
    ...base,
    status: CorrespondenceStatus.REGISTERED,
    recipient_entity: 'وزارة المالية',
    sending_method: SendingMethod.OFFICIAL_MAIL,
    attachment_file: null,
    ...overrides,
  };
}

// ─── Notification Factory ────────────────────────────────────────────────────

export function createNotification(overrides?: Partial<Notification>): Notification {
  const id = uuid();
  const now = new Date();
  return {
    id,
    user_id: 1,
    event_type: 'record_created',
    title: 'إشعار جديد',
    description: 'تم إنشاء سجل جديد في خطط التدقيق',
    related_module: ModuleName.AUDIT,
    date: now.toISOString(),
    status: 'Unread',
    is_read: false,
    read_at: null,
    link: '/audit-plans',
    actor_id: uuid(),
    entity_id: uuid(),
    entity_type: 'audit_plans',
    ...overrides,
  };
}

// ─── Compliance Item Factory ─────────────────────────────────────────────────

export function createComplianceItem(overrides?: Partial<ComplianceItem>): ComplianceItem {
  const id = uuid();
  const now = new Date();
  return {
    id,
    ref_number: `CMP-${now.getFullYear().toString().slice(-2)}-001`,
    title: 'تعليمات البنك المركزي بشأن مكافحة غسل الأموال',
    source_type: 'cbi_instruction' as SourceType,
    issuing_authority: 'البنك المركزي العراقي',
    category: 'مكافحة غسل الأموال',
    issue_date: now.toISOString().split('T')[0],
    effective_date: now.toISOString().split('T')[0],
    review_date: new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    compliance_status: 'compliant' as ComplianceStatus,
    maturity_score: 4,
    gap_notes: null,
    responsible_person_id: uuid(),
    responsible_person_name: 'مسؤول الامتثال',
    department_id: uuid(),
    department_name: 'قسم الامتثال',
    description: 'تعليمات تنظيمية بشأن إجراءات مكافحة غسل الأموال',
    keywords: 'AML,غسل أموال,بنك مركزي',
    version: '1.0',
    attachment_path: null,
    open_findings_count: 0,
    ...overrides,
  };
}

// ─── Recommendation Factory ──────────────────────────────────────────────────

export function createRecommendation(overrides?: Partial<Recommendation>): Recommendation {
  const now = new Date();
  return {
    id: Math.floor(Math.random() * 10000),
    finding_id: Math.floor(Math.random() * 10000),
    department: 'Internal Audit',
    responsible: 'مدير القسم',
    due_date: new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    status: RecommendationStatus.OPEN,
    risk_level: 'High',
    ...overrides,
  };
}
