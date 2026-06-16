// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DOMGuard, initDOMGuard } from '../DOMGuard';

/**
 * DOMGuard — new security posture (code-review-remediation, Requirement 11)
 *
 * NOTE: This file previously validated the OLD behavior (comprehensive-testing
 * spec, Property 10): a document-wide MutationObserver that stripped dangerous
 * attributes (onclick/onerror/onload/onmouseover) and flagged injected
 * <script>/<iframe> elements as threats.
 *
 * That behavior has been removed. DOMGuard is now a no-op shim: the browser
 * client is not a trust boundary, so document-wide DOM scrubbing provided no
 * real security while breaking legitimate DOM behavior and harming performance.
 * The Backend (server-side validation, output encoding, CSP) is the
 * authoritative enforcement boundary.
 *
 * These tests assert the NEW posture:
 *   - Req 11.2: DOMGuard registers no document-wide MutationObserver.
 *   - DOMGuard no longer strips attributes or mutates the DOM.
 *   - Injected <script>/<iframe> elements are left untouched (not "detected").
 *   - Public API (construction, config inspection, destroy) remains stable.
 */

describe('DOMGuard new posture: no document-wide observation or DOM scrubbing (Req 11.2, 11.3)', () => {
  let observeSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let guard: DOMGuard;

  beforeEach(() => {
    observeSpy = vi.spyOn(MutationObserver.prototype, 'observe');
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    guard = new DOMGuard({
      sensitiveSelectors: ['input[type="password"]'],
      blockedAttributes: ['onerror', 'onload', 'onclick', 'onmouseover'],
    });
  });

  afterEach(() => {
    guard.destroy();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('does not register a document-wide MutationObserver on construction or init', () => {
    // Construction in beforeEach plus the factory init must register nothing.
    initDOMGuard({ blockedAttributes: ['onerror'] });

    expect(observeSpy).not.toHaveBeenCalled();
  });

  it('does NOT strip dangerous attributes from elements (Backend is the enforcement boundary)', async () => {
    const element = document.createElement('div');
    element.setAttribute('onclick', 'void 0');
    element.textContent = 'safe content';
    document.body.appendChild(element);

    // Give any (hypothetical) observer callback a microtask/macrotask to run.
    await new Promise((resolve) => setTimeout(resolve, 0));

    // The dangerous attribute is intentionally left in place by the client.
    expect(element.hasAttribute('onclick')).toBe(true);
    expect(element.getAttribute('onclick')).toBe('void 0');
    expect(element.textContent).toBe('safe content');
  });

  it('does NOT remove or flag injected <script> elements as threats', async () => {
    const script = document.createElement('script');
    script.textContent = 'void 0';
    document.body.appendChild(script);

    await new Promise((resolve) => setTimeout(resolve, 0));

    // No detection/threat-reporting side effects.
    expect(warnSpy).not.toHaveBeenCalled();
    // The element is left untouched in the DOM.
    expect(document.body.contains(script)).toBe(true);
  });

  it('does NOT remove or flag injected <iframe> elements as threats', async () => {
    const iframe = document.createElement('iframe');
    iframe.src = 'https://example.com/embedded';
    iframe.style.display = 'none';
    document.body.appendChild(iframe);

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(warnSpy).not.toHaveBeenCalled();
    expect(document.body.contains(iframe)).toBe(true);
  });

  it('preserves safe text content in normal elements (no mutation)', async () => {
    const element = document.createElement('p');
    element.textContent = 'just some text';
    document.body.appendChild(element);

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(element.textContent).toBe('just some text');
    expect(document.body.contains(element)).toBe(true);
  });

  it('exposes configuration for inspection without activating monitoring', () => {
    expect(guard.getSensitiveSelectors()).toEqual(['input[type="password"]']);
    expect(guard.getBlockedAttributes()).toEqual([
      'onerror',
      'onload',
      'onclick',
      'onmouseover',
    ]);
  });

  it('destroy() is a safe no-op that registers nothing', () => {
    expect(() => guard.destroy()).not.toThrow();
    expect(observeSpy).not.toHaveBeenCalled();
  });
});
