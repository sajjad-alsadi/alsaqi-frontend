/**
 * Envelope normalization helpers.
 *
 * The shared API client (`apps/web/src/api/client.ts`) registers a response
 * interceptor that auto-unwraps the success envelope: when `response.data` is an
 * object with `success === true` and a `data` field, it replaces `response.data`
 * with the inner `data` value. As a result, consumers of the raw `api` instance
 * may receive EITHER the raw envelope (`{ success, data, pagination? }`) OR the
 * already-unwrapped payload (an array, an object, or `null`).
 *
 * These helpers let consumers read their list, pagination, and object payloads in
 * an envelope-agnostic way, degrading gracefully when fields are absent or were
 * discarded during unwrapping.
 *
 * @module envelope
 */

/**
 * Pagination metadata shape used by paginated screens.
 */
export interface PaginationFallback {
  total: number;
  totalPages: number;
}

/**
 * Server `Response_Envelope` meta block (`{ requestId, timestamp, version,
 * pagination? }`). Only the `pagination` sub-block is consumed by the client;
 * the rest is preserved opaquely.
 */
export interface EnvelopeMeta {
  pagination?: {
    total?: number;
    totalPages?: number;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/**
 * Read the `meta` block from a raw success envelope BEFORE it is unwrapped.
 *
 * The response interceptor replaces `response.data` with the inner `data`
 * payload, discarding the sibling `meta`. This helper lets the interceptor
 * capture `meta` (including `meta.pagination`) off the still-enveloped body so
 * consumers can surface server-driven pagination instead of recomputing it from
 * the page array length.
 *
 * @param payload - The raw `response.data` body (the full envelope).
 * @returns The `meta` object when present, otherwise `undefined`.
 */
export function readEnvelopeMeta(payload: unknown): EnvelopeMeta | undefined {
  if (
    payload &&
    typeof payload === 'object' &&
    'meta' in payload &&
    typeof (payload as { meta?: unknown }).meta === 'object' &&
    (payload as { meta?: unknown }).meta !== null
  ) {
    return (payload as { meta: EnvelopeMeta }).meta;
  }
  return undefined;
}

/**
 * Derive `{ total, totalPages }` from server pagination meta.
 *
 * Server-provided `meta.pagination.total` / `meta.pagination.totalPages` always
 * take precedence (Req 21.1, 21.2). `itemCount` is used ONLY as a degraded
 * fallback when the server omits pagination meta entirely — never to override a
 * value the server supplied, and never as the primary source.
 *
 * @param meta - The envelope meta captured by {@link readEnvelopeMeta}.
 * @param itemCount - The loaded item count, used only when meta is absent.
 * @returns A `{ total, totalPages }` object sourced from server meta when available.
 */
export function metaPagination(
  meta: EnvelopeMeta | undefined,
  itemCount: number
): PaginationFallback {
  const p = meta?.pagination;
  return {
    total: typeof p?.total === 'number' ? p.total : itemCount,
    totalPages: typeof p?.totalPages === 'number' ? p.totalPages : 1,
  };
}

/**
 * Extract a list from either response shape.
 *
 * - If the payload is already an array (unwrapped), return it as-is.
 * - If the payload is an object with an array `data` field (non-enveloped
 *   `{ data, pagination }` shape, or the raw envelope), return `data`.
 * - Otherwise (null, undefined, or an object without a `data` array), return `[]`.
 *
 * @param payload - The `response.data` as seen by the consumer after the interceptor runs.
 * @returns The extracted list, or an empty array when no list is present.
 */
export function toList<T = unknown>(payload: unknown): T[] {
  if (Array.isArray(payload)) {
    return payload as T[];
  }
  if (
    payload &&
    typeof payload === 'object' &&
    Array.isArray((payload as { data?: unknown }).data)
  ) {
    return (payload as { data: T[] }).data;
  }
  return [];
}

/**
 * Extract pagination metadata with a graceful fallback.
 *
 * - When the payload is the non-enveloped `{ data, pagination }` shape, the
 *   existing `pagination.total` / `pagination.totalPages` are used.
 * - When pagination metadata is absent or was discarded by unwrapping (e.g. the
 *   payload is an unwrapped array), `total` falls back to `itemCount` and
 *   `totalPages` falls back to `1`.
 *
 * @param payload - The `response.data` as seen by the consumer after the interceptor runs.
 * @param itemCount - The number of loaded items, used as the `total` fallback.
 * @returns A `{ total, totalPages }` object.
 */
export function toPagination(
  payload: unknown,
  itemCount: number
): PaginationFallback {
  const p =
    payload && typeof payload === 'object' && !Array.isArray(payload)
      ? (payload as { pagination?: Partial<PaginationFallback> }).pagination
      : undefined;
  return {
    total: p?.total ?? itemCount,
    totalPages: p?.totalPages ?? 1,
  };
}

/**
 * Extract the object payload for summary / non-list cases.
 *
 * - When the payload is still the raw envelope (an object with both `success` and
 *   `data` fields), return the inner `data`.
 * - Otherwise the payload has already been unwrapped, so return it unchanged.
 *
 * @param payload - The `response.data` as seen by the consumer after the interceptor runs.
 * @returns The inner data when enveloped, otherwise the payload as-is.
 */
export function toData<T = unknown>(payload: unknown): T {
  if (
    payload &&
    typeof payload === 'object' &&
    'success' in payload &&
    'data' in payload
  ) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

/**
 * Pure envelope-unwrap projection used by the HTTP_Client response interceptor.
 *
 * Returns the inner `data` value ONLY when `payload` is a non-null object that
 * has `success === true` AND a `data` field. For any other payload (arrays,
 * primitives, `null`, `undefined`, `{ success: false }`, objects without a
 * `data` field), the payload is returned unchanged (identity).
 *
 * This mirrors the unwrap branch previously inlined in `client.ts`'s response
 * interceptor. Unlike {@link toData}, it requires `success === true` (not merely
 * the presence of a `success` field), matching the server success-envelope
 * contract exactly.
 *
 * @param payload - The raw `response.data` body.
 * @returns The inner `data` on a success envelope, otherwise the payload as-is.
 */
export function unwrapEnvelope(payload: unknown): unknown {
  if (
    payload &&
    typeof payload === 'object' &&
    'success' in payload &&
    (payload as { success?: unknown }).success === true &&
    'data' in payload
  ) {
    return (payload as { data: unknown }).data;
  }
  return payload;
}
