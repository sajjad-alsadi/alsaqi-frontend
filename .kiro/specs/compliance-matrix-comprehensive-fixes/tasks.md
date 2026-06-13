# Implementation Plan

## Overview

This plan follows the exploratory bugfix workflow: surface counterexamples for all six
defects on the UNFIXED code first (bug-condition checking), capture existing behavior that
must not change (preservation checking), then implement the fixes and re-run the same tests
to confirm fix-checking and preservation hold.

All production changes are confined to
`apps/web/src/modules/ComplianceMatrix/ComplianceMatrixPage.tsx` (plus an optional
co-located color lookup-map constants module). Tests use Vitest + fast-check with
`axios-mock-adapter`/MSW, matching the existing `*.property.test.ts` conventions in
`apps/web`.

The six defects map to design Correctness Properties 1-10: Properties 1-6 are bug
conditions (one per defect), and Properties 7-10 are preservation guarantees.

## Tasks

### Phase 1 — Exploratory Bug Condition Checking (write BEFORE the fix)

- [x] 1. Write color-class purging exploration test (Defect 1)
  - **Property 1: Bug Condition** - Color classes survive production purging
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **GOAL**: Surface counterexamples that demonstrate dynamic color tokens are interpolated rather than emitted as complete literal classes
  - **Scoped PBT Approach**: This is deterministic per render path - scope the property to the concrete color tokens actually used by `statusConfig`, `sourceColors`, and `stats[].color` (`emerald`, `amber`, `rose`, `slate`, `primary`, `purple`, etc.)
  - Render/inspect the matrix tab status header, count badge, item-card accent bar, dashboard stat cards, source distribution bars, and the registry status-change dropdown icons; assert each color utility is produced by interpolating a token (e.g. `bg-${config.color}-50`) so the resulting class string is not a complete literal present in source (`isBugCondition`: `input.kind == 'colorClass'`)
  - Where feasible, add a production-build assertion that the emitted CSS lacks the expected color utilities (e.g. `bg-emerald-50`, `border-b-primary-500`)
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS / exposes purged-interpolated classes (this is correct - it proves the bug exists)
  - Document counterexamples found (e.g. "matrix header class built as `bg-${config.color}-50`, absent from production CSS")
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_

- [x] 2. Write search-debounce exploration test (Defect 2)
  - **Property 2: Bug Condition** - Search refetch is debounced
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **GOAL**: Demonstrate that each keystroke triggers an immediate refetch
  - Mock `/compliance` and `/compliance/summary`; type N characters into the registry search box and assert the request pair fires N times (`isBugCondition`: `input.kind == 'searchKeystroke' AND refetchFiredImmediatelyForEachCharacter`)
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (N refetch pairs for N keystrokes confirms no debounce)
  - Document the counterexample (e.g. "typing 'policy' fires 6 `/compliance` + 6 `/compliance/summary` requests")
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.7_

- [x] 3. Write maturity-clear NaN exploration test (Defect 3)
  - **Property 3: Bug Condition** - Cleared maturity score is omitted, not "NaN"
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **GOAL**: Show that clearing the maturity input serializes `maturity_score="NaN"`
  - Set a maturity value, clear it (`rawValue == ''`), submit, and capture the multipart `FormData`; assert it contains `maturity_score="NaN"` (`isBugCondition`: `input.kind == 'maturityInput' AND parseInt('') -> NaN AND serializedPayloadContains('maturity_score', 'NaN')`)
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (payload contains the literal `"NaN"`)
  - Document the counterexample
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.8_

- [x] 4. Write fetchUsers error-swallow exploration test (Defect 4)
  - **Property 4: Bug Condition** - User-fetch errors are logged
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **GOAL**: Show that a rejected user fetch is silently swallowed
  - Spy on `logger.error`; make the user request reject and assert `logger.error` was NOT called (`isBugCondition`: `input.kind == 'userFetch' AND requestRejects AND NOT errorLogged`)
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (no `logger.error` on rejection confirms the empty `catch`)
  - Document the counterexample
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.9_

- [x] 5. Write wrong-endpoint / empty-dropdown exploration test (Defect 5)
  - **Property 5: Bug Condition** - Responsible-person dropdown loads from the correct endpoint
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **GOAL**: Show that `fetchUsers` calls `/users/summary` and ends with an empty `users` list
  - Assert `fetchUsers` requests `/users/summary`; given a stats-object response (a `z.record` shape, not a user array), assert `toList<UserOption>(...)` yields `[]` and the responsible-person select shows only its placeholder; also assert that when `/users/summary` rejects the `/users` fallback never runs (`isBugCondition`: `input.kind == 'userFetch' AND primaryEndpoint == '/users/summary' AND toList(result) == [] AND fallbackTo('/users') is skippedOrUnreachable`)
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (`/users/summary` requested, `users == []`, fallback unreachable)
  - Document the counterexample
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.10, 1.11_

