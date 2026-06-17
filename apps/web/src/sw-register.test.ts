import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { registerServiceWorker } from './sw-register';

describe('registerServiceWorker', () => {
  let mockRegistration: {
    installing: any;
    addEventListener: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockRegistration = {
      installing: null,
      addEventListener: vi.fn(),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // Remove serviceWorker mock if set
    if ('serviceWorker' in navigator) {
      Object.defineProperty(navigator, 'serviceWorker', {
        value: undefined,
        configurable: true,
        writable: true,
      });
    }
  });

  it('does nothing when serviceWorker is not supported', async () => {
    // navigator.serviceWorker is undefined by default in jsdom
    Object.defineProperty(navigator, 'serviceWorker', {
      value: undefined,
      configurable: true,
      writable: true,
    });

    await registerServiceWorker();
    // No error thrown, function completes silently
  });

  it('registers the service worker with correct options', async () => {
    const registerFn = vi.fn().mockResolvedValue(mockRegistration);

    Object.defineProperty(navigator, 'serviceWorker', {
      value: { register: registerFn },
      configurable: true,
      writable: true,
    });

    await registerServiceWorker();

    expect(registerFn).toHaveBeenCalledWith('/sw.js', {
      scope: '/',
      updateViaCache: 'none',
    });
  });

  it('listens for updatefound event on registration', async () => {
    const registerFn = vi.fn().mockResolvedValue(mockRegistration);

    Object.defineProperty(navigator, 'serviceWorker', {
      value: { register: registerFn },
      configurable: true,
      writable: true,
    });

    await registerServiceWorker();

    expect(mockRegistration.addEventListener).toHaveBeenCalledWith(
      'updatefound',
      expect.any(Function)
    );
  });

  it('dispatches sw:updated event when new worker activates', async () => {
    const newWorker = {
      state: 'installing',
      addEventListener: vi.fn(),
    };

    mockRegistration.installing = newWorker;

    const registerFn = vi.fn().mockResolvedValue(mockRegistration);

    Object.defineProperty(navigator, 'serviceWorker', {
      value: { register: registerFn },
      configurable: true,
      writable: true,
    });

    await registerServiceWorker();

    // Trigger the updatefound callback
    const updateFoundHandler = mockRegistration.addEventListener.mock.calls[0][1];
    updateFoundHandler();

    // Verify statechange listener is attached to the new worker
    expect(newWorker.addEventListener).toHaveBeenCalledWith(
      'statechange',
      expect.any(Function)
    );

    // Simulate activation
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    newWorker.state = 'activated';
    const stateChangeHandler = newWorker.addEventListener.mock.calls[0][1];
    stateChangeHandler();

    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'sw:updated' })
    );
  });

  it('does not dispatch event for states other than activated', async () => {
    const newWorker = {
      state: 'installing',
      addEventListener: vi.fn(),
    };

    mockRegistration.installing = newWorker;

    const registerFn = vi.fn().mockResolvedValue(mockRegistration);

    Object.defineProperty(navigator, 'serviceWorker', {
      value: { register: registerFn },
      configurable: true,
      writable: true,
    });

    await registerServiceWorker();

    const updateFoundHandler = mockRegistration.addEventListener.mock.calls[0][1];
    updateFoundHandler();

    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    newWorker.state = 'installed';
    const stateChangeHandler = newWorker.addEventListener.mock.calls[0][1];
    stateChangeHandler();

    expect(dispatchSpy).not.toHaveBeenCalled();
  });

  it('logs a warning when registration fails', async () => {
    const error = new Error('SW registration failed');
    const registerFn = vi.fn().mockRejectedValue(error);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    Object.defineProperty(navigator, 'serviceWorker', {
      value: { register: registerFn },
      configurable: true,
      writable: true,
    });

    await registerServiceWorker();

    expect(warnSpy).toHaveBeenCalledWith('[SW] Registration failed:', error);
  });
});
