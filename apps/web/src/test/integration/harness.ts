// @vitest-environment node
/**
 * Frontend ↔ Backend integration harness (MSW-backed).
 *
 * These integration tests drive the REAL composed API client
 * (`createComposedApiClient` from `src/api`) and the REAL `createApiClient`
 * transport against an in-process MSW server that emulates the backend contract
 * published in `docs/openapi.yaml`. No real backend (port 3000) is required, and
 * every request flows through the production interceptors (CSRF attach,
 * correlation id, envelope unwrap, Zod validation, 401→refresh→retry,
 * exponential backoff, version-mismatch detection).
 *
 * The harness centralizes:
 *  - a single MSW `setupServer` lifecycle,
 *  - the success / error envelope builders the backend uses,
 *  - a deterministic CSRF cookie setter,
 *  - the canonical base URL the composed client is configured with.
 *
 * @module test/integration/harness
 */
import { afterAll, afterEach, beforeAll } from 'vitest';
import { setupServer } from 'msw/node';
import { createComposedApiClient, type ComposedApiClient } from '../../api';
import { createApiClient, type ApiClient, type ApiClientError } from '../../api/client';

/** The base URL the integration clients target (mirrors the app's VITE_API_URL). */
export const API_BASE = 'http://localhost:3000/api';

/** Shared MSW server. Handlers are registered per-test via `server.use(...)`. */
export const server = setupServer();

/**
 * Install the MSW lifecycle for a test file. Call once at the top level of a
 * `describe`/module. `onUnhandledRequest: 'error'` guarantees that any request
 * the client makes which the test did not explicitly stub fails loudly — so an
 * unexpected URL (e.g. a wrong path prefix) is caught rather than silently
 * hanging.
 */
export function installServer(): void {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());
}

/** A well-formed backend success envelope: `{ success, data, meta }`. */
export function successEnvelope(
  data: unknown,
  meta?: Record<string, unknown>
): { success: true; data: unknown; meta: Record<string, unknown> } {
  return {
    success: true,
    data,
    meta: {
      requestId: '550e8400-e29b-41d4-a716-446655440000',
      timestamp: '2024-01-01T00:00:00.000Z',
      version: '1.0.0',
      ...meta,
    },
  };
}

/** A backend error envelope: `{ success: false, error: { code, message } }`. */
export function errorEnvelope(
  code: number,
  message: string
): { success: false; error: { code: number; message: string } } {
  return { success: false, error: { code, message } };
}

/**
 * Set (or clear) `document.cookie` deterministically. The jsdom environment is
 * not active in these node-environment tests, so `document` may be undefined;
 * callers that need a CSRF cookie should run under `@vitest-environment jsdom`.
 */
export function setCookie(value: string): void {
  Object.defineProperty(document, 'cookie', {
    writable: true,
    configurable: true,
    value,
  });
}

/**
 * Build a fresh composed API client pointed at the MSW base URL. Each test gets
 * its own instance so per-instance refresh/version state never leaks between
 * tests.
 */
export function makeComposedClient(
  onError?: (e: ApiClientError) => void
): ComposedApiClient {
  return createComposedApiClient({
    baseUrl: API_BASE,
    timeout: 5000,
    onUnauthorized: () => {},
    onError: onError ?? (() => {}),
  });
}

/** Build a fresh low-level API client (for transport-level scenarios). */
export function makeRawClient(opts?: {
  onUnauthorized?: () => void;
  onError?: (e: ApiClientError) => void;
}): ApiClient {
  return createApiClient({
    baseUrl: API_BASE,
    timeout: 5000,
    onUnauthorized: opts?.onUnauthorized ?? (() => {}),
    onError: opts?.onError ?? (() => {}),
  });
}
