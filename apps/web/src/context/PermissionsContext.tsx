import React, {
  createContext,
  useContext,
  useEffect,
  useCallback,
  useMemo,
  ReactNode,
} from 'react';
import { useQuery } from '@tanstack/react-query';
import { useUser } from './UserContext';
import { useAppContext } from './AppContext';
import { DEFAULT_PERMISSIONS, Role } from '../permissions';
import { PermissionAction, UserPermissionSet } from '../permissions/types';
import { computeFallback } from '../permissions/fallback';
import api from '../api/httpClient';

const CACHE_KEY_PREFIX = 'user_permissions_';
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const REQUEST_TIMEOUT = 10_000; // 10 seconds

interface CachedPermissions {
  data: UserPermissionSet;
  timestamp: number;
  userId: string;
}

/**
 * The resolved permission state shared by every consumer of the provider.
 * `permissions` is the effective set (server-confirmed or a narrowing fallback);
 * `isFallback` flags whether the set was derived from the fallback path.
 */
interface ResolvedPermissions {
  permissions: UserPermissionSet | null;
  isFallback: boolean;
}

export interface PermissionsContextValue {
  /** Effective permission set for the current user, or null when unauthenticated/loading. */
  permissions: UserPermissionSet | null;
  /** True while the single shared permission fetch is in flight. */
  isLoading: boolean;
  /** True when the effective set was computed via the narrowing fallback path. */
  isFallback: boolean;
  /** Forces a fresh fetch, bypassing the localStorage cache. */
  refetch(): Promise<void>;
}

/** Gets the localStorage cache key for a given user ID. */
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

/** Writes permissions to localStorage cache. */
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
 * Builds the static role-default permission set from the DEFAULT_PERMISSIONS matrix.
 * Used as the `staticDefaults` input to the narrowing fallback.
 */
function getStaticFallback(userId: string, role: string): UserPermissionSet {
  const rolePermissions = DEFAULT_PERMISSIONS[role as Role];
  const permissions: Record<string, PermissionAction[]> = {};

  if (rolePermissions) {
    for (const [moduleName, actions] of Object.entries(rolePermissions)) {
      permissions[moduleName] = [...actions] as PermissionAction[];
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

/** Determines if an HTTP status code is a 5xx server error. */
function is5xx(status: number | undefined): boolean {
  return status !== undefined && status >= 500 && status < 600;
}

/**
 * The single permission fetch backing the provider. Resolves to the effective
 * permission set:
 * - Cache hit -> confirmed permissions (no fallback).
 * - API success -> confirmed permissions, written to cache (no fallback).
 * - 401/403 -> triggers re-authentication and rethrows (no fallback).
 * - Network/timeout/5xx -> narrowing fallback (intersection of static defaults
 *   and the last confirmed set, or read-only when nothing was confirmed).
 */
async function fetchResolvedPermissions(
  userId: string,
  userRole: string,
  signal: AbortSignal | undefined,
  logout: () => void | Promise<void>,
): Promise<ResolvedPermissions> {
  // Serve from the localStorage cache when it is still fresh.
  const cached = readCache(userId);
  if (cached) {
    return { permissions: cached, isFallback: false };
  }

  try {
    const response = await api.get('/v1/permissions/me', {
      ...(signal ? { signal } : {}),
      timeout: REQUEST_TIMEOUT,
    });

    const permData: UserPermissionSet = response.data;
    writeCache(userId, permData);
    return { permissions: permData, isFallback: false };
  } catch (error: any) {
    const status = error?.response?.status;

    // 401/403: trigger re-authentication, do NOT fall back.
    if (status === 401 || status === 403) {
      await logout();
      throw error;
    }

    // Network error, timeout, or 5xx: compute a narrowing fallback.
    if (!status || is5xx(status) || error?.code === 'ECONNABORTED') {
      const confirmed = readCache(userId);
      const staticDefaults = getStaticFallback(userId, userRole);
      return { permissions: computeFallback(confirmed, staticDefaults), isFallback: true };
    }

    throw error;
  }
}

const PermissionsContext = createContext<PermissionsContextValue | undefined>(undefined);

/**
 * Single source of truth for the current user's permissions (Req 11).
 *
 * Backs one React Query entry keyed `['permissions', userId]` so every consumer
 * resolves from one shared fetch — there are no per-component permission fetches.
 * On API failure the provider serves a narrowing fallback (Req 9) that never
 * widens access beyond the last confirmed set.
 */
export const PermissionsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user } = useUser();
  const { logout } = useAppContext();

  const userId = user?.id?.toString() ?? '';
  const userRole = user?.role ?? '';

  // Discard cached permissions belonging to other users on the same browser.
  useEffect(() => {
    if (userId) {
      discardStaleCache(userId);
    }
  }, [userId]);

  const query = useQuery({
    queryKey: ['permissions', userId],
    queryFn: ({ signal }) => fetchResolvedPermissions(userId, userRole, signal, logout),
    enabled: !!userId,
    staleTime: CACHE_TTL,
    retry: false,
  });

  const { refetch: queryRefetch } = query;

  const refetch = useCallback(async () => {
    if (userId) {
      try {
        localStorage.removeItem(getCacheKey(userId));
      } catch {
        // ignore localStorage errors
      }
    }
    await queryRefetch();
  }, [userId, queryRefetch]);

  const value = useMemo<PermissionsContextValue>(() => {
    const resolved = userId ? (query.data ?? null) : null;
    return {
      permissions: resolved?.permissions ?? null,
      isFallback: resolved?.isFallback ?? false,
      isLoading: !!userId && query.isLoading,
      refetch,
    };
  }, [userId, query.data, query.isLoading, refetch]);

  return <PermissionsContext.Provider value={value}>{children}</PermissionsContext.Provider>;
};

/**
 * Internal accessor for the shared permission state. `usePermissions` is the
 * public, ergonomic selector built on top of this.
 */
export const usePermissionsContext = (): PermissionsContextValue => {
  const context = useContext(PermissionsContext);
  if (!context) {
    throw new Error('usePermissionsContext must be used within PermissionsProvider');
  }
  return context;
};
