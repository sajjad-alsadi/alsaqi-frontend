# Compliance Matrix Data Load Failure Bugfix Design

## Overview

The Compliance Matrix screen (`مصفوفة الامتثال`) shows a "failed to load data" error (`complianceMatrix.loadError`) and never renders compliance items. The root cause is an **envelope-contract mismatch** between the shared API client and its consumers.

The shared client (`apps/web/src/api/client.ts`) registers a response interceptor that auto-unwraps the success envelope: when `response.data` is an object with `success === true` and a `data` field, it replaces `response.data` with the inner `data` value. The raw `api` export (`apps/web/src/api/httpClient.ts`) carries this interceptor, so every consumer of `api` receives **already-unwrapped** payloads for success-enveloped responses. Consumers written against the pre-unwrap shape break: they read `.data.success` / `.data.data` / `.data.pagination` off a value that has already been unwrapped (or set to `null`).

The fix is **frontend-only and consumer-side**: make the affected consumers envelope-agnostic so they work whether they receive the raw envelope or the unwrapped payload, and degrade gracefully when pagination metadata is absent. The interceptor itself is **not** changed — other screens depend on its current unwrapping behavior.

This bugfix addresses one confirmed defect (Compliance Matrix) and four fragile/at-risk consumers (paginated registers and logs) that share the same root cause but currently work because their endpoints are not success-enveloped.

## Glossary

- **Bug_Condition (C)**: The condition that triggers the bug — a consumer reads an envelope field (`success`, `data`, or `pagination`) off a payload that the interceptor has already unwrapped (or set to `null`), so the expected field is absent.
- **Property (P)**: The desired behavior — consumers read their list and pagination in an envelope-agnostic way, populate state, and never surface the load-error state for successful (non-error) responses.
- **Preservation**: Existing behavior that must remain unchanged — the unwrapping interceptor itself, genuine-error handling, filters, tabs, and the currently-working non-enveloped pagination path.
- **Envelope**: The success-response shape `{ success: true, data: T, meta?: ... }` produced by the backend.
- **Unwrapped payload**: The value `T` left in `response.data` after the interceptor strips the envelope.
- **Interceptor**: The response interceptor in `apps/web/src/api/client.ts` that unwraps success-enveloped responses.
- **`api`**: The raw Axios instance exported from `apps/web/src/api/httpClient.ts` (`api = client.http`), carrying the unwrapping interceptor.
- **`fetchItems` / `fetchSummary` / `fetchUsers`**: The data-fetch functions in `ComplianceMatrixPage.tsx` that currently read `res.data.success` / `res.data.data`.
- **`fetchData`**: The paginated data-fetch function in each register/log screen that reads `response.data.data` and `response.data.pagination`.

## Bug Details

### Bug Condition

The bug manifests when a consumer of the shared `api` instance reads an envelope field off a response payload that the interceptor has already unwrapped. The consumer is either reading `.success` (Compliance Matrix) or `.data` / `.pagination` (paginated screens) off a value that no longer has that field — because the field was stripped during unwrapping, or because the unwrapped value is `null`.

**Formal Specification:**
```
FUNCTION isBugCondition(X)
  INPUT: X of type ConsumedResponse  // response.data as seen by the consumer AFTER the interceptor runs
  CONTEXT: consumer — which screen reads X, determining the expected envelope field
  OUTPUT: boolean

  // Compliance Matrix expects { success, data }; paginated screens expect
  // { data, pagination }. The interceptor unwraps success-enveloped responses
  // to the inner value, so the expected envelope field is missing.

  IF consumer is ComplianceMatrix THEN
    RETURN (X is null) OR (X has no field named "success")
  ELSE  // paginated register/log consumer
    RETURN (X is null) OR (X has no field named "data") OR (X has no field named "pagination")
  END IF
END FUNCTION
```

### Examples

