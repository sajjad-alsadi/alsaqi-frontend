# Bugfix Requirements Document

## Introduction

When a user opens the Compliance Matrix screen (مصفوفة الامتثال), the page shows a "failed to load data" error (`complianceMatrix.loadError` → "فشل تحميل البيانات" / "Failed to load data") as both a toast and an error panel, and the compliance items never render.

The root cause is an envelope-shape mismatch on the frontend. The shared API client registers a response interceptor that auto-unwraps the success envelope: when `response.data` is an object with `success === true` and a `data` field, it replaces `response.data` with the inner `data` value. `ComplianceMatrixPage.tsx` was written against the pre-unwrap shape and still reads `res.data.success` / `res.data.data`. After the interceptor unwraps the payload, `res.data.success` is `undefined` (items never set), and when the server returns `{ success: true, data: null }`, `res.data` becomes `null` so reading `res.data.success` throws a `TypeError` that is caught and surfaced as the load-error state the user sees.

This affects `fetchItems`, `fetchSummary`, and `fetchUsers` in `ComplianceMatrixPage.tsx`. The existing unit test hides the bug because it mocks `../../api/httpClient` and returns the already-enveloped shape, bypassing the real unwrapping interceptor. The scope of this fix is frontend-only; the backend API is external and not part of this repository. The reference pattern for envelope-agnostic consumption already exists in `useFraudLog.ts`.

## Bug Analysis

### Current Behavior (Defect)

When the Compliance Matrix data-fetch responses pass through the real unwrapping interceptor (i.e., at runtime), the component reads `.success` / `.data` off the already-unwrapped payload.

1.1 WHEN the user opens the Compliance Matrix and `/compliance` returns `{ success: true, data: [...] }` (unwrapped by the interceptor to the array) THEN the component reads `res.data.success` which is `undefined`, so it never calls `setItems` and the compliance items are not displayed

1.2 WHEN the user opens the Compliance Matrix and `/compliance` returns `{ success: true, data: null }` (unwrapped by the interceptor to `null`) THEN reading `res.data.success` throws a `TypeError`, which is caught and surfaces `toast.error(t('complianceMatrix.loadError'))` and sets the error panel ("فشل تحميل البيانات")

1.3 WHEN the user opens the Compliance Matrix and `/compliance/summary` returns an unwrapped payload THEN `fetchSummary` reads `res.data.success` which is `undefined`, so the summary is never set

1.4 WHEN the user opens the Compliance Matrix and `/users/summary` or `/users` returns an unwrapped payload THEN `fetchUsers` reads `uRes.data?.success` which is `undefined`, so the users list is never populated

### Expected Behavior (Correct)

The component must consume responses in an envelope-agnostic way so that it works with the unwrapped payload produced by the interceptor.

2.1 WHEN the user opens the Compliance Matrix and `/compliance` returns a list (unwrapped to an array) THEN the system SHALL display the returned compliance items without showing the load-error state

2.2 WHEN the user opens the Compliance Matrix and `/compliance` returns an empty or null payload THEN the system SHALL render an empty list without crashing and without showing the load-error state

2.3 WHEN the user opens the Compliance Matrix and `/compliance/summary` returns a payload (unwrapped) THEN the system SHALL set and display the summary

2.4 WHEN the user opens the Compliance Matrix and `/users/summary` or `/users` returns a payload (unwrapped) THEN the system SHALL populate the users list

### Unchanged Behavior (Regression Prevention)

3.1 WHEN the `/compliance` request fails with a genuine error (network failure or non-2xx response) THEN the system SHALL CONTINUE TO show the load-error state (`complianceMatrix.loadError` toast and error panel)

3.2 WHEN compliance items are successfully loaded THEN the system SHALL CONTINUE TO support the existing search, source-type, and compliance-status filters

3.3 WHEN other screens that consume the shared API client receive responses THEN the system SHALL CONTINUE TO unwrap the success envelope via the existing interceptor unchanged

3.4 WHEN the Compliance Matrix loads successfully THEN the system SHALL CONTINUE TO render the registry, gap-matrix, and dashboard tabs as before

## Bug Condition

**Bug Condition Function** — identifies inputs that trigger the bug:

```pascal
FUNCTION isBugCondition(X)
  INPUT: X of type ComplianceFetchResponse  // the response as seen by the component after the interceptor runs
  OUTPUT: boolean

  // The component expects the enveloped shape { success, data } but the
  // interceptor has already unwrapped successful responses to the inner value.
  // The bug manifests whenever the response has been unwrapped, i.e. it is not
  // an object carrying a `success` field.
  RETURN (X is null) OR (X has no field named "success")
END FUNCTION
```

**Property Specification** — defines correct behavior for buggy inputs:

```pascal
// Property: Fix Checking - Envelope-agnostic consumption
FOR ALL X WHERE isBugCondition(X) DO
  result ← fetchItems'(X)
  ASSERT no_crash(result)
    AND items_set_to(toArray(X))   // array when X is a list, [] when X is null/empty
    AND NOT loadError_shown(result)
END FOR
```

**Preservation Goal** — non-buggy inputs behave identically before and after the fix:

```pascal
// Property: Preservation Checking
FOR ALL X WHERE NOT isBugCondition(X) DO
  ASSERT F(X) = F'(X)
END FOR
```

Where **F** is the original `ComplianceMatrixPage` data-fetch logic (`fetchItems` / `fetchSummary` / `fetchUsers`) and **F'** is the fixed logic. Genuine request errors (rejected promises) are outside `isBugCondition` and must continue to surface the load-error state unchanged.
