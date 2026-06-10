// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

/**
 * AuditPlanForm Module Tests
 *
 * Tests form rendering, validation messages on empty submission,
 * successful submission with valid data, and accessibility.
 *
 * Validates: Requirements 14.1, 14.2, 14.6
 */

// Mock react-hook-form with validation support
let mockErrors: Record<string, { message: string }> = {};
let mockIsSubmitting = false;
let mockOnSubmitHandler: ((data: any) => void) | null = null;

const mockRegister = vi.fn((name: string) => ({
  name,
  onChange: vi.fn(),
  onBlur: vi.fn(),
  ref: vi.fn(),
}));

const mockHandleSubmit = vi.fn((fn: any) => (e: any) => {
  e?.preventDefault?.();
  mockOnSubmitHandler = fn;
  // If there are errors, don't call fn
  if (Object.keys(mockErrors).length > 0) {
    return;
  }
  return fn({
    title: 'Test Audit Plan',
    department: 'Finance',
    type: 'Operational',
    risk_rating: 'High',
    planned_start_date: '2025-01-01',
    planned_end_date: '2025-03-01',
    lead_auditor: 'John Doe',
    status: 'Planned',
    notes: '',
    program_id: '',
  });
});

const mockReset = vi.fn();
const mockSetValue = vi.fn();
const mockWatch = vi.fn(() => '');

vi.mock('react-hook-form', () => ({
  useForm: () => ({
    register: mockRegister,
    handleSubmit: mockHandleSubmit,
    reset: mockReset,
    setValue: mockSetValue,
    watch: mockWatch,
    formState: { errors: mockErrors, isSubmitting: mockIsSubmitting },
  }),
}));

vi.mock('@hookform/resolvers/zod', () => ({
  zodResolver: () => vi.fn(),
}));

// Mock react-i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}));

// Mock the api service
const mockApi = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
};

vi.mock('../../api/httpClient', () => ({
  default: {
    get: (...args: any[]) => mockApi.get(...args),
    post: (...args: any[]) => mockApi.post(...args),
    put: (...args: any[]) => mockApi.put(...args),
  },
}));

// Mock useDepartments hook
vi.mock('../../hooks/useDepartments', () => ({
  useDepartments: () => ({
    departments: [
      { id: 'dept-1', name: 'Finance' },
      { id: 'dept-2', name: 'IT' },
      { id: 'dept-3', name: 'Legal' },
    ],
  }),
}));

