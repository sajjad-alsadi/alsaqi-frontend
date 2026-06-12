# Implementation Plan: Frontend Consistency Fixes

## Overview

This plan converts the design for FIX-FE-1 through FIX-FE-5 into incremental TypeScript coding steps for the `alsaqi` monorepo (`apps/web` and `packages/shared`). It follows the design's implementation order: low-risk local cleanup first (FIX-FE-2 standardize type imports, FIX-FE-4 remove suppressions), then config confirmation (FIX-FE-5), then the backend-coordinated architectural changes (FIX-FE-3 schema relocation, FIX-FE-1 shared-package unification).

Each task builds on the previous ones and ends by wiring the change into the build/test pipeline. Test sub-tasks (marked `*`) are optional and reuse the existing Vitest + `fast-check` stack. The four correctness properties from the design are each implemented as a single property-based test placed close to the code it validates.

Notes on governance gates (these are review/coordination gates, not coding steps — the coding tasks below build the *enforcing checks* only):
- FIX-FE-3 (Task 6) must not merge without recorded Backend_Team approval (criterion 3.7).
- FIX-FE-1 teardown (Task 8) must not edit/remove `packages/shared` until a Unified_Source decision is agreed (criteria 1.2, 1.5).

## Tasks

- [x] 1. Standardize the type-import source across API modules (FIX-FE-2)
  - [x] 1.1 Generate the duplicate-type inventory
    - Add a script under `apps/web/scripts/` (or `scripts/`) that emits a list of `{ typeName, filePath, status }` records for every Local_Type defined under `apps/web/src/api/modules/` or `apps/web/src/types` that also exists in `@alsaqi/shared`
    - Mark each entry `duplicate-removable` or `divergent-needs-reconciliation` (per the design note on divergent local types: local `AuditFinding`, `Recommendation`, `AuditPlan`, etc.)
    - Cover every duplicate matching the condition so none is absent from the list
    - _Requirements: 2.4_

  - [x] 1.2 Standardize the `CentralBankInstruction` import in `regulatory.ts`
    - Replace `import type { CentralBankInstruction } from '../../types'` with an import from the `@alsaqi/shared` package specifier in `apps/web/src/api/modules/regulatory.ts`
    - Ensure no local definition and no relative-path (`./` or `../`) import of `CentralBankInstruction` remains in that file
    - _Requirements: 2.1_

  - [x] 1.3 Remove removable duplicate Local_Types and repoint references
    - For each `duplicate-removable` entry from the inventory, remove the Local_Type from `apps/web/src/types.ts` and update every reference to import the corresponding Shared_Type from `@alsaqi/shared`
    - Only delete a Local_Type once all its references resolve against the shared type; leave `divergent-needs-reconciliation` types in place (flagged for FIX-FE-1/FIX-FE-3 reconciliation)
    - Ensure zero relative-path imports and zero local re-definitions of Shared_Types remain under `apps/web/src/api/modules/`
    - _Requirements: 2.2, 2.3, 2.5, 2.7_

  - [x] 1.4 Write structural guard test for import standardization
    - Add a Vitest/lint guard asserting no file under `apps/web/src/api/modules/` has a relative-path import of an `@alsaqi/shared`-exported name and none are locally re-declared
    - Assert no duplicate Local_Type for a shared name remains under `apps/web/src/types`
    - _Requirements: 2.1, 2.2, 2.3_

