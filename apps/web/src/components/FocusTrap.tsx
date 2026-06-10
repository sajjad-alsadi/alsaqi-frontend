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
  const isActivatedRef = useRef<boolean>(false);
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

  // Effect 1: Initial focus (only on first activation)
  useEffect(() => {
    if (active && !isActivatedRef.current) {
      isActivatedRef.current = true;
      previousFocusRef.current = document.activeElement as HTMLElement;
      const timer = setTimeout(() => {
        if (containerRef.current) {
          const firstFocusable = containerRef.current.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
          firstFocusable?.focus();
        }
      }, 50);
      return () => clearTimeout(timer);
    }
    if (!active) {
      isActivatedRef.current = false;
      if (previousFocusRef.current) {
        previousFocusRef.current.focus();
        previousFocusRef.current = null;
      }
    }
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
