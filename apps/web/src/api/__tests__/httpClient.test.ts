/**
 * Backward-compatibility tests for the raw axios instance exported by
 * `httpClient.ts` (the legacy `import api from '../api/httpClient'` path).
 *
 * These cover the two behaviors Requirement 10.2 calls out for the
 * backward-compatible export path:
 *   1. Auth-token attachment on outgoing requests — the raw instance must
 *      carry credentials (cookie-based auth via `withCredentials`) and the
 *      CSRF token from the `csrf-token` cookie as the `x-csrf-token` header,
 *      plus a per-request correlation id.
 *   2. 401 navigation behavior — when a request returns 401 and the token
 *      refresh fails, the configured `onUnauthorized` handler dispatches the
 *      SPA-internal `app:unauthorized` navigation event (consumed by a
 *      top-level in-Router listener) instead of a full-document redirect.
 *
 * Validates: Requirements 10.2, 23.2
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';

// Mock the structured error reporter so no real delivery/timers are scheduled
// when the retry path or onError hook routes a failure through it.
vi.mock('../../utils/errorReporter', () => ({
  errorReporter: { report: vi.fn() },
}));

// Import AFTER the mock so the singleton client is built against it.
import api from '../httpClient';
import { UNAUTHORIZED_EVENT } from '../navigationEvents';

// ─── window.location helper ─────────────────────────────────────────────────────
// httpClient's onUnauthorized reads/writes window.location, so we replace it with
// a writable stand-in we can assert against.
function installMockLocation(pathname: string): { get href(): string } {
  const loc = {
    href: `http://localhost${pathname}`,
    pathname,
    reload: vi.fn(),
    assign: vi.fn(),
    replace: vi.fn(),
  };
  Object.defineProperty(window, 'location', {
    configurable: true,
    writable: true,
    value: loc,
  });
  return loc;
}

function envelope(data: unknown) {
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

const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('httpClient backward-compatible raw axios export', () => {
  let mock: MockAdapter;

  beforeEach(() => {
    mock = new MockAdapter(api);
    Object.defineProperty(document, 'cookie', {
      writable: true,
      value: 'csrf-token=raw-instance-token-abc',
    });
    installMockLocation('/');
  });

  afterEach(() => {
    mock.restore();
    vi.restoreAllMocks();
  });

  describe('Auth-token / credential attachment', () => {
    it('sends credentials (cookie-based auth) on the raw instance', () => {
      // withCredentials ensures the auth/session cookie is attached to requests
      // made through the backward-compatible export.
      expect(api.defaults.withCredentials).toBe(true);
    });

    it('attaches the CSRF token from the cookie as x-csrf-token', async () => {
      let captured: Record<string, unknown> | undefined;
      mock.onGet('/secure').reply((reqConfig) => {
        captured = reqConfig.headers as Record<string, unknown>;
        return [200, envelope('ok')];
      });

      await api.get('/secure');

      expect(captured?.['x-csrf-token']).toBe('raw-instance-token-abc');
    });

    it('attaches a unique correlation id (UUID v4) per request', async () => {
      const ids: string[] = [];
      mock.onGet('/with-id').reply((reqConfig) => {
        ids.push(
          (reqConfig.headers as Record<string, string>)['x-correlation-id']
        );
        return [200, envelope('ok')];
      });

      await api.get('/with-id');
      await api.get('/with-id');

      expect(ids).toHaveLength(2);
      expect(ids[0]).toMatch(UUID_V4_REGEX);
      expect(ids[1]).toMatch(UUID_V4_REGEX);
      expect(ids[0]).not.toBe(ids[1]);
    });

    it('does not attach a CSRF header when the cookie is absent', async () => {
      Object.defineProperty(document, 'cookie', { writable: true, value: '' });
      let captured: Record<string, unknown> | undefined;
      mock.onGet('/no-cookie').reply((reqConfig) => {
        captured = reqConfig.headers as Record<string, unknown>;
        return [200, envelope('ok')];
      });

      await api.get('/no-cookie');

      expect(captured?.['x-csrf-token']).toBeUndefined();
    });

    it('unwraps the standard response envelope on the raw instance', async () => {
      mock.onGet('/item').reply(200, envelope({ id: 7, name: 'Item' }));

      const res = await api.get('/item');

      expect(res.data).toEqual({ id: 7, name: 'Item' });
    });
  });

  describe('401 unauthorized navigation', () => {
    it('dispatches the in-app unauthorized event when a 401 occurs and refresh fails', async () => {
      installMockLocation('/dashboard');
      mock.onGet('/protected').reply(401, { message: 'Unauthorized' });
      // The refresh attempt uses the base axios.post; make it fail so the
      // onUnauthorized handler runs.
      vi.spyOn(axios, 'post').mockRejectedValueOnce(new Error('refresh failed'));

      const onUnauthorized = vi.fn();
      window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
      try {
        await expect(api.get('/protected')).rejects.toBeTruthy();
      } finally {
        window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
      }

      // SPA-internal navigation (Req 23.2): a DOM event is dispatched instead of
      // a full-document `window.location` redirect, so the top-level in-Router
      // listener can perform a client-side navigate('/login').
      expect(onUnauthorized).toHaveBeenCalledTimes(1);
    });

    it('does not dispatch the unauthorized event for a successful request', async () => {
      installMockLocation('/dashboard');
      mock.onGet('/ok').reply(200, envelope('ok'));

      const onUnauthorized = vi.fn();
      window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
      try {
        await api.get('/ok');
      } finally {
        window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
      }

      expect(onUnauthorized).not.toHaveBeenCalled();
    });
  });
});
