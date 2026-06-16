/**
 * Property-based test for CSV formula-injection neutralization.
 *
 * Feature: code-review-remediation, Property 17: CSV cells beginning with a
 * formula trigger are neutralized.
 *
 * For any cell value whose first character is a formula-trigger character —
 * `=`, `+`, `-`, `@`, tab (`\t`), or carriage return (`\r`) — `neutralizeCell`
 * prefixes a single quote so spreadsheet software cannot interpret it as a
 * formula. Conversely, values whose first character is NOT a trigger are not
 * prefixed.
 *
 * **Validates: Requirements 28.1, 28.2**
 *
 * Strategy: generate the body of a cell from arbitrary strings, then prepend a
 * known formula-trigger character to construct "triggered" inputs, and assert
 * the neutralized output begins with a single quote followed by the trigger.
 * For the non-trigger case we generate strings whose first character is
 * guaranteed not to be a trigger and assert no single-quote prefix is added.
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { neutralizeCell } from './csvExport';

const FORMULA_TRIGGERS = ['=', '+', '-', '@', '\t', '\r'] as const;

const triggerArb = fc.constantFrom(...FORMULA_TRIGGERS);

// Arbitrary string used as the remainder of the cell after the first character.
const bodyArb = fc.string();

describe('Feature: code-review-remediation, Property 17: CSV cells beginning with a formula trigger are neutralized (Requirements 28.1, 28.2)', () => {
  it('prefixes a single quote when the first character is a formula trigger', () => {
    fc.assert(
      fc.property(triggerArb, bodyArb, (trigger, body) => {
        const value = trigger + body;
        const result = neutralizeCell(value);
        // A single-quote prefix is added ahead of the original trigger char.
        expect(result.startsWith("'")).toBe(true);
        expect(result.charAt(1)).toBe(trigger);
        // The neutralized value is exactly the original with a leading quote
        // (modulo quote-doubling, which never affects the leading "'" + trigger
        // because neither "'" nor any trigger char is a double-quote).
        expect(result).toBe(`'${value}`.replace(/"/g, '""'));
      }),
      { numRuns: 200 }
    );
  });

  it('does not add a single-quote prefix when the first character is not a trigger', () => {
    // Generate non-empty strings whose first character is not a formula trigger
    // and is not a single quote (so we can assert the absence of neutralization
    // prefixing unambiguously).
    const nonTriggerStringArb = fc
      .string({ minLength: 1 })
      .filter((s) => {
        const first = s.charAt(0);
        return !(FORMULA_TRIGGERS as readonly string[]).includes(first) && first !== "'";
      });

    fc.assert(
      fc.property(nonTriggerStringArb, (value) => {
        const result = neutralizeCell(value);
        // No neutralizing single-quote was prepended.
        expect(result.startsWith("'")).toBe(false);
        // Output equals the input with only quote-doubling applied.
        expect(result).toBe(value.replace(/"/g, '""'));
      }),
      { numRuns: 200 }
    );
  });

  it('does not prefix an empty string', () => {
    expect(neutralizeCell('')).toBe('');
  });
});
