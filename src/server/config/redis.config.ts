/**
 * Redis configuration for BullMQ queue connections.
 * Reads from environment variables with sensible development defaults.
 */

export interface RedisConfig {
  host: string;
  port: number;
  password: string | undefined;
  /** Database index (0-15) */
  db: number;
  /** Whether to use TLS for Redis connections */
  useTLS: boolean;
  /** Maximum number of reconnection attempts before giving up */
  maxRetriesPerRequest: number | null;
  /** Connection timeout in milliseconds */
  connectTimeoutMs: number;
  /** Enables ready check on connection */
  enableReadyCheck: boolean;
}

export function getRedisConfig(): RedisConfig {
  return {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB || '0', 10),
    useTLS: process.env.REDIS_USE_TLS === 'true',
    maxRetriesPerRequest: null, // Required by BullMQ
    connectTimeoutMs: parseInt(process.env.REDIS_CONNECT_TIMEOUT_MS || '5000', 10),
    enableReadyCheck: true,
  };
}
