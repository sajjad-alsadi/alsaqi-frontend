/**
 * Property-based tests for envelope unwrapping.
 *
 * Property 2: Response envelope unwrapping is data-projection on success
 *   envelopes and identity otherwise.
 *   - Verifies `unwrapEnvelope({ success: true, data: x })` yields exactly `x`,
 *     and that any non-success-envelope payload is returned unchanged (identity).
 *   **Validates: Requirements 5.5, 5.8**
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { unwrapEnvelope } from '../utils/envelope';

// Feature: frontend-consistency-fixes, Property 2: Response envelope unwrapping is data-projection on success envelopes and identity otherwise
describe('Property 2: Response envelope unwrapping is data-projection on success envelopes and identity otherwise', () => {
  it('unwrapEnvelope({ success: true, data: x }) returns exactly x (data-projection)', () => {
    fc.assert(
      fc.property(fc.anything(), (x) => {
        const envelope = { success: true, data: x };
        // The inner data is returned by reference, so a strict deep-equality holds.
        expect(unwrapEnvelope(envelope)).toStrictEqual(x);
        // And it is the very same reference that was placed in the `data` field.
        expect(unwrapEnvelope(envelope)).toBe(envelope.data);
      }),
      { numRuns: 100 }
    );
  });

  it('unwrapEnvelope({ success: true, data: x, ...extra }) still projects to x', () => {
    fc.assert(
      fc.property(fc.anything(), fc.anything(), (x, meta) => {
        const envelope = { success: true, data: x, meta, pagination: undefined };
        expect(unwrapEnvelope(envelope)).toBe(envelope.data);
      }),
      { numRuns: 100 }
    );
  });

  it('unwrapEnvelope is identity for any non-success-envelope payload', () => {
    // Arbitraries covering the non-envelope payload space:
    const arbNonEnvelope = fc.oneof(
      // arrays
      fc.array(fc.anything()),
      // primitives
      fc.string(),
      fc.integer(),
      fc.double(),
      fc.boolean(),
      // null / undefined
      fc.constant(null),
      fc.constant(undefined),
      // { success: false, ... } — not a success envelope even with a data field
      fc.record({ success: fc.constant(false), data: fc.anything() }),
      // success !== true (truthy but not boolean true) with data
      fc.record({ success: fc.constantFrom(1, 'true', {}, 0), data: fc.anything() }),
      // success: true but NO data field
      fc.record({ success: fc.constant(true), meta: fc.anything() }),
      // arbitrary objects, excluding the (astronomically unlikely) success envelope
      fc.object().filter(
        (o) =>
          !(
            o &&
            typeof o === 'object' &&
            'success' in o &&
            (o as { success?: unknown }).success === true &&
            'data' in o
          )
      )
    );

    fc.assert(
      fc.property(arbNonEnvelope, (payload) => {
        expect(unwrapEnvelope(payload)).toBe(payload);
      }),
      { numRuns: 100 }
    );
  });
});
