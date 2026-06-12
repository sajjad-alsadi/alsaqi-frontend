# Authentication & Authorization

> Last updated: 2026-05-06  
> Version: 1.0.0

## Login Method
The system utilizes standard **Username/Password** authentication. Passwords are securely hashed via `bcrypt` at rest. Upon verification, the server issues an RSA-signed **JWT (JSON Web Token)**.

## User Roles and Permissions
Users are grouped by roles that map to specific permission sets.
- **System Administrator (Admin):** Universal access. Capable of modifying system settings, managing users, adjusting PDF templates, and viewing all system logs (Audit Trail, Error Logs).
- **Internal Auditor:** Access to execute audit plans, tasks, log findings, and evidence.
- **Audit Manager / Lead:** Ability to assign tasks, approve audit plans, and review reports.
- **Standard User (Employee):** Restricted view. Often limited to reading company policies or submitting integrity/fraud disclosures.

## Session Management and Expiry
- Sessions are maintained using access tokens and refresh tokens.
- **RSA Keys:** Tokens are signed using asymmetric cryptography dynamically generated on server start and persisted locally to `.rsa_keys.json` to survive reboots.
- **Expiry:** Strict token expiration forces periodic re-authentication to prevent stale or compromised sessions from lingering on unattended corporate devices.

## Special Access Restrictions
- **Zero-Cloud Policy:** Authentication operates entirely locally without Ping, Auth0, Firebase, or any cloud identity provider.
- **Activity Logging:** Every login attempt (success or failure) is permanently recorded in the `login_history` table logging the IP address and browser context.
- **Fraud & CoI Privacy:** Disclosures in the Integrity modules (Conflict of Interest, Whistleblowing) are heavily guarded. Only explicitly authorized roles can even query the endpoints.

---
*Generated based on information provided by the development team.*
