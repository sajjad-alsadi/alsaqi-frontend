// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

// Mock dependencies
vi.mock('../../utils/formatService', () => ({
  useFormat: () => ({
    formatDate: (d: string) => d || '',
    formatNumber: (n: number) => String(n),
    formatDateTime: (d: string) => d,
    translateStatus: (s: string) => s,
    translateName: (n: string) => n,
  }),
}));

vi.mock('../../context/PreferencesContext', () => ({
  usePreferences: () => ({ language: 'en', theme: 'light' }),
}));

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../api/compat/correspondenceService', () => ({
  correspondenceService: {
    getStats: vi.fn(),
    getIncoming: vi.fn(),
    getOutgoing: vi.fn(),
    getArchive: vi.fn(),
  },
}));

const mockUseCorrespondence = vi.fn();
vi.mock('../../hooks/useCorrespondence', () => ({
  useCorrespondence: (...args: any[]) => mockUseCorrespondence(...args),
}));

// Mock lucide-react icons
vi.mock('lucide-react', () => {
  const icon = React.forwardRef((props: any, ref: any) => React.createElement('svg', { ...props, ref }));
  return {
    Mail: icon, Send: icon, Clock: icon, CheckCircle: icon, Archive: icon,
    AlertCircle: icon, FileText: icon, Link: icon, Search: icon, Plus: icon,
    Filter: icon, Download: icon, Eye: icon, ArrowRight: icon, User: icon, Building: icon,
  };
});

// Mock sub-components to isolate the main component
vi.mock('../Correspondence/IncomingRegister', () => ({
  default: ({ language, onViewDetails }: any) => 
    React.createElement('div', { 'data-testid': 'incoming-register' }, 'Incoming Register'),
}));

vi.mock('../Correspondence/OutgoingRegister', () => ({
  default: ({ language, userRole, onViewDetails }: any) => 
    React.createElement('div', { 'data-testid': 'outgoing-register' }, 'Outgoing Register'),
}));

vi.mock('../Correspondence/CorrespondenceArchive', () => ({
  default: ({ language, onViewDetails }: any) => 
    React.createElement('div', { 'data-testid': 'correspondence-archive' }, 'Correspondence Archive'),
}));

vi.mock('../Correspondence/CorrespondenceDetails', () => ({
  default: ({ type, id, language, onBack }: any) => 
    React.createElement('div', { 'data-testid': 'correspondence-details' }, 
      React.createElement('button', { onClick: onBack }, 'Back')
    ),
}));

import CorrespondenceSystem from '../Correspondence/CorrespondenceSystem';

function createMockStats() {
  return {
    total_incoming: 45,
    total_outgoing: 30,
    pending_response: 7,
    archived: 12,
  };
}

function createMockIncoming(count: number = 3) {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    sequence_number: 100 + i,
    subject: `Incoming Letter ${i + 1}`,
    receipt_date: '2025-01-15',
    sender_entity: `Entity ${i + 1}`,
    status: 'Received',
  }));
}

function setupMock(options?: { loading?: boolean; stats?: any; incoming?: any[] }) {
  mockUseCorrespondence.mockReturnValue({
    stats: options?.stats ?? createMockStats(),
    incoming: options?.incoming ?? createMockIncoming(),
    outgoing: [],
    archive: [],
    loading: options?.loading ?? false,
    error: null,
    fetchStats: vi.fn(),
    fetchIncoming: vi.fn(),
    fetchOutgoing: vi.fn(),
    fetchArchive: vi.fn(),
    refreshAll: vi.fn(),
  });
}

