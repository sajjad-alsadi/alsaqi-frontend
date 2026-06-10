// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';

// Mock lucide-react
vi.mock('lucide-react', () => ({
  AlertCircle: ({ className }: any) => <svg data-testid="alert-circle-icon" className={className} />,
  RefreshCw: ({ className }: any) => <svg data-testid="refresh-icon" className={className} />,
}));

// Mock logger
vi.mock('../../utils/logger', () => ({
  default: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

// Mock errorReporter
vi.mock('../../utils/errorReporter', () => ({
  errorReporter: {
    report: vi.fn(),
  },
}));

// Override the react-i18next mock to include withTranslation for ErrorBoundary
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
  withTranslation: () => (Component: any) => {
    const WrappedComponent = (props: any) => {
      return <Component {...props} t={(key: string) => key} i18n={{ language: 'en' }} />;
    };
    WrappedComponent.displayName = `withTranslation(${Component.displayName || Component.name || 'Component'})`;
    return WrappedComponent;
  },
  initReactI18next: {
    type: '3rdParty',
    init: vi.fn(),
  },
  Trans: ({ children }: any) => children,
}));

import { ErrorBoundary } from '../ErrorBoundary';
import logger from '../../utils/logger';
import { errorReporter } from '../../utils/errorReporter';

// Component that throws an error for testing
const ThrowingComponent = ({ shouldThrow = true }: { shouldThrow?: boolean }) => {
  if (shouldThrow) {
    throw new Error('Test error message');
  }
  return <div>Normal content</div>;
};

describe('ErrorBoundary Component (Global - Ultimate Fallback)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Suppress React error boundary console errors during tests
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
  });

  describe('Normal Rendering', () => {
    it('should render children when no error occurs', () => {
      const { container } = render(
        <ErrorBoundary>
          <div>Child content</div>
        </ErrorBoundary>
      );

      expect(screen.getByText('Child content')).toBeTruthy();
      expect(container.querySelector('[role="alert"]')).toBeNull();
    });

    it('should not show error UI when children render successfully', () => {
      render(
        <ErrorBoundary>
          <div>Working component</div>
        </ErrorBoundary>
      );

      expect(screen.queryByText('globalError.title')).toBeNull();
    });
  });

  describe('Full-Page Fallback UI', () => {
    it('should render full-page fallback UI when a child component throws', () => {
      render(
        <ErrorBoundary>
          <ThrowingComponent />
        </ErrorBoundary>
      );

      expect(screen.getByText('globalError.title')).toBeTruthy();
      expect(screen.getByText('globalError.description')).toBeTruthy();
    });

    it('should render custom fallback when provided', () => {
      const customFallback = <div>Custom error page</div>;

      render(
        <ErrorBoundary fallback={customFallback}>
          <ThrowingComponent />
        </ErrorBoundary>
      );

      expect(screen.getByText('Custom error page')).toBeTruthy();
      expect(screen.queryByText('globalError.title')).toBeNull();
    });

    it('should render a reload button in the fallback UI', () => {
      render(
        <ErrorBoundary>
          <ThrowingComponent />
        </ErrorBoundary>
      );

      expect(screen.getByText('reloadPage')).toBeTruthy();
    });

    it('should call window.location.reload when reload button is clicked', () => {
      const reloadMock = vi.fn();
      Object.defineProperty(window, 'location', {
        value: { reload: reloadMock },
        writable: true,
      });

      render(
        <ErrorBoundary>
          <ThrowingComponent />
        </ErrorBoundary>
      );

      const reloadButton = screen.getByText('reloadPage');
      fireEvent.click(reloadButton);

      expect(reloadMock).toHaveBeenCalledTimes(1);
    });

    it('should have full-screen styling (min-h-screen)', () => {
      const { container } = render(
        <ErrorBoundary>
          <ThrowingComponent />
        </ErrorBoundary>
      );

      const alertContainer = container.querySelector('[role="alert"]');
      expect(alertContainer).not.toBeNull();
      expect(alertContainer!.className).toContain('min-h-screen');
    });
  });

  describe('Error Reporting', () => {
    it('should log the error via logger.error', () => {
      render(
        <ErrorBoundary>
          <ThrowingComponent />
        </ErrorBoundary>
      );

      expect(logger.error).toHaveBeenCalledWith(
        'Uncaught error:',
        expect.objectContaining({
          error: expect.any(Error),
          errorInfo: expect.objectContaining({
            componentStack: expect.any(String),
          }),
        })
      );
    });

    it('should report error via errorReporter with critical severity', () => {
      render(
        <ErrorBoundary>
          <ThrowingComponent />
        </ErrorBoundary>
      );

      expect(errorReporter.report).toHaveBeenCalledWith(
        expect.objectContaining({
          module: 'global',
          message: 'Test error message',
          severity: 'critical',
          type: 'boundary',
          componentStack: expect.any(String),
        })
      );
    });
  });

  describe('Recovery', () => {
    it('should prevent app crash and show full-page fallback', () => {
      render(
        <div>
          <ErrorBoundary>
            <ThrowingComponent />
          </ErrorBoundary>
          <div>Sibling content</div>
        </div>
      );

      // Sibling content should still be visible
      expect(screen.getByText('Sibling content')).toBeTruthy();
      // Global error fallback should be shown
      expect(screen.getByText('globalError.title')).toBeTruthy();
    });
  });

  describe('Accessibility', () => {
    it('should have role="alert" and aria-live="assertive"', () => {
      const { container } = render(
        <ErrorBoundary>
          <ThrowingComponent />
        </ErrorBoundary>
      );

      const alertContainer = container.querySelector('[role="alert"]');
      expect(alertContainer).not.toBeNull();
      expect(alertContainer!.getAttribute('aria-live')).toBe('assertive');
    });

    it('should have an error icon for visual indication', () => {
      const { container } = render(
        <ErrorBoundary>
          <ThrowingComponent />
        </ErrorBoundary>
      );

      expect(container.querySelector('[data-testid="alert-circle-icon"]')).not.toBeNull();
    });

    it('should have a clickable reload button', () => {
      render(
        <ErrorBoundary>
          <ThrowingComponent />
        </ErrorBoundary>
      );

      const button = screen.getByRole('button', { name: /reloadPage/i });
      expect(button).toBeTruthy();
    });
  });
});
