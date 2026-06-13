# Bugfix Requirements Document

## Introduction

A comprehensive code analysis of the Compliance Matrix screen (`apps/web/src/modules/ComplianceMatrix/ComplianceMatrixPage.tsx`) — a three-tab UI (registry, matrix, dashboard) — surfaced six distinct defects. All six are frontend-only (`apps/web`) and are unrelated to the previously-resolved data-load envelope-unwrap issue (which now correctly uses `toList`/`toData` from `apps/web/src/api/utils/envelope.ts` and is explicitly out of scope here). Two of these (Defects 5 and 6) were reported directly by the user against the "Add Record" (إضافة سجل) modal; the others were found during code analysis.

The defects, in order of impact:

1. **Dynamic Tailwind color classes are purged in production (primary, highest impact).** Color utility classes are built from runtime tokens via string interpolation (e.g. `` `bg-${config.color}-50` ``). Tailwind's content scanner only matches complete, literal class strings, and `apps/web` has no `tailwind.config` and no safelist. In a production build these interpolated classes are purged, so the matrix tab, dashboard stat cards, count badges, accent bars, status-dropdown icons, and distribution bars render without their intended colors. The registry tab uses static ternary class strings and is unaffected, which masks the defect during casual/dev-mode testing.

2. **Search box re-fetches on every keystroke (no debounce).** The data-loading effect depends on `search`, firing `/compliance` + `/compliance/summary` requests (and toggling `loading`) on each character typed.

3. **`maturity_score` becomes `NaN` when the field is cleared.** The numeric input handler runs `parseInt(e.target.value)`; clearing the field yields `NaN`, which is serialized as the literal string `"NaN"` into the multipart payload on save.

4. **`fetchUsers` swallows errors silently.** Its `catch (e) {}` discards errors with no logging, inconsistent with every other fetcher in the file (which uses `logger.error('Operation failed', e)`), making a failed responsible-person dropdown load mysteriously empty.

5. **Responsible-person dropdown never loads users (user-reported, high impact).** In the Add Record modal, the "الشخص المسؤول" (responsible person) select is always empty (only the placeholder shows). `fetchUsers` calls `api.get('/users/summary')` and runs `toList<UserOption>(...)` over the result, but `/users/summary` is a statistics summary endpoint — the typed client (`apps/web/src/api/modules/user-management.ts`) defines `getSummary()` → `/v1/users/summary` validated by `UserSummarySchema = z.record(z.string(), z.unknown())`, a generic stats object consumed by the User Management dashboard for counts, not an array of users. `toList(...)` over that object yields `[]`. The intended `/users` fallback sits inside the same `try` block after the summary call, so when `/users/summary` rejects, the empty `catch` (Defect 4) swallows the error and the fallback never runs. The Compliance Matrix is the only screen using `/users/summary` to obtain a user list; the rest of the app uses `/users/list` (`AuditPlanForm.tsx`, `AuditTaskForm.tsx`) or `/users` (Correspondence) to populate user dropdowns.

6. **Add Record modal field layout/ordering is unbalanced (user-reported).** The modal form uses a two-column grid (`grid-cols-1 md:grid-cols-2`): the first column holds the "البيانات الأساسية" (basic data) and "المسؤولية والتبعيات" (responsibilities) cards; the second column holds "التقييم والمطابقة" (evaluation), "تواريخ هامة" (dates), and "الوثائق والمرفقات" (documents) cards. The columns are unbalanced (2 cards vs 3), producing a misaligned, illogical reading order in the RTL layout (the responsibilities block ends up adjacent to dates/documents, and the document-upload card sits alone).

A minor related cleanup was also noted: the modal "Cancel" button calls `setIsModalOpen(false)` directly (not the `handleModalClose` callback) and does not reset the selected `file` state, so a previously chosen attachment can persist into the next open of the modal. This is treated as an optional sub-item of Defect 6, not a primary defect.

The scope is strictly frontend (`apps/web`). Behavior outside these specific defects — including the registry tab's static color styling, existing data-loading via the envelope helpers, save/delete/status-update flows, and the existing `complianceMatrix-focus-loss` spec's concern — must be preserved.

## Bug Analysis

### Current Behavior (Defect)

**Defect 1 — Dynamic Tailwind color classes purged in production**

1.1 WHEN the matrix tab renders a status column header and a color class is built from `statusConfig[status].color` via string interpolation (e.g. `` `bg-${config.color}-50` ``, `` `text-${config.color}-600` ``, `` `border-${config.color}-100` ``, `` `border-${config.color}-500/30` ``) THEN the system produces a class string that the Tailwind content scanner cannot match, so in a production build the class is purged and the element renders without its intended color.

1.2 WHEN the matrix tab renders a status count badge with `` `bg-${config.color}-100 text-${config.color}-700 border-${config.color}-200` `` THEN the system produces purged classes and the badge renders without its intended color in a production build.

