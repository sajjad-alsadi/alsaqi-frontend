# Bugfix Requirements Document

## Introduction

This bugfix addresses a **class of envelope-contract-mismatch defects** on the frontend (`apps/web`). The shared API client (`apps/web/src/api/client.ts`) registers a response interceptor that auto-unwraps the success envelope: when `response.data` is an object with `success === true` and a `data` field, it replaces `response.data` with the inner `data` value. The raw `api` export (`apps/web/src/api/httpClient.ts`, `api = client.http`) carries this interceptor, so every consumer of `api` receives already-unwrapped payloads for success-enveloped responses. Consumers written against the pre-unwrap shape (reading `.data.success` / `.data.data` / `.data.pagination` off an already-unwrapped payload) break.

**Confirmed/reported instance — Compliance Matrix (مصفوفة الامتثال):** When a user opens the Compliance Matrix screen, the page shows a "failed to load data" error (`complianceMatrix.loadError` → "فشل تحميل البيانات" / "Failed to load data") as both a toast and an error panel, and the compliance items never render. `ComplianceMatrixPage.tsx` (`fetchItems`, `fetchSummary`, `fetchUsers`) still reads `res.data.success` / `res.data.data`. Because `/compliance` returns the `{ success: true, data }` envelope, the interceptor unwraps it, so `res.data.success` is always `undefined` (items never set), and a `{ success: true, data: null }` response makes `res.data` become `null` — reading `res.data.success` throws a `TypeError` that is caught and surfaced as the load-error state. The existing unit test hides the bug because it mocks `../../api/httpClient` and returns the already-enveloped shape, bypassing the real unwrapping interceptor.

**Fragile/at-risk instances — paginated registers and logs (NEW):** Several paginated screens read `response.data.data` and `response.data.pagination` directly without an `Array.isArray(res.data)` fallback for the unwrapped shape:

- `apps/web/src/modules/Correspondence/OutgoingRegister.tsx`
- `apps/web/src/modules/Correspondence/IncomingRegister.tsx`
- `apps/web/src/modules/Correspondence/CorrespondenceArchive.tsx`
- `apps/web/src/modules/SystemErrorLogs/index.tsx`

These currently **work** because their endpoints (`/correspondence/incoming|outgoing|archive`, `/system-errors`) return `{ data: [...], pagination: {...} }` **without** a `success` field, so the interceptor does not unwrap them (verified via `apps/web/src/modules/__tests__/paginationPreservation.property.test.ts`, whose mocks return `{ data, pagination }` with no `success`). They are **not currently broken**, but they share the same root cause and are **fragile**: if any of these endpoints ever adopts the `{ success: true, data }` envelope, the interceptor would unwrap the payload to the inner array — the `pagination` sibling (a peer of `data`, not nested inside it) would be discarded, and `response.data.data` would become `undefined` — breaking the list and pagination exactly like the Compliance Matrix.

**Reference pattern (already safe):** Screens that already consume responses envelope-agnostically using `Array.isArray(res.data) ? res.data : (res.data.data || [])` are not defects and are out of scope as fixes; they serve as the correct pattern. The canonical example is `useFraudLog.ts`: `setCases(res.data.data || (Array.isArray(res.data) ? res.data : []))`.

The scope of this fix is **frontend-only**; the backend API is external and not part of this repository. The remediation is to make the affected/fragile consumers envelope-agnostic and tolerant of a discarded or absent `pagination` sibling.

## Bug Analysis

### Current Behavior (Defect)

**Compliance Matrix (confirmed):** When the Compliance Matrix data-fetch responses pass through the real unwrapping interceptor (i.e., at runtime), the component reads `.success` / `.data` off the already-unwrapped payload.

1.1 WHEN the user opens the Compliance Matrix and `/compliance` returns `{ success: true, data: [...] }` (unwrapped by the interceptor to the array) THEN the component reads `res.data.success` which is `undefined`, so it never calls `setItems` and the compliance items are not displayed

1.2 WHEN the user opens the Compliance Matrix and `/compliance` returns `{ success: true, data: null }` (unwrapped by the interceptor to `null`) THEN reading `res.data.success` throws a `TypeError`, which is caught and surfaces `toast.error(t('complianceMatrix.loadError'))` and sets the error panel ("فشل تحميل البيانات")

