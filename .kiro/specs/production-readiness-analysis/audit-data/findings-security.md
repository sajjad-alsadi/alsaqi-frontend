# Security Findings — Task 3.2: Secrets, XSS, and Validation Gaps

**Scanned**: All `.ts`/`.tsx` files under `apps/web/src/`, environment files, Dockerfile, index.html
**Date**: 2025-07-16

---

## Findings

### SEC-001 — Inline `onclick` handler incompatible with CSP

| Field | Value |
|-------|-------|
| **ID** | SEC-001 |
| **Severity** | 🔴 Critical |
| **File** | `apps/web/src/api/client.ts` |
| **Line** | 175–188 |
| **Problem** | The version-update dialog uses `dialog.innerHTML` with an inline `onclick="window.location.reload()"` event handler. The deployed CSP (`default-src 'self'`) blocks inline scripts, causing this button to be non-functional in production. Additionally, using `innerHTML` bypasses React's virtual DOM and sanitization. |
| **Production Impact** | The "Update Page" button will silently fail in production because the CSP blocks inline event handlers. Users cannot trigger the app refresh, leaving them stuck on a stale version. |
| **Suggested Fix** | Replace `innerHTML` + `onclick` with DOM API: create the button element programmatically and attach an event listener via `button.addEventListener('click', () => window.location.reload())`. |

---

### SEC-002 — CSP missing `script-src` and `style-src` directives

| Field | Value |
|-------|-------|
| **ID** | SEC-002 |
| **Severity** | 🔴 Critical |
| **File** | `apps/web/Dockerfile` |
| **Line** | 78 (security-headers.conf creation) |
| **Problem** | The Content Security Policy is `default-src 'self'; connect-src 'self' wss:; frame-ancestors 'none'`. While `default-src 'self'` is a reasonable fallback, there are no explicit `script-src`, `style-src`, `img-src`, or `font-src` directives. If any third-party CDN resource or inline style is needed in the future, the CSP will silently block it without clear diagnostic messaging. More importantly, the CSP lacks `'unsafe-inline'` for styles, which may break Tailwind CSS utility classes injected at runtime depending on build configuration. |
| **Production Impact** | Potential silent breakage of styling or future third-party integrations. No `report-uri` or `report-to` directive means CSP violations are invisible in production. |
| **Suggested Fix** | Add explicit directives: `script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; report-uri /api/csp-report`. Consider using CSP nonces for inline scripts. |

---

### SEC-003 — `process.env.GEMINI_API_KEY` exposed in client bundle via Vite `define`

| Field | Value |
|-------|-------|
| **ID** | SEC-003 |
| **Severity** | 🔴 Critical |
| **File** | `apps/web/vite.config.ts` |
| **Line** | 29 |
| **Problem** | The Vite `define` block includes `'process.env.GEMINI_API_KEY': JSON.stringify('')`. While currently set to an empty string, this pattern statically replaces all references to `process.env.GEMINI_API_KEY` in the client bundle with whatever value is present at build time. If the environment variable is ever set during CI/CD builds, the key will be embedded in the publicly-served JavaScript bundle. |
| **Production Impact** | If a real API key is ever provided via the build environment, it will be exposed in the frontend bundle visible to any user via browser DevTools. This could lead to credential theft and unauthorized API usage. |
| **Suggested Fix** | Remove `process.env.GEMINI_API_KEY` from the `define` block entirely. If an AI feature is needed client-side, proxy requests through the backend API to keep the key server-side. Alternatively, use a `VITE_` prefix only for non-sensitive configuration. |

---

## Passed Checks (No Issues Found)

### PASS — No hardcoded API keys, passwords, or credentials in source files

Searched all 294 `.ts`/`.tsx` files for patterns matching hardcoded API keys (GEMINI, OPENAI, ANTHROPIC, STRIPE, etc.), Bearer tokens, private keys, and password literals. Only test mocks with dummy values (`'mock-token'`, `'test-token'`) and form state initializations with empty strings were found — both are acceptable patterns.

---

### PASS — Environment files do not expose secrets

- `apps/web/.env` contains only non-sensitive configuration: `VITE_API_URL`, `VITE_APP_VERSION`, `VITE_ERROR_REPORT_URL`, `VITE_WS_URL` (localhost dev URL).
- `apps/web/.env.example` contains only placeholder keys with empty values.
- `.gitignore` properly excludes `.env*` files (except `.env.example`).

---

### PASS — No `dangerouslySetInnerHTML` usage

Searched all `.tsx` files under `apps/web/src/` — zero occurrences of `dangerouslySetInnerHTML`. The application does not render raw HTML via React's escape hatch.

---

### PASS — All API modules have Zod schema validation on responses

All 13 modules in `apps/web/src/api/modules/` import Zod and define response schemas:
- `auth.ts` — `LoginResponseSchema`, `UserSchema`, etc.
- `audit-plans.ts` — `AuditPlanSchema`, `AuditPlanListSchema`
- `correspondence.ts` — Zod validated
- `dashboard.ts` — Zod validated
- `departments.ts` — Zod validated
- `findings.ts` — Zod validated
- `notifications.ts` — Zod validated
- `recommendations.ts` — Zod validated
- `regulatory.ts` — Zod validated
- `risk-register.ts` — Zod validated
- `tasks.ts` — Zod validated
- `user-management.ts` — Zod validated
- `users.ts` — `UserSchema`, `UserListSchema`, `DeleteResponseSchema`

The API client enforces schema parsing on all responses, preventing type confusion attacks and malformed data from reaching the UI.

---

### PASS — No exposed secrets in `.env` committed to repository

The `.gitignore` includes `.env*` with an exception only for `.env.example`. The `.env` file contains only localhost development URLs and a dev version string — no credentials, tokens, or API keys.

---

## Summary

| Result | Count |
|--------|-------|
| 🔴 Critical findings | 3 |
| ✅ Passed checks | 5 |

