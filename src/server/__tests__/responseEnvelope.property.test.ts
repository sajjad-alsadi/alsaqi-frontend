// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import fc from 'fast-check';
import { createResponseWrapper } from '../middleware/responseWrapper';
import { createMockRequest, createMockNext } from './helpers/apiTestUtils';

/**
 * Property Test: Response Envelope Structure Consistency (Property 1)
 *
 * Feature: api-audit-improvements
 * Property 1: Response Envelope Structure Consistency
 *
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.6**
 *
 * For any API response with any HTTP status code, the response envelope SHALL have
 * `success` equal to `true` if and only if the status code is in [200, 399],
 * SHALL always contain a `meta` object with a valid UUID `requestId` and a valid
 * ISO 8601 `timestamp`, and SHALL populate `data` for success responses or `error`
 * (with `code`, `message`, `traceId`) for error responses.
 */

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** UUID v4 regex pattern */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** ISO 8601 date-time regex (simplified, validates parseable format) */
const ISO_8601_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

/**
 * Creates a wrappable mock response that supports res.json override by the middleware.
 */
function createWrappableResponse(statusCode: number) {
  const res: any = {
    statusCode,
    _headers: {} as Record<string, string>,
    _jsonOutput: null as any,
    headersSent: false,
  };

  res.json = vi.fn(function (this: any, data: any) {
    this._jsonOutput = data;
    this.headersSent = true;
    return this;
  });
  res.json = res.json.bind(res);

  res.setHeader = vi.fn((name: string, value: string) => {
    res._headers[name.toLowerCase()] = value;
    return res;
  });

  res.getHeader = vi.fn((name: string) => {
    return res._headers[name.toLowerCase()];
  });

  res.status = vi.fn((code: number) => {
    res.statusCode = code;
    return res;
  });

  return res;
}

// ─── Custom Arbitraries ──────────────────────────────────────────────────────

/** Generates HTTP status codes in the range [200, 599] */
const httpStatusCodeArb = fc.integer({ min: 200, max: 599 });

/** Generates valid UUID v4 strings for correlation IDs */
const uuidArb = fc.uuid();

/** Generates random response bodies: objects, arrays, strings, numbers, null */
const responseBodyArb = fc.oneof(
  fc.dictionary(fc.string({ minLength: 1, maxLength: 20 }), fc.jsonValue(), { maxKeys: 5 }),
  fc.array(fc.jsonValue(), { maxLength: 5 }),
  fc.string({ maxLength: 50 }),
  fc.constant(null)
);