- [x] 2. Remove TypeScript error suppressions (FIX-FE-4)
  - [x] 2.1 De-suppress schemas in `dashboard.ts`
    - In `apps/web/src/api/modules/dashboard.ts`, drop the explicit `: z.ZodType<T>` annotations and remove every `@ts-expect-error` bypassing the `exactOptionalPropertyTypes` conflict
    - Let Zod infer the type and re-establish the type link with a compile-time assertion (e.g. `const _c: DashboardStats = {} as z.infer<typeof DashboardStatsSchema>`), without `@ts-ignore`/`as any`/`as unknown`
    - Keep each `z.object({...})` shape, field list, `.optional()` markers, and unions byte-for-byte equivalent so runtime validation is unchanged
    - _Requirements: 4.1, 4.2, 4.5, 4.6_

  - [x] 2.2 De-suppress schemas in `risk-register.ts`
    - Apply the same de-suppression pattern in `apps/web/src/api/modules/risk-register.ts` (`RiskItemSchema` and any other suppressed schema)
    - Preserve runtime validation behavior exactly
    - _Requirements: 4.1, 4.2, 4.5, 4.6_

  - [x] 2.3 De-suppress schemas in `user-management.ts`
    - Apply the same de-suppression pattern in `apps/web/src/api/modules/user-management.ts` (`RoleSchema`, `PermissionSchema`, `SessionSchema`, `SettingsSchema`, `JobTitleSchema`)
    - Preserve runtime validation behavior exactly
    - _Requirements: 4.1, 4.2, 4.5, 4.6_

  - [x] 2.4 Write guard test for zero suppressions in the API layer
    - Add a Vitest/lint guard asserting zero `@ts-expect-error`, no new `@ts-ignore`, and no `as any`/`as unknown` masking anywhere under `apps/web/src/api`
    - Assert none of the affected schemas carry a manual `: z.ZodType<` annotation
    - _Requirements: 4.3, 4.5_

- [x] 3. Checkpoint - type-check the local cleanup
  - Ensure all tests pass and `tsc --noEmit` with `exactOptionalPropertyTypes` enabled reports zero errors for `apps/web`; ask the user if questions arise.
  - _Requirements: 2.6, 4.4_

- [x] 4. Confirm API base-URL and version configuration (FIX-FE-5)
  - [x] 4.1 Extract a pure `resolveBaseUrl` helper and set dev env values
    - In `apps/web/src/api/httpClient.ts` (and `client.ts` as needed), extract base-URL resolution into a pure `resolveBaseUrl(value?: string)` returning the value when non-empty and `/api` when unset/empty/whitespace
    - Update `apps/web/.env` to `VITE_API_URL=http://localhost:3000/api` and document it in `.env.example` (per the design default for the development environment)
    - _Requirements: 5.1, 5.2_

  - [x] 4.2 Write property test for base-URL resolution
    - **Feature: frontend-consistency-fixes, Property 3: API base-URL resolution**
    - Generate `undefined`/empty/whitespace and arbitrary non-empty strings; assert the `/api` fallback vs. pass-through rule with `numRuns >= 100`
    - **Validates: Requirements 5.2**

  - [x] 4.3 Extract a pure envelope-unwrap helper
    - Extract the response interceptor's unwrap branch into a small pure helper (mirroring `envelope.ts`'s `toData`) that returns the inner `data` only when the body is an object with `success === true` and a `data` field, and returns the payload unchanged otherwise
    - Wire the interceptor in `apps/web/src/api/client.ts` to use the helper without changing behavior
    - _Requirements: 5.5, 5.8_

  - [x] 4.4 Write property test for envelope unwrapping
    - **Feature: frontend-consistency-fixes, Property 2: Response envelope unwrapping is data-projection on success envelopes and identity otherwise**
    - Generate arbitrary `x` via `fc.anything()`; assert `unwrap({success:true,data:x})` deep-equals `x` and `unwrap(p)` is identity for non-envelope `p` (arrays, primitives, `null`, `{success:false}`, objects without `data`), `numRuns >= 100`
    - **Validates: Requirements 5.5, 5.8**

  - [x] 4.5 Confirm version-comparison and mismatch-notification logic
    - In `apps/web/src/api/client.ts`, confirm `isMajorMinorMatch` compares only major/minor (patch-insensitive), `checkVersionMismatch` runs only when the `x-api-version` header is present, and a mismatch triggers a non-dismissible `showVersionMismatchNotification` (reload-only, shown at most once)
    - Correct any deviation so behavior matches the criteria
    - _Requirements: 5.4, 5.6, 5.7_

  - [x] 4.6 Write property test for version-match notification
    - **Feature: frontend-consistency-fixes, Property 4: Patch-insensitive version match drives the mismatch notification**
    - Generate version triples (equal major/minor with differing/absent patch → match, no notification; perturbed major or minor → mismatch, notification shown; no header → no comparison, no notification) and drive the side effect through a jsdom harness, asserting at-most-once display, `numRuns >= 100`
    - **Validates: Requirements 5.4, 5.6, 5.7**

  - [x] 4.7 Write smoke test for version constant and dev URL format
    - Assert `API_VERSION` matches `^\d+\.\d+$` (MAJOR.MINOR, no patch) and that the development `VITE_API_URL` equals `http://localhost:3000/api`
    - _Requirements: 5.1, 5.3_

