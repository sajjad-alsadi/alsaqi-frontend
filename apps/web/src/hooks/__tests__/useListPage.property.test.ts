// @vitest-environment jsdom
//
// Feature: frontend-audit-remediation, Property 14: Last-issued request wins
// Feature: frontend-audit-remediation, Property 15: Page reset on filter change
// Feature: frontend-audit-remediation, Property 16: Correct pagination view for
// empty and last pages
//
// Property 14: Last-issued request wins
//   - For any set of overlapping list requests and any order in which their
//     responses resolve, the displayed list reflects the result of the most
//     recently issued request.
//   **Validates: Requirements 15.1, 15.2, 15.3, 15.4**
//
// Property 15: Page reset on filter change
//   - For any current page and any filter change, the hook sets the current
//     page to one and requests the first page of the filtered results.
//   **Validates: Requirements 16.1, 16.2**
//
// Property 16: Correct pagination view for empty and last pages
//   - For any total / page / pageSize, paginationView shows "0 of 0" and
//     disables Next and Last when the result set is empty, and disables Next
//     and Last when the current page is the last page.
//   **Validates: Requirements 17.1, 17.2, 17.3**
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import fc from 'fast-check';
import type { PaginationMeta } from '@alsaqi/shared';
import { useListPage, paginationView } from '../useListPage';

/** Build a structurally valid PaginationMeta; only total/totalPages are read by the hook. */
function makeMeta(overrides: Partial<PaginationMeta> = {}): PaginationMeta {
  return {
    page: 1,
    pageSize: 20,
    total: 100,
    totalPages: 5,
    hasNext: true,
    hasPrev: false,
    ...overrides,
  };
}

/** Flush pending microtasks (resolved promises) and the React effects they trigger. */
async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

describe('Property 14: last-issued request wins', () => {
  it(
    'displays the most recently issued request regardless of response resolution order',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          // Strictly increasing page values guarantee every setPage issues a
          // distinct request (the effect re-runs only when `page` changes).
          fc
            .array(fc.integer({ min: 1, max: 10 }), {
              minLength: 1,
              maxLength: 5,
            })
            .map((increments) => {
              let acc = 1; // initial page is 1
              return increments.map((d) => (acc += d));
            }),
          // Sort keys used to derive an arbitrary response-resolution order.
          // Max total requests = 1 (initial) + 5 (setPage calls) = 6.
          fc.array(fc.integer(), { minLength: 6, maxLength: 6 }),
          async (pages, orderSeed) => {
            // Deferred fetches: each fetch records its issuance index and parks
            // a resolver we can fire later in an arbitrary order.
            const deferreds: Array<{ index: number; resolve: () => void }> = [];
            let issueCount = 0;

            const fetcher = () => {
              const index = issueCount++;
              return new Promise<{ data: string[]; meta: PaginationMeta }>(
                (res) => {
                  deferreds.push({
                    index,
                    resolve: () => res({ data: [`req-${index}`], meta: makeMeta() }),
                  });
                }
              );
            };

            const { result } = renderHook(() =>
              useListPage<string>({ queryKey: ['list'], fetcher })
            );

            // Mount issued request index 0; each setPage issues another.
            for (const p of pages) {
              await act(async () => {
                result.current.setPage(p);
              });
            }

            const total = deferreds.length;
            expect(total).toBe(1 + pages.length);
            const lastIndex = total - 1;

            // Resolve responses in an arbitrary order derived from orderSeed.
            const order = Array.from({ length: total }, (_, i) => i).sort(
              (a, b) => orderSeed[a] - orderSeed[b]
            );
            for (const i of order) {
              await act(async () => {
                deferreds[i].resolve();
                await Promise.resolve();
              });
            }

            // Only the most recently issued request's result is displayed.
            expect(result.current.items).toEqual([`req-${lastIndex}`]);
          }
        ),
        { numRuns: 100 }
      );
    },
    30000
  );
});

describe('Property 15: page reset on filter change', () => {
  it(
    'resets page to one and requests the first page of the filtered results',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          // A starting page strictly greater than one so the reset is observable.
          fc.integer({ min: 2, max: 100 }),
          fc.string({ minLength: 1 }),
          fc.oneof(fc.string(), fc.integer(), fc.boolean()),
          async (startPage, filterName, filterValue) => {
            const calls: Array<{
              page: number;
              filters: Record<string, unknown>;
            }> = [];

            const fetcher = (params: {
              page: number;
              pageSize: number;
              filters: Record<string, unknown>;
            }) => {
              calls.push({ page: params.page, filters: { ...params.filters } });
              return Promise.resolve({ data: [] as string[], meta: makeMeta() });
            };

            const { result } = renderHook(() =>
              useListPage<string>({ queryKey: ['list'], fetcher })
            );

            await flush();

            // Navigate away from page one.
            await act(async () => {
              result.current.setPage(startPage);
            });
            await flush();
            expect(result.current.page).toBe(startPage);

            // Apply a filter change.
            await act(async () => {
              result.current.setFilter(filterName, filterValue);
            });
            await flush();

            // Req 16.1: page is reset to one.
            expect(result.current.page).toBe(1);

            // Req 16.2: the latest request asks for page one of the filtered set.
            const lastCall = calls[calls.length - 1];
            expect(lastCall.page).toBe(1);
            expect(lastCall.filters[filterName]).toStrictEqual(filterValue);
          }
        ),
        { numRuns: 100 }
      );
    },
    30000
  );
});

describe('Property 16: correct pagination view for empty and last pages', () => {
  it('shows "0 of 0" and disables Next/Last when empty, and disables Next/Last on the last page', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1000 }),
        fc.integer({ min: -5, max: 60 }),
        fc.integer({ min: 0, max: 50 }),
        (total, page, pageSize) => {
          const view = paginationView(total, page, pageSize);

          const totalPages =
            total > 0 && pageSize > 0 ? Math.ceil(total / pageSize) : 0;
          const isEmpty = totalPages <= 0;

          if (isEmpty) {
            // Req 17.1 / 17.2: empty result set.
            expect(view.indicator).toBe('0 of 0');
            expect(view.canFirst).toBe(false);
            expect(view.canPrev).toBe(false);
            expect(view.canNext).toBe(false);
            expect(view.canLast).toBe(false);
            return;
          }

          const currentPage = Math.min(Math.max(page, 1), totalPages);
          const onLastPage = currentPage >= totalPages;

          expect(view.indicator).toBe(`${currentPage} of ${totalPages}`);
          // Req 17.3: Next/Last disabled exactly when on the last page.
          expect(view.canNext).toBe(!onLastPage);
          expect(view.canLast).toBe(!onLastPage);
        }
      ),
      { numRuns: 100 }
    );
  });
});
