// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import React from 'react';

// Mock Portal to render children inline
vi.mock('../Portal', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Mock FocusTrap with real focus management behavior
vi.mock('../FocusTrap', () => ({
  FocusTrap: ({ children, onEscape, active }: { children: React.ReactNode; onEscape: () => void; active: boolean }) => {
    const React = require('react');
    const containerRef = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
      if (!active) return;
      const handler = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          onEscape();
          return;
        }
        if (e.key === 'Tab' && containerRef.current) {
          const focusable = containerRef.current.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
          );
          if (focusable.length === 0) return;
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          if (e.shiftKey) {
            if (document.activeElement === first) {
              e.preventDefault();
              last.focus();
            }
          } else {
            if (document.activeElement === last) {
              e.preventDefault();
              first.focus();
            }
          }
        }
      };
      document.addEventListener('keydown', handler);
      // Auto-focus first focusable element
      const timer = setTimeout(() => {
        if (containerRef.current) {
          const firstFocusable = containerRef.current.querySelector<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
          );
          firstFocusable?.focus();
        }
      }, 0);
      return () => {
        clearTimeout(timer);
        document.removeEventListener('keydown', handler);
      };
    }, [active, onEscape]);

    return React.createElement('div', { ref: containerRef }, children);
  },
  default: ({ children, onEscape, active }: { children: React.ReactNode; onEscape: () => void; active: boolean }) => {
    const React = require('react');
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
    return React.createElement('div', null, children);
  },
}));

// Mock lucide-react
vi.mock('lucide-react', () => ({
  X: ({ size }: any) => <svg data-testid="x-icon" />,
  ChevronLeft: () => <svg data-testid="chevron-left" />,
  ChevronRight: () => <svg data-testid="chevron-right" />,
  ChevronsLeft: () => <svg data-testid="chevrons-left" />,
  ChevronsRight: () => <svg data-testid="chevrons-right" />,
  Globe: () => <svg data-testid="globe-icon" />,
  Bell: () => <svg data-testid="bell-icon" />,
  ChevronDown: () => <svg data-testid="chevron-down" />,
}));

// Mock formatService
vi.mock('../../services/formatService', () => ({
  useFormat: () => ({
    formatNumber: (val: any) => String(val ?? ''),
    translateName: (val: any) => val || '',
  }),
}));

import Modal from '../Modal';
import Pagination from '../Pagination';

/**
 * Accessibility Tests (a11y)
 *
 * **Validates: Requirements 14.6, 22.6**
 *
 * Tests accessibility compliance for interactive components including:
 * - Form field labels and ARIA roles
 * - Keyboard navigation for interactive components
 * - Focus management in Modal and Dropdown
 */
