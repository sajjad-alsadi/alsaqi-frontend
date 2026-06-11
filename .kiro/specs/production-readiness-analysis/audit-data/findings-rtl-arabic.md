# RTL & Arabic Support Audit — Findings (Task 8.1)

## Scope

Inspected i18n configuration, HTML direction handling, language switching, and Arabic translation coverage.

### Files Inspected

| File | Purpose |
|------|---------|
| `apps/web/src/i18n.ts` | i18next initialization, language detection, direction updates |
| `apps/web/index.html` | Static HTML shell |
| `apps/web/src/components/LanguageSwitcher.tsx` | Locale toggle component |
| `apps/web/src/locales/ar.json` | Arabic translations (2861 lines) |
| `apps/web/src/locales/en.json` | English translations (2858 lines) |
| `apps/web/src/context/PreferencesContext.tsx` | Secondary direction-setting logic |

---

## Findings

### RTL-001

| Field | Detail |
|-------|--------|
| **Severity** | 🟡 Warning |
| **File** | `apps/web/index.html` |
| **Line(s)** | 2 |
| **Problem** | Static `<html lang="en">` with no `dir` attribute causes a flash-of-wrong-direction (FOWD) for Arabic users before JavaScript initializes. |
| **Production Impact** | Arabic-language users see a brief LTR layout on initial page load until `i18n.ts` runs and sets `dir="rtl"`. On slow connections or large JS bundles this flash is noticeable and feels unprofessional. |
| **Suggested Fix** | Add an inline `<script>` in `<head>` before any module scripts that reads `localStorage.getItem('i18nextLng')` and sets `document.documentElement.dir` and `document.documentElement.lang` synchronously. Example: `<script>((l)=>{const d=l==='ar'?'rtl':'ltr';document.documentElement.dir=d;document.documentElement.lang=l||'ar'})(localStorage.getItem('i18nextLng')||'ar')</script>`. Also set `lang="ar"` and `dir="rtl"` as static defaults since Arabic is the primary locale. |

---

### RTL-002

| Field | Detail |
|-------|--------|
| **Severity** | 🟢 Improvement |
| **File** | `apps/web/src/i18n.ts` |
| **Line(s)** | 56–66 |
| **Problem** | Direction is set in two independent places: `i18n.ts` (lines 56–66, via `updateDirection` on `languageChanged` event) and `PreferencesContext.tsx` (line 41, via `useEffect`). Dual-path direction setting creates a maintenance risk — future changes may update one location but not the other. |
| **Production Impact** | No immediate user-visible bug, but inconsistent maintenance could introduce subtle direction bugs if one handler is removed or modified without updating the other. |
| **Suggested Fix** | Consolidate direction-setting logic to a single source of truth. Either remove the `updateDirection` listener in `i18n.ts` and rely solely on `PreferencesContext`, or remove the `useEffect` in `PreferencesContext` and rely on `i18n.ts`. The `i18n.ts` approach is preferable since it fires before React mounts. |

---

### RTL-003

| Field | Detail |
|-------|--------|
| **Severity** | 🟢 Improvement |
| **File** | `apps/web/src/i18n.ts` |
| **Line(s)** | 22 |
| **Problem** | Browser language detection (`navigator` in detection order) is configured as the third fallback after `localStorage` and `cookie`. While technically present, the `lng` option on line 16 (`localStorage.getItem('i18nextLng') || 'ar'`) overrides the LanguageDetector for first-time visitors by hardcoding Arabic as default. The `LanguageDetector` plugin's `navigator` detection never gets a chance to run for new users. |
| **Production Impact** | An English-speaking user visiting for the first time (no localStorage entry) will see the Arabic interface. This is acceptable if Arabic is the intended primary audience, but deviates from standard i18n practice of auto-detecting browser preference. |
| **Suggested Fix** | If browser language detection for first-time visitors is desired, remove the explicit `lng` property and let `LanguageDetector` handle initial language selection (it will fall through `localStorage` → `cookie` → `navigator`). Keep `fallbackLng: 'ar'` as the safety net. If Arabic-first is intentional for the target audience, document this decision and mark as accepted. |

