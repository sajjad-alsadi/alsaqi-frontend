# Implementation Plan: Permission Matrix Module i18n Bugfix

## Overview

This plan follows the exploratory bugfix methodology: first surface counterexamples via a property-based test that FAILS on the unfixed locale files (Property 1 - Bug Condition), then capture the baseline behavior to preserve via property-based tests that PASS on the unfixed files (Property 2 - Preservation), then apply the purely additive data fix to both locale files, and finally verify the bug is fixed and no existing keys regressed. The fix adds five missing keys (`AuditEvidence`, `AuditFindings`, `ComplianceMatrix`, `Notifications`, `SystemLogs`) to the `modules` namespace in `apps/web/src/locales/en.json` and `apps/web/src/locales/ar.json`. No component or runtime logic changes are required.

## Tasks

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - Affected Module Identifiers Resolve To Localized Labels
  - **CRITICAL**: This test MUST FAIL on the unfixed locale files - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails** - the failure is the expected outcome at this stage
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the missing-key `⚠️` fallback for the five affected identifiers
  - **Scoped PBT Approach**: The bug is deterministic, so scope the property to the concrete failing cases - the cross product of identifiers `{ AuditEvidence, AuditFindings, ComplianceMatrix, Notifications, SystemLogs }` × languages `{ en, ar }`
  - Create an isolated i18next instance (via `createInstance`) loaded from `apps/web/src/locales/en.json` and `apps/web/src/locales/ar.json`, configured with the same `parseMissingKeyHandler` shape as `apps/web/src/i18n.ts` (returns `⚠️ [<key>]`)
  - From Bug Condition in design: `isBugCondition(input)` is true when `input.moduleIdentifier IN { AuditEvidence, AuditFindings, ComplianceMatrix, Notifications, SystemLogs }` AND `NOT keyExists('modules.' + identifier, language)`
  - For each affected identifier and each language, resolve `t('modules.' + identifier, { lng })` and assert the result does NOT contain `⚠️`, is NOT equal to `[modules.<identifier>]`, and has length > 0 (assertions match the Expected Behavior Properties / Property 1 in design)
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (this is correct - it proves the bug exists)
  - Document counterexamples found (e.g. `modules.AuditEvidence` (en) resolves to `⚠️ [modules.AuditEvidence]` instead of `Audit Evidence`; `modules.Notifications` (ar) resolves to `⚠️ [modules.Notifications]` instead of `الإشعارات`)
  - Mark task complete when test is written, run, and the failure is documented
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.2, 2.3, 2.4, 2.5_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Existing Translation Keys Unchanged
  - **IMPORTANT**: Follow observation-first methodology - capture the actual behavior of the UNFIXED locale files first, then assert it
  - Mirror the existing `apps/web/src/locales/job-titles-i18n-preservation.test.ts` harness (isolated `createInstance`, `flattenKeys`, `isBugCondition`)
  - Observe: flatten both `en.json` and `ar.json` into dot-notation key paths and record the embedded value for each key on the unfixed files
  - Observe: a genuinely non-existent key (e.g. `nonexistent.key.that.does.not.exist`) resolves to the `⚠️ [<key>]` fallback on the unfixed files
  - Write property-based test: for all flattened keys WHERE `NOT isBugCondition(key)`, assert `t(key, { lng })` equals the key's embedded value, for `lng` in `{ en, ar }` (from Preservation Requirements in design)
  - Write property-based test: for randomly generated non-existent keys, assert the `parseMissingKeyHandler` `⚠️` fallback still triggers
  - Cover the representative cases from design: pre-existing `modules.*` keys (`AuditCharter`, `Evidence`, `Findings`, `SystemErrorLogs`, etc.) and a representative set from `common`, `userManagement`, `permissions`
  - Property-based testing generates many cases for stronger guarantees that no existing key is accidentally altered
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms the baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [x] 3. Fix for missing module-name translation keys in the permissions matrix

  - [x] 3.1 Add the five missing keys to both locale files
    - In `apps/web/src/locales/en.json`, add to the `modules` object: `"AuditEvidence": "Audit Evidence"`, `"AuditFindings": "Audit Findings"`, `"ComplianceMatrix": "Compliance Matrix"`, `"Notifications": "Notifications"`, `"SystemLogs": "System Logs"`
    - In `apps/web/src/locales/ar.json`, add to the `modules` object: `"AuditEvidence": "أدلة التدقيق"`, `"AuditFindings": "نتائج التدقيق"`, `"ComplianceMatrix": "مصفوفة الامتثال"`, `"Notifications": "الإشعارات"`, `"SystemLogs": "سجلات النظام"`
    - Only ADD the five new key/value pairs per file - do not modify, rename, reorder for semantic effect, or delete any existing key
    - Keep both files valid JSON (mind trailing commas); ensure keys are added to BOTH locales
    - Do NOT change `RolePermissions.tsx`, `i18n.ts`, or any other source file
    - _Bug_Condition: isBugCondition(input) where input.moduleIdentifier IN { AuditEvidence, AuditFindings, ComplianceMatrix, Notifications, SystemLogs } AND key is absent from the modules namespace_
    - _Expected_Behavior: expectedBehavior(result) from design - each affected identifier resolves to a non-empty localized label with no `⚠️` marker and not equal to the raw key_
    - _Preservation: Preservation Requirements from design - all existing keys in modules and every other namespace resolve byte-for-byte identically; missing-key fallback intact_
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [x] 3.2 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Affected Module Identifiers Resolve To Localized Labels
    - **IMPORTANT**: Re-run the SAME test from task 1 - do NOT write a new test
    - The test from task 1 encodes the expected behavior; when it passes it confirms the affected identifiers now resolve to clean localized labels
    - Run the bug condition exploration test from step 1
    - **EXPECTED OUTCOME**: Test PASSES (confirms the bug is fixed in both English and Arabic)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [x] 3.3 Verify preservation tests still pass
    - **Property 2: Preservation** - Existing Translation Keys Unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - Run the preservation property tests from step 2
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions - all existing keys unchanged and missing-key fallback intact)
    - Confirm all tests still pass after the fix
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [x] 4. Add unit and integration tests
  - Unit: resolve each of the five affected `modules.*` keys in English and assert the exact expected label (`Audit Evidence`, `Audit Findings`, `Compliance Matrix`, `Notifications`, `System Logs`)
  - Unit: resolve each of the five affected `modules.*` keys in Arabic and assert the exact expected label (`أدلة التدقيق`, `نتائج التدقيق`, `مصفوفة الامتثال`, `الإشعارات`, `سجلات النظام`)
  - Unit: assert none of the five resolved labels contain the `⚠️` marker, and that both `en.json` and `ar.json` parse as valid JSON and contain the five new keys
  - Integration: render `RolePermissions.tsx` with a permissions list including the five affected identifiers and assert each row shows a clean localized label with no `⚠️`, in English
  - Integration: re-render with the language set to Arabic and assert each affected row shows its Arabic label with no `⚠️`
  - Integration: render a mix of previously-correct and affected identifiers and assert previously-correct rows are unchanged
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 3.3, 3.4_