- **Compliance Matrix list (confirmed):** `/compliance` returns `{ success: true, data: [...] }`; interceptor unwraps to the array. `fetchItems` reads `res.data.success` → `undefined`, so `setItems` is never called and items never render. *Expected:* items display.
- **Compliance Matrix null payload (confirmed crash):** `/compliance` returns `{ success: true, data: null }`; interceptor unwraps to `null`. `fetchItems` reads `res.data.success` → `TypeError`, caught and surfaced as `complianceMatrix.loadError`. *Expected:* empty list, no error.
- **Compliance summary:** `/compliance/summary` unwrapped; `fetchSummary` reads `res.data.success` → `undefined`, summary never set. *Expected:* summary displays.
- **Compliance users:** `/users/summary` or `/users` unwrapped; `fetchUsers` reads `uRes.data?.success` → `undefined`, users list never populated. *Expected:* users populated.
- **Paginated (fragile, edge case):** If `/correspondence/outgoing` ever returns `{ success: true, data: [...], pagination: {...} }`, the interceptor unwraps to the inner array; `response.data.data` is `undefined` and the `pagination` sibling is discarded, so pagination `total`/`totalPages` are lost. *Expected:* list and pagination populated with a sensible fallback.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- The unwrapping interceptor in `apps/web/src/api/client.ts` must continue to unwrap success-enveloped responses exactly as before, for every consumer (Requirement 3.3).
- Genuine request errors (network failures, non-2xx responses, rejected promises) on `/compliance` must continue to show the load-error state — toast and error panel (Requirement 3.1).
- After items load, the existing search, source-type, and compliance-status filters must continue to work (Requirement 3.2).
- The registry, gap-matrix, and dashboard tabs must continue to render as before (Requirement 3.4).
- The paginated screens, when given the current non-enveloped `{ data, pagination }` response, must display exactly the same items and set exactly the same `total` / `totalPages` as before (Requirements 3.5, 3.7).
- The paginated screens must continue to surface their existing error state on genuine request errors (Requirement 3.6).

**Scope:**
All inputs that do NOT satisfy the bug condition must be completely unaffected by this fix. This includes:
- Responses already consumed envelope-agnostically by other screens (e.g., `useFraudLog.ts`).
- The current non-enveloped `{ data: [...], pagination: { total, totalPages } }` responses for the four paginated screens.
- Genuine request errors (rejected promises / non-2xx) for all affected consumers.

**Note:** The expected correct behavior for buggy inputs is defined in the Correctness Properties section (Properties 1 and 2). This section focuses on what must NOT change.

## Hypothesized Root Cause

Based on the bug analysis, the issues are:

1. **Envelope assumption in consumers**: The Compliance Matrix `fetchItems` / `fetchSummary` / `fetchUsers` read `res.data.success` and `res.data.data`, assuming the raw envelope. The interceptor has already unwrapped the payload, so `.success` is always `undefined` and the data is never set.
   - `/compliance`, `/compliance/summary`, and `/users` (or `/users/summary`) all return the success envelope, so all three fetches are affected.

2. **Null unwrapping causes a crash**: When the envelope is `{ success: true, data: null }`, the interceptor sets `response.data` to `null`. Reading `.success` off `null` throws a `TypeError` that is caught and surfaced as the load-error state.

3. **Pagination sibling discarded on unwrap (fragile path)**: The paginated screens read `response.data.data` and `response.data.pagination`. If their endpoints adopt the success envelope, unwrapping replaces `response.data` with the inner array — `pagination` (a peer of `data`, not nested) is discarded and `response.data.data` becomes `undefined`, breaking the list and pagination.

4. **Test masking**: The existing Compliance Matrix unit test mocks `../../api/httpClient` and returns the already-enveloped shape, bypassing the real unwrapping interceptor — so the bug is invisible in tests. New tests must exercise the unwrapped shape.

## Correctness Properties

Property 1: Bug Condition - Compliance Matrix Envelope-Agnostic Consumption

_For any_ Compliance Matrix data-fetch input where the bug condition holds (`isBugCondition` returns true — the payload is `null` or has no `success` field because it was unwrapped), the fixed `fetchItems` / `fetchSummary` / `fetchUsers` SHALL NOT crash, SHALL populate the corresponding state from the unwrapped payload (an array of items, the summary object, or the users array), SHALL render an empty list for a `null` or empty payload, and SHALL NOT surface the load-error state.

**Validates: Requirements 2.1, 2.2, 2.3, 2.4**

Property 2: Bug Condition - Paginated Lists Envelope-Agnostic Consumption with Pagination Fallback

_For any_ paginated-screen data-fetch input where the bug condition holds (`isBugCondition` returns true — the payload is `null`, or lacks a `data` field, or lacks a `pagination` field because it was unwrapped to an array), the fixed `fetchData` SHALL populate the list from the payload whether it is the non-enveloped `{ data, pagination }` shape OR an unwrapped array, SHALL NOT crash, and SHALL fall back to a sensible pagination value (`total` defaults to the loaded item count, `totalPages` defaults to `1`) when pagination metadata is absent or discarded.