- [x] 5. Checkpoint - confirm config and run the suite
  - Ensure all tests pass for `apps/web` and `packages/shared`; ask the user if questions arise.
  - _Requirements: 5.3_

- [x] 6. Relocate local Zod schemas into the shared package (FIX-FE-3 — requires recorded Backend_Team approval, criterion 3.7)
  - [x] 6.1 Snapshot baseline copies of the schemas being relocated
    - Add a checked-in baseline copy of each original schema (`RiskItemSchema`, `InstructionSchema`, `DashboardStatsSchema` (+ `AuditProgressByTypeSchema`, `RiskLevelBreakdownSchema`), `RoleSchema`, `PermissionSchema`, `SessionSchema`, `SettingsSchema`, `JobTitleSchema`) under a test fixtures path for behavioral-parity comparison
    - _Requirements: 3.9_

  - [x] 6.2 Relocate `RiskItemSchema` to shared and consume it
    - Move `RiskItemSchema` into `packages/shared/src/validators/risk-register.ts` with identical fields/rules, deriving and exporting its type via `z.infer` (FIX-FE-4 pattern), and export it from `validators/index.ts`
    - Add exactly one Endpoint_Contract under `packages/shared/src/types/endpoints/risk-register.ts` referencing the validator and register it in `endpoints/index.ts`
    - Remove the local definition from `apps/web/src/api/modules/risk-register.ts` and import the validator from `@alsaqi/shared`
    - _Requirements: 3.1, 3.5, 3.6, 3.8, 3.10_

  - [x] 6.3 Relocate `InstructionSchema` to shared and consume it
    - Move `InstructionSchema` into `packages/shared/src/validators/regulatory.ts` with identical fields/rules; export schema + `z.infer` type from `validators/index.ts`
    - Add exactly one Endpoint_Contract under `packages/shared/src/types/endpoints/regulatory.ts` referencing the validator; register in `endpoints/index.ts`
    - Remove the local definition from `apps/web/src/api/modules/regulatory.ts` and import from `@alsaqi/shared`
    - _Requirements: 3.2, 3.5, 3.6, 3.8, 3.10_

  - [x] 6.4 Relocate `DashboardStatsSchema` (and sub-schemas) to shared and consume it
    - Move `DashboardStatsSchema`, `AuditProgressByTypeSchema`, and `RiskLevelBreakdownSchema` into `packages/shared/src/validators/dashboard.ts` with identical fields/rules; export schema(s) + types from `validators/index.ts`
    - Add exactly one Endpoint_Contract under `packages/shared/src/types/endpoints/dashboard.ts` referencing the validator; register in `endpoints/index.ts`
    - Remove the local definitions from `apps/web/src/api/modules/dashboard.ts` and import from `@alsaqi/shared`
    - _Requirements: 3.3, 3.5, 3.6, 3.8, 3.10_

  - [x] 6.5 Relocate the five user-management schemas to shared and consume them
    - Move `RoleSchema`, `PermissionSchema`, `SessionSchema`, `SettingsSchema`, `JobTitleSchema` into `packages/shared/src/validators/user-management.ts` with identical fields/rules; export schemas + types from `validators/index.ts`
    - Add exactly one Endpoint_Contract under `packages/shared/src/types/endpoints/user-management.ts` referencing the validators; register in `endpoints/index.ts`
    - Remove the local definitions from `apps/web/src/api/modules/user-management.ts` and import from `@alsaqi/shared`
    - _Requirements: 3.4, 3.5, 3.6, 3.8, 3.10_

  - [x] 6.6 Write property test for schema behavioral equivalence
    - **Feature: frontend-consistency-fixes, Property 1: Schema relocation and de-suppression preserve validation behavior**
    - Quantify over all relocated/de-suppressed schemas; for generated inputs (valid shapes plus malformed variants via `fc.anything()` and field-mutation arbitraries) assert `safeParse(input).success` parity against the baseline and deep-equal parsed output on success, `numRuns >= 100`
    - **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 4.6**

  - [x] 6.7 Write guard test for single-definition and contract counts
    - Assert exactly one definition of each relocated schema exists repository-wide, located in `packages/shared/src/validators/`, and exactly one Endpoint_Contract exists per relocated schema
    - Ensure the existing response-validation suites still pass
    - _Requirements: 3.8, 3.9_

