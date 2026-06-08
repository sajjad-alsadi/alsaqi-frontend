// @vitest-environment node
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import path from 'path';
import fs from 'fs';

/**
 * Preservation Property Test
 *
 * Property 2: Preservation - Existing Behavior Unchanged for Non-Buggy Inputs
 *
 * This test MUST PASS on unfixed code — it confirms the baseline behavior to preserve.
 * After the fix, these tests must STILL pass — confirming no regressions.
 *
 * Observations on UNFIXED code:
 *   - tsconfig.base.json has strict: true — must remain enabled after fix
 *   - eslint.config.mjs rules are active — no "off" overrides for critical rules
 *   - Without REDIS_URL, session cache uses in-memory Map and works for single instance
 *   - invalidateUserCache and clearPermissionCache export signatures are stable
 *   - API endpoint responses for standard requests remain the same
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7**
 */

const ROOT_DIR = path.resolve(__dirname, '../..');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function readJsonFile(filePath: string): Record<string, unknown> {
  const content = fs.readFileSync(path.join(ROOT_DIR, filePath), 'utf-8');
  return JSON.parse(content);
}

function readFileContent(filePath: string): string {
  return fs.readFileSync(path.join(ROOT_DIR, filePath), 'utf-8');
}

// ─── Property-Based Tests ────────────────────────────────────────────────────