describe('Correspondence Module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the correspondence system title', () => {
    setupMock();

    render(<CorrespondenceSystem language="en" userRole="Admin" />);

    expect(screen.getByText('correspondence.systemTitle')).toBeInTheDocument();
    expect(screen.getByText('correspondence.systemDesc')).toBeInTheDocument();
  });

  it('renders tab buttons for incoming, outgoing, and archive', () => {
    setupMock();

    render(<CorrespondenceSystem language="en" userRole="Admin" />);

    expect(screen.getByText('correspondence.incomingRegister')).toBeInTheDocument();
    expect(screen.getByText('correspondence.outgoingRegister')).toBeInTheDocument();
    // "correspondence.archive" appears both as tab button and stat card title
    const archiveElements = screen.getAllByText('correspondence.archive');
    expect(archiveElements.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('common.dashboard')).toBeInTheDocument();
  });

  it('renders stat cards with correct values on dashboard tab', () => {
    setupMock();

    render(<CorrespondenceSystem language="en" userRole="Admin" />);

    expect(screen.getByText('correspondence.totalIncoming')).toBeInTheDocument();
    expect(screen.getByText('45')).toBeInTheDocument();

    expect(screen.getByText('correspondence.totalOutgoing')).toBeInTheDocument();
    expect(screen.getByText('30')).toBeInTheDocument();

    expect(screen.getByText('correspondence.pendingResponses')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();

    // Archive stat card value
    expect(screen.getByText('12')).toBeInTheDocument();
  });

  it('switches to incoming register tab when clicked', () => {
    setupMock();

    render(<CorrespondenceSystem language="en" userRole="Admin" />);

    fireEvent.click(screen.getByText('correspondence.incomingRegister'));

    expect(screen.getByTestId('incoming-register')).toBeInTheDocument();
  });

  it('switches to outgoing register tab when clicked', () => {
    setupMock();

    render(<CorrespondenceSystem language="en" userRole="Admin" />);

    fireEvent.click(screen.getByText('correspondence.outgoingRegister'));

    expect(screen.getByTestId('outgoing-register')).toBeInTheDocument();
  });

  it('switches to archive tab when clicked', () => {
    setupMock();

    render(<CorrespondenceSystem language="en" userRole="Admin" />);

    // Click the tab button (not the stat card)
    const archiveButtons = screen.getAllByText('correspondence.archive');
    // The tab button is the one inside the tab bar
    fireEvent.click(archiveButtons[0]);

    expect(screen.getByTestId('correspondence-archive')).toBeInTheDocument();
  });

  it('shows loading spinner when data is loading', () => {
    setupMock({ loading: true, stats: null });
    // When loading and no stats, the component shows a spinner
    mockUseCorrespondence.mockReturnValue({
      stats: null,
      incoming: [],
      outgoing: [],
      archive: [],
      loading: true,
      error: null,
      fetchStats: vi.fn(),
      fetchIncoming: vi.fn(),
      fetchOutgoing: vi.fn(),
      fetchArchive: vi.fn(),
      refreshAll: vi.fn(),
    });

    render(<CorrespondenceSystem language="en" userRole="Admin" />);

    // The component shows a loading spinner div
    const spinner = document.querySelector('.animate-spin');
    expect(spinner).toBeInTheDocument();
  });

  it('renders recent incoming letters on dashboard', () => {
    setupMock();

    render(<CorrespondenceSystem language="en" userRole="Admin" />);

    expect(screen.getByText('correspondence.recentIncomingLetters')).toBeInTheDocument();
    expect(screen.getByText('Incoming Letter 1')).toBeInTheDocument();
    expect(screen.getByText('Incoming Letter 2')).toBeInTheDocument();
  });

  it('shows empty state when no incoming correspondence', () => {
    setupMock({ incoming: [] });

    render(<CorrespondenceSystem language="en" userRole="Admin" />);

    expect(screen.getByText('correspondence.noIncomingCorrespondence')).toBeInTheDocument();
  });

  it('renders register buttons for incoming and outgoing', () => {
    setupMock();

    render(<CorrespondenceSystem language="en" userRole="Admin" />);

    expect(screen.getByText('correspondence.registerIncoming')).toBeInTheDocument();
    expect(screen.getByText('correspondence.registerOutgoing')).toBeInTheDocument();
  });
});
