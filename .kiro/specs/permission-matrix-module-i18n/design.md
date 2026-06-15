# Permission Matrix Module i18n Bugfix Design

## Overview

In the Role Permissions matrix (User Management module), module-name rows are rendered with `t(`modules.${module}`)`, where `module` is a backend-supplied module identifier. Five backend identifiers — `AuditEvidence`, `AuditFindings`, `ComplianceMatrix`, `Notifications`, and `SystemLogs` — have no matching key inside the `modules` translation namespace. When i18next cannot resolve a key, the configured `parseMissingKeyHandler` in `apps/web/src/i18n.ts` returns the raw key wrapped with a warning marker (`⚠️ [modules.AuditEvidence]`, etc.). The result is that these rows display raw keys plus a warning indicator instead of human-readable labels, in both English and Arabic.

The fix is a pure data fix: add the five missing keys to the `modules` namespace in both locale files (`apps/web/src/locales/en.json` and `apps/web/src/locales/ar.json`) with correct localized values. No component or runtime logic changes are required. The matrix already calls `t()` correctly; once the keys exist, i18next resolves them normally and the `parseMissingKeyHandler` warning path is never hit for these identifiers.

The strategy is deliberately minimal and additive to satisfy the regression-prevention requirements (section 3): we only add new keys and never modify, rename, or remove existing keys in any namespace. An equivalent prior fix (`job-titles-i18n`) established this same additive, preservation-tested pattern in this codebase, which this design follows.

## Glossary

- **Bug_Condition (C)**: The condition that triggers the bug — a module identifier supplied to `t(`modules.${module}`)` that has no matching key in the `modules` namespace, causing i18next to fall back to the missing-key handler. Specifically the set `{ AuditEvidence, AuditFindings, ComplianceMatrix, Notifications, SystemLogs }`.
- **Property (P)**: The desired behavior — each affected identifier resolves to a localized, human-readable label for the active language with no warning marker.
- **Preservation**: All keys in the `modules` namespace (and every other namespace) that already resolve correctly must continue to resolve to their exact current values, in both English and Arabic.
- **modules namespace**: The `modules` object in `apps/web/src/locales/en.json` and `apps/web/src/locales/ar.json` that maps module identifiers to display labels.
- **parseMissingKeyHandler**: The handler in `apps/web/src/i18n.ts` that produces `⚠️ [<key>]` (or `⚠️ <other-language-value>`) whenever a key cannot be resolved. This is the source of the visible warning indicator.
- **module identifier**: A backend-supplied string (e.g. `AuditEvidence`) used by `RolePermissions.tsx` to build the translation key `modules.<identifier>`.

## Bug Details

### Bug Condition

The bug manifests when the Role Permissions matrix renders a row whose backend module identifier is one of `AuditEvidence`, `AuditFindings`, `ComplianceMatrix`, `Notifications`, or `SystemLogs`. The `modules` translation namespace is missing a key matching that identifier, so i18next invokes `parseMissingKeyHandler`, which returns the raw key decorated with a `⚠️` warning marker instead of a translated label.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type { moduleIdentifier: string, language: 'en' | 'ar' }
  OUTPUT: boolean

  RETURN input.moduleIdentifier IN { 'AuditEvidence', 'AuditFindings',
                                     'ComplianceMatrix', 'Notifications',
                                     'SystemLogs' }
         AND NOT keyExists('modules.' + input.moduleIdentifier, input.language)
