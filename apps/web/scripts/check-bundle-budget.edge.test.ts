/**
 * Unit tests for the bundle-size budget check edge cases (Stream 4, task 4.3).
 *
 * Exercises the real exported helpers from `check-bundle-budget.mjs`
 * (`checkBundleBudget`, `findChunkFiles`, `gzipSizeKb`) against synthesized
 * temporary `dist/` directories — real gzip-able `assets/<chunk>-<hash>.js`
 * files, no mocks — covering the edge cases the design calls out:
 *
 *   - a budgeted group whose output file cannot be resolved in `dist/`     (Req 4.6)
 *   - an empty `dist/` (every budgeted group unresolved)                   (Req 4.6)
 *   - the exactly-at-ceiling boundary (measured === ceiling is in budget)
 *   - prefix-collision safety in chunk resolution (vendor-pdf vs vendor-pdfviewer)
 *
 * Requirements: 4.6
 */
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// @ts-expect-error - plain ESM JS module without type declarations
import { checkBundleBudget, findChunkFiles, gzipSizeKb } from './check-bundle-budget.mjs';

type Budget = { chunk: string; eager: boolean; maxGzipKb: number };

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

/** Create an isolated temp dist directory. */
function makeDist(): string {
  const dir = mkdtempSync(join(tmpdir(), 'bundle-budget-edge-'));
  tempDirs.push(dir);
  return dir;
}

/** Write a synthetic emitted chunk file and return its genuine gzip size (KB). */
function writeChunk(distDir: string, chunk: string, bytes: number): number {
  const assetsDir = join(distDir, 'assets');
  mkdirSync(assetsDir, { recursive: true });
  const content = Buffer.alloc(bytes).map((_, i) => (i * 31 + 7) & 0xff);
  writeFileSync(join(assetsDir, `${chunk}-abcd1234.js`), content);
  return gzipSizeKb(findChunkFiles(distDir, chunk));
}

describe('check-bundle-budget edge cases (Req 4.6)', () => {
  it('reports a budgeted group whose output file cannot be resolved in dist/', () => {
    const dist = makeDist();
    // Only vendor-charts is emitted; vendor-pdf is budgeted but missing.
    const measured = writeChunk(dist, 'vendor-charts', 4096);
    const budgets: Budget[] = [
      { chunk: 'vendor-charts', eager: false, maxGzipKb: measured + 10 },
      { chunk: 'vendor-pdf', eager: false, maxGzipKb: 100 },
    ];

    const result = checkBundleBudget(dist, budgets);

    expect(result.pass).toBe(false);
    expect(result.unresolved.map((u: { chunk: string }) => u.chunk)).toEqual(['vendor-pdf']);
    // The resolvable sibling is still measured and within budget.
    expect(result.measured.map((m: { chunk: string }) => m.chunk)).toEqual(['vendor-charts']);
    expect(result.violations).toEqual([]);
  });

  it('treats an empty dist/ as every budgeted group unresolved', () => {
    const dist = makeDist(); // no assets written
    const budgets: Budget[] = [
      { chunk: 'vendor-react', eager: true, maxGzipKb: 185 },
      { chunk: 'vendor-charts', eager: false, maxGzipKb: 185 },
    ];

    const result = checkBundleBudget(dist, budgets);

    expect(result.pass).toBe(false);
    expect(result.unresolved.map((u: { chunk: string }) => u.chunk).sort()).toEqual([
      'vendor-charts',
      'vendor-react',
    ]);
    expect(result.measured).toEqual([]);
  });

  it('passes at the exactly-at-ceiling boundary (measured === ceiling)', () => {
    const dist = makeDist();
    const measured = writeChunk(dist, 'vendor-pdf', 2048);
    const result = checkBundleBudget(dist, [
      { chunk: 'vendor-pdf', eager: false, maxGzipKb: measured },
    ]);

    expect(result.pass).toBe(true);
    expect(result.violations).toEqual([]);
    expect(result.unresolved).toEqual([]);
  });

  it('flags a group fractionally over its ceiling as a violation', () => {
    const dist = makeDist();
    const measured = writeChunk(dist, 'vendor-excel', 8192);
    const result = checkBundleBudget(dist, [
      { chunk: 'vendor-excel', eager: false, maxGzipKb: measured - 0.001 },
    ]);

    expect(result.pass).toBe(false);
    expect(result.violations.map((v: { chunk: string }) => v.chunk)).toEqual(['vendor-excel']);
  });

  it('findChunkFiles resolves exactly and avoids prefix collisions', () => {
    const dist = makeDist();
    writeChunk(dist, 'vendor-pdf', 1024);
    writeChunk(dist, 'vendor-pdfviewer', 1024);

    const pdf = findChunkFiles(dist, 'vendor-pdf');
    // vendor-pdf must NOT match the longer-named vendor-pdfviewer sibling.
    expect(pdf).toHaveLength(1);
    expect(pdf[0]).toMatch(/vendor-pdf-abcd1234\.js$/);
    expect(pdf[0]).not.toMatch(/vendor-pdfviewer/);

    // An un-emitted chunk resolves to nothing.
    expect(findChunkFiles(dist, 'vendor-missing')).toEqual([]);
  });

  it('returns an empty resolution when no assets directory exists', () => {
    const dist = makeDist();
    expect(findChunkFiles(dist, 'vendor-react')).toEqual([]);
  });
});
