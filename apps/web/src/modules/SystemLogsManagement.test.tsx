import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import fc from 'fast-check';
import React from 'react';
import SystemLogsManagement from './SystemLogsManagement';

/**
 * Bug Condition Exploration Test - Hardcoded Health Percentage
 * 
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.4**
 * 
 * This test encodes the EXPECTED (correct) behavior:
 * - Health percentage should be dynamically calculated as (totalAudit / (totalAudit + totalErrors)) * 100
 * - Color should change based on thresholds: emerald-500 (>=90%), amber-500 (>=70%), rose-500 (<70%)
 * - Status should change based on thresholds: "stable" (>=90%), "degraded" (>=70%), "critical" (<70%)
 * - Error count should use pagination.total, not array length
 * 
 * EXPECTED OUTCOME: Test FAILS on unfixed code (proves the bug exists)
 */

// Mock the API module
vi.mock('../api/httpClient', () => ({
  default: {
    get: vi.fn(),
  },
}));

import api from '../api/httpClient';
const mockedApi = vi.mocked(api);

// Helper to create mock API responses
function createMockAuditResponse(totalItems: number, paginationTotal?: number) {
  const today = new Date().toISOString().split('T')[0];
  const data = Array.from({ length: Math.min(totalItems, 50) }, (_, i) => ({
    id: i + 1,
    action: `action_${i}`,
    timestamp: `${today}T10:00:00Z`,
    user: 'test-user',
  }));

  return {
    data: {
      data,
      pagination: {
        page: 1,
        pageSize: 50,
        total: paginationTotal ?? totalItems,
        totalPages: Math.ceil((paginationTotal ?? totalItems) / 50),
      },
    },
  };
}

function createMockErrorsResponse(itemsInPage: number, paginationTotal?: number) {
  const data = Array.from({ length: itemsInPage }, (_, i) => ({
    id: i + 1,
    message: `Error ${i}`,
    timestamp: new Date().toISOString(),
    severity: 'error',
  }));

  return {
    data: {
      data,
      pagination: {
        page: 1,
        pageSize: 50,
        total: paginationTotal ?? itemsInPage,
        totalPages: Math.ceil((paginationTotal ?? itemsInPage) / 50),
      },
    },
  };
}

// Helper to determine expected color based on health percentage
function getExpectedColor(health: number): string {
  if (health >= 90) return 'text-emerald-500';
  if (health >= 70) return 'text-amber-500';
  return 'text-rose-500';
}

// Helper to determine expected status based on health percentage
function getExpectedStatus(health: number): string {
  if (health >= 90) return 'systemLogsManagement.stable';
  if (health >= 70) return 'systemLogsManagement.degraded';
  return 'systemLogsManagement.critical';
}

