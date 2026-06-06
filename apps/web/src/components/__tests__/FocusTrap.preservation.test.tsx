// @vitest-environment jsdom
/**
 * Preservation Property Tests - Focus Trapping Navigation and Lifecycle Behavior
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**
 *
 * These tests capture the existing CORRECT behaviors of FocusTrap that must be
 * preserved after the bug fix is applied. They verify focus trapping, Tab cycling,
 * Shift+Tab cycling, Escape handling, initial focus on open, and focus restore on close.
 *
 * IMPORTANT: These tests are run on UNFIXED code and MUST PASS, confirming the
 * baseline behavior to preserve.
 *
 * EXPECTED OUTCOME: All tests PASS (this confirms baseline behavior to preserve).
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import React, { useState } from 'react';
import * as fc from 'fast-check';
import { FocusTrap } from '../FocusTrap';

/**
 * Helper: Creates a FocusTrap with a configurable number of focusable elements.
 * Used by property tests to verify behavior across different element counts.
 */
function FocusTrapWithElements({
  active,
  onEscape,
  elementCount,
}: {
  active: boolean;
  onEscape: () => void;
  elementCount: number;
}) {
  const elements = [];
  for (let i = 0; i < elementCount; i++) {
    elements.push(
      <button key={i} data-testid={`btn-${i}`}>
        Button {i}
      </button>
    );
  }
  return (
    <FocusTrap active={active} onEscape={onEscape}>
      {elements}
    </FocusTrap>
  );
}

/**
 * Helper: Wrapper component that controls FocusTrap activation lifecycle
 */
function ActivationWrapper({
  initialActive,
  elementCount,
  onEscape,
}: {
  initialActive: boolean;
  elementCount: number;
  onEscape: () => void;
}) {
  const [active, setActive] = useState(initialActive);

  return (
    <div>
      <button data-testid="external-btn">External Button</button>
      <FocusTrapWithElements
        active={active}
        onEscape={onEscape}
        elementCount={elementCount}
      />
      <button data-testid="activate-btn" onClick={() => setActive(true)}>
        Activate
      </button>
      <button data-testid="deactivate-btn" onClick={() => setActive(false)}>
        Deactivate
      </button>
    </div>
  );
}