/** Generates error-like response bodies with code, message, traceId */
const errorBodyArb = fc.record({
  code: fc.stringMatching(/^[A-Z_]{3,30}$/),
  message: fc.string({ minLength: 1, maxLength: 100 }),
  traceId: fc.uuid(),
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Property 1: Response Envelope Structure Consistency', () => {
  it('success field is true iff status code is in [200, 399]', () => {
    fc.assert(
      fc.property(httpStatusCodeArb, uuidArb, responseBodyArb, (statusCode, correlationId, body) => {
        const req = createMockRequest({ headers: {} });
        (req as any).correlationId = correlationId;
        const res = createWrappableResponse(statusCode);
        const middleware = createResponseWrapper();
        const next = createMockNext();

        middleware(req, res, next);
        res.json(body);

        const output = res._jsonOutput;
        const isSuccess = statusCode >= 200 && statusCode <= 399;

        expect(output.success).toBe(isSuccess);
      }),
      { numRuns: 200 }
    );
  });

  it('meta.requestId is always a valid UUID', () => {
    fc.assert(
      fc.property(httpStatusCodeArb, uuidArb, responseBodyArb, (statusCode, correlationId, body) => {
        const req = createMockRequest({ headers: {} });
        (req as any).correlationId = correlationId;
        const res = createWrappableResponse(statusCode);
        const middleware = createResponseWrapper();
        const next = createMockNext();

        middleware(req, res, next);
        res.json(body);

        const output = res._jsonOutput;

        expect(output.meta).toBeDefined();
        expect(output.meta.requestId).toBe(correlationId);
        expect(output.meta.requestId).toMatch(UUID_REGEX);
      }),
      { numRuns: 200 }
    );
  });

  it('meta.timestamp is always a valid ISO 8601 string', () => {
    fc.assert(
      fc.property(httpStatusCodeArb, uuidArb, responseBodyArb, (statusCode, correlationId, body) => {
        const req = createMockRequest({ headers: {} });
        (req as any).correlationId = correlationId;
        const res = createWrappableResponse(statusCode);
        const middleware = createResponseWrapper();
        const next = createMockNext();

        middleware(req, res, next);
        res.json(body);

        const output = res._jsonOutput;

        expect(output.meta.timestamp).toBeDefined();
        expect(output.meta.timestamp).toMatch(ISO_8601_REGEX);
        // Verify it parses to a valid date
        const parsed = new Date(output.meta.timestamp);
        expect(parsed.toISOString()).toBe(output.meta.timestamp);
      }),
      { numRuns: 200 }
    );
  });

  it('success responses (200-399) populate data field', () => {
    const successStatusArb = fc.integer({ min: 200, max: 399 });

    fc.assert(
      fc.property(successStatusArb, uuidArb, responseBodyArb, (statusCode, correlationId, body) => {
        const req = createMockRequest({ headers: {} });
        (req as any).correlationId = correlationId;
        const res = createWrappableResponse(statusCode);
        const middleware = createResponseWrapper();
        const next = createMockNext();

        middleware(req, res, next);
        res.json(body);

        const output = res._jsonOutput;

        expect(output.success).toBe(true);
        // data field should be present (may be null for null body, but field exists)
        expect('data' in output).toBe(true);
      }),
      { numRuns: 200 }
    );
  });

  it('error responses (400+) populate error field and set data to null', () => {
    const errorStatusArb = fc.integer({ min: 400, max: 599 });

    fc.assert(
      fc.property(errorStatusArb, uuidArb, errorBodyArb, (statusCode, correlationId, errorBody) => {
        const req = createMockRequest({ headers: {} });
        (req as any).correlationId = correlationId;
        const res = createWrappableResponse(statusCode);
        const middleware = createResponseWrapper();
        const next = createMockNext();

        middleware(req, res, next);
        res.json(errorBody);

        const output = res._jsonOutput;

        expect(output.success).toBe(false);
        expect(output.data).toBeNull();
        expect(output.error).toBeDefined();
        // The error field should contain the body passed to res.json
        expect(output.error).toEqual(errorBody);
      }),
      { numRuns: 200 }
    );
  });

  it('error responses contain code, message, and traceId when provided', () => {
    const errorStatusArb = fc.integer({ min: 400, max: 599 });

    fc.assert(
      fc.property(errorStatusArb, uuidArb, errorBodyArb, (statusCode, correlationId, errorBody) => {
        const req = createMockRequest({ headers: {} });
        (req as any).correlationId = correlationId;
        const res = createWrappableResponse(statusCode);
        const middleware = createResponseWrapper();
        const next = createMockNext();

        middleware(req, res, next);
        res.json(errorBody);

        const output = res._jsonOutput;

        expect(output.error.code).toBe(errorBody.code);
        expect(output.error.message).toBe(errorBody.message);
        expect(output.error.traceId).toBe(errorBody.traceId);
      }),
      { numRuns: 200 }
    );
  });

  it('X-Request-Id header is set to the correlation ID for all status codes', () => {
    fc.assert(
      fc.property(httpStatusCodeArb, uuidArb, responseBodyArb, (statusCode, correlationId, body) => {
        const req = createMockRequest({ headers: {} });
        (req as any).correlationId = correlationId;
        const res = createWrappableResponse(statusCode);
        const middleware = createResponseWrapper();
        const next = createMockNext();

        middleware(req, res, next);
        res.json(body);

        expect(res.setHeader).toHaveBeenCalledWith('X-Request-Id', correlationId);
      }),
      { numRuns: 200 }
    );
  });

  it('meta.version is always present as a string', () => {
    fc.assert(
      fc.property(httpStatusCodeArb, uuidArb, responseBodyArb, (statusCode, correlationId, body) => {
        const req = createMockRequest({ headers: {} });
        (req as any).correlationId = correlationId;
        const res = createWrappableResponse(statusCode);
        const middleware = createResponseWrapper();
        const next = createMockNext();

        middleware(req, res, next);
        res.json(body);

        const output = res._jsonOutput;

        expect(typeof output.meta.version).toBe('string');
        expect(output.meta.version.length).toBeGreaterThan(0);
      }),
      { numRuns: 200 }
    );
  });
});
