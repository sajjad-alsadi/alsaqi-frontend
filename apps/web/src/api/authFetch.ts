/**
 * CSRF- and credential-aware `fetch` wrapper for the secondary auth flows
 * (2FA verification/enrollment and forced password change) that talk to the
 * `/api/auth/...` endpoints directly rather than through the typed API client.
 *
 * The typed client (`client.ts`) attaches the `x-csrf-token` header (read from
 * the `csrf-token` cookie) and sends cookies via `withCredentials` on every
 * request. The raw `fetch` calls in `Login.tsx` did neither, so any backend that
 * enforces CSRF on these endpoints would reject them with a 403, and cookie-based
 * session auth would silently not be sent. This helper restores both behaviors
 * for `fetch`-based callers without changing the endpoint URLs.
 */

/**
 * Read the CSRF token from the `csrf-token` cookie.
 *
 * Mirrors the parser in `client.ts`: everything after the first `=` is preserved
 * (so base64 `=` padding survives) and then URL-decoded. Returns `undefined`
 * when there is no document (SSR) or no cookie.
 */
export function readCsrfToken(): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const match = document.cookie
    .split('; ')
    .find((row) => row.startsWith('csrf-token='));
  if (!match) return undefined;
  return decodeURIComponent(match.slice(match.indexOf('=') + 1));
}

/**
 * `fetch` for auth endpoints with CSRF + credentials applied by default.
 *
 * - Always sends cookies (`credentials: 'include'`) so cookie-based session auth
 *   and the CSRF cookie reach the server.
 * - Attaches the `x-csrf-token` header from the `csrf-token` cookie when present,
 *   matching the typed client so CSRF-protected endpoints accept the request.
 * - Caller-supplied headers and options still win (e.g. an `Authorization`
 *   bearer header for the forced password-change flow), and an explicit
 *   `x-csrf-token` header is never overwritten.
 *
 * @param input - Request URL or `Request` object.
 * @param init  - Standard `fetch` options; merged on top of the secure defaults.
 */
export function authFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const csrfToken = readCsrfToken();

  const mergedHeaders: Record<string, string> = {
    ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
    ...((init.headers as Record<string, string> | undefined) ?? {}),
  };

  return fetch(input, {
    credentials: 'include',
    ...init,
    headers: mergedHeaders,
  });
}