---

## Summary

| Severity | Count |
|----------|-------|
| 🔴 Critical | 0 |
| 🟡 Warning | 1 |
| 🟢 Improvement | 2 |

### Positive Observations (No Finding Required)

1. **Arabic locale fully configured**: `i18n.ts` includes Arabic in `resources`, `supportedLngs`, and `fallbackLng`. ✅
2. **Dynamic `dir` attribute is handled at runtime**: Both `i18n.ts` and `PreferencesContext.tsx` set `document.documentElement.dir` dynamically based on active locale. ✅
3. **LanguageSwitcher works correctly**: Calls `i18n.changeLanguage()` which triggers the `languageChanged` event and updates direction. Toggle logic is clean. ✅
4. **Comprehensive Arabic translation coverage**: `ar.json` (2861 lines) matches `en.json` (2858 lines) closely — only 3-line difference indicates near-complete parity. ✅
5. **Missing key fallback handler**: `parseMissingKeyHandler` provides graceful degradation with visual `⚠️` indicators for any untranslated keys. ✅
6. **Language persistence**: Detection config caches language choice to `localStorage` and `cookie`. ✅

---

*Validates: Requirements 7.1, 7.3*


---

# RTL & Arabic Support Audit — Findings (Task 8.2)

## Scope

Inspected CSS, Tailwind class usage, component directional properties, icon mirroring, form inputs, dropdowns, navigation, and locale-aware number/date/currency formatting.

### Files Inspected

| File | Purpose |
|------|---------|
| `apps/web/src/index.css` | Global CSS, animations, skip-link |
| `apps/web/src/components/auth/ChangePasswordModal.tsx` | Password form with eye toggle |
| `apps/web/src/components/auth/ContactAdminModal.tsx` | Contact form with icons |
| `apps/web/src/components/Pagination.tsx` | Pagination with directional icons |
| `apps/web/src/components/Breadcrumb.tsx` | Breadcrumb with chevron separators |
| `apps/web/src/components/Layout.tsx` | Main layout with sidebar navigation |
| `apps/web/src/components/Login/LoginForm.tsx` | Login form inputs |
| `apps/web/src/modules/AuditWorkspace.tsx` | Audit workspace with carousel navigation |
| `apps/web/src/modules/RiskRegister.tsx` | Risk register with ArrowRight icon |
| `apps/web/src/modules/Reports/components/TopRisksList.tsx` | Top risks "View All" button |
| `apps/web/src/modules/ComplianceMatrix/ComplianceMatrixPage.tsx` | Compliance matrix with ChevronRight |
| `apps/web/src/modules/UserManagement/RolePermissions.tsx` | Role list with ChevronRight indicator |
| `apps/web/src/modules/OrgStructure/OrgStructurePage.tsx` | Org tree with expand chevrons |
| `apps/web/src/modules/Correspondence/CorrespondenceDetails.tsx` | Breadcrumb and back arrow |
| `apps/web/src/modules/AuditProgram/AuditProgramGrid.tsx` | Procedure link with chevron |
| `apps/web/src/modules/SystemLogsManagement.tsx` | Health percentage display |
| `apps/web/src/modules/Dashboard/index.tsx` | Dashboard with RTL-aware charts |
| `apps/web/src/components/PdfTemplateManagement.tsx` | Template editor textarea |
| `apps/web/src/components/PdfTemplateEditor.tsx` | PDF sample data textarea |
| `apps/web/src/utils/format.ts` | Number and date formatting utility |
| `apps/web/src/utils/formatService.ts` | Hook-based formatting service |
| `apps/web/src/utils/i18n.ts` | i18n number/date formatter |

---

## Findings

### RTL-004

