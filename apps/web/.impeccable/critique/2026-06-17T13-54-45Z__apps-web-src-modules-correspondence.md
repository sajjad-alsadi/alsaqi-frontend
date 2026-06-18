---
target: Correspondence Management
total_score: 24
p0_count: 0
p1_count: 0
timestamp: 2026-06-17T13-54-45Z
slug: apps-web-src-modules-correspondence
---
# Design Critique: Correspondence Management (Post-Fix)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Skeleton loading communicates structure; error states with retry clear. Minor: no modal submission progress. |
| 2 | Match System / Real World | 3 | Domain language accurate. Some i18n keys fall through to English strings. |
| 3 | User Control and Freedom | 2 | No undo for archive/delete. Can't clear all filters in one click from Outgoing. |
| 4 | Consistency and Standards | 3 | Component vocabulary consistent. Delete confirmation still uses raw button. |
| 5 | Error Prevention | 2 | Zod validation present but no unsaved-changes guard, no inline validation until blur. |
| 6 | Recognition Rather Than Recall | 3 | Tabs and breadcrumbs good. Dropdowns lack search for long lists. |
| 7 | Flexibility and Efficiency | 1 | No keyboard shortcuts, no bulk actions, no sortable columns. |
| 8 | Aesthetic and Minimalist Design | 3 | Clean, proper token usage. Stat cards differentiate interactive/static. |
| 9 | Error Recovery | 3 | Error states with retry. Form data preserved on failure. Double feedback in some cases. |
| 10 | Help and Documentation | 1 | No contextual help in forms. Empty states guide toward action. |
| **Total** | | **24/40** | **Acceptable** |

## Anti-Patterns Verdict

No absolute-ban violations. Module reads as competent product surface. Dashboard stat cards avoid hero-metric template. Improvements from onboard/harden/polish pass measurably cleaned surface. Remaining quality is appropriately restrained for audit tool.

Detector unavailable. Manual inspection: 0 absolute-ban violations. Sequence number contrast fails (~2.2:1 with border-strong on white). Table headers improved to 11px.

## Overall Impression

Significant improvement from first critique. Loading/error/empty trifecta resolved. Score moved 22→24. Qualitative improvement in state handling more meaningful than numeric delta. Biggest remaining opportunities: workflow intelligence on dashboard, table accessibility (hover-only actions on touch, sequence number contrast).

## What's Working

1. Loading → Error → Empty state trifecta complete with structured, intentional UI.
2. Consistent component vocabulary (shared Button used throughout, dead affordances removed).
3. Clickability affordance on stat cards with proper role/aria-label differentiation.

## Priority Issues

### [P2] Sequence number text contrast fails WCAG AA
Uses border-strong (#b8c5cf) on white — ~2.2:1. Should use text-muted or proper monospace style.

### [P2] Hover-only row actions invisible on touch devices
md:opacity-0 md:group-hover:opacity-100 hides actions on iPad/tablet with no hover. Use @media (hover: hover) instead.

### [P2] Delete button doesn't use shared Button component
Raw styled button instead of Button variant="destructive" in OutgoingRegister delete modal.

### [P3] Dashboard doesn't surface urgency or deadlines
Four raw counts with no temporal intelligence. No overdue indicator on Pending Responses.

### [P3] No unsaved-changes guard on form modals
Closing 12-field form modal discards data without confirmation.

## Persona Red Flags

**Hanan (Audit Manager):** No overdue visibility, no saved filter presets, no sortable columns. Works for individual items but doesn't scale to batch workflows.

**Fahd (New Auditor):** Empty states now guide him (improvement). 12-field form still shows everything at once with no section headers or field descriptions.

**Noor (Compliance Officer, iPad):** Row actions invisible on touch. Inconsistent affordance between Incoming (hover-gated) and Outgoing (full row clickable).

## Minor Observations

- "View All" link redundant when empty state is showing
- Empty state strings in English instead of i18n keys
- clearAllFilters doesn't reset pagination to page 1
- Status/referral/archive modals in Details don't show error feedback to user

## Questions to Consider

- What if Pending Responses showed a mini-list of overdue items instead of just a number?
- Should the Incoming form be a stepped layout within the modal?
- Should row actions be always-visible given desktop-first tool with space available?
