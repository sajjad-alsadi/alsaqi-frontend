# Implementation Plan

## Overview

Fix the focus loss bug in the Compliance Matrix Add Modal where typing in any input field causes focus to jump away after a single character. The fix stabilizes function references and adds an activation guard in FocusTrap to prevent re-running initial focus logic on parent re-renders.

## Tasks

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - Focus Jumps Away During Typing in Active FocusTrap
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate focus is stolen from the active input field when the FocusTrap useEffect re-runs due to unstable function references
  - **Scoped PBT Approach**: Scope the property to the concrete failing case: typing a character in any input field inside an active FocusTrap where onEscape prop reference changes between renders
  - Test setup: Render FocusTrap with `active=true`, place focusable input inside, focus that input, then simulate a parent re-render that changes the `onEscape` prop reference (simulating formData state change cascade)
  - Property assertion: For all inputs where `isBugCondition(input)` holds (modalIsOpen=true, focusTrap already active, parent re-renders due to formData change), `document.activeElement` SHALL remain the currently focused input element after 100ms
  - Test that typing "A" in a focused input inside FocusTrap does NOT cause `document.activeElement` to change to the first focusable element
  - Test that re-rendering the parent with a new `onEscape` reference while FocusTrap is already active does NOT re-apply initial focus logic
  - Run test on UNFIXED code - expect FAILURE (focus jumps to first focusable element after 50ms setTimeout fires)
  - **EXPECTED OUTCOME**: Test FAILS (this is correct - it proves the bug exists)
  - Document counterexamples found: after parent re-render with new onEscape reference, `document.activeElement` changes from the input to the first focusable element (e.g., close button)
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.1, 1.2, 1.3_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Focus Trapping Navigation and Lifecycle Behavior
  - **IMPORTANT**: Follow observation-first methodology
  - **Step 1 - Observe behavior on UNFIXED code for non-buggy inputs:**
  - Observe: When modal first opens (active transitions false→true), first focusable element receives focus after 50ms delay
  - Observe: When Tab is pressed on last focusable element, focus cycles to first focusable element
  - Observe: When Shift+Tab is pressed on first focusable element, focus cycles to last focusable element
  - Observe: When Escape is pressed while modal is open, onEscape callback is invoked
  - Observe: When modal closes (active transitions true→false), focus restores to previously focused element
  - **Step 2 - Write property-based tests capturing observed behavior:**
  - Property: For all keyboard events where `NOT isBugCondition(input)` (Tab, Shift+Tab, Escape), FocusTrap SHALL handle them correctly
  - Property: For any number of focusable elements (1..N) inside FocusTrap, Tab cycling wraps from last to first element
  - Property: For any number of focusable elements (1..N) inside FocusTrap, Shift+Tab cycling wraps from first to last element
  - Property: For initial activation (active false→true), first focusable element receives focus exactly once
  - Property: For deactivation (active true→false), previously focused element receives focus
  - Verify all tests pass on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 3. Fix for FocusTrap focus loss during typing in Compliance Matrix Add Modal

  - [x] 3.1 Add `isActivatedRef` guard and separate initial-focus effect in FocusTrap
    - In `apps/web/src/components/FocusTrap.tsx`:
    - Add `const isActivatedRef = useRef<boolean>(false)` to track whether initial focus has already been applied
    - Create a dedicated `useEffect` that depends only on `[active]` for initial focus logic
    - Guard the initial focus setTimeout with `if (active && !isActivatedRef.current)` to prevent re-focus when already active
    - Set `isActivatedRef.current = true` after first focus assignment
    - Reset `isActivatedRef.current = false` when `active` becomes `false`
    - Keep focus-restore logic (previousFocusRef) in this same effect for deactivation
    - _Bug_Condition: isBugCondition(input) where modalIsOpen=true AND focusTrapAlreadyActive=true AND parentReRendered=true_
    - _Expected_Behavior: FocusTrap SHALL NOT re-apply initial focus when isActivatedRef.current is already true_
    - _Preservation: Initial focus on first activation (3.1) and focus restore on close (3.5) must remain unchanged_
    - _Requirements: 2.2, 2.3, 3.1, 3.5_

  - [x] 3.2 Stabilize `handleKeyDown` using `onEscapeRef` pattern in FocusTrap
    - In `apps/web/src/components/FocusTrap.tsx`:
    - Add `const onEscapeRef = useRef(onEscape)` to hold latest onEscape callback
    - Add `useEffect(() => { onEscapeRef.current = onEscape }, [onEscape])` to keep ref current
    - Update `handleKeyDown` useCallback to read from `onEscapeRef.current` instead of closing over `onEscape`
    - Remove `onEscape` from `handleKeyDown` dependency array, leaving only `[active]`
    - This ensures `handleKeyDown` reference remains stable across parent re-renders
    - _Bug_Condition: unstable onEscape reference cascading through handleKeyDown → useEffect re-execution_
    - _Expected_Behavior: handleKeyDown reference remains stable when onEscape changes, preventing useEffect re-runs_
    - _Preservation: Escape key must still call latest onEscape (3.2), Tab/Shift+Tab cycling unchanged (3.3, 3.4)_
    - _Requirements: 1.2, 1.3, 2.3, 3.2, 3.3, 3.4_

  - [x] 3.3 Create separate keydown event listener effect in FocusTrap
    - In `apps/web/src/components/FocusTrap.tsx`:
    - Create a second `useEffect` dedicated to attaching/detaching the keydown event listener
    - Dependencies: `[active, handleKeyDown]`
    - This effect ONLY manages `document.addEventListener('keydown', handleKeyDown)` and cleanup
    - It does NOT contain any focus-assignment logic (that's in the initial-focus effect from 3.1)
    - Since handleKeyDown is now stable (from 3.2), this effect rarely re-runs
    - _Bug_Condition: combined useEffect that mixed event-listener attachment with initial-focus logic_
    - _Expected_Behavior: event listener updates independently without triggering focus changes_
    - _Preservation: keydown listener is always attached when active, removed on cleanup_
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 3.4 Stabilize `onClose` with `useCallback` in ComplianceMatrixPage
    - In `apps/web/src/modules/ComplianceMatrix/ComplianceMatrixPage.tsx`:
    - Wrap modal close handler in `useCallback`: `const handleModalClose = useCallback(() => { setIsModalOpen(false) }, [])`
    - Replace inline arrow function in Modal's `onClose` prop with `handleModalClose`
    - This prevents creating a new function reference on every formData state change re-render
    - _Bug_Condition: inline arrow `() => setIsModalOpen(false)` creates new reference every render_
    - _Expected_Behavior: stable onClose reference prevents unnecessary cascade through onEscape → handleKeyDown_
    - _Preservation: Modal close behavior must remain functionally identical_
    - _Requirements: 1.2, 2.1, 2.2_

  - [x] 3.5 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Focus Stability During Typing in Active FocusTrap
    - **IMPORTANT**: Re-run the SAME test from task 1 - do NOT write a new test
    - The test from task 1 encodes the expected behavior (focus remains on active input)
    - When this test passes, it confirms the expected behavior is satisfied
    - Run bug condition exploration test from step 1
    - **EXPECTED OUTCOME**: Test PASSES (confirms bug is fixed - focus no longer jumps away)
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 3.6 Verify preservation tests still pass
    - **Property 2: Preservation** - Focus Trapping Navigation and Lifecycle Behavior
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - Run preservation property tests from step 2
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions in Tab cycling, Shift+Tab cycling, Escape-to-close, initial focus on open, and focus restore on close)
    - Confirm all tests still pass after fix (no regressions)

