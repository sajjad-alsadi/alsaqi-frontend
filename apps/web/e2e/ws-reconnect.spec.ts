import { test, expect } from './fixtures/backend';

/**
 * WebSocket reconnect / fallback E2E spec (Stream 1, Task 1.5).
 *
 * Exercises the critical "ws.reconnect" path from the design's sequence diagram:
 * the notification socket is dropped mid-session and the production
 * `WebSocketClient` (src/api/ws/websocket-client.ts) must resume notification
 * delivery within 30 seconds — here via backoff reconnection (the first reconnect
 * attempt fires ~1s after the drop and the mock backend immediately accepts it),
 * which is the reconnection branch of the OR in Requirement 1.2. The HTTP polling
 * fallback only begins after all 10 backoff attempts fail; that branch is covered
 * by the reconnect-convergence property test (Task 1.6) because exhausting 10
 * jittered backoff attempts (1s→30s) would exceed the 30s window by design.
 *
 * The spec asserts the FIRST post-drop notification is delivered EXACTLY ONCE.
 * Delivery count is observed at the transport level via a passive tap installed
 * on `window.WebSocket` (a `Proxy` that records every `type: 'notification'`
 * frame's `sequenceId`), so the assertion is independent of UI rendering, i18n,
 * and toast auto-dismiss timing.
 *
 * Mode: `mock` (the default). No request is issued to a real backend on :3000
 * (Requirement 1.5); the REST + WebSocket traffic is fulfilled by the backend
 * fixture and the two endpoint overrides below.
 *
 * _Requirements: 1.2_
 */

/** A realistic profile body. The app authenticates from `GET /profile` directly
 *  (AuthContext sets `user` to the response body), so returning a populated user
 *  object drives the app into its authenticated state without the login form. */
const PROFILE_BODY = {
  id: 'e2e-user',
  username: 'e2e',
  name: 'E2E Tester',
  email: 'e2e@test.local',
  role: 'admin',
  job_title: 'QA',
  is_active: true,
} as const;

/** The WS auth token body. `NotificationContext.getToken` reads `res.data.token`
 *  (top-level), so the token must sit at the body root, not inside an envelope. */
const WS_TOKEN_BODY = { token: 'e2e-ws-token' } as const;

const PRE_DROP_TITLE = 'PRE_DROP_BASELINE';
const POST_DROP_TITLE = 'POST_DROP_ALERT';
const PRE_DROP_SEQ = 1;
const POST_DROP_SEQ = 2;

/** Build a WebSocket notification frame in the shape the client expects. */
function notificationFrame(title: string, sequenceId: number) {
  return {
    type: 'notification',
    sequenceId,
    payload: {
      id: `notif-${sequenceId}`,
      title,
      description: `${title} body`,
      event_type: 'record_created',
      related_module: 'audit',
      date: new Date().toISOString(),
    },
  };
}

test.describe('WebSocket reconnect / fallback', () => {
  test('resumes notification delivery within 30s via reconnection, exactly once', async ({
    page,
    backend,
  }) => {
    // Build + reconnect + a generous delivery window — well over the default 30s
    // test timeout, but each individual delivery assertion stays within 30s.
    test.setTimeout(90_000);

    // Passive transport-level tap: record the sequenceId of every notification
    // frame the page's WebSocket receives. A `Proxy` wrapper preserves the
    // WebSocket statics (OPEN/CLOSED…), prototype, and `instanceof`, so the
    // production client behaves identically — we only observe inbound frames.
    await page.addInitScript(() => {
      const w = window as unknown as {
        __wsNotificationSeq?: number[];
        WebSocket: typeof WebSocket;
      };
      w.__wsNotificationSeq = [];
      const OriginalWebSocket = w.WebSocket;
      w.WebSocket = new Proxy(OriginalWebSocket, {
        construct(target, args) {
          const socket = Reflect.construct(target, args) as WebSocket;
          socket.addEventListener('message', (event: MessageEvent) => {
            try {
              const raw = typeof event.data === 'string' ? event.data : '';
              const data = JSON.parse(raw) as { type?: string; sequenceId?: number };
              if (data && data.type === 'notification' && typeof data.sequenceId === 'number') {
                w.__wsNotificationSeq!.push(data.sequenceId);
              }
            } catch {
              /* ignore non-JSON / non-notification frames */
            }
          });
          return socket;
        },
      }) as unknown as typeof WebSocket;
    });

    // Count fresh WS auth-token fetches. The client fetches a fresh token on every
    // connection attempt, so an increment after the drop proves a NEW socket was
    // established (reconnection) rather than the HTTP polling fallback.
    let wsTokenRequestCount = 0;
    page.on('request', (req) => {
      if (/\/auth\/ws-token(?:\?|$)/.test(req.url())) {
        wsTokenRequestCount += 1;
      }
    });

    // Endpoint overrides (page routes take precedence over the fixture's context
    // catch-all). Both return un-enveloped bodies, matching how the app reads them.
    await page.route(/\/api\/profile(?:\?|$)/, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(PROFILE_BODY),
      }),
    );
    await page.route(/\/auth\/ws-token(?:\?|$)/, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(WS_TOKEN_BODY),
      }),
    );

    // Load the app; it authenticates from /profile and opens the notification WS.
    await page.goto('/');

    // Wait for the initial connection (first token fetch) and let the socket open.
    await expect
      .poll(() => wsTokenRequestCount, { timeout: 20_000 })
      .toBeGreaterThanOrEqual(1);
    await page.waitForTimeout(500);

    // Baseline: a notification delivered over the live socket surfaces as a toast.
    await backend.socket.send(notificationFrame(PRE_DROP_TITLE, PRE_DROP_SEQ));
    await expect(page.getByText(PRE_DROP_TITLE).first()).toBeVisible({ timeout: 10_000 });

    // ── Drop the socket ──────────────────────────────────────────────────────
    const tokenFetchesBeforeDrop = wsTokenRequestCount;
    await backend.socket.drop();

    // Reconnection (not polling): a new token fetch within the backoff window
    // proves the client re-established a WebSocket connection well under 30s.
    await expect
      .poll(() => wsTokenRequestCount, { timeout: 30_000 })
      .toBeGreaterThan(tokenFetchesBeforeDrop);
    await page.waitForTimeout(500); // allow the new socket to reach OPEN

    // The first post-drop notification must be delivered, and delivered once.
    await backend.socket.send(notificationFrame(POST_DROP_TITLE, POST_DROP_SEQ));
    await expect(page.getByText(POST_DROP_TITLE).first()).toBeVisible({ timeout: 30_000 });

    // Exactly-once: the post-drop sequenceId was received by the page exactly once.
    const deliveries = await page.evaluate(
      () => (window as unknown as { __wsNotificationSeq: number[] }).__wsNotificationSeq,
    );
    expect(deliveries.filter((seq) => seq === POST_DROP_SEQ)).toHaveLength(1);
  });
});
