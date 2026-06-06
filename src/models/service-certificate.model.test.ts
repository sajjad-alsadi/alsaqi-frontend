import { describe, it, expect } from 'vitest';
import {
  ServiceCertificate,
  validateServiceCertificate,
  VALID_SERVICE_TYPES,
  VALID_ENVIRONMENTS,
  EXPIRY_WARNING_DAYS,
  EXPIRY_CRITICAL_DAYS,
} from './service-certificate.model';

describe('ServiceCertificate model', () => {
  describe('validateServiceCertificate', () => {
    it('should pass validation for a minimal valid certificate config', () => {
      const cert: ServiceCertificate = {
        service: 'postgresql',
        environment: 'production',
      };

      const result = validateServiceCertificate(cert);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should pass validation for a fully populated certificate config', () => {
      const cert: ServiceCertificate = {
        service: 'minio',
        environment: 'staging',
        caPath: '/etc/certs/ca.pem',
        certPath: '/etc/certs/minio.crt',
        keyPath: '/etc/certs/minio.key',
        expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days from now
        fingerprint: 'a'.repeat(64),
      };

      const result = validateServiceCertificate(cert);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    describe('service type validation', () => {
      it('should accept all valid service types', () => {
        for (const service of VALID_SERVICE_TYPES) {
          const cert: ServiceCertificate = { service, environment: 'production' };
          const result = validateServiceCertificate(cert);
          expect(result.valid).toBe(true);
        }
      });

      it('should reject invalid service type', () => {
        const cert = {
          service: 'invalid-service' as any,
          environment: 'production' as const,
        };

        const result = validateServiceCertificate(cert);
        expect(result.valid).toBe(false);
        expect(result.errors[0]).toContain('Invalid service type');
      });
    });

    describe('environment validation', () => {
      it('should accept all valid environments', () => {
        for (const environment of VALID_ENVIRONMENTS) {
          const cert: ServiceCertificate = { service: 'redis', environment };
          const result = validateServiceCertificate(cert);
          expect(result.valid).toBe(true);
        }
      });

      it('should reject invalid environment', () => {
        const cert = {
          service: 'redis' as const,
          environment: 'test' as any,
        };

        const result = validateServiceCertificate(cert);
        expect(result.valid).toBe(false);
        expect(result.errors[0]).toContain('Invalid environment');
      });
    });

    describe('path validation', () => {
      it('should accept absolute Unix paths', () => {
        const cert: ServiceCertificate = {
          service: 'postgresql',
          environment: 'production',
          caPath: '/etc/ssl/certs/ca.pem',
          certPath: '/etc/ssl/private/server.crt',
          keyPath: '/etc/ssl/private/server.key',
        };

        const result = validateServiceCertificate(cert);
        expect(result.valid).toBe(true);
      });

      it('should accept absolute Windows paths', () => {
        const cert: ServiceCertificate = {
          service: 'postgresql',
          environment: 'production',
          caPath: 'C:\\certs\\ca.pem',
          certPath: 'D:/certs/server.crt',
          keyPath: 'E:\\certs\\server.key',
        };

        const result = validateServiceCertificate(cert);
        expect(result.valid).toBe(true);
      });

      it('should reject relative caPath', () => {
        const cert: ServiceCertificate = {
          service: 'minio',
          environment: 'development',
          caPath: './certs/ca.pem',
        };

        const result = validateServiceCertificate(cert);
        expect(result.valid).toBe(false);
        expect(result.errors[0]).toContain('caPath must be an absolute path');
      });

      it('should reject relative certPath', () => {
        const cert: ServiceCertificate = {
          service: 'minio',
          environment: 'development',
          certPath: 'certs/server.crt',
        };

        const result = validateServiceCertificate(cert);
        expect(result.valid).toBe(false);
        expect(result.errors[0]).toContain('certPath must be an absolute path');
      });

      it('should reject relative keyPath', () => {
        const cert: ServiceCertificate = {
          service: 'api',
          environment: 'staging',
          keyPath: '../keys/server.key',
        };

        const result = validateServiceCertificate(cert);
        expect(result.valid).toBe(false);
        expect(result.errors[0]).toContain('keyPath must be an absolute path');
      });
    });

    describe('expiresAt validation', () => {
      it('should error when certificate has already expired', () => {
        const cert: ServiceCertificate = {
          service: 'redis',
          environment: 'production',
          expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // 1 day ago
        };

        const result = validateServiceCertificate(cert);
        expect(result.valid).toBe(false);
        expect(result.errors[0]).toContain('Certificate has expired');
      });

      it('should warn when certificate expires within critical threshold', () => {
        const cert: ServiceCertificate = {
          service: 'postgresql',
          environment: 'production',
          expiresAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // 3 days from now
        };

        const result = validateServiceCertificate(cert);
        expect(result.valid).toBe(true);
        expect(result.warnings[0]).toContain('CRITICAL');
        expect(result.warnings[0]).toContain('3 day(s)');
      });

      it('should warn when certificate expires within warning threshold', () => {
        const cert: ServiceCertificate = {
          service: 'minio',
          environment: 'production',
          expiresAt: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000), // 15 days from now
        };

        const result = validateServiceCertificate(cert);
        expect(result.valid).toBe(true);
        expect(result.warnings[0]).toContain('WARNING');
        expect(result.warnings[0]).toContain('15 day(s)');
      });

      it('should produce no warnings when certificate is well within validity', () => {
        const cert: ServiceCertificate = {
          service: 'api',
          environment: 'production',
          expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 365 days
        };

        const result = validateServiceCertificate(cert);
        expect(result.valid).toBe(true);
        expect(result.warnings).toHaveLength(0);
      });
    });

    describe('fingerprint validation', () => {
      it('should accept a valid 64-char hex fingerprint', () => {
        const cert: ServiceCertificate = {
          service: 'postgresql',
          environment: 'production',
          fingerprint: 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
        };

        const result = validateServiceCertificate(cert);
        expect(result.valid).toBe(true);
      });

      it('should accept uppercase hex fingerprint', () => {
        const cert: ServiceCertificate = {
          service: 'redis',
          environment: 'staging',
          fingerprint: 'ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789',
        };

        const result = validateServiceCertificate(cert);
        expect(result.valid).toBe(true);
      });

      it('should reject fingerprint that is too short', () => {
        const cert: ServiceCertificate = {
          service: 'minio',
          environment: 'production',
          fingerprint: 'abcdef0123456789',
        };

        const result = validateServiceCertificate(cert);
        expect(result.valid).toBe(false);
        expect(result.errors[0]).toContain('Invalid fingerprint');
      });

      it('should reject fingerprint with non-hex characters', () => {
        const cert: ServiceCertificate = {
          service: 'api',
          environment: 'development',
          fingerprint: 'zzzzzz0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
        };

        const result = validateServiceCertificate(cert);
        expect(result.valid).toBe(false);
        expect(result.errors[0]).toContain('Invalid fingerprint');
      });
    });

    describe('multiple validation errors', () => {
      it('should report all validation errors at once', () => {
        const cert = {
          service: 'unknown' as any,
          environment: 'invalid' as any,
          caPath: 'relative/path',
          fingerprint: 'short',
          expiresAt: new Date(Date.now() - 1000),
        };

        const result = validateServiceCertificate(cert);
        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThanOrEqual(4);
      });
    });
  });
});
