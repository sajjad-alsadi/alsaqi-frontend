/**
 * Unit tests for the version-mismatch reload button construction.
 *
 * Validates: Requirements 2.1, 2.2
 *
 * Requirement 2.1 — the reload button must be constructed with DOM APIs
 *   (`document.createElement`) and have its behavior attached via
 *   `addEventListener`, and must NOT use `innerHTML` with an inline `onclick`.
 * Requirement 2.2 — activating the reload button triggers a page reload.
 *
 * The notification is exercised through the exported
 * `showVersionMismatchNotification` routine (its only side effect is building
 * the overlay + reload button in the DOM), avoiding any HTTP round-trip.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { showVersionMismatchNotification } from '../client';

describe('version-mismatch reload button', () => {
  let originalLocation: Location;

  beforeEach(() => {
    // Remove any pre-existing overlay so the test starts clean.
    document.getElementById('api-version-mismatch-overlay')?.remove();

    // Replace window.location with a stub exposing a mockable reload().
    originalLocation = window.location;
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: { ...originalLocation, reload: vi.fn() },
    });
  });

  afterEach(() => {
    document.getElementById('api-version-mismatch-overlay')?.remove();
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: originalLocation,
    });
    vi.restoreAllMocks();
  });

  function getReloadButton(): HTMLButtonElement {
    const overlay = document.getElementById('api-version-mismatch-overlay');
    expect(overlay).not.toBeNull();
    // The overlay now offers two buttons — "later" (dismiss) and "reload". Select
    // the reload button by its label rather than position so the test is robust
    // to button ordering (Req 25.1 added the non-destructive "later" option).
    const buttons = Array.from(overlay!.querySelectorAll('button'));
    const button = buttons.find((b) => b.textContent === 'تحديث الصفحة');
    expect(button).not.toBeUndefined();
    return button as HTMLButtonElement;
  }

  // The notification is shown at most once per module load (guarded by an
  // internal `versionMismatchShown` flag), so both assertions share the single
  // overlay built by the first call.
  it('builds the reload button via createElement with no inline onclick, and clicking it reloads', () => {
    showVersionMismatchNotification();

    const button = getReloadButton();

    // Constructed as a real <button> element (createElement), not injected markup.
    expect(button.tagName).toBe('BUTTON');
    expect(button.textContent).toBe('تحديث الصفحة');

    // No inline onclick: neither the HTML attribute nor the onclick property is set.
    expect(button.getAttribute('onclick')).toBeNull();
    expect(button.onclick).toBeNull();

    // The overlay markup must not contain a literal inline onclick handler.
    const overlay = document.getElementById('api-version-mismatch-overlay');
    expect(overlay!.outerHTML).not.toContain('onclick');

    // Behavior is attached via addEventListener: activating the button reloads.
    expect(window.location.reload).not.toHaveBeenCalled();
    button.click();
    expect(window.location.reload).toHaveBeenCalledTimes(1);
  });
});
