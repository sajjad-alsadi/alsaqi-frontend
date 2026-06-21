// @vitest-environment jsdom
/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

// Mock Portal to render children inline instead of using createPortal
vi.mock('../Portal', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Mock FocusTrap to expose onEscape behavior for testing
function MockFocusTrap({ children, onEscape, active }: { children: React.ReactNode; onEscape: () => void; active: boolean }) {
  React.useEffect(() => {
    if (!active) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onEscape();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [active, onEscape]);
  return <>{children}</>;
}

vi.mock('../FocusTrap', () => ({
  FocusTrap: MockFocusTrap,
  default: MockFocusTrap,
}));

// Mock lucide-react
vi.mock('lucide-react', () => ({
  X: ({ size }: any) => <svg data-testid="x-icon" />,
}));

// Mock formatService
vi.mock('../../utils/formatService', () => ({
  useFormat: () => ({
    formatNumber: (val: any) => String(val ?? ''),
    translateName: (val: any) => val || '',
  }),
}));

import Modal from '../Modal';

describe('Modal Component', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    title: 'Test Modal Title',
    children: <p>Modal content here</p>,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Show/Hide', () => {
    it('should render modal content when isOpen is true', () => {
      render(<Modal {...defaultProps} />);

      expect(screen.getByText('Test Modal Title')).toBeInTheDocument();
      expect(screen.getByText('Modal content here')).toBeInTheDocument();
    });

    it('should not render modal content when isOpen is false', () => {
      render(<Modal {...defaultProps} isOpen={false} />);

      expect(screen.queryByText('Test Modal Title')).not.toBeInTheDocument();
      expect(screen.queryByText('Modal content here')).not.toBeInTheDocument();
    });

    it('should render with role="dialog" and aria-modal="true"', () => {
      render(<Modal {...defaultProps} />);

      const dialog = screen.getByRole('dialog');
      expect(dialog).toBeInTheDocument();
      expect(dialog).toHaveAttribute('aria-modal', 'true');
    });

    it('should have aria-labelledby pointing to the title', () => {
      render(<Modal {...defaultProps} />);

      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveAttribute('aria-labelledby', 'modal-title');

      const title = screen.getByText('Test Modal Title');
      expect(title).toHaveAttribute('id', 'modal-title');
    });
  });

  describe('Close on Escape', () => {
    it('should call onClose when Escape key is pressed', () => {
      const onClose = vi.fn();
      render(<Modal {...defaultProps} onClose={onClose} />);

      fireEvent.keyDown(document, { key: 'Escape' });

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('should not call onClose on Escape when modal is closed', () => {
      const onClose = vi.fn();
      render(<Modal {...defaultProps} isOpen={false} onClose={onClose} />);

      fireEvent.keyDown(document, { key: 'Escape' });

      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe('Close on Backdrop Click', () => {
    it('should call onClose when backdrop is clicked', () => {
      const onClose = vi.fn();
      render(<Modal {...defaultProps} onClose={onClose} />);

      // The backdrop has aria-hidden="true" and onClick={onClose}
      const backdrop = screen.getByRole('dialog').querySelector('[aria-hidden="true"]');
      expect(backdrop).toBeInTheDocument();
      fireEvent.click(backdrop!);

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('should not call onClose when modal content is clicked', () => {
      const onClose = vi.fn();
      render(<Modal {...defaultProps} onClose={onClose} />);

      fireEvent.click(screen.getByText('Modal content here'));

      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe('Close Button', () => {
    it('should call onClose when close button is clicked', () => {
      const onClose = vi.fn();
      render(<Modal {...defaultProps} onClose={onClose} />);

      const closeButton = screen.getByLabelText('accessibility.closeModal');
      fireEvent.click(closeButton);

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('should have accessible label on close button', () => {
      render(<Modal {...defaultProps} />);

      const closeButton = screen.getByLabelText('accessibility.closeModal');
      expect(closeButton).toBeInTheDocument();
    });
  });

  describe('Size Variants', () => {
    it('should apply default md size class', () => {
      const { container } = render(<Modal {...defaultProps} />);

      const modalContent = container.querySelector('.max-w-2xl');
      expect(modalContent).toBeInTheDocument();
    });

    it('should apply sm size class', () => {
      const { container } = render(<Modal {...defaultProps} size="sm" />);

      const modalContent = container.querySelector('.max-w-md');
      expect(modalContent).toBeInTheDocument();
    });

    it('should apply lg size class', () => {
      const { container } = render(<Modal {...defaultProps} size="lg" />);

      const modalContent = container.querySelector('.max-w-4xl');
      expect(modalContent).toBeInTheDocument();
    });
  });

  describe('Keyboard Navigation and ARIA', () => {
    it('should support keyboard navigation via FocusTrap', () => {
      render(<Modal {...defaultProps} />);

      // The modal is wrapped in FocusTrap which handles Tab cycling
      const dialog = screen.getByRole('dialog');
      expect(dialog).toBeInTheDocument();
    });

    it('should lock body scroll when open', () => {
      render(<Modal {...defaultProps} />);

      expect(document.body.style.overflow).toBe('hidden');
    });

    it('should restore body scroll when closed', () => {
      const { rerender } = render(<Modal {...defaultProps} />);
      expect(document.body.style.overflow).toBe('hidden');

      rerender(<Modal {...defaultProps} isOpen={false} />);
      expect(document.body.style.overflow).toBe('');
    });
  });
});