| Field | Detail |
|-------|--------|
| **Severity** | 🟡 Warning |
| **File** | `apps/web/src/components/auth/ChangePasswordModal.tsx` |
| **Line(s)** | 97, 150 |
| **Problem** | Hardcoded `right-3` class on password visibility toggle buttons inside `dir="ltr"` containers. While the parent `div` is forced `dir="ltr"` (correct for password fields), the toggle button position uses `right-3` which is acceptable here since the input direction is explicitly LTR. However, if the design ever removes `dir="ltr"` or if other components copy this pattern without the dir override, it will break in RTL. The pattern is fragile. |
| **Production Impact** | Currently functions correctly because the parent has `dir="ltr"`. Low immediate impact, but the pattern differs from the RTL-conditional approach used in `ContactAdminModal.tsx`, creating inconsistency. |
| **Suggested Fix** | Replace `right-3` with `end-3` (Tailwind logical property) which respects the local `dir` attribute automatically: `className="absolute end-3 top-1/2 ..."`. This makes the pattern safe regardless of the parent dir context and aligns with the project's other RTL-aware components. |

---

### RTL-005

| Field | Detail |
|-------|--------|
| **Severity** | 🟡 Warning |
| **File** | `apps/web/src/modules/ComplianceMatrix/ComplianceMatrixPage.tsx` |
| **Line(s)** | 620 |
| **Problem** | Hardcoded `-mr-16 -mt-16` on a decorative blurred circle element. This decorative element is positioned with fixed `margin-right` negative offset that won't flip in RTL, causing it to appear on the wrong side. |
| **Production Impact** | Decorative element will appear offset to the wrong side in RTL mode. Minor visual inconsistency — affects aesthetics, not functionality. |
| **Suggested Fix** | Replace `-mr-16` with `-me-16` (margin-inline-end negative) to ensure the decorative circle respects the reading direction. |

---

### RTL-006

| Field | Detail |
|-------|--------|
| **Severity** | 🟡 Warning |
| **File** | `apps/web/src/modules/Reports/components/TopRisksList.tsx` |
| **Line(s)** | 25 |
| **Problem** | `ArrowRight` icon in "View All" button has no RTL mirroring (`rotate-180` or `rtl:rotate-180`). In RTL mode, the directional arrow should point left (indicating forward navigation in RTL reading direction). |
| **Production Impact** | Arabic users see a right-pointing arrow next to "عرض الكل" (View All) which contradicts the RTL reading flow expectation. Navigation affordance is visually incorrect. |
| **Suggested Fix** | Add `className="rtl:rotate-180"` to the ArrowRight icon: `<ArrowRight size={14} className="rtl:rotate-180" />`. This matches the pattern used in `CorrespondenceSystem.tsx` line 117 and `CorrespondenceDetails.tsx` line 124. |

---

### RTL-007

| Field | Detail |
|-------|--------|
| **Severity** | 🟡 Warning |
| **File** | `apps/web/src/modules/RiskRegister.tsx` |
| **Line(s)** | 282, 366 |
| **Problem** | `ArrowRight` icons used as visual indicators (pointing to "Mitigation" sections) have no RTL mirroring. These directional icons should flip in RTL to maintain visual flow direction. |
| **Production Impact** | In RTL mode, arrow indicators point opposite to the reading flow, causing a subtle visual inconsistency that makes the UI feel non-native for Arabic users. |
| **Suggested Fix** | Add `className="text-[var(--color-primary)] mt-0.5 rtl:rotate-180"` to the ArrowRight icons. Alternative: replace with a direction-neutral icon if the arrow is purely decorative. |

---

### RTL-008

| Field | Detail |
|-------|--------|
| **Severity** | 🟡 Warning |
| **File** | `apps/web/src/modules/UserManagement/RolePermissions.tsx` |
| **Line(s)** | 119 |
| **Problem** | `ChevronRight` icon indicating the selected role in the list does not mirror in RTL. It should point left when in RTL mode to indicate the currently active selection. |
| **Production Impact** | The selection indicator points in the wrong direction for Arabic users, breaking the visual hierarchy cue. |
| **Suggested Fix** | Add RTL rotation: `<ChevronRight size={14} className={`${selectedRoleId === role.id ? 'opacity-100' : 'opacity-0'} flex-shrink-0 rtl:rotate-180`} />`. This matches the pattern used in `AuditProgramGrid.tsx` line 118 and `OrgStructurePage.tsx` line 64. |

