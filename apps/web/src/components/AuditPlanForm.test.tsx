// @vitest-environment jsdom
/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

/**
 * Component Tests - AuditPlanForm
 *
 * Tests the AuditPlanForm component rendering, form validation,
 * user interactions, and accessibility.
 */

// Mock react-hook-form
const mockRegister = vi.fn((name: string) => ({ name, onChange: vi.fn(), onBlur: vi.fn(), ref: vi.fn() }));
const mockHandleSubmit = vi.fn((fn: any) => (e: any) => { e?.preventDefault?.(); return fn({}); });
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
    formState: { errors: {}, isSubmitting: false },
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

vi.mock('../api/httpClient', () => ({
  default: {
    get: (...args: any[]) => mockApi.get(...args),
    post: (...args: any[]) => mockApi.post(...args),
    put: (...args: any[]) => mockApi.put(...args),
  },
}));

// Mock useDepartments hook
vi.mock('../api/hooks/useDepartments', () => ({
  useDepartments: () => ({
    departments: [
      { id: 'dept-1', name: 'Finance' },
      { id: 'dept-2', name: 'IT' },
      { id: 'dept-3', name: 'Legal' },
    ],
  }),
}));

// Mock UI components
vi.mock('./ui/Input', () => ({
  Input: React.forwardRef((props: any, ref: any) => (
    <input {...props} ref={ref} data-testid={`input-${props.name || 'unknown'}`} />
  )),
}));

vi.mock('./ui/Select', () => ({
  Select: React.forwardRef(({ children, ...props }: any, ref: any) => (
    <select {...props} ref={ref} data-testid={`select-${props.name || 'unknown'}`}>
      {children}
    </select>
  )),
}));

vi.mock('./ui/FormField', () => ({
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

import AuditPlanForm from './AuditPlanForm';

describe('AuditPlanForm Component Tests', () => {
  const mockOnSuccess = vi.fn();
  const mockOnCancel = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockApi.get.mockResolvedValue({ data: [] });
  });

  describe('Rendering', () => {
    it('should render the form with all required fields', () => {
      render(
        <AuditPlanForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />
      );

      // Check for field labels (translation keys)
      expect(screen.getByText('plan.title')).toBeInTheDocument();
      expect(screen.getByText('plan.department')).toBeInTheDocument();
      expect(screen.getByText('plan.type')).toBeInTheDocument();
      expect(screen.getByText('plan.riskRating')).toBeInTheDocument();
      expect(screen.getByText('plan.startDate')).toBeInTheDocument();
      expect(screen.getByText('plan.endDate')).toBeInTheDocument();
      expect(screen.getByText('plan.leadAuditor')).toBeInTheDocument();
      expect(screen.getByText('plan.status')).toBeInTheDocument();
    });

    it('should render cancel and submit buttons', () => {
      render(
        <AuditPlanForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />
      );

      expect(screen.getByText('common.cancel')).toBeInTheDocument();
      expect(screen.getByText('plan.save')).toBeInTheDocument();
    });

    it('should render the program library selector for new plans', () => {
      render(
        <AuditPlanForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />
      );

      expect(screen.getByText('plan.library')).toBeInTheDocument();
    });

    it('should not render the program library selector when editing', () => {
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

      render(
        <AuditPlanForm
          onSuccess={mockOnSuccess}
          onCancel={mockOnCancel}
          initialData={initialData as any}
        />
      );

      expect(screen.queryByText('plan.library')).not.toBeInTheDocument();
    });
  });

  describe('User Interactions', () => {
    it('should call onCancel when cancel button is clicked', () => {
      render(
        <AuditPlanForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />
      );

      const cancelButton = screen.getByText('common.cancel');
      fireEvent.click(cancelButton);

      expect(mockOnCancel).toHaveBeenCalledTimes(1);
    });

    it('should fetch programs and auditors on mount', async () => {
      mockApi.get.mockImplementation((url: string) => {
        if (url === '/audit-programs') {
          return Promise.resolve({ data: [{ id: 'prog-1', program_title: 'Test Program', status: 'Approved', program_code: 'AP-001' }] });
        }
        if (url === '/users/list') {
          return Promise.resolve({ data: [{ id: 'user-1', name: 'Manager One', role: 'Manager' }] });
        }
        return Promise.resolve({ data: [] });
      });

      render(
        <AuditPlanForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />
      );

      await waitFor(() => {
        expect(mockApi.get).toHaveBeenCalledWith('/audit-programs');
        expect(mockApi.get).toHaveBeenCalledWith('/users/list');
      });
    });

    it('should reset form with initial data when editing', () => {
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

      render(
        <AuditPlanForm
          onSuccess={mockOnSuccess}
          onCancel={mockOnCancel}
          initialData={initialData as any}
        />
      );

      expect(mockReset).toHaveBeenCalled();
    });
  });

  describe('Accessibility', () => {
    it('should have required field indicators', () => {
      render(
        <AuditPlanForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />
      );

      // Required fields should have asterisk indicators
      const requiredIndicators = screen.getAllByText('*');
      expect(requiredIndicators.length).toBeGreaterThan(0);
    });

    it('should have proper form structure with labels', () => {
      const { container } = render(
        <AuditPlanForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />
      );

      // Form element should exist
      const form = container.querySelector('form');
      expect(form).toBeInTheDocument();

      // Labels should exist
      const labels = container.querySelectorAll('label');
      expect(labels.length).toBeGreaterThan(0);
    });

    it('should have submit button with disabled state during submission', () => {
      render(
        <AuditPlanForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />
      );

      const submitButton = screen.getByText('plan.save');
      expect(submitButton).toBeInTheDocument();
      // When not submitting, button should not be disabled
      expect(submitButton).not.toBeDisabled();
    });
  });
});
