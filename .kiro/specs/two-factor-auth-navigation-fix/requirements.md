# Requirements Document

## Introduction

The 2FA enrollment flow in the Login component currently presents the QR code, backup codes, and the verification code input all in a single view. Users cannot navigate back to re-view the QR code once they begin entering a verification code. This feature splits the enrollment modal into two distinct internal steps with proper forward and backward navigation, allowing users to return to the QR display from the code entry step.

## Glossary

- **Enrollment_Modal**: The modal dialog displayed during forced two-factor authentication setup within the Login component (`apps/web/src/components/Login.tsx`).
- **Step_State**: An internal state variable (e.g., `setupStep: 1 | 2`) that tracks which view within the Enrollment_Modal is currently active.
- **QR_Display_Step**: Step 1 of the enrollment flow — shows the QR code image, backup codes, and a "Next" button to advance. No code input field is present.
- **Code_Entry_Step**: Step 2 of the enrollment flow — shows only the 6-digit verification code input along with navigation controls.
- **Step_Progress_Indicator**: The visual bar at the top of the Enrollment_Modal that communicates which step of the overall login flow the user is on (credentials → QR → code verification).
- **Back_Button**: A button on the Code_Entry_Step that navigates the user back to the QR_Display_Step without dismissing the modal.
- **Cancel_Button**: A button that fully dismisses the enrollment flow, resetting all 2FA setup state.

## Requirements

### Requirement 1

**User Story:** As a user being enrolled in 2FA, I want the QR code and backup codes displayed on a dedicated step without the code input field, so that I can focus on scanning the QR code without distraction.

#### Acceptance Criteria

1. WHEN the Enrollment_Modal becomes visible, THE Enrollment_Modal SHALL display the QR_Display_Step as the initial view.
2. WHILE the QR_Display_Step is active, THE Enrollment_Modal SHALL display the QR code image and backup codes.
3. WHILE the QR_Display_Step is active, THE Enrollment_Modal SHALL NOT display the 6-digit verification code input field.
4. WHILE the QR_Display_Step is active, THE Enrollment_Modal SHALL display a "Next" button that advances the user to the Code_Entry_Step.

### Requirement 2

**User Story:** As a user being enrolled in 2FA, I want a dedicated code entry step that only shows the verification input, so that I have a clear, focused interface for entering my authenticator code.

#### Acceptance Criteria

1. WHEN the user activates the "Next" button on the QR_Display_Step, THE Enrollment_Modal SHALL transition to the Code_Entry_Step.
2. WHILE the Code_Entry_Step is active, THE Enrollment_Modal SHALL display the 6-digit verification code input field.
3. WHILE the Code_Entry_Step is active, THE Enrollment_Modal SHALL NOT display the QR code image or backup codes.
4. WHILE the Code_Entry_Step is active, THE Enrollment_Modal SHALL display a "Verify" submit button that triggers 2FA setup completion.

### Requirement 3

**User Story:** As a user on the code entry step, I want a Back button so that I can return to view the QR code again if I need to re-scan it.

#### Acceptance Criteria

1. WHILE the Code_Entry_Step is active, THE Enrollment_Modal SHALL display a Back_Button.
2. WHEN the user activates the Back_Button, THE Enrollment_Modal SHALL transition to the QR_Display_Step.
3. WHEN the user activates the Back_Button, THE Enrollment_Modal SHALL preserve all previously loaded QR code and backup code data.
4. WHEN the user activates the Back_Button, THE Enrollment_Modal SHALL clear the verification code input field.

### Requirement 4

**User Story:** As a user on the code entry step, I want a Cancel button so that I can dismiss the entire enrollment flow if I decide not to proceed.

#### Acceptance Criteria

1. WHILE the Code_Entry_Step is active, THE Enrollment_Modal SHALL display a Cancel_Button.
2. WHEN the user activates the Cancel_Button, THE Enrollment_Modal SHALL dismiss the enrollment flow entirely.
3. WHEN the user activates the Cancel_Button, THE Enrollment_Modal SHALL reset all 2FA setup state including the QR code, backup codes, verification code input, temporary token, and error messages.

### Requirement 5

**User Story:** As a user on the QR display step, I want a Cancel button so that I can dismiss the enrollment flow before advancing to code entry.

#### Acceptance Criteria

1. WHILE the QR_Display_Step is active, THE Enrollment_Modal SHALL display a Cancel_Button.
2. WHEN the user activates the Cancel_Button on the QR_Display_Step, THE Enrollment_Modal SHALL dismiss the enrollment flow entirely.
3. WHEN the user activates the Cancel_Button on the QR_Display_Step, THE Enrollment_Modal SHALL reset all 2FA setup state.

### Requirement 6

**User Story:** As a user progressing through 2FA enrollment, I want the step progress indicator to reflect my current position within the enrollment sub-steps, so that I understand where I am in the overall flow.

#### Acceptance Criteria

1. WHILE the QR_Display_Step is active, THE Step_Progress_Indicator SHALL indicate step 2 of 3 (credentials complete, QR active, code upcoming).
2. WHILE the Code_Entry_Step is active, THE Step_Progress_Indicator SHALL indicate step 3 of 3 (credentials complete, QR complete, code active).
3. THE Step_Progress_Indicator SHALL provide an accessible label conveying the current step number and total steps.

### Requirement 7

**User Story:** As a user navigating between steps, I want smooth visual transitions, so that the interface feels polished and responsive.

#### Acceptance Criteria

1. WHEN the Enrollment_Modal transitions between the QR_Display_Step and the Code_Entry_Step, THE Enrollment_Modal SHALL animate the transition using framer-motion.
2. THE Enrollment_Modal SHALL support both LTR and RTL text direction based on the active language setting.

### Requirement 8

**User Story:** As a user who encounters an error during verification, I want to see the error only on the code entry step, so that error context is preserved when I navigate back and return.

#### Acceptance Criteria

1. IF a verification error occurs on the Code_Entry_Step, THEN THE Enrollment_Modal SHALL display the error message on the Code_Entry_Step.
2. WHEN the user navigates back to the QR_Display_Step after a verification error, THE Enrollment_Modal SHALL clear the error message.
3. WHEN the user returns to the Code_Entry_Step from the QR_Display_Step, THE Enrollment_Modal SHALL display the Code_Entry_Step without any previous error message.
