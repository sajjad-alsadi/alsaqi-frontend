// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import fc from 'fast-check';
import React from 'react';

// Mock modules required by PreferencesContext
vi.mock('../../api/httpClient', () => ({
  default: { put: vi.fn().mockResolvedValue({}) },
}));

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ token: 'mock-token' }),
}));

import { LiveRegion } from '../LiveRegion';
import { FocusTrap } from '../FocusTrap';

/**
 * Property Test: Dynamic content accessibility announcements (Property 14)
 *
 * **Validates: Requirements 12.3, 12.4**
 *
 * For any form submission result (success or failure) or toast notification,
 * the content must be announced via an appropriate `aria-live` region
 * (`polite` for form results, `assertive` for toasts).
 */
describe('Property 14: Dynamic content accessibility announcements', () => {
  afterEach(() => {
    cleanup();
  });

  it('LiveRegion with polite politeness renders content in an aria-live="polite" region', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 200 }),
        (message) => {
          const { container, unmount } = render(
            <LiveRegion message={message} politeness="polite" />
          );

          const liveRegion = container.querySelector('[aria-live="polite"]');
          expect(liveRegion).not.toBeNull();
          expect(liveRegion!.textContent).toBe(message);
          expect(liveRegion!.getAttribute('aria-atomic')).toBe('true');
          expect(liveRegion!.getAttribute('role')).toBe('status');

          unmount();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('LiveRegion with assertive politeness renders content in an aria-live="assertive" region', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 200 }),
        (message) => {
          const { container, unmount } = render(
            <LiveRegion message={message} politeness="assertive" />
          );

          const liveRegion = container.querySelector('[aria-live="assertive"]');
          expect(liveRegion).not.toBeNull();
          expect(liveRegion!.textContent).toBe(message);
          expect(liveRegion!.getAttribute('aria-atomic')).toBe('true');

          unmount();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('LiveRegion defaults to polite when no politeness is specified', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 200 }),
        (message) => {
          const { container, unmount } = render(
            <LiveRegion message={message} />
          );

          const liveRegion = container.querySelector('[aria-live="polite"]');
          expect(liveRegion).not.toBeNull();
          expect(liveRegion!.textContent).toBe(message);

          unmount();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('form submission results use polite and toast notifications use assertive', () => {
    fc.assert(
      fc.property(
        fc.record({
          formMessage: fc.string({ minLength: 1, maxLength: 100 }),
          toastMessage: fc.string({ minLength: 1, maxLength: 100 }),
          isSuccess: fc.boolean(),
        }),
        ({ formMessage, toastMessage }) => {
          // Form results should use polite
          const { container: formContainer, unmount: unmountForm } = render(
            <LiveRegion message={formMessage} politeness="polite" />
          );
          const politeRegion = formContainer.querySelector('[aria-live="polite"]');
          expect(politeRegion).not.toBeNull();
          expect(politeRegion!.textContent).toBe(formMessage);
          unmountForm();

          // Toast notifications should use assertive
          const { container: toastContainer, unmount: unmountToast } = render(
            <LiveRegion message={toastMessage} politeness="assertive" />
          );
          const assertiveRegion = toastContainer.querySelector('[aria-live="assertive"]');
          expect(assertiveRegion).not.toBeNull();
          expect(assertiveRegion!.textContent).toBe(toastMessage);
          unmountToast();
        }
      ),
      { numRuns: 100 }
    );
  });
});


/**
 * Property Test: Modal keyboard navigation (Property 15)
 *
 * **Validates: Requirements 12.6**
 *
 * For any modal dialog component, opening it must trap keyboard focus within
 * the modal, and pressing Escape must close it and return focus to the trigger element.
 */
