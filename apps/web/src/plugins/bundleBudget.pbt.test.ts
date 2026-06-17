/**
 * Property-based test for the bundle budget check logic.
 *
 * Property 15: Bundle budget check rejects overage
 * The checkBudget function must return exceeded === true when any single chunk's
 * gzipSize exceeds 150 KB (153600 bytes) OR when the sum of initial chunks'
 * gzipSize exceeds 250 KB (256000 bytes). Conversely, when all chunks are within
 * budget, exceeded must be false.
 *
 * **Validates: Requirements 6.3**
 *
 * Feature: app-rebuild, Property 15
 *
 * Strategy: Use fast-check to generate arrays of ChunkInfo with arbitrary
 * gzipSize values and isInitial flags. Assert the three budget invariants:
 * 1. Any chunk gzipSize > 150 KB ⟹ exceeded === true
 * 2. Sum of initial chunks' gzipSize > 250 KB ⟹ exceeded === true
 * 3. All chunks ≤ 150 KB AND initial total ≤ 250 KB ⟹ exceeded === false
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { checkBudget, type ChunkInfo } from './bundleBudget';

const MAX_CHUNK_GZIP = 153600; // 150 KB
const MAX_INITIAL_GZIP = 256000; // 250 KB

const DEFAULT_CONFIG = {
  maxChunkGzip: MAX_CHUNK_GZIP,
  maxInitialGzip: MAX_INITIAL_GZIP,
};

/**
 * Arbitrary generator for a single ChunkInfo object.
 * gzipSize is the key property; other fields are realistic but secondary.
 */
function arbChunkInfo(opts?: { gzipRange?: [number, number]; isInitial?: boolean }): fc.Arbitrary<ChunkInfo> {
  const gzipMin = opts?.gzipRange?.[0] ?? 0;
  const gzipMax = opts?.gzipRange?.[1] ?? 500000; // up to ~488 KB

  return fc.record({
    name: fc.string({ minLength: 1, maxLength: 20 }),
    fileName: fc.string({ minLength: 1, maxLength: 30 }),
    rawSize: fc.nat({ max: 1000000 }),
    gzipSize: fc.integer({ min: gzipMin, max: gzipMax }),
    brotliSize: fc.nat({ max: 1000000 }),
    isInitial: opts?.isInitial !== undefined ? fc.constant(opts.isInitial) : fc.boolean(),
    modules: fc.array(fc.string({ minLength: 1, maxLength: 15 }), { maxLength: 5 }),
  });
}

describe('Property 15: Bundle budget check rejects overage', () => {
  it('returns exceeded === true when any chunk gzipSize > 150 KB', () => {
    fc.assert(
      fc.property(
        // Generate at least one chunk that exceeds the limit
        fc.array(arbChunkInfo({ gzipRange: [0, MAX_CHUNK_GZIP] }), { maxLength: 10 }),
        arbChunkInfo({ gzipRange: [MAX_CHUNK_GZIP + 1, 500000] }),
        fc.array(arbChunkInfo({ gzipRange: [0, MAX_CHUNK_GZIP] }), { maxLength: 10 }),
        (before, oversizedChunk, after) => {
          const chunks = [...before, oversizedChunk, ...after];
          const result = checkBudget(chunks, DEFAULT_CONFIG);
          expect(result.exceeded).toBe(true);
          expect(result.chunkViolations.length).toBeGreaterThanOrEqual(1);
        }
      ),
      { numRuns: 200 }
    );
  });

  it('returns exceeded === true when initial chunks total gzipSize > 250 KB', () => {
    fc.assert(
      fc.property(
        // Generate initial chunks whose total exceeds the initial budget
        fc.array(
          arbChunkInfo({ gzipRange: [1, MAX_CHUNK_GZIP], isInitial: true }),
          { minLength: 2, maxLength: 10 }
        ).filter((chunks) => {
          const total = chunks.reduce((sum, c) => sum + c.gzipSize, 0);
          return total > MAX_INITIAL_GZIP;
        }),
        (initialChunks) => {
          const result = checkBudget(initialChunks, DEFAULT_CONFIG);
          expect(result.exceeded).toBe(true);
          expect(result.initialPayloadViolation).not.toBeNull();
          expect(result.initialPayloadViolation!.totalGzipSize).toBeGreaterThan(MAX_INITIAL_GZIP);
        }
      ),
      { numRuns: 200 }
    );
  });

  it('returns exceeded === false when all chunks ≤ 150 KB AND initial total ≤ 250 KB', () => {
    fc.assert(
      fc.property(
        fc.array(arbChunkInfo({ gzipRange: [0, MAX_CHUNK_GZIP] }), { minLength: 0, maxLength: 10 })
          .filter((chunks) => {
            const initialTotal = chunks
              .filter((c) => c.isInitial)
              .reduce((sum, c) => sum + c.gzipSize, 0);
            return initialTotal <= MAX_INITIAL_GZIP;
          }),
        (chunks) => {
          const result = checkBudget(chunks, DEFAULT_CONFIG);
          expect(result.exceeded).toBe(false);
          expect(result.chunkViolations).toHaveLength(0);
          expect(result.initialPayloadViolation).toBeNull();
        }
      ),
      { numRuns: 200 }
    );
  });
});