---

### RTL-009

| Field | Detail |
|-------|--------|
| **Severity** | 🟡 Warning |
| **File** | `apps/web/src/modules/ComplianceMatrix/ComplianceMatrixPage.tsx` |
| **Line(s)** | 532 |
| **Problem** | `ChevronRight` with static `className="rotate-180"` (making it point left) does not adapt to RTL. In RTL mode it should point right (i.e., no rotation). The hardcoded rotation is only correct for LTR. |
| **Production Impact** | "View All" link arrow points in wrong direction for Arabic users — it points left in both LTR and RTL, but in RTL it should point right. |
| **Suggested Fix** | Replace `className="rotate-180"` with `className="ltr:rotate-180"` or use a conditional based on `isRTL`: `className={isRTL ? '' : 'rotate-180'}`. |

---

### RTL-010

| Field | Detail |
|-------|--------|
| **Severity** | 🟡 Warning |
| **File** | `apps/web/src/index.css` |
| **Line(s)** | 313–320, 340–346 |
| **Problem** | `slideInRight` and `slideInLeft` animations use fixed `translateX` directions. In RTL mode, a "slide in from right" animation should actually slide from the left (inline-start). The `.animate-slide-in-right` and `.animate-slide-in-left` utility classes don't adapt to text direction. |
| **Production Impact** | Entry animations appear from the wrong side in RTL mode. Content that should slide in from the start of the reading direction (right in RTL) instead slides from the left, creating a jarring user experience. |
| **Suggested Fix** | Either: (1) Define RTL-specific keyframes using `[dir="rtl"]` selector that inverts the translateX values, or (2) Replace with logical-direction-aware animations using CSS custom properties: `@keyframes slideInStart { from { transform: translateX(calc(var(--dir-multiplier, 1) * 20px)); } }` where `--dir-multiplier` is `-1` in RTL. |

---

### RTL-011

| Field | Detail |
|-------|--------|
| **Severity** | 🟡 Warning |
| **File** | `apps/web/src/index.css` |
| **Line(s)** | 413–424 |
| **Problem** | `.skip-link` uses `left: -9999px` for off-screen positioning and `.skip-link:focus` uses `left: 10px` for visible positioning. These fixed directional properties don't respect RTL. In RTL, the skip link should appear from the right side. |
| **Production Impact** | In RTL mode, the skip-to-content link appears on the left side of the viewport when focused, which is contrary to the expected reading start position for Arabic users. Accessibility keyboard users in RTL will find the skip link in an unexpected position. |
| **Suggested Fix** | Replace `left: -9999px` with `inset-inline-start: -9999px` and `left: 10px` with `inset-inline-start: 10px`. |

---

### RTL-012

| Field | Detail |
|-------|--------|
| **Severity** | 🟡 Warning |
| **File** | `apps/web/src/utils/format.ts` |
| **Line(s)** | 18 |
| **Problem** | The `formatNumber` function in `format.ts` uses `n.toLocaleString('en-US')` for non-Arabic locales but performs manual digit replacement for Arabic (lines 11–13) instead of using `Intl.NumberFormat('ar-EG')`. The manual replacement doesn't handle thousand separators, decimal separators, or number grouping according to Arabic conventions. For example, `1234567` becomes `١٢٣٤٥٦٧` (no grouping) instead of the proper `١٬٢٣٤٬٥٦٧`. |
| **Production Impact** | Large numbers in Arabic mode are displayed without proper grouping separators, making them harder to read. For instance, a budget figure of 1500000 shows as `١٥٠٠٠٠٠` instead of `١٬٥٠٠٬٠٠٠`. |
| **Suggested Fix** | Use `Intl.NumberFormat` consistently: `return new Intl.NumberFormat('ar-EG', { useGrouping: true }).format(n)` for Arabic locale. This automatically provides proper Eastern Arabic numerals with correct grouping separators. |

