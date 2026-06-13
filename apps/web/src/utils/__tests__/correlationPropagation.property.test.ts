/**
 * Property-based test for Component 6 — Observability & Release Hardening.
 *
 * **Property 4: Correlation propagation**
 * *For any* request issued through `createApiClient`, the `x-correlation-id` it
 * carries appears in the corresponding log entry and (on error) in the Sentry
 * report.
 *
 * **Validates: Requirements 6.1**
 *
 * Strategy: generate arbitrary non-empty correlation id strings and assert that
 *  - `correlationIdPropagates(id)` is `true`, and
 *  - the id appears byte-for-byte as the `correlationId` of the structured log
 *    entry built for that request, and
 *  - the id appears byte-for-byte as the Sentry tag value and the Sentry
 *    context `correlationId`.
 * Plus the negative direction: empty / non-string ids have nothing to
 * propagate, so `correlationIdPropagates` returns `false`.
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

import {
  correlationIdPropagates,
  buildCorrelatedLogEntry,
  buildCorrelationSentryScope,
  CORRELATION_ID_TAG,
  CORRELATION_ID_CONTEXT,
} from '../observability';

describe('Property 4: Correlation propagation (Req 6.1)', () => {
  it('propagates any non-empty correlation id byte-for-byte to the log entry and Sentry scope', () => {
    fc.assert(
      fc.property(
        // Arbitrary non-empty strings: covers UUIDs, symbols, whitespace,
        // unicode — the id must survive byte-for-byte regardless of content.
        fc.string({ minLength: 1 }),
        (id) => {
          // Predicate under test holds for every non-empty id.
          expect(correlationIdPropagates(id)).toBe(true);

          // Sink 1: the structured log entry carries the id unchanged.
          const entry = buildCorrelatedLogEntry(id);
          expect(entry.correlationId).toBe(id);
          expect(entry.context.correlationId).toBe(id);

          // Sink 2: the Sentry scope carries the id as both tag and context,
          // byte-for-byte (no trimming / normalization).
          const scope = buildCorrelationSentryScope(id);
          expect(scope.tags[CORRELATION_ID_TAG]).toBe(id);
          expect(scope.contexts[CORRELATION_ID_CONTEXT]?.correlationId).toBe(id);
        },
      ),
      { numRuns: 1000 },
    );
  });

  it('returns false for an empty correlation id (nothing to propagate)', () => {
    expect(correlationIdPropagates('')).toBe(false);
  });

  it('returns false for any non-string correlation id', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.constant(undefined),
          fc.constant(null),
          fc.integer(),
          fc.boolean(),
          fc.object(),
        ),
        (notAString) => {
          // The surface is defensive against non-string ids: an absent or
          // mistyped correlation id has nothing to propagate.
          expect(correlationIdPropagates(notAString as unknown as string)).toBe(false);
        },
      ),
      { numRuns: 200 },
    );
  });
});
