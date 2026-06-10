// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

/**
 * RiskForm Module Tests
 *
 * Tests the RiskForm component rendering, risk score fields,
 * form submission, and accessibility.
 *
 * Validates: Requirements 14.4, 14.6
 */

// Mock react-hook-form with watch support for score calculation
let mockErrors: Record<string, { message: string }> = {};
let mockIsSubmitting = false;
let mockFormValues: Record<string, any> = {
  likelihood: 'Low',
  impact: 'Low',
  score: 0,
  rating: 'Low',
};

const mockRegister = vi.fn((name: string) => ({
  name,
  onChange: vi.fn(),
  onBlur: vi.fn(),
  ref: vi.fn(),
}));

const mockHandleSubmit = vi.fn((fn: any) => (e: any) => {
  e?.preventDefault?.();
  if (Object.keys(mockErrors).length > 0) {
    return;
  }
  return fn({
    risk_id: 'R-001',
    description: 'Test risk description',
    owner: 'Risk Owner',
    source: 'Internal',
    type: 'Operational',
    likelihood: 'High',
    impact: 'High',
    score: 9,
    rating: 'High',
    controls: 'Existing controls',
    status: 'Active',
  });
});

const mockReset = vi.fn();

vi.mock('react-hook-form', () => ({
  useForm: () => ({
    register: mockRegister,
    handleSubmit: mockHandleSubmit,
    reset: mockReset,
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

// Mock logger
vi.mock('../../utils/logger', () => ({
  default: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

// Mock UI components
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

vi.mock('../../components/ui/Textarea', () => ({
  Textarea: React.forwardRef((props: any, ref: any) => (
    <textarea
      {...props}
      ref={ref}
      data-testid={`textarea-${props.name || 'unknown'}`}
      aria-label={props.name}
    />
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

import RiskForm from '../../components/RiskForm';

describe('RiskForm - Module Tests', () => {
  const mockOnSuccess = vi.fn();
  const mockOnCancel = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockErrors = {};
    mockIsSubmitting = false;
    mockApi.post.mockResolvedValue({ data: { id: 'risk-1' } });
    mockApi.put.mockResolvedValue({ data: { id: 'risk-1' } });
  });

  describe('Risk Score Fields Display (Requirement 14.4)', () => {
    it('should render likelihood, impact, and score fields for risk assessment', () => {
      render(
        <RiskForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />
      );

      // Likelihood and impact fields should be present
      expect(screen.getByText('likelihood')).toBeInTheDocument();
      expect(screen.getByText('impact')).toBeInTheDocument();
      expect(screen.getByText('common.riskScore')).toBeInTheDocument();
      expect(screen.getByText('common.riskLevel')).toBeInTheDocument();
    });

    it('should render score input as number type for risk calculation', () => {
      render(
        <RiskForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />
      );

      const scoreInput = screen.getByTestId('input-score');
      expect(scoreInput).toBeInTheDocument();
      expect(scoreInput).toHaveAttribute('type', 'number');
    });

    it('should render residual risk assessment fields', () => {
      render(
        <RiskForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />
      );

      expect(screen.getByText('residualLikelihood')).toBeInTheDocument();
      expect(screen.getByText('residualImpact')).toBeInTheDocument();
      expect(screen.getByText('residualScore')).toBeInTheDocument();
      expect(screen.getByText('common.residualRiskLevel')).toBeInTheDocument();
    });

    it('should render residual score input as number type', () => {
      render(
        <RiskForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />
      );

      const residualScoreInput = screen.getByTestId('input-residual_score');
      expect(residualScoreInput).toBeInTheDocument();
      expect(residualScoreInput).toHaveAttribute('type', 'number');
    });

    it('should render risk level select with all risk level options', () => {
      render(
        <RiskForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />
      );

      const ratingSelect = screen.getByTestId('select-rating');
      expect(ratingSelect).toBeInTheDocument();

      // Should have options for all risk levels
      const options = ratingSelect.querySelectorAll('option');
      expect(options.length).toBe(4); // Critical, High, Medium, Low
    });

    it('should have section headers for risk assessment areas', () => {
      render(
        <RiskForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />
      );

      expect(screen.getByText('common.initialRiskAssessment')).toBeInTheDocument();
      expect(screen.getByText('common.controlsAndMitigation')).toBeInTheDocument();
      expect(screen.getByText('common.residualRiskAssessment')).toBeInTheDocument();
      expect(screen.getByText('common.tracking')).toBeInTheDocument();
    });
  });

  describe('Required Fields and Validation (Requirement 14.1)', () => {
    it('should render required fields with indicators', () => {
      render(
        <RiskForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />
      );

      // risk_id and description are required
      expect(screen.getByText('riskId')).toBeInTheDocument();
      expect(screen.getByText('common.riskDescription')).toBeInTheDocument();

      // Required indicators should be present
      const requiredIndicators = screen.getAllByText('*');
      expect(requiredIndicators.length).toBeGreaterThanOrEqual(2);
    });

    it('should display validation errors when required fields are empty', () => {
      mockErrors = {
        risk_id: { message: 'fieldRequired' },
        description: { message: 'fieldRequired' },
      };

      render(
        <RiskForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />
      );

      const alerts = screen.getAllByRole('alert');
      expect(alerts.length).toBe(2);
      alerts.forEach((alert) => {
        expect(alert.textContent).toBe('fieldRequired');
      });
    });
  });

  describe('Form Submission', () => {
    it('should call api.post for new risk creation', async () => {
      mockApi.post.mockResolvedValue({ data: { id: 'risk-1' } });

      render(
        <RiskForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />
      );

      const submitButton = screen.getByText('common.save');
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockApi.post).toHaveBeenCalledWith('/risk-register', expect.any(Object));
      });
    });

    it('should call api.put for existing risk update', async () => {
      const initialData = {
        id: 'risk-1',
        risk_id: 'R-001',
        description: 'Existing risk',
        owner: 'Owner',
        source: 'Internal',
        early_warning: '',
        type: 'Operational',
        likelihood: 'Medium',
        impact: 'High',
        score: 6,
        rating: 'High',
        controls: '',
        control_assessment: '',
        mitigation: '',
        treatment_option: '',
        residual_likelihood: 'Low',
        residual_impact: 'Medium',
        residual_score: 3,
        residual_rating: 'Medium',
        status: 'Active',
        target_date: '2025-06-01',
        review_date: '2025-03-01',
        notes: '',
        entry_date: '2025-01-01',
        entered_by: 'Admin',
      };

      // Override handleSubmit for update scenario
      mockHandleSubmit.mockImplementation((fn: any) => (e: any) => {
        e?.preventDefault?.();
        return fn({
          risk_id: 'R-001',
          description: 'Updated risk',
          likelihood: 'High',
          impact: 'High',
          score: 9,
          rating: 'Critical',
        });
      });

      mockApi.put.mockResolvedValue({ data: { id: 'risk-1' } });

      render(
        <RiskForm
          onSuccess={mockOnSuccess}
          onCancel={mockOnCancel}
          initialData={initialData as any}
        />
      );

      const submitButton = screen.getByText('common.save');
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockApi.put).toHaveBeenCalledWith('/risk-register/risk-1', expect.any(Object));
      });
    });

    it('should call onSuccess after successful submission', async () => {
      mockApi.post.mockResolvedValue({ data: { id: 'risk-1' } });

      render(
        <RiskForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />
      );

      const submitButton = screen.getByText('common.save');
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockOnSuccess).toHaveBeenCalled();
      });
    });

    it('should not call onSuccess when API call fails', async () => {
      mockApi.post.mockRejectedValue(new Error('Network error'));

      render(
        <RiskForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />
      );

      const submitButton = screen.getByText('common.save');
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockApi.post).toHaveBeenCalled();
      });

      expect(mockOnSuccess).not.toHaveBeenCalled();
    });

    it('should call onCancel when cancel button is clicked', () => {
      render(
        <RiskForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />
      );

      const cancelButton = screen.getByText('common.cancel');
      fireEvent.click(cancelButton);

      expect(mockOnCancel).toHaveBeenCalledTimes(1);
    });
  });

  describe('Edit Mode - Initial Data', () => {
    it('should call reset with initial data when editing', () => {
      const initialData = {
        id: 'risk-1',
        risk_id: 'R-001',
        description: 'Existing risk',
        owner: 'Owner',
        source: 'Internal',
        early_warning: '',
        type: 'Operational',
        likelihood: 'Medium',
        impact: 'High',
        score: 6,
        rating: 'High',
        controls: '',
        control_assessment: '',
        mitigation: '',
        treatment_option: '',
        residual_likelihood: 'Low',
        residual_impact: 'Medium',
        residual_score: 3,
        residual_rating: 'Medium',
        status: 'Active',
        target_date: '2025-06-01',
        review_date: '2025-03-01',
        notes: '',
        entry_date: '2025-01-01',
        entered_by: 'Admin',
      };

      render(
        <RiskForm
          onSuccess={mockOnSuccess}
          onCancel={mockOnCancel}
          initialData={initialData as any}
        />
      );

      expect(mockReset).toHaveBeenCalled();
    });

    it('should sanitize null values to empty strings when loading initial data', () => {
      const initialData = {
        id: 'risk-1',
        risk_id: 'R-001',
        description: 'Test',
        owner: null,
        source: null,
        early_warning: null,
        type: 'Operational',
        likelihood: 'Low',
        impact: 'Low',
        score: 0,
        rating: 'Low',
        controls: null,
        control_assessment: null,
        mitigation: null,
        treatment_option: null,
        residual_likelihood: 'Low',
        residual_impact: 'Low',
        residual_score: 0,
        residual_rating: 'Low',
        status: 'Active',
        target_date: null,
        review_date: null,
        notes: null,
        entry_date: '2025-01-01',
        entered_by: null,
      };

      render(
        <RiskForm
          onSuccess={mockOnSuccess}
          onCancel={mockOnCancel}
          initialData={initialData as any}
        />
      );

      // reset should be called with sanitized data (nulls converted to '')
      expect(mockReset).toHaveBeenCalledWith(
        expect.objectContaining({
          risk_id: 'R-001',
          description: 'Test',
          owner: '',
          source: '',
        })
      );
    });
  });

  describe('Accessibility (Requirement 14.6)', () => {
    it('should have proper form element', () => {
      const { container } = render(
        <RiskForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />
      );

      const form = container.querySelector('form');
      expect(form).toBeInTheDocument();
    });

    it('should have labels for all form fields', () => {
      const { container } = render(
        <RiskForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />
      );

      const labels = container.querySelectorAll('label');
      // RiskForm has many fields: risk_id, type, description, owner, source, early_warning,
      // likelihood, impact, score, rating, controls, control_assessment, treatment_option,
      // mitigation, residual_likelihood, residual_impact, residual_score, residual_rating,
      // status, target_date, review_date, entered_by, notes
      expect(labels.length).toBeGreaterThanOrEqual(15);
    });

    it('should have aria-hidden on required field indicators', () => {
      const { container } = render(
        <RiskForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />
      );

      const requiredSpans = container.querySelectorAll('[aria-hidden="true"]');
      expect(requiredSpans.length).toBeGreaterThan(0);
    });

    it('should display error messages with role="alert"', () => {
      mockErrors = {
        risk_id: { message: 'fieldRequired' },
        description: { message: 'fieldRequired' },
      };

      render(
        <RiskForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />
      );

      const alerts = screen.getAllByRole('alert');
      expect(alerts.length).toBe(2);
    });

    it('should have submit button with type="submit"', () => {
      render(
        <RiskForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />
      );

      const submitButton = screen.getByText('common.save');
      expect(submitButton.tagName).toBe('BUTTON');
      expect(submitButton).toHaveAttribute('type', 'submit');
    });

    it('should have cancel button with type="button"', () => {
      render(
        <RiskForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />
      );

      const cancelButton = screen.getByText('common.cancel');
      expect(cancelButton.tagName).toBe('BUTTON');
      expect(cancelButton).toHaveAttribute('type', 'button');
    });

    it('should have input fields with aria-label attributes', () => {
      render(
        <RiskForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />
      );

      const riskIdInput = screen.getByTestId('input-risk_id');
      expect(riskIdInput).toHaveAttribute('aria-label', 'risk_id');

      const scoreInput = screen.getByTestId('input-score');
      expect(scoreInput).toHaveAttribute('aria-label', 'score');
    });
  });
});
