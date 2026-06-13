/**
 * Shared list-page hook (Req 15, 16, 17).
 *
 * Centralizes the filter/pagination/race-protection logic that register and list
 * screens previously implemented ad hoc. Three behaviors are guaranteed:
 *
 * - **Last-issued-wins (Req 15):** every fetch is tagged with a monotonically
 *   increasing request id held in a ref. When a response resolves it is applied
 *   only if its id equals the latest issued id; otherwise it is discarded. This
 *   guards against a slow earlier response overwriting newer data when filters or
 *   pages change rapidly.
 * - **Page reset on filter change (Req 16):** {@link ListPageState.setFilter} resets
 *   `page` to 1 and issues a request for the first page of the filtered results.
 * - **Empty/last-page pagination (Req 17):** the pure {@link paginationView} helper
 *   derives the page indicator (`"0 of 0"` when empty) and the `canNext`/`canLast`
 *   flags (disabled when empty or on the last page).
 *
 * `total` / `totalPages` are surfaced directly from the `Response_Envelope`
 * pagination meta returned by the fetcher (Req 21), never inferred from the loaded
 * array length.
 *
 * @module useListPage
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { PaginationMeta } from '@alsaqi/shared';

/**
 * Reactive state and controls returned by {@link useListPage}.
 */
export interface ListPageState<T> {
  /** Items for the currently displayed page (latest-issued request only). */
  items: T[];
  /** The current 1-based page number. */
  page: number;
  /** The page size used for requests. */
  pageSize: number;
  /** Total record count, surfaced from `Response_Envelope` meta (Req 21). */
  total: number;
  /** Total page count, surfaced from `Response_Envelope` meta. */
  totalPages: number;
  /** True while a request whose id is still the latest is in flight. */
  isLoading: boolean;
  /** Set a filter value; resets `page` to 1 and refetches the first page (Req 16). */
  setFilter(name: string, value: unknown): void;
  /** Set the current page (1-based). */
  setPage(n: number): void;
}

/**
 * Pure pagination view-model derived from total/page/pageSize (Req 17).
 */
export interface PaginationView {
  /** Page indicator text: `"page of totalPages"`, or `"0 of 0"` when empty. */
  indicator: string;
  /** Whether the First control is enabled. */
  canFirst: boolean;
  /** Whether the Previous control is enabled. */
  canPrev: boolean;
  /** Whether the Next control is enabled. */
  canNext: boolean;
  /** Whether the Last control is enabled. */
  canLast: boolean;
}

const DEFAULT_PAGE_SIZE = 20;

/**
 * Derive the pagination indicator and navigation-control enablement.
 *
 * This is a pure function (no React state) so it can be exercised directly by
 * property tests.
 *
 * - When the result set is empty (`total <= 0` or no pages), the indicator is
 *   `"0 of 0"` and every navigation control is disabled (Req 17.1, 17.2).
 * - When on the last page, Next and Last are disabled (Req 17.3).
 *
 * @param total - Total number of records across all pages.
 * @param page - The current 1-based page number.
 * @param pageSize - Number of records per page.
 * @returns A {@link PaginationView} describing the indicator and control state.
 */
export function paginationView(
  total: number,
  page: number,
  pageSize: number
): PaginationView {
  const totalPages =
    total > 0 && pageSize > 0 ? Math.ceil(total / pageSize) : 0;
  const isEmpty = totalPages <= 0;

  if (isEmpty) {
    return {
      indicator: '0 of 0',
      canFirst: false,
      canPrev: false,
      canNext: false,
      canLast: false,
    };
  }

  // Clamp the displayed page into the valid range for the indicator.
  const currentPage = Math.min(Math.max(page, 1), totalPages);
  const onFirstPage = currentPage <= 1;
  const onLastPage = currentPage >= totalPages;

  return {
    indicator: `${currentPage} of ${totalPages}`,
    canFirst: !onFirstPage,
    canPrev: !onFirstPage,
    canNext: !onLastPage,
    canLast: !onLastPage,
  };
}

/**
 * Manage filtering, pagination, and stale-response race protection for a list page.
 *
 * @typeParam T - The list item type.
 * @param opts.queryKey - A stable key identifying the list; changes trigger a refetch.
 * @param opts.fetcher - Async loader returning the page's `data` and pagination `meta`.
 * @param opts.pageSize - Optional page size (defaults to 20).
 * @returns The {@link ListPageState} for the list.
 */
export function useListPage<T>(opts: {
  queryKey: unknown[];
  fetcher: (params: {
    page: number;
    pageSize: number;
    filters: Record<string, unknown>;
  }) => Promise<{ data: T[]; meta: PaginationMeta }>;
  pageSize?: number;
}): ListPageState<T> {
  const pageSize = opts.pageSize ?? DEFAULT_PAGE_SIZE;

  const [page, setPageState] = useState(1);
  const [filters, setFilters] = useState<Record<string, unknown>>({});
  const [items, setItems] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  // Authoritative last-issued-wins mechanism: the id of the most recently issued
  // request. A resolved response is applied only when its id still matches.
  const latestRequestId = useRef(0);
  const isMountedRef = useRef(true);

  // Keep the fetcher in a ref so a changing fetcher identity does not re-trigger
  // the fetch effect (which keys off page/pageSize/filters/queryKey instead).
  const fetcherRef = useRef(opts.fetcher);
  fetcherRef.current = opts.fetcher;

  // Serialize the external query key so structurally-equal keys do not refetch.
  const queryKeyString = JSON.stringify(opts.queryKey ?? []);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const requestId = (latestRequestId.current += 1);
    setIsLoading(true);

    Promise.resolve(fetcherRef.current({ page, pageSize, filters }))
      .then((result) => {
        // Discard any response that is not from the most recently issued request.
        if (requestId !== latestRequestId.current || !isMountedRef.current) {
          return;
        }
        setItems(result.data);
        setTotal(result.meta.total);
        setTotalPages(result.meta.totalPages);
        setIsLoading(false);
      })
      .catch(() => {
        if (requestId !== latestRequestId.current || !isMountedRef.current) {
          return;
        }
        setIsLoading(false);
      });
  }, [page, pageSize, filters, queryKeyString]);

  const setFilter = useCallback((name: string, value: unknown) => {
    // Req 16: any filter change returns to the first page of the filtered set.
    setPageState(1);
    setFilters((prev) => ({ ...prev, [name]: value }));
  }, []);

  const setPage = useCallback((n: number) => {
    setPageState(n);
  }, []);

  return {
    items,
    page,
    pageSize,
    total,
    totalPages,
    isLoading,
    setFilter,
    setPage,
  };
}
