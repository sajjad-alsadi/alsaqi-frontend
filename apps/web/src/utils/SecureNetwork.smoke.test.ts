// @vitest-environment jsdom
//
// Smoke test: Secure_Network_Module must not override global network primitives
// (code-review remediation, Req 1). Initializing the module must leave
// `window.fetch` and `XMLHttpRequest.prototype.open/send` exactly as they were,
// and must not reintroduce the legacy "Unauthorized request origin" gate on
// cross-origin requests (Req 1.1, 1.2, 1.3, 1.4).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initSecureNetwork, SecureNetwork } from './SecureNetwork';

const CROSS_ORIGIN_URL = 'https://api.other-origin.example/v1/resource';

describe('SecureNetwork smoke: globals are not overridden', () => {
  // jsdom does not ship a native `window.fetch`, so install a recognizable
  // sentinel that stands in for the browser-provided global. The smoke test
  // asserts the module leaves whatever `fetch` is present untouched.
  let sentinelFetch: typeof window.fetch;
  let originalFetchDescriptor: PropertyDescriptor | undefined;

  beforeEach(() => {
    originalFetchDescriptor = Object.getOwnPropertyDescriptor(window, 'fetch');
    sentinelFetch = vi.fn(async () =>
      new Response(null, { status: 200 }),
    ) as unknown as typeof window.fetch;
    Object.defineProperty(window, 'fetch', {
      configurable: true,
      writable: true,
      value: sentinelFetch,
    });
  });

  afterEach(() => {
    if (originalFetchDescriptor) {
      Object.defineProperty(window, 'fetch', originalFetchDescriptor);
    } else {
      // `fetch` was not present before the test; remove our sentinel.
      delete (window as { fetch?: unknown }).fetch;
    }
    vi.restoreAllMocks();
  });

  it('does not replace window.fetch when the module is initialized', () => {
    const fetchBeforeInit = window.fetch;

    initSecureNetwork();
    // Also exercise the retained instance method.
    new SecureNetwork().initInterceptors();

    expect(window.fetch).toBe(fetchBeforeInit);
    expect(window.fetch).toBe(sentinelFetch);
  });

  it('does not replace XMLHttpRequest.prototype.open or send when initialized', () => {
    const openBeforeInit = XMLHttpRequest.prototype.open;
    const sendBeforeInit = XMLHttpRequest.prototype.send;

    initSecureNetwork();
    new SecureNetwork().initInterceptors();

    expect(XMLHttpRequest.prototype.open).toBe(openBeforeInit);
    expect(XMLHttpRequest.prototype.send).toBe(sendBeforeInit);
  });

  it('does not buffer/wrap fetch: the sentinel native fetch is invoked directly', async () => {
    initSecureNetwork();

    await window.fetch(CROSS_ORIGIN_URL, {
      method: 'POST',
      body: 'free-text payload',
    });

    expect(sentinelFetch).toHaveBeenCalledTimes(1);
    expect(sentinelFetch).toHaveBeenCalledWith(
      CROSS_ORIGIN_URL,
      expect.objectContaining({ method: 'POST', body: 'free-text payload' }),
    );
  });

  it('does not throw "Unauthorized request origin" for a cross-origin fetch', async () => {
    initSecureNetwork();

    await expect(window.fetch(CROSS_ORIGIN_URL)).resolves.toBeDefined();
  });

  it('does not throw "Unauthorized request origin" when opening a cross-origin XHR', () => {
    initSecureNetwork();

    const xhr = new XMLHttpRequest();

    expect(() => xhr.open('GET', CROSS_ORIGIN_URL)).not.toThrow();
  });
});
