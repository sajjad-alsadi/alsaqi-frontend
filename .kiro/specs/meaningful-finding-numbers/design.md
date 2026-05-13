# Meaningful Finding Numbers Bugfix Design

## Overview

Finding numbers currently display raw UUIDs in the UI and are generated using a generic department-based format (`{DeptCode}-FD-{YY}-{NNN}`) that is disconnected from the parent audit plan. The fix involves two changes: (1) updating the `FindingCard` UI to display `finding.finding_number` and the parent plan's `plan_code` instead of raw UUIDs, and (2) updating the code generation logic in `AppCodeGenerator` to derive the `finding_number` from the parent audit plan's `plan_code` using the format `{plan_code}-FD-{NNN}`.

## Glossary

- **Bug_Condition (C)**: The condition that triggers the bug — when a finding is displayed or created, the system uses raw UUIDs or a generic code format instead of a meaningful plan-derived number
- **Property (P)**: The desired behavior — findings display `finding_number` derived from the parent plan's `plan_code`, and the header shows `plan_code` instead of UUID
- **Preservation**: Existing behavior that must remain unchanged — fallback code generation when no `plan_code` exists, other entity code generation, existing finding display, and all non-number UI elements
- **AppCodeGenerator**: The utility class in `src/server/utils/AppCodeGenerator.ts` that generates sequential codes for various entities
- **BaseService.create**: The generic creation method in `src/server/services/BaseService.ts` that invokes `AppCodeGenerator` for code generation
- **FindingCard**: The React component in `src/components/FindingCard.tsx` that renders individual audit findings
- **plan_code**: The human-readable code assigned to an audit plan (e.g., `IA-PL-25-003`)
- **finding_number**: The code column on `audit_findings` table that should contain a meaningful identifier (e.g., `IA-PL-25-003-FD-001`)

## Bug Details

### Bug Condition

The bug manifests in two areas: (1) the `FindingCard` component displays `finding.id` (UUID) and `finding.audit_id` (UUID) instead of `finding.finding_number` and the parent plan's `plan_code`, and (2) when a new finding is created under an audit plan that has a `plan_code`, the `AppCodeGenerator.generateCode` method ignores the plan context and generates a generic `{DeptCode}-FD-{YY}-{NNN}` code.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type { action: 'display' | 'create', finding: AuditFinding, auditPlan?: AuditPlan }
  OUTPUT: boolean
  
  IF input.action == 'display' THEN
    RETURN finding.id IS DISPLAYED AS IDENTIFIER
           OR finding.audit_id IS DISPLAYED AS PLAN REFERENCE
  END IF
  
  IF input.action == 'create' THEN
    RETURN input.auditPlan.plan_code IS NOT NULL
           AND generated finding_number DOES NOT START WITH input.auditPlan.plan_code
  END IF
  
  RETURN false
