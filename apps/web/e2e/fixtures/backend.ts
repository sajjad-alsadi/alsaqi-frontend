import {
  test as base,
  expect,
  type BrowserContext,
  type Page,
  type Request,
  type Route,
  type WebSocketRoute,
} from '@playwright/test';
import { randomUUID } from 'node:crypto';

/**
 * Deterministic backend fixture for the E2E harness (Stream 1).
 *
 * Two modes are supported:
 *
 * - `mock` (the default, used in CI): every REST and WebSocket request that the
 *   app would send to the backend service on `:3000` is intercepted and
 *   fulfilled locally via Playwright route interception. No socket is ever
 *   opened to `:3000`, satisfying Requirement 1.5 (the harness issues no network
 *   request to the backend service in CI).
 * - `live`: requests pass through to the real backend on `:3000` for local
 *   full-stack verification. Before any test step runs, the fixture probes the
 *   backend and fails fast (well within 30s) with an error that identifies the
 *   unreachable backend, satisfying Requirement 1.6.
 *
 * @module e2e/fixtures/backend
 */

/** Backend interaction mode. */
export type BackendMode = 'live' | 'mock';

/**
 * The four critical user paths the E2E harness must exercise (see design
 * Component 1).
 */
export type CriticalPath =
  | 'auth.refresh-401'
  | 'ws.reconnect'
  | 'files.upload-download'
  | 'i18n.rtl-ltr-switch';

/**
 * Deterministic data seeded into `mock` mode so list/detail assertions are
 * stable. Each key is a resource collection (camelCase) whose value is the list
 * of records the mock backend serves for that collection. Records with an `id`
 * field are addressable by detail routes (e.g. `/api/audit-plans/:id`).
 */
export interface SeedDataset {
  auditPlans?: unknown[];
  findings?: unknown[];
  correspondence?: unknown[];
  recommendations?: unknown[];
  risks?: unknown[];
  users?: unknown[];
  notifications?: unknown[];
  [collection: string]: unknown[] | undefined;
}

/** WebSocket controls exposed by the fixture for reconnect scenarios. */
export interface BackendSocketControls {
  /** Simulate a connection drop (close the mocked socket). */
  drop(): Promise<void>;
  /** Push a WebSocket frame to the app. Objects are JSON-serialized. */
  send(frame: unknown): Promise<void>;
}

/**
 * The backend fixture surface consumed by E2E specs.
 *
 * @see design.md Component 1 — E2E Verification Harness.
 */
export interface BackendFixture {
  /** `'live'` targets the real backend on `:3000`; `'mock'` uses route interception. */
  mode: BackendMode;
  /**
   * Force the next `times` (default 1) requests matching `urlPattern` to resolve
   * with `status`; subsequent requests pass through to the default handler. Used
   * to drive the 401-refresh path deterministically. Mock mode only.
   */
  forceStatus(urlPattern: string | RegExp, status: number, times?: number): Promise<void>;
  /** Push a WebSocket frame or simulate a drop for reconnect scenarios. Mock mode only. */
  socket: BackendSocketControls;
  /** Seed deterministic data so list/detail assertions are stable. Mock mode only. */
  seed(dataset: SeedDataset): Promise<void>;
}

const DEFAULT_BACKEND_ORIGIN = 'http://localhost:3000';
/** Live-mode reachability probe budget — kept well under the 30s ceiling (Req 1.6). */
const LIVE_PROBE_TIMEOUT_MS = 5_000;

/** Resolve the configured backend mode (defaults to `mock` for CI determinism). */
function resolveMode(): BackendMode {
  return (process.env['E2E_BACKEND_MODE'] ?? 'mock').toLowerCase() === 'live' ? 'live' : 'mock';
}

/** Resolve the backend HTTP origin (no trailing slash). */
function resolveBackendOrigin(): string {
  return (process.env['E2E_BACKEND_ORIGIN'] ?? DEFAULT_BACKEND_ORIGIN).replace(/\/+$/, '');
}

/** Resolve the backend WebSocket origin, derived from the HTTP origin by default. */
function resolveWsOrigin(httpOrigin: string): string {
  return process.env['E2E_WS_URL'] ?? httpOrigin.replace(/^http/, 'ws');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Convert a path segment like `audit-plans` to a collection key like `auditPlans`. */
function toCamelCase(segment: string): string {
  return segment.replace(/[-_]+(\w)/g, (_match, char: string) => char.toUpperCase());
}

function isRecordWithId(item: unknown, id: string): boolean {
  return (
    typeof item === 'object' &&
    item !== null &&
    'id' in item &&
    String((item as { id: unknown }).id) === id
  );
}

/**
 * Fail fast when `live` mode is selected but the backend is unreachable.
 *
 * Resolves on any HTTP response (even 4xx/5xx — the service is up) and throws on
 * a network-level failure or timeout, identifying the unreachable backend.
 * Throwing here (in fixture setup) ensures no further test steps run (Req 1.6).
 */
async function assertLiveBackendReachable(origin: string): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LIVE_PROBE_TIMEOUT_MS);
  try {
    await fetch(`${origin}/api/health`, { method: 'GET', signal: controller.signal });
  } catch {
    throw new Error(
      `[BackendFixture] live mode selected but the backend at ${origin} is unreachable ` +
        `(no response within ${LIVE_PROBE_TIMEOUT_MS}ms). Start the backend service on :3000 ` +
        `or run the harness in mock mode (E2E_BACKEND_MODE=mock).`
    );
  } finally {
    clearTimeout(timer);
  }
}

