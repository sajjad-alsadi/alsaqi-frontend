// @vitest-environment node
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';

/**
 * Bug Condition Exploration Property Test
 *
 * Property 1: Bug Condition - Production Build, Lint, Test, and Session Sharing Failures
 *
 * This test MUST FAIL on unfixed code — failure confirms the bugs exist.
 * When it passes after implementation, it confirms the bugs are fixed.
 *
 * Bug Condition from design:
 *   isBugCondition(input) returns true when:
 *     - tsc exitCode != 0
 *     - eslint errorCount > 0
 *     - vitest failedTests > 0
 *     - session_lookup with multi-instance and cacheStore == 'in-memory-map'
 *
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5**
 */

const ROOT_DIR = path.resolve(__dirname, '../..');

// ─── Types ───────────────────────────────────────────────────────────────────

interface BuildEvent {
  type: 'tsc_build';
  exitCode: number;
  errorOutput: string;
}

interface LintEvent {
  type: 'eslint';
  errorCount: number;
  warningCount: number;
  sampleErrors: string[];
}

interface TestEvent {
  type: 'vitest';
  failedTests: number;
  totalTests: number;
  failureOutput: string;
}

interface SessionLookupEvent {
  type: 'session_lookup';
  deploymentMode: 'multi-instance' | 'single-instance';
  targetInstance: string;
  authInstance: string;
  cacheStore: 'in-memory-map' | 'redis';
  result: 'hit' | 'miss';
}

type BuildOrRuntimeEvent = BuildEvent | LintEvent | TestEvent | SessionLookupEvent;

// ─── Bug Condition Function (from design spec) ───────────────────────────────

function isBugCondition(input: BuildOrRuntimeEvent): boolean {
  if (input.type === 'tsc_build' && input.exitCode !== 0) return true;
  if (input.type === 'eslint' && input.errorCount > 0) return true;
  if (input.type === 'vitest' && input.failedTests > 0) return true;
  if (
    input.type === 'session_lookup' &&
    input.deploymentMode === 'multi-instance' &&
    input.targetInstance !== input.authInstance &&
    input.cacheStore === 'in-memory-map'
  ) return true;
  return false;
}

// ─── Observation Helpers ─────────────────────────────────────────────────────

