/**
 * Pure feature-flag evaluation logic.
 *
 * Kept dependency-free and side-effect-free so it can be exercised directly by
 * property/unit tests without React or a config source.
 */

import type { FeatureFlagConfig, FlagKey } from './types';

/** Ultimate fallback when a flag has neither a configured value nor a default. */
const SAFE_DEFAULT = false;

/**
 * Resolve a flag value.
 *
 * Returns the configured value when it is a boolean; otherwise falls back to the
 * registered safe default for the key; when no default exists either, returns a
 * conservative `false`. This guarantees a defined result for every key even when
 * the configured value is missing or could not be retrieved.
 */
export function isEnabled(config: FeatureFlagConfig, key: FlagKey): boolean {
  const configured = config.flags[key];
  if (typeof configured === 'boolean') {
    return configured;
  }

  const fallback = config.defaults[key];
  return typeof fallback === 'boolean' ? fallback : SAFE_DEFAULT;
}
