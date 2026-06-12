# Implementation Plan

## Overview

This plan fixes the envelope-contract mismatch behind the Compliance Matrix "failed to load data" error and the four fragile paginated consumers. It follows the exploratory bugfix workflow: write the bug condition exploration tests first (they must FAIL on unfixed code), write preservation tests (they must PASS on unfixed code), apply a shared envelope-agnostic fix, then verify both sets of tests. Property numbering matches the design: Properties 1–2 are Bug Conditions, Properties 3–4 are Preservation.

## Task Dependency Graph

```json
{
  "waves": [
    {
      "wave": 1,
      "tasks": ["1", "2", "3"],
      "description": "Independent: write bug condition exploration tests (must FAIL on unfixed code) and preservation tests (must PASS on unfixed code)."
    },
    {
      "wave": 2,
      "tasks": ["4.1"],
      "description": "Create the shared envelope.ts normalization helper."
    },
    {
      "wave": 3,
      "tasks": ["4.2", "4.3"],
      "description": "Apply the envelope-agnostic fix to Compliance Matrix and paginated consumers using the helper."
    },
    {
      "wave": 4,
      "tasks": ["4.4", "4.5"],
      "description": "Re-run exploration tests (now pass) and preservation tests (still pass)."
    },
    {
      "wave": 5,
      "tasks": ["5"],
      "description": "Checkpoint: ensure the full affected test suite passes."
    }
  ]
}
```

Tasks 1, 2, and 3 are independent of one another and must be completed before task 4. Within task 4, the helper (4.1) precedes the consumer fixes (4.2, 4.3), which precede verification (4.4, 4.5). Task 5 runs last.

## Tasks

- [x] 1. Write Compliance Matrix bug condition exploration test
  - **Property 1: Bug Condition** - Compliance Matrix Envelope-Agnostic Consumption
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the bug exists in `ComplianceMatrixPage.tsx`
  - **Scoped PBT Approach**: Scope the property to the concrete unwrapped shapes the interceptor actually produces. Generate arbitrary unwrapped list payloads (arrays of varying length, including empty) plus the deterministic `null` case
  - **IMPORTANT - bypass the mask**: Do NOT mock `../../api/httpClient` with the already-enveloped shape (the existing unit test does this and hides the bug). Mock `api.get` to return the UNWRAPPED payloads the real interceptor produces: an array (no `success` field) for `/compliance`, `null` for the null-data case, the inner object for `/compliance/summary`, and the inner array for `/users/summary` (or `/users`)
  - Bug Condition (from design `isBugCondition`): for ComplianceMatrix, `X is null OR X has no field named "success"`
  - Test that for all such inputs, the fixed `fetchItems` / `fetchSummary` / `fetchUsers` do not crash, populate state from the unwrapped payload, render an empty list for `null`/empty, and never surface `complianceMatrix.loadError` (Expected Behavior Properties from design)
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (this is correct - it proves the bug exists)
  - Document counterexamples found, e.g. "`/compliance` unwrapped to `[...]` → `setItems` never called, items never render", "`/compliance` unwrapped to `null` → `TypeError` reading `.success` → `complianceMatrix.loadError` shown"
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [x] 2. Write paginated lists bug condition exploration test
  - **Property 2: Bug Condition** - Paginated Lists Envelope-Agnostic Consumption with Pagination Fallback
  - **CRITICAL**: This test MUST FAIL (or surface lost pagination) on unfixed code - it documents the fragile/at-risk path
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples for `OutgoingRegister.tsx`, `IncomingRegister.tsx`, `CorrespondenceArchive.tsx`, and `SystemErrorLogs/index.tsx` when their endpoints are success-enveloped and unwrapped to an inner array
  - **Scoped PBT Approach**: Generate arbitrary unwrapped array payloads (varying length, including empty) for each paginated screen's endpoint
  - **IMPORTANT - exercise the unwrapped shape**: Mock `api.get` to resolve to an unwrapped array (no `data` / `pagination` siblings) for `/correspondence/outgoing|incoming|archive` and `/system-errors`
  - Bug Condition (from design `isBugCondition`): for paginated screens, `X is null OR X has no field named "data" OR X has no field named "pagination"`
  - Test that for all such inputs, the fixed `fetchData` populates the list from the unwrapped array, does not crash, and falls back to a sensible pagination value (`total` defaults to the loaded item count, `totalPages` defaults to `1`)
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS / pagination lost (this is correct - it proves the fragile path is broken when unwrapped)
  - Document counterexamples found, e.g. "`/correspondence/outgoing` unwrapped to `[...]` → `response.data.data` undefined, list empty and `pagination` sibling discarded → `total`/`totalPages` lost"
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.5, 1.6, 1.7, 1.8_