1.3 WHEN the user opens the Compliance Matrix and `/compliance/summary` returns an unwrapped payload THEN `fetchSummary` reads `res.data.success` which is `undefined`, so the summary is never set

1.4 WHEN the user opens the Compliance Matrix and `/users/summary` or `/users` returns an unwrapped payload THEN `fetchUsers` reads `uRes.data?.success` which is `undefined`, so the users list is never populated

**Paginated registers and logs (fragile / at-risk):** These consumers read `response.data.data` and `response.data.pagination` directly and rely on the endpoint NOT being success-enveloped.

1.5 WHEN `OutgoingRegister.tsx` calls `/correspondence/outgoing` and the response is success-enveloped (`{ success: true, data: [...], pagination: {...} }`) so the interceptor unwraps `response.data` to the inner array THEN `response.data.data` is `undefined`, the `if (response.data.data)` branch is skipped, and `response.data.pagination` is no longer reachable (the `pagination` sibling was discarded during unwrapping), so the outgoing list and its pagination total/totalPages are lost

1.6 WHEN `IncomingRegister.tsx` calls `/correspondence/incoming` and the response is success-enveloped and unwrapped by the interceptor THEN `response.data.data` is `undefined` and `response.data.pagination` is unreachable, so the incoming list and its pagination are lost

1.7 WHEN `CorrespondenceArchive.tsx` calls `/correspondence/archive` and the response is success-enveloped and unwrapped by the interceptor THEN `response.data.data` is `undefined` and `response.data.pagination` is unreachable, so the archive list and its pagination are lost

1.8 WHEN `SystemErrorLogs/index.tsx` calls `/system-errors` and the response is success-enveloped and unwrapped by the interceptor THEN `response.data.data` is `undefined` and `response.data.pagination` is unreachable, so the system error logs list and its pagination are lost

### Expected Behavior (Correct)

**Compliance Matrix:** The component must consume responses in an envelope-agnostic way so that it works with the unwrapped payload produced by the interceptor.

2.1 WHEN the user opens the Compliance Matrix and `/compliance` returns a list (unwrapped to an array) THEN the system SHALL display the returned compliance items without showing the load-error state

2.2 WHEN the user opens the Compliance Matrix and `/compliance` returns an empty or null payload THEN the system SHALL render an empty list without crashing and without showing the load-error state

2.3 WHEN the user opens the Compliance Matrix and `/compliance/summary` returns a payload (unwrapped) THEN the system SHALL set and display the summary

2.4 WHEN the user opens the Compliance Matrix and `/users/summary` or `/users` returns a payload (unwrapped) THEN the system SHALL populate the users list

**Paginated registers and logs:** Each register/log consumer must read its list and pagination in an envelope-agnostic way and degrade gracefully when pagination metadata is absent.

2.5 WHEN `OutgoingRegister.tsx` receives a response for `/correspondence/outgoing` THEN the system SHALL populate the outgoing list whether the payload is the non-enveloped `{ data, pagination }` shape OR an unwrapped array produced by the interceptor

2.6 WHEN `IncomingRegister.tsx` receives a response for `/correspondence/incoming` THEN the system SHALL populate the incoming list whether the payload is the non-enveloped `{ data, pagination }` shape OR an unwrapped array produced by the interceptor

2.7 WHEN `CorrespondenceArchive.tsx` receives a response for `/correspondence/archive` THEN the system SHALL populate the archive list whether the payload is the non-enveloped `{ data, pagination }` shape OR an unwrapped array produced by the interceptor

2.8 WHEN `SystemErrorLogs/index.tsx` receives a response for `/system-errors` THEN the system SHALL populate the logs list whether the payload is the non-enveloped `{ data, pagination }` shape OR an unwrapped array produced by the interceptor

2.9 WHEN any of the paginated consumers (1.5–1.8) receives a payload in which pagination metadata is absent or was discarded by unwrapping THEN the system SHALL degrade gracefully without crashing, using a sensible pagination fallback (e.g., `total` defaults to the loaded item count and `totalPages` defaults to `1`)

### Unchanged Behavior (Regression Prevention)

**Compliance Matrix:**

