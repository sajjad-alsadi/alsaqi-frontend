// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';

/**
 * Property Test: Missing Environment Variable Prevents Startup (Property 3)
 *
 * Feature: production-readiness-review
 * Property 3: Missing environment variable prevents startup
 *
 * **Validates: Requirements 5.3**
 *
 * For any single required variable removed from the environment,
 * validateRequiredEnv SHALL exit the process with code 1 and include
 * the variable name in the error message logged to console.error.
 */

import { validateRequiredEnv, REQUIRED_VARS } from '../envValidator';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Creates a valid environment object where all required variables are set
 * with values that meet their minimum length constraints.
 */
function createValidEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const req of REQUIRED_VARS) {
    const minLen = req.minLength ?? 10;
    // Generate a value that meets the minimum length constraint
    env[req.name] = 'x'.repeat(Math.max(minLen, 10));
  }
  return env;
}

// ─── Custom Arbitraries ──────────────────────────────────────────────────────

/** Generates the index of a required variable to remove */
const requiredVarIndexArb = fc.integer({ min: 0, max: REQUIRED_VARS.length - 1 });

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Property 3: Missing environment variable prevents startup', () => {
  let mockExit: ReturnType<typeof vi.spyOn>;
  let mockConsoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as never);
    mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    mockExit.mockRestore();
    mockConsoleError.mockRestore();
  });

  it('for any single required variable removed, validateRequiredEnv calls process.exit(1)', () => {
    fc.assert(
      fc.property(requiredVarIndexArb, (varIndex) => {
        // Reset mocks for each iteration
        mockExit.mockClear();
        mockConsoleError.mockClear();

        const validEnv = createValidEnv();
        const removedVarName = REQUIRED_VARS[varIndex].name;

        // Remove the selected variable
        delete validEnv[removedVarName];

        // validateRequiredEnv should call process.exit(1)
        expect(() => validateRequiredEnv(validEnv)).toThrow('process.exit called');
        expect(mockExit).toHaveBeenCalledWith(1);
      }),
      { numRuns: 100 }
    );
  });

  it('for any single required variable removed, the error message includes the variable name', () => {
    fc.assert(
      fc.property(requiredVarIndexArb, (varIndex) => {
        // Reset mocks for each iteration
        mockExit.mockClear();
        mockConsoleError.mockClear();

        const validEnv = createValidEnv();
        const removedVarName = REQUIRED_VARS[varIndex].name;

        // Remove the selected variable
        delete validEnv[removedVarName];

        // Call validateRequiredEnv (will throw due to mocked process.exit)
        try {
          validateRequiredEnv(validEnv);
        } catch {
          // Expected — process.exit mock throws
        }

        // Verify that the console.error output includes the missing variable name
        expect(mockConsoleError).toHaveBeenCalled();
        const errorOutput = mockConsoleError.mock.calls
          .map((call) => call.join(' '))
          .join(' ');
        expect(errorOutput).toContain(removedVarName);
      }),
      { numRuns: 100 }
    );
  });

  it('with all required variables present and valid, validateRequiredEnv does not exit', () => {
    fc.assert(
      fc.property(fc.constant(null), () => {
        mockExit.mockClear();
        mockConsoleError.mockClear();

        const validEnv = createValidEnv();

        // Should not throw or call process.exit
        expect(() => validateRequiredEnv(validEnv)).not.toThrow();
        expect(mockExit).not.toHaveBeenCalled();
      }),
      { numRuns: 100 }
    );
  });
});