**Validates: Requirements 2.5, 2.6, 2.7, 2.8, 2.9**

Property 3: Preservation - Compliance Matrix Unchanged Behavior

_For any_ input where the bug condition does NOT hold (genuine request errors, or responses for unaffected screens), the fixed Compliance Matrix code SHALL produce the same result as the original code — preserving the load-error state on genuine errors, the search/source/status filters, the registry/matrix/dashboard tabs, and the interceptor's unwrapping behavior for all other consumers.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4**

Property 4: Preservation - Paginated Non-Enveloped Baseline Unchanged

_For any_ paginated-screen input where the bug condition does NOT hold (the current non-enveloped `{ data: [...], pagination: { total, totalPages } }` response, or a genuine request error), the fixed `fetchData` SHALL produce the same result as the original code — setting exactly the same items and the same `total` / `totalPages`, and surfacing the same error state on genuine errors, as asserted by `paginationPreservation.property.test.ts`.

**Validates: Requirements 3.5, 3.6, 3.7**

## Fix Implementation

### Changes Required

The remediation is consumer-side and envelope-agnostic. The interceptor is left unchanged. A single normalization helper is introduced so all consumers share one tested implementation.

**New helper** (e.g., `apps/web/src/api/utils/envelope.ts`):

1. **`toList(payload)`**: Returns the list from either shape.
   - `if (Array.isArray(payload)) return payload;`
   - `if (payload && Array.isArray(payload.data)) return payload.data;`
   - `return [];` (covers `null`, `undefined`, empty/object-without-data)

2. **`toPagination(payload, itemCount)`**: Returns `{ total, totalPages }` with graceful fallback.
   - `const p = payload && !Array.isArray(payload) ? payload.pagination : undefined;`
   - `return { total: p?.total ?? itemCount, totalPages: p?.totalPages ?? 1 };`

3. **`toData(payload)`**: Returns the object payload for summary/non-list cases.
   - `if (payload && typeof payload === 'object' && 'success' in payload && 'data' in payload) return payload.data;`
   - `return payload;` (already unwrapped)

**File**: `apps/web/src/modules/ComplianceMatrix/ComplianceMatrixPage.tsx`

4. **`fetchItems`**: Replace `if (res.data.success) setItems(res.data.data)` with `setItems(toList(res.data))`. Keep the existing `try/catch` so genuine errors still set the load-error state. This fixes 2.1, 2.2 and preserves 3.1.

5. **`fetchSummary`**: Replace `if (res.data.success) setSummary(res.data.data)` with `setSummary(toData(res.data) ?? null)`. Fixes 2.3.

6. **`fetchUsers`**: Replace `if (uRes.data?.success) setUsers(uRes.data.data)` (and the `/users` fallback) with `setUsers(toList(uRes.data))`, keeping the `/users/summary` → `/users` fallback when the first list is empty. Fixes 2.4.

**Files**: `OutgoingRegister.tsx`, `IncomingRegister.tsx`, `CorrespondenceArchive.tsx`, `SystemErrorLogs/index.tsx`

7. **`fetchData`** (each screen): Replace the `if (response.data.data) { ... } else { setItems(response.data); }` block with:
   - `const list = toList(response.data);`
   - `setItems(list);`
   - `setPagination(prev => ({ ...prev, ...toPagination(response.data, list.length) }));`
   - Keep the existing `try/catch` so genuine errors still surface the existing error state. This fixes 2.5–2.9 and preserves 3.5, 3.6, 3.7 (for the non-enveloped baseline, `toList` returns `response.data.data` and `toPagination` returns the existing `pagination.total` / `pagination.totalPages`, identical to today).

**Out of scope**: Screens already consuming responses envelope-agnostically (e.g., `useFraudLog.ts`) are correct and are not modified. The backend API is external and not part of this repository.

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bug on the unfixed consumers (exercising the **real** unwrapping interceptor, not a mock that returns the enveloped shape), then verify the fix works for buggy inputs and preserves existing behavior for non-buggy inputs.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix, and confirm the root cause. The key insight is that the existing unit test masks the bug by mocking `httpClient` with the enveloped shape; exploratory tests must feed the **unwrapped** shape the interceptor actually produces.

**Test Plan**: Mock `api.get` to return the unwrapped payloads the interceptor produces (`[]`/array for lists, `null` for the null case, the inner object for summary), then assert on the rendered/observable state. Run on the UNFIXED code to observe failures.

