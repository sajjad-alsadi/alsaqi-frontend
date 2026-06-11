# File Inventory — Production Readiness Audit

**Generated**: 2025-07-16
**Total Files in Scope**: 300

---

## Summary

| Category | Count |
|----------|-------|
| Source files (.ts/.tsx) under `apps/web/src/` | 294 |
| Configuration files | 3 |
| HTML files | 1 |
| Environment files | 2 |
| **Total** | **300** |

---

## 1. Source Files (.ts and .tsx) under `apps/web/src/`

### API Layer (30 files)

| # | File Path |
|---|-----------|
| 1 | `apps/web/src/api/__tests__/client.property.test.ts` |
| 2 | `apps/web/src/api/__tests__/validationRoundTrip.property.test.ts` |
| 3 | `apps/web/src/api/client.test.ts` |
| 4 | `apps/web/src/api/client.ts` |
| 5 | `apps/web/src/api/hooks/index.ts` |
| 6 | `apps/web/src/api/hooks/useAuditPlans.ts` |
| 7 | `apps/web/src/api/hooks/useAuth.ts` |
| 8 | `apps/web/src/api/hooks/useFindings.ts` |
| 9 | `apps/web/src/api/hooks/useNotifications.ts` |
| 10 | `apps/web/src/api/hooks/useTasks.ts` |
| 11 | `apps/web/src/api/hooks/useUsers.ts` |
| 12 | `apps/web/src/api/httpClient.ts` |
| 13 | `apps/web/src/api/index.ts` |
| 14 | `apps/web/src/api/modules/audit-plans.ts` |
| 15 | `apps/web/src/api/modules/auth.ts` |
| 16 | `apps/web/src/api/modules/correspondence.ts` |
| 17 | `apps/web/src/api/modules/dashboard.ts` |
| 18 | `apps/web/src/api/modules/departments.ts` |
| 19 | `apps/web/src/api/modules/findings.ts` |
| 20 | `apps/web/src/api/modules/notifications.ts` |
| 21 | `apps/web/src/api/modules/recommendations.ts` |
| 22 | `apps/web/src/api/modules/regulatory.ts` |
| 23 | `apps/web/src/api/modules/risk-register.ts` |
| 24 | `apps/web/src/api/modules/tasks.ts` |
| 25 | `apps/web/src/api/modules/user-management.ts` |
| 26 | `apps/web/src/api/modules/users.ts` |
| 27 | `apps/web/src/api/utils/error-parser.test.ts` |
| 28 | `apps/web/src/api/utils/error-parser.ts` |
| 29 | `apps/web/src/api/ws/websocket-client.test.ts` |
| 30 | `apps/web/src/api/ws/websocket-client.ts` |

### App Entry (1 file)

| # | File Path |
|---|-----------|
| 31 | `apps/web/src/App.tsx` |

### Assets (1 file)

| # | File Path |
|---|-----------|
| 32 | `apps/web/src/assets/fonts/tahoma-base64.ts` |

### Components (53 files)

