// @vitest-environment jsdom
/**
 * Bug Condition Exploration Test - Focus Jumps Away During Typing in Active FocusTrap
 *
 * **Validates: Requirements 1.1, 1.2, 1.3**
 *
 * This test surfaces counterexamples demonstrating that focus is stolen from the
 * active input field when the FocusTrap useEffect re-runs due to unstable function references.
 *
 * Bug Condition: When a user types in an input field inside an active FocusTrap, the parent
 * re-renders (due to formData state change), creating a new onEscape reference. This cascades:
 * onEscape changes → handleKeyDown changes → useEffect re-runs → setTimeout(50ms) focuses
 * the first focusable element, stealing focus from the current input.
 *
 * EXPECTED OUTCOME: This test FAILS on unfixed code (proving the bug exists).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import React, { useState, useCallback } from 'react';
import * as fc from 'fast-check';
import { FocusTrap } from '../FocusTrap';

// Helper: wrapper component that simulates parent re-rendering with new onEscape reference
function ParentWithUnstableOnEscape({
  children,
  initialFormValue,
}: {
  children: React.ReactNode;
  initialFormValue?: string;
}) {
  const [formData, setFormData] = useState(initialFormValue ?? '');

  // This mimics the bug: inline arrow creates new reference on every render
  // When formData changes, component re-renders, onClose is new → onEscape is new
  const onClose = () => {
    /* close modal */
  };

  return (
    <div>
      <FocusTrap active={true} onEscape={onClose}>
        <button data-testid="close-btn">Close</button>
        <input
          data-testid="title-input"
          value={formData}
          onChange={(e) => setFormData(e.target.value)}
        />
        <textarea data-testid="description-textarea" />
        {children}
      </FocusTrap>
      {/* Expose setter for external trigger */}
      <button
        data-testid="trigger-rerender"
        onClick={() => setFormData((prev) => prev + 'A')}
      />
    </div>
  );
}