END FUNCTION
```

### Examples

- Matrix renders a row for `AuditEvidence` (EN) → Actual: `⚠️ [modules.AuditEvidence]`. Expected: `Audit Evidence`.
- Matrix renders a row for `AuditFindings` (AR) → Actual: `⚠️ [modules.AuditFindings]`. Expected: `نتائج التدقيق`.
- Matrix renders a row for `ComplianceMatrix` (EN) → Actual: `⚠️ [modules.ComplianceMatrix]`. Expected: `Compliance Matrix`.
- Matrix renders a row for `Notifications` (AR) → Actual: `⚠️ [modules.Notifications]`. Expected: `الإشعارات`.
- Matrix renders a row for `SystemLogs` (EN) → Actual: `⚠️ [modules.SystemLogs]`. Expected: `System Logs`.
- Edge case: `AuditCharter` (already present) → Expected and Actual: `Audit Charter` (must remain unaffected by the fix).

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Module identifiers that already have a matching key (`AuditCharter`, `AuditPlans`, `AuditProgramLibrary`, `AuditTasks`, `Correspondence`, `Dashboard`, `Departments`, `IntegrityManagement`, `OrgStructure`, `Recommendations`, `Reports`, `RiskRegister`, `Settings`, `UserManagement`, and all others) must continue to render their existing localized label, unchanged, in both languages.
- All existing English values in the `modules` namespace must remain byte-for-byte identical.
- All existing Arabic values in the `modules` namespace must remain byte-for-byte identical.
- Every other component that resolves a key from the `modules` namespace (e.g. `notificationHelpers.ts`) must continue to resolve all existing keys to their current values.
- The `parseMissingKeyHandler` behavior for genuinely missing keys must remain intact — keys that truly do not exist still produce the `⚠️` fallback.

**Scope:**
All inputs that do NOT involve the five affected identifiers should be completely unaffected by this fix. This includes:
- Any module identifier already present in the `modules` namespace.
- Keys in any other translation namespace (`common`, `userManagement`, `permissions`, etc.).
- The missing-key warning behavior for identifiers that are genuinely absent.

**Note:** The actual expected correct behavior for the affected identifiers is defined in the Correctness Properties section (Property 1). This section focuses on what must NOT change.

## Hypothesized Root Cause

Based on the bug description and code inspection, the cause is confirmed (not merely hypothesized):

1. **Missing translation keys (confirmed root cause)**: The `modules` object in both `apps/web/src/locales/en.json` and `apps/web/src/locales/ar.json` does not contain keys for `AuditEvidence`, `AuditFindings`, `ComplianceMatrix`, `Notifications`, or `SystemLogs`. Verified by direct inspection of both files. Note that similar-but-distinct keys exist (`Evidence`, `Findings`, `SystemErrorLogs`), which is why the rows look partially populated overall but these specific rows fall through.

2. **Backend/frontend identifier mismatch**: The backend permissions list emits PascalCase composite identifiers (`AuditEvidence`) while the namespace historically only defined shorter forms (`Evidence`). The namespace was never extended to cover the newer composite identifiers.

3. **Fallback amplifies visibility**: `parseMissingKeyHandler` in `apps/web/src/i18n.ts` decorates unresolved keys with a `⚠️` marker, so the missing keys surface as obvious broken-looking rows rather than silently.

The component logic in `RolePermissions.tsx` (`t(`modules.${module}`)`) is correct and requires no change.

## Correctness Properties

Property 1: Bug Condition - Affected module identifiers resolve to localized labels

_For any_ input where the bug condition holds (isBugCondition returns true) — i.e. the module identifier is one of `AuditEvidence`, `AuditFindings`, `ComplianceMatrix`, `Notifications`, `SystemLogs` — the fixed code SHALL resolve `modules.<identifier>` to a non-empty, human-readable localized label for the active language (English or Arabic) that does NOT contain the `⚠️` warning marker and is NOT equal to the raw key string.

**Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5**

Property 2: Preservation - Existing translation keys unchanged

_For any_ key in the `modules` namespace (and every other namespace) where the bug condition does NOT hold (isBugCondition returns false), the fixed locale files SHALL resolve that key to exactly the same value as the original locale files, in both English and Arabic; and genuinely missing keys SHALL continue to trigger the `parseMissingKeyHandler` warning fallback.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4**

## Fix Implementation

### Changes Required

The root cause is confirmed, so the fix is purely additive data changes to two locale files.

**File**: `apps/web/src/locales/en.json`

**Location**: the `modules` object

**Specific Changes**:
1. **Add `AuditEvidence`**: `"AuditEvidence": "Audit Evidence"`
2. **Add `AuditFindings`**: `"AuditFindings": "Audit Findings"`
3. **Add `ComplianceMatrix`**: `"ComplianceMatrix": "Compliance Matrix"`
4. **Add `Notifications`**: `"Notifications": "Notifications"`
5. **Add `SystemLogs`**: `"SystemLogs": "System Logs"`

**File**: `apps/web/src/locales/ar.json`

**Location**: the `modules` object

**Specific Changes**:
1. **Add `AuditEvidence`**: `"AuditEvidence": "أدلة التدقيق"`
2. **Add `AuditFindings`**: `"AuditFindings": "نتائج التدقيق"`
3. **Add `ComplianceMatrix`**: `"ComplianceMatrix": "مصفوفة الامتثال"`
4. **Add `Notifications`**: `"Notifications": "الإشعارات"`
5. **Add `SystemLogs`**: `"SystemLogs": "سجلات النظام"`

**Constraints on the edit:**
- Only add the five new key/value pairs per file. Do not modify, reorder for semantic effect, rename, or delete any existing key.
- Keep both files valid JSON (mind trailing commas).
- Ensure the new keys are added to BOTH locales so neither language falls back to the missing-key handler.
- No changes to `RolePermissions.tsx`, `i18n.ts`, or any other source file are required.

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bug on the unfixed locale files, then verify the fix resolves the affected identifiers and preserves every existing key. This mirrors the established `job-titles-i18n` preservation-test pattern already present in `apps/web/src/locales/`.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE adding the keys. Confirm the root cause (missing keys → `⚠️` fallback). If a test unexpectedly passes on unfixed code, the root cause must be re-examined.

**Test Plan**: Using an isolated i18next instance loaded from `en.json` and `ar.json` (with the same `parseMissingKeyHandler` shape as `i18n.ts`), resolve `modules.<identifier>` for each affected identifier in both languages and assert the result is a clean localized label. Run on the UNFIXED files to observe the `⚠️` failures.

**Test Cases**:
1. **AuditEvidence (EN/AR)**: resolve `modules.AuditEvidence` (will fail on unfixed code → `⚠️ [modules.AuditEvidence]`)
2. **AuditFindings (EN/AR)**: resolve `modules.AuditFindings` (will fail on unfixed code)
3. **ComplianceMatrix (EN/AR)**: resolve `modules.ComplianceMatrix` (will fail on unfixed code)
4. **Notifications (EN/AR)**: resolve `modules.Notifications` (will fail on unfixed code)
5. **SystemLogs (EN/AR)**: resolve `modules.SystemLogs` (will fail on unfixed code)

**Expected Counterexamples**:
- Each affected identifier resolves to `⚠️ [modules.<identifier>]` (or `⚠️ <other-language-value>` if only one locale were patched).
- Cause: no matching key in the `modules` namespace for either locale.

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed locale files resolve to a clean localized label.

**Pseudocode:**
```
FOR ALL identifier IN { AuditEvidence, AuditFindings, ComplianceMatrix, Notifications, SystemLogs } DO
  FOR ALL lng IN { 'en', 'ar' } DO
    result := t('modules.' + identifier, { lng })
    ASSERT NOT result.contains('⚠️')
    ASSERT result != '[modules.' + identifier + ']'
    ASSERT result.length > 0
  END FOR
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed locale files resolve to exactly the same values as the original files.