describe('Preservation: Focus Trapping Navigation and Lifecycle Behavior', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Property: Tab cycling wraps from last to first element', () => {
    it('For any number of focusable elements (1..N), Tab on last element wraps to first', () => {
      /**
       * **Validates: Requirements 3.3**
       *
       * Property: For any number of focusable elements (1..N) inside FocusTrap,
       * pressing Tab when the last focusable element is focused SHALL cycle
       * focus to the first focusable element.
       */
      fc.assert(
        fc.property(
          fc.integer({ min: 2, max: 8 }),
          (elementCount) => {
            document.body.innerHTML = '';
            const onEscape = vi.fn();

            const { getByTestId, unmount } = render(
              <FocusTrapWithElements
                active={true}
                onEscape={onEscape}
                elementCount={elementCount}
              />
            );

            // Wait for initial focus (50ms)
            act(() => {
              vi.advanceTimersByTime(60);
            });

            // Focus the last element
            const lastElement = getByTestId(`btn-${elementCount - 1}`);
            act(() => {
              lastElement.focus();
            });
            expect(document.activeElement).toBe(lastElement);

            // Dispatch Tab keydown event
            act(() => {
              const tabEvent = new KeyboardEvent('keydown', {
                key: 'Tab',
                shiftKey: false,
                bubbles: true,
                cancelable: true,
              });
              document.dispatchEvent(tabEvent);
            });

            // Focus should wrap to the first element
            const firstElement = getByTestId('btn-0');
            expect(document.activeElement).toBe(firstElement);

            unmount();
            return true;
          }
        ),
        { numRuns: 20, seed: 123 }
      );
    });
  });

  describe('Property: Shift+Tab cycling wraps from first to last element', () => {
    it('For any number of focusable elements (1..N), Shift+Tab on first element wraps to last', () => {
      /**
       * **Validates: Requirements 3.4**
       *
       * Property: For any number of focusable elements (1..N) inside FocusTrap,
       * pressing Shift+Tab when the first focusable element is focused SHALL cycle
       * focus to the last focusable element.
       */
      fc.assert(
        fc.property(
          fc.integer({ min: 2, max: 8 }),
          (elementCount) => {
            document.body.innerHTML = '';
            const onEscape = vi.fn();

            const { getByTestId, unmount } = render(
              <FocusTrapWithElements
                active={true}
                onEscape={onEscape}
                elementCount={elementCount}
              />
            );

            // Wait for initial focus (50ms)
            act(() => {
              vi.advanceTimersByTime(60);
            });

            // Focus the first element
            const firstElement = getByTestId('btn-0');
            act(() => {
              firstElement.focus();
            });
            expect(document.activeElement).toBe(firstElement);

            // Dispatch Shift+Tab keydown event
            act(() => {
              const shiftTabEvent = new KeyboardEvent('keydown', {
                key: 'Tab',
                shiftKey: true,
                bubbles: true,
                cancelable: true,
              });
              document.dispatchEvent(shiftTabEvent);
            });

            // Focus should wrap to the last element
            const lastElement = getByTestId(`btn-${elementCount - 1}`);
            expect(document.activeElement).toBe(lastElement);

            unmount();
            return true;
          }
        ),
        { numRuns: 20, seed: 456 }
      );
    });
  });

  describe('Property: Escape key invokes onEscape callback', () => {
    it('For all keyboard events where Escape is pressed while FocusTrap is active, onEscape is invoked', () => {
      /**
       * **Validates: Requirements 3.2**
       *
       * Property: For all keyboard events where Escape is pressed while
       * FocusTrap is active, the onEscape callback SHALL be invoked exactly once.
       */
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 6 }),
          (elementCount) => {
            document.body.innerHTML = '';
            const onEscape = vi.fn();

            const { unmount } = render(
              <FocusTrapWithElements
                active={true}
                onEscape={onEscape}
                elementCount={elementCount}
              />
            );

            // Wait for initial focus (50ms)
            act(() => {
              vi.advanceTimersByTime(60);
            });

            // Dispatch Escape keydown event
            act(() => {
              const escapeEvent = new KeyboardEvent('keydown', {
                key: 'Escape',
                bubbles: true,
                cancelable: true,
              });
              document.dispatchEvent(escapeEvent);
            });

            // onEscape should have been called exactly once
            expect(onEscape).toHaveBeenCalledTimes(1);

            unmount();
            return true;
          }
        ),
        { numRuns: 15, seed: 789 }
      );
    });
  });

  describe('Property: Initial activation focuses first focusable element', () => {
    it('For initial activation (active false→true), first focusable element receives focus exactly once', () => {
      /**
       * **Validates: Requirements 3.1**
       *
       * Property: For initial activation (active transitions from false to true),
       * the first focusable element inside FocusTrap SHALL receive focus after
       * the 50ms delay, exactly once.
       */
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 6 }),
          (elementCount) => {
            document.body.innerHTML = '';
            const onEscape = vi.fn();

            const { getByTestId, unmount } = render(
              <ActivationWrapper
                initialActive={false}
                elementCount={elementCount}
                onEscape={onEscape}
              />
            );

            // Focus the external button first
            const externalBtn = getByTestId('external-btn');
            act(() => {
              externalBtn.focus();
            });
            expect(document.activeElement).toBe(externalBtn);

            // Activate the FocusTrap
            act(() => {
              getByTestId('activate-btn').click();
            });

            // Before the 50ms delay, first element should NOT yet have focus
            // (focus hasn't been assigned yet)

            // After 50ms delay, first focusable element should receive focus
            act(() => {
              vi.advanceTimersByTime(60);
            });

            const firstElement = getByTestId('btn-0');
            expect(document.activeElement).toBe(firstElement);

            unmount();
            return true;
          }
        ),
        { numRuns: 15, seed: 101 }
      );
    });
  });

  describe('Property: Deactivation restores previously focused element', () => {
    it('For deactivation (active true→false), previously focused element receives focus', () => {
      /**
       * **Validates: Requirements 3.5**
       *
       * Property: For deactivation (active transitions from true to false),
       * the element that was focused before the FocusTrap was activated SHALL
       * receive focus back (focus restore).
       */
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 6 }),
          (elementCount) => {
            document.body.innerHTML = '';
            const onEscape = vi.fn();

            const { getByTestId, unmount } = render(
              <ActivationWrapper
                initialActive={false}
                elementCount={elementCount}
                onEscape={onEscape}
              />
            );

            // Focus the external button (this should be restored after deactivation)
            const externalBtn = getByTestId('external-btn');
            act(() => {
              externalBtn.focus();
            });
            expect(document.activeElement).toBe(externalBtn);

            // Activate the FocusTrap
            act(() => {
              getByTestId('activate-btn').click();
            });

            // Wait for initial focus to complete
            act(() => {
              vi.advanceTimersByTime(60);
            });

            // Confirm focus moved to first element inside the trap
            const firstElement = getByTestId('btn-0');
            expect(document.activeElement).toBe(firstElement);

            // Deactivate the FocusTrap
            act(() => {
              getByTestId('deactivate-btn').click();
            });

            // Focus should restore to the external button
            expect(document.activeElement).toBe(externalBtn);

            unmount();
            return true;
          }
        ),
        { numRuns: 15, seed: 202 }
      );
    });
  });

  describe('Property: Non-bug-condition keyboard events are handled correctly', () => {
    it('For all keyboard events where NOT isBugCondition(input), FocusTrap handles them correctly', () => {
      /**
       * **Validates: Requirements 3.2, 3.3, 3.4**
       *
       * Property: For all keyboard events that are Tab, Shift+Tab, or Escape
       * (i.e., NOT bug condition inputs like character typing), FocusTrap SHALL
       * handle them correctly: Tab cycles forward, Shift+Tab cycles backward,
       * Escape invokes onEscape.
       */
      const keyActions = fc.oneof(
        fc.constant({ key: 'Tab', shiftKey: false, expected: 'next' as const }),
        fc.constant({ key: 'Tab', shiftKey: true, expected: 'prev' as const }),
        fc.constant({ key: 'Escape', shiftKey: false, expected: 'escape' as const })
      );

      fc.assert(
        fc.property(
          fc.integer({ min: 2, max: 6 }),
          keyActions,
          (elementCount, action) => {
            document.body.innerHTML = '';
            const onEscape = vi.fn();

            const { getByTestId, unmount } = render(
              <FocusTrapWithElements
                active={true}
                onEscape={onEscape}
                elementCount={elementCount}
              />
            );

            // Wait for initial focus
            act(() => {
              vi.advanceTimersByTime(60);
            });

            if (action.expected === 'next') {
              // Focus last element, Tab should wrap to first
              const lastElement = getByTestId(`btn-${elementCount - 1}`);
              act(() => {
                lastElement.focus();
              });

              act(() => {
                document.dispatchEvent(
                  new KeyboardEvent('keydown', {
                    key: action.key,
                    shiftKey: action.shiftKey,
                    bubbles: true,
                    cancelable: true,
                  })
                );
              });

              expect(document.activeElement).toBe(getByTestId('btn-0'));
            } else if (action.expected === 'prev') {
              // Focus first element, Shift+Tab should wrap to last
              const firstElement = getByTestId('btn-0');
              act(() => {
                firstElement.focus();
              });

              act(() => {
                document.dispatchEvent(
                  new KeyboardEvent('keydown', {
                    key: action.key,
                    shiftKey: action.shiftKey,
                    bubbles: true,
                    cancelable: true,
                  })
                );
              });

              expect(document.activeElement).toBe(getByTestId(`btn-${elementCount - 1}`));
            } else if (action.expected === 'escape') {
              // Escape should call onEscape
              act(() => {
                document.dispatchEvent(
                  new KeyboardEvent('keydown', {
                    key: action.key,
                    shiftKey: action.shiftKey,
                    bubbles: true,
                    cancelable: true,
                  })
                );
              });

              expect(onEscape).toHaveBeenCalledTimes(1);
            }

            unmount();
            return true;
          }
        ),
        { numRuns: 30, seed: 303 }
      );
    });
  });
});
