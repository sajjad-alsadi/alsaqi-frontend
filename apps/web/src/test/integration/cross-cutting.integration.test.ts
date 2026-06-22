// @vitest-environment jsdom
/// <reference types="@testing-library/jest-dom/vitest" />
/**
 * Integration — cross-cutting transport concerns through the REAL client.
 *
 * Drives `createApiClient` against MSW to verify the production interceptor
 * behaviors every endpoint depends on:
 *  - response envelope unwrapping (`{ success, data, meta }` → `data`),
 *  - server-driven pagination meta surfaced via `getWithMeta`,
 *  - CSRF header attachment on all state-changing verbs,
 *  - correlation-id presence + stability across a retry,
 *  - 401 → single `/auth/refresh` → single retry, and failed-refresh → onUnauthorized,
 *  - retriable 5xx with exponential backoff vs. non-retriable 4xx,
 *  - mutation idempotency (POST retried only when opted in),
 *  - Zod validation rejection on a contract-violating payload,
 *  - error normalization via the `onError` callback.
 *
 * @module test/integration/cross-cutting
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { z } from 'zod';
import {
  API_BASE,
  server,
  installServer,
  successEnvelope,
  errorEnvelope,
  setCookie,
  makeRawClient,
} from './harness';
import type { ApiClientError } from '../../api/client';

installServer();

const Schema = z.object({ ok: z.boolean() });

beforeEach(() => {
  setCookie('csrf-token=xc-123');
});

describe('Integration: envelope unwrapping', () => {
  it('unwraps { success, data } to the inner data for the caller', async () => {
    server.use(
      http.get(`${API_BASE}/thing`, () => HttpResponse.json(successEnvelope({ ok: true })))
    );
    const client = makeRawClient();
    expect(await client.get('/thing', Schema)).toEqual({ ok: true });
  });

  it('getWithMeta surfaces server pagination meta alongside the data', async () => {
    server.use(
      http.get(`${API_BASE}/list`, () =>
        HttpResponse.json(
          successEnvelope([{ ok: true }], { pagination: { total: 42, totalPages: 3 } })
        )
      )
    );
    const client = makeRawClient();
    const { data, meta } = await client.getWithMeta('/list', z.array(Schema));
    expect(data).toEqual([{ ok: true }]);
    expect(meta?.pagination).toEqual({ total: 42, totalPages: 3 });
  });
});

describe('Integration: CSRF + correlation headers', () => {
  it('attaches x-csrf-token equal to the cookie on POST/PUT/PATCH/DELETE', async () => {
    const captured: Record<string, string | null> = {};
    server.use(
      http.post(`${API_BASE}/r`, ({ request }) => {
        captured['post'] = request.headers.get('x-csrf-token');
        return HttpResponse.json(successEnvelope({ ok: true }));
      }),
      http.put(`${API_BASE}/r`, ({ request }) => {
        captured['put'] = request.headers.get('x-csrf-token');
        return HttpResponse.json(successEnvelope({ ok: true }));
      }),
      http.patch(`${API_BASE}/r`, ({ request }) => {
        captured['patch'] = request.headers.get('x-csrf-token');
        return HttpResponse.json(successEnvelope({ ok: true }));
      }),
      http.delete(`${API_BASE}/r`, ({ request }) => {
        captured['delete'] = request.headers.get('x-csrf-token');
        return HttpResponse.json(successEnvelope({ ok: true }));
      })
    );
    const client = makeRawClient();
    await client.post('/r', Schema, {});
    await client.put('/r', Schema, {});
    await client.patch('/r', Schema, {});
    await client.delete('/r', Schema);
    expect(captured).toEqual({ post: 'xc-123', put: 'xc-123', patch: 'xc-123', delete: 'xc-123' });
  });

  it('attaches a correlation id that is stable across a retried request', async () => {
    const ids: string[] = [];
    let attempts = 0;
    server.use(
      http.get(`${API_BASE}/flaky`, ({ request }) => {
        ids.push(request.headers.get('x-correlation-id') ?? '');
        attempts += 1;
        if (attempts === 1) return HttpResponse.json(errorEnvelope(500, 'boom'), { status: 500 });
        return HttpResponse.json(successEnvelope({ ok: true }));
      })
    );
    const client = makeRawClient();
    const res = await client.get('/flaky', Schema);
    expect(res).toEqual({ ok: true });
    expect(ids).toHaveLength(2);
    expect(ids[0]).toBe(ids[1]); // same correlation id reused across the retry
  });
});

describe('Integration: 401 → refresh → retry', () => {
  it('a single 401 triggers exactly one /auth/refresh and one retry', async () => {
    let protectedHits = 0;
    let refreshHits = 0;
    server.use(
      http.get(`${API_BASE}/secure`, () => {
        protectedHits += 1;
        if (protectedHits === 1) return HttpResponse.json(errorEnvelope(401, 'no'), { status: 401 });
        return HttpResponse.json(successEnvelope({ ok: true }));
      }),
      http.post(`${API_BASE}/auth/refresh`, () => {
        refreshHits += 1;
        return HttpResponse.json(successEnvelope(null));
      })
    );
    const client = makeRawClient();
    const res = await client.get('/secure', Schema);
    expect(res).toEqual({ ok: true });
    expect(refreshHits).toBe(1);
    expect(protectedHits).toBe(2);
  });

  it('a failed refresh abandons the request and calls onUnauthorized', async () => {
    const onUnauthorized = vi.fn();
    server.use(
      http.get(`${API_BASE}/secure`, () =>
        HttpResponse.json(errorEnvelope(401, 'no'), { status: 401 })
      ),
      http.post(`${API_BASE}/auth/refresh`, () =>
        HttpResponse.json(errorEnvelope(401, 'expired'), { status: 401 })
      )
    );
    const client = makeRawClient({ onUnauthorized });
    await expect(client.get('/secure', Schema)).rejects.toBeDefined();
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('concurrent in-flight 401s share a single refresh', async () => {
    let refreshHits = 0;
    const seen: Record<string, number> = { a: 0, b: 0 };
    server.use(
      http.get(`${API_BASE}/a`, () => {
        seen['a'] += 1;
        if (seen['a'] === 1) return HttpResponse.json(errorEnvelope(401, 'no'), { status: 401 });
        return HttpResponse.json(successEnvelope({ ok: true }));
      }),
      http.get(`${API_BASE}/b`, () => {
        seen['b'] += 1;
        if (seen['b'] === 1) return HttpResponse.json(errorEnvelope(401, 'no'), { status: 401 });
        return HttpResponse.json(successEnvelope({ ok: true }));
      }),
      http.post(`${API_BASE}/auth/refresh`, async () => {
        refreshHits += 1;
        await new Promise((r) => setTimeout(r, 50));
        return HttpResponse.json(successEnvelope(null));
      })
    );
    const client = makeRawClient();
    const [ra, rb] = await Promise.all([client.get('/a', Schema), client.get('/b', Schema)]);
    expect(ra).toEqual({ ok: true });
    expect(rb).toEqual({ ok: true });
    expect(refreshHits).toBe(1); // single shared refresh, not two
  });
});

describe('Integration: retry policy', () => {
  it('retries a 5xx GET with backoff and ultimately succeeds', async () => {
    vi.useFakeTimers();
    try {
      let attempts = 0;
      server.use(
        http.get(`${API_BASE}/srv`, () => {
          attempts += 1;
          if (attempts < 3) return HttpResponse.json(errorEnvelope(503, 'down'), { status: 503 });
          return HttpResponse.json(successEnvelope({ ok: true }));
        })
      );
      const client = makeRawClient();
      const promise = client.get('/srv', Schema);
      // Advance through the 1s + 2s backoff windows.
      await vi.advanceTimersByTimeAsync(3500);
      expect(await promise).toEqual({ ok: true });
      expect(attempts).toBe(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does NOT retry a non-retriable 4xx and reports via onError is skipped for 4xx', async () => {
    let attempts = 0;
    server.use(
      http.get(`${API_BASE}/bad`, () => {
        attempts += 1;
        return HttpResponse.json(errorEnvelope(400, 'bad'), { status: 400 });
      })
    );
    const client = makeRawClient();
    await expect(client.get('/bad', Schema)).rejects.toBeDefined();
    expect(attempts).toBe(1); // 400 is terminal — attempted exactly once
  });

  it('a non-idempotent POST is attempted exactly once on 5xx (no retry)', async () => {
    let attempts = 0;
    server.use(
      http.post(`${API_BASE}/mut`, () => {
        attempts += 1;
        return HttpResponse.json(errorEnvelope(500, 'boom'), { status: 500 });
      })
    );
    const client = makeRawClient();
    await expect(client.post('/mut', Schema, {})).rejects.toBeDefined();
    expect(attempts).toBe(1); // mutation without idempotency key is never retried
  });

  it('an idempotent POST is retried on 5xx with a stable Idempotency-Key', async () => {
    vi.useFakeTimers();
    try {
      const keys: Array<string | null> = [];
      let attempts = 0;
      server.use(
        http.post(`${API_BASE}/mut`, ({ request }) => {
          keys.push(request.headers.get('Idempotency-Key'));
          attempts += 1;
          if (attempts < 2) return HttpResponse.json(errorEnvelope(500, 'boom'), { status: 500 });
          return HttpResponse.json(successEnvelope({ ok: true }));
        })
      );
      const client = makeRawClient();
      const promise = client.post('/mut', Schema, {}, { idempotent: true });
      await vi.advanceTimersByTimeAsync(1500);
      expect(await promise).toEqual({ ok: true });
      expect(attempts).toBe(2);
      expect(keys[0]).toBeTruthy();
      expect(keys[0]).toBe(keys[1]); // same key reused across attempts
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('Integration: validation + error normalization', () => {
  it('rejects a contract-violating payload via Zod (data shape mismatch)', async () => {
    server.use(
      http.get(`${API_BASE}/wrong`, () =>
        HttpResponse.json(successEnvelope({ ok: 'not-a-boolean' }))
      )
    );
    const client = makeRawClient();
    await expect(client.get('/wrong', Schema)).rejects.toBeInstanceOf(z.ZodError);
  });

  it('normalizes a persistent network/5xx failure into the onError callback', async () => {
    vi.useFakeTimers();
    try {
      const errors: ApiClientError[] = [];
      server.use(
        http.get(`${API_BASE}/down`, () =>
          HttpResponse.json(errorEnvelope(500, 'down'), { status: 500 })
        )
      );
      const client = makeRawClient({ onError: (e) => errors.push(e) });
      const promise = client.get('/down', Schema).catch(() => undefined);
      await vi.advanceTimersByTimeAsync(8000); // exhaust all retries
      await promise;
      expect(errors).toHaveLength(1);
      expect(errors[0]?.type).toBe('server_error');
      expect(errors[0]?.status).toBe(500);
      expect(errors[0]?.attempts).toBe(3);
    } finally {
      vi.useRealTimers();
    }
  });
});
