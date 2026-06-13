// @vitest-environment jsdom
/**
 * Smoke tests for the A11y audit harness (Stream 5, task 5.1).
 *
 * These validate the harness machinery itself — that `audit` renders, runs axe,
 * returns a well-formed result, scopes/cleans up the DOM, and reflects the
 * requested direction — without making screen-specific zero-violation
 * assertions (those belong to task 5.3).
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { audit, coveredScreens, createA11yAudit } from './axe';

describe('A11y audit harness', () => {
  it('exposes the covered-screens list', () => {
    expect(coveredScreens).toEqual(['login', 'dashboard', 'audit-plan', 'finding', 'correspondence']);
  });

  it('returns axe results with a violations array for an accessible element', async () => {
    const results = await audit(
      React.createElement('main', null, React.createElement('h1', null, 'Hello')),
    );
    expect(Array.isArray(results.violations)).toBe(true);
    expect(results.violations).toEqual([]);
  });

  it('detects violations on an inaccessible element', async () => {
    // An input with neither a label nor an accessible name violates WCAG 2.1 AA.
    const results = await audit(React.createElement('input', { type: 'text' }));
    expect(results.violations.length).toBeGreaterThan(0);
  });

  it('renders in the requested direction and restores the document afterwards', async () => {
    const before = document.documentElement.getAttribute('dir');
    await audit(React.createElement('main', null, React.createElement('h1', null, 'مرحبا')), {
      dir: 'rtl',
    });
    // The temporary container is removed and the document direction restored.
    expect(document.documentElement.getAttribute('dir')).toBe(before);
    expect(document.body.querySelector('div[dir="rtl"]')).toBeNull();
  });

  it('factory binds the audit runner and covered screens', () => {
    const a11y = createA11yAudit();
    expect(a11y.audit).toBe(audit);
    expect(a11y.coveredScreens).toBe(coveredScreens);
  });
});