- [x] 6. Write unbalanced modal-grid exploration test (Defect 6)
  - **Property 6: Bug Condition** - Modal layout is balanced without changing data
  - **CRITICAL**: This test MUST FAIL (or capture the unbalanced baseline) on unfixed code
  - **GOAL**: Capture the unbalanced 2-vs-3 column distribution as the presentational baseline
  - Render the Add/Edit modal and assert the `grid-cols-1 md:grid-cols-2` body distributes 2 section cards in column 1 (basic data, responsibilities) and 3 in column 2 (evaluation, dates, documents) (`isBugCondition`: `input.kind == 'modalLayout' AND grid == 'grid-cols-1 md:grid-cols-2' AND column1.cardCount == 2 AND column2.cardCount == 3`)
  - Also assert the current set of submitted fields as a baseline so the later fix can prove payload parity
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test documents the unbalanced distribution (baseline for the presentational change)
  - Document the baseline counterexample
  - Mark task complete when test is written, run, and the baseline is documented
  - _Requirements: 1.12_

### Phase 2 — Preservation Checking (observe on UNFIXED code, write BEFORE the fix)

- [x] 7. Write static / CSS-variable color preservation test
  - **Property 7: Preservation** - Static and CSS-variable colors unchanged
  - **IMPORTANT**: Follow observation-first methodology
  - Observe on UNFIXED code: registry-tab status/source/review-date ternary class strings, `[var(--color-primary)]` usages, and the View modal's `amber-500`/`emerald-500`/`slate-500` ternary accents
  - Write a property-based test over the set of static/CSS-variable color paths asserting the produced class strings are exactly the original literals, and that tab structure, content, counts, labels, icons, and text are unchanged (`NOT isBugCondition`: already-literal classes)
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3_

- [x] 8. Write filters / query-params / table-state preservation test
  - **Property 8: Preservation** - Filters, query params, and table states unchanged
  - **IMPORTANT**: Follow observation-first methodology
  - Observe on UNFIXED code: changing the source/status filter refetches immediately; the `search` / `source_type` / `compliance_status` query parameters and the resulting filtered set; and the registry table's rows / empty-state / error-state rendering decisions
  - Write property-based tests over random combinations of `search` / `source_type` / `compliance_status` asserting identical query strings and identical row/empty/error rendering, and that filter-select changes still refetch immediately (debounce applies to search input only); assert the `compliance-matrix-focus-loss` focus concern is untouched (`NOT isBugCondition`: filter-select changes and table rendering)
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.4, 3.5, 3.6, 3.7_

- [x] 9. Write valid-maturity / other-form-fields preservation test
  - **Property 9: Preservation** - Valid maturity and all other form fields unchanged
  - **IMPORTANT**: Follow observation-first methodology
  - Observe on UNFIXED code: a valid numeric maturity score (including `0`) is stored and serialized; editing a record with an existing `maturity_score` shows that value; all other fields (ref number, title, source, issuing authority, responsible person, department, status, gap notes, effective/review dates, attachment) serialize unchanged
  - Write property-based tests over random valid maturity values (including `0`) and random fills of the other fields asserting the serialized multipart payload is identical before and after (`NOT isBugCondition`: valid maturity and non-maturity fields)
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.8, 3.9, 3.10_

