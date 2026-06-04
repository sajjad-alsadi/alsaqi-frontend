/**
 * Property-based tests for the API Client.
 *
 * Property 6: Automatic Security Headers
 *   - Verifies every request contains CSRF token and correlation ID without manual attachment.
 *   **Validates: Requirements 4.5**
 *
 * Property 11: Client-Side Response Validation
 *   - Verifies all responses are validated against Zod schemas before returning;
 *     invalid responses throw ZodError.
 *   **Validates: Requirements 4.2**
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';
import MockAdapter from 'axios-mock-adapter';
import { z, ZodError } from 'zod';
import { createApiClient, type ApiClientConfig } from '../client';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Arbitrary for generating random URL path segments (safe characters only).
 */
const arbUrlPath = fc
  .array(
    fc.stringMatching(/^[a-z0-9_-]{1,20}$/),
    { minLength: 1, maxLength: 5 }
  )
  .map((segments) => '/' + segments.join('/'));

/**
 * Arbitrary for HTTP methods supported by the client.
 */
const arbHttpMethod = fc.constantFrom('get', 'post', 'put', 'patch', 'delete') as fc.Arbitrary<'get' | 'post' | 'put' | 'patch' | 'delete'>;

/**
 * Arbitrary for generating random CSRF tokens (non-empty alphanumeric strings).
 */
const arbCsrfToken = fc.stringMatching(/^[a-zA-Z0-9]{8,64}$/);

/**
 * Wrap data in the standard ApiResponse envelope.
 */
function wrapInEnvelope(data: unknown) {
  return {
    success: true,
    data,
    meta: {
      requestId: '550e8400-e29b-41d4-a716-446655440000',
      timestamp: '2024-01-01T00:00:00Z',
      version: '1.0.0',
    },
  };
}

// ─── Property 6: Automatic Security Headers ─────────────────────────────────────

describe('Property 6: Automatic Security Headers', () => {
  let config: ApiClientConfig;

  beforeEach(() => {
    config = {
      baseUrl: 'http://localhost:3000/api',
      timeout: 5000,
    };
  });

  afterEach(() => {
    // Reset document.cookie
    Object.defineProperty(document, 'cookie', { writable: true, value: '' });
  });

  it('every request contains x-csrf-token from cookie and x-correlation-id (UUID v4)', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbUrlPath,
        arbHttpMethod,
        arbCsrfToken,
        async (urlPath, method, csrfToken) => {
          // Set the CSRF token cookie
          Object.defineProperty(document, 'cookie', {
            writable: true,
            value: `csrf-token=${csrfToken}`,
          });

          const client = createApiClient(config);
          const mockAdapter = new MockAdapter(client.http);

          let capturedCsrf: string | undefined;
          let capturedCorrelationId: string | undefined;

          // Mock any request to the generated path
          mockAdapter.onAny().reply((reqConfig) => {
            capturedCsrf = reqConfig.headers?.['x-csrf-token'] as string | undefined;
            capturedCorrelationId = reqConfig.headers?.['x-correlation-id'] as string | undefined;
            return [200, wrapInEnvelope('ok')];
          });

          const schema = z.string();

          try {
            if (method === 'get' || method === 'delete') {
              await client[method](urlPath, schema);
            } else {
              await client[method](urlPath, schema, { some: 'data' });
            }
          } catch {
            // Ignore errors from mock adapter URL mismatch - we only care about headers
          }

          // Verify CSRF token is attached
          expect(capturedCsrf).toBe(csrfToken);

          // Verify correlation ID is a valid UUID v4
          expect(capturedCorrelationId).toBeDefined();
          expect(capturedCorrelationId).toMatch(UUID_V4_REGEX);

          mockAdapter.restore();
        }
      ),
      { numRuns: 50 }
    );
  });

  it('correlation IDs are unique across multiple requests', async () => {
    Object.defineProperty(document, 'cookie', {
      writable: true,
      value: 'csrf-token=test-token',
    });

    const client = createApiClient(config);
    const mockAdapter = new MockAdapter(client.http);
    const correlationIds: string[] = [];

    mockAdapter.onAny().reply((reqConfig) => {
      correlationIds.push(reqConfig.headers?.['x-correlation-id'] as string);
      return [200, wrapInEnvelope('ok')];
    });

    await fc.assert(
      fc.asyncProperty(
        arbUrlPath,
        async (urlPath) => {
          await client.get(urlPath, z.string());
        }
      ),
      { numRuns: 20 }
    );

    // All correlation IDs should be unique
    const uniqueIds = new Set(correlationIds);
    expect(uniqueIds.size).toBe(correlationIds.length);

    mockAdapter.restore();
  });
});

