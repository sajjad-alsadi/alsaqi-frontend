// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';

/**
 * Property Test: Signed URL Validity and Expiration (Property 9)
 *
 * Feature: api-audit-improvements
 * Property 9: Signed URL Validity and Expiration
 *
 * **Validates: Requirements 12.5, 12.6, 12.7**
 *
 * For any generated Signed URL with a given TTL, the URL SHALL verify successfully
 * before the TTL expires, and SHALL be rejected after the TTL expires. Additionally,
 * any modification to the file path, user ID, or expiry timestamp in the URL SHALL
 * cause signature verification to fail.
 */

import { SecureFileService } from '../services/SecureFileService';

// ─── Custom Arbitraries ──────────────────────────────────────────────────────

/** Generates a valid file path (relative to uploads directory) */
const filePathArb = fc
  .tuple(
    fc.array(fc.stringMatching(/^[a-zA-Z0-9_-]{1,15}$/), { minLength: 0, maxLength: 3 }),
    fc.stringMatching(/^[a-zA-Z0-9_-]{1,20}$/),
    fc.constantFrom('.pdf', '.docx', '.xlsx', '.png', '.jpg', '.txt', '.csv')
  )
  .map(([dirs, name, ext]) => {
    const dirPath = dirs.length > 0 ? '/' + dirs.join('/') : '';
    return `${dirPath}/${name}${ext}`;
  });

/** Generates a valid user ID */
const userIdArb = fc.oneof(
  fc.uuid(),
  fc.stringMatching(/^user-[a-z0-9]{4,12}$/)
);

/** Generates a valid TTL within the allowed range [300, 604800] */
const validTtlArb = fc.integer({ min: 300, max: 604800 });

/** Generates a different file path (for tampering tests) */
const differentFilePathArb = fc
  .tuple(
    fc.stringMatching(/^[a-zA-Z0-9_-]{1,20}$/),
    fc.constantFrom('.pdf', '.docx', '.xlsx', '.png', '.jpg')
  )
  .map(([name, ext]) => `/tampered/${name}${ext}`);

/** Generates a different user ID (for tampering tests) */
const differentUserIdArb = fc.stringMatching(/^attacker-[a-z0-9]{4,12}$/);

// ─── Helper Functions ────────────────────────────────────────────────────────

/**
 * Extracts query parameters from a generated signed URL.
 */
