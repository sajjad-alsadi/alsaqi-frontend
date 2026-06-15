# Bugfix Requirements Document

## Introduction

In the Role Permissions matrix (User Management module), several module-name rows render as raw i18n keys instead of human-readable translated text. The affected rows display as `[modules.AuditEvidence]`, `[modules.AuditFindings]`, `[modules.ComplianceMatrix]`, `[modules.Notifications]`, and `[modules.SystemLogs]`, each accompanied by a missing-translation warning indicator. The module labels are rendered via `t(`modules.${module}`)`, where `module` values come from the backend permissions list. The `modules` translation namespace is missing keys that match these backend module identifiers, so i18next falls back to displaying the raw key. This makes the permissions matrix look broken and unprofessional in both English and Arabic, and obscures which module each permission row controls.

## Bug Analysis

### Current Behavior (Defect)

When the backend returns module identifiers that have no matching key in the `modules` translation namespace, the matrix shows the raw fallback key instead of a translated label.

1.1 WHEN the Role Permissions matrix renders a row for the module identifier `AuditEvidence` THEN the system displays the raw key `[modules.AuditEvidence]` with a missing-translation warning indicator
1.2 WHEN the Role Permissions matrix renders a row for the module identifier `AuditFindings` THEN the system displays the raw key `[modules.AuditFindings]` with a missing-translation warning indicator
1.3 WHEN the Role Permissions matrix renders a row for the module identifier `ComplianceMatrix` THEN the system displays the raw key `[modules.ComplianceMatrix]` with a missing-translation warning indicator
1.4 WHEN the Role Permissions matrix renders a row for the module identifier `Notifications` THEN the system displays the raw key `[modules.Notifications]` with a missing-translation warning indicator
1.5 WHEN the Role Permissions matrix renders a row for the module identifier `SystemLogs` THEN the system displays the raw key `[modules.SystemLogs]` with a missing-translation warning indicator

### Expected Behavior (Correct)

Each affected module identifier should resolve to a localized, human-readable label in both the English and Arabic locales.

2.1 WHEN the Role Permissions matrix renders a row for the module identifier `AuditEvidence` THEN the system SHALL display the localized module name for the active language without any missing-translation warning
2.2 WHEN the Role Permissions matrix renders a row for the module identifier `AuditFindings` THEN the system SHALL display the localized module name for the active language without any missing-translation warning
2.3 WHEN the Role Permissions matrix renders a row for the module identifier `ComplianceMatrix` THEN the system SHALL display the localized module name for the active language without any missing-translation warning
2.4 WHEN the Role Permissions matrix renders a row for the module identifier `Notifications` THEN the system SHALL display the localized module name for the active language without any missing-translation warning
2.5 WHEN the Role Permissions matrix renders a row for the module identifier `SystemLogs` THEN the system SHALL display the localized module name for the active language without any missing-translation warning

### Unchanged Behavior (Regression Prevention)

Module identifiers that already resolve correctly must continue to render their existing translated labels, unchanged, in both languages.

3.1 WHEN the Role Permissions matrix renders a row for a module identifier that already has a matching translation key (e.g. `AuditCharter`, `AuditPlans`, `AuditProgramLibrary`, `AuditTasks`, `Correspondence`, `Dashboard`, `Departments`, `IntegrityManagement`, `OrgStructure`, `Recommendations`, `Reports`, `RiskRegister`, `Settings`, `UserManagement`) THEN the system SHALL CONTINUE TO display its existing localized label without a warning
3.2 WHEN the application is set to English THEN the system SHALL CONTINUE TO render all previously-correct module labels with their existing English text
3.3 WHEN the application is set to Arabic THEN the system SHALL CONTINUE TO render all previously-correct module labels with their existing Arabic text
3.4 WHEN any other component resolves a key from the `modules` translation namespace THEN the system SHALL CONTINUE TO resolve all existing keys to their current values
