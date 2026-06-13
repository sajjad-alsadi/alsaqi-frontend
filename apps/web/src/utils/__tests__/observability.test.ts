/**
 * Unit tests for the observability verification surface (Component 6).
 *
 * Covers the three contract predicates with concrete examples and edge cases:
 *  - `shouldInitSentry`        — PROD && DSN truth table.                 (Req 6.3, 6.7)
 *  - `correlationIdPropagates` — id reaches log entry + Sentry scope.     (Req 6.1, 6.6)
 *  - `noSourceMapsInDist`      — clean / dirty / nested / missing dist.   (Req 6.2)
 *
 * Requirements: 6.1, 6.6
 */

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  shouldInitSentry,
  correlationIdPropagates,
  noSourceMapsInDist,
  buildCorrelatedLogEntry,
  buildCorrelationSentryScope,
  CORRELATION_ID_TAG,
  CORRELATION_ID_CONTEXT,
} from '@/utils/observability';

// ─── shouldInitSentry ─────────────────────────────────────────────────────────

describe('shouldInitSentry', () => {
  it('returns true only in production with a non-empty DSN', () => {
    expect(shouldInitSentry({ PROD: true, dsn: 'https://key@o0.ingest.sentry.io/0' })).toBe(true);
  });

  it('returns false in production with a missing or empty DSN', () => {
    expect(shouldInitSentry({ PROD: true, dsn: '' })).toBe(false);
    expect(shouldInitSentry({ PROD: true })).toBe(false);
  });

  it('returns false outside production even when a DSN is present', () => {
    expect(shouldInitSentry({ PROD: false, dsn: 'https://key@o0.ingest.sentry.io/0' })).toBe(false);
  });
});

// ─── correlationIdPropagates ────────────────────────────────────────────────────

describe('correlationIdPropagates', () => {
  it('propagates a non-empty correlation id to the log entry and Sentry scope', () => {
    const id = '550e8400-e29b-41d4-a716-446655440000';
    expect(correlationIdPropagates(id)).toBe(true);

    const entry = buildCorrelatedLogEntry(id);
    expect(entry.correlationId).toBe(id);

    const scope = buildCorrelationSentryScope(id);
    expect(scope.tags[CORRELATION_ID_TAG]).toBe(id);
    expect(scope.contexts[CORRELATION_ID_CONTEXT]?.correlationId).toBe(id);
  });

  it('preserves the id byte-for-byte (no trimming or normalization)', () => {
    const id = '  weird-ID_with.SYMBOLS-123  ';
    const entry = buildCorrelatedLogEntry(id);
    const scope = buildCorrelationSentryScope(id);
    expect(entry.correlationId).toBe(id);
    expect(scope.tags[CORRELATION_ID_TAG]).toBe(id);
    expect(correlationIdPropagates(id)).toBe(true);
  });

  it('returns false for an empty correlation id (nothing to propagate)', () => {
    expect(correlationIdPropagates('')).toBe(false);
  });
});

// ─── noSourceMapsInDist ─────────────────────────────────────────────────────────

describe('noSourceMapsInDist', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
  });

  async function makeDist(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), 'obs-dist-'));
    tempDirs.push(dir);
    return dir;
  }

  it('returns true when dist/ ships no .map files', async () => {
    const dist = await makeDist();
    await writeFile(join(dist, 'index.js'), '//build');
    await writeFile(join(dist, 'index.css'), 'body{}');
    await expect(noSourceMapsInDist(dist)).resolves.toBe(true);
  });

  it('returns false when a .map file is present at the top level', async () => {
    const dist = await makeDist();
    await writeFile(join(dist, 'index.js'), '//build');
    await writeFile(join(dist, 'index.js.map'), '{}');
    await expect(noSourceMapsInDist(dist)).resolves.toBe(false);
  });

  it('returns false when a .map file is nested in a subdirectory', async () => {
    const dist = await makeDist();
    const assets = join(dist, 'assets');
    await mkdir(assets);
    await writeFile(join(assets, 'vendor.js'), '//build');
    await writeFile(join(assets, 'vendor.js.map'), '{}');
    await expect(noSourceMapsInDist(dist)).resolves.toBe(false);
  });

  it('throws when the dist directory does not exist', async () => {
    await expect(noSourceMapsInDist(join(tmpdir(), 'obs-dist-does-not-exist-xyz'))).rejects.toThrow();
  });
});