| # | File Path |
|---|-----------|
| 33 | `apps/web/src/components/__tests__/accessibility.property.test.tsx` |
| 34 | `apps/web/src/components/__tests__/Accessibility.test.tsx` |
| 35 | `apps/web/src/components/__tests__/accessibility-audit.test.tsx` |
| 36 | `apps/web/src/components/__tests__/ErrorBoundary.test.tsx` |
| 37 | `apps/web/src/components/__tests__/FocusTrap.bug-condition.test.tsx` |
| 38 | `apps/web/src/components/__tests__/FocusTrap.preservation.test.tsx` |
| 39 | `apps/web/src/components/__tests__/Modal.test.tsx` |
| 40 | `apps/web/src/components/__tests__/Pagination.test.tsx` |
| 41 | `apps/web/src/components/AboutSection.tsx` |
| 42 | `apps/web/src/components/AnimatedList.tsx` |
| 43 | `apps/web/src/components/AuditPlanForm.test.tsx` |
| 44 | `apps/web/src/components/AuditPlanForm.tsx` |
| 45 | `apps/web/src/components/AuditTaskForm.tsx` |
| 46 | `apps/web/src/components/AuditTasksTable.tsx` |
| 47 | `apps/web/src/components/auth/ChangePasswordModal.tsx` |
| 48 | `apps/web/src/components/auth/ContactAdminModal.tsx` |
| 49 | `apps/web/src/components/auth/ForgotPasswordModal.tsx` |
| 50 | `apps/web/src/components/Badge.tsx` |
| 51 | `apps/web/src/components/Breadcrumb.tsx` |
| 52 | `apps/web/src/components/ChartContainer.tsx` |
| 53 | `apps/web/src/components/Chatbot.tsx` |
| 54 | `apps/web/src/components/CommentSection.tsx` |
| 55 | `apps/web/src/components/ConnectionIndicator.test.tsx` |
| 56 | `apps/web/src/components/ConnectionIndicator.tsx` |
| 57 | `apps/web/src/components/ErrorBoundary.tsx` |
| 58 | `apps/web/src/components/ErrorState.tsx` |
| 59 | `apps/web/src/components/FindingCard.preservation.test.tsx` |
| 60 | `apps/web/src/components/FindingCard.test.tsx` |
| 61 | `apps/web/src/components/FindingCard.tsx` |
| 62 | `apps/web/src/components/FindingForm.tsx` |
| 63 | `apps/web/src/components/FocusTrap.tsx` |
| 64 | `apps/web/src/components/InteractiveIcon.tsx` |
| 65 | `apps/web/src/components/LanguageSwitcher.tsx` |
| 66 | `apps/web/src/components/Layout.test.tsx` |
| 67 | `apps/web/src/components/Layout.tsx` |
| 68 | `apps/web/src/components/layout-overflow-bugcondition.test.tsx` |
| 69 | `apps/web/src/components/layout-overflow-preservation.test.tsx` |
| 70 | `apps/web/src/components/LegalForm.tsx` |
| 71 | `apps/web/src/components/LiveRegion.tsx` |
| 72 | `apps/web/src/components/LoadingSpinner.tsx` |
| 73 | `apps/web/src/components/Login.tsx` |
| 74 | `apps/web/src/components/Login/LoginFooter.tsx` |
| 75 | `apps/web/src/components/Login/LoginForm.tsx` |
| 76 | `apps/web/src/components/Login/LoginHeader.tsx` |
| 77 | `apps/web/src/components/Login/LoginIllustration.tsx` |
| 78 | `apps/web/src/components/Logo.tsx` |
| 79 | `apps/web/src/components/Modal.tsx` |
| 80 | `apps/web/src/components/ModuleErrorBoundary.tsx` |
| 81 | `apps/web/src/components/NotificationBell.tsx` |
| 82 | `apps/web/src/components/NotificationToast.tsx` |
| 83 | `apps/web/src/components/PageHeader.tsx` |
| 84 | `apps/web/src/components/PageTransition.tsx` |
| 85 | `apps/web/src/components/Pagination.tsx` |
| 86 | `apps/web/src/components/PDFSettingsSection.tsx` |
| 87 | `apps/web/src/components/PdfTemplateEditor.tsx` |
| 88 | `apps/web/src/components/PdfTemplateManagement.tsx` |
| 89 | `apps/web/src/components/PdfViewer.tsx` |
| 90 | `apps/web/src/components/Portal.tsx` |
| 91 | `apps/web/src/components/ProgressButton.tsx` |
| 92 | `apps/web/src/components/RecommendationForm.tsx` |
| 93 | `apps/web/src/components/RegulatoryForm.tsx` |
| 94 | `apps/web/src/components/ResponsiveActions.tsx` |
| 95 | `apps/web/src/components/RiskForm.tsx` |
| 96 | `apps/web/src/components/SkeletonLoader.tsx` |
| 97 | `apps/web/src/components/SkipToContent.tsx` |
| 98 | `apps/web/src/components/StalePermissionsIndicator.test.tsx` |
| 99 | `apps/web/src/components/StalePermissionsIndicator.tsx` |
| 100 | `apps/web/src/components/ui/button.tsx` |
| 101 | `apps/web/src/components/ui/button-border.tsx` |
| 102 | `apps/web/src/components/ui/FormField.tsx` |
| 103 | `apps/web/src/components/ui/Input.tsx` |
| 104 | `apps/web/src/components/ui/Select.tsx` |
| 105 | `apps/web/src/components/ui/Textarea.tsx` |
| 106 | `apps/web/src/components/UndoToast.tsx` |

### Constants & Config (1 file)

| # | File Path |
|---|-----------|
| 107 | `apps/web/src/constants.ts` |

### Context (9 files)

