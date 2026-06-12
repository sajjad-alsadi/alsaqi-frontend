/**
 * Property 3 (Interceptor): Preservation - Success-Envelope Unwrapping Unchanged
 *
 * **Validates: Requirements 3.3**
 *
 * PRESERVATION TEST (bugfix workflow).
 *
 * The compliance-matrix bugfix is consumer-side only: the response interceptor in
 * `apps/web/src/api/client.ts` that unwraps `{ success: true, data: T }` → `T`
 * MUST NOT be modified, because every other consumer of the shared `api` instance
 * (e.g. `useFraudLog.ts`, which reads `res.data.data || (Array.isArray(res.data) ? res.data : [])`)
 * depends on receiving the already-unwrapped payload.
 *
 * This test exercises the REAL client interceptor (not a mock) via the raw
 * `client.http` instance — the exact instance exported as `api` from
 * `httpClient.ts` — and asserts that:
 *   - success-enveloped responses are unwrapped to their inner `data` (any shape:
 *     array, object, null), and
 *   - non-enveloped responses pass through untouched.
 *
 * EXPECTED OUTCOME ON UNFIXED CODE: PASS. It MUST keep passing after the fix,
 * confirming the interceptor is unchanged.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';
import MockAdapter from 'axios-mock-adapter';
import { createApiClient } from '../client';

const config = { baseUrl: 'http://localhost:3000/api', timeout: 5000 };

beforeEach(() => {
  Object.defineProperty(document, 'cookie', {
    writable: true,
    value: 'csrf-token=test-csrf',
  });
});

afterEach(() => {
  Object.defineProperty(document, 'cookie', { writable: true, value: '' });
});

// Inner payloads of varying shape — arrays, objects, primitives.
const arbInner = fc.oneof(
  fc.array(fc.record({ id: fc.integer({ min: 1, max: 100000 }) }), {
    minLength: 0,
    maxLength: 8,
  }),
  fc.record({
    total: fc.integer({ min: 0, max: 10000 }),
    label: fc.string({ minLength: 0, maxLength: 20 }),
  }),
  fc.string({ minLength: 0, maxLength: 20 }),
  fc.integer()
);

describe('Property 3 (Interceptor): success-envelope unwrapping is preserved unchanged', () => {
  it('unwraps { success: true, data: T } to T for arbitrary inner payloads', async () => {
    await fc.assert(
      fc.asyncProperty(arbInner, async (inner) => {
        const client = createApiClient(config);
        const mock = new MockAdapter(client.http);
        mock.onGet('/x').reply(200, { success: true, data: inner });

        // Raw http instance == the `api` consumers use.
        const res = await client.http.get('/x');
        expect(res.data).toEqual(inner);

        mock.restore();
      }),
      { numRuns: 40 }
    );
  });

  it('unwraps a null-data envelope to null (the crash-triggering compliance case)', async () => {
    const client = createApiClient(config);
    const mock = new MockAdapter(client.http);
    mock.onGet('/compliance').reply(200, { success: true, data: null });

    const res = await client.http.get('/compliance');
    expect(res.data).toBeNull();

    mock.restore();
  });

  it('leaves non-enveloped { data, pagination } responses untouched', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          data: fc.array(fc.record({ id: fc.integer({ min: 1, max: 9999 }) }), {
            minLength: 0,
            maxLength: 6,
          }),
          pagination: fc.record({
            total: fc.integer({ min: 0, max: 10000 }),
            totalPages: fc.integer({ min: 0, max: 500 }),
          }),
        }),
        async (payload) => {
          const client = createApiClient(config);
          const mock = new MockAdapter(client.http);
          mock.onGet('/correspondence/incoming').reply(200, payload);

          const res = await client.http.get('/correspondence/incoming');
          // No `success` field → interceptor must NOT unwrap; the sibling
          // `pagination` is still reachable.
          expect(res.data).toEqual(payload);
          expect(res.data.data).toEqual(payload.data);
          expect(res.data.pagination).toEqual(payload.pagination);

          mock.restore();
        }
      ),
      { numRuns: 40 }
    );
  });
});