- [x] 4. Checkpoint - Ensure all tests pass
  - Run full test suite to confirm no regressions
  - Verify bug condition exploration test passes (focus stays on active input during typing)
  - Verify preservation tests pass (Tab cycling, Shift+Tab cycling, Escape, initial focus, focus restore)
  - Ensure all existing tests in the project still pass
  - Ask the user if questions arise

## Task Dependency Graph

```json
{
  "waves": [
    { "wave": 1, "tasks": ["1", "2"] },
    { "wave": 2, "tasks": ["3.1", "3.2", "3.4"] },
    { "wave": 3, "tasks": ["3.3"] },
    { "wave": 4, "tasks": ["3.5", "3.6"] },
    { "wave": 5, "tasks": ["4"] }
  ]
}
```

## Notes

- Tasks 1 and 2 are independent and can be written in parallel
- Task 1 MUST fail on unfixed code — this is expected and confirms the bug exists
- Task 2 MUST pass on unfixed code — this captures the baseline behavior to preserve
- Implementation tasks 3.1-3.4 should be applied together as they form a cohesive fix
- The primary file to modify is `apps/web/src/components/FocusTrap.tsx` (tasks 3.1, 3.2, 3.3)
- The secondary file is `apps/web/src/modules/ComplianceMatrix/ComplianceMatrixPage.tsx` (task 3.4)
- Task 3.4 (useCallback for onClose) is a defense-in-depth measure; the FocusTrap changes alone should prevent the bug, but stabilizing the reference chain ensures no unnecessary re-renders propagate