| # | File Path |
|---|-----------|
| 108 | `apps/web/src/context/__tests__/AuthContext.test.tsx` |
| 109 | `apps/web/src/context/__tests__/context.property.test.tsx` |
| 110 | `apps/web/src/context/__tests__/NotificationContext.test.tsx` |
| 111 | `apps/web/src/context/__tests__/PreferencesContext.test.tsx` |
| 112 | `apps/web/src/context/AppContext.tsx` |
| 113 | `apps/web/src/context/AuthContext.tsx` |
| 114 | `apps/web/src/context/NotificationContext.tsx` |
| 115 | `apps/web/src/context/PreferencesContext.tsx` |
| 116 | `apps/web/src/context/UserContext.tsx` |

### Hooks (34 files)

| # | File Path |
|---|-----------|
| 117 | `apps/web/src/hooks/__tests__/useConnectionStatus.test.ts` |
| 118 | `apps/web/src/hooks/__tests__/useDebounce.test.ts` |
| 119 | `apps/web/src/hooks/__tests__/useFileUploadValidation.test.ts` |
| 120 | `apps/web/src/hooks/__tests__/useFormAutosave.test.ts` |
| 121 | `apps/web/src/hooks/__tests__/useIdleTimeout.test.ts` |
| 122 | `apps/web/src/hooks/__tests__/useKeyboardShortcuts.test.ts` |
| 123 | `apps/web/src/hooks/__tests__/useOfflineGuard.test.ts` |
| 124 | `apps/web/src/hooks/__tests__/useOptimisticUpdate.test.ts` |
| 125 | `apps/web/src/hooks/__tests__/usePermissions.property.test.ts` |
| 126 | `apps/web/src/hooks/__tests__/usePermissions.test.ts` |
| 127 | `apps/web/src/hooks/__tests__/usePersistedFilters.test.ts` |
| 128 | `apps/web/src/hooks/useAuditFindings.ts` |
| 129 | `apps/web/src/hooks/useAuditPlans.ts` |
| 130 | `apps/web/src/hooks/useConnectionStatus.ts` |
| 131 | `apps/web/src/hooks/useCorrespondence.ts` |
| 132 | `apps/web/src/hooks/useCountUp.ts` |
| 133 | `apps/web/src/hooks/useDashboardStats.ts` |
| 134 | `apps/web/src/hooks/useDebounce.ts` |
| 135 | `apps/web/src/hooks/useDebouncedCallback.ts` |
| 136 | `apps/web/src/hooks/useDepartments.ts` |
| 137 | `apps/web/src/hooks/useFileUploadValidation.ts` |
| 138 | `apps/web/src/hooks/useFormAutosave.ts` |
| 139 | `apps/web/src/hooks/useIdleTimeout.ts` |
| 140 | `apps/web/src/hooks/useKeyboardShortcuts.ts` |
| 141 | `apps/web/src/hooks/useLookups.ts` |
| 142 | `apps/web/src/hooks/useNavigationItems.ts` |
| 143 | `apps/web/src/hooks/useOfflineGuard.ts` |
| 144 | `apps/web/src/hooks/useOptimisticUpdate.ts` |
| 145 | `apps/web/src/hooks/usePermissions.ts` |
| 146 | `apps/web/src/hooks/usePersistedFilters.ts` |
| 147 | `apps/web/src/hooks/usePrefetch.ts` |
| 148 | `apps/web/src/hooks/useRisks.ts` |
| 149 | `apps/web/src/hooks/useScrollReveal.ts` |
| 150 | `apps/web/src/hooks/useUserManagement.ts` |
| 151 | `apps/web/src/hooks/useVirtualList.ts` |

### i18n (1 file)

| # | File Path |
|---|-----------|
| 152 | `apps/web/src/i18n.ts` |

### Lib (1 file)

| # | File Path |
|---|-----------|
| 153 | `apps/web/src/lib/utils.ts` |

### Locales (2 files)

| # | File Path |
|---|-----------|
| 154 | `apps/web/src/locales/job-titles-i18n-bugcondition.test.ts` |
| 155 | `apps/web/src/locales/job-titles-i18n-preservation.test.ts` |

### Main Entry (1 file)

| # | File Path |
|---|-----------|
| 156 | `apps/web/src/main.tsx` |

### Modules (74 files)