- [x] 7. Checkpoint - validate the schema relocation
  - Ensure all tests pass for `apps/web` and `packages/shared`; ask the user if questions arise.
  - _Requirements: 3.9_

- [x] 8. Add shared-package unification guards and switch-over (FIX-FE-1 — gated by Unified_Source decision, criteria 1.2/1.5)
  - [x] 8.1 Record the Extra_Shared_Types baseline and type-equality check
    - Add a checked-in baseline snapshot (`.d.ts` or `satisfies`-based fixture) of the 8 Extra_Shared_Types (`DashboardStats`, `AuditProgressByType`, `RiskLevelBreakdown`, `Role`, `Permission`, `UserSession`, `JobTitle`, `UserManagementSettings`)
    - Add a type-level equality check that fails if any field is deleted, renamed, narrowed, or has its optionality/type changed
    - _Requirements: 1.1, 1.6_

  - [x] 8.2 Add the `packages/shared` freeze guard
    - Add a CI check script that runs a version-control diff over `packages/shared` and fails if any line changed while no Unified_Source is agreed (exempting the FIX-FE-3 relocation commits performed under recorded backend approval)
    - _Requirements: 1.2_

  - [x] 8.3 Implement the Unified_Source switch-over and teardown checks
    - Add a check/script that repoints `@alsaqi/shared` imports to the Unified_Source and asserts zero imports resolve from the duplicated local copy; if any import is unresolved or fails to build, block removal, retain local files unchanged, and surface the unresolved imports
    - Gate teardown (removal of the duplicated local copy) behind: all imports resolve from the Unified_Source, the type-equality check passes, and `tsc` reports zero errors and zero local-copy imports
    - _Requirements: 1.3, 1.4, 1.5_

  - [x] 8.4 Write guard tests for unification preconditions and regression protection
    - Assert the freeze guard fails on any `packages/shared` line change (pre-decision), the teardown precondition checklist blocks removal when any condition is unmet, and a review-gate check rejects (with a recorded rejection) any change degrading one of the 8 Extra_Shared_Types
    - _Requirements: 1.2, 1.4, 1.5, 1.6_

- [x] 9. Final checkpoint - full build and test pass
  - Run typecheck, lint, unit + property tests, and build for `apps/web` and `packages/shared`; ensure everything passes and ask the user if questions arise.
  - _Requirements: 1.5, 2.6, 3.9, 4.4_

## Notes

- Tasks marked with `*` are optional test/guard tasks and can be skipped for a faster MVP.
- The implementation language is TypeScript (existing stack: Vitest + `fast-check`).
- Each property test runs a minimum of 100 iterations and is tagged with its design property number using the format `Feature: frontend-consistency-fixes, Property {number}: {property_text}`.
- Property tests target the only input-varying pure logic: relocated/de-suppressed Zod schemas (Property 1) and the HTTP_Client interceptor logic (Properties 2, 3, 4). All other criteria are structural/build-time gates verified by static checks, type-level assertions, single `tsc` runs, and CI guards.
- Governance gates (Backend_Team approval for FIX-FE-3, Unified_Source decision for FIX-FE-1) are coordination steps, not coding tasks; the coding tasks build only the enforcing checks.
- Commands (run from repo root, no watch mode): `npm run typecheck -w @alsaqi/web`, `npm run lint -w @alsaqi/web`, `npm run test -w @alsaqi/web`, `npm run test -w @alsaqi/shared`, `npm run build -w @alsaqi/web`.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "8.1", "8.2"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["1.3", "1.4"] },
    { "id": 3, "tasks": ["2.1", "2.2", "2.3"] },
    { "id": 4, "tasks": ["2.4", "4.1", "4.3"] },
    { "id": 5, "tasks": ["4.2", "4.4", "4.5", "4.7"] },
    { "id": 6, "tasks": ["4.6", "6.1"] },
    { "id": 7, "tasks": ["6.2"] },
    { "id": 8, "tasks": ["6.3"] },
    { "id": 9, "tasks": ["6.4"] },
    { "id": 10, "tasks": ["6.5"] },
    { "id": 11, "tasks": ["6.6", "6.7"] },
    { "id": 12, "tasks": ["8.3", "8.4"] }
  ]
}
```
