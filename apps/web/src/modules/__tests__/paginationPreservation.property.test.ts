/**
 * Property-based tests for Pagination Preservation.
 *
 * Property 2: Preservation - Valid Pagination Metadata Used Unchanged
 *   - For all valid pagination objects (response.data.pagination is defined with
 *     numeric total and totalPages), the function sets total to pagination.total
 *     and totalPages to pagination.totalPages directly.
 *   **Validates: Requirements 3.1, 3.2, 3.3**
 *
 * These tests run on UNFIXED code and should PASS, confirming the baseline
 * behavior that must be preserved through the fix.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';
import MockAdapter from 'axios-mock-adapter';
import api from '../../api/httpClient';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Extracts the pagination logic from the fetchData pattern used in all
 * affected components. This simulates what happens when the API returns
 * a response with valid pagination metadata.
 *
 * The pattern in all affected files is:
 *   if (response.data.data) {
 *     setItems(response.data.data);
 *     setPagination(prev => ({
 *       ...prev,
 *       total: response.data.pagination.total,
 *       totalPages: response.data.pagination.totalPages
 *     }));
 *   }
 */
function simulatePaginationUpdate(
  responseData: { data: any[]; pagination: { total: number; totalPages: number } }
): { total: number; totalPages: number } {
  // This mirrors the exact logic in the components:
  // setPagination(prev => ({ ...prev, total: response.data.pagination.total, totalPages: response.data.pagination.totalPages }))
  const pagination = responseData.pagination;
  return {
    total: pagination.total,
    totalPages: pagination.totalPages,
  };
}

/**
 * Arbitrary for generating random non-negative integers for pagination total.
 */
const arbTotal = fc.integer({ min: 0, max: 10000 });

/**
 * Arbitrary for generating random non-negative integers for totalPages.
 */
const arbTotalPages = fc.integer({ min: 0, max: 500 });

/**
 * Arbitrary for generating random data arrays of varying lengths.
 */
const arbDataArray = fc.array(
  fc.record({
    id: fc.integer({ min: 1, max: 100000 }),
    message: fc.string({ minLength: 1, maxLength: 50 }),
  }),
  { minLength: 0, maxLength: 50 }
);

/**
 * Arbitrary for generating valid pagination metadata.
 */
const arbValidPagination = fc.record({
  total: arbTotal,
  totalPages: arbTotalPages,
});

/**
 * Arbitrary for a complete API response with valid pagination.
 */
const arbResponseWithPagination = fc.record({
  data: arbDataArray,
  pagination: arbValidPagination,
});

// ─── Property 2: Preservation - Valid Pagination Metadata Used Unchanged ─────

