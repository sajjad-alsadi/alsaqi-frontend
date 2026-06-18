---
target: Correspondence Management
total_score: 22
p0_count: 0
p1_count: 2
timestamp: 2026-06-17T13-18-24Z
slug: apps-web-src-modules-correspondence
---
# Design Critique: Correspondence Management

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | Loading state is a bare spinner; no skeleton screen for the table or dashboard cards. |
| 2 | Match System / Real World | 3 | Domain language accurate. Minor: untranslated fallbacks could surface. |
| 3 | User Control and Freedom | 2 | No undo for archive/delete. No way to clear all filters at once. |
| 4 | Consistency and Standards | 3 | Consistent component vocabulary. Minor divergence in modal/button patterns. |
| 5 | Error Prevention | 2 | Zod validation present but no autosave, no inline hints, no format guidance. |
| 6 | Recognition Rather Than Recall | 3 | Tabs and breadcrumbs good. Dropdowns offer no search; filter state not in URL. |
| 7 | Flexibility and Efficiency | 1 | No keyboard shortcuts, no bulk actions, no saved searches. |
| 8 | Aesthetic and Minimalist Design | 3 | Clean layout, proper tokens. Dashboard stat cards slightly generic. |
| 9 | Error Recovery | 2 | Generic toast errors, no retry, form data lost on failure. |
| 10 | Help and Documentation | 1 | No contextual help, tooltips, or guided empty states. |
| **Total** | | **22/40** | **Acceptable** |

## Anti-Patterns Verdict

No absolute-ban violations. The interface avoids AI slop tells (no gradient text, glassmorphism, side-stripes, numbered markers). Dashboard stat cards are the weakest spot — the standard icon+number+label grid. Overall reads as competent product UI, not AI-generated, but "looks like every admin panel" risk.

Deterministic scan unavailable (dependency error). Manual inspection: 0 absolute-ban violations. Potential contrast concern with text-[10px] table headers.

## Overall Impression

Functional, well-structured correspondence register following the design system consistently. Architecture solid (tabs, Portal modals, pagination, debounced search, Zod validation). Operates as record-keeping CRUD — doesn't yet help the auditor prioritize what needs attention. Biggest opportunity: elevate from data entry register to workflow-aware system.

## What's Working

1. Consistent component vocabulary across all registers (filter bar → table → pagination pattern).
2. Bidirectional awareness built-in (dir attribute, text-start, start-4, rtl:rotate-180).
3. Structured detail view with breadcrumbs, tabs, sidebar tracking metadata.

## Priority Issues

### [P1] Dashboard stat cards offer no workflow intelligence
Dashboard shows counts but no urgency signals. No overdue items, no "needs attention" surface. Auditors can't prioritize next action.

### [P1] No bulk operations or keyboard efficiency
Each item requires individual modal interaction. No multi-select, no batch archive/refer, no keyboard navigation. Friction for realistic 15+ item sessions.

### [P2] Generic loading and empty states
Bare spinner instead of skeleton rows. Empty states show plain text with no guidance or CTA.

### [P2] Error handling is opaque
All errors show generic "An error occurred" toast. Form data lost on submission failure. No specific error messages.

### [P2] Table header legibility concern with 10px text
text-[10px] with muted color on soft background likely fails WCAG AA contrast (4.0:1 vs required 4.5:1). Especially problematic for Arabic text.

## Persona Red Flags

**Hanan (Audit Manager):** No saved filters, no sortable columns, no batch actions, no overdue visibility. Serial one-at-a-time referral workflow.

**Fahd (New Auditor):** No tooltips, no field descriptions, 12-field form with no progressive disclosure. "Classification" vs "Priority" unexplained.

**Noor (Compliance Officer, Tablet):** Hidden hover-only actions invisible on touch. 8-column table overflows on iPad. No collapsed filter state for mobile.

## Minor Observations

- Stat cards clickable but no visual affordance indicating clickability.
- Delete modal uses bg-main instead of bg-card (inconsistent with other modals).
- MoreVertical button in Incoming table is a dead affordance (no dropdown attached).
- Archive button in Details uses non-standard bg-[var(--color-text-muted)] instead of Button component.
- formatNumber applied to potentially non-numeric sequence_number/letter_number values.

## Questions to Consider

- What if dashboard opened to "Attention Required" showing overdue items?
- Could the 12-field form use progressive disclosure (3 steps)?
- Should row actions be always visible for a desktop-first tool?
- Should filter state persist in URL for bookmarks and shared links?
