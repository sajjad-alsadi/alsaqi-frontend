import { readFileSync, watchFile, unwatchFile, existsSync } from 'fs';
import crypto from 'crypto';
import logger from '../utils/logger.js';
import { getTLSConfig, type TLSConfig, type TLSServicePaths } from '../config/tls.config.js';

/**
 * SSL config for PostgreSQL (pg) client
 */
export interface PostgresSSLConfig {
  rejectUnauthorized: boolean;
  ca?: Buffer;
  cert?: Buffer;
  key?: Buffer;
}

/**
 * SSL config for MinIO (@aws-sdk/client-s3)
 */
export interface MinioSSLConfig {
  secure: boolean;
  ca?: Buffer;
  cert?: Buffer;
  key?: Buffer;
}

/**
 * SSL config for Redis (ioredis)
 */
export interface RedisSSLConfig {
  tls: {
    rejectUnauthorized: boolean;
    ca?: Buffer;
    cert?: Buffer;
    key?: Buffer;
  };
}

/**
 * Loaded certificate bundle for a service
 */
interface CertificateBundle {
  ca?: Buffer;
  cert?: Buffer;
  key?: Buffer;
}

/**
 * CertificateManager centralizes TLS certificate loading, validation, and hot-reload
 * for all inter-service connections (PostgreSQL, MinIO, Redis).
 *
 * Responsibilities:
 * - Load PEM certificates from configured paths
 * - Validate the CA → cert chain relationship using Node.js crypto
 * - Provide typed SSL config objects for each service
 * - Watch certificate files for changes (polling interval, default 30s)
 * - On hot-reload: validate new certs before applying; keep old on failure
 * - Fall back to system CA store when custom certs are not configured
 */
export class CertificateManager {
  private config: TLSConfig;
  private postgresCerts: CertificateBundle | null = null;
  private minioCerts: CertificateBundle | null = null;
  private redisCerts: CertificateBundle | null = null;
  private watchedFiles: Set<string> = new Set();
  private expiryCheckInterval: ReturnType<typeof setInterval> | null = null;

  constructor(config?: TLSConfig) {
    this.config = config ?? getTLSConfig();
    this.loadAllCertificates();
  }

  /**
   * Returns the SSL config object for PostgreSQL (pg client).
   * Falls back to system CA store with rejectUnauthorized: true when no custom certs configured.
   */
  getPostgresSSLConfig(): PostgresSSLConfig {
    if (!this.postgresCerts) {
      return { rejectUnauthorized: this.config.rejectUnauthorized };
    }
    return {
      rejectUnauthorized: this.config.rejectUnauthorized,
      ...this.postgresCerts,
    };
  }

  /**
   * Returns the SSL config object for MinIO (@aws-sdk S3 client).
   * Falls back to system CA store when no custom certs configured.
   */
  getMinioSSLConfig(): MinioSSLConfig {
    if (!this.minioCerts) {
      return { secure: this.config.enabled };
    }
    return {
      secure: true,
      ...this.minioCerts,
    };
  }

  /**
   * Returns the SSL config object for Redis (ioredis client).
   * Falls back to system CA store with rejectUnauthorized: true when no custom certs configured.
   */
  getRedisSSLConfig(): RedisSSLConfig {
    if (!this.redisCerts) {
      return {
        tls: { rejectUnauthorized: this.config.rejectUnauthorized },
      };
    }
    return {
      tls: {
        rejectUnauthorized: this.config.rejectUnauthorized,
        ...this.redisCerts,
      },
    };
  }

  /**
   * Reloads all certificate files from disk. Validates new certs before applying.
   * If validation fails, retains the previously loaded valid certificates.
   */
  async reloadCertificates(): Promise<void> {
    logger.info('[CertificateManager] Reloading certificates...');

    this.reloadServiceCertificate('postgres', this.config.postgres, (bundle) => {
      this.postgresCerts = bundle;
    });

    this.reloadServiceCertificate('minio', this.config.minio, (bundle) => {
      this.minioCerts = bundle;
    });

    this.reloadServiceCertificate('redis', this.config.redis, (bundle) => {
      this.redisCerts = bundle;
    });

    logger.info('[CertificateManager] Certificate reload complete.');
  }

