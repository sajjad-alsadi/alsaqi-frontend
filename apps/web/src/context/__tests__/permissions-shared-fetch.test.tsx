// @vitest-environment jsdom
/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { PermissionsProvider } from '../PermissionsContext';
import { usePermissions } from '../../hooks/usePermissions';
import { createWrapper } from '../../api/hooks/__tests__/queryWrapper';
import { UserRole } from '../../constants';
import { DEFAULT_PERMISSIONS } from '../../permissions';
import { PermissionAction, UserPermissionSet } from '../../permissions/types';

/**
 * Unit test for the single shared permission fetch (Req 11.2, 11.3).
 *
 * Renders ONE {@link PermissionsProvider} with MULTIPLE components consuming
 * `usePermissions()` and asserts the underlying `/v1/permissions/me` fetch
 * happens exactly once across all consumers — i.e. consumers resolve from one
 * shared permission state and there are no independent per-component fetches.
 */

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockUser = { user: null as any };
vi.mock('../../context/UserContext', () => ({
  useUser: () => mockUser,
}));

const mockLogout = vi.fn();
vi.mock('../../context/AppContext', () => ({
  useAppContext: () => ({ logout: mockLogout }),
}));

const mockApiGet = vi.fn();
vi.mock('../../api/httpClient', () => ({
  default: {
    get: (...args: any[]) => mockApiGet(...args),
  },
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildPermissionSet(userId: string, role: string): UserPermissionSet {
  const rolePerms = DEFAULT_PERMISSIONS[role as keyof typeof DEFAULT_PERMISSIONS];
  const permissions: Record<string, PermissionAction[]> = {};
  if (rolePerms) {
    for (const [mod, actions] of Object.entries(rolePerms)) {
      permissions[mod] = [...actions] as PermissionAction[];
    }
  }
  return {
    userId,
    role,
    roleId: 'role-1',
    isCustomRole: false,
    permissions,
    overrides: [],
  };
}

/** A consumer component that reads from the shared provider via usePermissions(). */
function Consumer({ id }: { id: string }) {
  const { isLoading, canView } = usePermissions();
  return (
    <div data-testid={`consumer-${id}`}>
      {isLoading ? 'loading' : `view:${canView('AuditPlans')}`}
    </div>
  );
}

// ─── Test Setup ──────────────────────────────────────────────────────────────

let store: Record<string, string> = {};

beforeEach(() => {
  mockUser.user = null;
  mockLogout.mockClear();
  mockApiGet.mockReset();
  store = {};

  (localStorage.getItem as ReturnType<typeof vi.fn>).mockImplementation(
    (key: string) => store[key] ?? null
  );
  (localStorage.setItem as ReturnType<typeof vi.fn>).mockImplementation(
    (key: string, value: string) => { store[key] = value; }
  );
  (localStorage.removeItem as ReturnType<typeof vi.fn>).mockImplementation(
    (key: string) => { delete store[key]; }
  );
  (localStorage.clear as ReturnType<typeof vi.fn>).mockImplementation(
    () => { store = {}; }
  );
  Object.defineProperty(localStorage, 'length', {
    get: () => Object.keys(store).length,
    configurable: true,
  });
  (localStorage.key as ReturnType<typeof vi.fn>).mockImplementation(
    (index: number) => Object.keys(store)[index] ?? null
  );
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('PermissionsProvider single shared fetch (Req 11.2, 11.3)', () => {
  it('serves multiple consumers from a single permission fetch (no per-component fetch)', async () => {
    const permSet = buildPermissionSet('1', UserRole.INTERNAL_AUDITOR);
    mockApiGet.mockResolvedValue({ data: permSet });
    mockUser.user = { id: '1', role: UserRole.INTERNAL_AUDITOR, name: 'Test' };

    const { wrapper: QueryWrapper } = createWrapper();

    render(
      <QueryWrapper>
        <PermissionsProvider>
          <Consumer id="a" />
          <Consumer id="b" />
          <Consumer id="c" />
        </PermissionsProvider>
      </QueryWrapper>
    );

    // Wait until every consumer has resolved the shared state.
    await waitFor(() => {
      expect(screen.getByTestId('consumer-a')).toHaveTextContent('view:true');
      expect(screen.getByTestId('consumer-b')).toHaveTextContent('view:true');
      expect(screen.getByTestId('consumer-c')).toHaveTextContent('view:true');
    });

    // The permission fetch must happen exactly once across ALL consumers.
    expect(mockApiGet).toHaveBeenCalledTimes(1);
    expect(mockApiGet).toHaveBeenCalledWith(
      '/v1/permissions/me',
      expect.objectContaining({ timeout: 10000 })
    );
  });

  it('adding more consumers does not trigger additional fetches', async () => {
    const permSet = buildPermissionSet('1', UserRole.INTERNAL_AUDITOR);
    mockApiGet.mockResolvedValue({ data: permSet });
    mockUser.user = { id: '1', role: UserRole.INTERNAL_AUDITOR, name: 'Test' };

    const { wrapper: QueryWrapper } = createWrapper();

    render(
      <QueryWrapper>
        <PermissionsProvider>
          <Consumer id="1" />
          <Consumer id="2" />
          <Consumer id="3" />
          <Consumer id="4" />
          <Consumer id="5" />
        </PermissionsProvider>
      </QueryWrapper>
    );

    await waitFor(() => {
      expect(screen.getByTestId('consumer-5')).toHaveTextContent('view:true');
    });

    // Five consumers, still exactly one shared fetch.
    expect(mockApiGet).toHaveBeenCalledTimes(1);
  });
});
