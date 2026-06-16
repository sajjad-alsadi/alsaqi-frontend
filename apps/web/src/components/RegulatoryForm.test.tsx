// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

/**
 * Component Tests - RegulatoryForm submission failure handling (Req 4.2, 4.3, 4.4, 4.5)
 *
 * Verifies the AuditTaskForm-style submission pattern:
 *   - a failed save surfaces Submit_Error_Feedback (inline error message),
 *   - the submit control is disabled while a save is in progress,
 *   - a second submission of the same form is prevented while submitting,
 *   - `isSubmitting` is cleared on failure so the user can retry.
 */

// ── Auth context: provide a token so the mount effect runs ───────────────────
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ token: 'test-token' }),
}));

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

// ── File upload validation hook ───────────────────────────────────────────────
vi.mock('../hooks/useFileUploadValidation', () => ({
  useFileUploadValidation: () => ({ validateAndFilter: vi.fn().mockResolvedValue([]) }),
}));

// ── UI button: render a native button preserving disabled ─────────────────────
vi.mock('@/components/ui/button', () => ({
  Button: ({ children, disabled, ...props }: any) =>
    React.createElement('button', { ...props, disabled }, children),
}));

// ── Icons ──────────────────────────────────────────────────────────────────
vi.mock('lucide-react', () => {
  const icon = React.forwardRef((props: any, ref: any) => React.createElement('svg', { ...props, ref }));
  return { Upload: icon };
});

import RegulatoryForm from './RegulatoryForm';

/** A promise whose settlement we control. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function renderForm() {
  const onSuccess = vi.fn();
  const onClose = vi.fn();
  const result = render(<RegulatoryForm onSuccess={onSuccess} onClose={onClose} />);
  const form = result.container.querySelector('form') as HTMLFormElement;
  return { onSuccess, onClose, form, ...result };
}

describe('RegulatoryForm submission failure handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Both mount fetches (/departments and /central-bank-instructions) resolve empty.
    mockApi.get.mockResolvedValue({ data: [] });
  });

  it('shows Submit_Error_Feedback (inline error) when the save fails', async () => {
    mockApi.post.mockRejectedValueOnce(new Error('network down'));
    const { form, onSuccess } = renderForm();

    // Wait for the mount fetches to settle before submitting.
    await waitFor(() => expect(mockApi.get).toHaveBeenCalled());

    fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getByText('common.error')).toBeInTheDocument();
    });
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('surfaces a server-provided error message when present', async () => {
    mockApi.post.mockRejectedValueOnce({ response: { data: { error: 'Reference already exists' } } });
    const { form } = renderForm();
    await waitFor(() => expect(mockApi.get).toHaveBeenCalled());

    fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getByText('Reference already exists')).toBeInTheDocument();
    });
  });

  it('disables the submit control while a save is in progress', async () => {
    const pending = deferred<{ data: unknown }>();
    mockApi.post.mockReturnValueOnce(pending.promise);
    const { form } = renderForm();
    await waitFor(() => expect(mockApi.get).toHaveBeenCalled());

    const submitButton = screen.getByRole('button', { name: 'common.save' });
    expect(submitButton).not.toBeDisabled();

    fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'common.loading' })).toBeDisabled();
    });

    pending.resolve({ data: {} });
  });

  it('prevents a second submission while the first is in progress', async () => {
    const pending = deferred<{ data: unknown }>();
    mockApi.post.mockReturnValueOnce(pending.promise);
    const { form } = renderForm();
    await waitFor(() => expect(mockApi.get).toHaveBeenCalled());

    fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'common.loading' })).toBeDisabled();
    });

    fireEvent.submit(form);

    expect(mockApi.post).toHaveBeenCalledTimes(1);

    pending.resolve({ data: {} });
  });

  it('clears isSubmitting on failure so the user can retry', async () => {
    mockApi.post.mockRejectedValueOnce(new Error('boom'));
    const { form } = renderForm();
    await waitFor(() => expect(mockApi.get).toHaveBeenCalled());

    fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getByText('common.error')).toBeInTheDocument();
    });

    // After failure the control is re-enabled (isSubmitting cleared in finally).
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'common.save' })).not.toBeDisabled();
    });

    // And a retry issues another save request.
    mockApi.post.mockResolvedValueOnce({ data: {} });
    fireEvent.submit(form);
    await waitFor(() => {
      expect(mockApi.post).toHaveBeenCalledTimes(2);
    });
  });
});
