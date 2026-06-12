/**
 * Custom fast-check Arbitraries (Generators)
 *
 * Provides reusable generators for property-based testing across the AL-SAQI system.
 * Uses constants from src/constants.ts for enum values and matches existing Zod schemas.
 */
import fc from 'fast-check';
import {
  UserRole,
  AuditType,
  RiskLevel,
  CorrespondencePriority,
  CorrespondenceClassification,
  CorrespondenceStatus,
  SendingMethod,
  EntityType,
} from '../../constants';

// ─── 1. User-related Arbitraries ─────────────────────────────────────────────

/** Generates valid UserRole enum values */
export const userRoleArb = fc.constantFrom(
  UserRole.ADMIN,
  UserRole.INTERNAL_AUDITOR,
  UserRole.COMPLIANCE_OFFICER,
  UserRole.RISK_OFFICER,
  UserRole.MANAGER,
  UserRole.VIEWER
);

/** Generates valid usernames (3-50 chars, alphanumeric + underscore) */
export const validUsernameArb = fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9_]{2,49}$/);

/** Generates valid email addresses */
export const validEmailArb = fc.tuple(
  fc.stringMatching(/^[a-z][a-z0-9]{2,10}$/),
  fc.constantFrom('test.com', 'example.org', 'company.io', 'mail.net')
).map(([local, domain]) => `${local}@${domain}`);

/** Generates valid passwords (6-100 chars) */
export const validPasswordArb = fc.string({ minLength: 6, maxLength: 100 }).filter(
  (s) => s.length >= 6 && s.length <= 100
);

/** Generates valid user objects */
export const userArb = fc.record({
  id: fc.uuid(),
  username: validUsernameArb,
  email: validEmailArb,
  role: userRoleArb,
  name: fc.string({ minLength: 2, maxLength: 50 }).filter((s) => s.trim().length >= 2),
  status: fc.constantFrom('Active' as const, 'Suspended' as const),
  failed_attempts: fc.integer({ min: 0, max: 10 }),
  session_version: fc.integer({ min: 1, max: 100 }),
});

// ─── 2. Database-related Arbitraries ─────────────────────────────────────────

/** List of allowed tables from crudGenerator.ts */
const ALLOWED_TABLES = [
  'audit_plans',
  'audit_tasks',
  'audit_programs',
  'audit_procedures',
  'audit_evidence',
  'risk_register',
  'fraud_log',
  'central_bank_instructions',
  'law_bank',
  'audit_reports',
  'audit_findings',
  'recommendations',
  'compliance_items',
] as const;

/** Generates valid table names from the ALLOWED_TABLES list */
export const validTableNameArb = fc.constantFrom(...ALLOWED_TABLES);

/** Generates valid column names matching /^[a-zA-Z_][a-zA-Z0-9_]*$/ */
export const validColumnNameArb = fc.stringMatching(/^[a-zA-Z_][a-zA-Z0-9_]{0,30}$/);

/** Generates SQL injection attempts */
export const maliciousColumnNameArb = fc.oneof(
  fc.constant("id; DROP TABLE users--"),
  fc.constant("name' OR '1'='1"),
  fc.constant('col"; DELETE FROM audit_trail;--'),
  fc.constant("1; SELECT * FROM users--"),
  fc.constant("col DROP DATABASE"),
  fc.constant("'; INSERT INTO users VALUES('hack')--"),
  fc.constant("col\"; UPDATE users SET role='Admin'--"),
  fc.constant("id UNION SELECT password FROM users--"),
  fc.constant("col' OR 1=1--"),
  fc.constant("col; TRUNCATE TABLE audit_trail--")
);

/** Generates valid orderBy strings (column + ASC/DESC) */
export const validOrderByArb = fc.tuple(
  validColumnNameArb,
  fc.constantFrom('ASC', 'DESC')
).map(([col, dir]) => `${col} ${dir}`);