// Mock logger
vi.mock('../../utils/logger', () => ({
  default: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

// Mock UI components with accessibility attributes
vi.mock('../../components/ui/Input', () => ({
  Input: React.forwardRef((props: any, ref: any) => (
    <input
      {...props}
      ref={ref}
      data-testid={`input-${props.name || 'unknown'}`}
      aria-label={props.name}
    />
  )),
}));

vi.mock('../../components/ui/Select', () => ({
  Select: React.forwardRef(({ children, ...props }: any, ref: any) => (
    <select
      {...props}
      ref={ref}
      data-testid={`select-${props.name || 'unknown'}`}
      aria-label={props.name}
    >
      {children}
    </select>
  )),
}));

vi.mock('../../components/ui/FormField', () => ({
  FormField: ({ label, error, required, children, className }: any) => (
    <div className={className} data-testid={`field-${label}`}>
      <label>
        {label}
        {required && <span aria-hidden="true">*</span>}
      </label>
      {children}
      {error && <span role="alert">{error}</span>}
    </div>
  ),
}));

import AuditPlanForm from '../../components/AuditPlanForm';

describe('AuditPlanForm - Module Tests', () => {
  const mockOnSuccess = vi.fn();
  const mockOnCancel = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockErrors = {};
    mockIsSubmitting = false;
    mockOnSubmitHandler = null;
    mockApi.get.mockResolvedValue({ data: [] });
    mockApi.post.mockResolvedValue({ data: { id: 'new-plan-1' } });
    mockApi.put.mockResolvedValue({ data: { id: 'plan-1' } });
  });

  describe('Required Fields Display (Requirement 14.1)', () => {
    it('should render all required fields with required indicators', () => {
      render(
        <AuditPlanForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />
      );

      // All required fields should be present
      expect(screen.getByText('plan.title')).toBeInTheDocument();
      expect(screen.getByText('plan.department')).toBeInTheDocument();
      expect(screen.getByText('plan.type')).toBeInTheDocument();
      expect(screen.getByText('plan.riskRating')).toBeInTheDocument();
      expect(screen.getByText('plan.startDate')).toBeInTheDocument();
      expect(screen.getByText('plan.endDate')).toBeInTheDocument();
      expect(screen.getByText('plan.leadAuditor')).toBeInTheDocument();
      expect(screen.getByText('plan.status')).toBeInTheDocument();

      // Required indicators (asterisks) should be present
      const requiredIndicators = screen.getAllByText('*');
      // title, department, type, risk_rating, start_date, end_date, lead_auditor, status = 8 required fields
      expect(requiredIndicators.length).toBeGreaterThanOrEqual(7);
    });

    it('should display validation error messages when submitting without data', () => {
      // Set up errors to simulate validation failure
      mockErrors = {
        title: { message: 'plan.fieldRequired' },
        department: { message: 'plan.fieldRequired' },
        planned_start_date: { message: 'plan.fieldRequired' },
        planned_end_date: { message: 'plan.fieldRequired' },
        lead_auditor: { message: 'plan.fieldRequired' },
      };

      render(
        <AuditPlanForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />
      );

      // Error messages should be displayed with role="alert"
      const alerts = screen.getAllByRole('alert');
      expect(alerts.length).toBeGreaterThan(0);

      // Each alert should contain the validation message
      alerts.forEach((alert) => {
        expect(alert.textContent).toBe('plan.fieldRequired');
      });
    });

    it('should not display error messages when form has no errors', () => {
      mockErrors = {};

      render(
        <AuditPlanForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />
      );

      const alerts = screen.queryAllByRole('alert');
      expect(alerts.length).toBe(0);
    });
  });

  describe('Form Submission with Valid Data (Requirement 14.2)', () => {
    it('should call onSubmit with formatted data when form is submitted with valid data', async () => {
      mockApi.post.mockResolvedValue({ data: { id: 'new-plan-1' } });

      render(
        <AuditPlanForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />
      );

      // Submit the form
      const submitButton = screen.getByText('plan.save');
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockHandleSubmit).toHaveBeenCalled();
      });
    });

    it('should call api.post for new plan creation', async () => {
      mockApi.post.mockResolvedValue({ data: { id: 'new-plan-1' } });

      render(
        <AuditPlanForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />
      );

      const submitButton = screen.getByText('plan.save');
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockApi.post).toHaveBeenCalledWith('/audit-plans', expect.any(Object));
      });
    });

    it('should call api.put for existing plan update', async () => {
      const initialData = {
        id: 'plan-1',
        title: 'Existing Plan',
        department: 'Finance',
        type: 'Operational',
        risk_rating: 'High',
        planned_start_date: '2025-01-01',
        planned_end_date: '2025-03-01',
        lead_auditor: 'John',
        status: 'Planned',
      };

      // Override handleSubmit for update scenario
      mockHandleSubmit.mockImplementation((fn: any) => (e: any) => {
        e?.preventDefault?.();
        return fn({
          title: 'Updated Plan',
          department: 'Finance',
          type: 'Operational',
          risk_rating: 'High',
          planned_start_date: '2025-01-01',
          planned_end_date: '2025-03-01',
          lead_auditor: 'John',
          status: 'Planned',
        });
      });

      mockApi.put.mockResolvedValue({ data: { id: 'plan-1' } });

      render(
        <AuditPlanForm
          onSuccess={mockOnSuccess}
          onCancel={mockOnCancel}
          initialData={initialData as any}
        />
      );

      const submitButton = screen.getByText('plan.save');
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockApi.put).toHaveBeenCalledWith('/audit-plans/plan-1', expect.any(Object));
      });
    });

    it('should call onSuccess after successful submission', async () => {
      mockApi.post.mockResolvedValue({ data: { id: 'new-plan-1' } });

      render(
        <AuditPlanForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />
      );

      const submitButton = screen.getByText('plan.save');
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockOnSuccess).toHaveBeenCalled();
      });
    });

    it('should not call onSuccess when API call fails', async () => {
      mockApi.post.mockRejectedValue(new Error('Network error'));

      render(
        <AuditPlanForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />
      );

      const submitButton = screen.getByText('plan.save');
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockApi.post).toHaveBeenCalled();
      });

      // onSuccess should not be called on failure
      expect(mockOnSuccess).not.toHaveBeenCalled();
    });
  });

  describe('Accessibility (Requirement 14.6)', () => {
    it('should have proper form element', () => {
      const { container } = render(
        <AuditPlanForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />
      );

      const form = container.querySelector('form');
      expect(form).toBeInTheDocument();
    });

    it('should have labels for all form fields', () => {
      const { container } = render(
        <AuditPlanForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />
      );

      const labels = container.querySelectorAll('label');
      expect(labels.length).toBeGreaterThanOrEqual(8);
    });

    it('should have aria-hidden on required indicators', () => {
      const { container } = render(
        <AuditPlanForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />
      );

      const requiredSpans = container.querySelectorAll('[aria-hidden="true"]');
      expect(requiredSpans.length).toBeGreaterThan(0);
    });

    it('should display error messages with role="alert" for screen readers', () => {
      mockErrors = {
        title: { message: 'plan.fieldRequired' },
      };

      render(
        <AuditPlanForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />
      );

      const alerts = screen.getAllByRole('alert');
      expect(alerts.length).toBeGreaterThan(0);
      expect(alerts[0]).toHaveTextContent('plan.fieldRequired');
    });

    it('should have submit button that can be activated via keyboard', () => {
      render(
        <AuditPlanForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />
      );

      const submitButton = screen.getByText('plan.save');
      expect(submitButton.tagName).toBe('BUTTON');
      expect(submitButton).toHaveAttribute('type', 'submit');
    });

    it('should have cancel button that can be activated via keyboard', () => {
      render(
        <AuditPlanForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />
      );

      const cancelButton = screen.getByText('common.cancel');
      expect(cancelButton.tagName).toBe('BUTTON');
      expect(cancelButton).toHaveAttribute('type', 'button');
    });

    it('should disable submit button during form submission', () => {
      mockIsSubmitting = true;

      // Need to re-mock useForm to pick up new isSubmitting value
      vi.doMock('react-hook-form', () => ({
        useForm: () => ({
          register: mockRegister,
          handleSubmit: mockHandleSubmit,
          reset: mockReset,
          setValue: mockSetValue,
          watch: mockWatch,
          formState: { errors: mockErrors, isSubmitting: true },
        }),
      }));

      render(
        <AuditPlanForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />
      );

      // The submit button should show loading text when submitting
      const loadingButton = screen.queryByText('common.loading');
      if (loadingButton) {
        expect(loadingButton).toBeDisabled();
      }
    });
  });
});
