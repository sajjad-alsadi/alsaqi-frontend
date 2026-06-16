# Design Document

## Introduction

This design describes the internal two-step navigation for the 2FA Enrollment Modal in `apps/web/src/components/Login.tsx`. The current implementation renders the QR code, backup codes, and the verification code input in a single view. This change splits the modal into two distinct internal steps with forward/backward navigation, using a local state variable to control which content is visible.

## Architecture Overview

The change is scoped entirely to the `Login` component's 2FA enrollment modal (`show2FASetup` block). No new files or components are introduced — the refactor adds a `setupStep` state variable and conditionally renders content based on its value. `AnimatePresence` from `motion/react` handles entry/exit animations between steps.

```
┌─────────────────────────────────────────────────────────┐
│ Login Component                                         │
│                                                         │
│  ┌───────────────────────────────────────────────────┐  │
│  │ Enrollment Modal (show2FASetup === true)           │  │
│  │                                                   │  │
│  │  ┌─────────────────────────────────────────────┐  │  │
│  │  │ Step Progress Indicator                     │  │  │
│  │  │ (step 2/3 when setupStep=1,               │  │  │
│  │  │  step 3/3 when setupStep=2)               │  │  │
│  │  └─────────────────────────────────────────────┘  │  │
│  │                                                   │  │
│  │  ┌───────────────┐    ┌──────────────────────┐   │  │
│  │  │ QR_Display    │    │ Code_Entry_Step      │   │  │
│  │  │ (setupStep=1) │◄──►│ (setupStep=2)        │   │  │
│  │  │               │    │                      │   │  │
│  │  │ • QR image    │    │ • 6-digit input      │   │  │
│  │  │ • Backup codes│    │ • Verify button      │   │  │
│  │  │ • Next button │    │ • Back button        │   │  │
│  │  │ • Cancel btn  │    │ • Cancel button      │   │  │
│  │  └───────────────┘    └──────────────────────┘   │  │
│  │                                                   │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

## Components

### Modified: `Login` Component (`apps/web/src/components/Login.tsx`)

The only component modified. The 2FA enrollment modal section gains:

1. A new `setupStep` state variable (`1 | 2`)
2. Conditional rendering inside the existing `show2FASetup` block
3. `AnimatePresence` with `mode="wait"` wrapping step content for animated transitions
4. Navigation handlers for "Next" and "Back" actions

No new sub-components are introduced because the modal is self-contained and the step content is already defined inline. Extracting to separate components would add indirection without meaningful reusability benefit.

## Interfaces & State

### New State Variable

```typescript
const [setupStep, setSetupStep] = useState<1 | 2>(1);
```

### State Initialization

When `show2FASetup` becomes `true` (triggered by the login response handler for `requires2FASetup`), `setupStep` is initialized to `1`. This is accomplished by calling `setSetupStep(1)` in the same block that sets `setShow2FASetup(true)`.

### Navigation Handlers

```typescript
// Advance from QR display to code entry
const handleSetupNext = () => {
  setSetupStep(2);
};

// Return from code entry to QR display
const handleSetupBack = () => {
  setSetupStep(1);
  setSetupCode('');   // Clear the code input
  setSetupError('');  // Clear any verification error
};
```

### Cancel Handler (unchanged behavior, both steps)

The existing cancel handler already resets all 2FA setup state. It additionally resets `setupStep`:

```typescript
const handleSetupCancel = () => {
  setShow2FASetup(false);
  setSetupStep(1);
  setSetupCode('');
  setTwoFATempToken(null);
  setSetupError('');
  setSetupQr(null);
  setSetupBackupCodes([]);
};
```

## Data Flow

```
Login Response (requires2FASetup=true)
  │
  ▼
setShow2FASetup(true) + setSetupStep(1)
  │
  ▼
┌─────────────────────────────┐
│ Step 1: QR_Display_Step     │
│ Renders: QR image, backup   │
│ codes, Next button, Cancel  │
└──────────────┬──────────────┘
               │ Next clicked
               ▼
┌─────────────────────────────┐
│ Step 2: Code_Entry_Step     │
│ Renders: code input, Verify │
│ button, Back button, Cancel │
└──────────────┬──────────────┘
               │
      ┌────────┼────────┐
      │        │        │
   Back     Cancel    Verify
      │        │        │
      ▼        ▼        ▼
  Step 1    Close    handle2FASetupComplete()
  (clear    (reset   (existing submit logic)
  code/err)  all)