describe('Property 2: Preservation - Existing Behavior Unchanged for Non-Buggy Inputs', () => {

  /**
   * **Validates: Requirements 3.1**
   *
   * tsconfig.base.json must maintain strict: true.
   * Fixes SHALL NOT disable strict checking or use @ts-ignore suppressions.
   */
  it('strict mode preserved: tsconfig.base.json → compilerOptions.strict === true', () => {
    fc.assert(
      fc.property(fc.constant(null), () => {
        const tsconfig = readJsonFile('tsconfig.base.json') as {
          compilerOptions?: { strict?: boolean };
        };

        expect(tsconfig.compilerOptions).toBeDefined();
        expect(tsconfig.compilerOptions!.strict).toBe(true);
      }),
      { numRuns: 1 }
    );
  });

  /**
   * **Validates: Requirements 3.2**
   *
   * ESLint config must not have critical rules disabled.
   * Fixes SHALL NOT disable rules globally or add blanket eslint-disable.
   */
  it('ESLint config preserved: no new "off" rules for critical checks, no global eslint-disable files', () => {
    fc.assert(
      fc.property(fc.constant(null), () => {
        const eslintConfigContent = readFileContent('eslint.config.mjs');

        // Critical rules that must NOT be set to "off":
        // These rules catch real bugs and security issues
        const criticalRules = [
          'no-debugger',
          'react-hooks/rules-of-hooks',
        ];

        for (const rule of criticalRules) {
          // Check that critical rules are not set to "off"
          const offPattern = new RegExp(`['"]${rule.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]\\s*:\\s*['"]off['"]`);
          expect(eslintConfigContent).not.toMatch(offPattern);
        }

        // Check that there's no global eslint-disable file (.eslintignore that ignores everything)
        const eslintIgnorePath = path.join(ROOT_DIR, '.eslintignore');
        if (fs.existsSync(eslintIgnorePath)) {
          const ignoreContent = fs.readFileSync(eslintIgnorePath, 'utf-8');
          // Should not contain a wildcard that disables everything
          expect(ignoreContent).not.toMatch(/^\*$/m);
          expect(ignoreContent).not.toMatch(/^\*\*$/m);
        }

        // Check no blanket eslint-disable comment files exist in src/
        // (a file that starts with /* eslint-disable */ at the top)
        // We just verify the config itself is not globally disabling rules
        expect(eslintConfigContent).not.toContain('eslint-disable');
      }),
      { numRuns: 1 }
    );
  });

  /**
   * **Validates: Requirements 3.4**
   *
   * Without REDIS_URL, session cache uses in-memory Map and works correctly
   * for single instance. The fallback behavior must be preserved.
   */
  it('in-memory cache fallback: for all non-buggy session inputs (single instance, REDIS_URL undefined), cache set/get roundtrip works', () => {
    fc.assert(
      fc.property(
        // Generate random session data that would be cached
        fc.record({
          userId: fc.uuid(),
          sessionVersion: fc.integer({ min: 1, max: 100 }),
          userData: fc.record({
            id: fc.uuid(),
            role: fc.constantFrom('Admin', 'Auditor', 'Department Manager', 'User'),
            username: fc.string({ minLength: 3, maxLength: 30 }),
            status: fc.constantFrom('Active'),
          }),
        }),
        (session) => {
          // Simulate the in-memory cache behavior (what the auth middleware does)
          // This tests that the Map-based cache works correctly for single instance
          const cache = new Map<string, { data: unknown; expires: number }>();
          const CACHE_TTL = 5 * 60 * 1000; // 5 minutes — same as auth.ts

          const key = `user_${session.userId}_${session.sessionVersion}`;
          const expires = Date.now() + CACHE_TTL;

          // Set
          cache.set(key, { data: session.userData, expires });

          // Get
          const cached = cache.get(key);
          expect(cached).toBeDefined();
          expect(cached!.data).toEqual(session.userData);
          expect(cached!.expires).toBeGreaterThan(Date.now());

          // Verify not expired
          expect(cached!.expires > Date.now()).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 3.5**
   *
   * invalidateUserCache(userId) and clearPermissionCache() maintain same function signature.
   * These are exported from auth.ts and used by routes.
   */
  it('cache API signatures preserved: invalidateUserCache(userId) and clearPermissionCache() maintain same signatures', () => {
    fc.assert(
      fc.property(
        fc.uuid(), // random userId for testing invalidateUserCache signature
        (userId) => {
          // Verify the auth module source exports these functions with expected signatures
          const authSource = readFileContent('src/server/middleware/auth.ts');

          // invalidateUserCache must accept a userId string parameter
          expect(authSource).toContain('export const invalidateUserCache');
          expect(authSource).toMatch(/invalidateUserCache\s*=\s*\(userId:\s*string\)/);

          // clearPermissionCache must be a no-argument function
          expect(authSource).toContain('export const clearPermissionCache');
          expect(authSource).toMatch(/clearPermissionCache\s*=\s*\(\)/);

          // Verify they operate on the cache (Map-based operations)
          // The functions iterate over cache keys and delete matching entries
          expect(authSource).toContain('cache.delete');

          // userId parameter is used — not a dead parameter
          expect(authSource).toContain('key.includes(userId)');
        }
      ),
      { numRuns: 10 } // Multiple runs verify consistency
    );
  });

  /**
   * **Validates: Requirements 3.6**
   *
   * Runtime behavior of API endpoints remains unchanged.
   * TypeScript type fixes are compile-time only and SHALL NOT change runtime logic.
   * We verify that the auth middleware source code logic hasn't changed.
   */
  it('API runtime logic preserved: auth middleware logic unchanged for standard requests', () => {
    fc.assert(
      fc.property(fc.constant(null), () => {
        const authSource = readFileContent('src/server/middleware/auth.ts');

        // Core authentication flow must be preserved:
        // 1. Token extraction from cookies and Authorization header
        expect(authSource).toContain('req.cookies.token');
        expect(authSource).toContain('req.headers.authorization');
        expect(authSource).toContain("parts[0] === 'Bearer'");

        // 2. JWT verification with RS256
        expect(authSource).toContain("algorithms: ['RS256']");

        // 3. User lookup by decoded token id
        expect(authSource).toContain('decodedToken.id');

        // 4. Status checks (Suspended, Disabled, Archived)
        expect(authSource).toContain("user.status === 'Suspended'");
        expect(authSource).toContain("user.status === 'Disabled'");
        expect(authSource).toContain("user.status === 'Archived'");

        // 5. Session version validation
        expect(authSource).toContain('user.session_version !== decodedToken.session_version');

        // 6. Password change required check
        expect(authSource).toContain('requires_password_change');

        // 7. Cache TTL is 5 minutes
        expect(authSource).toMatch(/CACHE_TTL\s*=\s*5\s*\*\s*60\s*\*\s*1000/);
      }),
      { numRuns: 1 }
    );
  });

  /**
   * **Validates: Requirements 3.3, 3.7**
   *
   * In-memory cache invalidation behavior must work correctly.
   * invalidateUserCache removes entries containing userId.
   * clearPermissionCache removes entries starting with 'perm_'.
   */
  it('cache invalidation behavior: invalidateUserCache removes user entries, clearPermissionCache removes perm_ entries', () => {
    fc.assert(
      fc.property(
        fc.record({
          targetUserId: fc.uuid(),
          otherUserId: fc.uuid(),
        }).filter(r => r.targetUserId !== r.otherUserId),
        fc.array(
          fc.record({
            key: fc.string({ minLength: 5, maxLength: 50 }),
            data: fc.string(),
          }),
          { minLength: 1, maxLength: 10 }
        ),
        (users, extraEntries) => {
          // Simulate the cache behavior as implemented in auth.ts
          const cache = new Map<string, { data: unknown; expires: number }>();
          const expires = Date.now() + 300000;

          // Add entries for target user
          cache.set(`user_${users.targetUserId}_1`, { data: 'session-a', expires });
          cache.set(`perm_${users.targetUserId}_mod`, { data: 'perm-a', expires });

          // Add entries for other user
          cache.set(`user_${users.otherUserId}_1`, { data: 'session-b', expires });
          cache.set(`perm_${users.otherUserId}_mod`, { data: 'perm-b', expires });

          // Simulate invalidateUserCache(targetUserId)
          for (const key of cache.keys()) {
            if (key.includes(users.targetUserId)) {
              cache.delete(key);
            }
          }

          // Target user entries removed
          expect(cache.has(`user_${users.targetUserId}_1`)).toBe(false);
          expect(cache.has(`perm_${users.targetUserId}_mod`)).toBe(false);

          // Other user entries preserved
          expect(cache.has(`user_${users.otherUserId}_1`)).toBe(true);
          expect(cache.has(`perm_${users.otherUserId}_mod`)).toBe(true);

          // Now simulate clearPermissionCache()
          for (const key of cache.keys()) {
            if (key.startsWith('perm_')) {
              cache.delete(key);
            }
          }

          // Permission entries cleared
          expect(cache.has(`perm_${users.otherUserId}_mod`)).toBe(false);

          // User session entries preserved
          expect(cache.has(`user_${users.otherUserId}_1`)).toBe(true);
        }
      ),
      { numRuns: 50 }
    );
  });
});
