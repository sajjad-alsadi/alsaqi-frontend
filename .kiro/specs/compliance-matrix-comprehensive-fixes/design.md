# Compliance Matrix Comprehensive Fixes Bugfix Design

## Overview

The Compliance Matrix screen (`apps/web/src/modules/ComplianceMatrix/ComplianceMatrixPage.tsx`) is a three-tab UI (registry, matrix, dashboard) with an Add/Edit Record modal. Code analysis plus two user reports surfaced six independent frontend-only defects that range from production-only visual breakage to a functional dropdown that never populates.

The fix approach treats each defect as a narrowly-scoped, targeted change against the single component file (with optional supporting lookup-map constants), while preserving all other behavior. Because several defects (1, 6) are presentational and one (2) is timing-based, the testing strategy leans on behavioral assertions (which class strings/endpoints/payloads are produced) rather than pixel comparisons, and uses property-based preservation checking to prove that non-buggy inputs are unaffected.

The unifying strategy is: convert string-interpolated dynamic Tailwind classes into static lookup maps (Defect 1), debounce only the search input (Defect 2), sanitize the numeric maturity field to `null`/omitted (Defect 3), restore consistent error logging (Defect 4), point the user fetch at the correct list endpoint so the fallback is reachable (Defect 5), and rebalance the modal's two-column grid without changing any field, validation, or payload (Defect 6).

The previously-resolved envelope-unwrap work (`toList`/`toData` from `apps/web/src/api/utils/envelope.ts`) and the `compliance-matrix-focus-loss` spec's focus concern are explicitly out of scope and must remain untouched.

## Glossary

- **Bug_Condition (C)**: The set of inputs/render-states that trigger one of the six defects — a dynamic color class being interpolated, a keystroke in the search box, a cleared maturity field, a rejected/empty user fetch, or the unbalanced modal grid.
- **Property (P)**: The desired behavior for buggy inputs — statically-analyzable color classes that survive production purging, a single debounced refetch, an omitted maturity field instead of `"NaN"`, logged fetch errors, a populated responsible-person dropdown, and a balanced RTL modal layout.
- **Preservation**: Existing behavior that must remain unchanged — registry-tab static colors, CSS-variable colors, filter-select immediate refetch, query parameters and result sets, valid maturity values (including `0`), all other form fields, and the create/update/delete/status-update flows.
- **`ComplianceMatrix`**: The root component function in `ComplianceMatrixPage.tsx` (line 61) holding all state and render logic.
- **`statusConfig`** / **`sourceColors`** / **`stats[].color`**: Records mapping a status/source/stat to a short color token (e.g. `'emerald'`, `'primary'`) that is currently string-interpolated into Tailwind utilities.
- **`fetchItems` / `fetchSummary` / `fetchUsers`**: The three data fetchers; the data-loading `useEffect` (lines 117–121) calls the first two and depends on `[filterSource, filterStatus, search]`.
- **`formData.maturity_score`**: The optional numeric field (`number | null`) set by the maturity input via `parseInt(e.target.value)` (line ~776).
- **`handleSave`**: The submit handler that serializes `formData` into a multipart `FormData`, appending any value that is `!== undefined && !== null` via `value.toString()`.
- **`handleModalClose`**: The stable `useCallback` close handler (line 98) that the Add/Edit `Modal` uses via `onClose`.

## Bug Details

### Bug Condition

