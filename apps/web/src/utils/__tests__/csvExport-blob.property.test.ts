/**
 * Property-based tests for blob URL revocation in the shared CSV exporter.
 *
 * Property 23: No leaked export blob URLs
 *   For any number and content of completed export operations, the number of
 *   `URL.revokeObjectURL` calls equals the number of `URL.createObjectURL`
 *   calls, and every URL returned by `createObjectURL` is passed to
 *   `revokeObjectURL` (no un-revoked export blob URL remains) — even when the
 *   anchor click throws.
 *   **Validates: Requirements 28.1, 28.2**
 *
 * Feature: frontend-audit-remediation, Property 23: No leaked export blob URLs
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fc from 'fast-check';
import { downloadCsv } from '../csvExport';

// Silence the warning logged when a (deliberately) failing click is exercised.
vi.mock('../logger', () => ({
  default: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

// ─── Generators ─────────────────────────────────────────────────────────────

/** A single export operation: a filename, csv body, and whether its click throws. */
const arbExportOp = fc.record({
  filename: fc.string({ minLength: 1, maxLength: 40 }),
  csv: fc.string({ maxLength: 200 }),
  // Some operations simulate the anchor click failing, exercising the
  // `finally` block that must still revoke the URL.
  clickThrows: fc.boolean(),
});

/** A batch of one-or-more export operations performed in sequence. */
const arbExportBatch = fc.array(arbExportOp, { minLength: 1, maxLength: 25 });

// ─── Property ───────────────────────────────────────────────────────────────

describe('csvExport blob URL revocation (Property 23)', () => {
  let createdUrls: string[];
  let revokedUrls: string[];
  let createSpy: ReturnType<typeof vi.spyOn>;
  let revokeSpy: ReturnType<typeof vi.spyOn>;
  let clickSpy: ReturnType<typeof vi.spyOn>;
  let nextClickThrows = false;

  beforeEach(() => {
    createdUrls = [];
    revokedUrls = [];
    let counter = 0;

    // Unique URL per call so we can verify each created URL is revoked.
    createSpy = vi.spyOn(URL, 'createObjectURL').mockImplementation(() => {
      const url = `blob:http://localhost/export-${counter++}`;
      createdUrls.push(url);
      return url;
    });
    revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation((url: string) => {
      revokedUrls.push(url);
    });
    // Resolve the anchor prototype from an instance to avoid relying on the
    // HTMLAnchorElement global name being present on the test global scope.
    const anchorProto = Object.getPrototypeOf(document.createElement('a'));
    clickSpy = vi.spyOn(anchorProto, 'click').mockImplementation(function () {
      if (nextClickThrows) throw new Error('simulated click failure');
    });
  });

  afterEach(() => {
    createSpy.mockRestore();
    revokeSpy.mockRestore();
    clickSpy.mockRestore();
  });

  it('revokes every export blob URL it creates (no leaks)', () => {
    fc.assert(
      fc.property(arbExportBatch, (ops) => {
        createdUrls.length = 0;
        revokedUrls.length = 0;

        for (const op of ops) {
          nextClickThrows = op.clickThrows;
          // downloadCsv swallows click errors internally, so this never throws.
          downloadCsv(op.filename, op.csv);
        }
        nextClickThrows = false;

        // One create + one revoke per operation.
        expect(createdUrls.length).toBe(ops.length);
        expect(revokedUrls.length).toBe(createdUrls.length);

        // Every created URL was revoked exactly once — no un-revoked URL remains.
        expect([...revokedUrls].sort()).toEqual([...createdUrls].sort());
      }),
      { numRuns: 100 }
    );
  });
});
