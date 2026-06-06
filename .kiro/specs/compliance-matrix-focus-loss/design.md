# Compliance Matrix Focus Loss Bugfix Design

## Overview

When the Add Modal in the Compliance Matrix is opened and the user types in any input field, focus automatically jumps away after a single character. The root cause is an unstable function reference chain (`onClose` → `onEscape` → `handleKeyDown`) that triggers the FocusTrap `useEffect` to re-run its initial-focus logic on every parent re-render caused by `formData` state changes. The fix stabilizes function references with `useCallback` and adds a guard in FocusTrap to distinguish between initial activation and subsequent re-renders.

## Glossary

- **Bug_Condition (C)**: The condition that triggers the bug — typing in an input field inside the Add Modal causes focus to jump to the first focusable element
- **Property (P)**: The desired behavior — focus remains on the currently active input field during typing
- **Preservation**: Existing focus-trapping behavior (Tab cycling, Shift+Tab cycling, Escape-to-close, initial focus on open, focus restore on close) that must remain unchanged
- **FocusTrap**: The component in `apps/web/src/components/FocusTrap.tsx` that traps keyboard focus within a modal dialog
- **Modal**: The component in `apps/web/src/components/Modal.tsx` that wraps content in a dialog with overlay, passing `onClose` as `onEscape` to FocusTrap
- **ComplianceMatrixPage**: The page in `apps/web/src/modules/ComplianceMatrix/ComplianceMatrixPage.tsx` that manages `formData` state and renders the Add Modal
- **handleKeyDown**: The `useCallback` inside FocusTrap that handles Escape and Tab key events, depends on `[active, onEscape]`
- **formData**: The React state in ComplianceMatrixPage that holds form field values, causing re-renders on every keystroke

## Bug Details

### Bug Condition

The bug manifests when a user types in any input field inside the Compliance Matrix Add Modal. The `FocusTrap` component's `useEffect` re-runs its initial-focus logic because the `handleKeyDown` dependency changes on every parent re-render. The parent re-renders because `formData` state updates on each keystroke, creating a new `onClose` function reference (an inline arrow or unstable reference), which cascades through `onEscape` → `handleKeyDown` → `useEffect` re-execution → `setTimeout(50ms)` focuses the first focusable element.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type { event: KeyboardEvent, modalState: ModalState }
  OUTPUT: boolean
  
  RETURN input.modalState.isAddModalOpen == true
         AND input.event.target IS HTMLInputElement OR HTMLTextAreaElement OR HTMLSelectElement
         AND input.event.type == 'input' (character typed, not Tab/Escape/Shift)
         AND focusTrapIsAlreadyActive == true
         AND parentComponentReRendered == true (due to formData state change)