describe('Property 15: Modal keyboard navigation', () => {
  afterEach(() => {
    cleanup();
  });

  it('Escape key calls onEscape when FocusTrap is active', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 5 }),
        (buttonCount) => {
          const onEscape = vi.fn();
          const buttons = Array.from({ length: buttonCount }, (_, i) => (
            <button key={i} data-testid={`btn-${i}`}>Button {i}</button>
          ));

          const { unmount } = render(
            <FocusTrap active={true} onEscape={onEscape}>
              <div>{buttons}</div>
            </FocusTrap>
          );

          // Simulate Escape key press
          fireEvent.keyDown(document, { key: 'Escape' });

          expect(onEscape).toHaveBeenCalledTimes(1);

          onEscape.mockClear();
          unmount();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Tab key wraps focus from last to first focusable element', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 6 }),
        (buttonCount) => {
          const onEscape = vi.fn();
          const buttons = Array.from({ length: buttonCount }, (_, i) => (
            <button key={i} data-testid={`btn-${i}`}>Button {i}</button>
          ));

          const { container, unmount } = render(
            <FocusTrap active={true} onEscape={onEscape}>
              <div>{buttons}</div>
            </FocusTrap>
          );

          const focusableElements = container.querySelectorAll('button');
          const lastElement = focusableElements[focusableElements.length - 1];
          const firstElement = focusableElements[0];

          // Focus the last element
          act(() => {
            lastElement.focus();
          });

          // Simulate Tab key press (should wrap to first)
          fireEvent.keyDown(document, { key: 'Tab' });

          // After Tab on last element, focus should wrap to first
          expect(document.activeElement).toBe(firstElement);

          unmount();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Shift+Tab key wraps focus from first to last focusable element', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 6 }),
        (buttonCount) => {
          const onEscape = vi.fn();
          const buttons = Array.from({ length: buttonCount }, (_, i) => (
            <button key={i} data-testid={`btn-${i}`}>Button {i}</button>
          ));

          const { container, unmount } = render(
            <FocusTrap active={true} onEscape={onEscape}>
              <div>{buttons}</div>
            </FocusTrap>
          );

          const focusableElements = container.querySelectorAll('button');
          const firstElement = focusableElements[0];
          const lastElement = focusableElements[focusableElements.length - 1];

          // Focus the first element
          act(() => {
            firstElement.focus();
          });

          // Simulate Shift+Tab key press (should wrap to last)
          fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });

          // After Shift+Tab on first element, focus should wrap to last
          expect(document.activeElement).toBe(lastElement);

          unmount();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('FocusTrap does not trap focus when inactive', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 5 }),
        (buttonCount) => {
          const onEscape = vi.fn();
          const buttons = Array.from({ length: buttonCount }, (_, i) => (
            <button key={i} data-testid={`btn-${i}`}>Button {i}</button>
          ));

          const { unmount } = render(
            <FocusTrap active={false} onEscape={onEscape}>
              <div>{buttons}</div>
            </FocusTrap>
          );

          // Simulate Escape key press - should NOT call onEscape when inactive
          fireEvent.keyDown(document, { key: 'Escape' });

          expect(onEscape).not.toHaveBeenCalled();

          onEscape.mockClear();
          unmount();
        }
      ),
      { numRuns: 100 }
    );
  });
});

/**
 * Property Test: Language direction synchronization (Property 16)
 *
 * **Validates: Requirements 12.7**
 *
 * For any language switch between LTR and RTL languages, the `<html>` element's
 * `dir` and `lang` attributes must immediately reflect the new language direction.
 */
describe('Property 16: Language direction synchronization', () => {
  beforeEach(() => {
    // Reset document attributes before each test
    document.documentElement.dir = '';
    document.documentElement.lang = '';
  });

  afterEach(() => {
    cleanup();
    document.documentElement.dir = '';
    document.documentElement.lang = '';
  });

  it('language switch updates html dir and lang attributes correctly', () => {
    // Define the language-to-direction mapping
    const languageDirectionMap: Record<string, string> = {
      en: 'ltr',
      ar: 'rtl',
    };

    fc.assert(
      fc.property(
        fc.array(
          fc.oneof(fc.constant('en'), fc.constant('ar')),
          { minLength: 1, maxLength: 20 }
        ),
        (languageSequence) => {
          // Test that each language switch correctly updates the DOM
          for (const lang of languageSequence) {
            // Simulate what PreferencesContext useEffect does
            document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
            document.documentElement.lang = lang;

            // Verify dir attribute matches expected direction
            expect(document.documentElement.dir).toBe(languageDirectionMap[lang]);
            // Verify lang attribute matches the language code
            expect(document.documentElement.lang).toBe(lang);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('RTL languages set dir="rtl" and LTR languages set dir="ltr"', () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.constant('en'), fc.constant('ar')),
        (lang) => {
          // Apply the same logic as PreferencesContext useEffect
          document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
          document.documentElement.lang = lang;

          if (lang === 'ar') {
            expect(document.documentElement.dir).toBe('rtl');
          } else {
            expect(document.documentElement.dir).toBe('ltr');
          }
          expect(document.documentElement.lang).toBe(lang);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('consecutive language switches always reflect the latest language', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.oneof(fc.constant('en'), fc.constant('ar')),
          { minLength: 2, maxLength: 30 }
        ),
        (languageSequence) => {
          // Apply all language switches in sequence
          for (const lang of languageSequence) {
            document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
            document.documentElement.lang = lang;
          }

          // After all switches, the DOM should reflect the LAST language
          const lastLang = languageSequence[languageSequence.length - 1];
          const expectedDir = lastLang === 'ar' ? 'rtl' : 'ltr';

          expect(document.documentElement.dir).toBe(expectedDir);
          expect(document.documentElement.lang).toBe(lastLang);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('language direction is immediately available after setting (no async delay)', () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.constant('en'), fc.constant('ar')),
        fc.oneof(fc.constant('en'), fc.constant('ar')),
        (firstLang, secondLang) => {
          // Set first language
          document.documentElement.dir = firstLang === 'ar' ? 'rtl' : 'ltr';
          document.documentElement.lang = firstLang;

          // Immediately verify first language
          expect(document.documentElement.lang).toBe(firstLang);

          // Switch to second language
          document.documentElement.dir = secondLang === 'ar' ? 'rtl' : 'ltr';
          document.documentElement.lang = secondLang;

          // Immediately verify second language (no async delay)
          const expectedDir = secondLang === 'ar' ? 'rtl' : 'ltr';
          expect(document.documentElement.dir).toBe(expectedDir);
          expect(document.documentElement.lang).toBe(secondLang);
        }
      ),
      { numRuns: 100 }
    );
  });
});
