// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';

// Mock lucide-react icons used by ModuleErrorBoundary
vi.mock('lucide-react', () => ({
  AlertTriangle: ({ className }: any) => <svg data-testid="alert-triangle-icon" className={className} />,
  RefreshCw: ({ className }: any) => <svg data-testid="refresh-icon" className={className} />,
}));

// Mock logger
vi.mock('@/utils/logger', () => ({
  default: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

// Mock errorReporter
vi.mock('@/utils/errorReporter', () => ({
  errorReporter: {
    report: vi.fn(),
  },
}));

// The global test setup mocks react-i18next with only `useTranslation`.
// ModuleErrorBoundary relies on the `withTranslation` HOC, so override the
// mock here to provide it (mirrors ErrorBoundary.test.tsx).
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

import { ModuleErrorBoundary } from './ModuleErrorBoundary';

// A route-like component that throws during render to simulate a module crash.
const CrashingRoute = ({ shouldThrow = true }: { shouldThrow?: boolean }) => {
  if (shouldThrow) {
    throw new Error('Route render exploded');
  }
  return <div>Crashing route recovered</div>;
};

// A healthy sibling route that should remain operational regardless of the
// failure in another route.
const HealthyRoute = () => (
  <div>
    <h1>Healthy route content</h1>
    <button type="button">Sibling action</button>
  </div>
);

/**
 * Integration test for boundary containment (Requirements 12.1, 12.2, 12.3).
 *
 * Renders an application-shell-like tree where one route throws inside its
 * ModuleErrorBoundary and a sibling route is rendered outside that boundary.
 * Asserts the error is contained to the failing route while the shell and the
 * sibling route stay mounted and operational.
 */
describe('ModuleErrorBoundary — boundary containment integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Suppress React's expected console.error noise from the thrown render error.
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
  });

  const renderShell = () => {
    // Application shell with two sibling "routes". The first route throws and is
    // wrapped in its own ModuleErrorBoundary; the second (sibling) route lives
    // outside that boundary, modelling App.tsx's per-route boundaries.
    return render(
      <div data-testid="app-shell">
        <header>Application Shell Header</header>
        <main>
          <ModuleErrorBoundary moduleName="Dashboard">
            <CrashingRoute />
          </ModuleErrorBoundary>
          <HealthyRoute />
        </main>
      </div>
    );
  };

  it('contains a render error to the failing route and shows the fallback', () => {
    renderShell();

    // The failing route renders the boundary fallback rather than crashing the tree.
    const fallback = screen.getByRole('alert');
    expect(fallback).not.toBeNull();
    expect(screen.getByText('moduleError.title')).toBeTruthy();
    expect(screen.getByText('moduleError.description')).toBeTruthy();
    expect(screen.getByText('moduleError.retry')).toBeTruthy();
  });

  it('keeps the application shell mounted when a route errors', () => {
    renderShell();

    expect(screen.getByTestId('app-shell')).toBeTruthy();
    expect(screen.getByText('Application Shell Header')).toBeTruthy();
  });

  it('keeps a sibling route operational when another route errors', () => {
    renderShell();

    // Sibling route rendered outside the failing boundary remains fully mounted.
    expect(screen.getByText('Healthy route content')).toBeTruthy();
    const siblingButton = screen.getByRole('button', { name: /Sibling action/i });
    expect(siblingButton).toBeTruthy();
    // And it stays interactive.
    fireEvent.click(siblingButton);
    expect(screen.getByText('Healthy route content')).toBeTruthy();
  });

  it('does not leak the error into a sibling boundary on a separate route', () => {
    render(
      <div data-testid="app-shell">
        <ModuleErrorBoundary moduleName="Dashboard">
          <CrashingRoute />
        </ModuleErrorBoundary>
        <ModuleErrorBoundary moduleName="Settings">
          <div>Settings route content</div>
        </ModuleErrorBoundary>
      </div>
    );

    // Failing route shows fallback...
    expect(screen.getByText('moduleError.title')).toBeTruthy();
    // ...while the sibling boundary renders its children normally (no fallback).
    expect(screen.getByText('Settings route content')).toBeTruthy();
    // Exactly one fallback alert is present (only the crashing route).
    expect(screen.getAllByRole('alert')).toHaveLength(1);
  });
});
