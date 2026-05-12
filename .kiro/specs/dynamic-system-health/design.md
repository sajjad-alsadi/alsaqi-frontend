# Dynamic System Health Bugfix Design

## Overview

The System Logs Management page (`SystemLogsManagement.tsx`) displays a hardcoded "99.9%" health percentage with a static green color and "stable" status text. The health indicator never reflects actual system state. Additionally, the error count stat uses `errorsData.length` (current page array length, max 50) instead of `pagination.total` from the API response. This fix will replace the hardcoded values with a dynamic calculation based on actual audit trail and error totals from the API, and apply color/status thresholds accordingly.

## Glossary

- **Bug_Condition (C)**: The condition that triggers the bug — the system health display always shows "99.9%" with green/stable regardless of actual error-to-action ratio
- **Property (P)**: The desired behavior — health percentage is dynamically calculated as `(totalAuditActions / (totalAuditActions + totalErrors)) * 100` with appropriate color and status thresholds
- **Preservation**: Existing behaviors that must remain unchanged — concurrent API fetching, loading states, error handling, today's audit count calculation, and correct display when zero errors exist
- **fetchStats()**: The function in `src/modules/SystemLogsManagement.tsx` that fetches audit-trail and system-errors data and computes overview stats
- **pagination.total**: The field in the API response (`{ data: [], pagination: { page, pageSize, total, totalPages } }`) that contains the true total count of records across all pages

## Bug Details

### Bug Condition

The bug manifests when the System Logs overview tab is displayed. The `fetchStats` function fetches data from both `/api/audit-trail` and `/api/system-errors`, but the health percentage is never computed from the response data — it is hardcoded as `"99.9%"` in the JSX. Additionally, `errorsCount` is set to `errorsData.length` which only reflects the current page of results (max 50 items) rather than the true total from `pagination.total`.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type { auditRes: APIResponse, errorsRes: APIResponse }
  OUTPUT: boolean
  
  LET totalErrors = errorsRes.data.pagination.total
  LET totalAuditActions = auditRes.data.pagination.total
  LET actualHealth = (totalAuditActions / (totalAuditActions + totalErrors)) * 100
  
  RETURN actualHealth != 99.9
         OR totalErrors != errorsRes.data.data.length
         OR (actualHealth < 90 AND displayedColor == "emerald-500")
         OR (actualHealth < 70 AND displayedStatus == "stable")
