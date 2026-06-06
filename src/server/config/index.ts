/**
 * Central configuration module for infrastructure services.
 * Re-exports typed configuration getters for MinIO, Redis, TLS, and Queue.
 */

export { getStorageConfig, type StorageConfig } from './storage.config.js';
export { getRedisConfig, type RedisConfig } from './redis.config.js';
export { getTLSConfig, type TLSConfig, type TLSServicePaths } from './tls.config.js';
export { getQueueConfig, type QueueConfig } from './queue.config.js';
