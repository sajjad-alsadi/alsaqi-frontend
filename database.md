# Database

> Last updated: 2026-05-06  
> Version: 1.0.0

## Database Type
**Relational Database Management System (RDBMS)**. The application uses **PostgreSQL** in production environments and **PGlite** (an embedded, serverless Postgres distribution) for development and offline testing.

## Main Tables & Collections
- **User Management & Security:**
  - `users`: Core account details (`id`, `username`, `password`, `role`, `status`).
  - `roles`, `permissions`, `role_permissions`, `user_permissions`: Role-based access control definitions.
  - `login_history`, `user_sessions`, `password_history`: Security and session auditing.
- **Internal Audit Management:**
  - `audit_programs`: Standardized audit frameworks and objectives.
  - `audit_plans`: Periodic audit plans.
  - `audit_tasks`: Fieldwork and task assignments.
  - `audit_findings`: Discovered issues and risk levels.
  - `recommendations`: Action plans for findings.
  - `audit_evidence`: Pointers to physically uploaded files.
- **Risk & Compliance:**
  - `risk_register`: Enterprise risk inventory (description, likelihood, impact).
  - `law_bank`: Repository of local laws and legislations.
  - `central_bank_instructions`: Tracked regulatory instructions.
  - `internal_policies`, `compliance_items`: Internal rules and compliance matrix.
- **Integrity & CMS (Correspondence):**
  - `fraud_log`: Reports of fraud or violations.
  - `conflict_of_interest`: Employee disclosures.
  - `incoming_correspondence` / `outgoing_correspondence`: Automated physical mail/document flow.
- **System Actions & Organization:**
  - `audit_trail`: The irrefutable "Black Box" log of all system actions (who, what, when).
  - `system_error_log`: Tracked application crash reports.
  - `departments`, `org_structure`, `job_titles`: Corporate hierarchy and human resources alignment.

## Relationships Between Tables
- **One-to-Many:** Users to Login History, Users to Assigned Tasks, Audit Plans to Audit Tasks, Audit Findings to Recommendations, Departments to Users.
- **Many-to-Many:** Roles to Permissions (via `role_permissions`), Audit Tasks to Evidence.
- **Hierarchical (Self-Referencing):** `org_structure` uses parent-child references for generating organizational trees.

## Indexes & Security Rules
- **Primary Keys:** All primary identifiers utilize **UUID (v4)** instead of sequential integers to prevent ID enumeration/guessing.
- **Passwords:** Stored purely as `bcrypt` hashes.
- **Foreign Keys:** Enforced strictly across the schema with cascading or restrict rules to guarantee absolute data integrity (no orphaned records).
- **Application-Level Security:** Access controls (RLS equivalent) are enforced dynamically inside the Express API routes, checking the JWT payload and matching user roles/scopes against the requested resources. Every data mutation also rigorously fires an insert into `audit_trail`.

---
*Generated based on information provided by the development team.*
