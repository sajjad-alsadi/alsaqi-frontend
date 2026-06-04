/**
 * Property Test: Validation Error Round-Trip (Property 10)
 *
 * Feature: api-isolation
 * Property 10: دورة أخطاء التحقق (Validation Error Round-Trip)
 *
 * **Validates: Requirements 10.5, 12.4**
 *
 * For any array of field-level errors (each with path, message, code),
 * when wrapped in the standard error response format and parsed by
 * parseValidationErrors, the output correctly maps each field path to its
 * error message.
 *
 * Also tests the inverse: for any non-conformant response body (missing
 * success field, wrong structure, etc.), parseValidationErrors returns null.
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { AxiosError, type AxiosResponse } from 'axios';
import { parseValidationErrors, detailsToFieldErrors } from '../utils/error-parser';
import { ErrorResponseSchema } from '@alsaqi/shared';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function createAxiosError(status: number, data: unknown): AxiosError {
  const response = {
    status,
    data,
    headers: {},
    statusText: status === 400 ? 'Bad Request' : 'Error',
    config: {} as any,
  } as AxiosResponse;

  const error = new AxiosError(
    'Request failed',
    AxiosError.ERR_BAD_REQUEST,
    {} as any,
    {},
    response
  );

  return error;
}

// ─── Arbitraries ─────────────────────────────────────────────────────────────

/** Generates a valid field path (simple or dot-separated) */
const fieldPathArb = fc.oneof(
  // Simple field name
  fc.stringMatching(/^[a-zA-Z_][a-zA-Z0-9_]{0,20}$/),
  // Dot-separated nested path
  fc
    .array(fc.stringMatching(/^[a-zA-Z_][a-zA-Z0-9_]{0,10}$/), {
      minLength: 2,
      maxLength: 4,
    })
    .map((parts) => parts.join('.'))
);

/** Generates a non-empty human-readable error message */
const errorMessageArb = fc
  .string({ minLength: 1, maxLength: 200 })
  .filter((s) => s.trim().length > 0);

/** Generates a valid Zod issue code */
const zodIssueCodeArb = fc.constantFrom(
  'too_small',
  'too_big',
  'invalid_enum_value',
  'invalid_type',
  'invalid_string',
  'custom'
);

/** Generates a single field-level error detail */
const errorDetailArb = fc.record({
  path: fieldPathArb,
  message: errorMessageArb,
  code: zodIssueCodeArb,
});

/** Generates an array of field-level error details with unique paths */
const errorDetailsArrayArb = fc
  .array(errorDetailArb, { minLength: 1, maxLength: 10 })
  .map((details) => {
    // Ensure unique paths (keep first occurrence of each path)
    const seen = new Set<string>();
    return details.filter((d) => {
      if (seen.has(d.path)) return false;
      seen.add(d.path);
      return true;
    });
  })
  .filter((details) => details.length > 0);

/** Generates a valid UUID v4 */
const uuidArb = fc.uuid();

/** Generates a valid ISO datetime string */
const isoDateTimeArb = fc
  .date({ min: new Date('2020-01-01T00:00:00.000Z'), max: new Date('2030-12-31T23:59:59.999Z') })
  .filter((d) => !isNaN(d.getTime()))
  .map((d) => d.toISOString());

/** Generates a valid semver string */
const semverArb = fc
  .tuple(
    fc.integer({ min: 0, max: 10 }),
    fc.integer({ min: 0, max: 20 }),
    fc.integer({ min: 0, max: 100 })
  )
  .map(([major, minor, patch]) => `${major}.${minor}.${patch}`);

/**
 * Wraps error details in a standard ErrorResponse envelope
 */