3.1 WHEN the `/compliance` request fails with a genuine error (network failure or non-2xx response) THEN the system SHALL CONTINUE TO show the load-error state (`complianceMatrix.loadError` toast and error panel)

3.2 WHEN compliance items are successfully loaded THEN the system SHALL CONTINUE TO support the existing search, source-type, and compliance-status filters

3.3 WHEN other screens that consume the shared API client receive responses THEN the system SHALL CONTINUE TO unwrap the success envelope via the existing interceptor unchanged

3.4 WHEN the Compliance Matrix loads successfully THEN the system SHALL CONTINUE TO render the registry, gap-matrix, and dashboard tabs as before

**Paginated registers and logs:**

3.5 WHEN `OutgoingRegister.tsx`, `IncomingRegister.tsx`, `CorrespondenceArchive.tsx`, or `SystemErrorLogs/index.tsx` receives the current non-enveloped `{ data: [...], pagination: { total, totalPages } }` response THEN the system SHALL CONTINUE TO display exactly the same items and set exactly the same pagination `total` and `totalPages` as before the fix

3.6 WHEN any of these paginated screens encounters a genuine request error (rejected promise / non-2xx response) THEN the system SHALL CONTINUE TO surface its existing error state (e.g., `toast.error` / error message) exactly as before

3.7 WHEN the non-enveloped `{ data, pagination }` baseline is exercised THEN the behavior asserted by `apps/web/src/modules/__tests__/paginationPreservation.property.test.ts` SHALL CONTINUE TO hold (valid pagination metadata used unchanged)

## Bug Condition

**Bug Condition Function** — identifies inputs that trigger the bug across both the Compliance Matrix `.success`-read case and the paginated `.data.data` / `.pagination`-read case:

```pascal
FUNCTION isBugCondition(X)
  INPUT: X of type ConsumedResponse  // the response.data as seen by the component AFTER the interceptor runs
  CONTEXT: shape — the envelope field the consumer expects to read off X
                   ("success" for Compliance Matrix; "data"/"pagination" for paginated screens)
  OUTPUT: boolean

  // Compliance Matrix expects { success, data }; paginated screens expect
  // { data, pagination }. The interceptor unwraps success-enveloped responses
  // to the inner value, so the expected field is missing.
  // The bug manifests whenever the consumer's expected envelope field is
  // absent from X because X has been unwrapped (or is null).

  IF consumer is ComplianceMatrix THEN
    RETURN (X is null) OR (X has no field named "success")
  ELSE  // paginated register/log consumer
    // Unwrapped array (or any value lacking a "data" sibling) means
    // X.data is undefined and the pagination sibling has been discarded.
    RETURN (X is null) OR (X has no field named "data") OR (X has no field named "pagination")
  END IF
END FUNCTION
```

**Property Specification** — defines correct behavior for buggy inputs:

```pascal
// Property: Fix Checking - Envelope-agnostic consumption
FOR ALL X WHERE isBugCondition(X) DO
  result ← F'(X)   // fixed consumer (Compliance Matrix fetch* OR paginated fetchData)
  ASSERT no_crash(result)
    AND list_set_to(toArray(X))        // array when X is/contains a list, [] when null/empty
    AND pagination_falls_back(result)  // total ← item count, totalPages ← 1 when metadata absent
    AND NOT loadError_or_error_shown(result)
END FOR
```

**Preservation Goal** — non-buggy inputs behave identically before and after the fix:

```pascal
// Property: Preservation Checking
FOR ALL X WHERE NOT isBugCondition(X) DO
  ASSERT F(X) = F'(X)
END FOR
```

Where **F** is the original consumer logic (Compliance Matrix `fetchItems` / `fetchSummary` / `fetchUsers`, and the paginated `fetchData` in the four register/log screens) and **F'** is the fixed logic.

For the paginated screens, the non-buggy inputs `NOT isBugCondition(X)` are exactly the currently-working non-enveloped responses `{ data: [...], pagination: { total, totalPages } }`. Preservation requires that for these inputs the fixed code sets the same items and the same `total` / `totalPages` as the original code — this is the property already validated by `paginationPreservation.property.test.ts`.

Genuine request errors (rejected promises) are outside `isBugCondition` for all consumers and must continue to surface their existing error/load-error states unchanged.
