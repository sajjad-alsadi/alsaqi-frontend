import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(() => 'en'),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
  length: 0,
  key: vi.fn(),
};
Object.defineProperty(global, 'localStorage', { value: localStorageMock });

// Mock react-i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: {
      language: 'en',
      changeLanguage: vi.fn(),
      // `exists` is consulted by formatService (translateModule/translateAction).
      // Without it, any component tree that renders those helpers throws
      // "i18n.exists is not a function" and fails to mount.
      exists: () => false,
      getResourceBundle: () => ({}),
      hasResourceBundle: () => false,
    },
  }),
  initReactI18next: {
    type: '3rdParty',
    init: vi.fn(),
  },
  Trans: ({ children }: any) => children,
}));

// Mock i18next
vi.mock('i18next', () => ({
  default: {
    use: vi.fn().mockReturnThis(),
    init: vi.fn().mockReturnThis(),
    on: vi.fn(),
    language: 'en',
    t: (key: string) => key,
  },
}));

// Mock i18next-browser-languagedetector
vi.mock('i18next-browser-languagedetector', () => ({
  default: {
    type: 'languageDetector',
    init: vi.fn(),
    detect: vi.fn(() => 'en'),
    cacheUserLanguage: vi.fn(),
  },
}));

// Mock motion/react to avoid animation issues in tests
vi.mock('motion/react', () => {
  const React = require('react');
  return {
    motion: {
      div: React.forwardRef(({ children, initial, animate, exit, transition, ...props }: any, ref: any) => {
        return React.createElement('div', { ...props, ref }, children);
      }),
    },
    AnimatePresence: ({ children }: any) => children,
  };
});

// Mock WebSocket for NotificationContext tests
class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  url: string;
  readyState: number;
  onopen: ((event: any) => void) | null = null;
  onmessage: ((event: any) => void) | null = null;
  onclose: ((event: any) => void) | null = null;
  onerror: ((event: any) => void) | null = null;
  send = vi.fn();
  close = vi.fn();

  constructor(url: string) {
    this.url = url;
    this.readyState = MockWebSocket.CONNECTING;
  }
}
Object.defineProperty(global, 'WebSocket', { value: MockWebSocket });

// Mock window.matchMedia for theme/dark mode tests (only in jsdom environment)
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

// Mock IntersectionObserver for lazy loading and scroll-based components
class MockIntersectionObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();

  constructor(_callback: IntersectionObserverCallback, _options?: IntersectionObserverInit) {}
}
Object.defineProperty(global, 'IntersectionObserver', { value: MockIntersectionObserver });

// Mock ResizeObserver for responsive components
class MockResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();

  constructor(_callback: ResizeObserverCallback) {}
}
// configurable/writable so individual tests can swap in an instrumented
// ResizeObserver via `vi.stubGlobal('ResizeObserver', ...)` and have it cleanly
// restored by `vi.unstubAllGlobals()` (same capability the global WebSocket mock
// has by virtue of Node providing a configurable WebSocket). The default mock is
// unchanged for every other test.
Object.defineProperty(global, 'ResizeObserver', {
  value: MockResizeObserver,
  configurable: true,
  writable: true,
});

// Mock AudioContext for notification sounds
const mockAudioContext = {
  createOscillator: vi.fn(() => ({
    connect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    frequency: { setValueAtTime: vi.fn() },
    type: 'sine',
  })),
  createGain: vi.fn(() => ({
    connect: vi.fn(),
    gain: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() },
  })),
  destination: {},
  currentTime: 0,
  close: vi.fn(),
};
Object.defineProperty(global, 'AudioContext', {
  value: vi.fn(() => mockAudioContext),
});
Object.defineProperty(global, 'webkitAudioContext', {
  value: vi.fn(() => mockAudioContext),
});

// Mock window.scrollTo for scroll-related tests (only in jsdom environment)
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'scrollTo', {
    writable: true,
    value: vi.fn(),
  });
}

// jsdom does not implement HTMLCanvasElement.getContext; libraries that probe a
// 2D context (e.g. react-pdf / pdfjs in PdfViewer) otherwise log noisy
// "Not implemented" errors and can destabilize the worker. Provide a minimal
// stub returning null so callers take their no-canvas fallback path cleanly.
if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as unknown as typeof HTMLCanvasElement.prototype.getContext;
}

// jsdom does not implement Element.prototype.scrollIntoView; components that
// auto-scroll (e.g. Chatbot message list) call it on a ref and would otherwise
// throw "scrollIntoView is not a function" during render/update.
if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = vi.fn();
}

// Mock URL.createObjectURL and URL.revokeObjectURL for file download/preview tests
Object.defineProperty(URL, 'createObjectURL', {
  writable: true,
  value: vi.fn(() => 'blob:http://localhost:3000/mock-object-url'),
});
Object.defineProperty(URL, 'revokeObjectURL', {
  writable: true,
  value: vi.fn(),
});