  /**
   * Starts file watchers for all configured certificate paths.
   * Uses polling at the configured interval (default 30s) to detect changes.
   */
  startWatching(): void {
    const interval = this.config.watchIntervalMs;
    logger.info(`[CertificateManager] Starting certificate file watchers (interval: ${interval}ms)`);

    const allPaths = [
      ...this.getServicePaths(this.config.postgres),
      ...this.getServicePaths(this.config.minio),
      ...this.getServicePaths(this.config.redis),
    ];

    for (const filePath of allPaths) {
      if (filePath && !this.watchedFiles.has(filePath)) {
        watchFile(filePath, { interval }, () => {
          logger.info(`[CertificateManager] Certificate file changed: ${filePath}`);
          this.reloadCertificates();
        });
        this.watchedFiles.add(filePath);
      }
    }
  }

  /**
   * Stops all file watchers and cleans up resources.
   */
  stopWatching(): void {
    for (const filePath of this.watchedFiles) {
      unwatchFile(filePath);
    }
    this.watchedFiles.clear();
    logger.info('[CertificateManager] Certificate file watchers stopped.');
  }

  /**
   * Checks expiry dates of all loaded certificates and logs warnings or critical alerts.
   * - Warning: certificate expires within expiryWarningDays (default 30) but more than expiryCriticalDays (default 7)
   * - Critical: certificate expires within expiryCriticalDays (default 7) or fewer
   * - No notification if certificate expires in more than expiryWarningDays
   */
  checkCertificateExpiry(): void {
    const services: Array<{ name: string; bundle: CertificateBundle | null }> = [
      { name: 'postgres', bundle: this.postgresCerts },
      { name: 'minio', bundle: this.minioCerts },
      { name: 'redis', bundle: this.redisCerts },
    ];

    for (const { name, bundle } of services) {
      if (!bundle?.cert) {
        continue;
      }

      try {
        const x509 = new crypto.X509Certificate(bundle.cert);
        const expiryDate = new Date(x509.validTo);
        const now = new Date();
        const daysUntilExpiry = Math.floor(
          (expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
        );

        const certIdentity = x509.subject || name;

        if (daysUntilExpiry <= this.config.expiryCriticalDays) {
          logger.error(
            `[CertificateManager] CRITICAL: Certificate for ${certIdentity} expires in ${daysUntilExpiry} day(s)`,
            { service: name, daysUntilExpiry, expiryDate: expiryDate.toISOString(), severity: 'critical' },
          );
        } else if (daysUntilExpiry <= this.config.expiryWarningDays) {
          logger.warn(
            `[CertificateManager] WARNING: Certificate for ${certIdentity} expires in ${daysUntilExpiry} day(s)`,
            { service: name, daysUntilExpiry, expiryDate: expiryDate.toISOString() },
          );
        }
      } catch (error) {
        logger.error(`[CertificateManager] Failed to check expiry for ${name} certificate`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  /**
   * Starts daily certificate expiry checks using a 24-hour interval.
   * Runs an initial check immediately, then schedules subsequent checks every 24 hours.
   */
  startExpiryChecks(): void {
    const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

    logger.info('[CertificateManager] Starting daily certificate expiry checks.');

    // Run an initial check immediately
    this.checkCertificateExpiry();

    // Schedule daily checks
    this.expiryCheckInterval = setInterval(() => {
      this.checkCertificateExpiry();
    }, TWENTY_FOUR_HOURS_MS);

    // Allow the process to exit even if the interval is active
    if (this.expiryCheckInterval.unref) {
      this.expiryCheckInterval.unref();
    }
  }

  /**
   * Stops the daily certificate expiry check schedule.
   */
  stopExpiryChecks(): void {
    if (this.expiryCheckInterval) {
      clearInterval(this.expiryCheckInterval);
      this.expiryCheckInterval = null;
      logger.info('[CertificateManager] Daily certificate expiry checks stopped.');
    }
  }

  /**
   * Validates a certificate chain: verifies the cert was signed by the CA.
   * Returns true if the chain is valid, false otherwise.
   */
  validateCertificateChain(ca: Buffer, cert: Buffer): boolean {
    try {
      const caCert = new crypto.X509Certificate(ca);
      const clientCert = new crypto.X509Certificate(cert);
      return clientCert.checkIssued(caCert);
    } catch (error) {
      logger.error('[CertificateManager] Certificate chain validation error', {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Loads all certificates for all services on initialization.
   */
  private loadAllCertificates(): void {
    this.postgresCerts = this.loadServiceCertificate('postgres', this.config.postgres);
    this.minioCerts = this.loadServiceCertificate('minio', this.config.minio);
    this.redisCerts = this.loadServiceCertificate('redis', this.config.redis);
  }

  /**
   * Loads certificate files for a specific service and validates the chain.
   * Returns null if no custom certs are configured (system CA fallback).
   */
  private loadServiceCertificate(
    service: string,
    paths: TLSServicePaths,
  ): CertificateBundle | null {
    if (!paths.caPath && !paths.certPath && !paths.keyPath) {
      logger.debug(`[CertificateManager] No custom certificates configured for ${service}, using system CA store.`);
      return null;
    }

    try {
      const bundle: CertificateBundle = {};

      if (paths.caPath) {
        if (!existsSync(paths.caPath)) {
          logger.error(`[CertificateManager] CA file not found for ${service}: ${paths.caPath}`);
          return null;
        }
        bundle.ca = readFileSync(paths.caPath);
      }

      if (paths.certPath) {
        if (!existsSync(paths.certPath)) {
          logger.error(`[CertificateManager] Cert file not found for ${service}: ${paths.certPath}`);
          return null;
        }
        bundle.cert = readFileSync(paths.certPath);
      }

      if (paths.keyPath) {
        if (!existsSync(paths.keyPath)) {
          logger.error(`[CertificateManager] Key file not found for ${service}: ${paths.keyPath}`);
          return null;
        }
        bundle.key = readFileSync(paths.keyPath);
      }

      // Validate certificate chain if both CA and cert are present
      if (bundle.ca && bundle.cert) {
        const isValid = this.validateCertificateChain(bundle.ca, bundle.cert);
        if (!isValid) {
          logger.error(
            `[CertificateManager] Certificate chain validation failed for ${service}: cert was not issued by the provided CA.`,
          );
          return null;
        }
        logger.info(`[CertificateManager] Certificate chain validated for ${service}.`);
      }

      logger.info(`[CertificateManager] Certificates loaded for ${service}.`);
      return bundle;
    } catch (error) {
      logger.error(`[CertificateManager] Failed to load certificates for ${service}`, {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Reloads certificates for a specific service.
   * Validates new certs before applying; retains old ones if validation fails.
   */
  private reloadServiceCertificate(
    service: string,
    paths: TLSServicePaths,
    apply: (bundle: CertificateBundle | null) => void,
  ): void {
    const newBundle = this.loadServiceCertificate(service, paths);

    // If we couldn't load or validate, keep existing certs
    if (newBundle === null && this.hasConfiguredPaths(paths)) {
      logger.error(
        `[CertificateManager] Reload validation failed for ${service}. Retaining previously valid certificate.`,
      );
      return;
    }

    apply(newBundle);
  }

  /**
   * Checks whether any certificate paths are configured for a service.
   */
  private hasConfiguredPaths(paths: TLSServicePaths): boolean {
    return !!(paths.caPath || paths.certPath || paths.keyPath);
  }

  /**
   * Returns an array of all non-empty file paths for a service config.
   */
  private getServicePaths(paths: TLSServicePaths): string[] {
    return [paths.caPath, paths.certPath, paths.keyPath].filter(
      (p): p is string => !!p,
    );
  }
}
