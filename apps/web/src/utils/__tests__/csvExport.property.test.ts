/**
 * Property-based tests for injection-safe CSV export (Requirement 14).
 *
 * Feature: frontend-audit-remediation, Property 12: CSV export round-trip
 *   For any cell value, parsing the exported CSV and removing any single-quote
 *   neutralizing prefix yields the original cell text.
 *   **Validates: Requirements 14.1, 14.3, 14.4**
 *
 * Feature: frontend-audit-remediation, Property 13: CSV formula neutralization
 *   For any cell value whose first character is `=`, `+`, `-`, or `@`, the
 *   exported cell begins with a single-quote character.
 *   **Validates: Requirements 14.2, 14.5**
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

import { buildCsv, parseCsv } from '../csvExport';

// Characters a spreadsheet may interpret as the start of a formula.
const FORMULA_TRIGGERS = ['=', '+', '-', '@'] as const;

/**
 * Recovers the original cell text from a parsed (exported) value by removing
 * the single-quote neutralizing prefix the exporter would have added.
 *
 * A neutralizing prefix is added *only* when the original value's first
 * character is a formula trigger (`=`, `+`, `-`, `@`). We therefore decide
 * whether to strip based on the original value — a value that merely happens
 * to start with `'` (e.g. `'` itself) was never neutralized and must not be
 * altered.
 */
function recoverCell(original: string, parsed: string): string {
  const wasNeutralized = (FORMULA_TRIGGERS as readonly string[]).includes(
    original.charAt(0),
  );
  return wasNeutralized ? parsed.slice(1) : parsed;
}

describe('csvExport property tests', () => {
  // ─── Property 12: CSV export round-trip ──────────────────────────────────
  it('Property 12: round-trips any single cell value through export and parse', () => {
    fc.assert(
      fc.property(fc.string(), (cell) => {
        const csv = buildCsv(['col'], [[cell]]);
        const parsed = parseCsv(csv);

        // Row 0 is the header, row 1 is the single data row.
        expect(parsed).toHaveLength(2);
        const recovered = recoverCell(cell, parsed[1][0]);
        expect(recovered).toBe(cell);
      }),
      { numRuns: 200 },
    );
  });

  it('Property 12: round-trips a full matrix of arbitrary cell values', () => {
    // A non-empty header row and a matrix of data rows, each row matching the
    // header width so the exported document is well-formed.
    const matrixArb = fc
      .array(fc.string({ minLength: 1 }), { minLength: 1, maxLength: 5 })
      .chain((headers) =>
        fc
          .array(
            fc.array(fc.string(), {
              minLength: headers.length,
              maxLength: headers.length,
            }),
            { minLength: 0, maxLength: 6 },
          )
          .map((rows) => ({ headers, rows })),
      );

    fc.assert(
      fc.property(matrixArb, ({ headers, rows }) => {
        const csv = buildCsv(headers, rows);
        const parsed = parseCsv(csv);

        // Header row plus one row per data row.
        expect(parsed).toHaveLength(rows.length + 1);

        // Header values round-trip.
        parsed[0].forEach((field, c) => {
          expect(recoverCell(headers[c], field)).toBe(headers[c]);
        });

        // Every data cell round-trips after stripping the prefix.
        rows.forEach((row, r) => {
          row.forEach((cell, c) => {
            expect(recoverCell(cell, parsed[r + 1][c])).toBe(cell);
          });
        });
      }),
      { numRuns: 200 },
    );
  });

  // ─── Property 13: CSV formula neutralization ─────────────────────────────
  it('Property 13: cells starting with a formula trigger export with a leading single-quote', () => {
    // Generate values guaranteed to start with a formula-trigger character.
    const formulaValueArb = fc
      .tuple(fc.constantFrom(...FORMULA_TRIGGERS), fc.string())
      .map(([trigger, rest]) => `${trigger}${rest}`);

    fc.assert(
      fc.property(formulaValueArb, (cell) => {
        const csv = buildCsv(['col'], [[cell]]);
        const parsed = parseCsv(csv);

        // The exported (parsed) cell text must begin with a single-quote.
        expect(parsed[1][0].startsWith("'")).toBe(true);

        // And stripping that prefix recovers the original value.
        expect(recoverCell(cell, parsed[1][0])).toBe(cell);
      }),
      { numRuns: 200 },
    );
  });

  it('Property 13: cells NOT starting with a formula trigger are not neutralized', () => {
    // Values whose first character is not a formula trigger and not a quote
    // (a leading quote would be doubled, not single-quote prefixed).
    const safeValueArb = fc
      .string()
      .filter(
        (s) =>
          s.length > 0 &&
          !(FORMULA_TRIGGERS as readonly string[]).includes(s.charAt(0)),
      );

    fc.assert(
      fc.property(safeValueArb, (cell) => {
        const csv = buildCsv(['col'], [[cell]]);
        const parsed = parseCsv(csv);

        // No neutralizing prefix was added, so the value round-trips exactly.
        expect(parsed[1][0]).toBe(cell);
      }),
      { numRuns: 200 },
    );
  });
});