1.3 WHEN the matrix tab renders an item card accent bar with `` `bg-${config.color}-400/50 group-hover:bg-${config.color}-500` `` THEN the system produces purged classes and the accent bar renders without its intended color in a production build.

1.4 WHEN the dashboard tab renders a stat card with classes built from `stat.color` (e.g. `` `border-b-${stat.color}-500` ``, `` `shadow-${stat.color}-500/5` ``, `` `hover:shadow-${stat.color}-500/10` ``, `` `bg-${stat.color}-50` ``, `` `text-${stat.color}-600` ``, `` `group-hover:text-${stat.color}-600` ``) THEN the system produces purged classes and the stat card renders without its intended color in a production build.

1.5 WHEN the dashboard tab renders a source distribution bar with classes built from `sourceColors[type]` (e.g. `` `text-${color}-600` ``, `` `from-${color}-500 to-${color}-600` ``) THEN the system produces purged classes and the percentage label and gradient bar render without their intended color in a production build.

1.6 WHEN the registry tab renders the status-change dropdown icons with `` `text-${v.color}-500` `` THEN the system produces purged classes and the dropdown status icons render without their intended color in a production build.

**Defect 2 — Search re-fetches on every keystroke**

1.7 WHEN the user types a character in the registry search box THEN the system immediately issues both `/compliance` and `/compliance/summary` requests and sets `loading` true for that keystroke, so a burst of typing produces one request pair (and re-render cascade) per character with no debounce.

**Defect 3 — `maturity_score` becomes `NaN` when cleared**

1.8 WHEN the user clears the maturity-score number input in the edit/add form THEN the system sets `formData.maturity_score` to `NaN` (via `parseInt('')`), and on save serializes it into the multipart payload as the literal string `"NaN"`.

**Defect 4 — `fetchUsers` swallows errors silently**

1.9 WHEN the `/users/summary` (and `/users` fallback) request in `fetchUsers` rejects THEN the system silently discards the error in an empty `catch` block with no logging, leaving the responsible-person dropdown empty with no diagnostic trace.

**Defect 5 — Responsible-person dropdown never loads users**

1.10 WHEN `fetchUsers` runs and calls `api.get('/users/summary')` (a statistics summary endpoint validated as a generic stats object, not a user list) and applies `toList<UserOption>(...)` to the result THEN the system produces an empty `users` array, so the responsible-person ("الشخص المسؤول") select renders with only its placeholder and no selectable users.

1.11 WHEN `/users/summary` rejects (e.g. error/404) THEN the `/users` fallback — placed inside the same `try` block after the summary call — never executes because the empty `catch` (Defect 4) swallows the rejection, leaving `users` empty.

**Defect 6 — Add Record modal field layout/ordering is unbalanced**

1.12 WHEN the Add/Edit modal renders its sections in a two-column grid (`grid-cols-1 md:grid-cols-2`) with two cards in the first column (basic data, responsibilities) and three in the second (evaluation, dates, documents) THEN the system produces an unbalanced, illogical reading order in the RTL layout, with the document-upload card left isolated and the responsibilities block visually adjacent to unrelated date/document sections.

### Expected Behavior (Correct)

**Defect 1 — Dynamic Tailwind color classes purged in production**

2.1 WHEN the matrix tab renders a status column header THEN the system SHALL resolve `statusConfig[status].color` to complete, statically-analyzable class strings (via a lookup map of full class names) so the background, text, and border colors survive production purging and render correctly.

2.2 WHEN the matrix tab renders a status count badge THEN the system SHALL apply complete, statically-analyzable class strings so the badge background, text, and border colors render correctly in a production build.

2.3 WHEN the matrix tab renders an item card accent bar THEN the system SHALL apply complete, statically-analyzable class strings so the accent bar and its hover color render correctly in a production build.

2.4 WHEN the dashboard tab renders a stat card THEN the system SHALL resolve `stat.color` to complete, statically-analyzable class strings so the border, shadow, icon background, icon text, and hover text colors render correctly in a production build.

2.5 WHEN the dashboard tab renders a source distribution bar THEN the system SHALL resolve `sourceColors[type]` to complete, statically-analyzable class strings so the percentage label color and gradient bar render correctly in a production build.

2.6 WHEN the registry tab renders the status-change dropdown icons THEN the system SHALL apply complete, statically-analyzable class strings so the dropdown status icon colors render correctly in a production build.

**Defect 2 — Search re-fetches on every keystroke**

2.7 WHEN the user types in the registry search box THEN the system SHALL debounce the search-driven refetch so that rapid consecutive keystrokes result in a single `/compliance` + `/compliance/summary` request pair after the user pauses, rather than one pair per character.

**Defect 3 — `maturity_score` becomes `NaN` when cleared**

