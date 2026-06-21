// @vitest-environment jsdom
/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

// Mock useConnectionStatus hook
const mockUseConnectionStatus = vi.fn();
vi.mock('../hooks/useConnectionStatus', () => ({
  useConnectionStatus: () => mockUseConnectionStatus(),
}));

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  Wifi: ({ size, className }: any) => (
    <svg data-testid="wifi-icon" className={className} />
  ),
  WifiOff: ({ size, className }: any) => (
    <svg data-testid="wifi-off-icon" className={className} />
  ),
  Signal: ({ size, className }: any) => (
    <svg data-testid="signal-icon" className={className} />
  ),
}));

import ConnectionIndicator from './ConnectionIndicator';

describe('ConnectionIndicator', () => {
  it('renders a minimal indicator when status is online', () => {
    mockUseConnectionStatus.mockReturnValue({
      status: 'online',
      lastChecked: new Date().toISOString(),
    });

    render(<ConnectionIndicator />);

    const indicator = screen.getByRole('status');
    expect(indicator).toBeInTheDocument();
    expect(indicator).toHaveAttribute('aria-label', 'common.connectionOnline');
    // Online state should not show the text label (minimal mode)
    expect(screen.queryByText('common.connectionDegraded')).not.toBeInTheDocument();
    expect(screen.queryByText('common.connectionOffline')).not.toBeInTheDocument();
  });

  it('renders an expanded amber indicator when status is degraded', () => {
    mockUseConnectionStatus.mockReturnValue({
      status: 'degraded',
      lastChecked: new Date().toISOString(),
    });

    render(<ConnectionIndicator />);

    const indicator = screen.getByRole('status');
    expect(indicator).toBeInTheDocument();
    expect(indicator).toHaveAttribute('aria-label', 'common.connectionDegraded');
    expect(screen.getByText('common.connectionDegraded')).toBeInTheDocument();
    expect(screen.getByTestId('signal-icon')).toBeInTheDocument();
  });

  it('renders an expanded red indicator when status is offline', () => {
    mockUseConnectionStatus.mockReturnValue({
      status: 'offline',
      lastChecked: new Date().toISOString(),
    });

    render(<ConnectionIndicator />);

    const indicator = screen.getByRole('status');
    expect(indicator).toBeInTheDocument();
    expect(indicator).toHaveAttribute('aria-label', 'common.connectionOffline');
    expect(screen.getByText('common.connectionOffline')).toBeInTheDocument();
    expect(screen.getByTestId('wifi-off-icon')).toBeInTheDocument();
  });

  it('visually distinguishes offline from degraded states', () => {
    // Render degraded
    mockUseConnectionStatus.mockReturnValue({
      status: 'degraded',
      lastChecked: new Date().toISOString(),
    });
    const { container: degradedContainer, unmount } = render(<ConnectionIndicator />);
    const degradedInner = degradedContainer.querySelector('[role="status"] > div');
    const degradedClasses = degradedInner?.className ?? '';

    unmount();

    // Render offline
    mockUseConnectionStatus.mockReturnValue({
      status: 'offline',
      lastChecked: new Date().toISOString(),
    });
    const { container: offlineContainer } = render(<ConnectionIndicator />);
    const offlineInner = offlineContainer.querySelector('[role="status"] > div');
    const offlineClasses = offlineInner?.className ?? '';

    // Classes should be different (amber vs red)
    expect(degradedClasses).not.toEqual(offlineClasses);
    expect(degradedClasses).toContain('amber');
    expect(offlineClasses).toContain('red');
  });

  it('has aria-live="polite" for accessibility', () => {
    mockUseConnectionStatus.mockReturnValue({
      status: 'offline',
      lastChecked: new Date().toISOString(),
    });

    render(<ConnectionIndicator />);

    const indicator = screen.getByRole('status');
    expect(indicator).toHaveAttribute('aria-live', 'polite');
    expect(indicator).toHaveAttribute('aria-atomic', 'true');
  });

  it('does not render as a modal or dialog', () => {
    mockUseConnectionStatus.mockReturnValue({
      status: 'offline',
      lastChecked: new Date().toISOString(),
    });

    render(<ConnectionIndicator />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
});
