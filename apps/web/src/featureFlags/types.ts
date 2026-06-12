/**
 * Feature flag type contracts.
 *
 * The system is config-first and dependency-free: flag values are resolved from
 * a build-time/runtime config source, and every registered flag carries a safe
 * default that is used when its configured value is missing or unretrievable.
 */

export type FlagKey = string;

export interface FeatureFlagConfig {
  /** Resolved values from the config source (env / runtime JSON). */
  flags: Record<FlagKey, boolean>;
  /** Safe defaults, always present for every registered flag. */
  defaults: Record<FlagKey, boolean>;
}

export interface FeatureFlagApi {
  /**
   * Returns the configured value when present, otherwise the registered safe
   * default for the flag.
   */
  isEnabled(key: FlagKey): boolean;
  /** The active configuration (resolved flags + defaults). */
  config: FeatureFlagConfig;
}
