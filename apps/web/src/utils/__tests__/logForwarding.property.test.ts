/**
 * Property-based tests for structured-log forwarding routing.
 *
 * Feature: web-production-readiness-remediation, Property 8: Log forwarding routes
 * by level and warn-configuration
 *
 * Property 8: Log forwarding routes by level and warn-configuration
 *   - An entry is forwarded to the aggregation pipeline if and only if its level
 *     is `error`, or its level is `warn` and `forwardWarn` is enabled. Entries of
 *     any other level (`debug`/`info`) are never forwarded.
 *   **Validates: Requirements 18.2, 18.3**
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { shouldForward, type LogLevel } from '../logger';

// ─── Arbitraries ────────────────────────────────────────────────────────────

/** Arbitrary over all supported log levels. */
const arbLevel: fc.Arbitrary<LogLevel> = fc.constantFrom<LogLevel>(
  'debug',
  'info',
  'warn',
  'error',
);

/** Arbitrary over the `forwardWarn` configuration flag. */
const arbForwardWarn: fc.Arbitrary<boolean> = fc.boolean();

// ─── Property 8: routing by level and warn-configuration ──────────────────────

describe('Feature: web-production-readiness-remediation, Property 8: Log forwarding routes by level and warn-configuration', () => {
  it('forwards iff level is error, or level is warn with forwardWarn enabled', () => {
    fc.assert(
      fc.property(arbLevel, arbForwardWarn, (level, forwardWarn) => {
        const expected = level === 'error' || (level === 'warn' && forwardWarn);
        expect(shouldForward(level, forwardWarn)).toBe(expected);
      }),
      { numRuns: 200 },
    );
  });

  it('always forwards error-level entries regardless of forwardWarn', () => {
    fc.assert(
      fc.property(arbForwardWarn, (forwardWarn) => {
        expect(shouldForward('error', forwardWarn)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('forwards warn-level entries iff forwardWarn is enabled', () => {
    fc.assert(
      fc.property(arbForwardWarn, (forwardWarn) => {
        expect(shouldForward('warn', forwardWarn)).toBe(forwardWarn);
      }),
      { numRuns: 100 },
    );
  });

  it('never forwards debug/info entries regardless of forwardWarn', () => {
    fc.assert(
      fc.property(
        fc.constantFrom<LogLevel>('debug', 'info'),
        arbForwardWarn,
        (level, forwardWarn) => {
          expect(shouldForward(level, forwardWarn)).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });
});
