// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { checkBudget, bundleBudgetPlugin } from './bundleBudget';
import type { ChunkInfo, BudgetCheckResult } from './bundleBudget';

describe('bundleBudgetPlugin', () => {
  it('returns a plugin with name "bundle-budget"', () => {
    const plugin = bundleBudgetPlugin({
      maxChunkGzip: 153600,
      maxInitialGzip: 256000,
      initialChunks: ['vendor-react', 'vendor-ui'],
      failOnOverage: false,
    });
    expect(plugin.name).toBe('bundle-budget');
  });

  it('applies only to build mode', () => {
    const plugin = bundleBudgetPlugin({
      maxChunkGzip: 153600,
      maxInitialGzip: 256000,
      initialChunks: [],
      failOnOverage: false,
    });
    expect(plugin.apply).toBe('build');
  });
});

describe('checkBudget', () => {
  const defaultConfig = {
    maxChunkGzip: 153600, // 150 KB
    maxInitialGzip: 256000, // 250 KB
  };

  function makeChunk(overrides: Partial<ChunkInfo> = {}): ChunkInfo {
    return {
      name: 'test-chunk',
      fileName: 'test-chunk.abc123.js',
      rawSize: 100000,
      gzipSize: 50000,
      brotliSize: 45000,
      isInitial: false,
      modules: [],
      ...overrides,
    };
  }

  describe('individual chunk budget', () => {
    it('passes when all chunks are under the limit', () => {
      const chunks: ChunkInfo[] = [
        makeChunk({ name: 'vendor-react', gzipSize: 100000 }),
        makeChunk({ name: 'vendor-ui', gzipSize: 80000 }),
      ];

      const result = checkBudget(chunks, defaultConfig);

      expect(result.exceeded).toBe(false);
      expect(result.chunkViolations).toHaveLength(0);
      expect(result.initialPayloadViolation).toBeNull();
    });

    it('fails when a single chunk exceeds 150 KB gzip', () => {
      const chunks: ChunkInfo[] = [
        makeChunk({ name: 'vendor-react', gzipSize: 160000 }), // Over 153600
        makeChunk({ name: 'vendor-ui', gzipSize: 80000 }),
      ];

      const result = checkBudget(chunks, defaultConfig);

      expect(result.exceeded).toBe(true);
      expect(result.chunkViolations).toHaveLength(1);
      expect(result.chunkViolations[0]).toEqual({
        name: 'vendor-react',
        gzipSize: 160000,
        limit: 153600,
      });
    });

    it('reports multiple chunk violations', () => {
      const chunks: ChunkInfo[] = [
        makeChunk({ name: 'vendor-react', gzipSize: 160000 }),
        makeChunk({ name: 'vendor-charts', gzipSize: 200000 }),
      ];

      const result = checkBudget(chunks, defaultConfig);

      expect(result.exceeded).toBe(true);
      expect(result.chunkViolations).toHaveLength(2);
    });

    it('passes when chunk is exactly at the limit', () => {
      const chunks: ChunkInfo[] = [makeChunk({ name: 'vendor-react', gzipSize: 153600 })];

      const result = checkBudget(chunks, defaultConfig);

      expect(result.exceeded).toBe(false);
      expect(result.chunkViolations).toHaveLength(0);
    });

    it('fails when chunk is 1 byte over the limit', () => {
      const chunks: ChunkInfo[] = [makeChunk({ name: 'vendor-react', gzipSize: 153601 })];

      const result = checkBudget(chunks, defaultConfig);

      expect(result.exceeded).toBe(true);
      expect(result.chunkViolations).toHaveLength(1);
    });
  });

  describe('initial payload budget', () => {
    it('passes when initial payload total is under 250 KB gzip', () => {
      const chunks: ChunkInfo[] = [
        makeChunk({ name: 'vendor-react', gzipSize: 100000, isInitial: true }),
        makeChunk({ name: 'vendor-ui', gzipSize: 80000, isInitial: true }),
        makeChunk({ name: 'vendor-charts', gzipSize: 120000, isInitial: false }),
      ];

      const result = checkBudget(chunks, defaultConfig);

      expect(result.exceeded).toBe(false);
      expect(result.initialPayloadViolation).toBeNull();
    });

    it('fails when initial payload exceeds 250 KB gzip', () => {
      const chunks: ChunkInfo[] = [
        makeChunk({ name: 'vendor-react', gzipSize: 130000, isInitial: true }),
        makeChunk({ name: 'vendor-ui', gzipSize: 130000, isInitial: true }),
      ];

      const result = checkBudget(chunks, defaultConfig);

      expect(result.exceeded).toBe(true);
      expect(result.initialPayloadViolation).toEqual({
        totalGzipSize: 260000,
        limit: 256000,
      });
    });

    it('only considers chunks marked as isInitial', () => {
      const chunks: ChunkInfo[] = [
        makeChunk({ name: 'vendor-react', gzipSize: 130000, isInitial: true }),
        makeChunk({ name: 'vendor-charts', gzipSize: 150000, isInitial: false }),
      ];

      const result = checkBudget(chunks, defaultConfig);

      // 130000 < 256000 so no violation
      expect(result.initialPayloadViolation).toBeNull();
    });

    it('passes when initial payload is exactly at the limit', () => {
      const chunks: ChunkInfo[] = [
        makeChunk({ name: 'vendor-react', gzipSize: 128000, isInitial: true }),
        makeChunk({ name: 'vendor-ui', gzipSize: 128000, isInitial: true }),
      ];

      const result = checkBudget(chunks, defaultConfig);

      expect(result.exceeded).toBe(false);
      expect(result.initialPayloadViolation).toBeNull();
    });

    it('fails when initial payload is 1 byte over the limit', () => {
      const chunks: ChunkInfo[] = [
        makeChunk({ name: 'vendor-react', gzipSize: 128001, isInitial: true }),
        makeChunk({ name: 'vendor-ui', gzipSize: 128000, isInitial: true }),
      ];

      const result = checkBudget(chunks, defaultConfig);

      expect(result.exceeded).toBe(true);
      expect(result.initialPayloadViolation).toEqual({
        totalGzipSize: 256001,
        limit: 256000,
      });
    });
  });

  describe('combined violations', () => {
    it('reports both chunk and initial payload violations', () => {
      const chunks: ChunkInfo[] = [
        makeChunk({ name: 'vendor-react', gzipSize: 160000, isInitial: true }),
        makeChunk({ name: 'vendor-ui', gzipSize: 100000, isInitial: true }),
      ];

      const result = checkBudget(chunks, defaultConfig);

      expect(result.exceeded).toBe(true);
      expect(result.chunkViolations).toHaveLength(1);
      expect(result.chunkViolations[0].name).toBe('vendor-react');
      expect(result.initialPayloadViolation).not.toBeNull();
      expect(result.initialPayloadViolation!.totalGzipSize).toBe(260000);
    });
  });

  describe('edge cases', () => {
    it('handles empty chunk list without errors', () => {
      const result = checkBudget([], defaultConfig);

      expect(result.exceeded).toBe(false);
      expect(result.chunkViolations).toHaveLength(0);
      expect(result.initialPayloadViolation).toBeNull();
    });

    it('handles zero-size chunks', () => {
      const chunks: ChunkInfo[] = [
        makeChunk({ name: 'empty', gzipSize: 0, isInitial: true }),
      ];

      const result = checkBudget(chunks, defaultConfig);

      expect(result.exceeded).toBe(false);
    });

    it('works with custom thresholds', () => {
      const customConfig = {
        maxChunkGzip: 50000,
        maxInitialGzip: 100000,
      };

      const chunks: ChunkInfo[] = [
        makeChunk({ name: 'vendor-react', gzipSize: 60000, isInitial: true }),
      ];

      const result = checkBudget(chunks, customConfig);

      expect(result.exceeded).toBe(true);
      expect(result.chunkViolations).toHaveLength(1);
      expect(result.chunkViolations[0].limit).toBe(50000);
    });
  });
});
