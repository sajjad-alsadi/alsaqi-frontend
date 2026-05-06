# UI / UX

> Last updated: 2026-05-06  
> Version: 1.0.0

## Existing Screens & Navigation Flows
- **Authentication:** Unified Login screen with session expiry handling.
- **Main Dashboard:** Landing page providing high-level KPIs, charts, and quick-action shortcuts.
- **Audit Operations:** Screens for Audit Charter, Audit Plan, Fieldwork Tasks, Audit Program Library, Findings, Evidence, and Recommendations.
- **Compliance & Risk:** Dedicated views for Risk Register, Compliance Matrix, and Legal Library.
- **Corporate Governance:** Sections for Org Structure (interactive tree view), Departments, and Job Titles.
- **Integrity & Security:** Deeply restricted views for Fraud Management, Conflict of Interest, System Logs, and the Audit Trail.
- **Communications:** CMS (Correspondence System) for tracking incoming/outgoing physical and digital letters.
- **Settings:** Profile management, Language toggler, and Admin configurations (Users, Permissions, PDF Settings).

## Color System & Fonts
- **Primary Colors:** Crisp White and light Slate shadows (`slate-100`/`slate-200`) for a breathable, clean layout that reduces eye strain.
- **Accent Colors:** Royal Blue and Emerald Green are utilized for primary actions, success states, and buttons.
- **Warning/Danger:** Rose and Amber utilized for destructive actions, risk indicators, and fraud alerts.
- **Fonts:** Modern sans-serif fonts optimized for complete Arabic legibility (such as IBM Plex Sans Arabic or Inter).

## UI Library
- **Tailwind CSS:** Comprehensive utility-first styling.
- **Lucide React:** Iconography system.
- **Headless/Custom UI:** Custom built modals, sliding panels, and data tables styled meticulously without heavy component libraries to maintain peak performance and absolute design control.

## Localization & Theming Support
- **RTL / LTR Support:** Complete bidirectional dynamic layout switching powered by `react-i18next`. Arabic is the primary default, English is fully supported.
- **Dark Mode:** System design heavily favors light-mode legibility for dense text reading (Audit reports), but utilizes context-aware contrast.

## Special Navigation Flows
- **Strict Route Guarding:** Unauthenticated users are forcefully redirected to `/login`. Non-admin users attempting to access `/users` or `/trail` are caught by the router and rebounded to the `/dashboard`.
- **In-App Notifications:** A bell notification system handles real-time alerts without interrupting the user's current workflow.

---
*Generated based on information provided by the development team.*
