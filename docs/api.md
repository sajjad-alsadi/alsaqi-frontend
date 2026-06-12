# API

> Last updated: 2026-05-06  
> Version: 1.0.0

## Endpoint Overview
The API is functionally segmented by domain. Standard CRUD operations align to RESTful principles.
- **Authentication:** `/api/auth`
- **Audit Domain:** `/api/audit`, `/api/findings`, `/api/recommendations`, `/api/tasks`
- **Organization:** `/api/departments`, `/api/users`, `/api/org-structure`
- **Integrity & Risk:** `/api/fraud`, `/api/risk`, `/api/compliance`
- **File Management:** `/api/upload`

*(Note: Exact nested structures exist in route definitions).*

## Authentication System
- **Method:** JSON Web Tokens (JWT) using RSA Asymmetric Encryption (Private/Public Key Pairs).
- **Transport:** Access tokens are delivered and strictly managed. Refresh tokens handle session prolongation without frustrating users.

## Request and Response Structure
- **Global Prefix:** All endpoints are strictly prefixed with `/api`.
- **Content-Type:** Defaults to `application/json` for standard requests. Uses `multipart/form-data` dynamically for file uploads.
- **Payload Limits:** Hard-capped at 30MB per request payload to prevent Denial of Service (DoS) attacks.
- **Success Response:** Typically yields a 200/201 status code returning the JSON object requested (e.g., `{ "id": "...", "status": "success", "data": {...} }`).

## Error Handling Approach
A robust global error fallback logic is utilized.
- **Standardized Client Errors:** 400 (Bad Request), 401 (Unauthorized), 403 (Forbidden), 404 (Not Found).
- **Formatted Payloads:** Errors are always intercepted and returned as `{ "error": "Human readable message" }`.
- **System Guard:** If the database is still booting, the API instantly returns `503 Service Unavailable` with a "Starting up" message to prevent application crashes.
- **Security Intercepts:** Network patterns and file uploads hitting the SecurityService (Magika validation) return explicit `400` status codes masking the exact firewall reason to prevent probe engineering.

---
*Generated based on information provided by the development team.*
