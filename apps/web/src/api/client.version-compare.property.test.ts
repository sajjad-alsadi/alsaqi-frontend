/**
 * Property-based tests for the API client's version comparison helper.
 *
 * Property 13: Version comparison tolerates malformed input and matches equal
 * major.minor.
 *
 * For any pair of version strings: if either parses to `NaN` in its major or
 * minor component, `isMajorMinorMatch` returns `true` (treated as a
 * non-mismatch, so no reload overlay is forced); and for any two valid versions
 * whose major and minor components are equal (regardless of patch), it returns
 * `true`.
 *
 * **Validates: Requirements 20.1, 20.2, 20.3**
 *
 * Tag: Feature: code-review-remediation, Property 13
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { isMajorMinorMatch } from './client';

// A version component that always parses to NaN via Number(): a non-empty,
// dot-free string containing characters that Number() cannot interpret as a
// finite number (filters out '', whitespace, numerics, and 'Infinity').
const nanComponent = fc
  .string({ minLength: 1 })
  .filter((s) => !s.includes('.') && Number.isNaN(Number(s)));

const nat = fc.nat({ max: 100_000 });

// A version string whose major OR minor component is present but parses to NaN
// (a non-numeric component). The property's precondition is specifically "parses
// to NaN", so the component must exist and be non-numeric — a missing component
// destructures to `undefined`, which `Number.isNaN` does not treat as NaN.
const malformedVersion = fc.oneof(
  // NaN major: "x.<minor>.<patch>"
  fc.tuple(nanComponent, nat, nat).map(([a, b, c]) => `${a}.${b}.${c}`),
  // NaN minor: "<major>.x.<patch>"
  fc.tuple(nat, nanComponent, nat).map(([a, b, c]) => `${a}.${b}.${c}`),
  // NaN minor with no patch: "<major>.x"
  fc.tuple(nat, nanComponent).map(([a, b]) => `${a}.${b}`)
);

// An optional patch (and beyond) suffix: present or absent, so equal-major.minor
// matching is exercised "regardless of patch".
const patchSuffix = fc
  .option(fc.array(nat, { minLength: 1, maxLength: 3 }), { nil: undefined })
  .map((parts) => (parts === undefined ? '' : `.${parts.join('.')}`));

describe('Property 13: Version comparison tolerates malformed input and matches equal major.minor (Requirements 20.1, 20.2, 20.3)', () => {
  it('returns true (non-mismatch) whenever either operand has a NaN major/minor component', () => {
    fc.assert(
      fc.property(malformedVersion, fc.string(), fc.boolean(), (malformed, other, malformedFirst) => {
        const [client, server] = malformedFirst ? [malformed, other] : [other, malformed];
        // A malformed operand must never force a mismatch, regardless of the
        // other operand's value (Req 20.1, 20.2).
        expect(isMajorMinorMatch(client, server)).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  it('returns true for two valid versions with equal major.minor, regardless of patch', () => {
    fc.assert(
      fc.property(nat, nat, patchSuffix, patchSuffix, (major, minor, suffixA, suffixB) => {
        const client = `${major}.${minor}${suffixA}`;
        const server = `${major}.${minor}${suffixB}`;
        // Equal valid major/minor always reports a match (Req 20.3).
        expect(isMajorMinorMatch(client, server)).toBe(true);
      }),
      { numRuns: 100 }
    );
  });
});
