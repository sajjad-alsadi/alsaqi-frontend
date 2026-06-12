# Architecture

> Last updated: 2026-05-06  
> Version: 1.0.0

## Architecture Pattern
The system is built as a **Modular Monolith** architecture. It consists of a single backend service (Express.js) that handles both API requests and serves the static frontend assets in production. The codebase is heavily modularized into different functional domains (Audit, Risk, Compliance, Correspondence, etc.) while sharing the same database.

## Main System Components
1. **Frontend Application (React SPA):** Handles all user interactions, UI rendering, routing (React Router), state management, and API calls via React Query / Axios.
2. **Backend API (Express.js):** Acts as the core logic processor, authentication gatekeeper, and data access layer. It exposes RESTful endpoints for the frontend.
3. **Database Layer:** Uses PostgreSQL (via `pg`) in production and PGlite locally. Migrations are automatically run on server startup.
4. **File Storage System:** A local file system layer storing uploaded documents and evidence securely inside the `/uploads` directory, avoiding external cloud storage.
5. **Security & Validation Layer:** Includes JWT authentication with RSA encryption, rate limiting, object/DOM guards, and **Google Magika** for deep-AI file content validation to prevent malicious uploads.
6. **Real-time / Automation Engine:** Uses WebSockets (`ws`) for real-time notifications and `node-cron` for automated background jobs.

## Communication & APIs
- **Frontend to Backend:** Communicates exclusively via REST API over HTTP/HTTPS, with tokens sent via HTTP-only cookies and Authorization headers. 
- **WebSockets:** Used for specific real-time features like instant notifications and live updates.
- **External Integration:** The system explicitly avoids external web APIs (fully air-gapped capability) except for the local file system and local database, ensuring total data sovereignty.

---
*Generated based on information provided by the development team.*
