// @vitest-environment jsdom
/// <reference types="@testing-library/jest-dom/vitest" />
/**
 * Accessibility tests for NotificationBell (Requirement 18.1, 18.2, 18.4).
 *
 * Renders the bell, opens the popover, and asserts:
 *  - axe reports zero WCAG 2.1 A/AA violations for the open notification list;
 *  - each interactive notification row is exposed to assistive technology with a
 *    button role, an accessible name, and keyboard focusability (tabindex=0);
 *  - the open popover closes when the user presses Escape.
 *
 * The component depends on context providers, the router, and formatting/i18n
 * helpers. Rather than stand up the full provider tree (live network/WebSocket
 * side-effects), the consumed hooks/helpers are mocked so axe analyses the
 * component's real rendered markup in isolation.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { axe } from 'vitest-axe';
import type { AxeResults, RunOptions } from 'axe-core';

// ─── Mocks ───────────────────────────────────────────────────────────────────────

const markAsRead = vi.fn();
const markAllAsRead = vi.fn();
const deleteNotification = vi.fn();

const sampleNotifications = [
  {
    id: 1,
    title: 'Plan assigned',
    description: 'You were assigned to audit plan A',
    event_type: 'plan_assigned',
    related_module: 'AuditPlan',
    date: '2024-01-01T00:00:00.000Z',
    is_read: false,
    status: 'Unread',
    link: '/audit-plans',
  },
  {
    id: 2,
    title: 'Risk escalated',
    description: 'Risk R-12 was escalated',
    event_type: 'risk_escalated',
    related_module: 'RiskRegister',
    date: '2024-01-02T00:00:00.000Z',
    is_read: true,
    status: 'Read',
    link: '/risk-register',
  },
];

vi.mock('../context/PreferencesContext', () => ({
  usePreferences: () => ({ language: 'en' }),
}));

vi.mock('../context/NotificationContext', () => ({
  useNotificationContext: () => ({
    notifications: sampleNotifications,
    unreadCount: 1,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    bellShake: false,
  }),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock('../utils/formatService', () => ({
  useFormat: () => ({ formatNumber: (n: number) => String(n) }),
}));

// Translate helpers return their input so accessible names are deterministic.
vi.mock('../utils/notificationHelpers', () => ({
  getTranslatedNotificationMessage: (description: string) => description,
  getTranslatedNotificationModule: (module: string) => module,
}));

// Comprehensive `motion/react` stub: render any `motion.<tag>` as the plain tag
// (InteractiveIcon uses `motion.button`, NotificationBell uses `motion.div`) and
// strip animation-only props so they never leak onto the DOM. Overrides the
// lighter global stub from test/setup.ts (which only covers `motion.div`).
vi.mock('motion/react', () => {
  const ReactLib = require('react');
  const make = (tag: string) =>
    ReactLib.forwardRef((props: Record<string, unknown>, ref: unknown) => {
      const {
        children,
        initial,
        animate,
        exit,
        transition,
        whileHover,
        whileTap,
        whileInView,
        viewport,
        layout,
        variants,
        ...rest
      } = props;
      return ReactLib.createElement(tag, { ...rest, ref }, children as React.ReactNode);
    });
  const cache: Record<string, unknown> = {};
  const motion = new Proxy(
    {},
    {
      get: (_target, prop: string) => {
        const tag = typeof prop === 'string' ? prop : 'div';
        if (!cache[tag]) cache[tag] = make(tag);
        return cache[tag];
      },
    },
  );
  return { motion, AnimatePresence: ({ children }: { children: React.ReactNode }) => children };
});

import NotificationBell from './NotificationBell';

// axe scoped to WCAG 2.1 Level A and AA rules, matching the project a11y harness.
const WCAG_21_AA_OPTIONS: RunOptions = {
  runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
};

function formatViolations(results: AxeResults): string {
  const rules = results.violations
    .map((v) => `${v.id} [${v.impact ?? 'n/a'}] (${v.nodes.length} node(s)): ${v.help}`)
    .join('\n  - ');
  return `axe found ${results.violations.length} violation(s):\n  - ${rules}`;
}

/** Open the popover by activating the bell trigger. */
function openPopover(): void {
  fireEvent.click(screen.getByRole('button', { name: 'common.notifications' }));
}

describe('NotificationBell accessibility (Requirements 18.1, 18.2, 18.4)', () => {
  it('reports zero axe violations with the popover open', async () => {
    const { container } = render(<NotificationBell />);
    openPopover();

    const results = await axe(container, WCAG_21_AA_OPTIONS);
    expect(results.violations, formatViolations(results)).toEqual([]);
  });

  it('exposes each notification row with a button role, accessible name, and keyboard focusability (18.1, 18.4)', () => {
    render(<NotificationBell />);
    openPopover();

    for (const notification of sampleNotifications) {
      const row = screen.getByRole('button', { name: notification.description });
      expect(row).toBeInTheDocument();
      // Keyboard focusable.
      expect(row).toHaveAttribute('tabindex', '0');
      // Accessible name exposed to assistive technology.
      expect(row).toHaveAccessibleName(notification.description);
    }
  });

  it('activates a notification row via the keyboard (18.1)', () => {
    render(<NotificationBell />);
    openPopover();

    const unreadRow = screen.getByRole('button', { name: sampleNotifications[0].description });
    fireEvent.keyDown(unreadRow, { key: 'Enter' });

    // Activating an unread row marks it read.
    expect(markAsRead).toHaveBeenCalledWith(sampleNotifications[0].id);
  });

  it('closes the open popover when Escape is pressed (18.2)', () => {
    render(<NotificationBell />);
    openPopover();

    // The popover is open: the "view all" control is rendered.
    expect(screen.getByText('common.viewAllNotifications')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });

    // The popover is dismissed.
    expect(screen.queryByText('common.viewAllNotifications')).not.toBeInTheDocument();
  });
});
