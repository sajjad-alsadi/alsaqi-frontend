// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

/**
 * Component Tests - FindingForm localized schema + submit-error feedback
 * (Requirement 16.1, 16.3)
 *
 * The validation schema is defined inside the component via t(...), and the
 * global test setup mocks react-i18next so t(key) returns the key. These tests
 * therefore assert:
 *   - validation messages render with the translation key 'findings.fieldRequired'
 *     (proving the in-component, t(...)-based schema is wired up — Req 16.1), and
 *   - a rejected save surfaces Submit_Error_Feedback containing the
 *     'findings.saveFailed' translation key (Req 16.3).
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

import FindingForm from './FindingForm';

function renderForm() {
  const onSuccess = vi.fn();
  const onCancel = vi.fn();
  const result = render(<FindingForm onSuccess={onSuccess} onCancel={onCancel} />);
  const form = result.container.querySelector('form') as HTMLFormElement;
  return { onSuccess, onCancel, form, ...result };
}

/** Fill every required field with a valid value so zod validation passes. */
async function fillValid(container: HTMLElement) {
  // Wait for the audit-plan option to render so the select accepts the value.
  await screen.findByRole('option', { name: 'Plan 1' });
  const set = (name: string, value: string) =>
    fireEvent.change(container.querySelector(`[name="${name}"]`) as Element, {
      target: { value },
    });
  set('audit_id', 'plan-1');
  set('title', 'A finding title');
  set('condition', 'condition text');
  set('criteria', 'criteria text');
  set('consequence', 'consequence text');
  set('recommendation', 'recommendation text');
}

describe('FindingForm localized schema and submit feedback (Req 16.1, 16.3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi.get.mockResolvedValue({ data: [{ id: 'plan-1', title: 'Plan 1' }] });
  });

  it('renders translated validation messages using the schema translation key on invalid submit', async () => {
    const { form } = renderForm();

    // Submit with all required fields empty -> zod fires the localized messages.
    fireEvent.submit(form);

    const messages = await screen.findAllByText('findings.fieldRequired');
    expect(messages.length).toBeGreaterThan(0);
    // No save request is attempted while the form is invalid.
    expect(mockApi.post).not.toHaveBeenCalled();
  });

  it('shows the translated saveFailed banner when the save request is rejected', async () => {
    mockApi.post.mockRejectedValueOnce(new Error('network down'));
    const { container, form, onSuccess } = renderForm();

    await fillValid(container);
    fireEvent.submit(form);

    const banner = await screen.findByText('findings.saveFailed');
    expect(banner).toBeInTheDocument();
    expect(mockApi.post).toHaveBeenCalledTimes(1);
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('surfaces a server-provided error string in the submit-error banner', async () => {
    mockApi.post.mockRejectedValueOnce({
      response: { data: { error: 'Server rejected the finding' } },
    });
    const { container, form } = renderForm();

    await fillValid(container);
    fireEvent.submit(form);

    expect(await screen.findByText('Server rejected the finding')).toBeInTheDocument();
  });
});
