// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

// Mock lucide-react
vi.mock('lucide-react', () => ({
  ChevronLeft: () => <svg data-testid="chevron-left" />,
  ChevronRight: () => <svg data-testid="chevron-right" />,
  ChevronsLeft: () => <svg data-testid="chevrons-left" />,
  ChevronsRight: () => <svg data-testid="chevrons-right" />,
}));

// Mock formatService
vi.mock('../../services/formatService', () => ({
  useFormat: () => ({
    formatNumber: (val: any) => String(val ?? ''),
    translateName: (val: any) => val || '',
  }),
}));

import Pagination from '../Pagination';

describe('Pagination Component', () => {
  const defaultProps = {
    currentPage: 1,
    totalPages: 5,
    onPageChange: vi.fn(),
    pageSize: 10,
    onPageSizeChange: vi.fn(),
    totalItems: 50,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Page Numbers Display', () => {
    it('should display current page and total pages', () => {
      render(<Pagination {...defaultProps} />);

      // Current page indicator in the nav section
      const nav = screen.getByRole('navigation');
      expect(nav).toHaveTextContent('1');
      expect(nav).toHaveTextContent('5');
    });

    it('should display showing X to Y of Z results', () => {
      render(<Pagination {...defaultProps} />);

      // The "showing" text contains startItem, endItem, and totalItems
      // startItem = (1-1)*10 + 1 = 1, endItem = min(1*10, 50) = 10
      const showingText = screen.getByText(/common\.pagination\.showing/);
      expect(showingText).toBeInTheDocument();
      // Verify the numbers are present in the showing section
      expect(showingText).toHaveTextContent('10');
      expect(showingText).toHaveTextContent('50');
    });

    it('should calculate correct range for middle pages', () => {
      render(<Pagination {...defaultProps} currentPage={3} />);

      // startItem = (3-1)*10 + 1 = 21, endItem = min(3*10, 50) = 30
      // Page 3 of 5
      expect(screen.getByText('21')).toBeInTheDocument();
      expect(screen.getByText('30')).toBeInTheDocument();
    });

    it('should calculate correct range for last page with partial results', () => {
      render(<Pagination {...defaultProps} currentPage={5} totalItems={47} />);

      // startItem = (5-1)*10 + 1 = 41, endItem = min(5*10, 47) = 47
      expect(screen.getByText('41')).toBeInTheDocument();
      // 47 appears both as endItem and totalItems, so use getAllByText
      const elements47 = screen.getAllByText('47');
      expect(elements47.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Navigation Buttons', () => {
    it('should have first, previous, next, and last buttons', () => {
      render(<Pagination {...defaultProps} currentPage={3} />);

      expect(screen.getByTitle('common.pagination.first')).toBeInTheDocument();
      expect(screen.getByTitle('common.pagination.previous')).toBeInTheDocument();
      expect(screen.getByTitle('common.pagination.next')).toBeInTheDocument();
      expect(screen.getByTitle('common.pagination.last')).toBeInTheDocument();
    });

    it('should disable first and previous buttons on first page', () => {
      render(<Pagination {...defaultProps} currentPage={1} />);

      expect(screen.getByTitle('common.pagination.first')).toBeDisabled();
      expect(screen.getByTitle('common.pagination.previous')).toBeDisabled();
    });

    it('should disable next and last buttons on last page', () => {
      render(<Pagination {...defaultProps} currentPage={5} />);

      expect(screen.getByTitle('common.pagination.next')).toBeDisabled();
      expect(screen.getByTitle('common.pagination.last')).toBeDisabled();
    });

    it('should enable all buttons on middle pages', () => {
      render(<Pagination {...defaultProps} currentPage={3} />);

      expect(screen.getByTitle('common.pagination.first')).not.toBeDisabled();
      expect(screen.getByTitle('common.pagination.previous')).not.toBeDisabled();
      expect(screen.getByTitle('common.pagination.next')).not.toBeDisabled();
      expect(screen.getByTitle('common.pagination.last')).not.toBeDisabled();
    });
  });

  describe('onChange Callback', () => {
    it('should call onPageChange with 1 when first button is clicked', () => {
      const onPageChange = vi.fn();
      render(<Pagination {...defaultProps} currentPage={3} onPageChange={onPageChange} />);

      fireEvent.click(screen.getByTitle('common.pagination.first'));
      expect(onPageChange).toHaveBeenCalledWith(1);
    });

    it('should call onPageChange with currentPage - 1 when previous is clicked', () => {
      const onPageChange = vi.fn();
      render(<Pagination {...defaultProps} currentPage={3} onPageChange={onPageChange} />);

      fireEvent.click(screen.getByTitle('common.pagination.previous'));
      expect(onPageChange).toHaveBeenCalledWith(2);
    });

    it('should call onPageChange with currentPage + 1 when next is clicked', () => {
      const onPageChange = vi.fn();
      render(<Pagination {...defaultProps} currentPage={3} onPageChange={onPageChange} />);

      fireEvent.click(screen.getByTitle('common.pagination.next'));
      expect(onPageChange).toHaveBeenCalledWith(4);
    });

    it('should call onPageChange with totalPages when last button is clicked', () => {
      const onPageChange = vi.fn();
      render(<Pagination {...defaultProps} currentPage={3} onPageChange={onPageChange} />);

      fireEvent.click(screen.getByTitle('common.pagination.last'));
      expect(onPageChange).toHaveBeenCalledWith(5);
    });

    it('should call onPageSizeChange when page size is changed', () => {
      const onPageSizeChange = vi.fn();
      render(<Pagination {...defaultProps} onPageSizeChange={onPageSizeChange} />);

      const select = screen.getByRole('combobox');
      fireEvent.change(select, { target: { value: '20' } });

      expect(onPageSizeChange).toHaveBeenCalledWith(20);
    });
  });

  describe('Page Size Selector', () => {
    it('should render page size options (10, 20, 50, 100)', () => {
      render(<Pagination {...defaultProps} />);

      const select = screen.getByRole('combobox');
      const options = select.querySelectorAll('option');

      expect(options).toHaveLength(4);
      expect(options[0]).toHaveValue('10');
      expect(options[1]).toHaveValue('20');
      expect(options[2]).toHaveValue('50');
      expect(options[3]).toHaveValue('100');
    });

    it('should show current page size as selected', () => {
      render(<Pagination {...defaultProps} pageSize={20} />);

      const select = screen.getByRole('combobox') as HTMLSelectElement;
      expect(select.value).toBe('20');
    });
  });

  describe('Accessibility and ARIA', () => {
    it('should have navigation landmark with aria-label', () => {
      render(<Pagination {...defaultProps} />);

      const nav = screen.getByRole('navigation', { name: 'accessibility.pagination' });
      expect(nav).toBeInTheDocument();
    });

    it('should have title attributes on navigation buttons', () => {
      render(<Pagination {...defaultProps} currentPage={3} />);

      expect(screen.getByTitle('common.pagination.first')).toBeInTheDocument();
      expect(screen.getByTitle('common.pagination.previous')).toBeInTheDocument();
      expect(screen.getByTitle('common.pagination.next')).toBeInTheDocument();
      expect(screen.getByTitle('common.pagination.last')).toBeInTheDocument();
    });

    it('should indicate disabled state via disabled attribute', () => {
      render(<Pagination {...defaultProps} currentPage={1} />);

      const firstBtn = screen.getByTitle('common.pagination.first');
      const prevBtn = screen.getByTitle('common.pagination.previous');

      expect(firstBtn).toHaveAttribute('disabled');
      expect(prevBtn).toHaveAttribute('disabled');
    });
  });
});