/** Generates invalid orderBy strings with injection attempts */
export const invalidOrderByArb = fc.oneof(
  fc.constant("id; DROP TABLE users-- ASC"),
  fc.constant("name' OR '1'='1 DESC"),
  fc.constant("col DESC; DELETE FROM audit_trail"),
  fc.constant("1 UNION SELECT * FROM users ASC"),
  fc.constant("col ASC; UPDATE users SET role='Admin'"),
  fc.constant("col; -- comment"),
  fc.constant("col\"; DROP TABLE users--")
);

// ─── 3. Audit-related Arbitraries ────────────────────────────────────────────

/** Valid audit task statuses */
const AUDIT_TASK_STATUSES = ['draft', 'in_progress', 'review', 'approved', 'completed'] as const;

/** Generates valid audit task statuses */
export const auditTaskStatusArb = fc.constantFrom(...AUDIT_TASK_STATUSES);

/** Valid status transitions map (from → to) */
const VALID_STATUS_TRANSITIONS: Array<[string, string]> = [
  ['draft', 'in_progress'],
  ['in_progress', 'review'],
  ['review', 'approved'],
  ['review', 'in_progress'],
  ['approved', 'completed'],
];

/** Generates valid (from, to) status transition pairs */
export const validStatusTransitionArb = fc.constantFrom(...VALID_STATUS_TRANSITIONS);

/** Generates invalid (from, to) status transition pairs */
export const invalidStatusTransitionArb = fc
  .tuple(auditTaskStatusArb, auditTaskStatusArb)
  .filter(([from, to]) => {
    return !VALID_STATUS_TRANSITIONS.some(
      ([validFrom, validTo]) => validFrom === from && validTo === to
    );
  });

/** Generates valid audit types */
export const auditTypeArb = fc.constantFrom(
  AuditType.OPERATIONAL,
  AuditType.FINANCIAL,
  AuditType.COMPLIANCE,
  AuditType.IT,
  AuditType.AML,
  AuditType.GOVERNANCE
);

/** Generates valid risk levels */
export const riskLevelArb = fc.constantFrom(
  RiskLevel.CRITICAL,
  RiskLevel.HIGH,
  RiskLevel.MEDIUM,
  RiskLevel.LOW
);

// ─── 4. Compliance-related Arbitraries ───────────────────────────────────────

/** Valid compliance statuses */
const COMPLIANCE_STATUSES = ['compliant', 'partial', 'non_compliant', 'under_review'] as const;

/** Generates valid compliance statuses */
export const complianceStatusArb = fc.constantFrom(...COMPLIANCE_STATUSES);

/** Generates invalid compliance status strings */
export const invalidComplianceStatusArb = fc
  .string({ minLength: 1, maxLength: 30 })
  .filter((s) => !(COMPLIANCE_STATUSES as readonly string[]).includes(s));

/** Valid source types */
const SOURCE_TYPES = ['cbi_instruction', 'law', 'internal_policy', 'admin_decision'] as const;

/** Generates valid source types */
export const sourceTypeArb = fc.constantFrom(...SOURCE_TYPES);

// ─── 5. Correspondence-related Arbitraries ───────────────────────────────────

/** Generates valid incoming correspondence data matching the Zod schema */
export const incomingCorrespondenceArb = fc.record({
  letter_number: fc.stringMatching(/^[A-Z]{2,4}-\d{3,6}$/).filter((s) => s.length >= 1 && s.length <= 100),
  sender_entity: fc.string({ minLength: 1, maxLength: 255 }).filter((s) => s.trim().length >= 1),
  sender_entity_type: fc.constantFrom(
    EntityType.GOVERNMENT,
    EntityType.PRIVATE,
    EntityType.INTERNAL,
    EntityType.REGULATORY
  ),
  subject: fc.string({ minLength: 1, maxLength: 500 }).filter((s) => s.trim().length >= 1),
  letter_date: fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }).map(
    (d) => d.toISOString().split('T')[0]
  ),
  receipt_date: fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }).map(
    (d) => d.toISOString().split('T')[0]
  ),
  classification: fc.constantFrom(
    CorrespondenceClassification.GENERAL,
    CorrespondenceClassification.AUDIT_RELATED,
    CorrespondenceClassification.COMPLIANCE,
    CorrespondenceClassification.ADMINISTRATIVE,
    CorrespondenceClassification.FINANCIAL,
    CorrespondenceClassification.HR_RELATED
  ),
  priority: fc.constantFrom(
    CorrespondencePriority.NORMAL,
    CorrespondencePriority.URGENT,
    CorrespondencePriority.VERY_URGENT,
    CorrespondencePriority.CONFIDENTIAL,
    CorrespondencePriority.RESTRICTED
  ),
  method: fc.constantFrom(
    SendingMethod.OFFICIAL_MAIL,
    SendingMethod.HAND_DELIVERY,
    SendingMethod.ELECTRONIC_SYSTEM,
    SendingMethod.EMAIL
  ),
  follow_up_required: fc.boolean(),
  response_required: fc.boolean(),
  notes: fc.option(fc.string({ minLength: 0, maxLength: 500 }), { nil: null }),
});

