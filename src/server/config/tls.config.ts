/**
 * TLS certificate path configuration for inter-service communication.
 * Supports PostgreSQL, MinIO, and Redis TLS connections.
 */

export interface TLSServicePaths {
  caPath?: string;
  certPath?: string;
  keyPath?: string;
}

export interface TLSConfig {
  /** Whether TLS is enforced (auto-enabled in production) */
  enabled: boolean;
  /** PostgreSQL TLS certificate paths */
  postgres: TLSServicePaths;
  /** MinIO TLS certificate paths */
  minio: TLSServicePaths;
  /** Redis TLS certificate paths */
  redis: TLSServicePaths;
  /** Reject connections with unauthorized certificates */
  rejectUnauthorized: boolean;
  /** Interval in milliseconds to check for certificate file changes (default: 30000) */
  watchIntervalMs: number;
  /** Days before expiry to log a warning (default: 30) */
  expiryWarningDays: number;
  /** Days before expiry to log a critical alert (default: 7) */
  expiryCriticalDays: number;
}

export function getTLSConfig(): TLSConfig {
  const isProduction = process.env.NODE_ENV === 'production';

  return {
    enabled: isProduction || process.env.TLS_ENABLED === 'true',
    postgres: {
      caPath: process.env.TLS_POSTGRES_CA_PATH || undefined,
      certPath: process.env.TLS_POSTGRES_CERT_PATH || undefined,
      keyPath: process.env.TLS_POSTGRES_KEY_PATH || undefined,
    },
    minio: {
      caPath: process.env.TLS_MINIO_CA_PATH || undefined,
      certPath: process.env.TLS_MINIO_CERT_PATH || undefined,
      keyPath: process.env.TLS_MINIO_KEY_PATH || undefined,
    },
    redis: {
      caPath: process.env.TLS_REDIS_CA_PATH || undefined,
      certPath: process.env.TLS_REDIS_CERT_PATH || undefined,
      keyPath: process.env.TLS_REDIS_KEY_PATH || undefined,
    },
    rejectUnauthorized: process.env.TLS_REJECT_UNAUTHORIZED !== 'false',
    watchIntervalMs: parseInt(process.env.TLS_WATCH_INTERVAL_MS || '30000', 10),
    expiryWarningDays: parseInt(process.env.TLS_EXPIRY_WARNING_DAYS || '30', 10),
    expiryCriticalDays: parseInt(process.env.TLS_EXPIRY_CRITICAL_DAYS || '7', 10),
  };
}