The six defects share a common shape: a specific render-path or input that produces a wrong-but-not-crashing result. Defects 1 and 6 manifest only via produced class strings / DOM ordering; Defect 2 via refetch frequency; Defect 3 via the serialized payload; Defects 4 and 5 via the user fetch's endpoint and error handling.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type RenderOrInteraction
  OUTPUT: boolean

  // Defect 1 — dynamic color classes purged in production
  RETURN (input.kind == 'colorClass'
            AND input.tab IN ['matrix', 'dashboard', 'registryStatusDropdown']
            AND input.classString is built by interpolating a color token
                (e.g. `bg-${token}-50`) rather than a complete literal class)

  // Defect 2 — search refetches per keystroke
       OR (input.kind == 'searchKeystroke'
            AND refetchFiredImmediatelyForEachCharacter(input))

  // Defect 3 — maturity cleared -> NaN -> "NaN"
       OR (input.kind == 'maturityInput'
            AND input.rawValue == ''
            AND parsedValueBecomes(NaN)
            AND serializedPayloadContains('maturity_score', 'NaN'))

  // Defect 4 — fetchUsers swallows errors
       OR (input.kind == 'userFetch'
            AND requestRejects(input)
            AND NOT errorLogged(input))

  // Defect 5 — wrong user endpoint, unreachable fallback
       OR (input.kind == 'userFetch'
            AND primaryEndpoint == '/users/summary'    // stats object, not a list
            AND toList(result) == []
            AND fallbackTo('/users') is skippedOrUnreachable)

  // Defect 6 — unbalanced two-column modal grid
       OR (input.kind == 'modalLayout'
            AND grid == 'grid-cols-1 md:grid-cols-2'
            AND column1.cardCount == 2 AND column2.cardCount == 3)
