# Implementation Plan

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - Hardcoded Health Percentage
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the bug exists
  - **Scoped PBT Approach**: Scope the property to concrete failing cases — mock API responses where actual health differs from 99.9%
  - Bug Condition from design: `isBugCondition(input)` returns true when `actualHealth != 99.9 OR totalErrors != errorsRes.data.data.length OR (actualHealth < 90 AND displayedColor == "emerald-500") OR (actualHealth < 70 AND displayedStatus == "stable")`
  - Test case 1: Mock API returning 50 audit actions and 50 errors → assert health displays "50.0%" with rose-500 color and "critical" status
  - Test case 2: Mock API returning 80 audit actions and 20 errors → assert health displays "80.0%" with amber-500 color and "degraded" status
  - Test case 3: Mock API returning 50 items in data array but `pagination.total = 200` → assert errorsCount displays 200
  - Test case 4: Mock API returning 0 audit actions and 0 errors → assert health defaults to 100% with emerald-500 and "stable"
  - Property: for all (totalAudit, totalErrors) pairs where totalAudit >= 0 and totalErrors >= 0, health = (totalAudit / (totalAudit + totalErrors)) * 100, color and status match thresholds
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (this is correct - it proves the bug exists because health always shows "99.9%" regardless of input)
  - Document counterexamples found: health percentage always renders as "99.9%", error count always shows array length not pagination.total
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Non-Health Display Behavior
  - **IMPORTANT**: Follow observation-first methodology
  - Observe on UNFIXED code: today's audit count is calculated by filtering audit data array by today's date
  - Observe on UNFIXED code: loading state is set to true during fetch and false after completion/error
  - Observe on UNFIXED code: API failures are caught, logged to console, and do not crash the component
  - Observe on UNFIXED code: both `/api/audit-trail` and `/api/system-errors` are fetched concurrently via Promise.all
  - Observe on UNFIXED code: when zero errors exist and audit actions are present, health displays green/stable (this specific case should still work after fix)
  - Write property-based test: for all non-buggy inputs (zero errors with some audit actions), result shows ~100% health with emerald-500 and "stable"
  - Write property-based test: for all API responses, today's audit count equals the count of audit entries with today's date
  - Write property-based test: for all API call states, loading flag transitions correctly (true during fetch, false after)
  - Write property-based test: for all API failure scenarios, error is logged and component does not crash
  - Verify tests pass on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 3. Fix for hardcoded system health percentage and incorrect error count

  - [x] 3.1 Implement the fix
    - Extend stats state in `SystemLogsManagement.tsx` to include `healthPercent` (number), `healthColor` (string), and `healthStatus` (string)
    - Replace `errorsData.length` with `errorsRes.data?.pagination?.total ?? errorsData.length` to get true total error count
    - Extract total audit count using `auditRes.data?.pagination?.total ?? auditData.length`
    - Compute health: `health = (totalAudit > 0 || totalErrors > 0) ? (totalAudit / (totalAudit + totalErrors)) * 100 : 100`
    - Apply threshold logic for color: `health >= 90` → `text-emerald-500`, `health >= 70` → `text-amber-500`, `health < 70` → `text-rose-500`
    - Apply threshold logic for status: `health >= 90` → "stable", `health >= 70` → "degraded", `health < 70` → "critical"
    - Replace hardcoded `"99.9%"` span with `{stats.healthPercent.toFixed(1)}%` using dynamic color class
    - Replace static "stable" status text with dynamic status translation key
    - _Bug_Condition: isBugCondition(input) where actualHealth != 99.9 OR totalErrors != errorsRes.data.data.length OR color/status mismatch_
    - _Expected_Behavior: health = (totalAudit / (totalAudit + totalErrors)) * 100 with correct color/status thresholds_
    - _Preservation: Concurrent fetching, loading states, error handling, today's audit count, zero-error display unchanged_
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 3.3, 3.4, 3.5_

  - [x] 3.2 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Dynamic Health Calculation
    - **IMPORTANT**: Re-run the SAME test from task 1 - do NOT write a new test
    - The test from task 1 encodes the expected behavior (correct health percentage, color, and status based on API data)
    - When this test passes, it confirms the expected behavior is satisfied
    - Run bug condition exploration test from step 1
    - **EXPECTED OUTCOME**: Test PASSES (confirms bug is fixed — health is now dynamically calculated)
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 3.3 Verify preservation tests still pass
    - **Property 2: Preservation** - Non-Health Display Behavior
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - Run preservation property tests from step 2
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
    - Confirm today's audit count, loading states, error handling, and concurrent fetching all still work correctly after fix

- [x] 4. Checkpoint - Ensure all tests pass
  - Run full test suite to confirm all tests pass
  - Verify bug condition test (Property 1) passes — dynamic health calculation works
  - Verify preservation tests (Property 2) pass — no regressions in existing behavior
  - Ensure no TypeScript compilation errors in `SystemLogsManagement.tsx`
  - Ensure all tests pass, ask the user if questions arise
