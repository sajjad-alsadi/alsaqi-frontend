// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import React from 'react';

import { FocusTrap } from './FocusTrap';

/**
 * Unit tests for FocusTrap focus restoration (Req 5.1, 5.2, 5.3).
 *
 * FocusTrap captures `document.activeElement` when it activates and restores
 * focus to that trigger inside the effect cleanup (so restoration runs before
 * the trapped subtree unmounts). When the trigger is no longer in the document,
 * focus falls back to `document.body` without throwing.
 */

// Controlled harness: a trigger button alongside the trap. `active` drives the
// trap effect (capture on mount, restore on cleanup) and `showTrigger` lets a
// test remove the trigger from the DOM before the trap closes.
function Harness({ active, showTrigger }: { active: boolean; showTrigger: boolean }) {
  return (
    <div>
      {showTrigger && (
        <button type="button" data-testid="trigger">
          Open
        </button>
      )}
      <FocusTrap active={active} onEscape={() => {}}>
        <button type="button" data-testid="inside">
          Inside
        </button>
      </FocusTrap>
    </div>
  );
}

describe('FocusTrap focus restoration', () => {
  afterEach(() => {
    cleanup();
    // Reset any tabindex the fallback path may have set on body.
    document.body.removeAttribute('tabindex');
  });

  it('restores focus to the triggering element when the trap closes (Req 5.1, 5.2)', () => {
    const { getByTestId, rerender } = render(<Harness active={false} showTrigger />);

    const trigger = getByTestId('trigger') as HTMLButtonElement;
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    // Activate the trap: the effect captures the currently-focused trigger.
    rerender(<Harness active showTrigger />);

    // Close the trap: the effect cleanup runs and restores focus to the trigger
    // (cleanup runs before the trapped subtree would unmount).
    rerender(<Harness active={false} showTrigger />);

    expect(document.activeElement).toBe(trigger);
  });

  it('falls back to document.body when the trigger was removed before close (Req 5.3)', () => {
    const { getByTestId, rerender } = render(<Harness active={false} showTrigger />);

    const trigger = getByTestId('trigger') as HTMLButtonElement;
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    // Activate the trap and capture the trigger.
    rerender(<Harness active showTrigger />);

    // Remove the trigger from the document while the trap is still active.
    rerender(<Harness active showTrigger={false} />);

    // Close the trap: restoration must not throw and must land on the fallback.
    expect(() => rerender(<Harness active={false} showTrigger={false} />)).not.toThrow();

    expect(document.activeElement).toBe(document.body);
  });
});