END FUNCTION
```

### Examples

- **Example 1**: API returns 100 audit actions and 20 errors → Expected health: `100/(100+20)*100 = 83.3%` with amber color and "degraded" status. Actual: shows "99.9%" green "stable"
- **Example 2**: API returns 50 audit actions and 50 errors → Expected health: `50/(50+50)*100 = 50%` with rose color and "critical" status. Actual: shows "99.9%" green "stable"
- **Example 3**: API returns 200 total errors (paginated, 50 per page) → Expected errorsCount: 200. Actual: shows 50 (current page length)
- **Example 4 (edge case)**: API returns 500 audit actions and 0 errors → Expected health: 100% green "stable". Actual: shows "99.9%" green "stable" (coincidentally close but still incorrect)

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Concurrent fetching from both `/api/audit-trail` and `/api/system-errors` endpoints using `Promise.all`
- Loading state management via the existing `loading` flag during API calls
- Error handling that logs to console and does not crash the UI
- Today's audit action count calculation (filtering by today's date from the audit data array)
- When zero errors exist and audit actions are present, health displays near/at 100% with green color and "stable" status

**Scope:**
All inputs that do NOT involve the health percentage display or error count stat should be completely unaffected by this fix. This includes:
- Tab switching behavior between overview, audit, and errors tabs
- The audit trail and error log sub-pages (AuditTrail and SystemErrorLogs components)
- The visual layout, card styling, and animation of the overview cards
- The audit card and errors card navigation buttons

## Hypothesized Root Cause

Based on the bug description and code analysis, the issues are:

1. **Hardcoded Health Value**: Line 155 of `SystemLogsManagement.tsx` contains `<span className="text-5xl font-bold tracking-tighter text-emerald-500">99.9%</span>` — the health percentage is a static string literal, never computed from API data.

2. **Hardcoded Color Class**: The `text-emerald-500` class is hardcoded on the health percentage span, never conditionally applied based on thresholds.

3. **Hardcoded Status Text**: The status text uses `{t('systemLogsManagement.stable')}` unconditionally, never switching to "degraded" or "critical" based on health value.

4. **Incorrect Error Count Source**: In `fetchStats()`, `errorsCount` is set to `errorsData.length` where `errorsData` is extracted as `errorsRes.data?.data || []`. Since the API paginates at 50 items per page, this only reflects the current page count. The correct source is `errorsRes.data?.pagination?.total`.

5. **Missing Total Audit Count**: The health formula requires `totalAuditActions` (all-time total), but the code only computes `todayAudit` (today's count). The `auditRes.data?.pagination?.total` field is never used.

## Correctness Properties

Property 1: Bug Condition - Dynamic Health Calculation

_For any_ API response where `pagination.total` values are available from both audit-trail and system-errors endpoints, the fixed `fetchStats` function SHALL calculate health as `(totalAuditActions / (totalAuditActions + totalErrors)) * 100`, display the computed percentage, apply the correct color class (emerald-500 for ≥90%, amber-500 for ≥70%, rose-500 for <70%), and show the correct status text ("stable" for ≥90%, "degraded" for ≥70%, "critical" for <70%).

**Validates: Requirements 2.1, 2.2, 2.3, 2.4**

Property 2: Preservation - Non-Health Display Behavior

_For any_ input that does NOT involve the health percentage calculation (tab switching, loading states, error handling, today's audit count, concurrent fetching), the fixed code SHALL produce exactly the same behavior as the original code, preserving all existing functionality for non-health-related operations.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `src/modules/SystemLogsManagement.tsx`

**Function**: `fetchStats()` and the overview tab JSX

**Specific Changes**:

1. **Extend stats state**: Add `healthPercent` (number), `healthColor` (string), and `healthStatus` (string) to the `stats` state object.

2. **Use pagination.total for error count**: Replace `errorsData.length` with `errorsRes.data?.pagination?.total ?? errorsData.length` to get the true total error count from the API pagination metadata.

3. **Use pagination.total for audit total**: Extract `auditRes.data?.pagination?.total ?? auditData.length` to get the total audit action count across all pages.

4. **Compute health percentage**: Calculate `health = totalAuditActions > 0 || totalErrors > 0 ? (totalAuditActions / (totalAuditActions + totalErrors)) * 100 : 100` in `fetchStats()`.

5. **Determine color and status from thresholds**: Apply threshold logic:
   - `health >= 90` → color: `text-emerald-500`, status: "stable"
   - `health >= 70` → color: `text-amber-500`, status: "degraded"
   - `health < 70` → color: `text-rose-500`, status: "critical"

6. **Replace hardcoded JSX**: Replace the static `"99.9%"` span with `{stats.healthPercent.toFixed(1)}%` using `stats.healthColor` for the class. Replace the static stable text with the dynamic `stats.healthStatus` translation key.

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bug on unfixed code, then verify the fix works correctly and preserves existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix. Confirm or refute the root cause analysis. If we refute, we will need to re-hypothesize.

**Test Plan**: Write tests that mock API responses with various error/audit totals and assert that the rendered health percentage, color, and status text match the expected dynamic values. Run these tests on the UNFIXED code to observe failures.

**Test Cases**:
1. **High Error Ratio Test**: Mock API returning 50 audit actions and 50 errors (health=50%) — assert rose color and "critical" status (will fail on unfixed code)
2. **Moderate Error Ratio Test**: Mock API returning 80 audit actions and 20 errors (health=80%) — assert amber color and "degraded" status (will fail on unfixed code)
3. **Pagination Total Test**: Mock API returning 50 items in data array but `pagination.total = 200` — assert errorsCount displays 200 (will fail on unfixed code)
4. **Zero Division Edge Case**: Mock API returning 0 audit actions and 0 errors — assert health defaults to 100% (may fail on unfixed code)

**Expected Counterexamples**:
- Health percentage always renders as "99.9%" regardless of mock data
- Error count always shows current page length, not pagination total
- Possible causes: hardcoded string literal, `errorsData.length` usage

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed function produces the expected behavior.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  result := fetchStats_fixed(input.auditRes, input.errorsRes)
  LET totalErrors = input.errorsRes.pagination.total
  LET totalAudit = input.auditRes.pagination.total
  LET expectedHealth = (totalAudit / (totalAudit + totalErrors)) * 100
  ASSERT result.healthPercent == expectedHealth
  ASSERT result.healthColor == getExpectedColor(expectedHealth)
  ASSERT result.healthStatus == getExpectedStatus(expectedHealth)
  ASSERT result.errorsCount == totalErrors
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed function produces the same result as the original function.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT fetchStats_original(input).auditToday == fetchStats_fixed(input).auditToday
  ASSERT loadingBehavior_original(input) == loadingBehavior_fixed(input)
  ASSERT errorHandling_original(input) == errorHandling_fixed(input)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many test cases automatically across the input domain
- It catches edge cases that manual unit tests might miss
- It provides strong guarantees that behavior is unchanged for all non-buggy inputs

**Test Plan**: Observe behavior on UNFIXED code first for today's audit count calculation, loading states, and error handling, then write property-based tests capturing that behavior.

**Test Cases**:
1. **Today's Audit Count Preservation**: Verify that today's audit action count continues to be calculated correctly by filtering audit data by today's date
2. **Loading State Preservation**: Verify that loading flag is set to true during fetch and false after completion/error
3. **Error Handling Preservation**: Verify that API failures are caught, logged to console, and do not crash the component
4. **Concurrent Fetch Preservation**: Verify that both API calls are made concurrently via Promise.all

### Unit Tests

- Test health calculation function with various ratios (0%, 50%, 75%, 90%, 100%)
- Test threshold logic for color assignment at boundary values (69.9%, 70%, 89.9%, 90%)
- Test threshold logic for status text at boundary values
- Test error count extraction from pagination.total vs fallback to array length
- Test edge case: both totals are zero (should default to 100% health)

### Property-Based Tests

- Generate random pairs of (totalAuditActions, totalErrors) where both ≥ 0 and verify health formula produces correct percentage
- Generate random health percentages and verify color/status thresholds are applied correctly at all boundary values
- Generate random API response shapes and verify errorsCount always uses pagination.total when available

### Integration Tests

- Test full component render with mocked API responses showing degraded health
- Test that color classes change dynamically when API data changes
- Test that status text updates correctly across all three threshold ranges
- Test component behavior when API returns error (graceful degradation)
