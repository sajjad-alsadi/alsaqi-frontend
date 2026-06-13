import type { QueryClient } from '@tanstack/react-query';
import logger from './logger';

/**
 * Every storage-key prefix the application owns. Logout removes any key in
 * localStorage or sessionStorage that begins with one of these prefixes so that
 * no application-prefixed data survives a logout on a shared device.
 *
 * Keep this list in sync with the design's `APP_PREFIXES` (Requirement 10).
 */
export const APP_PREFIXES = [
  'user_permissions_',
  'filters_',
  'draft_',
  'scroll_',
  'audit_',
  'alsaqi_',
] as const;

export type AppPrefix = (typeof APP_PREFIXES)[number];

/**
 * Returns true when `key` begins with any application-owned prefix.
 */
function isAppPrefixedKey(key: string): boolean {
  return APP_PREFIXES.some((prefix) => key.startsWith(prefix));
}

/**
 * Removes every key matching an application prefix from a single Storage.
 *
 * Storage access can throw (private-mode quotas, disabled storage, security
 * errors), so all access is wrapped in try/catch and failures are logged
 * without interrupting the rest of the cleanup. Keys are collected before
 * removal to avoid mutating the store while iterating its live index.
 */
function removeByPrefix(storage: Storage): void {
  let keysToRemove: string[];
  try {
    keysToRemove = [];
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i);
      if (key !== null && isAppPrefixedKey(key)) {
        keysToRemove.push(key);
      }
    }
  } catch (err) {
    logger.warn('clearAppStorage: failed to enumerate storage keys', err);
    return;
  }

  for (const key of keysToRemove) {
    try {
      storage.removeItem(key);
    } catch (err) {
      logger.warn(`clearAppStorage: failed to remove key "${key}"`, err);
    }
  }
}

/**
 * Clears all user-scoped client state on logout (Requirement 10):
 *  - Empties the React Query cache (10.1) when a QueryClient is provided.
 *  - Removes every application-prefixed key from localStorage and
 *    sessionStorage (10.2–10.5), leaving no application-prefixed key behind.
 *
 * Storage access is wrapped in try/catch so a failure in one store never
 * prevents the others from being cleared.
 *
 * @param queryClient Optional React Query client whose cache should be cleared.
 */
export function clearAppStorage(queryClient?: QueryClient): void {
  if (queryClient) {
    try {
      queryClient.clear();
    } catch (err) {
      logger.warn('clearAppStorage: failed to clear React Query cache', err);
    }
  }

  try {
    if (typeof localStorage !== 'undefined' && localStorage) {
      removeByPrefix(localStorage);
    }
  } catch (err) {
    logger.warn('clearAppStorage: localStorage unavailable', err);
  }

  try {
    if (typeof sessionStorage !== 'undefined' && sessionStorage) {
      removeByPrefix(sessionStorage);
    }
  } catch (err) {
    logger.warn('clearAppStorage: sessionStorage unavailable', err);
  }
}

export default clearAppStorage;
