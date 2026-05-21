// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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

// Component that throws an error for testing
const ThrowingComponent = ({ shouldThrow = true }: { shouldThrow?: boolean }) => {
  if (shouldThrow) {
    throw new Error('Test error message');
  }
  return <div>Normal content</div>;
};

// Component that throws a database error
const DatabaseErrorComponent = () => {
  throw new Error(JSON.stringify({
    error: 'Connection refused',
    operationType: 'SELECT',
  }));
};

describe('ErrorBoundary Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Suppress React error boundary console errors during tests
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  describe('Normal Rendering', () => {
    it('should render children when no error occurs', () => {
      render(
        <ErrorBoundary>
          <div>Child content</div>
        </ErrorBoundary>
      );

      expect(screen.getByText('Child content')).toBeInTheDocument();
    });

    it('should not show error UI when children render successfully', () => {
      render(
        <ErrorBoundary>
          <div>Working component</div>
        </ErrorBoundary>
      );

      expect(screen.queryByText('sorrySomethingWentWrong')).not.toBeInTheDocument();
    });
  });

  describe('Error Fallback UI', () => {
    it('should render fallback UI when a child component throws an error', () => {
      render(
        <ErrorBoundary>
          <ThrowingComponent />
        </ErrorBoundary>
      );

      expect(screen.getByText('sorrySomethingWentWrong')).toBeInTheDocument();
      expect(screen.getByText('Test error message')).toBeInTheDocument();
    });

    it('should render custom fallback when provided', () => {
      const customFallback = <div>Custom error page</div>;

      render(
        <ErrorBoundary fallback={customFallback}>
          <ThrowingComponent />
        </ErrorBoundary>
      );

      expect(screen.getByText('Custom error page')).toBeInTheDocument();
      expect(screen.queryByText('sorrySomethingWentWrong')).not.toBeInTheDocument();
    });

    it('should display the error message in the fallback UI', () => {
      render(
        <ErrorBoundary>
          <ThrowingComponent />
        </ErrorBoundary>
      );

      expect(screen.getByText('Test error message')).toBeInTheDocument();
    });

    it('should display database error details for JSON error messages', () => {
      render(
        <ErrorBoundary>
          <DatabaseErrorComponent />
        </ErrorBoundary>
      );

      expect(screen.getByText('databaseError')).toBeInTheDocument();
    });

    it('should render a reload button in the fallback UI', () => {
      render(
        <ErrorBoundary>
          <ThrowingComponent />
        </ErrorBoundary>
      );

      const reloadButton = screen.getByText('reloadPage');
      expect(reloadButton).toBeInTheDocument();
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
  });

  describe('Error Logging', () => {
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
  });

  describe('Recovery', () => {
    it('should prevent app crash and show fallback instead', () => {
      // The key test: ErrorBoundary catches the error and renders fallback
      // instead of crashing the entire React tree
      const { container } = render(
        <div>
          <ErrorBoundary>
            <ThrowingComponent />
          </ErrorBoundary>
          <div>Sibling content</div>
        </div>
      );

      // Sibling content should still be visible
      expect(screen.getByText('Sibling content')).toBeInTheDocument();
      // Error fallback should be shown
      expect(screen.getByText('sorrySomethingWentWrong')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have an error icon for visual indication', () => {
      render(
        <ErrorBoundary>
          <ThrowingComponent />
        </ErrorBoundary>
      );

      expect(screen.getByTestId('alert-circle-icon')).toBeInTheDocument();
    });

    it('should have a refresh icon on the reload button', () => {
      render(
        <ErrorBoundary>
          <ThrowingComponent />
        </ErrorBoundary>
      );

      expect(screen.getByTestId('refresh-icon')).toBeInTheDocument();
    });

    it('should have a clickable reload button with text', () => {
      render(
        <ErrorBoundary>
          <ThrowingComponent />
        </ErrorBoundary>
      );

      const button = screen.getByRole('button', { name: /reloadPage/i });
      expect(button).toBeInTheDocument();
    });
  });
});
