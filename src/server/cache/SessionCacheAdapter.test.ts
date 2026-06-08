// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { InMemorySessionCache, createSessionCache } from './SessionCacheAdapter';

describe('InMemorySessionCache', () => {
  let cache: InMemorySessionCache;

  beforeEach(() => {
    cache = new InMemorySessionCache(100);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('set/get roundtrip', () => {
    it('stores and retrieves a value before expiry', async () => {
      const entry = { data: { id: 'u1', role: 'Admin' }, expires: Date.now() + 60_000 };
      await cache.set('user_u1_1', entry);
      const result = await cache.get('user_u1_1');
      expect(result).toEqual(entry);
    });

    it('returns undefined for a cache miss', async () => {
      const result = await cache.get('nonexistent_key');
      expect(result).toBeUndefined();
    });

    it('returns undefined for an expired entry and auto-evicts it', async () => {
      const entry = { data: { id: 'u1' }, expires: Date.now() + 1_000 };
      await cache.set('user_u1_1', entry);

      // Advance time past expiry
      vi.advanceTimersByTime(2_000);

      const result = await cache.get('user_u1_1');
      expect(result).toBeUndefined();
    });
  });

  describe('delete', () => {
    it('removes a specific key', async () => {
      await cache.set('user_u1_1', { data: 'x', expires: Date.now() + 60_000 });
      await cache.delete('user_u1_1');
      expect(await cache.get('user_u1_1')).toBeUndefined();
    });

    it('does not throw when key does not exist', async () => {
      await expect(cache.delete('missing')).resolves.toBeUndefined();
    });
  });

  describe('clear', () => {
    it('clears all keys when called without pattern', async () => {
      await cache.set('user_u1_1', { data: 'a', expires: Date.now() + 60_000 });
      await cache.set('perm_u1_mod', { data: 'b', expires: Date.now() + 60_000 });
      await cache.clear();
      expect(await cache.keys()).toEqual([]);
    });

    it('clears only keys matching the prefix pattern', async () => {
      await cache.set('user_u1_1', { data: 'a', expires: Date.now() + 60_000 });
      await cache.set('perm_u1_mod', { data: 'b', expires: Date.now() + 60_000 });
      await cache.clear('perm_');
      const keys = await cache.keys();
      expect(keys).toContain('user_u1_1');
      expect(keys).not.toContain('perm_u1_mod');
    });
  });

  describe('keys', () => {
    it('returns all current keys', async () => {
      await cache.set('user_u1_1', { data: 'a', expires: Date.now() + 60_000 });
      await cache.set('user_u2_1', { data: 'b', expires: Date.now() + 60_000 });
      const keys = await cache.keys();
      expect(keys).toContain('user_u1_1');
      expect(keys).toContain('user_u2_1');
    });
  });

  describe('max size eviction', () => {
    it('evicts entries when size reaches maxSize', async () => {
      const small = new InMemorySessionCache(3);
      for (let i = 0; i < 4; i++) {
        await small.set(`key_${i}`, { data: i, expires: Date.now() + 60_000 });
      }
      const keys = await small.keys();
      expect(keys.length).toBeLessThanOrEqual(3);
    });
  });
});

describe('createSessionCache', () => {
  const originalEnv = process.env.REDIS_URL;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.REDIS_URL;
    } else {
      process.env.REDIS_URL = originalEnv;
    }
  });

  it('returns InMemorySessionCache when REDIS_URL is not set', () => {
    delete process.env.REDIS_URL;
    const adapter = createSessionCache();
    expect(adapter).toBeInstanceOf(InMemorySessionCache);
  });

  it('returns a Redis-backed adapter when REDIS_URL is set', async () => {
    process.env.REDIS_URL = 'redis://localhost:6379';
    // Import dynamically to pick up env var
    const { RedisSessionCache } = await import('./SessionCacheAdapter');
    // createSessionCache is already imported — just verify it produces a non-InMemory instance
    const adapter = createSessionCache();
    expect(adapter).toBeInstanceOf(RedisSessionCache);
    // Disconnect to avoid hanging test connections
    await (adapter as InstanceType<typeof RedisSessionCache>).disconnect?.();
  });
});
