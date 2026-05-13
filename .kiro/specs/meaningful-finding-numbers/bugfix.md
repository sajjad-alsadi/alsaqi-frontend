# Bugfix Requirements Document

## Introduction

عند عرض ملاحظة تدقيق (Finding) في واجهة المستخدم، يظهر رقم UUID عشوائي (مثل `deb0a161f3bf-9d36-4de0-6343-f183af8e`) بدلاً من رقم ذي معنى مرتبط بخطة التدقيق. المشكلة ذات شقين: (1) الواجهة تعرض `finding.id` (UUID) بدلاً من `finding.finding_number`، و(2) `AppCodeGenerator` يولّد ترقيماً بصيغة `{DeptCode}-FD-{YY}-{NNN}` غير مرتبط بخطة التدقيق الأم. السلوك المطلوب هو أن يكون الترقيم مشتقاً من `plan_code` لخطة التدقيق المرتبطة (مثال: `IA-PL-25-003-FD-001`).

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN a finding is displayed in FindingCard THEN the system shows the raw UUID (`finding.id`) as the finding identifier instead of a meaningful number

1.2 WHEN a new finding is created via BaseService.create THEN the system generates a `finding_number` using the format `{DeptCode}-FD-{YY}-{NNN}` which is independent of the parent audit plan's `plan_code`

1.3 WHEN the user views the finding header THEN the system also displays `finding.audit_id` (UUID) as the audit plan reference instead of the plan's `plan_code`

### Expected Behavior (Correct)

2.1 WHEN a finding is displayed in FindingCard THEN the system SHALL show `finding.finding_number` (e.g., `IA-PL-25-003-FD-001`) as the finding identifier

2.2 WHEN a new finding is created and the parent audit plan has a `plan_code` THEN the system SHALL generate a `finding_number` using the format `{plan_code}-FD-{NNN}` where `{NNN}` is a sequential counter scoped to that specific audit plan

2.3 WHEN the user views the finding header THEN the system SHALL display the parent audit plan's `plan_code` (e.g., `IA-PL-25-003`) instead of the raw UUID

### Unchanged Behavior (Regression Prevention)

3.1 WHEN a finding is created for an audit plan that has no `plan_code` THEN the system SHALL CONTINUE TO generate a fallback code using the existing format `{DeptCode}-FD-{YY}-{NNN}`

3.2 WHEN other entities (audit_plans, audit_programs, audit_tasks, recommendations, risk_register, compliance_items) are created THEN the system SHALL CONTINUE TO generate their codes using the existing `AppCodeGenerator` format without modification

3.3 WHEN existing findings with previously generated `finding_number` values are displayed THEN the system SHALL CONTINUE TO display them correctly without requiring re-numbering

3.4 WHEN finding details (condition, criteria, cause, consequence, recommendation, risk_level, status) are displayed THEN the system SHALL CONTINUE TO render them unchanged
