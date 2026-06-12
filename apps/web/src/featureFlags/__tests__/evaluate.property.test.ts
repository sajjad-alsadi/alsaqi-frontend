/**
 * Property-based tests for feature-flag evaluation.
 *
 * Feature: web-production-readiness-remediation, Property 6: Feature flag falls back to a safe default
 *
 * Property 6: Feature flag falls back to a safe default
 *   For any feature-flag configuration and any flag key, `isEnabled(config, key)`
 *   returns the configured value when present (a boolean) and the registered safe
 *   default whenever the configured value is missing or cannot be retrieved; when
 *   neither is present it returns the conservative `false`.
 *   **Validates: Requirements 15.3**
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { isEnabled } from '../evaluate';
import type { FeatureFlagConfig } from '../types';

// ─── Arbitraries ────────────────────────────────────────────────────────────

/** Random flag keys, including overlapping names so collisions between maps occur. */
const arbKey = fc.constantFrom(
  'alpha',
  'beta',
  'gamma',
  'delta',
  'epsilon',
  'feature-x',
  'feature_y',
  'longFlagNameThatIsUnusual'
);

/** A map from a (possibly empty) subset of keys to boolean values. */
const arbBoolMap = fc.dictionary(arbKey, fc.boolean());

/** A full feature-flag config with arbitrary (and arbitrarily-missing) keys. */
const arbConfig: fc.Arbitrary<FeatureFlagConfig> = fc.record({
  flags: arbBoolMap,
  defaults: arbBoolMap,
});

describe('Property 6: Feature flag falls back to a safe default', () => {
  it('returns the configured value when present, else the safe default, else false', () => {
    fc.assert(
      fc.property(arbConfig, arbKey, (config, key) => {
        const result = isEnabled(config, key);

        // Result is always a defined boolean for every key.
        expect(typeof result).toBe('boolean');

        const configured = config.flags[key];
        const fallback = config.defaults[key];

        if (typeof configured === 'boolean') {
          // When flags[key] is a boolean, it is returned verbatim.
          expect(result).toBe(configured);
        } else if (typeof fallback === 'boolean') {
          // flags[key] absent but defaults[key] present → the registered default.
          expect(result).toBe(fallback);
        } else {
          // Both absent → the conservative safe default.
          expect(result).toBe(false);
        }
      }),
      { numRuns: 200 }
    );
  });

  it('returns false for keys missing from both flags and defaults', () => {
    fc.assert(
      fc.property(arbConfig, fc.string(), (config, rawKey) => {
        // Use a key guaranteed not to collide with the generated maps.
        const missingKey = `__never_present__${rawKey}`;
        fc.pre(!(missingKey in config.flags) && !(missingKey in config.defaults));

        expect(isEnabled(config, missingKey)).toBe(false);
      }),
      { numRuns: 200 }
    );
  });

  it('falls back to the default when the flag value is missing', () => {
    fc.assert(
      fc.property(arbKey, fc.boolean(), (key, defaultValue) => {
        const config: FeatureFlagConfig = {
          flags: {},
          defaults: { [key]: defaultValue },
        };

        expect(isEnabled(config, key)).toBe(defaultValue);
      }),
      { numRuns: 200 }
    );
  });
});
