# Developer Log

> Last updated: 2026-05-06  
> Version: 1.0.0

## Key Technical Decisions Made
- **Switching to On-Premises:** Re-architected the entire system to remove cloud dependencies. The database was shifted to PostgreSQL/PGlite. File uploads moved from cloud storage to a local `express-fileupload` approach saving files strictly to `/uploads`.
- **Embedded Database Fallback (PGlite):** Selected to allow developers and specific deployment environments to run the system without spinning up a dedicated Postgres Docker container, significantly reducing friction in setup.
- **Deep File Validation (Google Magika):** Implemented an AI-based file content checker to verify MIME types by inspecting the bytes of uploaded files, mitigating extension spoofing.
- **RSA JWT over Symmetric Secrets:** Instead of relying on a single string secret for JWTs, the system autonomously generates Asymmetric RSA Key pairs on boot (if missing) and persists them to disk, enormously enhancing cryptographic security.

## Problems Faced and Solutions
- **File System Permissions:** Encountered issues where the server could not write to the `/uploads` directory in specific container environments. *Solution:* Added an aggressive startup check `ensureDir` that falls back safely to `/tmp` if the primary directory isn't writable, whilst logging a critical warning.
- **Database Startup Race Conditions:** The React frontend would occasionally hit the API before the database finished its initialization and migration sequences causing crashes. *Solution:* Implemented a 503 "Starting Up" middleware and a while-loop retry mechanism inside `runDbMigrations()` with exponential backoff.
- **HMR / Build Tooling:** Transitioning from separate frontend/backend workflows to a unified Vite + Express system required careful restructuring of the `server.ts` fallback routing and MIME configurations.

## Breaking Changes
- **Cloud Uncoupling (v1.0):** Complete teardown of external SaaS APIs. Any previous data housed externally was formatted into migrations for local seeding. 
- **Fetch Interceptors:** Overriding the global `window.fetch` to ensure frontend security created conflicts with specific internal libraries; strict `try/catch` and safe configuration object overrides had to be implemented in `SecureNetwork.ts`.

## Major Versions
- **v1.0.0 (Current):** Stabilized the isolated "air-gapped" architecture. Implemented Department structures, JWT RSA logic, and the Correspondence System.

---
*Generated based on information provided by the development team.*
