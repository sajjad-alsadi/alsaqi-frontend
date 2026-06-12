/**
 * Property-based tests for `resolveBaseUrl` (HTTP client base-URL resolution).
 *
 * Feature: frontend-consistency-fixes, Property 3: API base-URL resolution
 *   - Verifies the `/api` fallback for undefined/empty/whitespace-only input and
 *     pass-through of any non-empty (non-whitespace-only) string.
 *   **Validates: Requirements 5.2**
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { resolveBaseUrl } from '../httpClient';

// ─── Arbitraries ────────────────────────────────────────────────────────────────

/** Whitespace-only strings (spaces, tabs, newlines, carriage returns) including empty. */
const arbWhitespaceOnly = fc
  .array(fc.constantFrom(' ', '\t', '\n', '\r', '\f', '\v'), {
    minLength: 0,
    maxLength: 10,
  })
  .map((chars) => chars.join(''));

/**
 * Arbitrary non-empty (non-whitespace-only) strings: any string that still has
 * meaningful content after trimming. We filter to guarantee `.trim().length > 0`.
 */
const arbMeaningfulString = fc
  .string({ minLength: 1, maxLength: 100 })
  .filter((s) => s.trim().length > 0);

// ─── Property 3: API base-URL resolution ─────────────────────────────────────────

describe('Property 3: API base-URL resolution', () => {
  it('falls back to "/api" for undefined input', () => {
    // Feature: frontend-consistency-fixes, Property 3: API base-URL resolution
    expect(resolveBaseUrl(undefined)).toBe('/api');
    expect(resolveBaseUrl()).toBe('/api');
  });

  it('falls back to "/api" for empty and whitespace-only strings', () => {
    // Feature: frontend-consistency-fixes, Property 3: API base-URL resolution
    fc.assert(
      fc.property(arbWhitespaceOnly, (value) => {
        expect(resolveBaseUrl(value)).toBe('/api');
      }),
      { numRuns: 100 }
    );
  });

  it('passes through any non-empty (non-whitespace-only) string unchanged', () => {
    // Feature: frontend-consistency-fixes, Property 3: API base-URL resolution
    fc.assert(
      fc.property(arbMeaningfulString, (value) => {
        expect(resolveBaseUrl(value)).toBe(value);
      }),
      { numRuns: 100 }
    );
  });
});