END FUNCTION
```

### Examples

- User opens Add Modal, clicks on "Title" input, types "A" → focus jumps to the close button (first focusable element) after 50ms
- User opens Add Modal, clicks on "Description" textarea, types "Test" → only "T" appears before focus jumps away; remaining characters are lost
- User opens Add Modal, selects a dropdown, then types in another field → same focus-jump behavior
- User opens Edit Modal (pre-filled form), types in "Title" input → same bug occurs because the same Modal/FocusTrap components are used

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Tab key on the last focusable element inside the modal must continue to cycle focus back to the first focusable element
- Shift+Tab key on the first focusable element inside the modal must continue to cycle focus to the last focusable element
- Escape key while the modal is open must continue to call `onEscape` to close the modal
- When the modal first opens (active transitions from false to true), focus must still move to the first focusable element after the animation delay
- When the modal closes (active transitions from true to false), focus must restore to the element that was focused before the modal opened

**Scope:**
All inputs that do NOT involve typing in form fields while the FocusTrap is already active should be completely unaffected by this fix. This includes:
- Initial modal open (first focus assignment)
- Tab and Shift+Tab navigation within the modal
- Escape key to close
- Focus restoration on modal close
- Mouse clicks on form elements
- Interactions outside the modal

## Hypothesized Root Cause

Based on the bug description and code analysis, the confirmed root cause chain is:

1. **Unstable `onClose` reference in ComplianceMatrixPage**: The `onClose` prop passed to Modal is `() => setIsModalOpen(false)` — an inline arrow function that creates a new reference on every render. When `formData` changes (every keystroke), the parent re-renders, creating a new `onClose`.

2. **Unstable `onEscape` propagation in Modal**: The Modal component passes `onClose` directly as `onEscape` to FocusTrap. Since `onClose` is a new reference each render, `onEscape` is also new.

3. **`handleKeyDown` dependency on `onEscape`**: In FocusTrap, `handleKeyDown` is wrapped in `useCallback([active, onEscape])`. When `onEscape` changes, `handleKeyDown` gets a new reference.

4. **`useEffect` depends on `handleKeyDown`**: The effect that attaches the keydown listener and sets initial focus depends on `[active, handleKeyDown]`. When `handleKeyDown` changes, the entire effect re-runs — including the `setTimeout` that focuses the first focusable element.

5. **No guard for "already active" state**: The `useEffect` does not distinguish between "trap just became active" and "trap was already active but dependencies changed." It always runs the initial-focus setTimeout.

## Correctness Properties

Property 1: Bug Condition - Focus Stability During Typing

_For any_ input event where a character is typed in a form field inside an active FocusTrap (modal already open and focus trap already active), the FocusTrap component SHALL NOT re-apply initial focus logic, and the currently focused input element SHALL remain focused.

**Validates: Requirements 2.1, 2.2, 2.3**

Property 2: Preservation - Focus Trapping Behavior

_For any_ keyboard input that is Tab, Shift+Tab, or Escape while the FocusTrap is active, the FocusTrap SHALL continue to cycle focus (Tab/Shift+Tab) or invoke onEscape (Escape) exactly as the original implementation does, preserving all existing focus management behavior for navigation and dismissal.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `apps/web/src/components/FocusTrap.tsx`

**Changes**:

1. **Add an `isActivatedRef` guard**: Introduce a `useRef<boolean>(false)` that tracks whether the trap has already applied initial focus. Set it to `true` after the first focus assignment, and reset to `false` when `active` becomes `false`.

2. **Separate initial-focus logic from event-listener attachment**: Split the current `useEffect` into two concerns:
   - One effect for initial focus (depends only on `active`, guarded by `isActivatedRef`)
   - One effect for keydown event listener (depends on `active`, `handleKeyDown`)

3. **Stabilize `handleKeyDown` dependencies**: Use a ref (`onEscapeRef`) to hold the latest `onEscape` callback so that `handleKeyDown` itself does not need `onEscape` in its dependency array. This ensures `handleKeyDown` reference remains stable across re-renders.

**Specific Implementation:**

```typescript
// Add ref to track activation state
const isActivatedRef = useRef(false);
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
    // ... Tab/Shift+Tab logic unchanged
  },
  [active] // onEscape removed from deps
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
```

**File**: `apps/web/src/modules/ComplianceMatrix/ComplianceMatrixPage.tsx`

**Changes**:

4. **Stabilize `onClose` with `useCallback`**: Wrap the modal close handler in `useCallback` to prevent unnecessary reference changes:

```typescript
const handleModalClose = useCallback(() => {
  setIsModalOpen(false);
}, []);
```

5. **Pass stable reference to Modal**: Use `handleModalClose` instead of inline arrow in the Modal's `onClose` prop.

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bug on unfixed code, then verify the fix works correctly and preserves existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix. Confirm or refute the root cause analysis. If we refute, we will need to re-hypothesize.

**Test Plan**: Write tests that render the ComplianceMatrixPage, open the Add Modal, simulate typing in input fields, and assert that focus remains on the active input. Run these tests on the UNFIXED code to observe failures.

**Test Cases**:
1. **Single Character Input Test**: Open Add Modal, focus title input, simulate typing "A" → assert focus remains on title input after 100ms (will fail on unfixed code)
2. **Multi-Character Input Test**: Open Add Modal, focus title input, simulate typing "Test" → assert all characters appear in the input and focus never leaves (will fail on unfixed code)
3. **Textarea Input Test**: Open Add Modal, focus description textarea, simulate typing → assert focus remains on textarea (will fail on unfixed code)
4. **FocusTrap Re-render Test**: Render FocusTrap with active=true, change onEscape prop reference → assert focus does not move to first element (will fail on unfixed code)

**Expected Counterexamples**:
- After typing a character, `document.activeElement` changes from the input to the first focusable element (close button)
- The `setTimeout(50ms)` in the useEffect fires and moves focus away
- Possible causes confirmed: unstable onEscape reference triggers handleKeyDown change triggers useEffect re-run

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed function produces the expected behavior.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  result := simulateTypingInActiveModal(input)
  ASSERT document.activeElement == input.targetField
  ASSERT input.targetField.value CONTAINS input.typedCharacters
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed function produces the same result as the original function.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT FocusTrap_fixed(input).focusBehavior == FocusTrap_original(input).focusBehavior
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many combinations of focusable element configurations and keyboard events
- It catches edge cases like empty modals, single-element modals, or rapid Tab sequences
- It provides strong guarantees that Tab cycling, Shift+Tab cycling, and Escape behavior are unchanged

**Test Plan**: Observe behavior on UNFIXED code first for Tab cycling, Escape, and initial focus, then write property-based tests capturing that behavior.

**Test Cases**:
1. **Initial Focus Preservation**: Open modal → assert first focusable element receives focus after 50ms delay (must still work)
2. **Tab Cycling Preservation**: With modal open, press Tab repeatedly → assert focus cycles through all focusable elements and wraps from last to first
3. **Shift+Tab Cycling Preservation**: With modal open, press Shift+Tab on first element → assert focus moves to last element
4. **Escape Close Preservation**: With modal open, press Escape → assert onEscape/onClose is called
5. **Focus Restore Preservation**: Open modal, close modal → assert focus returns to previously focused element

### Unit Tests

- Test FocusTrap `isActivatedRef` guard prevents re-focus when `active` remains true but dependencies change
- Test FocusTrap initial focus fires only once when `active` transitions from false to true
- Test `onEscapeRef` pattern correctly calls the latest `onEscape` even when reference is updated
- Test handleKeyDown Tab/Shift+Tab logic with various focusable element configurations
- Test ComplianceMatrixPage `handleModalClose` is stable across re-renders (referential equality)

### Property-Based Tests

- Generate random sequences of keystrokes (characters, Tab, Shift+Tab, Escape) and verify focus behavior matches the specification for each type
- Generate random numbers of focusable elements inside FocusTrap and verify Tab cycling wraps correctly for all configurations
- Generate random re-render triggers (state changes) and verify focus does not move when trap is already active

### Integration Tests

- Test full Add Modal flow: open modal → type in multiple fields → save → verify all data submitted correctly
- Test Edit Modal flow: open with pre-filled data → modify fields → save → verify changes
- Test modal open → type → press Escape → verify modal closes and focus restores
- Test modal open → Tab through all fields → type in last field → verify focus stability
