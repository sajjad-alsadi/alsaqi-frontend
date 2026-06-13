/**
 * Accessibility audit harness (Stream 5).
 *
 * This module is the single entry point for the `vitest-axe`-based accessibility
 * suite. It exposes the {@link A11yAudit} surface used to render a key screen in a
 * given text direction and run axe against it, plus the {@link coveredScreens}
 * list naming the screens that must pass with zero violations.
 *
 * Task 5.1 establishes this harness (the public interface + the `audit` runner +
 * the `coveredScreens` list). The per-screen zero-violation assertions in both
 * directions (task 5.3) and the RTL focus-order checks (task 5.4) are layered onto
 * this surface by later tasks in the stream.
 *
 * The audit runs axe scoped to WCAG 2.1 Level A and Level AA rules across all
 * impact levels (Requirement 5.1) and renders the screen inside a container whose
 * `dir`/`lang` reflect the requested direction (`rtl`/`ar` or `ltr`/`en`) so that
 * direction-sensitive rules are evaluated correctly.
 *
 * @module test/a11y/axe
 */
import type { ReactElement } from 'react';
import { render } from '@testing-library/react';
import { axe } from 'vitest-axe';
import type { AxeResults, RunOptions } from 'axe-core';

// ─── Covered screens ──────────────────────────────────────────────────────────

/**
 * The key screens that must pass the A11y audit with zero violations in both
 * text directions.
 *
 * @see Requirement 5.3
 */
export const coveredScreens = ['login', 'dashboard', 'audit-plan', 'finding', 'correspondence'] as const;

/** A screen name covered by the A11y audit. */
export type CoveredScreen = (typeof coveredScreens)[number];

// ─── Audit options ─────────────────────────────────────────────────────────────

/** Text directions exercised by the audit. */
export type TextDirection = 'rtl' | 'ltr';

/** Options accepted by {@link A11yAudit.audit}. */
export interface AuditOptions {
  /** Text direction to render the screen in. Defaults to `'ltr'`. */
  dir: TextDirection;
}

/**
 * Map a text direction to the language code it represents in this application
 * (`rtl` ⇒ Arabic, `ltr` ⇒ English). Mirrors the direction/language pairing the
 * app applies to `document.dir` / `document.lang` on language switch.
 *
 * @see Requirement 5.1
 */
const LANG_FOR_DIR: Record<TextDirection, string> = {
  rtl: 'ar',
  ltr: 'en',
};

/**
 * axe run options scoping the analysis to WCAG 2.1 Level A and Level AA rules
 * across all impact levels.
 *
 * @see Requirement 5.1
 */
const WCAG_21_AA_OPTIONS: RunOptions = {
  runOnly: {
    type: 'tag',
    values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'],
  },
};

// ─── Public audit surface ───────────────────────────────────────────────────────

/**
 * The accessibility audit surface used by the A11y test-suite.
 *
 * @see Requirements 5.1, 5.3
 */
export interface A11yAudit {
  /**
   * Render a screen in the requested text direction and run axe against it,
   * returning the raw axe results (including any `violations`). The screen is
   * rendered inside a container whose `dir`/`lang` reflect the direction so that
   * direction-sensitive rules are evaluated; the container is removed before this
   * resolves so successive audits do not leak DOM into one another.
   */
  audit(screen: ReactElement, opts?: AuditOptions): Promise<AxeResults>;

  /** Screens that must pass with zero violations. */
  readonly coveredScreens: ReadonlyArray<CoveredScreen>;
}

/**
 * Render `screen` in the requested direction and run axe against it.
 *
 * Preconditions: invoked in a DOM environment (jsdom under Vitest).
 * Postconditions: returns the axe results for the rendered screen; the temporary
 * render container is removed and the previous `document` direction/language are
 * restored before this resolves.
 *
 * @param screen - the screen element to audit.
 * @param opts - audit options; `dir` defaults to `'ltr'`.
 * @see Requirements 5.1, 5.3
 */
export async function audit(screen: ReactElement, opts?: AuditOptions): Promise<AxeResults> {
  const dir: TextDirection = opts?.dir ?? 'ltr';
  const lang = LANG_FOR_DIR[dir];

  // Preserve and restore the document-level direction/language so an audit never
  // bleeds state into unrelated tests sharing the jsdom document.
  const previousDir = document.documentElement.getAttribute('dir');
  const previousLang = document.documentElement.getAttribute('lang');
  document.documentElement.setAttribute('dir', dir);
  document.documentElement.setAttribute('lang', lang);

  // Render into a dedicated, direction-scoped container appended to the document
  // so axe analyses the screen in the requested direction.
  const container = document.createElement('div');
  container.setAttribute('dir', dir);
  container.setAttribute('lang', lang);
  document.body.appendChild(container);

  const { unmount } = render(screen, { container });

  try {
    return await axe(container, WCAG_21_AA_OPTIONS);
  } finally {
    unmount();
    container.remove();
    restoreAttribute(document.documentElement, 'dir', previousDir);
    restoreAttribute(document.documentElement, 'lang', previousLang);
  }
}

function restoreAttribute(element: Element, name: string, previous: string | null): void {
  if (previous === null) {
    element.removeAttribute(name);
  } else {
    element.setAttribute(name, previous);
  }
}

// ─── Factory ────────────────────────────────────────────────────────────────────

/**
 * Create an {@link A11yAudit} bound to the {@link audit} runner and the
 * {@link coveredScreens} list.
 */
export function createA11yAudit(): A11yAudit {
  return {
    audit,
    coveredScreens,
  };
}
