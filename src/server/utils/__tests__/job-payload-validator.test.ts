// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { validateJobPayload, assertJobPayloadSecurity } from '../job-payload-validator';

// Mock the logger module
vi.mock('../logger', () => ({
  default: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('validateJobPayload', () => {
  describe('valid payloads (no sensitive data)', () => {
    it('should accept a valid process-file payload', () => {
      const payload = {
        tempKey: 'pending/audit/123/20240101T120000-uuid.pdf',
        targetBucket: 'evidence',
        metadata: {
          fileId: 'file-uuid-123',
          storageKey: 'audit/123/20240101T120000-uuid.pdf',
          checksum: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
          contentType: 'application/pdf',
        },
      };

      const result = validateJobPayload(payload);

      expect(result.isValid).toBe(true);
      expect(result.sensitiveFields).toHaveLength(0);
    });

    it('should accept a valid generate-pdf payload', () => {
      const payload = {
        reportId: 'report-uuid-456',
        auditId: 'audit-uuid-789',
        template: 'standard',
      };

      const result = validateJobPayload(payload);

      expect(result.isValid).toBe(true);
      expect(result.sensitiveFields).toHaveLength(0);
    });

    it('should accept a valid cleanup-temp payload', () => {
      const payload = {
        olderThanMs: 86400000,
      };

      const result = validateJobPayload(payload);

      expect(result.isValid).toBe(true);
      expect(result.sensitiveFields).toHaveLength(0);
    });

    it('should accept a valid send-notification payload', () => {
      const payload = {
        userId: 'user-uuid-123',
        type: 'file-ready',
        payload: { fileId: 'file-123', message: 'Your file is ready' },
      };

      const result = validateJobPayload(payload);

      expect(result.isValid).toBe(true);
      expect(result.sensitiveFields).toHaveLength(0);
    });

    it('should accept empty objects', () => {
      const result = validateJobPayload({});

      expect(result.isValid).toBe(true);
      expect(result.sensitiveFields).toHaveLength(0);
    });

    it('should accept null and undefined', () => {
      expect(validateJobPayload(null).isValid).toBe(true);
      expect(validateJobPayload(undefined).isValid).toBe(true);
    });
  });

  describe('rejects payloads with sensitive fields', () => {
    it('should reject payload with password field', () => {
      const payload = {
        fileId: 'file-123',
        password: 'user-secret-pass',
      };

      const result = validateJobPayload(payload);

      expect(result.isValid).toBe(false);
      expect(result.sensitiveFields).toContain('password');
    });

    it('should reject payload with token field', () => {
      const payload = {
        fileId: 'file-123',
        token: 'bearer-xyz-abc',
      };

      const result = validateJobPayload(payload);

      expect(result.isValid).toBe(false);
      expect(result.sensitiveFields).toContain('token');
    });

    it('should reject payload with apiKey field', () => {
      const payload = {
        fileId: 'file-123',
        apiKey: 'sk-1234567890',
      };

      const result = validateJobPayload(payload);

      expect(result.isValid).toBe(false);
      expect(result.sensitiveFields).toContain('apiKey');
    });

    it('should reject payload with sessionId field', () => {
      const payload = {
        fileId: 'file-123',
        sessionId: 'sess-abc-123',
      };

      const result = validateJobPayload(payload);

      expect(result.isValid).toBe(false);
      expect(result.sensitiveFields).toContain('sessionId');
    });

    it('should reject payload with jwt field', () => {
      const payload = {
        fileId: 'file-123',
        jwt: 'eyJhbGciOiJIUzI1NiJ9.eyJ1c2VyIjoiYWRtaW4ifQ.signature',
      };

      const result = validateJobPayload(payload);

      expect(result.isValid).toBe(false);
      expect(result.sensitiveFields).toContain('jwt');
    });

    it('should reject payload with accessToken field', () => {
      const payload = {
        fileId: 'file-123',
        accessToken: 'at-12345',
      };

      const result = validateJobPayload(payload);

      expect(result.isValid).toBe(false);
      expect(result.sensitiveFields).toContain('accessToken');
    });

    it('should reject payload with refreshToken field', () => {
      const payload = {
        fileId: 'file-123',
        refreshToken: 'rt-67890',
      };

      const result = validateJobPayload(payload);

      expect(result.isValid).toBe(false);
      expect(result.sensitiveFields).toContain('refreshToken');
    });

    it('should reject payload with authorization field', () => {
      const payload = {
        fileId: 'file-123',
        authorization: 'Bearer some-token',
      };

      const result = validateJobPayload(payload);

      expect(result.isValid).toBe(false);
      expect(result.sensitiveFields).toContain('authorization');
    });

    it('should reject payload with cookie field', () => {
      const payload = {
        fileId: 'file-123',
        cookie: 'session=abc123; csrftoken=def456',
      };

      const result = validateJobPayload(payload);

      expect(result.isValid).toBe(false);
      expect(result.sensitiveFields).toContain('cookie');
    });

    it('should reject payload with secret field', () => {
      const payload = {
        fileId: 'file-123',
        secret: 'my-app-secret',
      };

      const result = validateJobPayload(payload);

      expect(result.isValid).toBe(false);
      expect(result.sensitiveFields).toContain('secret');
    });

    it('should reject payload with credential field', () => {
      const payload = {
        fileId: 'file-123',
        credential: 'some-cred',
      };

      const result = validateJobPayload(payload);

      expect(result.isValid).toBe(false);
      expect(result.sensitiveFields).toContain('credential');
    });

    it('should reject payload with private_key field', () => {
      const payload = {
        fileId: 'file-123',
        private_key: '-----BEGIN RSA PRIVATE KEY-----',
      };

      const result = validateJobPayload(payload);

      expect(result.isValid).toBe(false);
      expect(result.sensitiveFields).toContain('private_key');
    });
  });

  describe('nested field detection', () => {
    it('should detect sensitive fields in nested objects', () => {
      const payload = {
        fileId: 'file-123',
        metadata: {
          storageKey: 'some-key',
          userToken: 'bearer-secret-value',
        },
      };

      const result = validateJobPayload(payload);

      expect(result.isValid).toBe(false);
      expect(result.sensitiveFields).toContain('metadata.userToken');
    });

    it('should detect sensitive fields in deeply nested objects', () => {
      const payload = {
        data: {
          nested: {
            deep: {
              password: 'hidden-pass',
            },
          },
        },
      };

      const result = validateJobPayload(payload);

      expect(result.isValid).toBe(false);
      expect(result.sensitiveFields).toContain('data.nested.deep.password');
    });

    it('should detect sensitive fields in arrays', () => {
      const payload = {
        items: [
          { id: '1', name: 'safe' },
          { id: '2', token: 'leaked-token' },
        ],
      };

      const result = validateJobPayload(payload);

      expect(result.isValid).toBe(false);
      expect(result.sensitiveFields).toContain('items[1].token');
    });
  });

  describe('case-insensitive matching', () => {
    it('should detect PASSWORD (uppercase)', () => {
      const payload = { PASSWORD: 'secret123' };

      const result = validateJobPayload(payload);

      expect(result.isValid).toBe(false);
      expect(result.sensitiveFields).toContain('PASSWORD');
    });

    it('should detect AccessToken (mixed case)', () => {
      const payload = { AccessToken: 'at-12345' };

      const result = validateJobPayload(payload);

      expect(result.isValid).toBe(false);
      expect(result.sensitiveFields).toContain('AccessToken');
    });

    it('should detect api_key with underscores', () => {
      const payload = { api_key: 'key-123' };

      const result = validateJobPayload(payload);

      expect(result.isValid).toBe(false);
      expect(result.sensitiveFields).toContain('api_key');
    });

    it('should detect session_id with underscore', () => {
      const payload = { session_id: 'sess-123' };

      const result = validateJobPayload(payload);

      expect(result.isValid).toBe(false);
      expect(result.sensitiveFields).toContain('session_id');
    });
  });

  describe('multiple sensitive fields', () => {
    it('should report all sensitive fields found', () => {
      const payload = {
        fileId: 'file-123',
        password: 'pass123',
        token: 'tok-456',
        secret: 'sec-789',
      };

      const result = validateJobPayload(payload);

      expect(result.isValid).toBe(false);
      expect(result.sensitiveFields).toHaveLength(3);
      expect(result.sensitiveFields).toContain('password');
      expect(result.sensitiveFields).toContain('token');
      expect(result.sensitiveFields).toContain('secret');
    });
  });
});

describe('assertJobPayloadSecurity', () => {
  it('should not throw for valid payloads', () => {
    const payload = {
      tempKey: 'pending/audit/123/file.pdf',
      targetBucket: 'evidence',
      metadata: { fileId: '123', storageKey: 'key', checksum: 'abc', contentType: 'application/pdf' },
    };

    expect(() => assertJobPayloadSecurity('process-file', payload)).not.toThrow();
  });

  it('should throw for payloads with sensitive fields', () => {
    const payload = {
      fileId: 'file-123',
      password: 'leaked-password',
    };

    expect(() => assertJobPayloadSecurity('process-file', payload)).toThrow(
      'Job payload contains sensitive data',
    );
  });

  it('should include detected field names in error message', () => {
    const payload = {
      fileId: 'file-123',
      token: 'leaked-token',
      apiKey: 'leaked-key',
    };

    expect(() => assertJobPayloadSecurity('generate-pdf', payload)).toThrow(/token/);
    // Re-throw to check the other field (both are in the message)
    try {
      assertJobPayloadSecurity('generate-pdf', payload);
    } catch (err) {
      expect((err as Error).message).toContain('token');
      expect((err as Error).message).toContain('apiKey');
    }
  });
});
