/**
 * React Query hooks for the Auth API module.
 *
 * Provides mutation hooks for authentication operations.
 * Validates: Requirements 4.7
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { LoginInput, RegisterInput, ChangePasswordInput } from '@alsaqi/shared';
import { api } from '../index';

// ─── Query Keys ───────────────────────────────────────────────────────────────

export const authKeys = {
  all: ['auth'] as const,
  currentUser: () => [...authKeys.all, 'current-user'] as const,
};

// ─── Hooks ────────────────────────────────────────────────────────────────────

/**
 * Login mutation. Clears all queries on success to force refetch with new auth state.
 */
export function useLogin() {
  const queryClient = useQueryClient();

  return useMutation({
    // @ts-expect-error -- react-query adds | undefined to optional fields, conflicts with exactOptionalPropertyTypes
    mutationFn: (data: LoginInput) => api.auth.login(data),
    onSuccess: () => {
      queryClient.clear();
    },
  });
}

/**
 * Register a new user account.
 */
export function useRegister() {
  return useMutation({
    // @ts-expect-error -- react-query adds | undefined to optional fields, conflicts with exactOptionalPropertyTypes
    mutationFn: (data: RegisterInput) => api.auth.register(data),
  });
}

/**
 * Refresh the authentication token.
 */
export function useRefreshToken() {
  return useMutation({
    mutationFn: (data: { refreshToken: string }) => api.auth.refresh(data),
  });
}

/**
 * Logout. Clears all queries on success.
 */
export function useLogout() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => api.auth.logout(),
    onSuccess: () => {
      queryClient.clear();
    },
  });
}

/**
 * Change the current user's password.
 */
export function useChangePassword() {
  return useMutation({
    mutationFn: (data: ChangePasswordInput) => api.auth.changePassword(data),
  });
}