- [x] 10. Write successful-user-load / modal-flow preservation test
  - **Property 10: Preservation** - Successful user load and modal flows unchanged
  - **IMPORTANT**: Follow observation-first methodology
  - Observe on UNFIXED code (using the corrected endpoint's success path as the parity reference): display-name resolution (`name || full_name || username`) and `responsible_person_id` submission; and the create/update/delete/status-update flows with all twelve modal fields present in the saved payload
  - Write property-based tests over random user lists asserting display-name resolution and `responsible_person_id` submission are preserved, and that modal open/edit/save/cancel produces the same create/update behavior and saved payload (any optional Cancel/`file`-reset cleanup must not alter submitted data) (`NOT isBugCondition`: successful user load and modal flows)
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.11, 3.12, 3.13, 3.14, 3.15_

### Phase 3 — Fix Implementation

- [x] 11. Implement the six Compliance Matrix fixes

  - [x] 11.1 Defect 1 — Replace interpolated color classes with static lookup maps
    - Define color lookup maps of complete literal class strings keyed by color token (e.g. `STATUS_COLOR_CLASSES: Record<string, { header: string; badge: string; accentBar: string }>`, plus `STAT_COLOR_CLASSES`, `SOURCE_COLOR_CLASSES`, `STATUS_ICON_CLASSES`) — optionally in a co-located constants module
    - Replace every string-interpolated color utility in the matrix tab (header, count badge, item-card accent bar), dashboard tab (stat cards, source distribution bars), and registry status-change dropdown icons with lookups (`STATUS_COLOR_CLASSES[config.color].header`, etc.)
    - Cover every token actually used by `statusConfig`, `sourceColors`, and `stats[].color` so no live variant is missing
    - _Bug_Condition: isBugCondition(input) where input.kind == 'colorClass' and the class is built by interpolating a color token_
    - _Expected_Behavior: expectedBehavior(result) — class strings are complete literals present in built CSS_
    - _Preservation: Static/CSS-variable color paths (Property 7) unchanged_
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

  - [x] 11.2 Defect 2 — Debounce the search input only
    - Introduce a `debouncedSearch` value derived from `search` (small `useEffect` + `setTimeout`, or an existing debounce hook) and make the data-loading effect depend on `[filterSource, filterStatus, debouncedSearch]` instead of `search`
    - Keep filter selects as direct dependencies so they refetch immediately; leave the `search` query-parameter wiring in `fetchItems` unchanged
    - _Bug_Condition: isBugCondition(input) where input.kind == 'searchKeystroke' and refetch fires per character_
    - _Expected_Behavior: refetchCount(rapidKeystrokes) == 1 with the same `search` query parameter_
    - _Preservation: Filter-select immediate refetch and query params (Property 8) unchanged_
    - _Requirements: 2.7_

  - [x] 11.3 Defect 3 — Sanitize maturity input to null/omit
    - Change the maturity `onChange` so cleared/invalid input becomes `null` (e.g. `const raw = e.target.value; const parsed = raw === '' ? null : Number(raw); maturity_score: Number.isNaN(parsed as number) ? null : parsed`)
    - Rely on `handleSave` already skipping `null`/`undefined` so the field is omitted from the payload; valid numbers (including `0`) flow through unchanged
    - _Bug_Condition: isBugCondition(input) where input.kind == 'maturityInput' and rawValue == '' producing NaN_
    - _Expected_Behavior: payload omits maturity_score AND formData.maturity_score != NaN_
    - _Preservation: Valid maturity (including 0) and other fields (Property 9) unchanged_
    - _Requirements: 2.8_

  - [x] 11.4 Defect 4 — Log fetchUsers errors
    - Replace the empty `catch (e) {}` in `fetchUsers` with `catch (e) { logger.error('Operation failed', e); }`, matching the other fetchers
    - _Bug_Condition: isBugCondition(input) where input.kind == 'userFetch' and requestRejects and NOT errorLogged_
    - _Expected_Behavior: logger.error('Operation failed', e) called on rejection_
    - _Preservation: Successful user load (Property 10) unchanged_
    - _Requirements: 2.9_

  - [x] 11.5 Defect 5 — Correct user endpoint with reachable fallback
    - Change `fetchUsers` to request the canonical user-list endpoint (`/users/list`, or `/users`) instead of `/users/summary`, parsing with `toList<UserOption>(...)`
    - Restructure so a primary-call failure does not skip the fallback (wrap the primary attempt in its own `try`/`catch` that logs and then attempts the fallback, rather than nesting the fallback after the primary in one `try`)
    - Leave display-name resolution (`name || full_name || username`) and selection handling untouched
    - _Bug_Condition: isBugCondition(input) where input.kind == 'userFetch' and primaryEndpoint == '/users/summary' and fallback unreachable_
    - _Expected_Behavior: requestedEndpoint != '/users/summary' AND users.length > 0 when a list is returned_
    - _Preservation: Successful user load and selection handling (Property 10) unchanged_
    - _Requirements: 2.10, 2.11_

  - [x] 11.6 Defect 6 — Rebalance the modal grid (presentational only)
    - Adjust the modal's section grouping/ordering so the two-column `grid-cols-1 md:grid-cols-2` reads logically and is balanced in RTL, without adding, removing, renaming, semantically reordering, or revalidating any field, and without changing the saved payload
    - **Optional sub-item**: Change the Cancel button to call `handleModalClose` and reset `file` state on close so a previously chosen attachment does not persist into the next modal open — this must not alter submitted data
    - _Bug_Condition: isBugCondition(input) where input.kind == 'modalLayout' and column distribution is 2-vs-3_
    - _Expected_Behavior: modal grid balanced AND submitted payload fields unchanged_
    - _Preservation: All twelve fields, validation, and saved payload (Property 10) unchanged_
    - _Requirements: 2.12_

  - [x] 11.7 Verify all bug-condition exploration tests now pass (fix checking)
    - **Property 1: Expected Behavior** - Color classes survive production purging
    - **Property 2: Expected Behavior** - Search refetch is debounced
    - **Property 3: Expected Behavior** - Cleared maturity score is omitted, not "NaN"
    - **Property 4: Expected Behavior** - User-fetch errors are logged
    - **Property 5: Expected Behavior** - Dropdown loads from the correct endpoint
    - **Property 6: Expected Behavior** - Modal layout is balanced without changing data
    - **IMPORTANT**: Re-run the SAME tests from tasks 1-6 - do NOT write new tests
    - The tests from tasks 1-6 encode the expected behavior; when they pass, the fixes are confirmed
    - **EXPECTED OUTCOME**: All six tests PASS (confirms each bug is fixed)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10, 2.11, 2.12_

  - [x] 11.8 Verify all preservation tests still pass (no regressions)
    - **Property 7: Preservation** - Static and CSS-variable colors unchanged
    - **Property 8: Preservation** - Filters, query params, and table states unchanged
    - **Property 9: Preservation** - Valid maturity and all other form fields unchanged
    - **Property 10: Preservation** - Successful user load and modal flows unchanged
    - **IMPORTANT**: Re-run the SAME tests from tasks 7-10 - do NOT write new tests
    - **EXPECTED OUTCOME**: All four preservation tests PASS (confirms no regressions)
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 3.11, 3.12, 3.13, 3.14, 3.15_

### Phase 4 — Checkpoint

- [x] 12. Checkpoint - Ensure all tests pass
  - Run the full suite (`npm run test`), typecheck (`npm run typecheck`), and lint (`npm run lint`) for `apps/web`
  - Optionally run the production build and assert matrix/dashboard color utilities are present in the emitted CSS (Property 1 integration check)
  - Confirm all bug-condition (Properties 1-6) and preservation (Properties 7-10) tests pass, and that changes remain confined to `ComplianceMatrixPage.tsx` (plus optional color-map constants)
  - Ensure all tests pass; ask the user if questions arise

## Task Dependency Graph

Wave 1 runs all bug-condition exploration tests and all preservation tests on the UNFIXED
code (they are mutually independent). Wave 2 implements the six fixes. Wave 3 re-runs the
existing tests to confirm fix-checking and preservation. Wave 4 is the final checkpoint.

```json
{
  "waves": [
    {
      "wave": 1,
      "name": "Bug-condition exploration + preservation baselines (UNFIXED code)",
      "tasks": ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"],
      "dependsOn": []
    },
    {
      "wave": 2,
      "name": "Implement the six fixes",
      "tasks": ["11.1", "11.2", "11.3", "11.4", "11.5", "11.6"],
      "dependsOn": ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"]
    },
    {
      "wave": 3,
      "name": "Fix checking + preservation verification (re-run existing tests)",
      "tasks": ["11.7", "11.8"],
      "dependsOn": ["11.1", "11.2", "11.3", "11.4", "11.5", "11.6"]
    },
    {
      "wave": 4,
      "name": "Checkpoint",
      "tasks": ["12"],
      "dependsOn": ["11.7", "11.8"]
    }
  ]
}
```

## Notes

- Defects 1-6 are independent edits and may be implemented in any order, EXCEPT 11.4
  (logging) and 11.5 (endpoint/fallback) both touch `fetchUsers` and should be done
  together to avoid rework.
- Phase 1 tests must FAIL (or baseline, for Defect 6) and Phase 2 tests must PASS before
  starting Phase 3 — this proves the bugs exist and pins the existing behavior to preserve.
- Tasks 11.7 and 11.8 re-run the SAME tests authored in tasks 1-10; do not write new
  tests there.
- All production changes stay within
  `apps/web/src/modules/ComplianceMatrix/ComplianceMatrixPage.tsx` (plus an optional
  co-located color-map constants module). The envelope-unwrap work (`toList`/`toData`) and
  the `compliance-matrix-focus-loss` focus concern are out of scope and must remain
  untouched.
- Because Defects 1 and 6 are presentational and Defect 2 is timing-based, assertions
  target observable artifacts (produced class strings, requested endpoints, refetch counts,
  serialized payloads) rather than rendered pixels.
```
