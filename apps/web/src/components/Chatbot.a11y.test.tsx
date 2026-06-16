// @vitest-environment jsdom
/**
 * Accessibility tests for Chatbot (Requirement 18.3, 18.4).
 *
 * Renders the chatbot (closed and open) and asserts:
 *  - axe reports zero WCAG 2.1 A/AA violations in both states;
 *  - every icon-only button (floating toggle, header close, send) is exposed to
 *    assistive technology with an accessible label.
 *
 * Network, router, formatting, and i18n dependencies are mocked so axe analyses
 * the component's real rendered markup in isolation.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { axe } from 'vitest-axe';
import type { AxeResults, RunOptions } from 'axe-core';

// Mock react-i18next so t() returns the key (lets us assert on the i18n key used).
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' },
  }),
}));

vi.mock('../utils/formatService', () => ({
  useFormat: () => ({ formatDateTime: () => '' }),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock('../api/httpClient', () => ({
  default: { get: vi.fn().mockResolvedValue({ data: [] }) },
}));

vi.mock('../utils/logger', () => ({
  default: { error: vi.fn() },
}));

// Render any `motion.<tag>` as the plain tag, dropping animation-only props.
vi.mock('motion/react', () => {
  const passthrough = (Tag: string) =>
    ({ children, ...props }: any) => {
      const {
        initial,
        animate,
        exit,
        transition,
        whileHover,
        whileTap,
        filter,
        ...rest
      } = props;
      return React.createElement(Tag, rest, children);
    };
  return {
    motion: new Proxy({}, { get: (_t, tag: string) => passthrough(tag) }),
    AnimatePresence: ({ children }: any) => <>{children}</>,
  };
});

import Chatbot from './Chatbot';

// jsdom does not implement scrollIntoView (Chatbot scrolls to the latest message).
if (!HTMLElement.prototype.scrollIntoView) {
  HTMLElement.prototype.scrollIntoView = vi.fn();
}

const WCAG_21_AA_OPTIONS: RunOptions = {
  runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
};

function formatViolations(results: AxeResults): string {
  const rules = results.violations
    .map((v) => `${v.id} [${v.impact ?? 'n/a'}] (${v.nodes.length} node(s)): ${v.help}`)
    .join('\n  - ');
  return `axe found ${results.violations.length} violation(s):\n  - ${rules}`;
}

describe('Chatbot accessibility (Requirements 18.3, 18.4)', () => {
  it('reports zero axe violations when closed', async () => {
    const { container } = render(<Chatbot />);
    const results = await axe(container, WCAG_21_AA_OPTIONS);
    expect(results.violations, formatViolations(results)).toEqual([]);
  });

  it('reports zero axe violations when open', async () => {
    const { container } = render(<Chatbot />);
    fireEvent.click(screen.getByLabelText('chatbot.open'));

    const results = await axe(container, WCAG_21_AA_OPTIONS);
    expect(results.violations, formatViolations(results)).toEqual([]);
  });

  it('exposes the floating toggle button with an accessible label (18.3, 18.4)', () => {
    render(<Chatbot />);
    // Closed: labelled "open".
    expect(screen.getByRole('button', { name: 'chatbot.open' })).toBeInTheDocument();
  });

  it('exposes the close and send icon-only buttons with accessible labels once opened (18.3, 18.4)', () => {
    render(<Chatbot />);
    fireEvent.click(screen.getByLabelText('chatbot.open'));

    // Header close button + floating toggle (now labelled "close").
    expect(screen.getAllByRole('button', { name: 'chatbot.close' }).length).toBeGreaterThanOrEqual(1);
    // Send button is labelled.
    expect(screen.getByRole('button', { name: 'chatbot.send' })).toBeInTheDocument();
  });

  it('every rendered button has an accessible name (18.3, 18.4)', () => {
    render(<Chatbot />);
    fireEvent.click(screen.getByLabelText('chatbot.open'));

    for (const btn of screen.getAllByRole('button')) {
      const hasText = btn.textContent?.trim();
      const hasAriaLabel = btn.getAttribute('aria-label');
      const hasAriaLabelledBy = btn.getAttribute('aria-labelledby');
      const hasTitle = btn.getAttribute('title');
      expect(Boolean(hasText || hasAriaLabel || hasAriaLabelledBy || hasTitle)).toBe(true);
    }
  });
});
