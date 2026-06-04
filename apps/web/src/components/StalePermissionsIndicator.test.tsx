// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

// Mock usePermissions hook
const mockUsePermissions = vi.fn();
vi.mock('../hooks/usePermissions', () => ({
  usePermissions: () => mockUsePermissions(),
}));

// Mock lucide-react
vi.mock('lucide-react', () => ({
  AlertTriangle: ({ size, className }: any) => (
    <svg data-testid="alert-triangle-icon" className={className} />
  ),
}));

import StalePermissionsIndicator from './StalePermissionsIndicator';

describe('StalePermissionsIndicator', () => {
  it('should render nothing when isFallback is false', () => {
    mockUsePermissions.mockReturnValue({ isFallback: false });

    const { container } = render(<StalePermissionsIndicator />);

    expect(container.firstChild).toBeNull();
  });

  it('should render a warning indicator when isFallback is true', () => {
    mockUsePermissions.mockReturnValue({ isFallback: true });

    render(<StalePermissionsIndicator />);

    const indicator = screen.getByRole('status');
    expect(indicator).toBeInTheDocument();
    expect(indicator).toHaveTextContent('common.stalePermissions');
  });

  it('should include an alert icon when visible', () => {
    mockUsePermissions.mockReturnValue({ isFallback: true });

    render(<StalePermissionsIndicator />);

    expect(screen.getByTestId('alert-triangle-icon')).toBeInTheDocument();
  });

  it('should have aria-live="polite" for accessibility', () => {
    mockUsePermissions.mockReturnValue({ isFallback: true });

    render(<StalePermissionsIndicator />);

    const indicator = screen.getByRole('status');
    expect(indicator).toHaveAttribute('aria-live', 'polite');
  });

  it('should be non-modal (no blocking overlay or dialog)', () => {
    mockUsePermissions.mockReturnValue({ isFallback: true });

    render(<StalePermissionsIndicator />);

    // Should not render as a dialog or modal
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
});