/** Generates valid outgoing correspondence data */
export const outgoingCorrespondenceArb = fc.record({
  letter_date: fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }).map(
    (d) => d.toISOString().split('T')[0]
  ),
  recipient_entity: fc.string({ minLength: 1, maxLength: 255 }).filter((s) => s.trim().length >= 1),
  subject: fc.string({ minLength: 1, maxLength: 500 }).filter((s) => s.trim().length >= 1),
  classification: fc.constantFrom(
    CorrespondenceClassification.GENERAL,
    CorrespondenceClassification.AUDIT_RELATED,
    CorrespondenceClassification.COMPLIANCE,
    CorrespondenceClassification.ADMINISTRATIVE,
    CorrespondenceClassification.FINANCIAL,
    CorrespondenceClassification.HR_RELATED
  ),
  sending_method: fc.constantFrom(
    SendingMethod.OFFICIAL_MAIL,
    SendingMethod.HAND_DELIVERY,
    SendingMethod.ELECTRONIC_SYSTEM,
    SendingMethod.EMAIL
  ),
  attachment_file: fc.option(fc.stringMatching(/^[a-z0-9_-]+\.(pdf|docx|xlsx)$/), { nil: null }),
});

// ─── 6. Security-related Arbitraries ─────────────────────────────────────────

/** Generates HTML strings with XSS payloads (script tags, event handlers, iframes) */
export const maliciousHtmlArb = fc.oneof(
  fc.constant('<script>alert("xss")</script>'),
  fc.constant('<img src=x onerror="alert(1)">'),
  fc.constant('<iframe src="javascript:alert(1)"></iframe>'),
  fc.constant('<div onmouseover="steal()">hover me</div>'),
  fc.constant('<a href="javascript:void(0)" onclick="hack()">click</a>'),
  fc.constant('<svg onload="alert(document.cookie)">'),
  fc.constant('<body onload="malicious()">'),
  fc.constant('<input onfocus="evil()" autofocus>'),
  fc.constant('<marquee onstart="xss()">'),
  fc.constant('<details open ontoggle="alert(1)"><summary>x</summary></details>')
);

/** Generates safe HTML strings (only text, p, span, div, strong, em) */
export const safeHtmlArb = fc.oneof(
  fc.string({ minLength: 1, maxLength: 100 }).map((text) => `<p>${text}</p>`),
  fc.string({ minLength: 1, maxLength: 100 }).map((text) => `<span>${text}</span>`),
  fc.string({ minLength: 1, maxLength: 100 }).map((text) => `<div>${text}</div>`),
  fc.string({ minLength: 1, maxLength: 100 }).map((text) => `<strong>${text}</strong>`),
  fc.string({ minLength: 1, maxLength: 100 }).map((text) => `<em>${text}</em>`),
  fc.string({ minLength: 1, maxLength: 200 }).filter((s) => !/<script|<iframe|on\w+=/i.test(s))
);

/** Generates valid CSRF token strings (64 hex chars) */
export const csrfTokenArb = fc.stringMatching(/^[0-9a-f]{64}$/);

// ─── 7. Pagination-related Arbitraries ───────────────────────────────────────

/** Generates valid page numbers (1-1000) */
export const pageArb = fc.integer({ min: 1, max: 1000 });

/** Generates valid page sizes (1-200) */
export const pageSizeArb = fc.integer({ min: 1, max: 200 });