interface ForcedStatus {
  pattern: string | RegExp;
  status: number;
  remaining: number;
}

/**
 * Mock backend: intercepts every REST + WebSocket request to the backend origin
 * and fulfills it locally. Never forwards to `:3000` (Req 1.5).
 */
class MockBackend implements BackendFixture {
  readonly mode = 'mock' as const;
  private dataset: SeedDataset = {};
  private readonly forced: ForcedStatus[] = [];
  private wsRoute: WebSocketRoute | null = null;
  /**
   * Raw bytes of files uploaded during a test, keyed by the id the mock hands
   * back from the upload endpoint. The download endpoint echoes these bytes
   * back verbatim so specs can assert byte-for-byte fidelity (Req 1.3).
   */
  private readonly files = new Map<string, Buffer>();
  private fileCounter = 0;

  constructor(
    private readonly context: BrowserContext,
    private readonly page: Page,
    private readonly httpOrigin: string,
    private readonly wsOrigin: string
  ) {}

  /** Register REST + WebSocket interception before the app issues any request. */
  async install(): Promise<void> {
    await this.context.route(`${this.httpOrigin}/**`, (route) => this.handleRoute(route));
    await this.page.routeWebSocket(new RegExp(`^${escapeRegExp(this.wsOrigin)}`), (ws) => {
      // Fully mocked socket: do NOT connect to a real server, so mock mode never
      // opens a connection to :3000 (Req 1.5).
      this.wsRoute = ws;
    });
  }

  async forceStatus(urlPattern: string | RegExp, status: number, times = 1): Promise<void> {
    this.forced.push({ pattern: urlPattern, status, remaining: Math.max(1, times) });
  }

  async seed(dataset: SeedDataset): Promise<void> {
    this.dataset = { ...this.dataset, ...dataset };
  }

  get socket(): BackendSocketControls {
    return {
      drop: async () => {
        this.wsRoute?.close();
      },
      send: async (frame: unknown) => {
        const payload = typeof frame === 'string' ? frame : JSON.stringify(frame);
        this.wsRoute?.send(payload);
      },
    };
  }

