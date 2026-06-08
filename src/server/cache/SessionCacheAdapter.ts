import Redis from 'ioredis';

/**
 * SessionCacheAdapter interface for session/permission caching.
 * Supports both Redis (multi-instance) and in-memory (single-instance/dev) backends.
 */
export interface SessionCacheAdapter {
  get(key: string): Promise<{ data: unknown; expires: number } | undefined>;
  set(key: string, value: { data: unknown; expires: number }): Promise<void>;
  delete(key: string): Promise<void>;
  clear(pattern?: string): Promise<void>;
  keys(): Promise<string[]>;
}

/**
 * In-memory session cache using a Map.
 * Used as fallback when REDIS_URL is not defined (single-instance/dev mode).
 */
export class InMemorySessionCache implements SessionCacheAdapter {
  private cache = new Map<string, { data: unknown; expires: number }>();
  private maxSize: number;

  constructor(maxSize = 1000) {
    this.maxSize = maxSize;
  }

  async get(key: string): Promise<{ data: unknown; expires: number } | undefined> {
    const cached = this.cache.get(key);
    if (cached && cached.expires > Date.now()) return cached;
    if (cached) this.cache.delete(key);
    return undefined;
  }

  async set(key: string, value: { data: unknown; expires: number }): Promise<void> {
    // Evict expired entries and enforce max size
    if (this.cache.size >= this.maxSize) {
      const now = Date.now();
      for (const [k, v] of this.cache) {
        if (v.expires < now) this.cache.delete(k);
      }
      // If still too large, clear oldest 20%
      if (this.cache.size >= this.maxSize) {
        const entries = [...this.cache.entries()].sort((a, b) => a[1].expires - b[1].expires);
        const toRemove = Math.ceil(entries.length * 0.2);
        for (let i = 0; i < toRemove; i++) {
          this.cache.delete(entries[i][0]);
        }
      }
    }
    this.cache.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.cache.delete(key);
  }

  async clear(pattern?: string): Promise<void> {
    if (!pattern) {
      this.cache.clear();
      return;
    }
    for (const key of this.cache.keys()) {
      if (key.startsWith(pattern)) {
        this.cache.delete(key);
      }
    }
  }

  async keys(): Promise<string[]> {
    return [...this.cache.keys()];
  }
}

/**
 * Redis-backed session cache for multi-instance deployments.
 * Shares session state across all instances via Redis on port 6379.
 * TTL is managed server-side by Redis PEXPIRE.
 */
export class RedisSessionCache implements SessionCacheAdapter {
  private redis: Redis;
  private prefix: string;

  constructor(redisUrl: string, prefix = 'session_cache:') {
    this.redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy(times: number) {
        if (times > 3) return null;
        return Math.min(times * 200, 2000);
      },
      lazyConnect: true,
    });
    this.prefix = prefix;

    this.redis.on('error', (err: Error) => {
      // Log but don't crash — callers handle fallback
      if (process.env.NODE_ENV !== 'test') {
        console.error('[RedisSessionCache] Redis connection error:', err.message);
      }
    });
  }

  private prefixedKey(key: string): string {
    return `${this.prefix}${key}`;
  }

  async get(key: string): Promise<{ data: unknown; expires: number } | undefined> {
    try {
      const raw = await this.redis.get(this.prefixedKey(key));
      if (!raw) return undefined;
      const parsed = JSON.parse(raw) as { data: unknown; expires: number };
      if (parsed.expires <= Date.now()) {
        await this.redis.del(this.prefixedKey(key));
        return undefined;
      }
      return parsed;
    } catch {
      return undefined;
    }
  }

  async set(key: string, value: { data: unknown; expires: number }): Promise<void> {
    try {
      const ttlMs = value.expires - Date.now();
      if (ttlMs <= 0) return;
      await this.redis.set(
        this.prefixedKey(key),
        JSON.stringify(value),
        'PX',
        ttlMs
      );
    } catch {
      // Silently fail — cache is best-effort
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.redis.del(this.prefixedKey(key));
    } catch {
      // Silently fail
    }
  }

  async clear(pattern?: string): Promise<void> {
    try {
      if (!pattern) {
        // Clear all keys with our prefix
        const keys = await this.redis.keys(`${this.prefix}*`);
        if (keys.length > 0) {
          await this.redis.del(...keys);
        }
        return;
      }
      // Clear keys matching prefix + pattern
      const keys = await this.redis.keys(`${this.prefix}${pattern}*`);
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    } catch {
      // Silently fail
    }
  }

  async keys(): Promise<string[]> {
    try {
      const keys = await this.redis.keys(`${this.prefix}*`);
      return keys.map(k => k.slice(this.prefix.length));
    } catch {
      return [];
    }
  }

  async connect(): Promise<void> {
    await this.redis.connect();
  }

  async disconnect(): Promise<void> {
    await this.redis.disconnect();
  }
}

/**
 * Factory: creates the appropriate cache adapter based on environment.
 * Uses Redis when REDIS_URL is defined, in-memory otherwise.
 */
export function createSessionCache(): SessionCacheAdapter {
  const redisUrl = process.env.REDIS_URL;
  if (redisUrl) {
    const redisCache = new RedisSessionCache(redisUrl);
    // Attempt connection — non-blocking
    redisCache.connect().catch((err: Error) => {
      console.error('[SessionCache] Failed to connect to Redis, operations will fail gracefully:', err.message);
    });
    return redisCache;
  }
  return new InMemorySessionCache();
}
