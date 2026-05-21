// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useKeyboardShortcuts } from '../useKeyboardShortcuts';

function fireKeyDown(options: KeyboardEventInit) {
  const event = new KeyboardEvent('keydown', { bubbles: true, ...options });
  document.dispatchEvent(event);
  return event;
}

describe('useKeyboardShortcuts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('تسجيل الاختصارات واستدعاء الدوال عند الضغط', () => {
    it('should call handler when a simple key shortcut is pressed', () => {
      const handler = vi.fn();

      renderHook(() => useKeyboardShortcuts([{ key: 'escape', handler }]));

      fireKeyDown({ key: 'Escape' });

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should call handler when ctrl+key combination is pressed', () => {
      const handler = vi.fn();

      renderHook(() => useKeyboardShortcuts([{ key: 'ctrl+n', handler }]));

      fireKeyDown({ key: 'n', ctrlKey: true });

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should call handler when cmd+key (metaKey) combination is pressed', () => {
      const handler = vi.fn();

      renderHook(() => useKeyboardShortcuts([{ key: 'ctrl+k', handler }]));

      fireKeyDown({ key: 'k', metaKey: true });

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should call handler when shift+key combination is pressed', () => {
      const handler = vi.fn();

      renderHook(() => useKeyboardShortcuts([{ key: 'shift+a', handler }]));

      fireKeyDown({ key: 'a', shiftKey: true });

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should call handler when alt+key combination is pressed', () => {
      const handler = vi.fn();

      renderHook(() => useKeyboardShortcuts([{ key: 'alt+s', handler }]));

      fireKeyDown({ key: 's', altKey: true });

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should call handler for ctrl+shift+key combination', () => {
      const handler = vi.fn();

      renderHook(() => useKeyboardShortcuts([{ key: 'ctrl+shift+p', handler }]));

      fireKeyDown({ key: 'p', ctrlKey: true, shiftKey: true });

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should not call handler when wrong key is pressed', () => {
      const handler = vi.fn();

      renderHook(() => useKeyboardShortcuts([{ key: 'ctrl+n', handler }]));

      fireKeyDown({ key: 'k', ctrlKey: true });

      expect(handler).not.toHaveBeenCalled();
    });

    it('should not call handler when ctrl is not pressed for ctrl+key shortcut', () => {
      const handler = vi.fn();

      renderHook(() => useKeyboardShortcuts([{ key: 'ctrl+n', handler }]));

      fireKeyDown({ key: 'n' });

      expect(handler).not.toHaveBeenCalled();
    });

    it('should register multiple shortcuts and call the correct handler', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      const handler3 = vi.fn();

      renderHook(() =>
        useKeyboardShortcuts([
          { key: 'ctrl+n', handler: handler1 },
          { key: 'ctrl+k', handler: handler2 },
          { key: 'escape', handler: handler3 },
        ])
      );

      fireKeyDown({ key: 'k', ctrlKey: true });

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).toHaveBeenCalledTimes(1);
      expect(handler3).not.toHaveBeenCalled();
    });

    it('should not call handler when shortcut is disabled', () => {
      const handler = vi.fn();

      renderHook(() =>
        useKeyboardShortcuts([{ key: 'ctrl+n', handler, enabled: false }])
      );

      fireKeyDown({ key: 'n', ctrlKey: true });

      expect(handler).not.toHaveBeenCalled();
    });

    it('should prevent default browser behavior by default', () => {
      const handler = vi.fn();

      renderHook(() => useKeyboardShortcuts([{ key: 'ctrl+s', handler }]));

      const event = new KeyboardEvent('keydown', {
        key: 's',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });
      const preventDefaultSpy = vi.spyOn(event, 'preventDefault');
      document.dispatchEvent(event);

      expect(preventDefaultSpy).toHaveBeenCalled();
    });

    it('should not prevent default when preventDefault is false', () => {
      const handler = vi.fn();

      renderHook(() =>
        useKeyboardShortcuts([{ key: 'ctrl+s', handler, preventDefault: false }])
      );

      const event = new KeyboardEvent('keydown', {
        key: 's',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });
      const preventDefaultSpy = vi.spyOn(event, 'preventDefault');
      document.dispatchEvent(event);

      expect(preventDefaultSpy).not.toHaveBeenCalled();
    });

    it('should not trigger shortcuts when typing in an input element (except Escape)', () => {
      const handler = vi.fn();

      renderHook(() => useKeyboardShortcuts([{ key: 'ctrl+n', handler }]));

      const input = document.createElement('input');
      document.body.appendChild(input);

      const event = new KeyboardEvent('keydown', {
        key: 'n',
        ctrlKey: true,
        bubbles: true,
      });
      Object.defineProperty(event, 'target', { value: input });
      document.dispatchEvent(event);

      expect(handler).not.toHaveBeenCalled();

      document.body.removeChild(input);
    });

    it('should allow Escape shortcut even when typing in an input element', () => {
      const handler = vi.fn();

      renderHook(() => useKeyboardShortcuts([{ key: 'escape', handler }]));

      const input = document.createElement('input');
      document.body.appendChild(input);

      const event = new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
      });
      Object.defineProperty(event, 'target', { value: input });
      document.dispatchEvent(event);

      expect(handler).toHaveBeenCalledTimes(1);

      document.body.removeChild(input);
    });

    it('should not trigger shortcuts when typing in a textarea', () => {
      const handler = vi.fn();

      renderHook(() => useKeyboardShortcuts([{ key: 'ctrl+k', handler }]));

      const textarea = document.createElement('textarea');
      document.body.appendChild(textarea);

      const event = new KeyboardEvent('keydown', {
        key: 'k',
        ctrlKey: true,
        bubbles: true,
      });
      Object.defineProperty(event, 'target', { value: textarea });
      document.dispatchEvent(event);

      expect(handler).not.toHaveBeenCalled();

      document.body.removeChild(textarea);
    });
  });

  describe('إلغاء التسجيل عند unmount', () => {
    it('should remove event listener on unmount', () => {
      const handler = vi.fn();

      const { unmount } = renderHook(() =>
        useKeyboardShortcuts([{ key: 'ctrl+n', handler }])
      );

      // Verify shortcut works before unmount
      fireKeyDown({ key: 'n', ctrlKey: true });
      expect(handler).toHaveBeenCalledTimes(1);

      // Unmount the hook
      unmount();

      // Verify shortcut no longer works after unmount
      fireKeyDown({ key: 'n', ctrlKey: true });
      expect(handler).toHaveBeenCalledTimes(1); // Still 1, not called again
    });

    it('should not interfere with other hooks after unmount', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      const { unmount: unmount1 } = renderHook(() =>
        useKeyboardShortcuts([{ key: 'ctrl+a', handler: handler1 }])
      );

      renderHook(() =>
        useKeyboardShortcuts([{ key: 'ctrl+b', handler: handler2 }])
      );

      // Unmount first hook
      unmount1();

      // First shortcut should no longer work
      fireKeyDown({ key: 'a', ctrlKey: true });
      expect(handler1).not.toHaveBeenCalled();

      // Second shortcut should still work
      fireKeyDown({ key: 'b', ctrlKey: true });
      expect(handler2).toHaveBeenCalledTimes(1);
    });
  });
});
