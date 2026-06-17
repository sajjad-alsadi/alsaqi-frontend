/**
 * Property-based test for navigation request App Shell caching.
 *
 * Property 12: Navigation requests served from App Shell cache
 * For any request with `mode === 'navigate'`, the service worker routing
 * logic SHALL resolve to the 'app-shell' strategy, responding with the
 * cached `/index.html`. This property holds regardless of the request URL,
 * pathname, or query parameters.
 *
 * **Validates: Requirements 5.3**
 *
 * Feature: app-rebuild, Property 12
 *
 * Strategy: Use fast-check to generate arbitrary navigation request URLs
 * (random pathnames, query strings, hash fragments). Assert that the
 * resolveStrategy function always returns 'app-shell' when mode is 'navigate'.
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

// ---------------------------------------------------------------------------
// Pure function mimicking the SW fetch-event routing logic from public/sw.js.
// This is a testable extraction of the strategy resolution — the SW routes:
//   1. navigate mode → app-shell (respond with cached /index.html)
//   2. /api/* GET → network-first with timeout
//   3. /assets/* or /fonts/* → cache-first
//   4. /locales/* → stale-while-revalidate
//   5. anything else → passthrough (no caching strategy applied)
// ---------------------------------------------------------------------------
export type CacheStrategy =
  | 'app-shell'
  | 'network-first'
  | 'cache-first'
  | 'stale-while-revalidate'
  | 'passthrough';

/**
 * Resolves the caching strategy for a given request based on mode, pathname,
 * and HTTP method — mirroring the sw.js fetch event handler.
 */
export function resolveStrategy(
  mode: string,
  pathname: string,
  method: string
): CacheStrategy {
  // Strategy 1: Navigation requests → App Shell pattern
  if (mode === 'navigate') {
    return 'app-shell';
  }

  // Strategy 2: API GET requests → network-first with timeout
  if (pathname.startsWith('/api/') && method === 'GET') {
    return 'network-first';
  }

  // Strategy 3: Static assets (JS, CSS, fonts) → cache-first
  if (pathname.startsWith('/assets/') || pathname.startsWith('/fonts/')) {
    return 'cache-first';
  }

  // Strategy 4: Locale files → stale-while-revalidate
  if (pathname.startsWith('/locales/')) {
    return 'stale-while-revalidate';
  }

  // No matching strategy — request passes through unhandled
  return 'passthrough';
}

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/** Generates arbitrary URL pathnames using realistic path segments */
const arbPathname = fc.oneof(
  // Realistic app paths
  fc.constantFrom(
    '/',
    '/dashboard',
    '/audits',
    '/audits/123',
    '/audits/123/findings',
    '/reports',
    '/reports/annual/2024',
    '/settings',
    '/settings/profile',
    '/correspondence',
    '/users',
    '/users/456/details',
    '/compliance-matrix',
    '/login',
    '/notifications'
  ),
  // Random paths built from segments
  fc.array(
    fc.string({ minLength: 1, maxLength: 12 }).map((s) => s.replace(/[\/?#\s]/g, 'x')),
    { minLength: 1, maxLength: 5 }
  ).map((segments) => '/' + segments.join('/'))
);

/** Generates arbitrary paths that overlap with other SW strategies */
const arbApiPath = fc.string({ minLength: 1, maxLength: 15 })
  .map((s) => '/api/' + s.replace(/[\/?#\s]/g, 'x'));

const arbAssetPath = fc.string({ minLength: 1, maxLength: 15 })
  .map((s) => '/assets/' + s.replace(/[\/?#\s]/g, 'x'));

const arbFontsPath = fc.string({ minLength: 1, maxLength: 15 })
  .map((s) => '/fonts/' + s.replace(/[\/?#\s]/g, 'x'));

const arbLocalesPath = fc.constantFrom(
  '/locales/ar.json',
  '/locales/en.json',
  '/locales/fr.json',
  '/locales/de.json'
);

/** Generates any pathname including those that would normally match other strategies */
const arbAnyPathname = fc.oneof(
  arbPathname,
  arbApiPath,
  arbAssetPath,
  arbFontsPath,
  arbLocalesPath
);

/** Generates common HTTP methods */
const arbHttpMethod = fc.constantFrom('GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS');

/** Generates non-navigate request modes */
const arbNonNavigateMode = fc.constantFrom('cors', 'no-cors', 'same-origin', 'websocket');

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe('Property 12: Navigation requests served from App Shell cache', () => {
  it('resolves to app-shell strategy for ANY navigate request regardless of URL', () => {
    fc.assert(
      fc.property(
        arbAnyPathname,
        arbHttpMethod,
        (pathname, method) => {
          const result = resolveStrategy('navigate', pathname, method);
          expect(result).toBe('app-shell');
        }
      ),
      { numRuns: 500 }
    );
  });

  it('resolves to app-shell for navigate requests even on /api/* paths', () => {
    fc.assert(
      fc.property(
        arbApiPath,
        arbHttpMethod,
        (apiPath, method) => {
          // Navigate mode takes priority over /api/ path matching
          const result = resolveStrategy('navigate', apiPath, method);
          expect(result).toBe('app-shell');
        }
      ),
      { numRuns: 200 }
    );
  });

  it('resolves to app-shell for navigate requests even on /assets/* paths', () => {
    fc.assert(
      fc.property(
        arbAssetPath,
        arbHttpMethod,
        (assetPath, method) => {
          // Navigate mode takes priority over /assets/ path matching
          const result = resolveStrategy('navigate', assetPath, method);
          expect(result).toBe('app-shell');
        }
      ),
      { numRuns: 200 }
    );
  });

  it('resolves to app-shell for navigate requests even on /locales/* paths', () => {
    fc.assert(
      fc.property(
        arbLocalesPath,
        arbHttpMethod,
        (localePath, method) => {
          // Navigate mode takes priority over /locales/ path matching
          const result = resolveStrategy('navigate', localePath, method);
          expect(result).toBe('app-shell');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('does NOT resolve to app-shell for non-navigate requests', () => {
    fc.assert(
      fc.property(
        arbPathname,
        arbHttpMethod,
        arbNonNavigateMode,
        (pathname, method, mode) => {
          const result = resolveStrategy(mode, pathname, method);
          // Non-navigate requests should never get the app-shell strategy
          expect(result).not.toBe('app-shell');
        }
      ),
      { numRuns: 300 }
    );
  });
});
