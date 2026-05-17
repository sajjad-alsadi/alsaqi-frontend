// @vitest-environment node
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { csrfMiddleware, generateCsrfToken } from '../middleware/csrf';
import type { CsrfOptions } from '../middleware/csrf';

/**
 * Property Test: CSRF token generation on authentication events (Property 3)
 *
 * Feature: technical-debt-remediation
 * Property 3: CSRF token generation on authentication events
 *
 * **Validates: Requirements 3.1, 3.6, 3.7**
 *
 * For any successful authentication event (login or token refresh), the response
 * must contain a new CSRF token that is cryptographically random with at least
 * 32 bytes of entropy (64 hex chars), and each generated token must be unique.
 */
describe('Property 3: CSRF token generation on authentication events', () => {
  it('each generated token is exactly 64 hex characters (32 bytes of entropy)', () => {
    fc.assert(
      fc.property(
        // Simulate authentication events by generating a count of events
        fc.integer({ min: 1, max: 50 }),
        (eventCount) => {
          for (let i = 0; i < eventCount; i++) {
            const token = generateCsrfToken();

            // Token must be exactly 64 hex characters (32 bytes * 2 hex chars per byte)
            expect(token).toHaveLength(64);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('each generated token is a valid hexadecimal string', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 50 }),
        (eventCount) => {
          for (let i = 0; i < eventCount; i++) {
            const token = generateCsrfToken();

            // Token must contain only valid hex characters (0-9, a-f)
            expect(token).toMatch(/^[0-9a-f]{64}$/);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('all generated tokens are unique across authentication events', () => {
    fc.assert(
      fc.property(
        // Generate a batch size representing multiple auth events
        fc.integer({ min: 2, max: 100 }),
        (batchSize) => {
          const tokens = new Set<string>();

          for (let i = 0; i < batchSize; i++) {
            const token = generateCsrfToken();
            tokens.add(token);
          }

          // Every token must be unique - set size equals number of generated tokens
          expect(tokens.size).toBe(batchSize);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('tokens have sufficient entropy (no repeated byte patterns)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 20 }),
        (_eventIndex) => {
          const token = generateCsrfToken();

          // Split token into 2-char byte representations
          const bytes: string[] = [];
          for (let i = 0; i < token.length; i += 2) {
            bytes.push(token.substring(i, i + 2));
          }

          // A token with 32 bytes of entropy should not have all identical bytes
          const uniqueBytes = new Set(bytes);
          // With 32 random bytes, having fewer than 2 unique byte values is
          // astronomically unlikely for a cryptographically random source
          expect(uniqueBytes.size).toBeGreaterThan(1);

          // Additionally, the token should not be all zeros or all ones
          expect(token).not.toMatch(/^0+$/);
          expect(token).not.toMatch(/^f+$/);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('token generation with explicit byte length produces correct output size', () => {
    fc.assert(
      fc.property(
        // Test with various byte lengths, but always at least 32 for security
        fc.integer({ min: 32, max: 64 }),
        (byteLength) => {
          const token = generateCsrfToken(byteLength);

          // Token hex length should be exactly 2x the byte length
          expect(token).toHaveLength(byteLength * 2);

          // Must still be valid hex
          const hexPattern = new RegExp(`^[0-9a-f]{${byteLength * 2}}$`);
          expect(token).toMatch(hexPattern);
        }
      ),
      { numRuns: 100 }
    );
  });
});

/**
 * Property Test: CSRF validation on state-changing requests (Property 4)
 *
 * **Validates: Requirements 3.2, 3.3**
 *
 * For any state-changing HTTP request (POST, PUT, PATCH, DELETE) to a non-exempt endpoint,
 * the request must be rejected with HTTP 403 if it lacks a valid CSRF token,
 * and must succeed if a valid token is present.
 */
describe('Property 4: CSRF validation on state-changing requests', () => {
  const csrfOptions: CsrfOptions = {
    exemptPaths: ['/api/auth/login', '/health'],
    tokenHeader: 'x-csrf-token',
    cookieName: 'csrf-token',
    tokenByteLength: 32,
  };

  // Create a minimal Express app with CSRF middleware
  function createApp() {
    const app = express();
    app.use(cookieParser());
    app.use(csrfMiddleware(csrfOptions));
    // Catch-all handler that responds with 200 if middleware passes
    // Express 5 uses path-to-regexp v8 which requires named params for wildcards
    app.use((_req, res) => {
      res.status(200).json({ success: true });
    });
    return app;
  }

  // Generators
  const stateChangingMethods = fc.constantFrom('POST', 'PUT', 'PATCH', 'DELETE');
  const readOnlyMethods = fc.constantFrom('GET', 'HEAD', 'OPTIONS');

  // Generate non-exempt paths (avoid paths that start with exempt prefixes)
  const nonExemptPath = fc.stringMatching(/^\/[a-z][a-z0-9/]{1,30}$/).filter((path) => {
    return (
      !path.startsWith('/api/auth/login') &&
      !path.startsWith('/health')
    );
  });

  // Generate exempt paths
  const exemptPath = fc.constantFrom('/api/auth/login', '/health');

  it('state-changing requests without CSRF token are rejected with 403', async () => {
    const app = createApp();

    await fc.assert(
      fc.asyncProperty(stateChangingMethods, nonExemptPath, async (method, path) => {
        const res = await (request(app) as any)[method.toLowerCase()](path);

        expect(res.status).toBe(403);
        expect(res.body.error).toMatch(/CSRF token/i);
      }),
      { numRuns: 100 }
    );
  });

  it('state-changing requests with valid matching tokens succeed (200)', async () => {
    const app = createApp();

    await fc.assert(
      fc.asyncProperty(stateChangingMethods, nonExemptPath, async (method, path) => {
        const token = generateCsrfToken(csrfOptions.tokenByteLength);

        const res = await (request(app) as any)
          [method.toLowerCase()](path)
          .set('x-csrf-token', token)
          .set('Cookie', `csrf-token=${token}`);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  it('state-changing requests with mismatched tokens are rejected with 403', async () => {
    const app = createApp();

    await fc.assert(
      fc.asyncProperty(stateChangingMethods, nonExemptPath, async (method, path) => {
        const headerToken = generateCsrfToken(csrfOptions.tokenByteLength);
        const cookieToken = generateCsrfToken(csrfOptions.tokenByteLength);

        const res = await (request(app) as any)
          [method.toLowerCase()](path)
          .set('x-csrf-token', headerToken)
          .set('Cookie', `csrf-token=${cookieToken}`);

        expect(res.status).toBe(403);
        expect(res.body.error).toMatch(/CSRF token invalid/i);
      }),
      { numRuns: 100 }
    );
  });

  it('GET/HEAD/OPTIONS requests always pass through regardless of token', async () => {
    const app = createApp();

    await fc.assert(
      fc.asyncProperty(readOnlyMethods, nonExemptPath, async (method, path) => {
        const res = await (request(app) as any)[method.toLowerCase()](path);

        // GET/HEAD/OPTIONS should pass through without CSRF validation
        expect(res.status).toBe(200);
      }),
      { numRuns: 100 }
    );
  });

  it('exempt paths always pass through regardless of method or token', async () => {
    const app = createApp();

    await fc.assert(
      fc.asyncProperty(stateChangingMethods, exemptPath, async (method, path) => {
        // No CSRF token provided, but exempt path should still pass
        const res = await (request(app) as any)[method.toLowerCase()](path);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
      }),
      { numRuns: 100 }
    );
  });
});
