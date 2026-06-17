import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { UpdateNotification } from './UpdateNotification';

describe('UpdateNotification', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not render initially', () => {
    const { container } = render(<UpdateNotification />);
    expect(container.innerHTML).toBe('');
  });

  it('renders toast when sw:updated event is dispatched', () => {
    render(<UpdateNotification />);

    fireEvent(window, new CustomEvent('sw:updated'));

    expect(screen.getByText('A new version is available.')).toBeInTheDocument();
    expect(screen.getByText('Refresh to update.')).toBeInTheDocument();
  });

  it('has correct ARIA attributes for accessibility', () => {
    render(<UpdateNotification />);

    fireEvent(window, new CustomEvent('sw:updated'));

    const container = screen.getByRole('status');
    expect(container).toHaveAttribute('aria-live', 'polite');
    expect(container).toHaveAttribute('aria-atomic', 'true');
  });

  it('calls window.location.reload when Refresh button is clicked', () => {
    const reloadMock = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { ...window.location, reload: reloadMock },
      writable: true,
      configurable: true,
    });

    render(<UpdateNotification />);
    fireEvent(window, new CustomEvent('sw:updated'));

    const refreshButton = screen.getByText('Refresh to update.');
    fireEvent.click(refreshButton);

    expect(reloadMock).toHaveBeenCalled();
  });

  it('hides the notification when dismiss button is clicked', () => {
    render(<UpdateNotification />);
    fireEvent(window, new CustomEvent('sw:updated'));

    expect(screen.getByText('A new version is available.')).toBeInTheDocument();

    const dismissButton = screen.getByLabelText('Dismiss update notification');
    fireEvent.click(dismissButton);

    expect(screen.queryByText('A new version is available.')).not.toBeInTheDocument();
  });

  it('cleans up event listener on unmount', () => {
    const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');

    const { unmount } = render(<UpdateNotification />);
    unmount();

    expect(removeEventListenerSpy).toHaveBeenCalledWith(
      'sw:updated',
      expect.any(Function)
    );
  });
});
