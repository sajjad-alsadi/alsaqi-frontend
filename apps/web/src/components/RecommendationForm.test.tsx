// @vitest-environment jsdom
/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import type { AuditFinding } from '../types';

/**
 * Component Tests - RecommendationForm localized schema + submit-error feedback
 * (Requirement 16.2, 16.3)
 *
 * The validation schema is defined inside the component via t(...), and the
 * global test setup mocks react-i18next so t(key) returns the key. These tests
 * therefore assert:
 *   - validation messages render with the translation key
 *     'recommendations.fieldRequired' (proving the in-component, t(...)-based
 *     schema is wired up — Req 16.2), and
 *   - a rejected save surfaces Submit_Error_Feedback containing the
 *     'recommendations.saveFailed' translation key (Req 16.3).
 */

// ── HTTP client ──────────────────────────────────────────────────────────────
const mockApi = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
};
vi.mock('../api/httpClient', () => ({
  default: {
    get: (...args: any[]) => mockApi.get(...args),
    post: (...args: any[]) => mockApi.post(...args),
    put: (...args: any[]) => mockApi.put(...args),
  },
}));

// ── Logger ─────────────────────────────────────────────────────────────────
vi.mock('../utils/logger', () => ({
  default: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

// ── UI button: render a native button preserving disabled/type ────────────────
vi.mock('@/components/ui/button', () => ({
  Button: ({ children, disabled, ...props }: any) =>
    React.createElement('button', { ...props, disabled }, children),
}));

import RecommendationForm from './RecommendationForm';

const findings = [
  { id: 'f-1', recommendation: 'Fix the control' },
] as unknown as AuditFinding[];

function renderForm() {
  const onSuccess = vi.fn();
  const onCancel = vi.fn();
  const result = render(
    <RecommendationForm onSuccess={onSuccess} onCancel={onCancel} findings={findings} />,
  );
  const form = result.container.querySelector('form') as HTMLFormElement;
  return { onSuccess, onCancel, form, ...result };
}

/** Fill every required field with a valid value so zod validation passes. */
function fillValid(container: HTMLElement) {
  const set = (name: string, value: string) =>
    fireEvent.change(container.querySelector(`[name="${name}"]`) as Element, {
      target: { value },
    });
  // finding_id defaults to findings[0].id ('f-1'); fill the rest.
  set('department', 'Finance');
  set('responsible', 'Jane Doe');
  set('due_date', '2025-01-01');
}

describe('RecommendationForm localized schema and submit feedback (Req 16.2, 16.3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders translated validation messages using the schema translation key on invalid submit', async () => {
    const { form } = renderForm();

    // Submit with the required text fields (department/responsible/due_date) empty.
    fireEvent.submit(form);

    const messages = await screen.findAllByText('recommendations.fieldRequired');
    expect(messages.length).toBeGreaterThan(0);
    expect(mockApi.post).not.toHaveBeenCalled();
  });

  it('shows the translated saveFailed banner when the save request is rejected', async () => {
    mockApi.post.mockRejectedValueOnce(new Error('network down'));
    const { container, form, onSuccess } = renderForm();

    fillValid(container);
    fireEvent.submit(form);

    const banner = await screen.findByText('recommendations.saveFailed');
    expect(banner).toBeInTheDocument();
    expect(mockApi.post).toHaveBeenCalledTimes(1);
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('surfaces a server-provided error string in the submit-error banner', async () => {
    mockApi.post.mockRejectedValueOnce({
      response: { data: { error: 'Server rejected the recommendation' } },
    });
    const { container, form } = renderForm();

    fillValid(container);
    fireEvent.submit(form);

    expect(
      await screen.findByText('Server rejected the recommendation'),
    ).toBeInTheDocument();
  });
});