- [x] 3. Write preservation property tests (BEFORE implementing fix)
  - **Property 3: Preservation** - Compliance Matrix & Paginated Non-Enveloped Baseline Unchanged
  - **IMPORTANT**: Follow observation-first methodology - observe behavior on UNFIXED code, then encode it
  - **Compliance Matrix (Property 3 in design)**: Observe that a rejected `/compliance` promise still shows `complianceMatrix.loadError` (toast + error panel) on unfixed code; observe that the registry/gap-matrix/dashboard tabs render and the search/source-type/status filters work after a successful load. Write tests capturing this behavior
  - **Paginated baseline (Property 4 in design)**: Observe on UNFIXED code that for the current non-enveloped `{ data: [...], pagination: { total, totalPages } }` response, each screen sets the same items and the same `total` / `totalPages`. The existing `apps/web/src/modules/__tests__/paginationPreservation.property.test.ts` already encodes this baseline - run it and confirm it passes
  - **Genuine errors**: Observe that a rejected request still surfaces the existing error state for each register/log screen
  - **Interceptor unchanged**: Confirm other consumers (e.g. `useFraudLog.ts`) still receive unwrapped payloads - the interceptor in `apps/web/src/api/client.ts` is NOT modified
  - Write property-based tests generating arbitrary `{ data, pagination }` shapes (zero items, missing `totalPages`, large totals) asserting items and `total` / `totalPages` are identical to the original behavior
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms the baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