  private async handleRoute(route: Route): Promise<void> {
    const request = route.request();
    const url = request.url();
    const method = request.method().toUpperCase();
    const cors = this.corsHeaders(request);

    // Cross-origin preflight: the app (and the file specs) issue requests from
    // :5173 to the backend on :3000, so every intercepted response must carry
    // CORS headers and OPTIONS must be answered, or the browser blocks the
    // response before the test can read it.
    if (method === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: cors, body: '' });
      return;
    }

    const forced = this.takeForcedStatus(url);
    if (forced !== null) {
      await route.fulfill({
        status: forced,
        headers: { ...cors, 'content-type': 'application/json' },
        body: JSON.stringify(this.envelopeForStatus(forced)),
      });
      return;
    }

    // File upload: store the raw request body and hand back an id so the
    // matching download can echo the exact bytes (Req 1.3).
    if (this.isFileUpload(method, url)) {
      const body = request.postDataBuffer() ?? Buffer.alloc(0);
      const id = `e2e-file-${++this.fileCounter}`;
      this.files.set(id, body);
      await route.fulfill({
        status: 201,
        headers: { ...cors, 'content-type': 'application/json' },
        body: JSON.stringify({
          success: true,
          data: { id, sizeBytes: body.length },
          meta: this.buildMeta(),
        }),
      });
      return;
    }

    // File download: return the previously uploaded bytes verbatim.
    const downloadId = this.fileDownloadId(method, url);
    if (downloadId !== null) {
      const stored = this.files.get(downloadId);
      if (stored === undefined) {
        await route.fulfill({
          status: 404,
          headers: { ...cors, 'content-type': 'application/json' },
          body: JSON.stringify({
            success: false,
            error: { code: 404, message: `Unknown file id ${downloadId}` },
            meta: this.buildMeta(),
          }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        headers: {
          ...cors,
          'content-type': 'application/octet-stream',
          'content-length': String(stored.length),
        },
        body: stored,
      });
      return;
    }

    await route.fulfill({
      status: 200,
      headers: { ...cors, 'content-type': 'application/json' },
      body: JSON.stringify(this.defaultBody(method, url)),
    });
  }

  /**
   * Build permissive CORS headers for an intercepted cross-origin request. The
   * request origin is reflected (rather than `*`) and credentials are allowed so
   * the app's `withCredentials` XHRs are not blocked by the browser.
   */
  private corsHeaders(request: Request): Record<string, string> {
    const origin = request.headers()['origin'] ?? '*';
    const requestedHeaders = request.headers()['access-control-request-headers'] ?? '*';
    return {
      'access-control-allow-origin': origin,
      'access-control-allow-credentials': 'true',
      'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
      'access-control-allow-headers': requestedHeaders,
      'access-control-expose-headers': 'content-length,content-type',
    };
  }

  /** A POST/PUT to a `/files` (optionally `/files/upload`) path is an upload. */
  private isFileUpload(method: string, url: string): boolean {
    if (method !== 'POST' && method !== 'PUT') return false;
    const segments = this.pathSegments(url);
    const last = segments[segments.length - 1];
    const prev = segments[segments.length - 2];
    return last === 'files' || (last === 'upload' && prev === 'files');
  }

  /**
   * Resolve the file id for a download request shaped like
   * `/files/:id/content` or `/files/:id/download`, else `null`.
   */
  private fileDownloadId(method: string, url: string): string | null {
    if (method !== 'GET') return null;
    const segments = this.pathSegments(url);
    const n = segments.length;
    if (n < 3) return null;
    const last = segments[n - 1];
    const id = segments[n - 2];
    const collection = segments[n - 3];
    if (collection === 'files' && (last === 'content' || last === 'download') && id) {
      return id;
    }
    return null;
  }

  private takeForcedStatus(url: string): number | null {
    for (const entry of this.forced) {
      if (entry.remaining > 0 && this.matchesPattern(entry.pattern, url)) {
        entry.remaining -= 1;
        return entry.status;
      }
    }
    return null;
  }

  private matchesPattern(pattern: string | RegExp, url: string): boolean {
    return typeof pattern === 'string' ? url.includes(pattern) : pattern.test(url);
  }

  private envelopeForStatus(status: number): unknown {
    if (status >= 200 && status < 300) {
      return { success: true, data: null, meta: this.buildMeta() };
    }
    return {
      success: false,
      error: { code: status, message: `Forced status ${status}` },
      meta: this.buildMeta(),
    };
  }

  private defaultBody(method: string, url: string): unknown {
    const collection = this.collectionFor(url);
    const items = (collection ? this.dataset[collection] : undefined) ?? [];

    if (method.toUpperCase() === 'GET') {
      const id = this.idFor(url);
      if (id !== null) {
        const found = items.find((item) => isRecordWithId(item, id)) ?? null;
        return { success: true, data: found, meta: this.buildMeta() };
      }
      return {
        success: true,
        data: items,
        meta: this.buildMeta({ pagination: { total: items.length, totalPages: 1 } }),
      };
    }

    // Non-GET (POST/PUT/PATCH/DELETE): acknowledge without mutating seeded data.
    return { success: true, data: null, meta: this.buildMeta() };
  }

  private pathSegments(url: string): string[] {
    try {
      const { pathname } = new URL(url);
      return pathname
        .replace(/^\/+/, '')
        .replace(/^api\//, '')
        .split('/')
        .filter(Boolean);
    } catch {
      return [];
    }
  }

  private collectionFor(url: string): string | null {
    const segments = this.pathSegments(url);
    const first = segments[0];
    return first ? toCamelCase(first) : null;
  }

  private idFor(url: string): string | null {
    const segments = this.pathSegments(url);
    return segments.length >= 2 ? (segments[1] ?? null) : null;
  }

  private buildMeta(extra: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      requestId: randomUUID(),
      timestamp: new Date().toISOString(),
      version: '1',
      ...extra,
    };
  }
}

/**
 * Live backend: requests pass through to the real backend on `:3000`. The mock
 * controls are unavailable and throw to surface misuse during local runs.
 */
class LiveBackend implements BackendFixture {
  readonly mode = 'live' as const;

  async forceStatus(): Promise<void> {
    throw new Error('[BackendFixture] forceStatus is only available in mock mode.');
  }

  async seed(): Promise<void> {
    // Live mode relies on the real backend's data; seeding is a no-op.
  }

  get socket(): BackendSocketControls {
    return {
      drop: async () => {
        throw new Error('[BackendFixture] socket.drop is only available in mock mode.');
      },
      send: async () => {
        throw new Error('[BackendFixture] socket.send is only available in mock mode.');
      },
    };
  }
}

/**
 * Playwright test object extended with the `backend` fixture.
 *
 * Specs import `{ test, expect }` from this module instead of `@playwright/test`
 * to receive a deterministic backend per test.
 */
export const test = base.extend<{ backend: BackendFixture }>({
  backend: async ({ context, page }, use) => {
    const mode = resolveMode();
    const httpOrigin = resolveBackendOrigin();

    if (mode === 'live') {
      await assertLiveBackendReachable(httpOrigin);
      await use(new LiveBackend());
      return;
    }

    const mock = new MockBackend(context, page, httpOrigin, resolveWsOrigin(httpOrigin));
    await mock.install();
    await use(mock);
  },
});

export { expect };

/**
 * The HTTP origin the mock backend intercepts (no trailing slash). Specs use
 * this to build absolute upload/download URLs that the fixture will catch.
 */
export function backendHttpOrigin(): string {
  return resolveBackendOrigin();
}
