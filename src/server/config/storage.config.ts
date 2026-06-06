/**
 * MinIO/S3-compatible object storage configuration.
 * Reads from environment variables with sensible development defaults.
 */

export interface StorageConfig {
  endpoint: string;
  port: number;
  accessKey: string;
  secretKey: string;
  useSSL: boolean;
  region: string;
  buckets: {
    evidence: string;
    reports: string;
    temp: string;
    backups: string;
  };
  /** Maximum file size per bucket in bytes */
  maxFileSize: {
    evidence: number;
    reports: number;
  };
  /** Presigned URL expiry in seconds (default: 3600, min: 60, max: 86400) */
  presignedUrlExpiry: number;
  /** Upload timeout in milliseconds (default: 120000) */
  uploadTimeoutMs: number;
}

export function getStorageConfig(): StorageConfig {
  const presignedExpiry = parseInt(process.env.MINIO_PRESIGNED_EXPIRY || '3600', 10);

  return {
    endpoint: process.env.MINIO_ENDPOINT || 'localhost',
    port: parseInt(process.env.MINIO_PORT || '9000', 10),
    accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
    secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
    useSSL: process.env.MINIO_USE_SSL === 'true',
    region: process.env.MINIO_REGION || 'us-east-1',
    buckets: {
      evidence: process.env.MINIO_BUCKET_EVIDENCE || 'evidence',
      reports: process.env.MINIO_BUCKET_REPORTS || 'reports',
      temp: process.env.MINIO_BUCKET_TEMP || 'temp',
      backups: process.env.MINIO_BUCKET_BACKUPS || 'backups',
    },
    maxFileSize: {
      evidence: 50 * 1024 * 1024,  // 50MB
      reports: 100 * 1024 * 1024,  // 100MB
    },
    presignedUrlExpiry: Math.min(86400, Math.max(60, presignedExpiry)),
    uploadTimeoutMs: parseInt(process.env.MINIO_UPLOAD_TIMEOUT_MS || '120000', 10),
  };
}