- [x] 4. Fix for envelope-contract mismatch in affected/fragile consumers

  - [x] 4.1 Create shared envelope normalization helper
    - Create `apps/web/src/api/utils/envelope.ts` with three pure, tested functions:
    - `toList(payload)`: `if (Array.isArray(payload)) return payload; if (payload && Array.isArray(payload.data)) return payload.data; return [];` (covers `null`, `undefined`, empty/object-without-data)
    - `toPagination(payload, itemCount)`: `const p = payload && !Array.isArray(payload) ? payload.pagination : undefined; return { total: p?.total ?? itemCount, totalPages: p?.totalPages ?? 1 };`
    - `toData(payload)`: `if (payload && typeof payload === 'object' && 'success' in payload && 'data' in payload) return payload.data; return payload;`
    - Add unit tests for `toList`, `toPagination`, `toData` across array / object / null / envelope inputs
    - _Bug_Condition: isBugCondition(X) from design (both ComplianceMatrix and paginated branches)_
    - _Expected_Behavior: envelope-agnostic consumption with pagination fallback (Properties 1 and 2 from design)_
    - _Preservation: helper returns the non-enveloped baseline values unchanged (Properties 3 and 4 from design)_
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9_

  - [x] 4.2 Make Compliance Matrix consumers envelope-agnostic
    - File: `apps/web/src/modules/ComplianceMatrix/ComplianceMatrixPage.tsx`
    - `fetchItems`: replace `if (res.data.success) setItems(res.data.data)` with `setItems(toList(res.data))`; keep the existing `try/catch` so genuine errors still set the load-error state
    - `fetchSummary`: replace `if (res.data.success) setSummary(res.data.data)` with `setSummary(toData(res.data) ?? null)`
    - `fetchUsers`: replace `if (uRes.data?.success) setUsers(uRes.data.data)` (and the `/users` fallback) with `setUsers(toList(uRes.data))`, keeping the `/users/summary` → `/users` fallback when the first list is empty
    - _Bug_Condition: isBugCondition(X) where consumer is ComplianceMatrix (X is null OR X has no "success" field)_
    - _Expected_Behavior: expectedBehavior from design - populate state, render empty list for null/empty, never show loadError (Property 1)_
    - _Preservation: genuine-error load-error state, filters, and tabs unchanged (Property 3)_
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 4.3 Make paginated register/log consumers envelope-agnostic
    - Files: `apps/web/src/modules/Correspondence/OutgoingRegister.tsx`, `apps/web/src/modules/Correspondence/IncomingRegister.tsx`, `apps/web/src/modules/Correspondence/CorrespondenceArchive.tsx`, `apps/web/src/modules/SystemErrorLogs/index.tsx`
    - In each `fetchData`, replace the `if (response.data.data) { ... } else { setItems(response.data); }` block with:
      - `const list = toList(response.data);`
      - `setItems(list);`
      - `setPagination(prev => ({ ...prev, ...toPagination(response.data, list.length) }));`
    - Keep the existing `try/catch` so genuine errors still surface the existing error state
    - For the non-enveloped baseline, `toList` returns `response.data.data` and `toPagination` returns the existing `pagination.total` / `pagination.totalPages` - identical to today
    - _Bug_Condition: isBugCondition(X) where consumer is paginated (X is null OR no "data" field OR no "pagination" field)_
    - _Expected_Behavior: expectedBehavior from design - populate list from either shape, pagination fallback (total ← itemCount, totalPages ← 1) (Property 2)_
    - _Preservation: non-enveloped baseline items and total/totalPages unchanged; genuine-error state unchanged (Property 4)_
    - _Requirements: 2.5, 2.6, 2.7, 2.8, 2.9_

  - [x] 4.4 Verify bug condition exploration tests now pass
    - **Property 1: Expected Behavior** - Compliance Matrix Envelope-Agnostic Consumption
    - **Property 2: Expected Behavior** - Paginated Lists Envelope-Agnostic Consumption with Pagination Fallback
    - **IMPORTANT**: Re-run the SAME tests from tasks 1 and 2 - do NOT write new tests
    - The tests from tasks 1 and 2 encode the expected behavior
    - When these tests pass, they confirm the expected behavior is satisfied (no crash, state populated, empty list for null/empty, pagination fallback, no load-error)
    - Run the Compliance Matrix and paginated bug condition exploration tests from steps 1 and 2
    - **EXPECTED OUTCOME**: Tests PASS (confirms the bug is fixed)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9_

  - [x] 4.5 Verify preservation tests still pass
    - **Property 3: Preservation** - Compliance Matrix & Paginated Non-Enveloped Baseline Unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 3 - do NOT write new tests
    - Run the preservation property tests from step 3, including `apps/web/src/modules/__tests__/paginationPreservation.property.test.ts`
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
    - Confirm the load-error state on genuine errors, the filters, the tabs, the non-enveloped pagination baseline, and the unchanged interceptor all still hold after the fix
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

- [x] 5. Checkpoint - Ensure all tests pass
  - Run the full affected test suite (Compliance Matrix tests, paginated screen tests, `envelope.ts` helper tests, and `paginationPreservation.property.test.ts`)
  - Ensure all tests pass, ask the user if questions arise

## Notes

- The fix is frontend-only and consumer-side. The unwrapping interceptor in `apps/web/src/api/client.ts` is NOT modified - other screens depend on its current behavior (Requirement 3.3).
- Exploration tests (tasks 1, 2) MUST FAIL on unfixed code; preservation tests (task 3) MUST PASS on unfixed code. Do not "fix" a failing exploration test - the failure is the expected signal.
- The existing Compliance Matrix unit test masks the bug by mocking `httpClient` with the already-enveloped shape. New exploration tests must mock `api.get` to return the UNWRAPPED shape the real interceptor produces.
- A single shared helper (`envelope.ts`) is introduced so all consumers use one tested normalization implementation.
- Screens already consuming responses envelope-agnostically (e.g., `useFraudLog.ts`) are correct and out of scope. The backend API is external and not part of this repository.
