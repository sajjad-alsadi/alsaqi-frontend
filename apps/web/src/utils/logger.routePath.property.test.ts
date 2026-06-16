/**
 * Property-based test for the Logger's query-string-free location forwarding.
 *
 * Feature: code-review-remediation, Property 10: Forwarded location never
 * includes the query string.
 *
 * For any `window.location.href` value — including ones carrying query-string
 * tokens — the location forwarded by the Logger (`toTransmissionEntry`, which
 * attaches `routePath` from `location.pathname` only) excludes the query string
 * entirely, so no query-string token is transmitted to the Backend.
 *
 * **Validates: Requirements 10.2, 10.3**
 *
 * Strategy: generate arbitrary pathname + query-string (with a recognizable
 * sensitive token) + hash combinations, set `window.location` for each run via
 * `history.replaceState` (jsdom updates `window.location` accordingly), call
 * `toTransmissionEntry` on a structured entry, and assert the resulting
 * `routePath`:
 *   - equals `window.location.pathname`,
 *   - contains no `?` (and therefore no query string),
 *   - contains no `#` (and therefore no fragment), and
 *   - does not contain the injected query-string token.
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import fc from 'fast-check';
import { toTransmissionEntry, type LogEntry } from './logger';

/** A non-empty path segment built from URL-safe lowercase letters. */
const segmentArb = fc
  .array(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split('')), {
    minLength: 1,
    maxLength: 8,
  })
  .map((chars) => chars.join(''));

/** Zero or more segments → a pathname such as `/` or `/foo/bar`. */
const pathnameArb = fc
  .array(segmentArb, { minLength: 0, maxLength: 5 })
  .map((segments) => '/' + segments.join('/'));

/**
 * A recognizable "sensitive token" value. Uses uppercase letters, digits, and
 * `=` padding (disjoint from the lowercase-only path segments) so that if it
 * ever leaked into the forwarded `routePath` it would be detectable verbatim.
 */
const tokenArb = fc
  .array(fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split('')), {
    minLength: 8,
    maxLength: 24,
  })
  .map((chars) => chars.join('') + '==');

/** An optional fragment such as `` or `#section`. */
const hashArb = fc.option(
  fc
    .array(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split('')), {
      minLength: 1,
      maxLength: 10,
    })
    .map((chars) => '#' + chars.join('')),
  { nil: '' },
);

/** Whether to include a query string carrying the sensitive token at all. */
const hasQueryArb = fc.boolean();

function makeEntry(): LogEntry {
  return {
    level: 'error',
    message: 'something failed',
    timestamp: '2024-01-01T00:00:00.000Z',
    module: 'TestModule',
    correlationId: '550e8400-e29b-41d4-a716-446655440000',
  };
}

describe('Feature: code-review-remediation, Property 10: Forwarded location never includes the query string (Requirements 10.2, 10.3)', () => {
  const originalHref = window.location.href;

  beforeEach(() => {
    window.history.replaceState({}, '', '/');
  });

  afterEach(() => {
    // Restore the original location so other tests are unaffected.
    window.history.replaceState({}, '', originalHref);
  });

  it('forwards only the pathname and never the query string or its tokens', () => {
    fc.assert(
      fc.property(
        pathnameArb,
        tokenArb,
        hashArb,
        hasQueryArb,
        (pathname, token, hash, hasQuery) => {
          const query = hasQuery ? `?token=${token}&access=${token}` : '';
          const relativeUrl = `${pathname}${query}${hash}`;

          // Set window.location for this run (jsdom updates location from this).
          window.history.replaceState({}, '', relativeUrl);

          const forwarded = toTransmissionEntry(makeEntry());

          // The forwarded location is the pathname only.
          expect(forwarded.routePath).toBe(window.location.pathname);
          // No query string is ever forwarded.
          expect(forwarded.routePath).not.toContain('?');
          // No fragment is forwarded either.
          expect(forwarded.routePath).not.toContain('#');
          // The sensitive query-string token is never transmitted.
          if (hasQuery) {
            expect(forwarded.routePath).not.toContain(token);
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});
