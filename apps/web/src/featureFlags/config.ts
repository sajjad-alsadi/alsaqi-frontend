/**
 * Feature flag configuration source.
 *
 * Config-first and dependency-free: registered flags and their safe defaults
 * live here, and configured values are read from the `VITE_FEATURE_FLAGS` env
 * entry (a JSON object of `{ "flagKey": boolean }`). This avoids a heavy SDK and
 * respects the app's air-gap needs.
 */

import { getEnvVar } from '../utils/env';
import type { FeatureFlagConfig, FlagKey } from './types';

/**
 * Registered feature flags and their safe defaults.
 *
 * Every flag the app gates on SHOULD be registered here so that a missing or
 * unretrievable configured value resolves to a known-safe state. Defaults are
 * conservative (a feature is off until proven safe to enable).
 */
export const DEFAULT_FLAGS: Record<FlagKey, boolean> = {};

/**
 * Parse a JSON string of `{ "flagKey": boolean }` into a flag map. Non-boolean
 * entries are ignored, and any parse error yields an empty map (so a malformed
 * config never throws and always falls back to defaults).
 */
export function parseFlagsFromJson(raw: string | undefined): Record<FlagKey, boolean> {
  if (!raw) return {};

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};

    const result: Record<FlagKey, boolean> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === 'boolean') {
        result[key] = value;
      }
    }
    return result;
  } catch {
    return {};
  }
}

/**
 * Build the active feature flag configuration: resolved values from the env
 * source merged with the registered safe defaults.
 */
export function loadFeatureFlagConfig(
  defaults: Record<FlagKey, boolean> = DEFAULT_FLAGS,
): FeatureFlagConfig {
  const flags = parseFlagsFromJson(getEnvVar('VITE_FEATURE_FLAGS'));
  return { flags, defaults: { ...defaults } };
}
