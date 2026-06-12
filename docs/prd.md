# Product Requirements Document (PRD)

> Last updated: 2026-05-06  
> Version: 1.0.0

## Main Product Goal
To deliver an all-in-one, entirely local, uncompromisable management suite for Internal Audit and Compliance divisions within highly regulated corporations (e.g., payment services, banks). It replaces email chains, vulnerable cloud storage, and Excel spreadsheets with a unified system.

## Success Metrics (KPIs)
- **Zero Data Leakage:** Maintaining a 100% on-premises footprint with zero accidental cloud calls.
- **Audit Turnaround:** Decreasing the time taken to draft, execute, and report findings to the board by unifying the data sources.
- **System Uptime:** Continuous operability with rapid, self-healing startup sequences.
- **Adoption Rate:** How rapidly non-technical auditors transition from Word/Excel to the platform.

## Constraints
- **Technical/Security Constraint:** MUST run in a fully air-gapped or restricted internal network. NO dependency on external servers (Firebase, AWS, Google Cloud) is permitted for functionality.
- **File System Constraint:** File uploads must be validated intensely via AI (Magika) to prevent malicious actors from uploading disguised executables.
- **Storage Constraint:** Local disk handling relies on strict limits (30MB per file maximum) to protect server capacity.

## Stakeholders
- Internal Audit Department Leads
- Compliance and Risk Officers
- System Administrators / IT Security Teams
- Board of Directors (Consumers of the generated PDF reports)

## Development Priorities
1. **Absolute Security:** Protecting the integrity of the data and preventing unauthorized access.
2. **Data Consistency:** Enforcing rigid relational database rules so findings, evidence, and recommendations are forever linked tracking accountability.
3. **User Intelligence:** Making complex audit regulations and structures visually intuitive via responsive design (Dashboards, Tables, Trees).

---
*Generated based on information provided by the development team.*
