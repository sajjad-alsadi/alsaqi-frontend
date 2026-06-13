// @vitest-environment jsdom
/**
 * RTL focus-order verification (Stream 5, task 5.4).
 *
 * Renders a representative key screen (the login screen) in `dir="rtl"` and
 * verifies the keyboard-accessibility guarantees of Requirement 5.4:
 *
 *  1. **Focus order matches the visual reading order** (right-to-left,
 *     top-to-bottom). jsdom performs no layout, so visual coordinates are not
 *     available; instead we rely on the platform contract that — in the absence
 *     of positive `tabindex` — the tab sequence follows DOM source order, and
 *     that with `dir="rtl"` plus CSS logical properties (`ps-*`/`pe-*`,
 *     `start`/`end`) the DOM source order *is* the right-to-left reading order.
 *     We therefore assert the computed tab order equals DOM source order.
 *  2. **No element uses a positive `tabindex`** (which would override the
 *     reading order and is the most common RTL focus-order defect).
 *  3. **No keyboard trap**: every focusable element can both receive and release
 *     focus, and a `Tab` keydown on any focusable element is never
 *     `preventDefault`-ed (a JS focus trap would intercept and cancel it).
 *
 * @see Requirement 5.4
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// AuthProvider/AppContext reach for the raw HTTP client and the i18n instance on
// mount; mock both so the login screen renders deterministically with no network
// or real i18next initialization (mirrors the proven context-test pattern).
vi.mock('../../api/httpClient', () => ({
  default: {
    get: vi.fn().mockRejectedValue(new Error('mock')),
    post: vi.fn().mockResolvedValue({ data: {} }),
    put: vi.fn().mockResolvedValue({ data: {} }),
    patch: vi.fn().mockResolvedValue({ data: {} }),
    delete: vi.fn().mockResolvedValue({ data: {} }),
  },
}));

vi.mock('../../i18n', () => ({
  default: {
    changeLanguage: vi.fn(),
    language: 'ar',
    use: vi.fn().mockReturnThis(),
    init: vi.fn().mockReturnThis(),
    on: vi.fn(),
    t: (key: string) => key,
  },
}));

import { UserProvider } from '../../context/UserContext';
import { AuthProvider } from '../../context/AuthContext';
import { PreferencesProvider } from '../../context/PreferencesContext';
import { AppProvider } from '../../context/AppContext';
import Login from '../../components/Login';

/**
 * Selector for elements that are candidates for keyboard focus. Native
 * interactive elements plus anything carrying an explicit `tabindex`.
 */
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]',
].join(',');

/** True when `el` participates in sequential keyboard navigation. */
function isTabbable(el: Element): boolean {
  const tabindexAttr = el.getAttribute('tabindex');
  const tabindex = tabindexAttr === null ? null : Number(tabindexAttr);
  // tabindex="-1" is focusable programmatically but not via Tab.
  if (tabindex !== null && tabindex < 0) return false;
  if (el.getAttribute('aria-hidden') === 'true') return false;
  if (el instanceof HTMLInputElement && el.type === 'hidden') return false;
  if ((el as HTMLButtonElement | HTMLInputElement).disabled) return false;
  return true;
}

/** Focusable elements within `container`, in DOM source order. */
function focusablesInDomOrder(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(isTabbable);
}

/**
 * Compute the sequential tab order the platform would produce: elements with a
 * positive `tabindex` first (ascending `tabindex`, ties broken by DOM order),
 * then elements with `tabindex` 0 / native focusability in DOM order. With no
 * positive `tabindex` present this is exactly DOM source order.
 */
function computeTabOrder(elements: HTMLElement[]): HTMLElement[] {
  return elements
    .map((el, domIndex) => {
      const attr = el.getAttribute('tabindex');
      const tabindex = attr === null ? 0 : Number(attr);
      return { el, domIndex, tabindex };
    })
    .sort((a, b) => {
      const aPos = a.tabindex > 0;
      const bPos = b.tabindex > 0;
      if (aPos && bPos && a.tabindex !== b.tabindex) return a.tabindex - b.tabindex;
      if (aPos !== bPos) return aPos ? -1 : 1; // positive tabindex group leads
      return a.domIndex - b.domIndex; // stable DOM order otherwise
    })
    .map((entry) => entry.el);
}

function renderLoginRtl(): HTMLElement {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const { container } = render(
    <QueryClientProvider client={queryClient}>
      <UserProvider>
        <AuthProvider>
          <PreferencesProvider>
            <AppProvider>
              <Login />
            </AppProvider>
          </PreferencesProvider>
        </AuthProvider>
      </UserProvider>
    </QueryClientProvider>
  );
  return container;
}

describe('RTL focus order on the login screen (Req 5.4)', () => {
  beforeEach(() => {
    cleanup();
    // PreferencesContext seeds `language` from `audit_lang`; force Arabic so the
    // screen renders right-to-left.
    localStorage.getItem = vi.fn((key: string) => {
      if (key === 'audit_lang' || key === 'i18nextLng') return 'ar';
      if (key === 'audit_theme') return 'light';
      if (key === 'audit_layout') return 'standard';
      return null;
    });
  });

  it('renders the screen in right-to-left direction', () => {
    const container = renderLoginRtl();
    expect(container.querySelector('[dir="rtl"]')).not.toBeNull();
  });

  it('uses no positive tabindex anywhere on the screen', () => {
    const container = renderLoginRtl();
    const offenders = Array.from(container.querySelectorAll('[tabindex]')).filter((el) => {
      const value = Number(el.getAttribute('tabindex'));
      return Number.isFinite(value) && value > 0;
    });
    expect(offenders).toEqual([]);
  });

  it('focus order follows the right-to-left reading (DOM source) order', () => {
    const container = renderLoginRtl();
    const domOrder = focusablesInDomOrder(container);
    expect(domOrder.length).toBeGreaterThan(0);

    // With no positive tabindex, the platform tab order equals DOM source order,
    // which under dir="rtl" + logical CSS is the right-to-left reading order.
    const tabOrder = computeTabOrder(domOrder);
    expect(tabOrder).toEqual(domOrder);
  });

  it('every focusable element can receive focus and the sequence progresses (no dead stops)', () => {
    const container = renderLoginRtl();
    const tabOrder = computeTabOrder(focusablesInDomOrder(container));

    const visited: HTMLElement[] = [];
    for (const el of tabOrder) {
      el.focus();
      expect(document.activeElement).toBe(el);
      visited.push(document.activeElement as HTMLElement);
    }

    // Focus reached every element in order and each step advanced to a distinct
    // element — the sequence never stalls on one control.
    expect(visited).toEqual(tabOrder);
    expect(new Set(visited).size).toBe(tabOrder.length);
  });

  it('has no keyboard trap: focus can leave any element and Tab is never cancelled', () => {
    const container = renderLoginRtl();
    const tabOrder = computeTabOrder(focusablesInDomOrder(container));

    for (let i = 0; i < tabOrder.length; i++) {
      const el = tabOrder[i];
      el.focus();
      expect(document.activeElement).toBe(el);

      // A JS focus trap intercepts Tab and calls preventDefault to keep focus on
      // the element. fireEvent returns false iff a handler cancelled the event.
      const notCancelled = fireEvent.keyDown(el, { key: 'Tab', code: 'Tab' });
      expect(notCancelled).toBe(true);

      // Focus is releasable: moving to a neighbouring element succeeds.
      const next = tabOrder[(i + 1) % tabOrder.length];
      next.focus();
      expect(document.activeElement).toBe(next);
    }
  });
});