| # | File Path |
|---|-----------|
| 157 | `apps/web/src/modules/__tests__/AuditPlan.test.tsx` |
| 158 | `apps/web/src/modules/__tests__/AuditPlanForm.test.tsx` |
| 159 | `apps/web/src/modules/__tests__/ComplianceMatrix.test.tsx` |
| 160 | `apps/web/src/modules/__tests__/Correspondence.test.tsx` |
| 161 | `apps/web/src/modules/__tests__/Dashboard.test.tsx` |
| 162 | `apps/web/src/modules/__tests__/FraudLog.test.tsx` |
| 163 | `apps/web/src/modules/__tests__/paginationPreservation.property.test.ts` |
| 164 | `apps/web/src/modules/__tests__/pagination-undefined-crash.property.test.ts` |
| 165 | `apps/web/src/modules/__tests__/Reports.test.tsx` |
| 166 | `apps/web/src/modules/__tests__/RiskForm.test.tsx` |
| 167 | `apps/web/src/modules/__tests__/RiskRegister.test.tsx` |
| 168 | `apps/web/src/modules/__tests__/UserManagement.test.tsx` |
| 169 | `apps/web/src/modules/AuditCharter.tsx` |
| 170 | `apps/web/src/modules/AuditEvidence.tsx` |
| 171 | `apps/web/src/modules/AuditFindings.tsx` |
| 172 | `apps/web/src/modules/AuditPlan.tsx` |
| 173 | `apps/web/src/modules/AuditProgram/AuditProgramEditor.tsx` |
| 174 | `apps/web/src/modules/AuditProgram/AuditProgramGrid.tsx` |
| 175 | `apps/web/src/modules/AuditProgram/AuditProgramHeader.tsx` |
| 176 | `apps/web/src/modules/AuditProgram/AuditProgramProceduresModal.tsx` |
| 177 | `apps/web/src/modules/AuditProgramLibrary.tsx` |
| 178 | `apps/web/src/modules/AuditTasks.tsx` |
| 179 | `apps/web/src/modules/AuditTrail.tsx` |
| 180 | `apps/web/src/modules/AuditWorkspace.tsx` |
| 181 | `apps/web/src/modules/ComplianceMatrix/ComplianceMatrixPage.tsx` |
| 182 | `apps/web/src/modules/ComplianceMatrix/index.tsx` |
| 183 | `apps/web/src/modules/ComplianceMatrix/types.ts` |
| 184 | `apps/web/src/modules/ConflictOfInterest.tsx` |
| 185 | `apps/web/src/modules/Correspondence/CorrespondenceArchive.tsx` |
| 186 | `apps/web/src/modules/Correspondence/CorrespondenceDetails.tsx` |
| 187 | `apps/web/src/modules/Correspondence/CorrespondenceSystem.tsx` |
| 188 | `apps/web/src/modules/Correspondence/IncomingForm.tsx` |
| 189 | `apps/web/src/modules/Correspondence/IncomingRegister.tsx` |
| 190 | `apps/web/src/modules/Correspondence/OutgoingForm.tsx` |
| 191 | `apps/web/src/modules/Correspondence/OutgoingRegister.tsx` |
| 192 | `apps/web/src/modules/Dashboard/DashboardActivityFeed.tsx` |
| 193 | `apps/web/src/modules/Dashboard/DashboardAuditProgress.tsx` |
| 194 | `apps/web/src/modules/Dashboard/DashboardHeader.tsx` |
| 195 | `apps/web/src/modules/Dashboard/DashboardKpiGrid.tsx` |
| 196 | `apps/web/src/modules/Dashboard/DashboardQuickActions.tsx` |
| 197 | `apps/web/src/modules/Dashboard/DashboardRiskOverview.tsx` |
| 198 | `apps/web/src/modules/Dashboard/index.tsx` |
| 199 | `apps/web/src/modules/DepartmentManagement.tsx` |
| 200 | `apps/web/src/modules/FraudLog/components/AccessGate.tsx` |
| 201 | `apps/web/src/modules/FraudLog/components/AddCaseModal.tsx` |
| 202 | `apps/web/src/modules/FraudLog/components/FraudTable.tsx` |
| 203 | `apps/web/src/modules/FraudLog/hooks/useFraudLog.ts` |
| 204 | `apps/web/src/modules/FraudLog/index.tsx` |
| 205 | `apps/web/src/modules/FraudLog/types.ts` |
| 206 | `apps/web/src/modules/IntegrityManagement.tsx` |
| 207 | `apps/web/src/modules/JobTitles.tsx` |
| 208 | `apps/web/src/modules/Notifications.tsx` |
| 209 | `apps/web/src/modules/OrgStructure/index.tsx` |
| 210 | `apps/web/src/modules/OrgStructure/OrgStructurePage.tsx` |
| 211 | `apps/web/src/modules/Recommendations.tsx` |
| 212 | `apps/web/src/modules/Reports/components/AuditReportCard.tsx` |
| 213 | `apps/web/src/modules/Reports/components/ExecutiveCharts.tsx` |
| 214 | `apps/web/src/modules/Reports/components/KPICards.tsx` |
| 215 | `apps/web/src/modules/Reports/components/ReportFilters.tsx` |
| 216 | `apps/web/src/modules/Reports/components/ReportFormModal.tsx` |
| 217 | `apps/web/src/modules/Reports/components/ScheduleReportModal.tsx` |
| 218 | `apps/web/src/modules/Reports/components/TopRisksList.tsx` |
| 219 | `apps/web/src/modules/Reports/hooks/useReports.ts` |
| 220 | `apps/web/src/modules/Reports/index.tsx` |
| 221 | `apps/web/src/modules/Reports/services/reportService.ts` |
| 222 | `apps/web/src/modules/Reports/types.ts` |
| 223 | `apps/web/src/modules/RiskRegister.tsx` |
| 224 | `apps/web/src/modules/Settings/index.tsx` |
| 225 | `apps/web/src/modules/Settings/SettingsPage.tsx` |
| 226 | `apps/web/src/modules/SystemErrorLogs/index.tsx` |
| 227 | `apps/web/src/modules/SystemErrorLogs/SystemErrorAnalytics.tsx` |
| 228 | `apps/web/src/modules/SystemLogsManagement.test.tsx` |
| 229 | `apps/web/src/modules/SystemLogsManagement.tsx` |
| 230 | `apps/web/src/modules/UserManagement/ConfirmationModal.tsx` |
| 231 | `apps/web/src/modules/UserManagement/HistoryLogs.tsx` |
| 232 | `apps/web/src/modules/UserManagement/index.tsx` |
| 233 | `apps/web/src/modules/UserManagement/ManagementSettings.tsx` |
| 234 | `apps/web/src/modules/UserManagement/ResetRequests.tsx` |
| 235 | `apps/web/src/modules/UserManagement/RolePermissions.tsx` |
| 236 | `apps/web/src/modules/UserManagement/SupportRequests.tsx` |
| 237 | `apps/web/src/modules/UserManagement/UserDetailsModal.tsx` |
| 238 | `apps/web/src/modules/UserManagement/UserForm.tsx` |
| 239 | `apps/web/src/modules/UserManagement/UserList.tsx` |
| 240 | `apps/web/src/modules/UserManagement/UserManagementHeader.tsx` |
| 241 | `apps/web/src/modules/UserManagement/UserSessions.tsx` |
| 242 | `apps/web/src/modules/UserManagement/UserSummaryCards.tsx` |

