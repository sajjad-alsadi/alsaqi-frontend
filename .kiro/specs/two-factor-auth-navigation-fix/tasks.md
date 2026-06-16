# Implementation Plan: Two-Factor Auth Navigation Fix

## Overview

Split the 2FA enrollment modal in `apps/web/src/components/Login.tsx` into two navigable internal steps: a QR display step (step 1) and a code entry step (step 2). Add forward/backward navigation with framer-motion animated transitions, RTL-aware slide direction, and proper state management for error/input clearing on navigation.

## Tasks

- [x] 1. Add step state and navigation handlers
  - [x] 1.1 Add `setupStep` state variable and initialize it when enrollment begins
    - Add `const [setupStep, setSetupStep] = useState<1 | 2>(1)` to the Login component state declarations
    - In the `handleSubmit` handler where `setShow2FASetup(true)` is called, also call `setSetupStep(1)` to ensure step resets on re-entry
    - _Requirements: 1.1_

  - [x] 1.2 Implement navigation handler functions
    - Create `handleSetupNext` that sets `setupStep` to 2
    - Create `handleSetupBack` that sets `setupStep` to 1, clears `setupCode` to empty string, and clears `setupError` to empty string — while preserving `setupQr` and `setupBackupCodes`
    - Update the existing cancel logic into a `handleSetupCancel` function that resets `show2FASetup`, `setupStep`, `setupCode`, `twoFATempToken`, `setupError`, `setupQr`, and `setupBackupCodes`
    - _Requirements: 3.2, 3.3, 3.4, 4.2, 4.3, 5.2, 5.3, 8.2, 8.3_

- [x] 2. Refactor enrollment modal into two-step conditional rendering
  - [x] 2.1 Add AnimatePresence and split modal content into QR display step and code entry step
    - Import `AnimatePresence` from `motion/react`
    - Compute `slideDirection` based on language: `const slideDirection = language === Language.AR ? -1 : 1`
    - Wrap the step content inside the enrollment modal with `<AnimatePresence mode="wait">`
    - When `setupStep === 1`: render a `motion.div` (key="qr-step") containing the QR image, backup codes, a "Next" button (calls `handleSetupNext`), and a "Cancel" button (calls `handleSetupCancel`). Do NOT render the 6-digit code input.
    - When `setupStep === 2`: render a `motion.div` (key="code-step") containing the 6-digit code input, "Verify" submit button, "Back" button (calls `handleSetupBack`), and "Cancel" button (calls `handleSetupCancel`). Do NOT render QR image or backup codes.
    - Apply directional slide animations: step 1 enters from `x: -20 * slideDirection`, exits to `x: 20 * slideDirection`; step 2 enters from `x: 20 * slideDirection`, exits to `x: -20 * slideDirection`. Use `transition={{ duration: 0.2 }}`.
    - _Requirements: 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 2.4, 3.1, 4.1, 5.1, 7.1, 7.2_

  - [x] 2.2 Update the step progress indicator to reflect current sub-step
    - Compute `const progressStep = setupStep === 1 ? 2 : 3` and `const progressTotal = 3`
    - When `setupStep === 1` (QR display): render steps 1 and 2 as filled (primary color), step 3 as unfilled (border-strong color)
    - When `setupStep === 2` (code entry): render all 3 steps as filled (primary color)
    - Update the `aria-label` to use `t('auth.twoFAStep', { current: progressStep, total: progressTotal })`
    - Update the visible text span similarly
    - _Requirements: 6.1, 6.2, 6.3_

  - [x] 2.3 Scope error display to code entry step only
    - Move the `setupError` alert rendering so it only appears inside the `setupStep === 2` branch
    - Ensure `handleSetupBack` clears `setupError` so returning to step 1 has no error visible
    - Ensure advancing back to step 2 from step 1 starts with no stale error message (already handled by `handleSetupBack` clearing it)
    - _Requirements: 8.1, 8.2, 8.3_

  - [x] 2.4 Add focus management for code input on step 2
    - Update the existing `useEffect` that focuses `twoFACodeRef` — also trigger focus when `setupStep` changes to 2 (or add a new ref/effect for the setup code input)
    - Ensure the setup code input receives focus when transitioning to step 2
    - _Requirements: 2.2 (accessibility)_

- [x] 3. Checkpoint
  - Ensure the component compiles without TypeScript errors, verify the modal renders correctly in both LTR and RTL modes, and ask the user if questions arise.

- [ ]* 4. Write property-based tests for step navigation logic
  - [ ]* 4.1 Write property test for initial step state
    - **Property 1: Initial step is always QR display**
    - For any login response data triggering forced 2FA enrollment, verify `setupStep` initializes to 1
    - **Validates: Requirements 1.1**

  - [ ]* 4.2 Write property test for step content mutual exclusivity
    - **Property 2: Step content mutual exclusivity**
    - For any value of `setupStep`, verify that QR content and code input are never rendered simultaneously
    - **Validates: Requirements 1.2, 1.3, 2.2, 2.3**

  - [ ]* 4.3 Write property test for forward navigation
    - **Property 3: Forward navigation advances step**
    - For any state where `setupStep === 1`, verify "Next" action sets `setupStep` to 2
    - **Validates: Requirements 2.1**

  - [ ]* 4.4 Write property test for backward navigation state clearing
    - **Property 4: Backward navigation returns to QR step and clears transient input**
    - For any state where `setupStep === 2` with any code/error values, verify "Back" sets `setupStep` to 1, clears `setupCode` and `setupError`, preserves `setupQr` and `setupBackupCodes`
    - **Validates: Requirements 3.2, 3.3, 3.4, 8.2, 8.3**

  - [ ]* 4.5 Write property test for cancel resetting all state
    - **Property 5: Cancel resets all setup state from any step**
    - For any `setupStep` value and any combination of state values, verify "Cancel" resets all 2FA setup state
    - **Validates: Requirements 4.2, 4.3, 5.2, 5.3**

  - [ ]* 4.6 Write property test for error visibility scoping
    - **Property 7: Error visibility is scoped to Code_Entry_Step**
    - For any non-empty `setupError`, verify the error renders only when `setupStep === 2`
    - **Validates: Requirements 8.1**

  - [ ]* 4.7 Write property test for step progress indicator
    - **Property 8: Step progress indicator reflects current step**
    - For any `setupStep` value, verify the indicator displays `setupStep + 1` of 3 with correct aria-label
    - **Validates: Requirements 6.1, 6.2, 6.3**

- [x] 5. Final checkpoint
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- All changes are scoped to `apps/web/src/components/Login.tsx` — no new files needed
- The existing `handle2FASetupComplete` submit handler remains unchanged; only the modal's internal rendering and navigation are refactored
- RTL support is preserved via the existing `dir` attribute and the `slideDirection` variable that inverts animation direction

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["2.1", "2.2"] },
    { "id": 3, "tasks": ["2.3", "2.4"] },
    { "id": 4, "tasks": ["4.1", "4.2", "4.3", "4.4", "4.5", "4.6", "4.7"] }
  ]
}
```