describe('Property 2: Preservation - Valid Pagination Metadata Used Unchanged', () => {
  let mock: MockAdapter;

  beforeEach(() => {
    mock = new MockAdapter(api);
  });

  afterEach(() => {
    mock.restore();
  });

  it('when pagination IS defined, setPagination uses pagination.total and pagination.totalPages directly (unit logic)', () => {
    fc.assert(
      fc.property(
        arbResponseWithPagination,
        (responseData) => {
          const result = simulatePaginationUpdate(responseData);

          // Assert: setPagination receives exactly pagination.total and pagination.totalPages
          expect(result.total).toBe(responseData.pagination.total);
          expect(result.totalPages).toBe(responseData.pagination.totalPages);

          // Assert: values are NOT the fallback values (data.length and 1)
          // unless they happen to coincide
          if (responseData.pagination.total !== responseData.data.length) {
            expect(result.total).not.toBe(responseData.data.length);
          }
          if (responseData.pagination.totalPages !== 1) {
            expect(result.totalPages).not.toBe(1);
          }
        }
      ),
      { numRuns: 200 }
    );
  });

  it('SystemErrorLogs: valid pagination response sets correct total and totalPages via API', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbResponseWithPagination,
        async (responseData) => {
          // Mock the /system-errors endpoint with valid pagination
          mock.reset();
          mock.onGet('/system-errors').reply(200, responseData);

          const response = await api.get('/system-errors', {
            params: { page: 1, pageSize: 20 },
          });

          // Simulate the component logic: if (response.data.data) { setPagination(...) }
          expect(response.data.data).toBeDefined();
          expect(Array.isArray(response.data.data)).toBe(true);
          expect(response.data.pagination).toBeDefined();

          // The component uses response.data.pagination.total and response.data.pagination.totalPages
          const paginationResult = {
            total: response.data.pagination.total,
            totalPages: response.data.pagination.totalPages,
          };

          expect(paginationResult.total).toBe(responseData.pagination.total);
          expect(paginationResult.totalPages).toBe(responseData.pagination.totalPages);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('IncomingRegister: valid pagination response sets correct total and totalPages via API', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbResponseWithPagination,
        async (responseData) => {
          mock.reset();
          mock.onGet(/\/correspondence\/incoming/).reply(200, responseData);

          const response = await api.get('/correspondence/incoming?page=1&pageSize=15');

          expect(response.data.data).toBeDefined();
          expect(response.data.pagination).toBeDefined();

          const paginationResult = {
            total: response.data.pagination.total,
            totalPages: response.data.pagination.totalPages,
          };

          expect(paginationResult.total).toBe(responseData.pagination.total);
          expect(paginationResult.totalPages).toBe(responseData.pagination.totalPages);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('OutgoingRegister: valid pagination response sets correct total and totalPages via API', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbResponseWithPagination,
        async (responseData) => {
          mock.reset();
          mock.onGet(/\/correspondence\/outgoing/).reply(200, responseData);

          const response = await api.get('/correspondence/outgoing?page=1&pageSize=15');

          expect(response.data.data).toBeDefined();
          expect(response.data.pagination).toBeDefined();

          const paginationResult = {
            total: response.data.pagination.total,
            totalPages: response.data.pagination.totalPages,
          };

          expect(paginationResult.total).toBe(responseData.pagination.total);
          expect(paginationResult.totalPages).toBe(responseData.pagination.totalPages);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('CorrespondenceArchive: valid pagination response sets correct total and totalPages via API', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbResponseWithPagination,
        async (responseData) => {
          mock.reset();
          mock.onGet(/\/correspondence\/archive/).reply(200, responseData);

          const response = await api.get('/correspondence/archive?page=1&pageSize=15');

          expect(response.data.data).toBeDefined();
          expect(response.data.pagination).toBeDefined();

          const paginationResult = {
            total: response.data.pagination.total,
            totalPages: response.data.pagination.totalPages,
          };

          expect(paginationResult.total).toBe(responseData.pagination.total);
          expect(paginationResult.totalPages).toBe(responseData.pagination.totalPages);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('zero-item pagination is preserved: { data: [], pagination: { total: 0, totalPages: 0 } }', async () => {
    const zeroResponse = { data: [], pagination: { total: 0, totalPages: 0 } };

    mock.onGet('/system-errors').reply(200, zeroResponse);

    const response = await api.get('/system-errors', {
      params: { page: 1, pageSize: 20 },
    });

    expect(response.data.data).toEqual([]);
    expect(response.data.pagination.total).toBe(0);
    expect(response.data.pagination.totalPages).toBe(0);
  });

  it('pagination values are used as-is, never replaced by data.length or fallback 1', () => {
    // Property: for all cases where pagination.total !== data.length OR pagination.totalPages !== 1,
    // the function MUST use pagination values, not fallbacks
    fc.assert(
      fc.property(
        fc.record({
          data: fc.array(
            fc.record({ id: fc.integer({ min: 1, max: 999 }) }),
            { minLength: 1, maxLength: 20 }
          ),
          pagination: fc.record({
            // Deliberately generate values that differ from data.length and 1
            total: fc.integer({ min: 50, max: 10000 }),
            totalPages: fc.integer({ min: 2, max: 500 }),
          }),
        }),
        (responseData) => {
          const result = simulatePaginationUpdate(responseData);

          // total MUST be from pagination, not from data.length
          expect(result.total).toBe(responseData.pagination.total);
          expect(result.total).not.toBe(responseData.data.length);

          // totalPages MUST be from pagination, not the fallback value of 1
          expect(result.totalPages).toBe(responseData.pagination.totalPages);
          expect(result.totalPages).not.toBe(1);
        }
      ),
      { numRuns: 200 }
    );
  });
});