function wrapInErrorResponse(
  details: Array<{ path: string; message: string; code: string }>,
  requestId: string,
  timestamp: string,
  version: string
) {
  return {
    success: false as const,
    data: null,
    error: {
      code: 'VALIDATION_ERROR',
      message: 'Validation failed',
      traceId: 'trace-' + requestId.slice(0, 8),
      details,
    },
    meta: {
      requestId,
      timestamp,
      version,
    },
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Property 10: Validation Error Round-Trip', () => {
  describe('Conformant validation errors are correctly parsed', () => {
    it('for any array of field-level errors wrapped in standard format, parseValidationErrors maps each field path to its error message', () => {
      fc.assert(
        fc.property(
          errorDetailsArrayArb,
          uuidArb,
          isoDateTimeArb,
          semverArb,
          (details, requestId, timestamp, version) => {
            // Wrap errors in the standard error response format
            const responseBody = wrapInErrorResponse(
              details,
              requestId,
              timestamp,
              version
            );

            // Create an AxiosError with 400 status
            const axiosError = createAxiosError(400, responseBody);

            // Parse with parseValidationErrors
            const result = parseValidationErrors(axiosError);

            // Should NOT return null for conformant error responses
            expect(result).not.toBeNull();

            // Should map each field path to its corresponding error message
            for (const detail of details) {
              expect(result![detail.path]).toBe(detail.message);
            }

            // Should have exactly the same number of fields as unique paths
            expect(Object.keys(result!).length).toBe(details.length);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('detailsToFieldErrors correctly maps any array of ErrorDetails to a field-keyed object', () => {
      fc.assert(
        fc.property(errorDetailsArrayArb, (details) => {
          const result = detailsToFieldErrors(details);

          // Every detail's path should be a key in result
          for (const detail of details) {
            expect(result[detail.path]).toBe(detail.message);
          }

          // Number of keys equals number of unique paths in input
          expect(Object.keys(result).length).toBe(details.length);
        }),
        { numRuns: 100 }
      );
    });

    it('the parsed response conforms to ErrorResponseSchema before parsing field errors', () => {
      fc.assert(
        fc.property(
          errorDetailsArrayArb,
          uuidArb,
          isoDateTimeArb,
          semverArb,
          (details, requestId, timestamp, version) => {
            const responseBody = wrapInErrorResponse(
              details,
              requestId,
              timestamp,
              version
            );

            // The wrapped response should validate against ErrorResponseSchema
            const schemaResult = ErrorResponseSchema.safeParse(responseBody);
            expect(schemaResult.success).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Non-conformant responses return null', () => {
    it('for any response body missing the success field, parseValidationErrors returns null', () => {
      fc.assert(
        fc.property(
          fc.record({
            data: fc.constant(null),
            error: fc.record({
              code: fc.string({ minLength: 1 }),
              message: fc.string({ minLength: 1 }),
              traceId: fc.string({ minLength: 1 }),
            }),
          }),
          (body) => {
            // Body without `success` field
            const axiosError = createAxiosError(400, body);
            const result = parseValidationErrors(axiosError);
            expect(result).toBeNull();
          }
        ),
        { numRuns: 50 }
      );
    });

    it('for any response body with success: true (not an error), parseValidationErrors returns null', () => {
      fc.assert(
        fc.property(
          fc.record({
            success: fc.constant(true),
            data: fc.anything(),
            meta: fc.record({
              requestId: uuidArb,
              timestamp: isoDateTimeArb,
              version: semverArb,
            }),
          }),
          (body) => {
            const axiosError = createAxiosError(400, body);
            const result = parseValidationErrors(axiosError);
            expect(result).toBeNull();
          }
        ),
        { numRuns: 50 }
      );
    });

    it('for any non-400 status code with valid error body, parseValidationErrors returns null', () => {
      fc.assert(
        fc.property(
          errorDetailsArrayArb,
          uuidArb,
          isoDateTimeArb,
          semverArb,
          fc.constantFrom(401, 403, 404, 500, 502, 503),
          (details, requestId, timestamp, version, status) => {
            const responseBody = wrapInErrorResponse(
              details,
              requestId,
              timestamp,
              version
            );

            const axiosError = createAxiosError(status, responseBody);
            const result = parseValidationErrors(axiosError);
            expect(result).toBeNull();
          }
        ),
        { numRuns: 50 }
      );
    });

    it('for any response body with wrong structure (arbitrary JSON), parseValidationErrors returns null', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.string(),
            fc.integer(),
            fc.boolean(),
            fc.constant(null),
            fc.array(fc.string(), { maxLength: 3 }),
            fc.record({
              message: fc.string(),
              errors: fc.array(fc.string()),
            }),
            fc.record({
              success: fc.constant(false),
              // Missing data/error/meta structure
              message: fc.string(),
            })
          ),
          (body) => {
            const axiosError = createAxiosError(400, body);
            const result = parseValidationErrors(axiosError);
            expect(result).toBeNull();
          }
        ),
        { numRuns: 50 }
      );
    });

    it('for any response body with invalid meta (bad requestId format), parseValidationErrors returns null', () => {
      fc.assert(
        fc.property(
          errorDetailsArrayArb,
          fc.string({ minLength: 1, maxLength: 20 }).filter((s) => !s.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)),
          isoDateTimeArb,
          semverArb,
          (details, invalidRequestId, timestamp, version) => {
            const responseBody = {
              success: false as const,
              data: null,
              error: {
                code: 'VALIDATION_ERROR',
                message: 'Validation failed',
                traceId: 'trace-123',
                details,
              },
              meta: {
                requestId: invalidRequestId,
                timestamp,
                version,
              },
            };

            const axiosError = createAxiosError(400, responseBody);
            const result = parseValidationErrors(axiosError);
            expect(result).toBeNull();
          }
        ),
        { numRuns: 50 }
      );
    });
  });
});
