/**
 * Property-based tests for stable, message-independent auth error mapping.
 *
 * Feature: frontend-audit-remediation, Property 5: Auth error mapping is total
 * and message-independent
 *
 * Property 5: Auth error mapping is total and message-independent
 *   - For any authentication error input, `mapAuthError` returns a defined
 *     `AuthErrorCode`; and for any two errors with equal HTTP status and equal
 *     server error code but differing message text, the mapped codes are equal.
 *   **Validates: Requirements 4.4, 4.5**
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { AxiosError, type AxiosResponse } from 'axios';
import { mapAuthError, type AuthErrorCode } from '../auth';

// The complete, closed set of stable codes `mapAuthError` may return. Totality
// means every input maps to one of these.
const ALL_AUTH_ERROR_CODES: readonly AuthErrorCode[] = [
  'invalid_credentials',
  'account_locked',
  'rate_limited',
  'server_error',
  'network_error',
  'unknown',
];

/**
 * Build an AxiosError carrying a response with the given status, an optional
 * server `error.code`, and a free-form message placed in both the error's
 * top-level `message` and the response body's `error.message`. The message is
 * the only thing that varies in the message-independence test, so embedding it
 * in every place a naive implementation might inspect makes the test strict.
 */
function makeAxiosError(
  status: number,
  serverCode: string | undefined,
  message: string
): AxiosError {
  const config = { url: '/v1/auth/login' } as never;
  const data: Record<string, unknown> = {
    error: {
      ...(serverCode !== undefined ? { code: serverCode } : {}),
      message,
    },
    message,
  };
  const response = {
    status,
    statusText: message,
    data,
    headers: {},
    config,
  } as AxiosResponse;
  return new AxiosError(message, 'ERR_BAD_RESPONSE', config, {}, response);
}

// A mix of recognized and unrecognized server error codes, plus "absent".
const serverCodeArb = fc.oneof(
  fc.constant(undefined),
  fc.constantFrom(
    'INVALID_CREDENTIALS',
    'UNAUTHORIZED',
    'ACCOUNT_LOCKED',
    'ACCOUNT_DISABLED',
    'ACCOUNT_SUSPENDED',
    'RATE_LIMIT_EXCEEDED',
    'INTERNAL_ERROR',
    'DATABASE_ERROR'
  ),
  // Unrecognized codes exercise the status fallback path.
  fc.string()
);

// Arbitrary, wide-ranging inputs covering every input shape `mapAuthError`
// must tolerate: non-Axios primitives/objects/Errors, network errors (no
// response), and response-bearing Axios errors with random statuses and codes.
const anyErrorInputArb = fc.oneof(
  fc.constant(null),
  fc.constant(undefined),
  fc.string(),
  fc.integer(),
  fc.boolean(),
  fc.object(),
  fc.string().map((m) => new Error(m)),
  // Network error: AxiosError with no response.
  fc
    .string()
    .map((m) => new AxiosError(m, 'ERR_NETWORK', { url: '/v1/auth/login' } as never, {})),
  // Response-bearing Axios error with random status, server code, and message.
  fc
    .tuple(fc.integer({ min: 100, max: 599 }), serverCodeArb, fc.string())
    .map(([status, code, message]) => makeAxiosError(status, code, message))
);

describe('Property 5: auth error mapping is total', () => {
  it('returns a defined AuthErrorCode for any input', () => {
    fc.assert(
      fc.property(anyErrorInputArb, (input) => {
        const result = mapAuthError(input);
        expect(result).toBeDefined();
        expect(ALL_AUTH_ERROR_CODES).toContain(result.code);
      }),
      { numRuns: 200 }
    );
  });
});

describe('Property 5: auth error mapping is message-independent', () => {
  it('maps two errors with equal status and equal server code to the same code regardless of message text', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 100, max: 599 }),
        serverCodeArb,
        // Two independent, free-form message strings.
        fc.string(),
        fc.string(),
        (status, serverCode, messageA, messageB) => {
          const errorA = makeAxiosError(status, serverCode, messageA);
          const errorB = makeAxiosError(status, serverCode, messageB);

          expect(mapAuthError(errorA).code).toBe(mapAuthError(errorB).code);
        }
      ),
      { numRuns: 200 }
    );
  });

  it('maps two network errors (no response) to network_error regardless of message text', () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), (messageA, messageB) => {
        const errorA = new AxiosError(
          messageA,
          'ERR_NETWORK',
          { url: '/v1/auth/login' } as never,
          {}
        );
        const errorB = new AxiosError(
          messageB,
          'ERR_NETWORK',
          { url: '/v1/auth/login' } as never,
          {}
        );

        expect(mapAuthError(errorA).code).toBe('network_error');
        expect(mapAuthError(errorB).code).toBe('network_error');
        expect(mapAuthError(errorA).code).toBe(mapAuthError(errorB).code);
      }),
      { numRuns: 100 }
    );
  });
});
