/**
 * Authentication Gate for non-React utilities.
 *
 * Provides a simple boolean signal that utilities (logger, webVitalsReporter,
 * errorReporter) can check before sending data to the backend. This prevents
 * metrics and logs from being POSTed to authenticated endpoints when the user
 * has not yet signed in.
 *
 * The gate is set to `true` by the AuthContext once a valid session is
 * confirmed, and reset to `false` on logout.
 *
 * Requirements: Security — no unauthenticated data transmission to backend.
 */

let authenticated = false;

/**
 * Mark the user as authenticated. Call this once session validation succeeds
 * (e.g., after `/profile` returns successfully in AuthContext).
 */
export function markAuthenticated(): void {
  authenticated = true;
}

/**
 * Mark the user as unauthenticated. Call this on logout or session expiry.
 */
export function markUnauthenticated(): void {
  authenticated = false;
}

/**
 * Check whether the user is currently authenticated.
 * Non-React utilities use this to gate outbound network requests.
 */
export function isAuthenticated(): boolean {
  return authenticated;
}