// ─── Property 11: Client-Side Response Validation ───────────────────────────────

describe('Property 11: Client-Side Response Validation', () => {
  let config: ApiClientConfig;

  beforeEach(() => {
    config = {
      baseUrl: 'http://localhost:3000/api',
      timeout: 5000,
    };
    Object.defineProperty(document, 'cookie', {
      writable: true,
      value: 'csrf-token=test-csrf',
    });
  });

  it('responses matching the Zod schema are returned successfully', async () => {
    const schema = z.object({
      id: z.number(),
      name: z.string(),
      active: z.boolean(),
    });

    await fc.assert(
      fc.asyncProperty(
        fc.record({
          id: fc.integer({ min: 1, max: 100000 }),
          name: fc.string({ minLength: 1, maxLength: 100 }),
          active: fc.boolean(),
        }),
        arbHttpMethod,
        async (validData, method) => {
          const client = createApiClient(config);
          const mockAdapter = new MockAdapter(client.http);

          mockAdapter.onAny().reply(200, wrapInEnvelope(validData));

          let result: unknown;
          if (method === 'get' || method === 'delete') {
            result = await client[method]('/test', schema);
          } else {
            result = await client[method]('/test', schema, {});
          }

          // The returned data should match the input
          expect(result).toEqual(validData);

          mockAdapter.restore();
        }
      ),
      { numRuns: 50 }
    );
  });

  it('responses NOT matching the Zod schema throw ZodError', async () => {
    // Schema expects { id: number, name: string }
    const schema = z.object({
      id: z.number(),
      name: z.string(),
    });

    // Generate data that does NOT match the schema
    // Strategy: generate objects where id is NOT a number or name is NOT a string
    const arbInvalidData = fc.oneof(
      // id is a string instead of number
      fc.record({
        id: fc.string({ minLength: 1, maxLength: 20 }),
        name: fc.string({ minLength: 1, maxLength: 50 }),
      }),
      // name is a number instead of string
      fc.record({
        id: fc.integer(),
        name: fc.integer(),
      }),
      // missing id field entirely
      fc.record({
        name: fc.string({ minLength: 1, maxLength: 50 }),
      }),
      // missing name field entirely
      fc.record({
        id: fc.integer(),
      }),
      // completely wrong shape
      fc.constant(null),
      fc.constant(undefined),
      fc.integer(),
      fc.string()
    );

    await fc.assert(
      fc.asyncProperty(
        arbInvalidData,
        arbHttpMethod,
        async (invalidData, method) => {
          const client = createApiClient(config);
          const mockAdapter = new MockAdapter(client.http);

          mockAdapter.onAny().reply(200, wrapInEnvelope(invalidData));

          try {
            if (method === 'get' || method === 'delete') {
              await client[method]('/test', schema);
            } else {
              await client[method]('/test', schema, {});
            }
            // If we reach here, the validation didn't throw - fail the test
            expect.fail('Expected ZodError to be thrown for invalid response data');
          } catch (error) {
            // Must be a ZodError
            expect(error).toBeInstanceOf(ZodError);
          }

          mockAdapter.restore();
        }
      ),
      { numRuns: 50 }
    );
  });

  it('validation works correctly for array schemas', async () => {
    const itemSchema = z.array(
      z.object({
        id: z.number(),
        value: z.string(),
      })
    );

    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            id: fc.integer({ min: 1, max: 10000 }),
            value: fc.string({ minLength: 1, maxLength: 50 }),
          }),
          { minLength: 0, maxLength: 10 }
        ),
        async (validArray) => {
          const client = createApiClient(config);
          const mockAdapter = new MockAdapter(client.http);

          mockAdapter.onGet('/items').reply(200, wrapInEnvelope(validArray));

          const result = await client.get('/items', itemSchema);
          expect(result).toEqual(validArray);

          mockAdapter.restore();
        }
      ),
      { numRuns: 30 }
    );
  });
});
