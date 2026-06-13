// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

// Mock usePermissions hook so we can drive the three states under test.
const mockUsePermissions = vi.fn();
vi.mock('../../hooks/usePermissions', () => ({
  usePermissions: () => mockUsePermissions(),
}));

import { RequirePermission } from '../RequirePermission';

/**
 * Renders RequirePermission inside a router so the redirect target is
 * observable. The guarded route is "/", the redirect destination "/dashboard"
 * renders an identifiable marker.
 */
const renderGuarded = () =>
  render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route
          path="/"
          element={
            <RequirePermission module="findings">
              <div data-testid="protected-content">Protected Content</div>
            </RequirePermission>
          }
        />
        <Route path="/dashboard" element={<div data-testid="dashboard">Dashboard</div>} />
      </Routes>
    </MemoryRouter>
  );

describe('RequirePermission', () => {
  beforeEach(() => {
    mockUsePermissions.mockReset();
  });

  // Req 13.1 / 13.3: while loading, render a loading state and do NOT redirect
  // or evaluate access.
  it('renders the loading fallback and does not redirect while permissions are loading', () => {
    const canView = vi.fn().mockReturnValue(false);
    mockUsePermissions.mockReturnValue({ isLoading: true, canView });

    const { container } = renderGuarded();

    // A loading spinner is rendered (the fallback uses an animate-spin element).
    expect(container.querySelector('.animate-spin')).not.toBeNull();

    // Access is not evaluated, so canView is never called and no redirect occurs.
    expect(canView).not.toHaveBeenCalled();
    expect(screen.queryByTestId('dashboard')).not.toBeInTheDocument();
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
  });

  // Req 13.2: after loading completes and the user can view the module, render
  // the children.
  it('renders children when loaded and the user can view the module', () => {
    mockUsePermissions.mockReturnValue({
      isLoading: false,
      canView: vi.fn().mockReturnValue(true),
    });

    renderGuarded();

    expect(screen.getByTestId('protected-content')).toBeInTheDocument();
    expect(screen.queryByTestId('dashboard')).not.toBeInTheDocument();
  });

  // Req 13.2: after loading completes and the user cannot view the module,
  // redirect to /dashboard.
  it('redirects to /dashboard when loaded and the user cannot view the module', () => {
    mockUsePermissions.mockReturnValue({
      isLoading: false,
      canView: vi.fn().mockReturnValue(false),
    });

    renderGuarded();

    expect(screen.getByTestId('dashboard')).toBeInTheDocument();
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
  });
});
