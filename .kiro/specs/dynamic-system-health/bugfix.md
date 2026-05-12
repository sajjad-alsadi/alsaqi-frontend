# Bugfix Requirements Document

## Introduction

The System Logs Management page displays a hardcoded system health percentage of "99.9%" that never changes regardless of actual system state. Even when the system has recorded many errors, the health indicator remains static at 99.9% with a green color and "stable" status text. Additionally, the error count used in the overview stats is inaccurate because it reads the length of the current page of results rather than the total count from the API pagination metadata.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN the System Logs overview tab is displayed THEN the system shows a hardcoded health percentage of "99.9%" regardless of the actual ratio of errors to total operations

1.2 WHEN the system has a high number of errors relative to total operations THEN the health indicator color remains emerald-500 (green) and never changes to reflect degraded health

1.3 WHEN the system has a high number of errors THEN the status text always displays "stable" regardless of actual system state

1.4 WHEN the system-errors API returns paginated results (e.g., 50 per page but 200 total errors) THEN the errorsCount stat displays only the current page length (e.g., 50) instead of the true total error count from pagination metadata

### Expected Behavior (Correct)

2.1 WHEN the System Logs overview tab is displayed THEN the system SHALL calculate health percentage dynamically using the formula: `health = (totalAuditActions / (totalAuditActions + totalErrors)) * 100`, based on actual data from the API

2.2 WHEN the calculated health percentage drops below defined thresholds THEN the system SHALL change the indicator color accordingly: green (emerald-500) for health >= 90%, yellow (amber-500) for health >= 70%, and red (rose-500) for health < 70%

2.3 WHEN the calculated health percentage drops below defined thresholds THEN the system SHALL update the status text accordingly: "stable" for health >= 90%, "degraded" for health >= 70%, and "critical" for health < 70%

2.4 WHEN the system-errors API returns paginated results THEN the system SHALL use `pagination.total` from the API response to determine the accurate total error count rather than counting items in the current page array

### Unchanged Behavior (Regression Prevention)

3.1 WHEN the system has zero errors and some audit actions THEN the system SHALL CONTINUE TO display a health percentage near or at 100% with green color and "stable" status

3.2 WHEN the overview tab loads THEN the system SHALL CONTINUE TO fetch data from both `/api/audit-trail` and `/api/system-errors` endpoints concurrently

3.3 WHEN the API calls are in progress THEN the system SHALL CONTINUE TO show a loading state via the existing loading flag

3.4 WHEN the API calls fail THEN the system SHALL CONTINUE TO log the error to console and gracefully handle the failure without crashing

3.5 WHEN the audit trail data is received THEN the system SHALL CONTINUE TO calculate and display today's audit action count correctly
