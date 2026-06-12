// @vitest-environment jsdom
/**
 * Tests for the Auth React Query hooks.
 * Validates: Requirements 10.1
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

// ─── Mock the composed API module ──────────────────────────────────────────────
const authMock = vi.hoisted(() => ({
  login: vi.fn(),
  register: vi.fn(),
  refresh: vi.fn(),
  logout: vi.fn(),
  changePassword: vi.fn(),
}));

vi.mock('../../index', () => ({
  api: { auth: authMock },
}));

import {
  useLogin,
  useRegister,
  useRefreshToken,
  useLogout,
  useChangePassword,
  authKeys,
} from '../useAuth';
import { createTestQueryClient, createWrapper } from './queryWrapper';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('authKeys', () => {
  it('builds stable query keys', () => {
    expect(authKeys.all).toEqual(['auth']);
    expect(authKeys.currentUser()).toEqual(['auth', 'current-user']);
  });
});

describe('useLogin', () => {
  it('calls api.auth.login and resolves with data on success', async () => {
    const response = { token: 'abc', user: { id: '1' } };
    authMock.login.mockResolvedValue(response);
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useLogin(), { wrapper });
    result.current.mutate({ usernameOrEmail: 'u', password: 'p' } as never);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(authMock.login).toHaveBeenCalledWith({ usernameOrEmail: 'u', password: 'p' });
    expect(result.current.data).toEqual(response);
  });

  it('clears the query cache on successful login', async () => {
    authMock.login.mockResolvedValue({ token: 'abc' });
    const client = createTestQueryClient();
    client.setQueryData(['stale'], 'old-value');
    const { wrapper } = createWrapper(client);

    const { result } = renderHook(() => useLogin(), { wrapper });
    result.current.mutate({ usernameOrEmail: 'u', password: 'p' } as never);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(client.getQueryData(['stale'])).toBeUndefined();
  });

  it('surfaces an error when login fails', async () => {
    authMock.login.mockRejectedValue(new Error('invalid credentials'));
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useLogin(), { wrapper });
    result.current.mutate({ usernameOrEmail: 'u', password: 'bad' } as never);

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(Error);
  });
});

describe('useRegister', () => {
  it('calls api.auth.register with the payload', async () => {
    authMock.register.mockResolvedValue({ id: '1' });
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useRegister(), { wrapper });
    result.current.mutate({ email: 'a@b.com', password: 'p' } as never);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(authMock.register).toHaveBeenCalledWith({ email: 'a@b.com', password: 'p' });
  });
});

describe('useRefreshToken', () => {
  it('calls api.auth.refresh with the refresh token', async () => {
    authMock.refresh.mockResolvedValue({ token: 'new' });
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useRefreshToken(), { wrapper });
    result.current.mutate({ refreshToken: 'r1' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(authMock.refresh).toHaveBeenCalledWith({ refreshToken: 'r1' });
  });
});

describe('useLogout', () => {
  it('calls api.auth.logout and clears the cache on success', async () => {
    authMock.logout.mockResolvedValue(undefined);
    const client = createTestQueryClient();
    client.setQueryData(['stale'], 'old-value');
    const { wrapper } = createWrapper(client);

    const { result } = renderHook(() => useLogout(), { wrapper });
    result.current.mutate();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(authMock.logout).toHaveBeenCalledTimes(1);
    expect(client.getQueryData(['stale'])).toBeUndefined();
  });
});

describe('useChangePassword', () => {
  it('calls api.auth.changePassword with the payload', async () => {
    authMock.changePassword.mockResolvedValue({ success: true });
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useChangePassword(), { wrapper });
    result.current.mutate({ currentPassword: 'old', newPassword: 'new' } as never);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(authMock.changePassword).toHaveBeenCalledWith({
      currentPassword: 'old',
      newPassword: 'new',
    });
  });

  it('reports an error when the change fails', async () => {
    authMock.changePassword.mockRejectedValue(new Error('weak password'));
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useChangePassword(), { wrapper });
    result.current.mutate({ currentPassword: 'old', newPassword: 'x' } as never);

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
