// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fc from 'fast-check';
import { DOMGuard } from '../DOMGuard';

/**
 * Property Test: DOMGuard removes all dangerous elements (Property 10)
 *
 * Feature: comprehensive-testing
 * Property 10: DOMGuard يزيل جميع العناصر الخطرة
 *
 * **Validates: Requirements 18.2**
 *
 * For any HTML content containing <script>, <iframe>, or event handlers
 * (onclick, onerror, onload, onmouseover), DOMGuard must remove or neutralize them.
 * Safe text content must be preserved.
 */

// ─── Custom Arbitraries ──────────────────────────────────────────────────────

/** Generates dangerous attribute names that DOMGuard blocks */
const dangerousAttributeArb = fc.constantFrom('onerror', 'onload', 'onclick', 'onmouseover');

/** Generates safe text content */
const safeTextArb = fc
  .string({ minLength: 1, maxLength: 100 })
  .filter((s) => s.trim().length > 0 && !/<|>/.test(s));

/** Generates safe tag names that DOMGuard should not interfere with */
const safeTagArb = fc.constantFrom('div', 'span', 'p', 'strong', 'em', 'h1', 'h2', 'ul', 'li');

/** Generates JavaScript payloads for event handlers (safe for jsdom - won't throw ReferenceErrors) */
const jsPayloadArb = fc.constantFrom(
  'void 0',
  'void "xss"',
  'void "steal"',
  'void "hack"',
  'void "evil"'
);

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Waits for MutationObserver to process pending mutations.
 * MutationObserver callbacks are microtasks, so we flush them.
 */
async function flushMutationObserver(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Property 10: DOMGuard removes all dangerous elements', () => {
  let guard: DOMGuard;

  beforeEach(() => {
    // Reset the global flag so DOMGuard can initialize
    (window as any).__domGuardInitialized = false;
    // Suppress console warnings/errors from DOMGuard
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    // Mock fetch to prevent actual network calls from handleThreat
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.resolve(new Response()));
    guard = new DOMGuard();
  });

  afterEach(() => {
    guard.destroy();
    // Clean up any elements added during tests
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('removes dangerous attributes (onclick, onerror, onload, onmouseover) from any element', async () => {
    await fc.assert(
      fc.asyncProperty(
        dangerousAttributeArb,
        safeTagArb,
        jsPayloadArb,
        async (attrName, tagName, payload) => {
          // Create an element with a dangerous attribute
          const element = document.createElement(tagName);
          element.setAttribute(attrName, payload);
          element.textContent = 'safe content';

          // Add to DOM - this triggers MutationObserver for attribute changes
          document.body.appendChild(element);

          // Now set the attribute again to trigger attribute mutation
          // (The initial add triggers childList, attribute check happens on attribute mutations)
          element.setAttribute(attrName, payload);

          await flushMutationObserver();

          // DOMGuard should have removed the dangerous attribute
          expect(element.hasAttribute(attrName)).toBe(false);

          // Safe text content should be preserved
          expect(element.textContent).toBe('safe content');

          // Cleanup
          element.remove();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('detects injected script elements as threats', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(
          'void 0',
          'void "xss"',
          'void "document.cookie"',
          'void "steal-data"',
          'void "eval-payload"'
        ),
        async (scriptContent) => {
          const script = document.createElement('script');
          script.textContent = scriptContent;

          document.body.appendChild(script);
          await flushMutationObserver();

          // DOMGuard should have detected the script as a threat
          // (console.warn is called with '[Security] Suspicious script detected:')
          expect(console.warn).toHaveBeenCalled();

          // Cleanup
          script.remove();
        }
      ),
      { numRuns: 20 }
    );
  });

  it('detects hidden iframes as threats', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(
          'https://evil.example.com/phish',
          'https://attacker.example.io/keylogger',
          'https://malware.example.net/payload',
          'https://phishing.example.org/fake-login'
        ),
        fc.constantFrom('none', 'hidden', '0'),
        async (src, hideMethod) => {
          const iframe = document.createElement('iframe');
          iframe.src = src;

          // Apply hiding technique
          if (hideMethod === 'none') {
            iframe.style.display = 'none';
          } else if (hideMethod === 'hidden') {
            iframe.style.visibility = 'hidden';
          } else {
            iframe.style.opacity = '0';
          }

          document.body.appendChild(iframe);
          await flushMutationObserver();

          // DOMGuard should detect hidden iframe as a threat
          expect(console.warn).toHaveBeenCalled();

          // Cleanup
          iframe.remove();
        }
      ),
      { numRuns: 20 }
    );
  });

  it('preserves safe text content in normal elements', async () => {
    await fc.assert(
      fc.asyncProperty(safeTagArb, safeTextArb, async (tagName, textContent) => {
        const element = document.createElement(tagName);
        element.textContent = textContent;

        document.body.appendChild(element);
        await flushMutationObserver();

        // Safe content should remain intact
        expect(element.textContent).toBe(textContent);
        // Element should still be in the DOM
        expect(document.body.contains(element)).toBe(true);

        // Cleanup
        element.remove();
      }),
      { numRuns: 100 }
    );
  });

  it('removes multiple dangerous attributes from the same element', async () => {
    await fc.assert(
      fc.asyncProperty(
        safeTagArb,
        fc.uniqueArray(dangerousAttributeArb, { minLength: 2, maxLength: 4 }),
        async (tagName, attrs) => {
          const element = document.createElement(tagName);
          element.textContent = 'preserved text';
          document.body.appendChild(element);

          // Set each dangerous attribute (triggers attribute mutation)
          for (const attr of attrs) {
            element.setAttribute(attr, 'malicious()');
            await flushMutationObserver();
          }

          // All dangerous attributes should be removed
          for (const attr of attrs) {
            expect(element.hasAttribute(attr)).toBe(false);
          }

          // Text content should be preserved
          expect(element.textContent).toBe('preserved text');

          // Cleanup
          element.remove();
        }
      ),
      { numRuns: 50 }
    );
  });
});
