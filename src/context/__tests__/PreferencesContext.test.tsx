// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, act, screen } from '@testing-library/react';
import { PreferencesProvider, usePreferences } from '../PreferencesContext';
import { Language } from '../../constants';

// Mock the API module
vi.mock('../../services/api', () => ({
  default: {
    put: vi.fn().mockResolvedValue({ data: {} }),
  },
}));

// Mock logger
vi.mock('../../utils/logger', () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

/**
 * Helper component that exposes PreferencesContext values for testing.
 */
function TestConsumer() {
  const { language, theme, dashboardLayout, setLanguage, setTheme, setDashboardLayout } = usePreferences();
  return (
    <div>
      <span data-testid="language">{language}</span>
      <span data-testid="theme">{theme}</span>
      <span data-testid="layout">{dashboardLayout}</span>
      <button data-testid="set-lang-ar" onClick={() => setLanguage(Language.AR)}>AR</button>
      <button data-testid="set-lang-en" onClick={() => setLanguage(Language.EN)}>EN</button>
      <button data-testid="set-theme-dark" onClick={() => setTheme('dark')}>Dark</button>
      <button data-testid="set-theme-light" onClick={() => setTheme('light')}>Light</button>
      <button data-testid="set-layout-compact" onClick={() => setDashboardLayout('compact')}>Compact</button>
    </div>
  );
}

describe('PreferencesContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset localStorage mock to return defaults
    (localStorage.getItem as ReturnType<typeof vi.fn>).mockImplementation((key: string) => {
      if (key === 'audit_lang') return null;
      if (key === 'audit_theme') return null;
      if (key === 'audit_layout') return null;
      return null;
    });
    // Reset document state
    document.documentElement.dir = '';
    document.documentElement.lang = '';
    document.documentElement.classList.remove('dark');
  });

  afterEach(() => {
    document.documentElement.dir = '';
    document.documentElement.lang = '';
    document.documentElement.classList.remove('dark');
  });

  describe('تغيير اللغة: تحديث اتجاه الصفحة (RTL/LTR)', () => {
    it('should set RTL direction when language is Arabic', async () => {
      /**
       * Validates: Requirements 16.5
       */
      const { unmount } = render(
        <PreferencesProvider>
          <TestConsumer />
        </PreferencesProvider>
      );

      await act(async () => {
        screen.getByTestId('set-lang-ar').click();
      });

      expect(document.documentElement.dir).toBe('rtl');
      expect(document.documentElement.lang).toBe('ar');
      expect(screen.getByTestId('language').textContent).toBe('ar');

      unmount();
    });

    it('should set LTR direction when language is English', async () => {
      /**
       * Validates: Requirements 16.5
       */
      // Start with Arabic
      (localStorage.getItem as ReturnType<typeof vi.fn>).mockImplementation((key: string) => {
        if (key === 'audit_lang') return 'ar';
        return null;
      });

      const { unmount } = render(
        <PreferencesProvider>
          <TestConsumer />
        </PreferencesProvider>
      );

      // Initial state should be Arabic/RTL
      expect(document.documentElement.dir).toBe('rtl');

      await act(async () => {
        screen.getByTestId('set-lang-en').click();
      });

      expect(document.documentElement.dir).toBe('ltr');
      expect(document.documentElement.lang).toBe('en');
      expect(screen.getByTestId('language').textContent).toBe('en');

      unmount();
    });

    it('should save language preference to localStorage', async () => {
      /**
       * Validates: Requirements 16.5
       */
      const { unmount } = render(
        <PreferencesProvider>
          <TestConsumer />
        </PreferencesProvider>
      );

      await act(async () => {
        screen.getByTestId('set-lang-ar').click();
      });

      expect(localStorage.setItem).toHaveBeenCalledWith('audit_lang', 'ar');
      expect(localStorage.setItem).toHaveBeenCalledWith('i18nextLng', 'ar');

      unmount();
    });

    it('should persist language to server via API', async () => {
      /**
       * Validates: Requirements 16.5
       */
      const api = (await import('../../services/api')).default;

      const { unmount } = render(
        <PreferencesProvider>
          <TestConsumer />
        </PreferencesProvider>
      );

      await act(async () => {
        screen.getByTestId('set-lang-ar').click();
      });

      expect(api.put).toHaveBeenCalledWith('/preferences', expect.objectContaining({
        language: 'ar',
      }));

      unmount();
    });
  });

  describe('تغيير السمة: تطبيق السمة وحفظها في localStorage', () => {
    it('should add dark class to document when theme is dark', async () => {
      /**
       * Validates: Requirements 16.6
       */
      const { unmount } = render(
        <PreferencesProvider>
          <TestConsumer />
        </PreferencesProvider>
      );

      await act(async () => {
        screen.getByTestId('set-theme-dark').click();
      });

      expect(document.documentElement.classList.contains('dark')).toBe(true);
      expect(screen.getByTestId('theme').textContent).toBe('dark');

      unmount();
    });

    it('should remove dark class when theme is light', async () => {
      /**
       * Validates: Requirements 16.6
       */
      // Start with dark theme
      (localStorage.getItem as ReturnType<typeof vi.fn>).mockImplementation((key: string) => {
        if (key === 'audit_theme') return 'dark';
        return null;
      });

      const { unmount } = render(
        <PreferencesProvider>
          <TestConsumer />
        </PreferencesProvider>
      );

      // Initial state should have dark class
      expect(document.documentElement.classList.contains('dark')).toBe(true);

      await act(async () => {
        screen.getByTestId('set-theme-light').click();
      });

      expect(document.documentElement.classList.contains('dark')).toBe(false);
      expect(screen.getByTestId('theme').textContent).toBe('light');

      unmount();
    });

    it('should save theme to localStorage', async () => {
      /**
       * Validates: Requirements 16.6
       */
      const { unmount } = render(
        <PreferencesProvider>
          <TestConsumer />
        </PreferencesProvider>
      );

      await act(async () => {
        screen.getByTestId('set-theme-dark').click();
      });

      expect(localStorage.setItem).toHaveBeenCalledWith('audit_theme', 'dark');

      unmount();
    });

    it('should persist theme to server via API', async () => {
      /**
       * Validates: Requirements 16.6
       */
      const api = (await import('../../services/api')).default;

      const { unmount } = render(
        <PreferencesProvider>
          <TestConsumer />
        </PreferencesProvider>
      );

      await act(async () => {
        screen.getByTestId('set-theme-dark').click();
      });

      expect(api.put).toHaveBeenCalledWith('/preferences', expect.objectContaining({
        theme: 'dark',
      }));

      unmount();
    });
  });

  describe('حفظ التفضيلات واستعادتها', () => {
    it('should restore language from localStorage on mount', () => {
      /**
       * Validates: Requirements 16.5
       */
      (localStorage.getItem as ReturnType<typeof vi.fn>).mockImplementation((key: string) => {
        if (key === 'audit_lang') return 'en';
        return null;
      });

      const { unmount } = render(
        <PreferencesProvider>
          <TestConsumer />
        </PreferencesProvider>
      );

      expect(screen.getByTestId('language').textContent).toBe('en');
      expect(document.documentElement.dir).toBe('ltr');

      unmount();
    });

    it('should restore theme from localStorage on mount', () => {
      /**
       * Validates: Requirements 16.6
       */
      (localStorage.getItem as ReturnType<typeof vi.fn>).mockImplementation((key: string) => {
        if (key === 'audit_theme') return 'dark';
        return null;
      });

      const { unmount } = render(
        <PreferencesProvider>
          <TestConsumer />
        </PreferencesProvider>
      );

      expect(screen.getByTestId('theme').textContent).toBe('dark');
      expect(document.documentElement.classList.contains('dark')).toBe(true);

      unmount();
    });

    it('should restore dashboard layout from localStorage on mount', () => {
      /**
       * Validates: Requirements 16.5, 16.6
       */
      (localStorage.getItem as ReturnType<typeof vi.fn>).mockImplementation((key: string) => {
        if (key === 'audit_layout') return 'compact';
        return null;
      });

      const { unmount } = render(
        <PreferencesProvider>
          <TestConsumer />
        </PreferencesProvider>
      );

      expect(screen.getByTestId('layout').textContent).toBe('compact');

      unmount();
    });

    it('should default to Arabic language when no localStorage value', () => {
      /**
       * Validates: Requirements 16.5
       */
      (localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue(null);

      const { unmount } = render(
        <PreferencesProvider>
          <TestConsumer />
        </PreferencesProvider>
      );

      // Default language is AR per the implementation
      expect(screen.getByTestId('language').textContent).toBe('ar');
      expect(document.documentElement.dir).toBe('rtl');

      unmount();
    });

    it('should default to light theme when no localStorage value', () => {
      /**
       * Validates: Requirements 16.6
       */
      (localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue(null);

      const { unmount } = render(
        <PreferencesProvider>
          <TestConsumer />
        </PreferencesProvider>
      );

      expect(screen.getByTestId('theme').textContent).toBe('light');
      expect(document.documentElement.classList.contains('dark')).toBe(false);

      unmount();
    });

    it('should save dashboard layout to localStorage and persist to server', async () => {
      /**
       * Validates: Requirements 16.5, 16.6
       */
      const api = (await import('../../services/api')).default;

      const { unmount } = render(
        <PreferencesProvider>
          <TestConsumer />
        </PreferencesProvider>
      );

      await act(async () => {
        screen.getByTestId('set-layout-compact').click();
      });

      expect(localStorage.setItem).toHaveBeenCalledWith('audit_layout', 'compact');
      expect(api.put).toHaveBeenCalledWith('/preferences', expect.objectContaining({
        dashboard_layout: 'compact',
      }));

      unmount();
    });

    it('should throw error when usePreferences is used outside PreferencesProvider', () => {
      /**
       * Validates: Requirements 16.5, 16.6
       */
      // Suppress console.error for expected error
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      expect(() => {
        render(<TestConsumer />);
      }).toThrow('usePreferences must be used within PreferencesProvider');

      consoleSpy.mockRestore();
    });
  });
});
