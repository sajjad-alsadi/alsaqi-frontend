# Bugfix Requirements Document

## Introduction

عند فتح نافذة الإضافة (Add Modal) في مصفوفة الامتثال (Compliance Matrix) والكتابة في أي حقل إدخال، ينتقل التركيز (focus) تلقائياً إلى حقل آخر بعد كتابة حرف واحد فقط. هذا يجعل من المستحيل إدخال نص كامل في أي حقل داخل نموذج الإضافة. المشكلة تظهر تحديداً عند فتح قائمة الإضافة (وليس عند التعديل أو العرض).

السبب الجذري: مكوّن `FocusTrap` يحتوي على `useEffect` يعتمد على `handleKeyDown`، والذي بدوره يعتمد على `onEscape`. عند الكتابة في حقل، تتغير حالة النموذج (`formData`)، مما يُعيد تصيير المكوّن الأب، فيُنشئ مرجعاً جديداً لـ `onClose`، مما يُغيّر `onEscape` → `handleKeyDown` → يُعاد تشغيل `useEffect` → يُنقل التركيز إلى أول عنصر قابل للتركيز عبر `setTimeout` بمدة 50 مللي ثانية.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN a user types a character in any input field inside the Compliance Matrix Add modal THEN the system re-runs the FocusTrap useEffect and moves focus to the first focusable element after 50ms, causing focus to jump away from the current input

1.2 WHEN the parent component (ComplianceMatrixPage) re-renders due to formData state change while the Add modal is open THEN the system recreates the onClose function reference, which cascades through onEscape → handleKeyDown → useEffect re-execution, triggering an unwanted initial-focus routine

1.3 WHEN the FocusTrap useEffect dependencies (handleKeyDown) change while the trap is already active in the Add modal THEN the system incorrectly re-applies the initial focus logic (focusing the first focusable element) as if the trap was just activated

### Expected Behavior (Correct)

2.1 WHEN a user types a character in any input field inside the Compliance Matrix Add modal THEN the system SHALL maintain focus on the currently active input field without interruption

2.2 WHEN the parent component (ComplianceMatrixPage) re-renders due to formData state change while the Add modal is open THEN the system SHALL NOT re-run the initial focus logic of FocusTrap, as the trap is already active

2.3 WHEN the FocusTrap useEffect dependencies change while the trap is already active THEN the system SHALL only update the keydown event listener without re-applying the initial focus to the first focusable element

### Unchanged Behavior (Regression Prevention)

3.1 WHEN the modal is first opened (active transitions from false to true) THEN the system SHALL CONTINUE TO focus the first focusable element inside the FocusTrap after the animation delay

3.2 WHEN the user presses Escape while the modal is open THEN the system SHALL CONTINUE TO call the onEscape callback to close the modal

3.3 WHEN the user presses Tab on the last focusable element inside the modal THEN the system SHALL CONTINUE TO cycle focus back to the first focusable element (focus trapping)

3.4 WHEN the user presses Shift+Tab on the first focusable element inside the modal THEN the system SHALL CONTINUE TO cycle focus to the last focusable element (reverse focus trapping)

3.5 WHEN the modal is closed (active transitions from true to false) THEN the system SHALL CONTINUE TO restore focus to the element that was focused before the modal opened
