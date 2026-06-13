/**
 * Injection-safe shared CSV export (Requirements 14, 28).
 *
 * All CSV exporters (IncomingRegister, OutgoingRegister, CorrespondenceArchive,
 * and any future exporter) MUST route through these helpers so that every
 * exported file applies identical escaping and formula-neutralization rules
 * (Req 14.3) and never leaks a blob URL (Req 28).
 */

import logger from './logger';

/** Leading characters a spreadsheet may interpret as the start of a formula. */
const FORMULA_TRIGGERS = ['=', '+', '-', '@'] as const;

/** Row separator used when serializing (RFC 4180 CRLF). */
const ROW_SEPARATOR = '\r\n';

/**
 * Neutralizes a single cell's text so it cannot be interpreted as a formula
 * and so embedded double-quotes survive CSV quoting:
 *  - If the first character is `=`, `+`, `-`, or `@`, prefix a single-quote
 *    so spreadsheet software treats the cell as literal text (Req 14.2, 14.5).
 *  - Double every embedded double-quote character (Req 14.1).
 *
 * The single-quote prefix is applied before quote-doubling; the order does not
 * affect quote-doubling because `'` is not a double-quote.
 */
export function neutralizeCell(value: string): string {
  let v = value;
  const first = v.charAt(0); // '' for empty input, always a string
  if ((FORMULA_TRIGGERS as readonly string[]).includes(first)) {
    v = `'${v}`; // Req 14.2, 14.5
  }
  return v.replace(/"/g, '""'); // Req 14.1
}

/**
 * Converts any value into a fully-quoted, neutralized CSV field. `null` and
 * `undefined` serialize to an empty quoted field.
 */
export function toCsvField(value: unknown): string {
  return `"${neutralizeCell(String(value ?? ''))}"`;
}

/**
 * Builds a complete CSV document from a header row and data rows, applying the
 * identical escaping/neutralization rules to every cell (Req 14.3). Rows are
 * separated with CRLF; the document has no trailing separator.
 */
export function buildCsv(headers: string[], rows: unknown[][]): string {
  const headerLine = headers.map(toCsvField).join(',');
  const dataLines = rows.map((row) => row.map(toCsvField).join(','));
  return [headerLine, ...dataLines].join(ROW_SEPARATOR);
}

/**
 * Triggers a browser download of `csv` under `filename`. A UTF-8 BOM is
 * prepended so spreadsheet software detects the encoding correctly.
 *
 * The blob URL is always revoked via `URL.revokeObjectURL` in a `finally`
 * block so no un-revoked export blob URL is ever left behind, even if the
 * anchor click throws (Req 28.1, 28.2).
 */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } catch (err) {
    logger.warn('downloadCsv: failed to trigger download', err);
  } finally {
    URL.revokeObjectURL(url); // Req 28.1, 28.2
  }
}

/**
 * Test-only RFC 4180 CSV parser supporting the round-trip property (Req 14.4).
 *
 * Parses a CSV document produced by {@link buildCsv} back into a matrix of
 * field strings, un-doubling embedded quotes and honoring quoted fields that
 * contain commas, quotes, or newlines. Quoted and unquoted fields are both
 * accepted. The returned values still include any single-quote neutralizing
 * prefix added by {@link neutralizeCell}; callers verifying the round-trip
 * strip that prefix themselves.
 *
 * Not intended for production parsing of arbitrary third-party CSV.
 */
export function parseCsv(csv: string): string[][] {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  let i = 0;

  while (i < csv.length) {
    const char = csv[i];

    if (inQuotes) {
      if (char === '"') {
        if (csv[i + 1] === '"') {
          field += '"'; // escaped quote
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += char;
      i += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }

    if (char === ',') {
      row.push(field);
      field = '';
      i += 1;
      continue;
    }

    if (char === '\r') {
      // Treat CRLF and lone CR as a single row break.
      row.push(field);
      rows.push(row);
      field = '';
      row = [];
      i += csv[i + 1] === '\n' ? 2 : 1;
      continue;
    }

    if (char === '\n') {
      row.push(field);
      rows.push(row);
      field = '';
      row = [];
      i += 1;
      continue;
    }

    field += char;
    i += 1;
  }

  // Flush the final field/row (no trailing separator is emitted by buildCsv).
  row.push(field);
  rows.push(row);
  return rows;
}