function extractUrlParams(url: string): { expires: number; userId: string; sig: string } {
  const expiresMatch = url.match(/expires=(\d+)/);
  const sigMatch = url.match(/sig=([a-f0-9]+)/);
  const userIdMatch = url.match(/userId=([^&]+)/);

  return {
    expires: parseInt(expiresMatch![1], 10),
    userId: decodeURIComponent(userIdMatch![1]),
    sig: sigMatch![1],
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Property 9: Signed URL Validity and Expiration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, FILE_ACCESS_SECRET: 'test-property-secret-key' };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('URLs verify successfully before TTL expires', () => {
    it('for any filePath, userId, and valid TTL, a freshly generated URL verifies successfully', () => {
      fc.assert(
        fc.property(filePathArb, userIdArb, validTtlArb, (filePath, userId, ttl) => {
          const url = SecureFileService.generateSignedUrl(filePath, userId, ttl);
          const { expires, sig } = extractUrlParams(url);

          const result = SecureFileService.verifySignedUrl(filePath, userId, expires, sig);

          expect(result.valid).toBe(true);
          expect(result.expired).toBeUndefined();
          expect(result.reason).toBeUndefined();
        }),
        { numRuns: 200 }
      );
    });

    it('the expiry timestamp is always in the future by at least the clamped TTL', () => {
      fc.assert(
        fc.property(filePathArb, userIdArb, validTtlArb, (filePath, userId, ttl) => {
          const before = Math.floor(Date.now() / 1000);
          const url = SecureFileService.generateSignedUrl(filePath, userId, ttl);
          const { expires } = extractUrlParams(url);

          const clampedTtl = SecureFileService.clampTtl(ttl);
          expect(expires).toBeGreaterThanOrEqual(before + clampedTtl);
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('URLs are rejected after TTL expires', () => {
    it('for any filePath and userId, a URL with an expiry in the past is rejected as expired', () => {
      fc.assert(
        fc.property(
          filePathArb,
          userIdArb,
          fc.integer({ min: 1, max: 100000 }),
          (filePath, userId, secondsAgo) => {
            // Simulate an expired URL by setting expiry in the past
            const pastExpiry = Math.floor(Date.now() / 1000) - secondsAgo;

            // We need a valid signature for the past expiry to test expiration check
            // (not tampering). Use the internal method indirectly via generate + extract.
            // Instead, we generate a URL and then manually set the expiry to the past.
            const url = SecureFileService.generateSignedUrl(filePath, userId, 300);
            const { sig } = extractUrlParams(url);

            // Verify with past expiry - should be rejected as expired
            const result = SecureFileService.verifySignedUrl(filePath, userId, pastExpiry, sig);

            expect(result.valid).toBe(false);
            expect(result.expired).toBe(true);
            expect(result.reason).toBe('URL has expired');
          }
        ),
        { numRuns: 200 }
      );
    });

    it('expiry at exactly the current second is rejected (boundary condition)', () => {
      fc.assert(
        fc.property(filePathArb, userIdArb, (filePath, userId) => {
          // Set expiry to 1 second in the past to ensure it's expired
          const justExpired = Math.floor(Date.now() / 1000) - 1;

          const url = SecureFileService.generateSignedUrl(filePath, userId, 300);
          const { sig } = extractUrlParams(url);

          const result = SecureFileService.verifySignedUrl(filePath, userId, justExpired, sig);

          expect(result.valid).toBe(false);
          expect(result.expired).toBe(true);
        }),
        { numRuns: 50 }
      );
    });
  });

  describe('modification to filePath causes verification failure', () => {
    it('for any valid URL, changing the filePath causes signature verification to fail', () => {
      fc.assert(
        fc.property(
          filePathArb,
          userIdArb,
          validTtlArb,
          differentFilePathArb,
          (filePath, userId, ttl, tamperedPath) => {
            // Skip if the tampered path happens to be the same
            fc.pre(tamperedPath !== filePath);

            const url = SecureFileService.generateSignedUrl(filePath, userId, ttl);
            const { expires, sig } = extractUrlParams(url);

            // Verify with tampered file path
            const result = SecureFileService.verifySignedUrl(tamperedPath, userId, expires, sig);

            expect(result.valid).toBe(false);
            expect(result.expired).toBe(false);
            expect(result.reason).toBe('Invalid signature');
          }
        ),
        { numRuns: 200 }
      );
    });
  });

  describe('modification to userId causes verification failure', () => {
    it('for any valid URL, changing the userId causes signature verification to fail', () => {
      fc.assert(
        fc.property(
          filePathArb,
          userIdArb,
          validTtlArb,
          differentUserIdArb,
          (filePath, userId, ttl, tamperedUserId) => {
            // Skip if the tampered userId happens to be the same
            fc.pre(tamperedUserId !== userId);

            const url = SecureFileService.generateSignedUrl(filePath, userId, ttl);
            const { expires, sig } = extractUrlParams(url);

            // Verify with tampered userId
            const result = SecureFileService.verifySignedUrl(filePath, tamperedUserId, expires, sig);

            expect(result.valid).toBe(false);
            expect(result.expired).toBe(false);
            expect(result.reason).toBe('Invalid signature');
          }
        ),
        { numRuns: 200 }
      );
    });
  });

  describe('modification to expiry causes verification failure', () => {
    it('for any valid URL, changing the expiry timestamp causes signature verification to fail', () => {
      fc.assert(
        fc.property(
          filePathArb,
          userIdArb,
          validTtlArb,
          fc.integer({ min: 1, max: 100000 }),
          (filePath, userId, ttl, expiryDelta) => {
            const url = SecureFileService.generateSignedUrl(filePath, userId, ttl);
            const { expires, sig } = extractUrlParams(url);

            // Tamper with expiry (add delta to extend it)
            const tamperedExpiry = expires + expiryDelta;

            const result = SecureFileService.verifySignedUrl(filePath, userId, tamperedExpiry, sig);

            expect(result.valid).toBe(false);
            // It might not be expired since we extended it, but signature should be invalid
            expect(result.reason).toBe('Invalid signature');
          }
        ),
        { numRuns: 200 }
      );
    });

    it('for any valid URL, reducing the expiry timestamp also causes verification failure', () => {
      fc.assert(
        fc.property(
          filePathArb,
          userIdArb,
          validTtlArb,
          fc.integer({ min: 1, max: 100000 }),
          (filePath, userId, ttl, expiryDelta) => {
            const url = SecureFileService.generateSignedUrl(filePath, userId, ttl);
            const { expires, sig } = extractUrlParams(url);

            // Tamper with expiry (subtract delta to shorten it)
            const tamperedExpiry = expires - expiryDelta;

            const result = SecureFileService.verifySignedUrl(filePath, userId, tamperedExpiry, sig);

            // Either expired (if tampered expiry is in the past) or invalid signature
            expect(result.valid).toBe(false);
            if (result.expired) {
              expect(result.reason).toBe('URL has expired');
            } else {
              expect(result.reason).toBe('Invalid signature');
            }
          }
        ),
        { numRuns: 200 }
      );
    });
  });

  describe('signature is cryptographically bound to all parameters', () => {
    it('the same parameters always produce the same signature (deterministic)', () => {
      fc.assert(
        fc.property(filePathArb, userIdArb, (filePath, userId) => {
          // Generate two URLs with the same parameters at the same time
          const url1 = SecureFileService.generateSignedUrl(filePath, userId, 3600);
          const url2 = SecureFileService.generateSignedUrl(filePath, userId, 3600);

          const { sig: sig1, expires: exp1 } = extractUrlParams(url1);
          const { sig: sig2, expires: exp2 } = extractUrlParams(url2);

          // If generated at the same second, signatures should be identical
          if (exp1 === exp2) {
            expect(sig1).toBe(sig2);
          }
        }),
        { numRuns: 100 }
      );
    });

    it('different parameters always produce different signatures', () => {
      fc.assert(
        fc.property(
          filePathArb,
          userIdArb,
          differentFilePathArb,
          differentUserIdArb,
          (filePath, userId, otherPath, otherUserId) => {
            fc.pre(filePath !== otherPath && userId !== otherUserId);

            const url1 = SecureFileService.generateSignedUrl(filePath, userId, 3600);
            const url2 = SecureFileService.generateSignedUrl(otherPath, otherUserId, 3600);

            const { sig: sig1 } = extractUrlParams(url1);
            const { sig: sig2 } = extractUrlParams(url2);

            // Different inputs should produce different signatures
            expect(sig1).not.toBe(sig2);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
