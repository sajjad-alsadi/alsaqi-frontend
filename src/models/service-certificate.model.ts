/**
 * ServiceCertificate configuration model.
 * Defines per-service TLS certificate paths and metadata for inter-service communication.
 *
 * Requirements: 7.1, 7.2
 */

/**
 * Supported service types that require TLS certificates.
 */
export type CertificateServiceType = 'postgresql' | 'minio' | 'redis' | 'api';

/**
 * Deployment environments for certificate configuration.
 */
export type CertificateEnvironment = 'development' | 'staging' | 'production';

/**
 * Configuration interface for per-service certificate paths and metadata.
 * Each service in the infrastructure can have its own CA, cert, and key paths
 * along with expiry and fingerprint metadata.
 */
export interface ServiceCertificate {
  /** The infrastructure service this certificate is for */
  service: CertificateServiceType;
  /** The deployment environment this certificate targets */
  environment: CertificateEnvironment;
  /** Absolute path to the Certificate Authority (CA) file */
  caPath?: string;
  /** Absolute path to the certificate file */
  certPath?: string;
  /** Absolute path to the private key file */
  keyPath?: string;
  /** Certificate expiration date */
  expiresAt?: Date;
  /** SHA-256 fingerprint of the certificate (64-character hex string) */
  fingerprint?: string;
}

/**
 * Valid service types for certificate configuration.
 */
export const VALID_SERVICE_TYPES: readonly CertificateServiceType[] = [
  'postgresql',
  'minio',
  'redis',
  'api',
] as const;

/**
 * Valid environment types for certificate configuration.
 */
export const VALID_ENVIRONMENTS: readonly CertificateEnvironment[] = [
  'development',
  'staging',
  'production',
] as const;

/**
 * Number of days before expiry that triggers a warning log.
 */
export const EXPIRY_WARNING_DAYS = 30;

/**
 * Number of days before expiry that triggers a critical alert.
 */
export const EXPIRY_CRITICAL_DAYS = 7;

/**
 * Result of validating a ServiceCertificate configuration.
 */
export interface ServiceCertificateValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validates that a path is absolute.
 * On Windows, absolute paths start with a drive letter (e.g., C:\).
 * On Unix, absolute paths start with /.
 */
function isAbsolutePath(filePath: string): boolean {
  // Unix absolute path
  if (filePath.startsWith('/')) return true;
  // Windows absolute path (e.g., C:\, D:\)
  if (/^[a-zA-Z]:[/\\]/.test(filePath)) return true;
  return false;
}

/**
 * Validates a SHA-256 fingerprint string.
 * Must be exactly 64 hexadecimal characters (lowercase or uppercase).
 */
function isValidSHA256Fingerprint(fingerprint: string): boolean {
  return /^[0-9a-fA-F]{64}$/.test(fingerprint);
}

/**
 * Validates a ServiceCertificate configuration object.
 *
 * Validation rules:
 * - `service` must be one of the defined service types
 * - `environment` must be one of the defined environments
 * - All paths must be absolute when provided
 * - `expiresAt` must be in the future at load time (warn if < 30 days)
 * - `fingerprint` must be a valid SHA-256 hex string (64 chars) when provided
 */
export function validateServiceCertificate(
  cert: ServiceCertificate
): ServiceCertificateValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Validate service type
  if (!VALID_SERVICE_TYPES.includes(cert.service)) {
    errors.push(
      `Invalid service type "${cert.service}". Must be one of: ${VALID_SERVICE_TYPES.join(', ')}`
    );
  }

  // Validate environment
  if (!VALID_ENVIRONMENTS.includes(cert.environment)) {
    errors.push(
      `Invalid environment "${cert.environment}". Must be one of: ${VALID_ENVIRONMENTS.join(', ')}`
    );
  }

  // Validate paths are absolute when provided
  if (cert.caPath !== undefined && !isAbsolutePath(cert.caPath)) {
    errors.push(`caPath must be an absolute path, got: "${cert.caPath}"`);
  }

  if (cert.certPath !== undefined && !isAbsolutePath(cert.certPath)) {
    errors.push(`certPath must be an absolute path, got: "${cert.certPath}"`);
  }

  if (cert.keyPath !== undefined && !isAbsolutePath(cert.keyPath)) {
    errors.push(`keyPath must be an absolute path, got: "${cert.keyPath}"`);
  }

  // Validate expiresAt is in the future
  if (cert.expiresAt !== undefined) {
    const now = new Date();
    if (cert.expiresAt <= now) {
      errors.push(
        `Certificate has expired. expiresAt (${cert.expiresAt.toISOString()}) is in the past`
      );
    } else {
      const daysUntilExpiry = Math.ceil(
        (cert.expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );

      if (daysUntilExpiry <= EXPIRY_CRITICAL_DAYS) {
        warnings.push(
          `CRITICAL: Certificate for ${cert.service} expires in ${daysUntilExpiry} day(s)`
        );
      } else if (daysUntilExpiry <= EXPIRY_WARNING_DAYS) {
        warnings.push(
          `WARNING: Certificate for ${cert.service} expires in ${daysUntilExpiry} day(s)`
        );
      }
    }
  }

  // Validate fingerprint format
  if (cert.fingerprint !== undefined && !isValidSHA256Fingerprint(cert.fingerprint)) {
    errors.push(
      `Invalid fingerprint. Must be a valid SHA-256 hex string (64 characters), got ${cert.fingerprint.length} characters`
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
