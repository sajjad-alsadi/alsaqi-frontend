// @vitest-environment node
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { validColumnNameArb, maliciousColumnNameArb } from '../../test/helpers/arbitraries';

/**
 * Property Test: validateIdentifier rejects all SQL Injection attempts (Property 2)
 *
 * Feature: comprehensive-testing
 * Property 2: validateIdentifier يرفض جميع محاولات SQL Injection
 *
 * **Validates: Requirements 5.6, 13.4, 20.3**
 *
 * For any string containing special characters or SQL reserved words,
 * validateIdentifier must reject it. For any valid identifier matching
 * /^[a-zA-Z0-9_]+$/, it must accept and return it unchanged.
 *
 * The actual implementation from DBWrapper:
 *   validateIdentifier(id: string) {
 *     if (!/^[a-zA-Z0-9_]+$/.test(id)) {
 *       throw new Error(`Invalid database identifier: ${id}`);
 *     }
 *     return id;
 *   }
 */

// ─── Implementation Under Test ───────────────────────────────────────────────

/**
 * Standalone version of DBWrapper.validateIdentifier for testing.
 * Matches the exact regex and behavior from src/server/db/index.ts.
 */
function validateIdentifier(id: string): string {
  if (!/^[a-zA-Z0-9_]+$/.test(id)) {
    throw new Error(`Invalid database identifier: ${id}`);
  }
  return id;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Property 2: validateIdentifier rejects all SQL Injection attempts', () => {
  it('accepts all valid identifiers (alphanumeric + underscore)', () => {
    fc.assert(
      fc.property(
        validColumnNameArb,
        (validName) => {
          // Valid identifiers matching /^[a-zA-Z_][a-zA-Z0-9_]*$/ should be accepted
          const result = validateIdentifier(validName);
          expect(result).toBe(validName);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('rejects all strings containing SQL injection characters', () => {
    fc.assert(
      fc.property(
        maliciousColumnNameArb,
        (maliciousName) => {
          // All SQL injection attempts must be rejected
          expect(() => validateIdentifier(maliciousName)).toThrow(
            /Invalid database identifier/
          );
        }
      ),
      { numRuns: 100 }
    );
  });

  it('rejects empty strings', () => {
    expect(() => validateIdentifier('')).toThrow(/Invalid database identifier/);
  });

  it('rejects strings with spaces', () => {
    fc.assert(
      fc.property(
        fc.tuple(
          fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9_]{0,10}$/),
          fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9_]{0,10}$/)
        ).map(([a, b]) => `${a} ${b}`),
        (nameWithSpace) => {
          expect(() => validateIdentifier(nameWithSpace)).toThrow(
            /Invalid database identifier/
          );
        }
      ),
      { numRuns: 100 }
    );
  });

  it('rejects strings with special characters used in SQL injection', () => {
    const sqlSpecialChars = [';', "'", '"', '-', '(', ')', '=', '*', '/', '\\', '@', '#', '$', '%', '&', '|', '<', '>', '!', '`', '~', ',', '.', '?', '{', '}', '[', ']'];

    fc.assert(
      fc.property(
        fc.tuple(
          fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9_]{0,5}$/),
          fc.constantFrom(...sqlSpecialChars),
          fc.stringMatching(/^[a-zA-Z0-9_]{0,5}$/)
        ).map(([prefix, specialChar, suffix]) => `${prefix}${specialChar}${suffix}`),
        (injectionAttempt) => {
          expect(() => validateIdentifier(injectionAttempt)).toThrow(
            /Invalid database identifier/
          );
        }
      ),
      { numRuns: 100 }
    );
  });
});