```

## Step Progress Indicator Mapping

The overall login flow has 3 phases visible to the user:
1. **Credentials** (already complete when the modal appears)
2. **QR scan / setup** → maps to `setupStep === 1`
3. **Code verification** → maps to `setupStep === 2`

```typescript
// Inside the enrollment modal
const progressStep = setupStep === 1 ? 2 : 3;
const progressTotal = 3;
```

The indicator renders filled dots for completed steps, a filled dot for the current step, and an unfilled dot for upcoming steps. The `aria-label` is:
```typescript
t('auth.twoFAStep', { current: progressStep, total: progressTotal })
```

## Animation Strategy

Use `AnimatePresence` with `mode="wait"` to animate step transitions:

```typescript
import { motion, AnimatePresence } from 'motion/react';

// Direction-aware slide animation
const slideDirection = language === Language.AR ? -1 : 1;

<AnimatePresence mode="wait">
  {setupStep === 1 ? (
    <motion.div
      key="qr-step"
      initial={{ opacity: 0, x: -20 * slideDirection }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 * slideDirection }}
      transition={{ duration: 0.2 }}
    >
      {/* QR Display Step content */}
    </motion.div>
  ) : (
    <motion.div
      key="code-step"
      initial={{ opacity: 0, x: 20 * slideDirection }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 * slideDirection }}
      transition={{ duration: 0.2 }}
    >
      {/* Code Entry Step content */}
    </motion.div>
  )}
</AnimatePresence>
```

The slide direction is inverted in RTL mode so forward navigation always slides content in the reading direction.

## RTL Support

The enrollment modal already sets `dir={language === Language.AR ? 'rtl' : 'ltr'}` on the container. The refactored code preserves this. Tailwind's `rtl:` variants and logical properties (`ms-`, `me-`) are used where directional spacing applies.

## Error Handling

- **Verification errors** (`setupError`) are displayed only on the Code_Entry_Step (step 2).
- Navigating **back** clears `setupError` so the user returns to a clean QR view.
- Navigating **forward** again shows step 2 without any stale error.
- The **cancel** handler resets all error state regardless of which step is active.

## Accessibility

- The step progress indicator retains `role="status"` and an `aria-label` with current/total step numbers.
- The "Next" and "Back" buttons use semantic `<button>` elements with visible text labels.
- The code input on step 2 retains `aria-label`, `inputMode="numeric"`, and `autoComplete="one-time-code"`.
- Focus is managed: when transitioning to step 2, the code input receives programmatic focus via the existing `useEffect` pattern (but keyed on `setupStep === 2` instead of just `show2FA`).

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Initial step is always QR display

*For any* set of login response data that triggers forced 2FA enrollment (any QR code URL, any set of backup codes), the enrollment modal SHALL initialize with `setupStep` equal to 1 (QR_Display_Step).

**Validates: Requirements 1.1**

### Property 2: Step content mutual exclusivity

*For any* value of `setupStep`, if `setupStep === 1` then the QR code image and backup codes are rendered and the verification code input is absent; if `setupStep === 2` then the verification code input is rendered and the QR code image and backup codes are absent.

**Validates: Requirements 1.2, 1.3, 2.2, 2.3**

### Property 3: Forward navigation advances step

*For any* state where `setupStep === 1`, activating the "Next" action SHALL result in `setupStep` becoming 2.

**Validates: Requirements 2.1**

### Property 4: Backward navigation returns to QR step and clears transient input

*For any* state where `setupStep === 2` with any partially-entered verification code and any error message, activating the "Back" action SHALL result in `setupStep` becoming 1, `setupCode` becoming empty, and `setupError` becoming empty — while preserving `setupQr` and `setupBackupCodes` unchanged.

**Validates: Requirements 3.2, 3.3, 3.4, 8.2, 8.3**

### Property 5: Cancel resets all setup state from any step

*For any* `setupStep` value (1 or 2) and any combination of `setupQr`, `setupBackupCodes`, `setupCode`, `twoFATempToken`, and `setupError` values, activating the "Cancel" action SHALL set `show2FASetup` to false and reset all 2FA setup state to default values (null/empty).

**Validates: Requirements 4.2, 4.3, 5.2, 5.3**

### Property 6: RTL direction matches language setting

*For any* active language setting, the enrollment modal's `dir` attribute SHALL be `'rtl'` when the language is Arabic and `'ltr'` otherwise.

**Validates: Requirements 7.2**

### Property 7: Error visibility is scoped to Code_Entry_Step

*For any* non-empty `setupError` value, the error message is rendered only when `setupStep === 2`. When `setupStep === 1`, no error message is displayed regardless of `setupError` value.

**Validates: Requirements 8.1**

### Property 8: Step progress indicator reflects current step

*For any* value of `setupStep`, the Step_Progress_Indicator SHALL display step `setupStep + 1` of 3 and provide an accessible label containing both the current step number and total.

**Validates: Requirements 6.1, 6.2, 6.3**