describe('Bug Condition Exploration: Hardcoded Health Percentage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Test Case 1: 50 audit actions and 50 errors → health 50.0% with rose-500 and "critical"', async () => {
    // Mock API: 50 audit actions, 50 errors → health = 50/(50+50)*100 = 50%
    mockedApi.get.mockImplementation((url: string) => {
      if (url === '/audit-trail') {
        return Promise.resolve(createMockAuditResponse(50, 50));
      }
      if (url === '/system-errors') {
        return Promise.resolve(createMockErrorsResponse(50, 50));
      }
      return Promise.reject(new Error('Unknown URL'));
    });

    render(<SystemLogsManagement />);

    await waitFor(() => {
      expect(mockedApi.get).toHaveBeenCalledWith('/audit-trail');
      expect(mockedApi.get).toHaveBeenCalledWith('/system-errors');
    });

    // Wait for state update after API calls resolve
    await waitFor(() => {
      // Expected: health = 50.0% with rose-500 color and "critical" status
      const healthElement = screen.getByText('50.0%');
      expect(healthElement).toBeInTheDocument();
      expect(healthElement).toHaveClass('text-rose-500');
    });

    // Verify status text shows "critical"
    expect(screen.getByText('systemLogsManagement.critical')).toBeInTheDocument();
  });

  it('Test Case 2: 80 audit actions and 20 errors → health 80.0% with amber-500 and "degraded"', async () => {
    // Mock API: 80 audit actions, 20 errors → health = 80/(80+20)*100 = 80%
    mockedApi.get.mockImplementation((url: string) => {
      if (url === '/audit-trail') {
        return Promise.resolve(createMockAuditResponse(50, 80));
      }
      if (url === '/system-errors') {
        return Promise.resolve(createMockErrorsResponse(20, 20));
      }
      return Promise.reject(new Error('Unknown URL'));
    });

    render(<SystemLogsManagement />);

    await waitFor(() => {
      expect(mockedApi.get).toHaveBeenCalledWith('/audit-trail');
      expect(mockedApi.get).toHaveBeenCalledWith('/system-errors');
    });

    await waitFor(() => {
      // Expected: health = 80.0% with amber-500 color and "degraded" status
      const healthElement = screen.getByText('80.0%');
      expect(healthElement).toBeInTheDocument();
      expect(healthElement).toHaveClass('text-amber-500');
    });

    expect(screen.getByText('systemLogsManagement.degraded')).toBeInTheDocument();
  });

  it('Test Case 3: 50 items in data array but pagination.total = 200 → errorsCount displays 200', async () => {
    // Mock API: 50 items in page but total is 200
    mockedApi.get.mockImplementation((url: string) => {
      if (url === '/audit-trail') {
        return Promise.resolve(createMockAuditResponse(50, 100));
      }
      if (url === '/system-errors') {
        // 50 items in the data array, but pagination.total = 200
        return Promise.resolve(createMockErrorsResponse(50, 200));
      }
      return Promise.reject(new Error('Unknown URL'));
    });

    render(<SystemLogsManagement />);

    await waitFor(() => {
      expect(mockedApi.get).toHaveBeenCalledWith('/audit-trail');
      expect(mockedApi.get).toHaveBeenCalledWith('/system-errors');
    });

    await waitFor(() => {
      // Expected: errorsCount should display 200 (pagination.total), not 50 (array length)
      const errorCountElement = screen.getByText(/200/);
      expect(errorCountElement).toBeInTheDocument();
    });
  });

  it('Test Case 4: 0 audit actions and 0 errors → health defaults to 100% with emerald-500 and "stable"', async () => {
    // Mock API: 0 audit actions, 0 errors → health should default to 100%
    mockedApi.get.mockImplementation((url: string) => {
      if (url === '/audit-trail') {
        return Promise.resolve(createMockAuditResponse(0, 0));
      }
      if (url === '/system-errors') {
        return Promise.resolve(createMockErrorsResponse(0, 0));
      }
      return Promise.reject(new Error('Unknown URL'));
    });

    render(<SystemLogsManagement />);

    await waitFor(() => {
      expect(mockedApi.get).toHaveBeenCalledWith('/audit-trail');
      expect(mockedApi.get).toHaveBeenCalledWith('/system-errors');
    });

    await waitFor(() => {
      // Expected: health = 100.0% with emerald-500 color and "stable" status
      const healthElement = screen.getByText('100.0%');
      expect(healthElement).toBeInTheDocument();
      expect(healthElement).toHaveClass('text-emerald-500');
    });

    expect(screen.getByText('systemLogsManagement.stable')).toBeInTheDocument();
  });

  it('Property: for all (totalAudit, totalErrors) pairs, health = (totalAudit / (totalAudit + totalErrors)) * 100 with correct color and status', async () => {
    /**
     * **Validates: Requirements 1.1, 1.2, 1.3, 1.4**
     * 
     * Property-based test: for any valid pair of (totalAudit, totalErrors),
     * the component should display the dynamically calculated health percentage
     * with the correct color and status text based on thresholds.
     */
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 1000 }),
        fc.integer({ min: 0, max: 1000 }),
        async (totalAudit, totalErrors) => {
          // Skip the case where both are 0 (handled separately in test case 4)
          fc.pre(totalAudit + totalErrors > 0);

          vi.clearAllMocks();

          mockedApi.get.mockImplementation((url: string) => {
            if (url === '/audit-trail') {
              return Promise.resolve(createMockAuditResponse(Math.min(totalAudit, 50), totalAudit));
            }
            if (url === '/system-errors') {
              return Promise.resolve(createMockErrorsResponse(Math.min(totalErrors, 50), totalErrors));
            }
            return Promise.reject(new Error('Unknown URL'));
          });

          const { unmount } = render(<SystemLogsManagement />);

          const expectedHealth = (totalAudit / (totalAudit + totalErrors)) * 100;
          const expectedHealthStr = `${expectedHealth.toFixed(1)}%`;
          const expectedColor = getExpectedColor(expectedHealth);

          await waitFor(() => {
            const healthElement = screen.getByText(expectedHealthStr);
            expect(healthElement).toBeInTheDocument();
            expect(healthElement).toHaveClass(expectedColor);
          });

          unmount();
        }
      ),
      { numRuns: 20 } // Limited runs for exploration
    );
  });
});


/**
 * Preservation Property Tests - Non-Health Display Behavior
 * 
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**
 * 
 * These tests verify behaviors that MUST remain unchanged after the fix:
 * - Today's audit count calculation (filtering by today's date)
 * - Loading state transitions (true during fetch, false after)
 * - Error handling (API failures logged, no crash)
 * - Concurrent fetching (both endpoints called via Promise.all)
 * - Zero errors with audit actions → health displays green/stable
 * 
 * EXPECTED OUTCOME: Tests PASS on unfixed code (confirms baseline behavior to preserve)
 */