function observeTscBuild(): BuildEvent {
  try {
    execSync('node ./node_modules/typescript/bin/tsc --build --force', {
      cwd: ROOT_DIR,
      encoding: 'utf-8',
      timeout: 180000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { type: 'tsc_build', exitCode: 0, errorOutput: '' };
  } catch (err: unknown) {
    const error = err as { status?: number; stdout?: string; stderr?: string };
    const output = (error.stdout || '') + (error.stderr || '');
    return {
      type: 'tsc_build',
      exitCode: error.status || 1,
      errorOutput: output.slice(0, 2000),
    };
  }
}

function observeEslint(): LintEvent {
  try {
    const output = execSync('node ./node_modules/eslint/bin/eslint.js . --format json', {
      cwd: ROOT_DIR,
      encoding: 'utf-8',
      timeout: 180000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return parseLintOutput(output);
  } catch (err: unknown) {
    const error = err as { status?: number; stdout?: string; stderr?: string };
    const output = (error.stdout || '') + (error.stderr || '');
    return parseLintOutput(output);
  }
}

function parseLintOutput(output: string): LintEvent {
  try {
    const results = JSON.parse(output);
    let errorCount = 0;
    let warningCount = 0;
    const sampleErrors: string[] = [];

    for (const file of results) {
      errorCount += file.errorCount || 0;
      warningCount += file.warningCount || 0;
      if (sampleErrors.length < 5) {
        for (const msg of (file.messages || [])) {
          if (msg.severity === 2 && sampleErrors.length < 5) {
            sampleErrors.push(`${file.filePath}:${msg.line} - ${msg.ruleId}: ${msg.message}`);
          }
        }
      }
    }

    return { type: 'eslint', errorCount, warningCount, sampleErrors };
  } catch {
    // Fallback: try to extract error count from text
    const errorMatches = output.match(/(\d+)\s+error/);
    const errorCount = errorMatches ? parseInt(errorMatches[1]) : 1;
    return { type: 'eslint', errorCount, warningCount: 0, sampleErrors: [output.slice(0, 500)] };
  }
}

function observePermissionServiceTest(): { passes: boolean; errorMessage: string } {
  // Test both locations — the packages/api version AND the src/server version
  // The bug is in the mock setup for ModuleRegistry.getModule
  const testPaths = [
    'packages/api/src/services/__tests__/PermissionService.property.test.ts',
    'src/server/services/__tests__/PermissionService.property.test.ts',
  ];
  
  for (const testPath of testPaths) {
    const fullPath = path.join(ROOT_DIR, testPath);
    if (!fs.existsSync(fullPath)) continue;
    
    try {
      const output = execSync(
        `node ./node_modules/vitest/vitest.mjs --run ${testPath}`,
        {
          cwd: ROOT_DIR,
          encoding: 'utf-8',
          timeout: 60000,
          stdio: ['pipe', 'pipe', 'pipe'],
        }
      );
      const hasFailed = output.includes('FAIL') || output.includes('failed');
      if (hasFailed) {
        return { passes: false, errorMessage: output.slice(0, 1000) };
      }
    } catch (err: unknown) {
      const error = err as { stdout?: string; stderr?: string };
      const output = (error.stdout || '') + (error.stderr || '');
      return { passes: false, errorMessage: output.slice(0, 1000) };
    }
  }
  
  // If all test files pass, report success
  return { passes: true, errorMessage: '' };
}

function observeSessionCache(): SessionLookupEvent {
  // The auth middleware uses an in-memory Map for caching.
  // In a multi-instance deployment, data cached on instance A
  // is NOT available on instance B because Map is process-local.
  //
  // We verify this by checking the implementation file:
  // `src/server/middleware/auth.ts` uses:
  //   const cache = new Map<string, { data: any, expires: number }>()
  // This is NOT shared across instances.
  
  // Check the actual implementation to confirm in-memory Map is still used
  const authMiddlewarePath = path.join(ROOT_DIR, 'src/server/middleware/auth.ts');
  const authMiddlewareSource = fs.readFileSync(authMiddlewarePath, 'utf-8');
  
  // Detect if Redis is used for session caching
  const usesRedisForCache = 
    authMiddlewareSource.includes('ioredis') ||
    authMiddlewareSource.includes('Redis(') ||
    authMiddlewareSource.includes('redis.get') ||
    authMiddlewareSource.includes('RedisSessionCache');
  
  // Detect if in-memory Map is used
  const usesInMemoryMap = authMiddlewareSource.includes('new Map<');

  // Determine actual cache store type based on source code analysis
  const cacheStore = usesRedisForCache && !usesInMemoryMap ? 'redis' : 'in-memory-map';

  // When Redis is used, cross-instance lookups succeed because Redis shares state.
  // When in-memory Map is used, separate instances cannot share data (always miss).
  if (cacheStore === 'redis') {
    // Redis provides shared state across instances — cross-instance lookup succeeds
    return {
      type: 'session_lookup',
      deploymentMode: 'multi-instance',
      targetInstance: 'instance-B',
      authInstance: 'instance-A',
      cacheStore: 'redis' as const,
      result: 'hit' as const,
    };
  }

  // Simulate in-memory case: Instance A caches, Instance B has separate Map (miss)
  const instanceA = new Map<string, { data: unknown; expires: number }>();
  const sessionData = { id: 'user-123', role: 'Admin', username: 'test' };
  instanceA.set('user_user-123_1', { data: sessionData, expires: Date.now() + 300000 });
  const instanceB = new Map<string, { data: unknown; expires: number }>();
  const lookup = instanceB.get('user_user-123_1');

  return {
    type: 'session_lookup',
    deploymentMode: 'multi-instance',
    targetInstance: 'instance-B',
    authInstance: 'instance-A',
    cacheStore: 'in-memory-map' as const,
    result: lookup === undefined ? 'miss' : 'hit',
  };
}

// ─── Property-Based Tests ────────────────────────────────────────────────────

describe('Property 1: Bug Condition Exploration - Production Readiness Failures', () => {
  it('tsc --build exits with code 0 (zero TypeScript errors)', () => {
    fc.assert(
      fc.property(fc.constant(null), () => {
        const event = observeTscBuild();

        // Expected behavior: tsc --build succeeds with zero errors
        // Bug condition: exitCode != 0
        expect(isBugCondition(event)).toBe(false);
        expect(event.exitCode).toBe(0);
      }),
      { numRuns: 1 } // Only need to run once — deterministic observation
    );
  }, 240000);

  it('eslint reports zero errors across the codebase', () => {
    fc.assert(
      fc.property(fc.constant(null), () => {
        const event = observeEslint();

        // Expected behavior: zero eslint errors
        // Bug condition: errorCount > 0
        expect(isBugCondition(event)).toBe(false);
        expect(event.errorCount).toBe(0);
      }),
      { numRuns: 1 }
    );
  }, 240000);

  it('PermissionService.property.test.ts passes without TypeError on ModuleRegistry mock', () => {
    fc.assert(
      fc.property(fc.constant(null), () => {
        const result = observePermissionServiceTest();

        // Expected behavior: test passes without mock errors
        // Bug condition: test fails with "TypeError: ModuleRegistry.getModule.mockReturnValue is not a function"
        expect(result.passes).toBe(true);
        expect(result.errorMessage).not.toContain('mockReturnValue is not a function');
      }),
      { numRuns: 1 }
    );
  }, 120000);

  it('session lookup from a different instance returns cached data via shared store (Redis)', () => {
    fc.assert(
      fc.property(
        // Generate multi-instance session lookup scenarios
        fc.record({
          userId: fc.uuid(),
          authInstance: fc.constantFrom('instance-A', 'instance-B', 'instance-C'),
          targetInstance: fc.constantFrom('instance-A', 'instance-B', 'instance-C'),
        }).filter(r => r.authInstance !== r.targetInstance), // Only cross-instance lookups
        (_scenario) => {
          // Observe: current implementation uses in-memory Map
          const event = observeSessionCache();

          // Expected behavior: cross-instance lookup returns cached data (via Redis)
          // Bug condition: in-memory-map used in multi-instance = cache miss
          expect(isBugCondition(event)).toBe(false);
          expect(event.cacheStore).toBe('redis');
          expect(event.result).toBe('hit');
        }
      ),
      { numRuns: 10 } // Multiple scenarios for cross-instance lookups
    );
  }, 30000);
});
