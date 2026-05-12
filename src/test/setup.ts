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
    i18n: { language: 'en', changeLanguage: vi.fn() },
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