- [x] 5. Checkpoint - Ensure all tests pass
  - Run the full web test suite (`npx vitest --run`) and confirm the exploration test (now passing), preservation property tests, unit tests, and integration tests all pass
  - Ensure no regressions in the broader suite; ask the user if questions arise

## Task Dependency Graph

```json
{
  "waves": [
    { "wave": 1, "tasks": ["1", "2"] },
    { "wave": 2, "tasks": ["3.1"] },
    { "wave": 3, "tasks": ["3.2", "3.3"] },
    { "wave": 4, "tasks": ["4"] },
    { "wave": 5, "tasks": ["5"] }
  ]
}
```

## Notes

- **Execution order is critical**: tasks 1 and 2 (write and run tests) must be completed BEFORE applying the fix in task 3.
- **Task 1 will FAIL on purpose**: this is expected and required - the failure is the proof the bug exists.
- **Task 2 must PASS before the fix**: it establishes the baseline behavior that must be preserved.
- **Pure data fix**: the fix is limited to adding five key/value pairs in each of two locale files - no changes to `RolePermissions.tsx`, `i18n.ts`, or any other source file.
- **Test framework**: Vitest + React Testing Library (already in the project). Use `npx vitest --run` for a single run (no watch mode).
- **Reference harness**: mirror `apps/web/src/locales/job-titles-i18n-preservation.test.ts` for the isolated-instance, `flattenKeys`, and `isBugCondition` patterns.
- **Both locales required**: keys must be added to both `en.json` and `ar.json` so neither language falls back to the missing-key handler.
