/**
 * SPA-internal navigation events (Req 23)
 *
 * The API client's `onUnauthorized` callback must not perform a full document
 * reload via `window.location.href`, which would tear down the single-page
 * app. Instead it dispatches an in-app DOM event that a top-level listener
 * (mounted inside the Router context) consumes to perform a client-side
 * `navigate('/login')`.
 *
 * The event name is exported as a shared constant so the dispatcher
 * (`httpClient.ts` / `index.ts`) and the listener (top-level component) stay in
 * sync.
 */

/**
 * Custom DOM event name dispatched when an unauthorized response should send
 * the user to the login route within the SPA.
 */
export const UNAUTHORIZED_EVENT = 'app:unauthorized';

/**
 * Dispatch the SPA-internal unauthorized navigation event.
 *
 * Safe to call in non-browser environments (e.g. SSR or unit tests without a
 * DOM): it no-ops when `window` is unavailable.
 */
export function dispatchUnauthorized(): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT));
}