2.8 WHEN the user clears the maturity-score number input THEN the system SHALL set `formData.maturity_score` to `null`/`undefined` (not `NaN`), and on save SHALL omit the field from the multipart payload rather than serializing the string `"NaN"`.

**Defect 4 — `fetchUsers` swallows errors silently**

2.9 WHEN the `/users/summary` (and `/users` fallback) request in `fetchUsers` rejects THEN the system SHALL log the error via `logger.error('Operation failed', e)`, consistent with the other fetchers in the file.

**Defect 5 — Responsible-person dropdown never loads users**

2.10 WHEN `fetchUsers` runs THEN the system SHALL request a proper user-list endpoint — the canonical `/users/list` pattern used elsewhere in the app (or `/users`), not `/users/summary` — and parse the result envelope-agnostically via `toList`, so the responsible-person select is populated with selectable users.

2.11 WHEN one user-list request fails THEN the system SHALL NOT let that failure silently prevent the dropdown from loading; the error SHALL be logged (per Defect 4's fix) and any fallback request SHALL be reachable rather than skipped by a swallowed rejection.

**Defect 6 — Add Record modal field layout/ordering is unbalanced**

2.12 WHEN the Add/Edit modal renders THEN the system SHALL present its sections in a logical, balanced order/grouping that reads correctly in the RTL layout, without changing which fields exist, their validation, or the data submitted on save.

### Unchanged Behavior (Regression Prevention)

**Color rendering (Defect 1)**

3.1 WHEN the registry tab renders status badges, source badges, and review-date highlights using existing static ternary class strings THEN the system SHALL CONTINUE TO render those colors correctly (these paths already use complete literal classes and must remain unchanged).

3.2 WHEN any element renders a color derived from a fixed value or CSS variable (e.g. `[var(--color-primary)]`, the View modal's `amber-500`/`emerald-500`/`slate-500` ternary accents) THEN the system SHALL CONTINUE TO render those colors correctly.

3.3 WHEN the matrix, dashboard, and registry tabs render their layout, content, counts, labels, icons, and translated text THEN the system SHALL CONTINUE TO display the same structure and data as before the color fix.

**Search and data loading (Defect 2)**

3.4 WHEN the user changes the source filter or the status filter THEN the system SHALL CONTINUE TO refetch immediately (debouncing applies to the search input only, not the filter selects).

3.5 WHEN a search term, source filter, or status filter is applied THEN the system SHALL CONTINUE TO send the same `search` / `source_type` / `compliance_status` query parameters and produce the same filtered result set as before.

3.6 WHEN the registry table receives data, an empty result, or a load error THEN the system SHALL CONTINUE TO show the table rows, the empty state, or the error state respectively, exactly as before.

3.7 WHEN focus behavior in the search box is considered THEN the system SHALL NOT alter the focus-handling concern owned by the separate `compliance-matrix-focus-loss` spec; this fix is limited to the redundant-fetch/performance defect.

**Save form (Defect 3)**

3.8 WHEN the user enters a valid numeric maturity score (including `0`) THEN the system SHALL CONTINUE TO store that number in `formData.maturity_score` and serialize it into the payload on save.

3.9 WHEN the user edits an existing record that already has a `maturity_score` THEN the system SHALL CONTINUE TO display the existing value in the input.

3.10 WHEN any other form field (ref number, title, source, status, dates, responsible person, department, gap notes, attachment) is filled and saved THEN the system SHALL CONTINUE TO serialize and submit those fields unchanged.

**User dropdown loading (Defects 4, 5)**

3.11 WHEN the corrected user-list endpoint returns users THEN the system SHALL populate the responsible-person dropdown from that list, parsed envelope-agnostically via `toList`. (This supersedes the prior assertion that the dropdown be populated from `/users/summary`, which Defect 5 establishes as the wrong endpoint.)

3.12 WHEN `fetchUsers` succeeds THEN the only behavioral change relative to the buggy version SHALL be the corrected endpoint (Defect 5) and the added error logging (Defect 4); the resulting dropdown state and selection handling SHALL otherwise be unchanged.

3.13 WHEN users load successfully THEN the dropdown SHALL CONTINUE TO list each user's display name (`name || full_name || username`) and SHALL CONTINUE TO submit the selected `responsible_person_id` unchanged.

**Add Record modal layout (Defect 6)**

3.14 WHEN the Add/Edit modal form renders and is saved THEN all existing fields (ref number, title, source, issuing authority, responsible person, department, status, maturity score, gap notes, effective date, review date, PDF attachment) SHALL CONTINUE TO be present and SHALL CONTINUE TO submit unchanged; this is a presentational/ordering fix only, with no change to fields, validation, or the saved payload.

3.15 WHEN the modal is opened, edited, and either saved or cancelled THEN the system SHALL CONTINUE TO perform the same create/update behavior as before; any optional cleanup of the Cancel handler or selected-`file` reset SHALL NOT alter which data is submitted on save.