**Pseudocode:**
```
FOR ALL key WHERE NOT isBugCondition(key) DO
  ASSERT t_original(key, lng) = t_fixed(key, lng)   FOR lng IN { 'en', 'ar' }
END FOR

// And the missing-key fallback still works:
ASSERT t_fixed('nonexistent.key.that.does.not.exist') CONTAINS '⚠️'
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It enumerates/generates across the full set of existing keys flattened from both locale files automatically.
- It catches accidental edits to unrelated keys that manual unit tests might miss.
- It provides strong guarantees that behavior is unchanged for all non-buggy keys.

**Test Plan**: Flatten both `en.json` and `ar.json` into dot-notation key paths, exclude keys satisfying the bug condition, and assert every remaining key resolves to its embedded value. Mirror the existing `job-titles-i18n-preservation.test.ts` harness (isolated `createInstance`, `flattenKeys`, `isBugCondition`).

**Test Cases**:
1. **modules namespace preservation**: every pre-existing `modules.*` key (e.g. `AuditCharter`, `Evidence`, `Findings`, `SystemErrorLogs`) resolves to its current EN and AR value, unchanged.
2. **Other-namespace preservation**: a representative set of keys from `common`, `userManagement`, `permissions` resolve to their current values.
3. **Missing-key fallback preservation**: a genuinely non-existent key still yields the `⚠️ [key]` fallback.

### Unit Tests

- Resolve each of the five affected `modules.*` keys in English and assert the exact expected label.
- Resolve each of the five affected `modules.*` keys in Arabic and assert the exact expected label.
- Assert none of the five resolved labels contain the `⚠️` marker.
- Assert both `en.json` and `ar.json` parse as valid JSON and contain the five new keys.

### Property-Based Tests

- For all keys flattened from the locale files where `NOT isBugCondition(key)`, assert resolved value equals the embedded value in both languages (preservation).
- For randomly generated non-existent keys, assert the `parseMissingKeyHandler` `⚠️` fallback still triggers (preservation of fallback behavior).

### Integration Tests

- Render `RolePermissions.tsx` with a permissions list including the five affected identifiers and assert each row shows a clean localized label with no `⚠️` marker, in English.
- Re-render with the language set to Arabic and assert each affected row shows its Arabic label with no `⚠️` marker.
- Render with a mix of previously-correct and affected identifiers and assert previously-correct rows are unchanged.