describe('Bug Condition: Focus Jumps Away During Typing in Active FocusTrap', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('Property 1: Focus SHALL remain on the active input after parent re-render with new onEscape reference', async () => {
    vi.useFakeTimers();

    const { getByTestId } = render(
      <ParentWithUnstableOnEscape initialFormValue="">
        <input data-testid="extra-input" />
      </ParentWithUnstableOnEscape>
    );

    // Wait for initial focus logic to complete (50ms setTimeout in FocusTrap)
    await act(async () => {
      vi.advanceTimersByTime(60);
    });

    const titleInput = getByTestId('title-input') as HTMLInputElement;

    // Focus the title input (simulating user clicking on it)
    await act(async () => {
      titleInput.focus();
    });

    expect(document.activeElement).toBe(titleInput);

    // Simulate typing "A" - this causes formData state change → parent re-render
    // → new onClose reference → new onEscape → handleKeyDown changes → useEffect re-runs
    await act(async () => {
      // Simulate the input event (typing a character)
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
      )?.set;
      nativeInputValueSetter?.call(titleInput, 'A');
      titleInput.dispatchEvent(new Event('input', { bubbles: true }));
      titleInput.dispatchEvent(new Event('change', { bubbles: true }));
    });

    // At this point, the parent has re-rendered with new onEscape reference.
    // The buggy useEffect will schedule a setTimeout(50ms) to focus first element.
    // Advance timers to trigger the setTimeout in the re-triggered useEffect.
    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    // ASSERTION: Focus should remain on the title input
    // On UNFIXED code, this FAILS because focus jumps to the close button (first focusable)
    expect(document.activeElement).toBe(titleInput);
  });

  it('Property 1 (PBT): For all inputs where bug condition holds, focus SHALL remain on the currently focused element', async () => {
    /**
     * **Validates: Requirements 1.1, 1.2, 1.3**
     *
     * Property: For all character inputs typed in any focusable input field inside
     * an active FocusTrap, when the parent re-renders with a new onEscape reference,
     * document.activeElement SHALL remain the currently focused input element.
     */
    vi.useFakeTimers();

    // Scoped PBT: generate characters to type and field index to focus
    const fieldIndices = fc.integer({ min: 0, max: 1 }); // 0 = title input, 1 = textarea
    const typedChars = fc.string({ minLength: 1, maxLength: 3 }).filter((s) => s.length > 0);

    // We use fc.assert with a synchronous-looking property that uses fake timers
    let counterExampleFound = false;
    let counterExampleDetails = '';

    try {
      fc.assert(
        fc.property(fieldIndices, typedChars, (fieldIndex, chars) => {
          // Clean up DOM between iterations
          document.body.innerHTML = '';

          const { getByTestId, unmount } = render(
            <ParentWithUnstableOnEscape initialFormValue="">
              <select data-testid="select-field">
                <option>Option 1</option>
              </select>
            </ParentWithUnstableOnEscape>
          );

          // Wait for initial focus to complete
          act(() => {
            vi.advanceTimersByTime(60);
          });

          // Select the target field based on generated index
          const fieldIds = ['title-input', 'description-textarea'];
          const targetField = getByTestId(fieldIds[fieldIndex]) as HTMLElement;

          // Focus the target field
          act(() => {
            targetField.focus();
          });

          // Verify we have focus before the re-render
          if (document.activeElement !== targetField) {
            unmount();
            return true; // Skip if we can't focus (not a valid bug condition)
          }

          // Simulate typing by triggering a re-render that changes onEscape reference
          // This is the core of the bug condition: parent re-renders with new formData
          act(() => {
            const triggerBtn = getByTestId('trigger-rerender');
            triggerBtn.click();
          });

          // Advance timers past the 50ms setTimeout that steals focus
          act(() => {
            vi.advanceTimersByTime(100);
          });

          // Property: focus MUST remain on the target field
          const focusStayed = document.activeElement === targetField;

          if (!focusStayed) {
            counterExampleFound = true;
            counterExampleDetails = `Field: ${fieldIds[fieldIndex]}, Typed: "${chars}", ` +
              `Expected activeElement: ${targetField.tagName}[${targetField.getAttribute('data-testid')}], ` +
              `Actual activeElement: ${document.activeElement?.tagName}[${document.activeElement?.getAttribute('data-testid') ?? 'unknown'}]`;
          }

          unmount();

          // Return true if focus stayed (property holds), false if focus jumped (bug!)
          return focusStayed;
        }),
        { numRuns: 20, seed: 42 }
      );
    } catch (e: any) {
      // fast-check throws on property violation - this is EXPECTED for bug condition tests
      counterExampleFound = true;
      if (!counterExampleDetails) {
        counterExampleDetails = e.message || 'Focus jumped away from active input after re-render';
      }
      throw e; // Re-throw so vitest marks the test as FAILED
    }

    // If we reach here, the property held for all inputs (unexpected for unfixed code)
    expect(counterExampleFound).toBe(false);
  });

  it('Property 1 (Direct): Re-rendering parent with new onEscape while FocusTrap is already active does NOT re-apply initial focus', async () => {
    /**
     * **Validates: Requirements 1.2, 1.3**
     *
     * Direct test: Render FocusTrap, let it activate and set initial focus,
     * then manually re-render with a different onEscape prop reference and
     * verify focus does not jump.
     */
    vi.useFakeTimers();

    let onEscapeVersion = 0;

    function DirectTestWrapper() {
      const [, setRenderCount] = useState(0);

      // Each render creates a new onEscape reference (unstable)
      const onEscape = () => {
        onEscapeVersion++;
      };

      return (
        <div>
          <FocusTrap active={true} onEscape={onEscape}>
            <button data-testid="first-btn">First Button</button>
            <input data-testid="text-input" />
            <button data-testid="last-btn">Last Button</button>
          </FocusTrap>
          <button
            data-testid="force-rerender"
            onClick={() => setRenderCount((c) => c + 1)}
          />
        </div>
      );
    }

    const { getByTestId } = render(<DirectTestWrapper />);

    // Wait for initial focus to fire (50ms setTimeout)
    await act(async () => {
      vi.advanceTimersByTime(60);
    });

    // Initial focus should be on the first focusable element (first-btn)
    expect(document.activeElement).toBe(getByTestId('first-btn'));

    // Now focus the text input (simulating user interaction)
    const textInput = getByTestId('text-input');
    await act(async () => {
      textInput.focus();
    });
    expect(document.activeElement).toBe(textInput);

    // Force a re-render of the parent - this creates a new onEscape reference
    // which cascades: onEscape → handleKeyDown → useEffect re-runs
    await act(async () => {
      getByTestId('force-rerender').click();
    });

    // Advance timers to let the buggy setTimeout(50ms) fire
    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    // ASSERTION: Focus should STILL be on the text input
    // On UNFIXED code this FAILS: focus jumps back to first-btn
    expect(document.activeElement).toBe(textInput);
  });
});
