import { useEffect, useCallback } from 'react';

interface ShortcutConfig {
  /** Key combination (e.g., 'ctrl+n', 'ctrl+k', 'escape') */
  key: string;
  /** Callback when shortcut is triggered */
  handler: () => void;
  /** Whether the shortcut is currently active (default: true) */
  enabled?: boolean;
  /** Prevent default browser behavior (default: true) */
  preventDefault?: boolean;
}

/**
 * Hook for registering keyboard shortcuts.
 * Supports Ctrl/Cmd + key combinations.
 * 
 * @example
 * useKeyboardShortcuts([
 *   { key: 'ctrl+n', handler: () => setIsModalOpen(true) },
 *   { key: 'ctrl+k', handler: () => setIsSearchOpen(true) },
 *   { key: 'escape', handler: () => setIsModalOpen(false) },
 * ]);
 */
export function useKeyboardShortcuts(shortcuts: ShortcutConfig[]) {
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    // Don't trigger shortcuts when typing in inputs
    const target = event.target as HTMLElement;
    if (
      target.tagName === 'INPUT' || 
      target.tagName === 'TEXTAREA' || 
      target.tagName === 'SELECT' ||
      target.isContentEditable
    ) {
      // Only allow Escape in inputs
      if (event.key !== 'Escape') return;
    }

    for (const shortcut of shortcuts) {
      if (shortcut.enabled === false) continue;

      const parts = shortcut.key.toLowerCase().split('+');
      const key = parts[parts.length - 1];
      const needsCtrl = parts.includes('ctrl') || parts.includes('cmd');
      const needsShift = parts.includes('shift');
      const needsAlt = parts.includes('alt');

      const ctrlPressed = event.ctrlKey || event.metaKey;
      const shiftPressed = event.shiftKey;
      const altPressed = event.altKey;

      if (
        event.key.toLowerCase() === key &&
        ctrlPressed === needsCtrl &&
        shiftPressed === needsShift &&
        altPressed === needsAlt
      ) {
        if (shortcut.preventDefault !== false) {
          event.preventDefault();
        }
        shortcut.handler();
        return;
      }
    }
  }, [shortcuts]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}
