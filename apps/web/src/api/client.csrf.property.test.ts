/**
 * Property-based test for CSRF token cookie parsing.
 *
 * Property 2: CSRF token parse preserves the full value and round-trips encoding
 *
 * For any token value (including base64 `=` padding and URL-encoded
 * characters), parsing the cookie row `"csrf-token=" + encodeURIComponent(value)`
 * yields exactly the original value — every character after the first `=` is
 * preserved and then `decodeURIComponent` is applied — and the value attached to
 * the outgoing request header equals the original token. The same contract holds
 * for both `Api_Client` (`x-csrf-token` request header) and `Error_Reporter`
 * (`x-csrf-token` header on the forwarded error report).
 *
 * **Validates: Requirements 6.1, 6.2, 6.3, 6.4**
 *
 * Feature: code-review-remediation, Property 2
 *
 * Strategy: drive the REAL surfaces rather than the private `getCsrfToken`.
 * For `Api_Client`, set `document.cookie` to the encoded row, issue a POST
 * through `createApiClient` + axios-mock-adapter, and assert the captured
 * `x-csrf-token` header equals the original value. For `Error_Reporter`, set the
 * same cookie, stub `fetch`, call the public `report(...)`, and assert the
 * captured `x-csrf-token` header equals the original value.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import MockAdapter from 'axios-mock-adapter';
import { z } from 'zod';
import fc from 'fast-check';
import { createApiClient, type ApiClientConfig } from './client';
import { errorReporter } from '../utils/errorReporter';

const responseSchema = z.object({ ok: z.boolean() });

function successEnvelope() {
  return {
    success: true,
    data: { ok: true },
    meta: {
      requestId: '550e8400-e29b-41d4-a716-446655440000',
      timestamp: '2024-01-01T00:00:00Z',
      version: '1.0.0',
    },
  };
}

/**
 * Set `document.cookie` to a single, raw cookie row. Overriding the property
 * directly (rather than assigning through jsdom's cookie jar) lets the test
 * feed the exact `"csrf-token=" + encoded` row the parser will see, without
 * jsdom re-encoding or rejecting characters.
 */
function setCookieRow(row: string): void {
  Object.defineProperty(document, 'cookie', { writable: true, configurable: true, value: row });
}

/**
 * Token-value arbitrary. Exercises the two interesting axes called out by the
 * property:
 *  - base64 strings (which carry `=` padding that a naive `split('=')[1]` would
 *    truncate), and
 *  - free-form strings over a safe BMP alphabet that includes URL-special and
 *    cookie-meaningful characters (`= + / % & ; space :`), so `decodeURIComponent`
 *    round-tripping is genuinely tested.
 *
 * All characters are within the BMP and contain no lone surrogates, so
 * `encodeURIComponent` never throws when building the cookie row. Values are
 * non-empty because the request interceptors only attach the header for a
 * truthy token.
 */
const tokenArb: fc.Arbitrary<string> = fc.oneof(
  fc.base64String({ minLength: 1, maxLength: 48 }),
  fc
    .array(
      fc.constantFrom(
        ...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=%&;: ?#[]@!$\'()*,.~-_'.split(
          ''
        )
      ),
      { minLength: 1, maxLength: 48 }
    )
    .map((chars) => chars.join(''))
);

describe('Property 2: CSRF token parse preserves the full value and round-trips encoding (Requirements 6.1, 6.2, 6.3, 6.4)', () => {
  let config: ApiClientConfig;

  beforeEach(() => {
    config = { baseUrl: 'http://localhost:3000/api', timeout: 5000, onUnauthorized: vi.fn() };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('Api_Client attaches the full, decoded token as the x-csrf-token header', async () => {
    await fc.assert(
      fc.asyncProperty(tokenArb, async (value) => {
        // The cookie stores the URL-encoded token; encodeURIComponent never
        // emits a bare '=', so indexOf('=') reliably finds the key/value
        // separator and slice() preserves the entire encoded value.
        setCookieRow(`csrf-token=${encodeURIComponent(value)}`);

        const client = createApiClient(config);
        const mock = new MockAdapter(client.http);

        let captured: string | undefined;
        mock.onPost('/csrf-roundtrip').reply((reqConfig) => {
          captured = reqConfig.headers?.['x-csrf-token'] as string | undefined;
          return [200, successEnvelope()];
        });

        try {
          await client.post('/csrf-roundtrip', responseSchema, { field: 'body' });
          // Header equals the original token: full value preserved + decoded.
          expect(captured).toBe(value);
        } finally {
          mock.restore();
        }
      }),
      { numRuns: 100 }
    );
  });

  it('Error_Reporter forwards the full, decoded token as the x-csrf-token header', async () => {
    await fc.assert(
      fc.asyncProperty(tokenArb, async (value) => {
        setCookieRow(`csrf-token=${encodeURIComponent(value)}`);

        let captured: string | undefined;
        const fetchMock = vi.fn(async (_url: unknown, init?: RequestInit) => {
          const headers = (init?.headers ?? {}) as Record<string, string>;
          captured = headers['x-csrf-token'];
          return { ok: true, status: 200 } as Response;
        });
        vi.stubGlobal('fetch', fetchMock);

        try {
          // report() sends immediately (fire-and-forget). Flush the microtask +
          // macrotask queue so the stubbed fetch resolves and headers are captured.
          errorReporter.report({ module: 'csrf-prop', message: 'x', severity: 'low' });
          await new Promise((resolve) => setTimeout(resolve, 0));

          expect(fetchMock).toHaveBeenCalledTimes(1);
          expect(captured).toBe(value);
        } finally {
          vi.unstubAllGlobals();
        }
      }),
      { numRuns: 100 }
    );
  });
});
