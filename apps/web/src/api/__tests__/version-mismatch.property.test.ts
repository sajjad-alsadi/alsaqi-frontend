/**
 * Property-based tests for the API Client version-mismatch notification.
 *
 * Feature: frontend-consistency-fixes, Property 4: Patch-insensitive version match
 * drives the mismatch notification.
 *
 * For any pair of version strings whose major and minor components are equal
 * (regardless of any patch component or its absence), the version check reports a
 * match and shows no notification; for any response carrying an `x-api-version`
 * header whose major or minor component differs from the API_VERSION constant, the
 * check reports a mismatch and the non-dismissible version-mismatch overlay is shown
 * (at most once); for any response with no `x-api-version` header, no comparison is
 * performed and no notification is shown.
 *
 * **Validates: Requirements 5.4, 5.6, 5.7**
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import fc from 'fast-check';
import MockAdapter from 'axios-mock-adapter';
import { z } from 'zod';
import { API_VERSION } from '@alsaqi/shared';

// ─── Constants derived from the client's API_VERSION ────────────────────────────

const [API_MAJOR, API_MINOR] = API_VERSION.split('.').map(Number);

const OVERLAY_ID = 'api-version-mismatch-overlay';

// ─── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Wrap data in the standard ApiResponse envelope so the response interceptor's
 * envelope unwrapping + Zod validation succeed.
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

/**
 * Reset the module registry and the DOM so the module-level `versionMismatchShown`
 * guard starts fresh for each property run. Returns a freshly-imported client
 * factory bound to a clean module state.
 */
async function freshClient() {
  vi.resetModules();
  document.body.innerHTML = '';
  Object.defineProperty(document, 'cookie', { writable: true, value: 'csrf-token=test' });
  const mod = await import('../client');
  const client = mod.createApiClient({ baseUrl: 'http://localhost:3000/api', timeout: 5000 });
  const mockAdapter = new MockAdapter(client.http);
  return { client, mockAdapter };
}

function overlayCount(): number {
  return document.querySelectorAll(`#${OVERLAY_ID}`).length;
}

// ─── Generators ──────────────────────────────────────────────────────────────────

/**
 * Versions whose major.minor equal API_VERSION's major.minor, with the patch
 * component either absent or arbitrary (and arbitrary value) → should MATCH.
 */
const arbMatchingVersion = fc.oneof(
  // No patch component at all (e.g. "1.0")
  fc.constant(`${API_MAJOR}.${API_MINOR}`),
  // Arbitrary patch component (e.g. "1.0.0", "1.0.42")
  fc.nat({ max: 9999 }).map((patch) => `${API_MAJOR}.${API_MINOR}.${patch}`)
);

/**
 * Versions whose major OR minor differs from API_VERSION → should MISMATCH.
 * Patch may be present or absent; it must not influence the outcome.
 */
const arbMismatchingVersion = fc
  .tuple(
    fc.nat({ max: 50 }),
    fc.nat({ max: 50 }),
    fc.option(fc.nat({ max: 9999 }), { nil: undefined })
  )
  .filter(([major, minor]) => !(major === API_MAJOR && minor === API_MINOR))
  .map(([major, minor, patch]) =>
    patch === undefined ? `${major}.${minor}` : `${major}.${minor}.${patch}`
  );

// ─── Property 4 ──────────────────────────────────────────────────────────────────

describe('Property 4: Patch-insensitive version match drives the mismatch notification', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('equal major/minor (patch differing or absent) → match → no overlay shown', async () => {
    await fc.assert(
      fc.asyncProperty(arbMatchingVersion, async (serverVersion) => {
        const { client, mockAdapter } = await freshClient();

        mockAdapter.onGet('/test').reply(200, wrapInEnvelope('ok'), {
          'x-api-version': serverVersion,
        });

        await client.get('/test', z.string());

        expect(overlayCount()).toBe(0);

        mockAdapter.restore();
      }),
      { numRuns: 100 }
    );
  });

  it('perturbed major or minor → mismatch → overlay shown at most once across repeated mismatches', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(arbMismatchingVersion, { minLength: 1, maxLength: 5 }),
        async (serverVersions) => {
          const { client, mockAdapter } = await freshClient();

          // Each request returns a (possibly different) mismatching version header.
          let index = 0;
          mockAdapter.onGet('/test').reply(() => {
            const version = serverVersions[Math.min(index, serverVersions.length - 1)];
            index += 1;
            return [200, wrapInEnvelope('ok'), { 'x-api-version': version }];
          });

          // Drive the side effect repeatedly.
          for (let i = 0; i < serverVersions.length; i++) {
            await client.get('/test', z.string());
          }

          // Mismatch → overlay present, and shown at most once regardless of how
          // many mismatching responses arrived.
          expect(overlayCount()).toBe(1);

          mockAdapter.restore();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('no x-api-version header → no comparison → no overlay shown', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 5 }), async (requestCount) => {
        const { client, mockAdapter } = await freshClient();

        // No x-api-version header on the response.
        mockAdapter.onGet('/test').reply(200, wrapInEnvelope('ok'));

        for (let i = 0; i < requestCount; i++) {
          await client.get('/test', z.string());
        }

        expect(overlayCount()).toBe(0);

        mockAdapter.restore();
      }),
      { numRuns: 100 }
    );
  });
});