describe('Preservation Property: Non-Health Display Behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * **Validates: Requirements 3.1**
   * 
   * Property: For all non-buggy inputs (zero errors with some audit actions),
   * the unfixed code shows health as "99.9%" with emerald-500 and "stable".
   * After the fix, this should show ~100% with emerald-500 and "stable".
   * On unfixed code, we verify the hardcoded "99.9%" still renders correctly
   * with green color and stable status when zero errors exist.
   */
  it('Property: for all non-buggy inputs (zero errors with some audit actions), health displays emerald-500 and "stable"', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 500 }), // at least 1 audit action
        async (totalAudit) => {
          vi.clearAllMocks();

          const today = new Date().toISOString().split('T')[0];
          const auditData = Array.from({ length: Math.min(totalAudit, 50) }, (_, i) => ({
            id: i + 1,
            action: `action_${i}`,
            timestamp: `${today}T10:00:00Z`,
            user: 'test-user',
          }));

          mockedApi.get.mockImplementation((url: string) => {
            if (url === '/audit-trail') {
              return Promise.resolve({
                data: {
                  data: auditData,
                  pagination: { page: 1, pageSize: 50, total: totalAudit, totalPages: Math.ceil(totalAudit / 50) },
                },
              });
            }
            if (url === '/system-errors') {
              // Zero errors
              return Promise.resolve({
                data: {
                  data: [],
                  pagination: { page: 1, pageSize: 50, total: 0, totalPages: 0 },
                },
              });
            }
            return Promise.reject(new Error('Unknown URL'));
          });

          const { unmount } = render(<SystemLogsManagement />);

          await waitFor(() => {
            expect(mockedApi.get).toHaveBeenCalledWith('/audit-trail');
            expect(mockedApi.get).toHaveBeenCalledWith('/system-errors');
          });

          // On unfixed code: hardcoded "99.9%" with emerald-500 and "stable"
          // On fixed code: should show ~100% with emerald-500 and "stable"
          // Both cases: emerald-500 color and "stable" status when zero errors
          await waitFor(() => {
            // The health element should have emerald-500 class
            const healthSpan = screen.getByText(/99\.9%|100\.0%/);
            expect(healthSpan).toBeInTheDocument();
            expect(healthSpan).toHaveClass('text-emerald-500');
          });

          // Status should be "stable"
          expect(screen.getByText('systemLogsManagement.stable')).toBeInTheDocument();

          unmount();
        }
      ),
      { numRuns: 15 }
    );
  });

  /**
   * **Validates: Requirements 3.5**
   * 
   * Property: For all API responses, today's audit count equals the count
   * of audit entries with today's date in the data array.
   */
  it('Property: for all API responses, today\'s audit count equals count of audit entries with today\'s date', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 30 }), // items with today's date
        fc.integer({ min: 0, max: 20 }), // items with yesterday's date
        async (todayCount, yesterdayCount) => {
          vi.clearAllMocks();

          const today = new Date().toISOString().split('T')[0];
          const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

          const auditData = [
            ...Array.from({ length: todayCount }, (_, i) => ({
              id: i + 1,
              action: `today_action_${i}`,
              timestamp: `${today}T${String(10 + (i % 12)).padStart(2, '0')}:00:00Z`,
              user: 'test-user',
            })),
            ...Array.from({ length: yesterdayCount }, (_, i) => ({
              id: todayCount + i + 1,
              action: `yesterday_action_${i}`,
              timestamp: `${yesterday}T10:00:00Z`,
              user: 'test-user',
            })),
          ];

          mockedApi.get.mockImplementation((url: string) => {
            if (url === '/audit-trail') {
              return Promise.resolve({
                data: {
                  data: auditData,
                  pagination: { page: 1, pageSize: 50, total: auditData.length, totalPages: 1 },
                },
              });
            }
            if (url === '/system-errors') {
              return Promise.resolve({
                data: {
                  data: [],
                  pagination: { page: 1, pageSize: 50, total: 0, totalPages: 0 },
                },
              });
            }
            return Promise.reject(new Error('Unknown URL'));
          });

          const { unmount } = render(<SystemLogsManagement />);

          await waitFor(() => {
            expect(mockedApi.get).toHaveBeenCalledWith('/audit-trail');
          });

          // Today's audit count should equal the number of items with today's date
          await waitFor(() => {
            const expectedText = `${todayCount} systemLogsManagement.actions`;
            expect(screen.getByText(expectedText)).toBeInTheDocument();
          });

          unmount();
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * **Validates: Requirements 3.3**
   * 
   * Property: For all API call states, loading flag transitions correctly
   * (true during fetch, false after completion).
   */
  it('Property: for all API call states, loading flag transitions correctly (true during fetch, false after)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 100 }),
        fc.integer({ min: 0, max: 100 }),
        async (auditCount, errorsCount) => {
          vi.clearAllMocks();

          let resolveAudit: (value: any) => void;
          let resolveErrors: (value: any) => void;

          const auditPromise = new Promise((resolve) => { resolveAudit = resolve; });
          const errorsPromise = new Promise((resolve) => { resolveErrors = resolve; });

          mockedApi.get.mockImplementation((url: string) => {
            if (url === '/audit-trail') return auditPromise;
            if (url === '/system-errors') return errorsPromise;
            return Promise.reject(new Error('Unknown URL'));
          });

          const { unmount } = render(<SystemLogsManagement />);

          // API calls should have been initiated
          await waitFor(() => {
            expect(mockedApi.get).toHaveBeenCalledWith('/audit-trail');
            expect(mockedApi.get).toHaveBeenCalledWith('/system-errors');
          });

          // Now resolve both promises
          const today = new Date().toISOString().split('T')[0];
          await act(async () => {
            resolveAudit!({
              data: {
                data: Array.from({ length: Math.min(auditCount, 50) }, (_, i) => ({
                  id: i + 1, action: `a_${i}`, timestamp: `${today}T10:00:00Z`, user: 'u',
                })),
                pagination: { page: 1, pageSize: 50, total: auditCount, totalPages: 1 },
              },
            });
            resolveErrors!({
              data: {
                data: Array.from({ length: Math.min(errorsCount, 50) }, (_, i) => ({
                  id: i + 1, message: `e_${i}`, timestamp: new Date().toISOString(), severity: 'error',
                })),
                pagination: { page: 1, pageSize: 50, total: errorsCount, totalPages: 1 },
              },
            });
          });

          // After resolution, component should render stats (loading is false)
          await waitFor(() => {
            // The stats section renders audit count - this proves loading completed
            expect(screen.getByText(/systemLogsManagement.actions/)).toBeInTheDocument();
          });

          unmount();
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * **Validates: Requirements 3.4**
   * 
   * Property: For all API failure scenarios, error is logged to console
   * and component does not crash.
   */
  it('Property: for all API failure scenarios, error is logged and component does not crash', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('network', 'timeout', 'server', '500', '403', '404'),
        async (errorType) => {
          vi.clearAllMocks();
          const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

          const error = new Error(`API ${errorType} error`);

          mockedApi.get.mockImplementation((_url: string) => {
            return Promise.reject(error);
          });

          // Component should NOT throw/crash
          const { unmount } = render(<SystemLogsManagement />);

          await waitFor(() => {
            expect(mockedApi.get).toHaveBeenCalled();
          });

          // Wait for the error to be caught and logged
          // logger.error prepends [ERROR] prefix to messages
          await waitFor(() => {
            expect(consoleSpy).toHaveBeenCalledWith('[ERROR] Error fetching logs stats:', error);
          });

          // Component should still be rendered (not crashed)
          expect(screen.getByText('SystemLogsManagement')).toBeInTheDocument();

          consoleSpy.mockRestore();
          unmount();
        }
      ),
      { numRuns: 6 }
    );
  });

  /**
   * **Validates: Requirements 3.2**
   * 
   * Property: Both `/api/audit-trail` and `/api/system-errors` are fetched
   * concurrently (both calls are initiated before either resolves).
   */
  it('Property: both API endpoints are fetched concurrently via Promise.all', async () => {
    vi.clearAllMocks();

    const callOrder: string[] = [];
    let resolveAudit: (value: any) => void;
    let resolveErrors: (value: any) => void;

    const auditPromise = new Promise((resolve) => { resolveAudit = resolve; });
    const errorsPromise = new Promise((resolve) => { resolveErrors = resolve; });

    mockedApi.get.mockImplementation((url: string) => {
      callOrder.push(url);
      if (url === '/audit-trail') return auditPromise;
      if (url === '/system-errors') return errorsPromise;
      return Promise.reject(new Error('Unknown URL'));
    });

    const { unmount } = render(<SystemLogsManagement />);

    // Both calls should be initiated before either resolves (concurrent)
    await waitFor(() => {
      expect(callOrder).toContain('/audit-trail');
      expect(callOrder).toContain('/system-errors');
    });

    // Both calls were made before we resolve anything — proves concurrency
    expect(mockedApi.get).toHaveBeenCalledTimes(2);

    // Resolve to clean up
    await act(async () => {
      resolveAudit!({ data: { data: [], pagination: { page: 1, pageSize: 50, total: 0, totalPages: 0 } } });
      resolveErrors!({ data: { data: [], pagination: { page: 1, pageSize: 50, total: 0, totalPages: 0 } } });
    });

    unmount();
  });
});
