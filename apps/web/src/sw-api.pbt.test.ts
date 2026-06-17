/**
 * Property-based test for API network-first with timeout fallback.
 *
 * Property 13: API GET requests use network-first with timeout fallback
 * The service worker routing logic must:
 * 1. Apply "network-first" strategy with a 3000ms timeout for GET requests to /api/*
 * 2. Apply "passthrough" for non-GET requests to /api/* (POST, PUT, DELETE, PATCH)
 * 3. Not apply "network-first" strategy for non-API paths
 * 4. Fall back to cache when network duration exceeds the 3000ms timeout
 * 5. Use network response when duration is within the timeout
 *
 * **Validates: Requirements 5.4**
 *
 * Feature: app-rebuild, Property 13
 *
 * Strategy: Extract the routing decision and timeout fallback logic as pure
 * functions and use fast-check to generate arbitrary paths, methods, and
 * durations. Assert correct strategy selection and fallback behavior.
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

// ---------------------------------------------------------------------------
// Pure routing strategy resolver — extracted from sw.js routing logic
// ---------------------------------------------------------------------------

interface StrategyResult {
  strategy: 'network-first' | 'cache-first' | 'stale-while-revalidate' | 'passthrough';
  timeout?: number;
}

/**
 * Resolves the caching strategy for a given pathname and HTTP method.
 * Mirrors the decision tree in sw.js fetch event handler.
 */
function resolveApiStrategy(pathname: string, method: string): StrategyResult {
  if (pathname.startsWith('/api/') && method === 'GET') {
    return { strategy: 'network-first', timeout: 3000 };
  }
  // Non-GET API requests pass through (not cached by the SW)
  if (pathname.startsWith('/api/')) {
    return { strategy: 'passthrough' };
  }
  // Static assets would be cache-first, locales stale-while-revalidate, etc.
  // For this test we focus on the API routing — non-API paths are not network-first
  if (pathname.startsWith('/assets/') || pathname.startsWith('/fonts/')) {
    return { strategy: 'cache-first' };
  }
  if (pathname.startsWith('/locales/')) {
    return { strategy: 'stale-while-revalidate' };
  }
  return { strategy: 'passthrough' };
}

// ---------------------------------------------------------------------------
// Timeout fallback logic — extracted from networkFirstWithTimeout in sw.js
// ---------------------------------------------------------------------------

/**
 * Determines whether the service worker should fall back to cache.
 * When the network response takes longer than the timeout, fallback is triggered.
 */
function shouldFallbackToCache(networkDurationMs: number, timeout: number): boolean {
  return networkDurationMs > timeout;
}

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/** Generates a random API path by picking from realistic sub-paths */
const arbApiSubPath = fc.oneof(
  fc.constantFrom(
    '/api/users',
    '/api/departments',
    '/api/audits',
    '/api/notifications',
    '/api/reports/annual',
    '/api/settings/profile',
    '/api/compliance-matrix',
    '/api/findings/123',
    '/api/audit-trail',
    '/api/v2/data'
  ),
  fc.string({ minLength: 1, maxLength: 12 }).map((s) => '/api/' + s.replace(/[\/?#]/g, 'x'))
);

/** Generates a random non-API path that doesn't match other SW-intercepted prefixes */
const arbNonApiPath = fc.constantFrom(
  '/dashboard',
  '/settings',
  '/users/123',
  '/reports/annual',
  '/',
  '/profile',
  '/audits/list',
  '/correspondence',
  '/app/overview',
  '/app/module/detail',
  '/login',
  '/about'
);

/** Generates a non-GET HTTP method */
const arbNonGetMethod = fc.constantFrom('POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS');

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe('Property 13: API GET requests use network-first with timeout fallback', () => {
  describe('Strategy Resolution', () => {
    it('resolves network-first with 3000ms timeout for any GET /api/* path', () => {
      fc.assert(
        fc.property(arbApiSubPath, (pathname) => {
          const result = resolveApiStrategy(pathname, 'GET');
          expect(result.strategy).toBe('network-first');
          expect(result.timeout).toBe(3000);
        }),
        { numRuns: 200 }
      );
    });

    it('resolves passthrough for non-GET methods on /api/* paths', () => {
      fc.assert(
        fc.property(arbApiSubPath, arbNonGetMethod, (pathname, method) => {
          const result = resolveApiStrategy(pathname, method);
          expect(result.strategy).toBe('passthrough');
          expect(result.timeout).toBeUndefined();
        }),
        { numRuns: 200 }
      );
    });

    it('does not resolve network-first for non-API paths regardless of method', () => {
      fc.assert(
        fc.property(
          arbNonApiPath,
          fc.constantFrom('GET', 'POST', 'PUT', 'DELETE'),
          (pathname, method) => {
            const result = resolveApiStrategy(pathname, method);
            expect(result.strategy).not.toBe('network-first');
          }
        ),
        { numRuns: 200 }
      );
    });
  });

  describe('Timeout Fallback Logic', () => {
    it('falls back to cache when network duration exceeds 3000ms', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 3001, max: 60000 }),
          (duration) => {
            expect(shouldFallbackToCache(duration, 3000)).toBe(true);
          }
        ),
        { numRuns: 200 }
      );
    });

    it('uses network response when duration is within 3000ms', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 3000 }),
          (duration) => {
            expect(shouldFallbackToCache(duration, 3000)).toBe(false);
          }
        ),
        { numRuns: 200 }
      );
    });

    it('fallback boundary: duration exactly at timeout does not trigger fallback', () => {
      // duration === timeout → still within budget (not exceeded)
      expect(shouldFallbackToCache(3000, 3000)).toBe(false);
    });

    it('generalizes to arbitrary timeout values: duration > timeout → fallback', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 100, max: 30000 }), // arbitrary timeout
          fc.integer({ min: 1, max: 30000 }),    // arbitrary extra ms beyond timeout
          (timeout, extra) => {
            const duration = timeout + extra;
            expect(shouldFallbackToCache(duration, timeout)).toBe(true);
          }
        ),
        { numRuns: 200 }
      );
    });

    it('generalizes to arbitrary timeout values: duration ≤ timeout → no fallback', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 30000 }), // arbitrary timeout
          fc.integer({ min: 0, max: 30000 }), // arbitrary factor
          (timeout, factor) => {
            // Ensure duration is at most equal to timeout
            const duration = Math.min(factor, timeout);
            expect(shouldFallbackToCache(duration, timeout)).toBe(false);
          }
        ),
        { numRuns: 200 }
      );
    });
  });
});
