// @vitest-environment jsdom
/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

// Mock react-i18next so t() returns the key (lets us assert on the i18n key used)
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' },
  }),
}));

// Mock the formatting service
vi.mock('../utils/formatService', () => ({
  useFormat: () => ({ formatDateTime: () => '' }),
}));

// Mock router navigation
vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

// Mock HTTP client and logger (no network in unit tests)
vi.mock('../api/httpClient', () => ({
  default: { get: vi.fn().mockResolvedValue({ data: [] }) },
}));
vi.mock('../utils/logger', () => ({
  default: { error: vi.fn() },
}));

// Mock motion to render plain elements, dropping animation-only props
vi.mock('motion/react', () => {
  const passthrough = (Tag: string) => ({ children, ...props }: any) => {
    const {
      initial, animate, exit, transition, whileHover, whileTap, filter,
      ...rest
    } = props;
    return React.createElement(Tag, rest, children);
  };
  return {
    motion: new Proxy(
      {},
      { get: (_t, tag: string) => passthrough(tag) }
    ),
    AnimatePresence: ({ children }: any) => <>{children}</>,
  };
});

// Mock lucide-react icons as simple svgs
vi.mock('lucide-react', () => {
  const icon = (testid: string) => ({ className }: any) => (
    <svg data-testid={testid} className={className} />
  );
  return {
    MessageSquare: icon('message-square-icon'),
    X: icon('x-icon'),
    Send: icon('send-icon'),
    Bot: icon('bot-icon'),
    User: icon('user-icon'),
    Loader2: icon('loader-icon'),
    Search: icon('search-icon'),
    ExternalLink: icon('external-link-icon'),
    FileText: icon('file-text-icon'),
    Scale: icon('scale-icon'),
    BookOpen: icon('book-open-icon'),
  };
});

import Chatbot from './Chatbot';

describe('Chatbot accessibility (Requirement 18.3, 18.4)', () => {
  it('floating toggle button exposes an accessible label', () => {
    render(<Chatbot />);
    // When closed, the floating button is labelled "open"
    expect(screen.getByLabelText('chatbot.open')).toBeInTheDocument();
  });

  it('open and send icon-only buttons expose accessible labels once opened', () => {
    render(<Chatbot />);

    // Open the panel via the floating button
    fireEvent.click(screen.getByLabelText('chatbot.open'));

    // Header close button is labelled, and the floating button now reads "close"
    expect(screen.getAllByLabelText('chatbot.close').length).toBeGreaterThanOrEqual(1);
    // Send button is labelled
    expect(screen.getByLabelText('chatbot.send')).toBeInTheDocument();
  });

  it('every button rendered has an accessible name', () => {
    render(<Chatbot />);
    fireEvent.click(screen.getByLabelText('chatbot.open'));

    const buttons = screen.getAllByRole('button');
    for (const btn of buttons) {
      const hasText = btn.textContent?.trim();
      const hasAriaLabel = btn.getAttribute('aria-label');
      const hasAriaLabelledBy = btn.getAttribute('aria-labelledby');
      const hasTitle = btn.getAttribute('title');
      expect(Boolean(hasText || hasAriaLabel || hasAriaLabelledBy || hasTitle)).toBe(true);
    }
  });
});