---

### RTL-013

| Field | Detail |
|-------|--------|
| **Severity** | 🟡 Warning |
| **File** | `apps/web/src/utils/formatService.ts` |
| **Line(s)** | 62–75 |
| **Problem** | Same issue as RTL-012 — `formatNumber` in `formatService.ts` uses manual digit replacement for Arabic (lines 67–69) without handling thousand separators or grouping. The `toLocaleString('en-US')` is only applied for non-Arabic. |
| **Production Impact** | Identical to RTL-012 — numbers in Arabic mode lack proper grouping separators throughout the application (since this is the hook used by most components). |
| **Suggested Fix** | Replace the manual replacement with `return new Intl.NumberFormat('ar-IQ', { useGrouping: true }).format(n)` for consistency with other formatters in the same file that use `ar-IQ` locale. |

---

### RTL-014

| Field | Detail |
|-------|--------|
| **Severity** | 🟡 Warning |
| **File** | `apps/web/src/modules/SystemLogsManagement.tsx` |
| **Line(s)** | 181 |
| **Problem** | Health percentage is rendered using `{stats.healthPercent.toFixed(1)}%` which bypasses the `formatNumber` utility entirely. In Arabic mode, this displays Western numerals (e.g., "99.9%") instead of Eastern Arabic numerals (e.g., "٩٩٫٩٪"). The `%` sign should also be the Arabic percent sign `٪`. |
| **Production Impact** | Arabic users see a mixed-script display: Arabic text with Western numerals for the health percentage, breaking visual consistency with other formatted numbers on the page. |
| **Suggested Fix** | Use the `formatNumber` hook and Arabic percent formatting: `{formatNumber(stats.healthPercent.toFixed(1))}٪` or better, use `Intl.NumberFormat` with `style: 'percent'`: `new Intl.NumberFormat('ar-IQ', { style: 'percent', maximumFractionDigits: 1 }).format(stats.healthPercent / 100)`. |

---

### RTL-015

| Field | Detail |
|-------|--------|
| **Severity** | 🟡 Warning |
| **File** | `apps/web/src/components/PdfTemplateManagement.tsx`, `apps/web/src/components/PdfTemplateEditor.tsx` |
| **Line(s)** | PdfTemplateManagement.tsx:297, PdfTemplateEditor.tsx:471 |
| **Problem** | `text-left` class used on HTML/JSON code textareas. While `dir="ltr"` is set on these textareas (correct for code content), the `text-left` class is redundant but not harmful — it matches the explicit LTR direction. However, these textareas handle LTR content (HTML/JSON) so this is functionally correct. |
| **Production Impact** | No functional impact — the `dir="ltr"` attribute on the parent ensures correct alignment. The `text-left` class is technically redundant but harmless since the content (HTML/JSON code) is inherently LTR. |
| **Suggested Fix** | No fix needed — this is **acceptable**. The `text-left` on code editor textareas with explicit `dir="ltr"` is intentional and correct. Documenting as non-issue. |

---

### RTL-016 (Positive Finding — No Fix Required)

| Field | Detail |
|-------|--------|
| **Severity** | ✅ Pass |
| **File** | Multiple — Tailwind RTL configuration |
| **Line(s)** | N/A |
| **Problem** | No dedicated `tailwindcss-rtl` or `tailwindcss-logical` plugin is installed. |
| **Production Impact** | None — the project uses **Tailwind CSS v4** (via `@import "tailwindcss"` in index.css) which natively supports logical properties through the `start-`, `end-`, `ps-`, `pe-`, `ms-`, `me-` utilities without requiring a plugin. The `rtl:` variant is also built-in for conditional RTL styling. |
| **Suggested Fix** | No fix needed. Tailwind v4 provides RTL support natively. The codebase already uses these utilities extensively (found `start-`, `end-`, `ps-`, `pe-`, `ms-`, `me-` in 15+ components). |