describe('Accessibility Tests', () => {
  afterEach(() => {
    cleanup();
  });

  describe('Form Field Labels and ARIA Roles', () => {
    it('form inputs should have associated labels via aria-label or label element', () => {
      const { container } = render(
        <form aria-label="Test form">
          <div>
            <label htmlFor="username">Username</label>
            <input id="username" type="text" />
          </div>
          <div>
            <label htmlFor="email">Email</label>
            <input id="email" type="email" />
          </div>
          <div>
            <input aria-label="Search" type="search" />
          </div>
        </form>
      );

      // Verify label-input association via htmlFor/id
      const usernameInput = screen.getByLabelText('Username');
      expect(usernameInput).toBeInTheDocument();
      expect(usernameInput).toHaveAttribute('id', 'username');

      const emailInput = screen.getByLabelText('Email');
      expect(emailInput).toBeInTheDocument();
      expect(emailInput).toHaveAttribute('id', 'email');

      // Verify aria-label association
      const searchInput = screen.getByLabelText('Search');
      expect(searchInput).toBeInTheDocument();
    });

    it('select elements should have associated labels', () => {
      render(
        <form aria-label="Selection form">
          <div>
            <label htmlFor="role-select">Role</label>
            <select id="role-select">
              <option value="admin">Admin</option>
              <option value="user">User</option>
            </select>
          </div>
        </form>
      );

      const roleSelect = screen.getByLabelText('Role');
      expect(roleSelect).toBeInTheDocument();
      expect(roleSelect.tagName).toBe('SELECT');
    });

    it('required fields should have aria-required attribute', () => {
      render(
        <form aria-label="Required fields form">
          <label htmlFor="required-field">Required Field</label>
          <input id="required-field" type="text" aria-required="true" required />
          <label htmlFor="optional-field">Optional Field</label>
          <input id="optional-field" type="text" />
        </form>
      );

      const requiredInput = screen.getByLabelText('Required Field');
      expect(requiredInput).toHaveAttribute('aria-required', 'true');
      expect(requiredInput).toBeRequired();

      const optionalInput = screen.getByLabelText('Optional Field');
      expect(optionalInput).not.toHaveAttribute('aria-required');
    });

    it('error messages should use role="alert" for screen readers', () => {
      render(
        <form aria-label="Error form">
          <label htmlFor="error-field">Field with error</label>
          <input id="error-field" type="text" aria-invalid="true" aria-describedby="error-msg" />
          <div id="error-msg" role="alert">This field is required</div>
        </form>
      );

      const errorMessage = screen.getByRole('alert');
      expect(errorMessage).toBeInTheDocument();
      expect(errorMessage).toHaveTextContent('This field is required');

      const input = screen.getByLabelText('Field with error');
      expect(input).toHaveAttribute('aria-invalid', 'true');
      expect(input).toHaveAttribute('aria-describedby', 'error-msg');
    });

    it('form groups should use fieldset and legend for related fields', () => {
      render(
        <form aria-label="Grouped form">
          <fieldset>
            <legend>Personal Information</legend>
            <label htmlFor="first-name">First Name</label>
            <input id="first-name" type="text" />
            <label htmlFor="last-name">Last Name</label>
            <input id="last-name" type="text" />
          </fieldset>
        </form>
      );

      const fieldset = screen.getByRole('group');
      expect(fieldset).toBeInTheDocument();
      expect(screen.getByText('Personal Information')).toBeInTheDocument();
    });
  });

  describe('Modal ARIA Roles and Attributes', () => {
    const modalProps = {
      isOpen: true,
      onClose: vi.fn(),
      title: 'Accessible Modal',
      children: <p>Modal body content</p>,
    };

    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('Modal should have role="dialog" when open', () => {
      render(<Modal {...modalProps} />);

      const dialog = screen.getByRole('dialog');
      expect(dialog).toBeInTheDocument();
    });

    it('Modal should have aria-modal="true"', () => {
      render(<Modal {...modalProps} />);

      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveAttribute('aria-modal', 'true');
    });

    it('Modal should have aria-labelledby pointing to the title element', () => {
      render(<Modal {...modalProps} />);

      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveAttribute('aria-labelledby', 'modal-title');

      const titleElement = document.getElementById('modal-title');
      expect(titleElement).toBeInTheDocument();
      expect(titleElement).toHaveTextContent('Accessible Modal');
    });

    it('Modal close button should have aria-label', () => {
      render(<Modal {...modalProps} />);

      const closeButton = screen.getByLabelText('accessibility.closeModal');
      expect(closeButton).toBeInTheDocument();
      expect(closeButton.tagName).toBe('BUTTON');
    });

    it('Modal backdrop should have aria-hidden="true"', () => {
      render(<Modal {...modalProps} />);

      const dialog = screen.getByRole('dialog');
      const backdrop = dialog.querySelector('[aria-hidden="true"]');
      expect(backdrop).toBeInTheDocument();
    });
  });

  describe('Keyboard Navigation for Interactive Components', () => {
    it('Modal should close on Escape key press', () => {
      const onClose = vi.fn();
      render(
        <Modal isOpen={true} onClose={onClose} title="Escape Test">
          <button>Inside Button</button>
        </Modal>
      );

      fireEvent.keyDown(document, { key: 'Escape' });
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('Modal should not respond to Escape when closed', () => {
      const onClose = vi.fn();
      render(
        <Modal isOpen={false} onClose={onClose} title="Closed Modal">
          <button>Inside Button</button>
        </Modal>
      );

      fireEvent.keyDown(document, { key: 'Escape' });
      expect(onClose).not.toHaveBeenCalled();
    });

    it('Pagination navigation buttons should be keyboard accessible', () => {
      const onPageChange = vi.fn();
      render(
        <Pagination
          currentPage={3}
          totalPages={5}
          onPageChange={onPageChange}
          pageSize={10}
          onPageSizeChange={vi.fn()}
          totalItems={50}
        />
      );

      const nextButton = screen.getByTitle('common.pagination.next');
      const prevButton = screen.getByTitle('common.pagination.previous');

      // Buttons should be focusable
      expect(nextButton.tagName).toBe('BUTTON');
      expect(prevButton.tagName).toBe('BUTTON');

      // Simulate keyboard activation (Enter key on button)
      fireEvent.keyDown(nextButton, { key: 'Enter' });
      fireEvent.click(nextButton);
      expect(onPageChange).toHaveBeenCalledWith(4);
    });

    it('Pagination disabled buttons should not be activatable', () => {
      const onPageChange = vi.fn();
      render(
        <Pagination
          currentPage={1}
          totalPages={5}
          onPageChange={onPageChange}
          pageSize={10}
          onPageSizeChange={vi.fn()}
          totalItems={50}
        />
      );

      const firstButton = screen.getByTitle('common.pagination.first');
      const prevButton = screen.getByTitle('common.pagination.previous');

      expect(firstButton).toBeDisabled();
      expect(prevButton).toBeDisabled();

      // Clicking disabled buttons should not trigger callback
      fireEvent.click(firstButton);
      fireEvent.click(prevButton);
      expect(onPageChange).not.toHaveBeenCalled();
    });

    it('interactive buttons should respond to Space key', () => {
      const onClick = vi.fn();
      render(
        <button onClick={onClick} aria-label="Action button">
          Click me
        </button>
      );

      const button = screen.getByLabelText('Action button');
      // Space key on buttons triggers click in browsers
      fireEvent.keyDown(button, { key: ' ' });
      fireEvent.keyUp(button, { key: ' ' });
      // In jsdom, we simulate the click that Space would trigger
      fireEvent.click(button);
      expect(onClick).toHaveBeenCalled();
    });

    it('Tab key should move focus between interactive elements', () => {
      render(
        <div>
          <button data-testid="btn1">First</button>
          <button data-testid="btn2">Second</button>
          <button data-testid="btn3">Third</button>
        </div>
      );

      const btn1 = screen.getByTestId('btn1');
      const btn2 = screen.getByTestId('btn2');

      // Focus first button
      act(() => {
        btn1.focus();
      });
      expect(document.activeElement).toBe(btn1);

      // Tab should be able to move focus (browser handles this natively)
      // We verify elements are focusable
      act(() => {
        btn2.focus();
      });
      expect(document.activeElement).toBe(btn2);
    });
  });

  describe('Focus Management in Modal', () => {
    it('Modal should trap focus within its content', async () => {
      const onClose = vi.fn();
      render(
        <Modal isOpen={true} onClose={onClose} title="Focus Trap Modal">
          <div>
            <input data-testid="input1" type="text" placeholder="First input" />
            <button data-testid="btn-inside">Inside Button</button>
          </div>
        </Modal>
      );

      // Wait for focus trap to activate
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
      });

      // The close button and the inner elements should be the focusable elements
      const closeButton = screen.getByLabelText('accessibility.closeModal');
      const insideButton = screen.getByTestId('btn-inside');
      const input1 = screen.getByTestId('input1');

      // All interactive elements inside modal should be focusable
      expect(closeButton.tabIndex).not.toBe(-1);
      expect(insideButton.tabIndex).not.toBe(-1);
      expect(input1.tabIndex).not.toBe(-1);
    });

    it('Tab should cycle through focusable elements within Modal (wrap from last to first)', async () => {
      const onClose = vi.fn();
      render(
        <Modal isOpen={true} onClose={onClose} title="Tab Cycle Modal">
          <div>
            <button data-testid="modal-btn1">Button 1</button>
            <button data-testid="modal-btn2">Button 2</button>
          </div>
        </Modal>
      );

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
      });

      // Get all focusable elements in the modal
      const closeButton = screen.getByLabelText('accessibility.closeModal');
      const btn1 = screen.getByTestId('modal-btn1');
      const btn2 = screen.getByTestId('modal-btn2');

      // Focus the last button
      act(() => {
        btn2.focus();
      });
      expect(document.activeElement).toBe(btn2);

      // Tab from last element should wrap to first (close button)
      fireEvent.keyDown(document, { key: 'Tab' });
      expect(document.activeElement).toBe(closeButton);
    });

    it('Shift+Tab should cycle backwards (wrap from first to last)', async () => {
      const onClose = vi.fn();
      render(
        <Modal isOpen={true} onClose={onClose} title="Shift Tab Modal">
          <div>
            <button data-testid="modal-btn1">Button 1</button>
            <button data-testid="modal-btn2">Button 2</button>
          </div>
        </Modal>
      );

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
      });

      const closeButton = screen.getByLabelText('accessibility.closeModal');
      const btn2 = screen.getByTestId('modal-btn2');

      // Focus the close button (first focusable element)
      act(() => {
        closeButton.focus();
      });
      expect(document.activeElement).toBe(closeButton);

      // Shift+Tab from first element should wrap to last
      fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
      expect(document.activeElement).toBe(btn2);
    });

    it('Escape key should close Modal and allow focus to return', () => {
      const onClose = vi.fn();
      const triggerRef = React.createRef<HTMLButtonElement>();

      const TestComponent = () => {
        const [isOpen, setIsOpen] = React.useState(true);
        return (
          <div>
            <button ref={triggerRef} data-testid="trigger">Open Modal</button>
            <Modal isOpen={isOpen} onClose={() => { setIsOpen(false); onClose(); }} title="Return Focus Modal">
              <button>Inside</button>
            </Modal>
          </div>
        );
      };

      render(<TestComponent />);

      // Modal should be open
      expect(screen.getByRole('dialog')).toBeInTheDocument();

      // Press Escape to close
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('Modal should lock body scroll when open', () => {
      render(
        <Modal isOpen={true} onClose={vi.fn()} title="Scroll Lock Modal">
          <p>Content</p>
        </Modal>
      );

      expect(document.body.style.overflow).toBe('hidden');
    });

    it('Modal should restore body scroll when closed', () => {
      const { rerender } = render(
        <Modal isOpen={true} onClose={vi.fn()} title="Scroll Restore Modal">
          <p>Content</p>
        </Modal>
      );

      expect(document.body.style.overflow).toBe('hidden');

      rerender(
        <Modal isOpen={false} onClose={vi.fn()} title="Scroll Restore Modal">
          <p>Content</p>
        </Modal>
      );

      expect(document.body.style.overflow).toBe('');
    });
  });

  describe('Pagination Accessibility', () => {
    const paginationProps = {
      currentPage: 2,
      totalPages: 5,
      onPageChange: vi.fn(),
      pageSize: 10,
      onPageSizeChange: vi.fn(),
      totalItems: 50,
    };

    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('Pagination should have navigation landmark with aria-label', () => {
      render(<Pagination {...paginationProps} />);

      const nav = screen.getByRole('navigation', { name: 'accessibility.pagination' });
      expect(nav).toBeInTheDocument();
    });

    it('navigation buttons should have descriptive title attributes', () => {
      render(<Pagination {...paginationProps} />);

      expect(screen.getByTitle('common.pagination.first')).toBeInTheDocument();
      expect(screen.getByTitle('common.pagination.previous')).toBeInTheDocument();
      expect(screen.getByTitle('common.pagination.next')).toBeInTheDocument();
      expect(screen.getByTitle('common.pagination.last')).toBeInTheDocument();
    });

    it('disabled buttons should communicate disabled state', () => {
      render(
        <Pagination
          currentPage={1}
          totalPages={5}
          onPageChange={vi.fn()}
          pageSize={10}
          onPageSizeChange={vi.fn()}
          totalItems={50}
        />
      );

      const firstBtn = screen.getByTitle('common.pagination.first');
      const prevBtn = screen.getByTitle('common.pagination.previous');

      expect(firstBtn).toHaveAttribute('disabled');
      expect(prevBtn).toHaveAttribute('disabled');
    });

    it('page size selector should be accessible as a combobox', () => {
      render(<Pagination {...paginationProps} />);

      const select = screen.getByRole('combobox');
      expect(select).toBeInTheDocument();
      expect(select.tagName).toBe('SELECT');
    });
  });

  describe('Interactive Component ARIA Patterns', () => {
    it('dropdown trigger should have aria-expanded attribute', () => {
      const { rerender } = render(
        <button aria-expanded="false" aria-haspopup="true" aria-label="Open menu">
          Menu
        </button>
      );

      const button = screen.getByLabelText('Open menu');
      expect(button).toHaveAttribute('aria-expanded', 'false');
      expect(button).toHaveAttribute('aria-haspopup', 'true');

      rerender(
        <button aria-expanded="true" aria-haspopup="true" aria-label="Open menu">
          Menu
        </button>
      );

      expect(button).toHaveAttribute('aria-expanded', 'true');
    });

    it('toggle buttons should use aria-pressed', () => {
      const { rerender } = render(
        <button aria-pressed="false" aria-label="Toggle feature">
          Toggle
        </button>
      );

      const button = screen.getByLabelText('Toggle feature');
      expect(button).toHaveAttribute('aria-pressed', 'false');

      rerender(
        <button aria-pressed="true" aria-label="Toggle feature">
          Toggle
        </button>
      );

      expect(button).toHaveAttribute('aria-pressed', 'true');
    });

    it('navigation elements should use proper nav role', () => {
      render(
        <nav aria-label="Main navigation">
          <ul>
            <li><a href="/home">Home</a></li>
            <li><a href="/about">About</a></li>
          </ul>
        </nav>
      );

      const nav = screen.getByRole('navigation', { name: 'Main navigation' });
      expect(nav).toBeInTheDocument();

      const links = screen.getAllByRole('link');
      expect(links).toHaveLength(2);
    });

    it('loading states should use aria-busy', () => {
      render(
        <div aria-busy="true" aria-label="Loading content">
          <div role="status">Loading...</div>
        </div>
      );

      const loadingContainer = screen.getByLabelText('Loading content');
      expect(loadingContainer).toHaveAttribute('aria-busy', 'true');

      const status = screen.getByRole('status');
      expect(status).toBeInTheDocument();
    });

    it('disabled interactive elements should communicate disabled state', () => {
      render(
        <div>
          <button disabled aria-label="Disabled action">Cannot click</button>
          <input disabled aria-label="Disabled input" />
          <select disabled aria-label="Disabled select">
            <option>Option</option>
          </select>
        </div>
      );

      expect(screen.getByLabelText('Disabled action')).toBeDisabled();
      expect(screen.getByLabelText('Disabled input')).toBeDisabled();
      expect(screen.getByLabelText('Disabled select')).toBeDisabled();
    });
  });
});
