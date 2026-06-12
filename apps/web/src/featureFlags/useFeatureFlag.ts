import type { FlagKey } from './types';
import { useFeatureFlags } from './FeatureFlagProvider';

/**
 * Returns the resolved value for a single feature flag: the configured value
 * when present, otherwise the registered safe default.
 */
export function useFeatureFlag(key: FlagKey): boolean {
  return useFeatureFlags().isEnabled(key);
}
