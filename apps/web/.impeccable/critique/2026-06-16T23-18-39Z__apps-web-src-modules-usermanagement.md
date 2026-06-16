---
target: User Management
total_score: 24
p0_count: 0
p1_count: 2
timestamp: 2026-06-16T23-18-39Z
slug: apps-web-src-modules-usermanagement
---
### Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Loading states exist; toast notifications on actions; but no inline save progress or optimistic updates on bulk permission changes |
| 2 | Match System / Real World | 3 | Language is mostly clear; audit/admin domain terms appropriate for audience |
| 3 | User Control and Freedom | 2 | Delete/suspend have confirmations, but no undo after commit; user form has no draft-save; accidental tab switch loses form state |
| 4 | Consistency and Standards | 3 | Consistent card vocabulary, same badge patterns, same tab system; role chevron icon misplaced |
| 5 | Error Prevention | 2 | Basic validation (password length, required fields); no inline field validation feedback |
| 6 | Recognition Rather Than Recall | 3 | Tabs visible; role sidebar shows permission counts; icon-only action buttons lack visible labels |
| 7 | Flexibility and Efficiency | 2 | No keyboard shortcuts; no bulk user operations; no quick filters by status |
| 8 | Aesthetic and Minimalist Design | 3 | Clean, calm density; consistent with design system; some information noise in user cards |
| 9 | Error Recovery | 2 | Error messages exist but generic; no preservation of form data on failure |
| 10 | Help and Documentation | 1 | No contextual help; no tooltips explaining access scope or permission implications |
| **Total** | | **24/40** | **Acceptable** |

### Anti-Patterns Verdict

**LLM assessment:** Passes the product slop test. No AI-generated tells. Consistent application of the design system. Some template fatigue in section headers.

**Deterministic scan:** Unavailable (missing module dependency in detect.mjs).

**Manual code findings:**
- Toggle `after:left-[2px]` in RTL-breaking positions (2 occurrences)
- `whileHover={{ scale: 1.02 }}` on buttons (against DESIGN.md guidance)
- No `prefers-reduced-motion` fallback for staggered card animations

### Priority Issues

**[P1] Icon-only action buttons in user card footer — no labels, no tooltips**
Edit, Reset Password, Delete buttons are bare icons. Shield icon for "reset password" is ambiguous.
Fix: Add visible labels or accessible tooltips. Replace Shield with KeyRound.

**[P1] RTL breakage in toggle switches — hardcoded `left` positioning**
`after:left-[2px]` breaks in RTL for Arabic-primary users.
Fix: Replace with `after:start-[2px]` and verify translate direction.

**[P2] No inline validation or password strength indicator in user form**
Errors shown only after submission. No field-level validation.
Fix: Add inline validation states and password strength meter.

**[P2] No contextual help on permission matrix or access scope**
Zero guidance on what permissions mean or what access scopes imply.
Fix: Add info-icon tooltips and brief descriptions.

**[P2] Form state lost on accidental tab switch**
No unsaved-changes warning or draft persistence.
Fix: Add discard confirmation or session storage persistence.

### Persona Red Flags

**Fatima (Arabic-speaking Audit Manager):** Toggle switches break in RTL; `text-[7px]` too small for Arabic; animations from wrong direction.

**Ahmad (Power User):** No keyboard shortcuts; no bulk operations; no quick-filter chips; basic CSV export only.

**Noura (First-time Admin):** Icon-only actions confusing; no permission explanations; no onboarding guidance; no access scope documentation.

### Minor Observations

- `animate-pulse` on badge count becomes noise — pulse only on change
- `text-[9px]` labels carry meaningful content at WCAG-concerning sizes
- Password reset modal input has no associated label element
- Inconsistent motion import (`framer-motion` vs `motion/react`) in SupportRequests
- ChevronDown in Role select positioned at `start-3` instead of `end`

### Questions to Consider

- What happens when an admin accidentally deletes the wrong user? No soft-delete or recovery window exists.
- Would "recommended" permission presets per role reduce cognitive load?
- With 7 tabs, should related sub-features be grouped (e.g., "Security" = Sessions + Settings + History)?