### Permissions (8 files)

| # | File Path |
|---|-----------|
| 243 | `apps/web/src/permissions.ts` |
| 244 | `apps/web/src/permissions/__tests__/permissionMatrix.property.test.ts` |
| 245 | `apps/web/src/permissions/__tests__/registry.property.test.ts` |
| 246 | `apps/web/src/permissions/__tests__/registry.test.ts` |
| 247 | `apps/web/src/permissions/__tests__/seeder.property.test.ts` |
| 248 | `apps/web/src/permissions/modules.ts` |
| 249 | `apps/web/src/permissions/registry.ts` |
| 250 | `apps/web/src/permissions/seeder.ts` |
| 251 | `apps/web/src/permissions/types.ts` |

### Plugins (1 file)

| # | File Path |
|---|-----------|
| 252 | `apps/web/src/plugins/envValidator.ts` |

### Test Infrastructure (6 files)

| # | File Path |
|---|-----------|
| 253 | `apps/web/src/test/factories/index.test.ts` |
| 254 | `apps/web/src/test/factories/index.ts` |
| 255 | `apps/web/src/test/helpers/arbitraries.ts` |
| 256 | `apps/web/src/test/helpers/render.tsx` |
| 257 | `apps/web/src/test/helpers/server.ts` |
| 258 | `apps/web/src/test/setup.ts` |

### Types (2 files)

| # | File Path |
|---|-----------|
| 259 | `apps/web/src/types.ts` |
| 260 | `apps/web/src/types/user-event.d.ts` |

### Utils (28 files)

