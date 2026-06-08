/**
 * Property-based tests for the Vite env validator plugin.
 *
 * Property 4: Frontend build fails on missing required env vars
 *   - For any required variable (VITE_API_URL) that is undefined, verify the plugin
 *     throws an error naming the missing variable.
 *   **Validates: Requirements 6.4**
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';
import { envValidatorPlugin } from '../vite-env-validator';

/**
 * Simulates the Vite configResolved hook by extracting the hook function
 * from the plugin and calling it with a mock ResolvedConfig.
 */
function getConfigResolvedHook() {
  const plugin = envValidatorPlugin();
  // The configResolved hook is defined directly on the plugin object
  return plugin.configResolved as (config: {
    command: 'build' | 'serve';
    env: Record<string, string | undefined>;
  }) => void;
}

describe('Property 4: Frontend build fails on missing required env vars', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Clear VITE_API_URL from process.env to simulate missing env var
    delete process.env.VITE_API_URL;
  });

  afterEach(() => {
    // Restore original env
    process.env = { ...originalEnv };
  });

  it('throws an error naming VITE_API_URL when it is undefined in both process.env and config.env during build', () => {
    const configResolved = getConfigResolvedHook();

    fc.assert(
      fc.property(
        // Generate arbitrary config.env objects that do NOT contain VITE_API_URL
        // (or contain it as empty/undefined)
        fc.record({
          // Include random other env vars to prove only VITE_API_URL matters
          VITE_OTHER_VAR: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
          VITE_RANDOM: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
          NODE_ENV: fc.option(fc.constantFrom('development', 'production', 'test'), { nil: undefined }),
        }),
        (envVars) => {
          // Ensure VITE_API_URL is NOT in process.env
          delete process.env.VITE_API_URL;

          // Build a config where VITE_API_URL is absent from config.env
          const config = {
            command: 'build' as const,
            env: envVars as Record<string, string | undefined>,
          };

          // The plugin should throw during build when VITE_API_URL is missing
          expect(() => configResolved(config)).toThrow();

          // Verify the error message names the missing variable
          try {
            configResolved(config);
          } catch (error) {
            const message = (error as Error).message;
            expect(message).toContain('VITE_API_URL');
            expect(message).toContain('[env-validator]');
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('does NOT throw when VITE_API_URL is present in process.env during build', () => {
    const configResolved = getConfigResolvedHook();

    fc.assert(
      fc.property(
        // Generate non-empty values for VITE_API_URL in process.env
        fc.string({ minLength: 1, maxLength: 200 }),
        fc.record({
          OTHER_VAR: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
        }),
        (apiUrl, envVars) => {
          process.env.VITE_API_URL = apiUrl;

          const config = {
            command: 'build' as const,
            env: envVars as Record<string, string | undefined>,
          };

          // Should NOT throw when VITE_API_URL is set in process.env
          expect(() => configResolved(config)).not.toThrow();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('does NOT throw when VITE_API_URL is present in config.env during build', () => {
    const configResolved = getConfigResolvedHook();

    fc.assert(
      fc.property(
        // Generate non-empty values for VITE_API_URL in config.env
        fc.string({ minLength: 1, maxLength: 200 }),
        fc.record({
          OTHER_VAR: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
        }),
        (apiUrl, otherVars) => {
          // Ensure not in process.env
          delete process.env.VITE_API_URL;

          const config = {
            command: 'build' as const,
            env: { ...otherVars, VITE_API_URL: apiUrl } as Record<string, string | undefined>,
          };

          // Should NOT throw when VITE_API_URL is in config.env
          expect(() => configResolved(config)).not.toThrow();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('does NOT throw during serve command even when VITE_API_URL is missing', () => {
    const configResolved = getConfigResolvedHook();

    fc.assert(
      fc.property(
        fc.record({
          SOME_VAR: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
        }),
        (envVars) => {
          delete process.env.VITE_API_URL;

          const config = {
            command: 'serve' as const,
            env: envVars as Record<string, string | undefined>,
          };

          // Should NOT throw during dev serve
          expect(() => configResolved(config)).not.toThrow();
        }
      ),
      { numRuns: 100 }
    );
  });
});
