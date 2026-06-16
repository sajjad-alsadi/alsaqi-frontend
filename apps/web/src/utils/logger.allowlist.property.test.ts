/**
 * Property-based test for allowlisted log context redaction.
 *
 * Feature: code-review-remediation, Property 9
 *
 * Property 9: Forwarded log context contains only allowlisted keys
 * For any caller-supplied context object, the context forwarded to the Backend
 * contains only keys present in the allowlist; every non-allowlisted key is
 * excluded or redacted. Allowlisted keys (and their values) are preserved
 * unchanged.
 *
 * **Validates: Requirements 10.1, 10.4**
 *
 * Strategy: generate arbitrary context objects that mix allowlisted keys with
 * arbitrary (mostly non-allowlisted) keys and arbitrary JSON-ish values, then
 * assert against the real `redactContext`:
 *  - every key in the result is a member of LOG_CONTEXT_ALLOWLIST,
 *  - every allowlisted key from the input survives with its value intact, and
 *  - every non-allowlisted input key is absent from the result.
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { redactContext, LOG_CONTEXT_ALLOWLIST } from './logger';

const ALLOWLIST_SET = new Set<string>(LOG_CONTEXT_ALLOWLIST);

// Arbitrary JSON-ish values a caller might attach to a context object.
const valueArb: fc.Arbitrary<unknown> = fc.oneof(
  fc.string(),
  fc.integer(),
  fc.boolean(),
  fc.constant(null),
  fc.array(fc.string(), { maxLength: 4 }),
  fc.dictionary(fc.string(), fc.string(), { maxKeys: 4 }),
);

// Keys drawn from the allowlist (so allowlisted keys actually appear in inputs).
const allowlistedKeyArb: fc.Arbitrary<string> = fc.constantFrom(
  ...LOG_CONTEXT_ALLOWLIST,
);

// Arbitrary string keys — most will fall outside the allowlist.
const arbitraryKeyArb: fc.Arbitrary<string> = fc.string();

// A context object mixing allowlisted and arbitrary keys with arbitrary values.
const contextArb: fc.Arbitrary<Record<string, unknown>> = fc
  .array(
    fc.tuple(fc.oneof(allowlistedKeyArb, arbitraryKeyArb), valueArb),
    { maxLength: 20 },
  )
  .map((entries) => {
    const obj: Record<string, unknown> = {};
    for (const [key, value] of entries) {
      obj[key] = value;
    }
    return obj;
  });

describe('Property 9: Forwarded log context contains only allowlisted keys (Requirements 10.1, 10.4)', () => {
  it('result keys are a subset of the allowlist and exclude every non-allowlisted key', () => {
    fc.assert(
      fc.property(contextArb, (context) => {
        const result = redactContext(context);
        expect(result).toBeDefined();
        const redacted = result as Record<string, unknown>;

        // Every key that survives redaction must be in the allowlist.
        for (const key of Object.keys(redacted)) {
          expect(ALLOWLIST_SET.has(key)).toBe(true);
        }

        // Every non-allowlisted input key must be excluded entirely.
        for (const key of Object.keys(context)) {
          if (!ALLOWLIST_SET.has(key)) {
            expect(Object.prototype.hasOwnProperty.call(redacted, key)).toBe(false);
          }
        }
      }),
      { numRuns: 200 },
    );
  });

  it('preserves allowlisted keys and their values exactly', () => {
    fc.assert(
      fc.property(contextArb, (context) => {
        const result = redactContext(context) as Record<string, unknown>;

        // Every allowlisted input key is present with its original value.
        for (const key of Object.keys(context)) {
          if (ALLOWLIST_SET.has(key)) {
            expect(Object.prototype.hasOwnProperty.call(result, key)).toBe(true);
            expect(result[key]).toBe(context[key]);
          }
        }
      }),
      { numRuns: 200 },
    );
  });

  it('returns undefined when no context is supplied', () => {
    expect(redactContext(undefined)).toBeUndefined();
  });
});