---

## Summary (Task 8.2)

| Severity | Count |
|----------|-------|
| 🔴 Critical | 0 |
| 🟡 Warning | 12 |
| 🟢 Improvement | 0 |
| ✅ Pass | 1 |

### Positive Observations (No Finding Required)

1. **Extensive use of logical Tailwind utilities**: Majority of components use `start-`, `end-`, `ps-`, `pe-`, `ms-`, `me-` correctly (found in `LoginForm.tsx`, `Pagination.tsx`, `NotificationBell.tsx`, `PdfTemplateManagement.tsx`, `UserForm.tsx`, `SupportRequests.tsx`, `LoginIllustration.tsx`, `UndoToast.tsx`, etc.). ✅
2. **RTL-conditional icon mirroring widely adopted**: Components like `Breadcrumb.tsx`, `CorrespondenceDetails.tsx`, `AuditWorkspace.tsx`, `CorrespondenceSystem.tsx`, `OrgStructurePage.tsx`, `AuditProgramGrid.tsx`, and `Pagination.tsx` all implement `rtl:rotate-180` or conditional rotation for directional icons. ✅
3. **Directional class conditionals for complex positioning**: `ContactAdminModal.tsx` and `Pagination.tsx` use `isRtl ? 'pr-10 pl-4' : 'pl-10 pr-4'` patterns for icon-adjacent padding. ✅
4. **`gap-` utility used over `space-x-`**: The codebase overwhelmingly uses Flexbox `gap-` (direction-neutral) instead of `space-x-` (direction-dependent). Only 1 instance of `space-x-` found (with corresponding `space-x-reverse`). ✅
5. **RTL-aware date/currency formatting**: `formatService.ts` uses `Intl.DateTimeFormat` with `ar-IQ` locale and `Intl.NumberFormat` with `ar-IQ` for currency — correct Arabic locale conventions. ✅
6. **Navigation correctly handles RTL**: `Layout.tsx` sets `dir="rtl"` on root container, mirrors sidebar expand/collapse chevrons, and adjusts hover animations based on `isRTL`. ✅
7. **Pagination icons flip correctly**: `Pagination.tsx` swaps ChevronLeft/ChevronRight and ChevronsLeft/ChevronsRight based on `isRtl`. ✅
8. **Tables use `text-start` consistently**: All data tables use the logical `text-start` class for header/cell alignment (not `text-left`). ✅

### Icon Mirroring Summary

| Component | Icon | RTL Handling | Status |
|-----------|------|--------------|--------|
| `Breadcrumb.tsx` | ChevronRight | `rtl:rotate-180` | ✅ |
| `CorrespondenceDetails.tsx` | ChevronRight, ArrowLeft | `rtl:rotate-180` | ✅ |
| `CorrespondenceSystem.tsx` | ArrowRight | Conditional rotation | ✅ |
| `AuditWorkspace.tsx` | ArrowRight, ChevronRight | Conditional `isRTL` | ✅ |
| `Pagination.tsx` | Chevron icons | Swaps left/right variants | ✅ |
| `OrgStructurePage.tsx` | ChevronRight | Conditional `isRTL` | ✅ |
| `AuditProgramGrid.tsx` | ChevronRight | Conditional `isRTL` | ✅ |
| `TopRisksList.tsx` | ArrowRight | ❌ No RTL handling | ⚠️ RTL-006 |
| `RiskRegister.tsx` | ArrowRight | ❌ No RTL handling | ⚠️ RTL-007 |
| `RolePermissions.tsx` | ChevronRight | ❌ No RTL handling | ⚠️ RTL-008 |
| `ComplianceMatrixPage.tsx` | ChevronRight | Static `rotate-180` (LTR-only) | ⚠️ RTL-009 |

---

*Validates: Requirements 7.2, 7.4, 7.5, 7.6*
