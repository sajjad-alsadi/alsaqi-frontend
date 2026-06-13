/**
 * Task 2.7 — MSW-backed contract scenarios exercised through the REAL
 * `createApiClient` and the REAL `WebSocketClient`.
 *
 * These scenarios drive the production HTTP/WebSocket clients (not re-implemented
 * stand-ins) and lock the frontend's contract assumptions against the backend:
 *
 *  - **csrf** (Requirement 2.3): a state-changing request carries an
 *    `x-csrf-token` header whose value equals the `csrf-token` cookie value.
 *  - **session.refresh** (Requirement 2.4): a 401 triggers exactly one
 *    `/auth/refresh` round-trip with credentials included, then a single retry.
 *  - **ws.auth** (Requirement 2.5): the WebSocket client sends exactly one
 *    `{ type: 'auth', token }` message after the socket opens, and never places
 *    the token in the connection URL.
 *
 * **Validates: Requirements 2.3, 2.4, 2.5**
 */
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  afterEach,
  beforeEach,
  vi,
} from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { z } from 'zod';
import { createApiClient } from '../../api/client';
import { createWebSocketClient } from '../../api/ws/websocket-client';
import type { ContractScenario } from './contract';

const BASE_URL = 'http://localhost:3000/api';

/** Build a well-formed success envelope `{ success, data, meta }`. */
function successEnvelope(data: unknown) {
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

/** Set (or clear) the document cookie deterministically for a test. */
function setCookie(value: string): void {
  Object.defineProperty(document, 'cookie', {
    writable: true,
    configurable: true,
    value,
  });
}

// A single MSW node server intercepts the axios XHR traffic emitted by the real
// client. Handlers are registered per-test via `server.use(...)`.
const server = setupServer();

describe('MSW contract scenarios through the real client (task 2.7)', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  // ─── csrf (Requirement 2.3) ──────────────────────────────────────────────
  describe('csrf scenario', () => {
    const CSRF_COOKIE_VALUE = 'csrf-token-abc-123';

    beforeEach(() => {
      setCookie(`csrf-token=${CSRF_COOKIE_VALUE}`);
    });

    it('attaches x-csrf-token equal to the csrf-token cookie on a state-changing request', async () => {
      let capturedCsrf: string | null = null;

      const scenario: ContractScenario = {
        name: 'csrf',
        handler: http.post(`${BASE_URL}/audit-plans`, ({ request }) => {
          capturedCsrf = request.headers.get('x-csrf-token');
          return HttpResponse.json(successEnvelope({ id: 1 }));
        }),
      };
      server.use(scenario.handler);

      const client = createApiClient({ baseUrl: BASE_URL });
      await client.post('/audit-plans', z.object({ id: z.number() }), { title: 'Q1 plan' });

      // The header value MUST equal the cookie value byte-for-byte (Req 2.3).
      expect(capturedCsrf).toBe(CSRF_COOKIE_VALUE);
    });

    it('applies the csrf header to every state-changing verb (PUT/PATCH/DELETE)', async () => {
      const captured: Record<string, string | null> = {};

      server.use(
        http.put(`${BASE_URL}/audit-plans/1`, ({ request }) => {
          captured['put'] = request.headers.get('x-csrf-token');
          return HttpResponse.json(successEnvelope({ id: 1 }));
        }),
        http.patch(`${BASE_URL}/audit-plans/1`, ({ request }) => {
          captured['patch'] = request.headers.get('x-csrf-token');
          return HttpResponse.json(successEnvelope({ id: 1 }));
        }),
        http.delete(`${BASE_URL}/audit-plans/1`, ({ request }) => {
          captured['delete'] = request.headers.get('x-csrf-token');
          return HttpResponse.json(successEnvelope({ id: 1 }));
        })
      );

      const client = createApiClient({ baseUrl: BASE_URL });
      const schema = z.object({ id: z.number() });
      await client.put('/audit-plans/1', schema, { title: 'x' });
      await client.patch('/audit-plans/1', schema, { title: 'y' });
      await client.delete('/audit-plans/1', schema);

      expect(captured['put']).toBe(CSRF_COOKIE_VALUE);
      expect(captured['patch']).toBe(CSRF_COOKIE_VALUE);
      expect(captured['delete']).toBe(CSRF_COOKIE_VALUE);
    });
  });

  // ─── session.refresh (Requirement 2.4) ───────────────────────────────────
  describe('session.refresh scenario', () => {
    beforeEach(() => {
      setCookie('');
    });

    it('performs exactly one /auth/refresh round-trip with credentials on a single 401', async () => {
      let protectedHits = 0;
      let refreshHits = 0;
      let refreshCredentials: RequestCredentials | undefined;

      const scenario: ContractScenario = {
        name: 'session.refresh',
        handler: http.post(`${BASE_URL}/auth/refresh`, ({ request }) => {
          refreshHits++;
          refreshCredentials = request.credentials;
          return HttpResponse.json({ success: true });
        }),
      };

      server.use(
        http.get(`${BASE_URL}/protected`, () => {
          protectedHits++;
          if (protectedHits === 1) {
            return HttpResponse.json({ message: 'Unauthorized' }, { status: 401 });
          }
          return HttpResponse.json(successEnvelope({ ok: true }));
        }),
        scenario.handler
      );

      const client = createApiClient({ baseUrl: BASE_URL });
      const result = await client.get('/protected', z.object({ ok: z.boolean() }));

      expect(result).toEqual({ ok: true });
      // Exactly one refresh round-trip (Req 2.4).
      expect(refreshHits).toBe(1);
      // Original request + exactly one retry after the refresh.
      expect(protectedHits).toBe(2);
      // The refresh round-trip is performed with credentials included (Req 2.4).
      expect(refreshCredentials).toBe('include');
    });

    it('does not issue a second refresh when the retried request succeeds', async () => {
      let refreshHits = 0;
      let protectedHits = 0;

      server.use(
        http.get(`${BASE_URL}/protected`, () => {
          protectedHits++;
          // Only the very first attempt is unauthorized; the post-refresh retry
          // succeeds, so no further refresh may be triggered.
          if (protectedHits === 1) {
            return HttpResponse.json({ message: 'Unauthorized' }, { status: 401 });
          }
          return HttpResponse.json(successEnvelope({ ok: true }));
        }),
        http.post(`${BASE_URL}/auth/refresh`, () => {
          refreshHits++;
          return HttpResponse.json({ success: true });
        })
      );

      const client = createApiClient({ baseUrl: BASE_URL });
      await client.get('/protected', z.object({ ok: z.boolean() }));

      expect(refreshHits).toBe(1);
    });
  });

  // ─── ws.auth (Requirement 2.5) ────────────────────────────────────────────
  describe('ws.auth scenario', () => {
    interface ParsedWsMessage {
      type?: string;
      token?: string;
      [key: string]: unknown;
    }

    let instances: MockWebSocket[] = [];

    class MockWebSocket {
      static CONNECTING = 0;
      static OPEN = 1;
      static CLOSING = 2;
      static CLOSED = 3;

      url: string;
      readyState: number = MockWebSocket.CONNECTING;
      onopen: ((event: Event) => void) | null = null;
      onmessage: ((event: MessageEvent) => void) | null = null;
      onclose: ((event: CloseEvent) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;
      sentMessages: string[] = [];

      constructor(url: string) {
        this.url = url;
        instances.push(this);
      }

      send(data: string): void {
        this.sentMessages.push(data);
      }

      close(): void {
        this.readyState = MockWebSocket.CLOSED;
      }

      simulateOpen(): void {
        this.readyState = MockWebSocket.OPEN;
        this.onopen?.(new Event('open'));
      }

      authMessages(): ParsedWsMessage[] {
        return this.sentMessages
          .map((m) => JSON.parse(m) as ParsedWsMessage)
          .filter((m) => m.type === 'auth');
      }
    }

    beforeEach(() => {
      vi.useFakeTimers();
      instances = [];
      vi.stubGlobal('WebSocket', MockWebSocket);
    });

    afterEach(() => {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    });

    it('sends exactly one { type: "auth", token } after open and never puts the token in the URL', async () => {
      const token = 'jwt-secret-token-xyz';
      const client = createWebSocketClient({
        wsUrl: 'ws://localhost:3000/ws',
        getToken: async () => token,
        httpBaseUrl: 'http://localhost:3000/api',
      });

      client.connect();
      // The client awaits getToken() before constructing the socket (microtask).
      await vi.advanceTimersByTimeAsync(0);

      expect(instances).toHaveLength(1);
      const ws = instances[0];

      // The token MUST NOT appear in the connection URL or its query string (Req 2.5).
      expect(ws.url).toBe('ws://localhost:3000/ws');
      expect(ws.url).not.toContain(token);
      expect(ws.url).not.toContain('?');

      // No auth message before the socket reaches the open state.
      expect(ws.authMessages()).toHaveLength(0);

      ws.simulateOpen();

      // Exactly one auth message, carrying the token in the body (Req 2.5).
      const authMessages = ws.authMessages();
      expect(authMessages).toHaveLength(1);
      expect(authMessages[0]).toEqual({ type: 'auth', token });

      client.disconnect();
    });

    it('relies on the cookie session (sends no auth message) when no token is available', async () => {
      const client = createWebSocketClient({
        wsUrl: 'ws://localhost:3000/ws',
        getToken: async () => null,
        httpBaseUrl: 'http://localhost:3000/api',
      });

      client.connect();
      await vi.advanceTimersByTimeAsync(0);

      // With a null token the client never opens a socket (relies on cookie session).
      expect(instances).toHaveLength(0);

      client.disconnect();
    });
  });
});
