import { useState, useEffect, useCallback, useRef } from 'react';
import { useUser } from '../context/UserContext';
import { useAppContext } from '../context/AppContext';
import { DEFAULT_PERMISSIONS, Module, Permission, Role } from '../permissions';
import { UserRole } from '../constants';
import { PermissionAction, UserPermissionSet } from '../permissions/types';
import api from '../api/httpClient';

const CACHE_KEY_PREFIX = 'user_permissions_';
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const REQUEST_TIMEOUT = 10_000; // 10 seconds

interface CachedPermissions {
  data: UserPermissionSet;
  timestamp: number;
  userId: string;
}

export interface UsePermissionsReturn {
  hasPermission(module: string, action: PermissionAction): boolean;
  canView(module: string): boolean;
  canCreate(module: string): boolean;
  canEdit(module: string): boolean;
  canDelete(module: string): boolean;
  canApprove(module: string): boolean;
  isLoading: boolean;
  isFallback: boolean;
  isCustomRole: boolean;
  permissions: UserPermissionSet | null;
  refetch(): Promise<void>;
}

/**
 * Gets the localStorage cache key for a given user ID.
 */
function getCacheKey(userId: string): string {
  return `${CACHE_KEY_PREFIX}${userId}`;
}

/**
 * Reads cached permissions from localStorage.
 * Returns null if cache is missing, expired, or belongs to a different user.
 */
function readCache(userId: string): UserPermissionSet | null {
  try {
    const raw = localStorage.getItem(getCacheKey(userId));
    if (!raw) return null;

    const cached: CachedPermissions = JSON.parse(raw);

    // Discard if user ID doesn't match
    if (cached.userId !== userId) {
      localStorage.removeItem(getCacheKey(userId));
      return null;
    }

    // Discard if expired
    if (Date.now() - cached.timestamp >= CACHE_TTL) {
      return null;
    }

    return cached.data;
  } catch {
    return null;
  }
}

/**
 * Writes permissions to localStorage cache.
 */
function writeCache(userId: string, data: UserPermissionSet): void {
  try {
    const cached: CachedPermissions = {
      data,
      timestamp: Date.now(),
      userId,
    };
    localStorage.setItem(getCacheKey(userId), JSON.stringify(cached));
  } catch {
    // localStorage may be full or unavailable - silently ignore
  }
}

/**
 * Clears any cached permissions that don't match the current user ID.
 * This handles the case where a different user authenticates on the same browser.
 */
function discardStaleCache(currentUserId: string): void {
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(CACHE_KEY_PREFIX) && key !== getCacheKey(currentUserId)) {
        keysToRemove.push(key);
      }
    }
    for (const key of keysToRemove) {
      localStorage.removeItem(key);
    }
  } catch {
    // Silently ignore localStorage errors
  }
}

/**
 * Builds a fallback UserPermissionSet from the static DEFAULT_PERMISSIONS matrix.
 */
function getStaticFallback(userId: string, role: string): UserPermissionSet {
  const rolePermissions = DEFAULT_PERMISSIONS[role as Role];
  const permissions: Record<string, PermissionAction[]> = {};

  if (rolePermissions) {
    for (const [module, actions] of Object.entries(rolePermissions)) {
      permissions[module] = [...actions] as PermissionAction[];
    }
  }

  return {
    userId,
    role,
    roleId: '',
    isCustomRole: false,
    permissions,
    overrides: [],
  };
}

/**
 * Determines if an HTTP status code is a 5xx server error.
 */
function is5xx(status: number | undefined): boolean {
  return status !== undefined && status >= 500 && status < 600;
}

/**
 * React hook that provides permission checks by fetching from the API
 * with localStorage caching and static matrix fallback.
 *
 * - Fetches from `/api/v1/permissions/me` on mount
 * - Caches in localStorage with 5-minute TTL keyed by user ID
 * - Falls back to DEFAULT_PERMISSIONS on network error or 5xx
 * - Triggers re-authentication on 401/403 (no fallback)
 * - Admin role always returns true for all checks
 * - Exposes isLoading, refetch(), and helper methods
 */
export const usePermissions = (): UsePermissionsReturn => {
  const { user } = useUser();
  const { logout } = useAppContext();
  const [permissions, setPermissions] = useState<UserPermissionSet | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isFallback, setIsFallback] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const hasFetchedRef = useRef(false);

  const userId = user?.id?.toString() ?? '';
  const userRole = user?.role ?? '';

  const fetchPermissions = useCallback(async (force = false) => {
    if (!user || !userId) {
      setIsLoading(false);
      return;
    }

    // Check cache first (unless forced refresh)
    if (!force) {
      const cached = readCache(userId);
      if (cached) {
        setPermissions(cached);
        setIsFallback(false);
        setIsLoading(false);
        return;
      }
    }

    // Abort any in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      setIsLoading(true);

      const response = await api.get('/v1/permissions/me', {
        signal: controller.signal,
        timeout: REQUEST_TIMEOUT,
      });

      const permData: UserPermissionSet = response.data;
      setPermissions(permData);
      setIsFallback(false);
      writeCache(userId, permData);
    } catch (error: any) {
      // Don't process aborted requests
      if (error?.code === 'ERR_CANCELED' || error?.name === 'CanceledError') {
        return;
      }

      const status = error?.response?.status;

      // 401/403: trigger re-authentication, do NOT fall back to static matrix
      if (status === 401 || status === 403) {
        logout();
        return;
      }

      // Network error, timeout, or 5xx: fall back to static matrix
      if (!status || is5xx(status) || error?.code === 'ECONNABORTED') {
        const fallback = getStaticFallback(userId, userRole);
        setPermissions(fallback);
        setIsFallback(true);
      }
    } finally {
      setIsLoading(false);
    }
  }, [user, userId, userRole, logout]);

  // Refetch method for forced refresh
  const refetch = useCallback(async () => {
    await fetchPermissions(true);
  }, [fetchPermissions]);

  // Fetch on mount and when user changes
  useEffect(() => {
    if (!user || !userId) {
      setPermissions(null);
      setIsLoading(false);
      return;
    }

    // Discard cached permissions from other users
    discardStaleCache(userId);

    // Only fetch once per user (or when user changes)
    hasFetchedRef.current = false;
    fetchPermissions(false);

    return () => {
      // Cleanup: abort in-flight request on unmount or user change
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [userId, fetchPermissions]);

  const hasPermission = (module: string, action: PermissionAction): boolean => {
    if (!user) return false;

    // Admin always has all permissions
    if (user.role === UserRole.ADMIN) return true;

    if (!permissions) return false;

    const modulePerms = permissions.permissions[module];
    return modulePerms?.includes(action) ?? false;
  };

  const canView = (module: string) => hasPermission(module, 'View');
  const canCreate = (module: string) => hasPermission(module, 'Create');
  const canEdit = (module: string) => hasPermission(module, 'Edit');
  const canDelete = (module: string) => hasPermission(module, 'Delete');
  const canApprove = (module: string) => hasPermission(module, 'Approve');

  return {
    hasPermission,
    canView,
    canCreate,
    canEdit,
    canDelete,
    canApprove,
    isLoading,
    isFallback,
    isCustomRole: permissions?.isCustomRole ?? false,
    permissions,
    refetch,
  };
};