END FUNCTION
```

### Examples

- **Defect 1**: In a production build, a matrix-tab status header rendered with `` `bg-${config.color}-50` `` (token `emerald`) yields `bg-emerald-50`, which Tailwind's content scanner never saw as a literal, so the class is purged and the header renders colorless. Expected: a static lookup yields `bg-emerald-50` as a literal in source, surviving the build.
- **Defect 2**: Typing "policy" (6 chars) fires 6 `/compliance` + 6 `/compliance/summary` request pairs and toggles `loading` 6 times. Expected: one request pair after the user pauses.
- **Defect 3**: User types `80`, then clears the maturity field. `parseInt('')` → `NaN`; on save the multipart body contains `maturity_score="NaN"`. Expected: `maturity_score` is `null`/`undefined` and omitted from the body.
- **Defect 4**: `/users/summary` returns 500. The empty `catch (e) {}` discards it, so DevTools shows no diagnostic and the dropdown is silently empty. Expected: `logger.error('Operation failed', e)` is emitted.
- **Defect 5**: `fetchUsers` calls `/users/summary` (a `z.record` stats object); `toList<UserOption>(...)` over it returns `[]`, the `/users` fallback sits after the summary call in the same `try`, and any rejection is swallowed — dropdown shows only the placeholder. Expected: the canonical `/users/list` (or `/users`) endpoint is queried and the dropdown is populated.
- **Defect 6** (edge/presentational): The modal's `grid-cols-1 md:grid-cols-2` puts 2 cards in column 1 and 3 in column 2, leaving the document-upload card isolated and the responsibilities block adjacent to dates/documents in RTL. Expected: a balanced, logical RTL reading order with identical fields.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Registry-tab status badges, source badges, and review-date highlights that use existing static ternary class strings must continue rendering their colors (these are already complete literals).
- Colors derived from fixed values or CSS variables (`[var(--color-primary)]`, the View modal's `amber-500`/`emerald-500`/`slate-500` ternary accents) must continue rendering correctly.
- Tab layout, content, counts, labels, icons, and translated text must display the same structure and data as before.
- The source filter and status filter selects must continue refetching immediately (debouncing applies to the search input only).
- The same `search` / `source_type` / `compliance_status` query parameters and the same filtered result set must be produced.
- The registry table's rows, empty state, and error state must render exactly as before.
- A valid numeric maturity score (including `0`) must continue to be stored and serialized; editing a record with an existing `maturity_score` must continue to show that value.
- All other form fields (ref number, title, source, issuing authority, responsible person, department, status, gap notes, effective/review dates, attachment) must continue to serialize and submit unchanged.
- On successful `fetchUsers`, the dropdown must continue to list each user's display name (`name || full_name || username`) and submit the selected `responsible_person_id` unchanged.
- Create/update/delete/status-update flows must behave exactly as before.
- The focus-handling concern owned by `compliance-matrix-focus-loss` must not be altered.

**Scope:**
All inputs that do NOT match `isBugCondition` must be completely unaffected. This includes:
- Any already-static (literal) Tailwind class anywhere in the file.
- Filter-select changes (source/status), which must keep refetching immediately.
- Valid maturity values and all non-maturity form fields.
- Successful user fetches (only the endpoint and the added logging change).
- The set of fields, their validation, and the saved payload of the modal (Defect 6 is presentational only).

**Note:** The expected correct behavior for buggy inputs is defined in the Correctness Properties section below. This section enumerates what must NOT change.

## Hypothesized Root Cause

Based on the bug analysis and the source code, the most likely causes are:

1. **Dynamic class-name interpolation with no safelist (Defect 1)**: Tailwind purges any utility it cannot find as a complete literal during content scanning. `apps/web` has no `tailwind.config` and no `safelist`, so interpolated classes like `` `bg-${stat.color}-500` `` (lines ~530, ~533, ~538, ~608, and the matrix/registry equivalents) are stripped in production. Dev mode's broader JIT scanning masks this.

2. **Effect dependency on `search` with no debounce (Defect 2)**: The data-loading `useEffect` (lines 117–121) depends on `[filterSource, filterStatus, search]`, so every `search` mutation re-runs `fetchItems` + `fetchSummary` synchronously per keystroke.

3. **`parseInt` of an empty string (Defect 3)**: The maturity input's `onChange` runs `parseInt(e.target.value)` (line ~776); clearing the field gives `''` → `NaN`. `handleSave` appends any value that is `!== undefined && !== null`, and `NaN` passes that guard, serializing as `"NaN"` via `value.toString()`.

4. **Empty `catch` block (Defect 4)**: `fetchUsers` uses `catch (e) {}` with no `logger.error`, diverging from every other fetcher in the file.

5. **Wrong endpoint + fallback inside the same `try` (Defect 5)**: `fetchUsers` calls `api.get('/users/summary')` — a statistics object validated by `UserSummarySchema = z.record(z.string(), z.unknown())`, not a user array — so `toList<UserOption>(...)` yields `[]`. The `/users` fallback is placed after the summary call inside the same `try`, so a summary rejection is caught (and swallowed by Defect 4) before the fallback can run. The canonical user-list endpoint elsewhere in the app is `/users/list` (`AuditPlanForm`, `AuditTaskForm`) or `/users` (Correspondence).

6. **Unbalanced grid distribution (Defect 6)**: The modal body uses `grid-cols-1 md:grid-cols-2` with two section cards in the first column and three in the second, so column flow leaves the document card isolated and disrupts the RTL reading order.

## Correctness Properties

Property 1: Bug Condition — Color classes survive production purging

_For any_ render in the matrix tab, dashboard tab, or registry status-change dropdown where a color is selected from `statusConfig`, `sourceColors`, or `stats[].color`, the fixed code SHALL resolve the color token to complete, statically-analyzable Tailwind class strings (via a lookup map of full class names), so the background, text, border, shadow, and gradient colors render correctly in a production build.

**Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6**

Property 2: Bug Condition — Search refetch is debounced

_For any_ sequence of rapid consecutive keystrokes in the registry search box, the fixed code SHALL issue a single `/compliance` + `/compliance/summary` request pair after the user pauses, rather than one pair per character, while still sending the same `search` query parameter.

**Validates: Requirements 2.7**

Property 3: Bug Condition — Cleared maturity score is omitted, not "NaN"

_For any_ save where the maturity-score input has been cleared, the fixed code SHALL set `formData.maturity_score` to `null`/`undefined` (never `NaN`) and SHALL omit the field from the multipart payload rather than serializing the literal string `"NaN"`.

**Validates: Requirements 2.8**

Property 4: Bug Condition — User-fetch errors are logged

_For any_ user-list request in `fetchUsers` that rejects, the fixed code SHALL log the error via `logger.error('Operation failed', e)`, consistent with the other fetchers in the file.

**Validates: Requirements 2.9**

Property 5: Bug Condition — Responsible-person dropdown loads from the correct endpoint

_For any_ invocation of `fetchUsers`, the fixed code SHALL request the canonical user-list endpoint (`/users/list`, or `/users`) — not `/users/summary` — parse the result envelope-agnostically via `toList`, and ensure that a failed request does not silently prevent the dropdown from loading (the error is logged and any fallback remains reachable), so the responsible-person select is populated with selectable users.

**Validates: Requirements 2.10, 2.11**

Property 6: Bug Condition — Modal layout is balanced without changing data

_For any_ render of the Add/Edit modal, the fixed code SHALL present its sections in a logical, balanced order/grouping that reads correctly in the RTL layout, without changing which fields exist, their validation, or the data submitted on save.

**Validates: Requirements 2.12**

Property 7: Preservation — Static and CSS-variable colors unchanged

_For any_ element whose color comes from an existing static ternary class string (registry tab) or from a fixed value / CSS variable (`[var(--color-primary)]`, View-modal ternary accents), the fixed code SHALL produce exactly the same class strings as the original, preserving all currently-correct color rendering and the overall tab structure, content, counts, labels, icons, and text.

**Validates: Requirements 3.1, 3.2, 3.3**

Property 8: Preservation — Filters, query params, and table states unchanged

_For any_ change to the source filter or status filter, the fixed code SHALL refetch immediately (debounce applies to the search input only) and SHALL send the same `search` / `source_type` / `compliance_status` query parameters and produce the same filtered result set; the registry table SHALL continue to show rows, the empty state, or the error state exactly as before, and the `compliance-matrix-focus-loss` focus concern SHALL be unaffected.

**Validates: Requirements 3.4, 3.5, 3.6, 3.7**

Property 9: Preservation — Valid maturity and all other form fields unchanged

_For any_ save with a valid numeric maturity score (including `0`) or an edit of a record that already has a `maturity_score`, the fixed code SHALL store and serialize/display that value as before; _for any_ other form field, the fixed code SHALL serialize and submit it unchanged.

**Validates: Requirements 3.8, 3.9, 3.10**

Property 10: Preservation — Successful user load and modal flows unchanged

_For any_ successful user load, the fixed code SHALL populate the dropdown with each user's display name (`name || full_name || username`), submit the selected `responsible_person_id` unchanged, and differ from the buggy version only by the corrected endpoint and added logging; _for any_ modal open/edit/save/cancel, the create/update behavior and the saved payload (all twelve fields present) SHALL be unchanged, with any optional Cancel/`file`-reset cleanup not altering submitted data.

**Validates: Requirements 3.11, 3.12, 3.13, 3.14, 3.15**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct, all changes are confined to `apps/web/src/modules/ComplianceMatrix/ComplianceMatrixPage.tsx` (plus an optional co-located constants module for the color lookup maps).

**File**: `apps/web/src/modules/ComplianceMatrix/ComplianceMatrixPage.tsx`

1. **Defect 1 — Static color lookup maps**: Replace every string-interpolated color utility in the matrix tab, dashboard tab, and registry status-change dropdown with a lookup into a map of complete literal class strings keyed by the color token (`emerald`, `amber`, `rose`, `slate`, `primary`, `purple`, etc.).
   - Define `const STATUS_COLOR_CLASSES: Record<string, { header: string; badge: string; accentBar: string }>` (and similarly `STAT_COLOR_CLASSES`, `SOURCE_COLOR_CLASSES`, `STATUS_ICON_CLASSES`) containing full class names so Tailwind's scanner sees literals.
   - Replace `` `bg-${config.color}-50 text-${config.color}-600 border-${config.color}-100` `` (and the badge, accent-bar, stat-card, distribution-bar, and dropdown-icon equivalents) with `STATUS_COLOR_CLASSES[config.color].header`, etc.
   - Cover every token actually used by `statusConfig`, `sourceColors`, and `stats[].color` so no live variant is missing.

2. **Defect 2 — Debounce search only**: Introduce a `debouncedSearch` value (derived from `search` via a small `useEffect` + `setTimeout`, or an existing debounce hook) and make the data-loading effect depend on `[filterSource, filterStatus, debouncedSearch]` instead of `search`. Filter selects keep firing immediately because they remain direct dependencies. The `search` query parameter wiring in `fetchItems` is unchanged.

3. **Defect 3 — Sanitize maturity input**: Change the maturity `onChange` to parse to a clean value: `const raw = e.target.value; const parsed = raw === '' ? null : Number(raw); setFormData({ ...formData, maturity_score: Number.isNaN(parsed as number) ? null : parsed })` (or equivalent), so cleared/invalid input becomes `null`. Because `handleSave` already skips `null`/`undefined`, the field is then omitted from the payload. Valid numbers (including `0`) flow through unchanged.

4. **Defect 4 — Log fetch errors**: Replace the empty `catch (e) {}` in `fetchUsers` with `catch (e) { logger.error('Operation failed', e); }`, matching the other fetchers.

5. **Defect 5 — Correct endpoint + reachable fallback**: Change `fetchUsers` to request the canonical user-list endpoint (`/users/list`, or `/users`) instead of `/users/summary`, parse with `toList<UserOption>(...)`, and structure the request so a failure of the primary call does not skip the fallback (e.g. wrap the primary attempt in its own `try`/`catch` that logs and then attempts the fallback, rather than nesting the fallback after the primary inside one `try`). Display-name resolution (`name || full_name || username`) and selection handling are untouched.

6. **Defect 6 — Rebalance modal grid (presentational)**: Adjust the modal's section grouping/ordering so the two-column `grid-cols-1 md:grid-cols-2` reads logically and is balanced in RTL (e.g. redistribute the five cards or restructure columns), without adding, removing, renaming, reordering (semantically), or revalidating any field, and without changing the saved payload.
   - **Optional sub-item**: Change the Cancel button to call `handleModalClose` and reset `file` state on close, so a previously chosen attachment does not persist into the next modal open. This must not alter which data is submitted on save.

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate each defect on the unfixed code, then verify the fix works correctly and preserves existing behavior. Because Defects 1 and 6 are presentational and Defect 2 is timing-based, assertions target observable artifacts — produced class strings, requested endpoints, refetch counts, and serialized payloads — rather than rendered pixels.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate each defect BEFORE implementing the fix. Confirm or refute the root cause analysis. If we refute, we will need to re-hypothesize.

**Test Plan**: Write component/unit tests (and a production-build assertion where relevant) that exercise each defect path and assert the buggy outcome, then run them against the UNFIXED code.

**Test Cases**:
1. **Dynamic color class test (Defect 1)**: Assert that matrix/dashboard render paths produce interpolated tokens (e.g. a class list containing `bg-emerald-50` only via interpolation) and, ideally, that a production build's CSS output lacks the expected color utilities (will fail/expose the defect on unfixed code).
2. **Search refetch test (Defect 2)**: Simulate typing N characters into the search box and assert the API mock was called N times (demonstrates per-keystroke refetch on unfixed code).
3. **Maturity clear test (Defect 3)**: Set a maturity value, clear it, submit, and assert the multipart payload contains `maturity_score="NaN"` (will demonstrate the defect on unfixed code).
4. **fetchUsers error-logging test (Defect 4)**: Make the user request reject and assert `logger.error` was NOT called (demonstrates the swallow on unfixed code).
5. **Wrong-endpoint test (Defect 5)**: Assert `fetchUsers` calls `/users/summary` and that, given a stats-object response, the `users` state ends up `[]` (dropdown empty).
6. **Modal layout test (Defect 6)**: Snapshot/inspect the modal grid and assert the unbalanced 2-vs-3 column distribution (baseline for the presentational change).

**Expected Counterexamples**:
- Interpolated color classes absent from production CSS; `maturity_score="NaN"` in the payload; N refetches for N keystrokes; no `logger.error` on a rejected user fetch; `/users/summary` requested and `users == []`.
- Possible causes: missing safelist/interpolation (Defect 1), `search` effect dependency (Defect 2), `parseInt('')` (Defect 3), empty `catch` (Defect 4), wrong endpoint + nested fallback (Defect 5).

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed code produces the expected behavior.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  result := fixedComplianceMatrix(input)
  ASSERT expectedBehavior(result)
  // Defect 1: result.classString is a complete literal present in built CSS
  // Defect 2: refetchCount(rapidKeystrokes) == 1
  // Defect 3: payload omits maturity_score AND formData.maturity_score != NaN
  // Defect 4: logger.error called on rejection
  // Defect 5: requestedEndpoint != '/users/summary' AND users.length > 0 when list returned
  // Defect 6: modal grid balanced AND submitted payload fields unchanged
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed code produces the same result as the original code.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT originalComplianceMatrix(input) = fixedComplianceMatrix(input)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many test cases automatically across the input domain (filter combinations, form-field values, valid maturity numbers including `0`, user lists).
- It catches edge cases that manual unit tests might miss.
- It provides strong guarantees that behavior is unchanged for all non-buggy inputs.

**Test Plan**: Observe behavior on UNFIXED code first for non-bug inputs (filter-select refetch, valid maturity serialization, other field serialization, successful user load), then write property-based tests capturing that behavior and assert it still holds after the fix.

**Test Cases**:
1. **Filter-select immediate refetch**: Observe that changing source/status refetches immediately on unfixed code, then verify this continues (no debounce on selects) and that the same query parameters/result set are produced.
2. **Query-parameter and table-state parity**: For random combinations of `search` / `source_type` / `compliance_status`, assert identical query strings and identical row/empty/error rendering decisions before and after the fix.
3. **Valid maturity and other fields**: For random valid maturity values (including `0`) and random fills of the other fields, assert the serialized payload is identical before and after the fix.
4. **Static / CSS-variable colors**: Assert registry-tab static ternary classes and `[var(--color-primary)]`/View-modal accents produce identical class strings before and after the fix.
5. **Successful user load**: For random user lists returned by the (corrected) endpoint, assert display-name resolution (`name || full_name || username`) and `responsible_person_id` submission are unchanged versus the original's successful path.

### Unit Tests

- Color lookup maps return complete literal classes for every token used by `statusConfig`, `sourceColors`, and `stats[].color`.
- Maturity `onChange` maps `''` → `null`, valid numbers (including `0`) → the number, and non-numeric → `null`.
- `handleSave` omits `maturity_score` when `null`/`undefined` and includes it when a number.
- `fetchUsers` requests the corrected endpoint, calls `logger.error` on rejection, and populates `users` from a list response.

### Property-Based Tests

- Generate random filter/search input sequences and verify exactly one debounced refetch pair for search bursts while filter changes refetch immediately (Property 2, 8).
- Generate random form-field values and verify the serialized payload is unchanged for all non-maturity fields and for valid maturity values (Property 9).
- Generate random user lists and verify display-name resolution and `responsible_person_id` submission are preserved (Property 10).
- Generate random color tokens and verify only complete literal classes are produced (Property 1) while static/CSS-variable paths are byte-identical (Property 7).

### Integration Tests

- Full Add Record flow: open modal, fill fields (clear maturity), save, and assert the request omits `maturity_score` and includes all other fields; assert the responsible-person dropdown is populated.
- Production-build color verification: build `apps/web` and assert the matrix/dashboard color utilities are present in the emitted CSS.
- Search-then-filter flow: type a search term (single debounced refetch), then change a filter (immediate refetch), asserting correct query parameters and result rendering throughout, with no change to focus behavior.