**Test Cases**:
1. **Compliance list unwrapped to array**: `api.get('/compliance')` resolves to `{ data: [...] }` (array, no `success`); assert items render (will fail on unfixed code — `setItems` never called).
2. **Compliance unwrapped to null**: `api.get('/compliance')` resolves to `{ data: null }`; assert empty list and NO load-error (will fail on unfixed code — `TypeError` → load-error shown).
3. **Compliance summary unwrapped**: `api.get('/compliance/summary')` resolves to the inner object; assert summary set (will fail on unfixed code).
4. **Compliance users unwrapped**: `api.get('/users/summary')` resolves to the inner array; assert users populated (will fail on unfixed code).
5. **Paginated unwrapped to array (edge case)**: `api.get('/correspondence/outgoing')` resolves to an unwrapped array; assert list populated and pagination falls back to `{ total: itemCount, totalPages: 1 }` (may fail on unfixed code — pagination lost).

**Expected Counterexamples**:
- `setItems` / `setSummary` / `setUsers` never invoked because `.success` is `undefined`.
- `TypeError` reading `.success` off `null`, caught and surfaced as `complianceMatrix.loadError`.
- Possible causes: envelope assumption in consumers, null unwrapping, discarded pagination sibling.

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed consumers produce the expected behavior.

**Pseudocode:**
```
FOR ALL X WHERE isBugCondition(X) DO
  result := fixedConsumer(X)   // fetchItems / fetchSummary / fetchUsers, or paginated fetchData
  ASSERT no_crash(result)
    AND list_set_to(toList(X))         // array when X is/contains a list, [] when null/empty
    AND pagination_falls_back(result)  // total ← item count, totalPages ← 1 when metadata absent
    AND NOT loadError_or_error_shown(result)
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed consumer produces the same result as the original consumer.

**Pseudocode:**
```
FOR ALL X WHERE NOT isBugCondition(X) DO
  ASSERT originalConsumer(X) = fixedConsumer(X)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many `{ data, pagination }` shapes automatically across the input domain.
- It catches edge cases (zero items, missing `totalPages`, large totals) that manual unit tests might miss.
- It provides strong guarantees that behavior is unchanged for all non-buggy inputs.

**Test Plan**: Observe behavior on the UNFIXED code for the non-enveloped `{ data, pagination }` baseline and for genuine errors, then write property-based tests capturing that behavior. The existing `apps/web/src/modules/__tests__/paginationPreservation.property.test.ts` already encodes this baseline and MUST continue to pass.

**Test Cases**:
1. **Non-enveloped pagination preservation**: For any `{ data: [...], pagination: { total, totalPages } }`, assert the fixed `fetchData` sets the same items and the same `total` / `totalPages` as before.
2. **Genuine error preservation (compliance)**: A rejected `/compliance` promise still shows `complianceMatrix.loadError` (toast + panel).
3. **Genuine error preservation (paginated)**: A rejected request still surfaces the existing error state for each register/log screen.
4. **Interceptor unchanged**: Other consumers still receive unwrapped payloads (the interceptor is not modified).

### Unit Tests

- Compliance Matrix: `fetchItems` with unwrapped array, unwrapped `null`, and genuine error.
- Compliance Matrix: `fetchSummary` and `fetchUsers` with unwrapped payloads.
- Paginated screens: `fetchData` with unwrapped array, non-enveloped `{ data, pagination }`, and missing-pagination payloads.
- `envelope.ts` helpers: `toList`, `toPagination`, `toData` across array / object / null / envelope inputs.

### Property-Based Tests

- Generate arbitrary unwrapped list payloads (arrays of varying length, including empty) and assert the fixed consumers populate state and never show the load-error state (fix checking).
- Generate arbitrary `{ data, pagination }` shapes and assert items and `total` / `totalPages` are identical before and after the fix (preservation — extend `paginationPreservation.property.test.ts`).
- Generate payloads with absent/partial pagination and assert the fallback (`total = itemCount`, `totalPages = 1`) holds without crashing.

### Integration Tests

- Full Compliance Matrix load flow through the real interceptor: open screen → items render, summary and users populate, no load-error.
- Switch between registry, gap-matrix, and dashboard tabs after a successful load.
- Paginated screens: load a page, change page/pageSize, and verify list and pagination behave correctly for the non-enveloped baseline.
- Genuine error flow: simulate a network failure and verify the load-error / error state still appears.
