/**
 * Property-based test for injection-safe CSV serialization (Requirement 28.3).
 *
 * Feature: code-review-remediation, Property 18: CSV serialization round-trips —
 *   "For any header row and matrix of field values, parsing the document
 *    produced by `buildCsv` recovers the original headers and rows (modulo the
 *    single-quote neutralizing prefix), and every field is quoted."
 *
 * The testable seam is the pair `buildCsv` / `parseCsv`. `buildCsv` wraps every
 * cell with `toCsvField`, which (a) prefixes a single quote when the first
 * character is a formula-trigger (`=`, `+`, `-`, `@`, `\t`, `\r`) and (b)
 * doubles embedded double-quotes, then wraps the result in double quotes.
 * `parseCsv` reverses the quote-wrapping and quote-doubling but leaves the
 * single-quote neutralizing prefix in place. So a faithful round-trip recovers
 * each original value with the *same* neutralizing prefix re-applied — that is
 * the "modulo the single-quote neutralizing prefix" clause.
 *
 * To exercise the boundary we synthesize a column count, a header row of that
 * width, and a matrix of data rows of the same width, drawing each cell from a
 * generator that intentionally includes the hostile characters CSV must survive:
 * commas, double-quotes, CR/LF newlines, tabs, and leading formula-trigger
 * characters. We then assert (1) every field in the produced document is quoted
 * (verified by an independent scanner that does not reuse the production
 * helpers) and (2) `parseCsv(buildCsv(...))` equals the input with the
 * neutralizing prefix re-applied.
 *
 * **Validates: Requirements 28.3**
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { buildCsv, parseCsv } from './csvExport';

/**
 * Formula-trigger characters that `neutralizeCell` guards against. Mirrors the
 * production list so the test can predict when a single-quote prefix is added.
 */
const FORMULA_TRIGGERS = ['=', '+', '-', '@', '\t', '\r'] as const;

/**
 * Re-applies *only* the single-quote neutralizing prefix that `neutralizeCell`
 * would add (no quote-doubling, because `parseCsv` already reverses that). The
 * round-trip should recover each cell exactly equal to this transform.
 */
function applyNeutralizingPrefix(value: string): string {
  return (FORMULA_TRIGGERS as readonly string[]).includes(value.charAt(0))
    ? `'${value}`
    : value;
}

/**
 * Independently verifies the "every field is quoted" invariant without reusing
 * any production helper. Walks the document field-by-field: every field MUST
 * open with a double-quote, may contain doubled (`""`) embedded quotes, and MUST
 * close with a double-quote, after which only a field separator (`,`), a row
 * separator (CRLF), or end-of-input is allowed.
 */
function everyFieldIsQuoted(csv: string): boolean {
  let i = 0;
  for (;;) {
    if (csv[i] !== '"') return false; // a field must begin with a quote
    i += 1;
    let closed = false;
    while (i < csv.length) {
      if (csv[i] === '"') {
        if (csv[i + 1] === '"') {
          i += 2; // doubled embedded quote
          continue;
        }
        i += 1; // closing quote
        closed = true;
        break;
      }
      i += 1; // ordinary content char (commas/newlines allowed inside quotes)
    }
    if (!closed) return false; // ran off the end inside an open field
    if (i >= csv.length) return true; // last field, document well-formed
    if (csv[i] === ',') {
      i += 1; // next field on the same row
      continue;
    }
    if (csv[i] === '\r' && csv[i + 1] === '\n') {
      i += 2; // next row
      continue;
    }
    return false; // anything else between fields is malformed
  }
}

// A cell generator that includes the characters CSV serialization must survive:
// commas, double-quotes, CR/LF newlines, tabs, and formula-trigger leads.
const hostileChar = fc.constantFrom(
  ',',
  '"',
  '\r',
  '\n',
  '\t',
  '=',
  '+',
  '-',
  '@',
  "'",
  'a',
  'Z',
  '0',
  ' ',
  '،', // Arabic comma (the app is RTL/Arabic-first)
);

const cellArb = fc.oneof(
  // Arbitrary text (covers the general case, including occasional quotes/commas).
  fc.string(),
  // Dense mixes of the hostile characters above.
  fc.array(hostileChar, { maxLength: 16 }).map((chars) => chars.join('')),
  // Explicitly formula-trigger-prefixed values (the neutralization path).
  fc
    .tuple(fc.constantFrom(...FORMULA_TRIGGERS), fc.string())
    .map(([trigger, rest]) => trigger + rest),
);

// A header row and a matrix of data rows that all share the same column count.
const documentArb = fc.integer({ min: 1, max: 5 }).chain((columns) =>
  fc.record({
    headers: fc.array(cellArb, { minLength: columns, maxLength: columns }),
    rows: fc.array(fc.array(cellArb, { minLength: columns, maxLength: columns }), {
      maxLength: 6,
    }),
  }),
);

describe('Property 18: CSV serialization round-trips (requirement 28.3)', () => {
  it('quotes every field and recovers headers+rows modulo the neutralizing prefix', () => {
    fc.assert(
      fc.property(documentArb, ({ headers, rows }) => {
        const csv = buildCsv(headers, rows);

        // (2) Every exported field is quoted (Req 28.3).
        expect(everyFieldIsQuoted(csv)).toBe(true);

        // (1) Round-trip recovers the original values modulo the single-quote
        // neutralizing prefix that `neutralizeCell` applies to trigger-prefixed
        // cells.
        const parsed = parseCsv(csv);
        const expected = [headers, ...rows].map((row) =>
          row.map((cell) => applyNeutralizingPrefix(cell)),
        );
        expect(parsed).toEqual(expected);
      }),
      { numRuns: 100 },
    );
  });
});
