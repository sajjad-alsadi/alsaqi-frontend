/**
 * Property-based test for server-side findings filtering.
 *
 * Exercises the real request boundary: `useFindings` forwards its
 * `FindingsListParams` to `api.findings.list(params)`, and the Findings module
 * (`modules/findings.ts`) issues `client.get('/audit-findings', schema, { params })`.
 * The Axios adapter is stubbed (axios-mock-adapter) so the per-request `params`
 * sent to the server can be captured and compared against the generated filter
 * criteria, and so the number of network requests can be counted to prove the
 * client filters server-side rather than downloading the full set and filtering
 * locally.
 *
 * Feature: frontend-audit-remediation, Property 20: Server-side findings filtering
 * For any filter criteria, the findings request SHALL include those criteria as
 * request parameters and SHALL NOT rely on downloading the full set and filtering
 * on the client.
 * Validates: Requirements 24.1, 24.2
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import MockAdapter from 'axios-mock-adapter';
import { createApiClient, type ApiClientConfig } from '../../client';
import { createFindingsApi } from '../../modules/findings';
import type { FindingsListParams } from '../useFindings';

// ─── Shared helpers ─────────────────────────────────────────────────────────

const CONFIG: ApiClientConfig = {
  baseUrl: 'http://localhost:3000/api',
  timeout: 5000,
};

/**
 * A fixed, server-provided findings page. The objects deliberately span every
 * risk level / status so that, for any generated filter, the server-returned set
 * includes records that would NOT match if the client were filtering locally.
 * Asserting the client returns this set verbatim proves no client-side filtering.
 */
const SERVER_FINDINGS = [
  {
    id: 'f1',
    audit_id: 'a1',
    condition: 'c',
    criteria: 'cr',
    cause: 'ca',
    consequence: 'co',
    recommendation: 'r',
    risk_level: 'Low' as const,
    status: 'Open' as const,
  },
  {
    id: 'f2',
    audit_id: 'a2',
    condition: 'c',
    criteria: 'cr',
    cause: 'ca',
    consequence: 'co',
    recommendation: 'r',
    risk_level: 'High' as const,
    status: 'Closed' as const,
  },
];

/** A valid success envelope wrapping the server findings page. */
const ENVELOPE = {
  success: true,
  data: SERVER_FINDINGS,
  meta: {
    requestId: '550e8400-e29b-41d4-a716-446655440000',
    timestamp: '2024-01-01T00:00:00Z',
    version: '1.0.0',
  },
};

/**
 * Arbitrary `FindingsListParams`: every field is optional, so generated objects
 * range from `{}` to a fully-populated filter. Values are constrained to the
 * documented input space (valid risk levels / statuses, positive pagination).
 */
const arbParams: fc.Arbitrary<FindingsListParams> = fc.record(
  {
    page: fc.integer({ min: 1, max: 10_000 }),
    pageSize: fc.integer({ min: 1, max: 500 }),
    audit_id: fc.string(),
    risk_level: fc.constantFrom('Low', 'Medium', 'High'),
    status: fc.constantFrom('Open', 'In Progress', 'Closed'),
    search: fc.string(),
  },
  { requiredKeys: [] }
);

describe('Property 20: Server-side findings filtering', () => {
  it('forwards any filter criteria as request params in a single server request and does not filter on the client', async () => {
    await fc.assert(
      fc.asyncProperty(arbParams, async (params) => {
        const client = createApiClient(CONFIG);
        const findings = createFindingsApi(client);
        const mock = new MockAdapter(client.http);

        const capturedParams: Array<unknown> = [];
        let requestCount = 0;

        mock.onGet('/audit-findings').reply((reqConfig) => {
          requestCount += 1;
          capturedParams.push(reqConfig.params);
          return [200, ENVELOPE];
        });

        const result = await findings.list(params);

        // Req 24.1: the filter criteria are forwarded to the server as the
        // request params, exactly as provided (no criteria dropped or mutated).
        expect(requestCount).toBeGreaterThanOrEqual(1);
        expect(capturedParams[0]).toEqual(params);

        // Req 24.2: the client issues a single filtered request (it does not
        // fetch the full set in one call and a filtered subset in another), and
        // it returns the server-provided page verbatim — including records that
        // would not match `params` — proving it does not filter locally.
        expect(requestCount).toBe(1);
        expect(result).toEqual(SERVER_FINDINGS);

        mock.restore();
      }),
      { numRuns: 100 }
    );
  });
});