END FUNCTION
```

### Examples

- **Display bug**: Finding with `id = "deb0a161-f3bf-9d36-4de0-6343f183af8e"` and `finding_number = "IA-FD-25-001"` shows the UUID `deb0a161...` as the title instead of `IA-FD-25-001`
- **Display bug (plan reference)**: Finding header shows `audit_id = "a1b2c3d4-..."` instead of the parent plan's `plan_code = "IA-PL-25-003"`
- **Generation bug**: Creating a finding under plan `IA-PL-25-003` generates `IA-FD-25-004` (generic) instead of `IA-PL-25-003-FD-001` (plan-derived)
- **Edge case (no plan_code)**: Creating a finding under a plan with no `plan_code` should still generate `IA-FD-25-001` using the existing fallback logic

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Fallback code generation for findings when the parent audit plan has no `plan_code` must continue using `{DeptCode}-FD-{YY}-{NNN}`
- Code generation for all other entities (audit_plans, audit_programs, audit_tasks, recommendations, risk_register, compliance_items) must remain unchanged
- Existing findings with previously generated `finding_number` values must display correctly without re-numbering
- Finding detail fields (condition, criteria, cause, consequence, recommendation, risk_level, status) must render unchanged
- Mouse/touch interactions, edit functionality, and recommendation navigation must continue working

**Scope:**
All inputs that do NOT involve finding display identifiers or finding creation under a plan with `plan_code` should be completely unaffected by this fix. This includes:
- Code generation for non-finding entities
- Finding creation when parent plan has no `plan_code`
- All other UI elements in FindingCard (badges, buttons, detail fields)
- Other components that reference findings

## Hypothesized Root Cause

Based on the bug description, the most likely issues are:

1. **FindingCard displays `finding.id` instead of `finding.finding_number`**: In `FindingCard.tsx` line 50, the component renders `{t('findings.findingNumber')}{formatNumber(finding.id)}` — it explicitly uses `finding.id` (UUID) rather than `finding.finding_number`. The `AuditFinding` TypeScript interface also lacks a `finding_number` field, though the database column exists.

2. **FindingCard displays `finding.audit_id` instead of plan_code**: In `FindingCard.tsx` line 53, the component renders `{formatNumber(finding.audit_id)}` — it shows the raw UUID foreign key instead of resolving the parent plan's `plan_code`.

3. **AppCodeGenerator ignores parent plan context**: The `generateCode` method only accepts `tableName` and `departmentName` parameters. It has no mechanism to receive or use the parent audit plan's `plan_code`. It always generates codes in the format `{DeptCode}-{DocType}-{YY}-{NNN}`.

4. **BaseService.create doesn't pass plan context**: When creating a finding, `BaseService.create` calls `AppCodeGenerator.generateCode(tableName, body.department)` without passing `body.audit_id` or the parent plan's `plan_code`.

## Correctness Properties

Property 1: Bug Condition - Finding Number Displays Plan-Derived Code

_For any_ finding that has a `finding_number` value, the FindingCard component SHALL display `finding.finding_number` as the finding identifier (not `finding.id`), and when the parent audit plan has a `plan_code`, the header SHALL display that `plan_code` instead of the raw `audit_id` UUID.

**Validates: Requirements 2.1, 2.3**

Property 2: Bug Condition - Finding Number Generation Uses Plan Code

_For any_ finding created under an audit plan that has a non-null `plan_code`, the system SHALL generate a `finding_number` in the format `{plan_code}-FD-{NNN}` where `{NNN}` is a zero-padded sequential counter scoped to that specific audit plan.

**Validates: Requirements 2.2**

Property 3: Preservation - Fallback and Other Entity Code Generation

_For any_ finding created under an audit plan that has NO `plan_code`, the system SHALL generate a `finding_number` using the existing fallback format `{DeptCode}-FD-{YY}-{NNN}`. For all other entities, code generation SHALL produce the same results as the original `AppCodeGenerator.generateCode` function.

**Validates: Requirements 3.1, 3.2, 3.3**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `src/types.ts`

**Interface**: `AuditFinding`

**Specific Changes**:
1. **Add `finding_number` field**: Add `finding_number?: string` to the `AuditFinding` interface so the UI can access it type-safely.

---

**File**: `src/components/FindingCard.tsx`

**Component**: `FindingCard`

**Specific Changes**:
2. **Display `finding_number` instead of `finding.id`**: Change line 50 from `{formatNumber(finding.id)}` to display `finding.finding_number` (with fallback to `finding.id` for backward compatibility with findings that may not have a `finding_number`).
3. **Display `plan_code` instead of `finding.audit_id`**: Change line 53 to display the parent plan's `plan_code`. This requires either: (a) passing the plan_code as a prop, (b) joining the data at the API level, or (c) adding a lookup. The simplest approach is to add a `plan_code` field to the finding response via a JOIN or to pass it as a prop from the parent component.

---

**File**: `src/server/utils/AppCodeGenerator.ts`

**Class**: `AppCodeGenerator`

**Specific Changes**:
4. **Add `generateFindingCode` method**: Create a new static method that accepts `auditId` and generates a finding number derived from the parent plan's `plan_code`. The method should:
   - Look up the audit plan by `auditId` to retrieve its `plan_code`
   - If `plan_code` exists, generate `{plan_code}-FD-{NNN}` where NNN is sequential per plan
   - If `plan_code` is null/empty, fall back to the existing `generateCode` logic

---

**File**: `src/server/services/BaseService.ts`

**Method**: `create`

**Specific Changes**:
5. **Use plan-aware generation for findings**: In the `create` method, when `tableName === 'audit_findings'` and `body.audit_id` is present, call the new `AppCodeGenerator.generateFindingCode(body.audit_id)` instead of the generic `generateCode`. Fall back to generic generation if `audit_id` is not provided.

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bug on unfixed code, then verify the fix works correctly and preserves existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix. Confirm or refute the root cause analysis. If we refute, we will need to re-hypothesize.

**Test Plan**: Write tests that verify FindingCard renders `finding_number` and that `AppCodeGenerator` generates plan-derived codes. Run these tests on the UNFIXED code to observe failures and understand the root cause.

**Test Cases**:
1. **FindingCard ID Display Test**: Render FindingCard with a finding that has `finding_number = "IA-PL-25-003-FD-001"` and verify the rendered output contains this value (will fail on unfixed code — it shows UUID instead)
2. **FindingCard Plan Reference Test**: Render FindingCard and verify it shows `plan_code` instead of `audit_id` UUID (will fail on unfixed code)
3. **Code Generation with Plan Code Test**: Create a finding under a plan with `plan_code = "IA-PL-25-003"` and assert `finding_number` starts with `IA-PL-25-003-FD-` (will fail on unfixed code — generates `IA-FD-25-XXX`)
4. **Sequential Numbering Test**: Create multiple findings under the same plan and verify sequential numbering `FD-001`, `FD-002`, `FD-003` (will fail on unfixed code)

**Expected Counterexamples**:
- FindingCard renders UUID instead of `finding_number`
- `AppCodeGenerator.generateCode` returns `IA-FD-25-XXX` instead of `IA-PL-25-003-FD-001`
- Possible causes: missing field in interface, wrong field referenced in JSX, no plan-aware code generation path

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed function produces the expected behavior.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  IF input.action == 'display' THEN
    rendered := renderFindingCard(input.finding)
    ASSERT rendered CONTAINS input.finding.finding_number
    ASSERT rendered CONTAINS input.auditPlan.plan_code
    ASSERT rendered DOES NOT CONTAIN input.finding.id (as identifier)
  END IF
  
  IF input.action == 'create' THEN
    result := createFinding(input.finding, input.auditPlan)
    ASSERT result.finding_number STARTS WITH input.auditPlan.plan_code + "-FD-"
    ASSERT result.finding_number MATCHES PATTERN "{plan_code}-FD-{NNN}"
  END IF
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed function produces the same result as the original function.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  IF input.action == 'create' AND input.auditPlan.plan_code IS NULL THEN
    ASSERT generateFindingCode(input) == AppCodeGenerator_original.generateCode('audit_findings', input.department)
  END IF
  
  FOR ALL entityType IN ['audit_plans', 'audit_programs', 'audit_tasks', 'recommendations', 'risk_register', 'compliance_items'] DO
    ASSERT AppCodeGenerator_fixed.generateCode(entityType, dept) == AppCodeGenerator_original.generateCode(entityType, dept)
  END FOR
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many test cases automatically across the input domain
- It catches edge cases that manual unit tests might miss
- It provides strong guarantees that behavior is unchanged for all non-buggy inputs

**Test Plan**: Observe behavior on UNFIXED code first for non-finding entity code generation and finding creation without `plan_code`, then write property-based tests capturing that behavior.

**Test Cases**:
1. **Fallback Code Preservation**: Create findings under plans with no `plan_code` and verify the generated code matches the original `{DeptCode}-FD-{YY}-{NNN}` format
2. **Other Entity Code Preservation**: Generate codes for audit_plans, audit_programs, audit_tasks, recommendations, risk_register, compliance_items and verify output is identical to original
3. **Existing Finding Display Preservation**: Render FindingCard with findings that have old-format `finding_number` values and verify they display correctly
4. **UI Detail Fields Preservation**: Verify condition, criteria, cause, consequence, recommendation fields render unchanged after the fix

### Unit Tests

- Test `AppCodeGenerator.generateFindingCode` with a plan that has `plan_code`
- Test `AppCodeGenerator.generateFindingCode` with a plan that has no `plan_code` (fallback)
- Test sequential numbering: first finding gets `001`, second gets `002`
- Test FindingCard renders `finding_number` when available
- Test FindingCard falls back to `finding.id` when `finding_number` is absent
- Test FindingCard displays `plan_code` in the header

### Property-Based Tests

- Generate random `plan_code` values and verify generated `finding_number` always matches `{plan_code}-FD-{NNN}` pattern
- Generate random sequences of finding creations and verify sequential numbering is correct and gap-free per plan
- Generate random entity types (non-finding) and verify `AppCodeGenerator.generateCode` output is unchanged
- Generate random findings with/without `finding_number` and verify FindingCard displays the correct identifier

### Integration Tests

- Test full finding creation flow: create audit plan → create finding → verify finding_number format
- Test multiple findings under same plan get sequential numbers
- Test finding display end-to-end: API returns finding with `finding_number` → UI renders it correctly
- Test mixed scenario: plans with and without `plan_code` both generate valid finding numbers
