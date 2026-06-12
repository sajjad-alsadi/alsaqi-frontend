/**
 * Feature flag system (config-first, dependency-free).
 *
 * Public surface:
 * - `FeatureFlagProvider` — exposes flag values to React components.
 * - `useFeatureFlag(key)` — read a single flag in a component.
 * - `<FeatureGate flag="x">` — render children only when a flag is enabled.
 * - `isEnabled(config, key)` — pure evaluation with safe-default fallback.
 */

export type { FlagKey, FeatureFlagConfig, FeatureFlagApi } from './types';
export { isEnabled } from './evaluate';
export { DEFAULT_FLAGS, loadFeatureFlagConfig, parseFlagsFromJson } from './config';
export { FeatureFlagProvider, useFeatureFlags, FeatureFlagContext } from './FeatureFlagProvider';
export { useFeatureFlag } from './useFeatureFlag';
export { FeatureGate } from './FeatureGate';
