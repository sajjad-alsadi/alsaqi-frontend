import React, { useEffect, useRef, useCallback, ReactNode } from 'react';

interface FocusTrapProps {
  active: boolean;
  onEscape: () => void;
  children: ReactNode;
}

const FOCUSABLE_SELECTOR =
  'button:not([disabled]):not([tabindex="-1"]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export const FocusTrap: React.FC<FocusTrapProps> = ({ active, onEscape, children }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onEscapeRef = useRef(onEscape);

  // Keep onEscapeRef current
  useEffect(() => {
    onEscapeRef.current = onEscape;
  }, [onEscape]);

  // Stable handleKeyDown - no longer depends on onEscape
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!active || !containerRef.current) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        onEscapeRef.current();
        return;
      }

      if (e.key !== 'Tab') return;

      const focusableElements = containerRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      if (focusableElements.length === 0) return;

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement?.focus();
        }
      } else {
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement?.focus();
        }
      }
    },
    [active]
  );

  // Effect 1: Capture the trigger element on activation, set initial focus, and
  // restore focus inside the effect cleanup so restoration runs before the
  // trapped subtree unmounts (Req 5.1, 5.2). If the original trigger is no
  // longer in the document, focus moves to a defined fallback (Req 5.3).
  useEffect(() => {
    if (!active) return;

    // Capture the element that triggered the trap (e.g. the button that opened the modal)
    previousFocusRef.current = document.activeElement as HTMLElement | null;

    const timer = setTimeout(() => {
      if (containerRef.current) {
        const firstFocusable = containerRef.current.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
        firstFocusable?.focus();
      }
    }, 50);

    return () => {
      clearTimeout(timer);
      const trigger = previousFocusRef.current;
      previousFocusRef.current = null;

      // Restore focus to the trigger if it is still in the document; otherwise
      // fall back to document.body so navigation continues without throwing.
      if (trigger && document.contains(trigger) && typeof trigger.focus === 'function') {
        trigger.focus();
      } else {
        // document.body is not focusable by default; make it programmatically
        // focusable so focus genuinely lands on the defined fallback. Guarded so
        // restoration never throws if body is unavailable.
        const fallback = document.body;
        if (fallback && typeof fallback.focus === 'function') {
          if (!fallback.hasAttribute('tabindex')) {
            fallback.setAttribute('tabindex', '-1');
          }
          fallback.focus();
        }
      }
    };
  }, [active]);

  // Effect 2: Keydown listener (can re-attach without stealing focus)
  useEffect(() => {
    if (active) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [active, handleKeyDown]);

  return <div ref={containerRef}>{children}</div>;
};

export default FocusTrap;