| # | File Path |
|---|-----------|
| 261 | `apps/web/src/utils/__tests__/CryptoUtils.test.ts` |
| 262 | `apps/web/src/utils/__tests__/DOMGuard.test.ts` |
| 263 | `apps/web/src/utils/__tests__/errorReporter.property.test.ts` |
| 264 | `apps/web/src/utils/__tests__/fileUploadValidator.test.ts` |
| 265 | `apps/web/src/utils/__tests__/pollReportStatus.test.ts` |
| 266 | `apps/web/src/utils/__tests__/SecureStorage.test.ts` |
| 267 | `apps/web/src/utils/__tests__/SecurityLogger.test.ts` |
| 268 | `apps/web/src/utils/contactAdminService.ts` |
| 269 | `apps/web/src/utils/CryptoUtils.ts` |
| 270 | `apps/web/src/utils/docxExport.ts` |
| 271 | `apps/web/src/utils/DOMGuard.ts` |
| 272 | `apps/web/src/utils/env.ts` |
| 273 | `apps/web/src/utils/errorReporter.ts` |
| 274 | `apps/web/src/utils/errorService.ts` |
| 275 | `apps/web/src/utils/fileUploadValidator.ts` |
| 276 | `apps/web/src/utils/format.ts` |
| 277 | `apps/web/src/utils/formatService.ts` |
| 278 | `apps/web/src/utils/globalErrorHandlers.ts` |
| 279 | `apps/web/src/utils/i18n.ts` |
| 280 | `apps/web/src/utils/logger.ts` |
| 281 | `apps/web/src/utils/NoiseFilter.ts` |
| 282 | `apps/web/src/utils/notificationHelpers.ts` |
| 283 | `apps/web/src/utils/ObjectGuard.ts` |
| 284 | `apps/web/src/utils/pdfExport.ts` |
| 285 | `apps/web/src/utils/pdfService.ts` |
| 286 | `apps/web/src/utils/pollReportStatus.ts` |
| 287 | `apps/web/src/utils/SecureNetwork.ts` |
| 288 | `apps/web/src/utils/SecureStorage.ts` |
| 289 | `apps/web/src/utils/SecurityLogger.ts` |
| 290 | `apps/web/src/utils/SecurityProvider.tsx` |
| 291 | `apps/web/src/utils/webVitalsMonitor.ts` |
| 292 | `apps/web/src/utils/webVitalsReporter.test.ts` |
| 293 | `apps/web/src/utils/webVitalsReporter.ts` |

### Vite Env (1 file)

| # | File Path |
|---|-----------|
| 294 | `apps/web/src/vite-env.d.ts` |

---

## 2. Configuration Files

| # | File Path | Exists |
|---|-----------|--------|
| 295 | `apps/web/vite.config.ts` | ✅ Yes |
| 296 | `apps/web/tsconfig.json` | ✅ Yes |
| 297 | `apps/web/package.json` | ✅ Yes |

---

## 3. HTML Files

| # | File Path | Exists |
|---|-----------|--------|
| 298 | `apps/web/index.html` | ✅ Yes |

---

## 4. Environment Files

| # | File Path | Exists |
|---|-----------|--------|
| 299 | `apps/web/.env` | ✅ Yes |
| 300 | `apps/web/.env.example` | ✅ Yes |

---

## File Type Breakdown

| Extension | Count |
|-----------|-------|
| `.ts` | 127 |
| `.tsx` | 167 |
| `.json` (config) | 2 |
| `.html` | 1 |
| `.env` | 2 |
| Other config (`.ts` at app level) | 1 |

---

## Directory Structure Overview

```
apps/web/src/
├── api/          (30 files) — HTTP client, hooks, modules, WebSocket, tests
├── assets/       (1 file)  — Font assets
├── components/   (53 files) — UI components, auth, ui primitives, tests
├── context/      (9 files) — React contexts (Auth, App, Notifications, Preferences, User)
├── hooks/        (34 files) — Custom hooks and tests
├── lib/          (1 file)  — Utility library
├── locales/      (2 files) — i18n test files
├── modules/      (74 files) — Feature modules (Dashboard, Reports, UserManagement, etc.)
├── permissions/  (8 files) — RBAC permission system
├── plugins/      (1 file)  — Vite plugins
├── test/         (6 files) — Test infrastructure (factories, helpers, setup)
├── types/        (2 files) — Type declarations
├── utils/        (28 files) — Utility functions and security helpers
├── App.tsx       — App entry component
├── constants.ts  — Application constants
├── i18n.ts       — i18n configuration
├── main.tsx      — Application bootstrap
├── permissions.ts — Legacy permissions
├── types.ts      — Shared types
└── vite-env.d.ts — Vite type declarations
```
