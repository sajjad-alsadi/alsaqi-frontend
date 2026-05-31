import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  permissionAdminRateLimiter,
  resetPermissionAdminRateLimiterStore,
  stopPermissionAdminRateLimiterCleanup,
  getPermissionAdminRateLimitCount,
} from './permissionAdminRateLimiter';
import {
  createMockResponse,
  createMockNext,
  createAuthenticatedRequest,
  createMockRequest,
} from '../__tests__/helpers/apiTestUtils';

describe('Permission Admin Rate Limiter (Req 13.4, 13.5)', () => {
  beforeEach(() => {
    resetPermissionAdminRateLimiterStore();
  });

  afterEach(() => {
    resetPermissionAdminRateLimiterStore();
    stopPermissionAdminRateLimiterCleanup();
  });

  describe('Rate limit enforcement', () => {
    it('allows requests within the 100-request limit', () => {
      const req = createAuthenticatedRequest({ user: { id: 'user-rate-1' } });
      const res = createMockResponse();
      const next = createMockNext();

      permissionAdminRateLimiter(req, res as any, next);

      expect(next).toHaveBeenCalled();
      expect(getPermissionAdminRateLimitCount('user-rate-1')).toBe(1);
    });

    it('returns HTTP 429 when 100-request limit is exceeded', () => {
      const req = createAuthenticatedRequest({ user: { id: 'user-rate-2' } });

      // Exhaust the 100-request limit
      for (let i = 0; i < 100; i++) {
        const res = createMockResponse();
        const next = createMockNext();
        permissionAdminRateLimiter(req, res as any, next);
        expect(next).toHaveBeenCalled();
      }

      // 101st request should be rate limited
      const res = createMockResponse();
      const next = createMockNext();
      permissionAdminRateLimiter(req, res as any, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(429);
    });

    it('returns correct error body with code RATE_LIMIT_EXCEEDED', () => {
      const req = createAuthenticatedRequest({ user: { id: 'user-rate-3' } });

      // Exhaust the limit
      for (let i = 0; i < 100; i++) {
        const res = createMockResponse();
        const next = createMockNext();
        permissionAdminRateLimiter(req, res as any, next);
      }

      // Trigger rate limit
      const res = createMockResponse();
      const next = createMockNext();
      permissionAdminRateLimiter(req, res as any, next);

      expect(res._json).toEqual({
        error: 'Rate limit exceeded',
        code: 'RATE_LIMIT_EXCEEDED',
      });
    });

    it('includes Retry-After header when rate limited', () => {
      const req = createAuthenticatedRequest({ user: { id: 'user-rate-4' } });

      // Exhaust the limit
      for (let i = 0; i < 100; i++) {
        const res = createMockResponse();
        const next = createMockNext();
        permissionAdminRateLimiter(req, res as any, next);
      }

      // Trigger rate limit
      const res = createMockResponse();
      const next = createMockNext();
      permissionAdminRateLimiter(req, res as any, next);

      expect(res._headers['retry-after']).toBeDefined();
      const retryAfter = parseInt(res._headers['retry-after']);
      expect(retryAfter).toBeGreaterThan(0);
      // Should be at most 15 minutes (900 seconds)
      expect(retryAfter).toBeLessThanOrEqual(900);
    });
  });

  describe('Per-user isolation', () => {
    it('tracks limits independently per authenticated user', () => {
      const reqA = createAuthenticatedRequest({ user: { id: 'user-A' } });
      const reqB = createAuthenticatedRequest({ user: { id: 'user-B' } });

      // Exhaust user-A's limit
      for (let i = 0; i < 100; i++) {
        const res = createMockResponse();
        const next = createMockNext();
        permissionAdminRateLimiter(reqA, res as any, next);
      }

      // user-A should be rate limited
      const resA = createMockResponse();
      const nextA = createMockNext();
      permissionAdminRateLimiter(reqA, resA as any, nextA);
      expect(nextA).not.toHaveBeenCalled();
      expect(resA.statusCode).toBe(429);

      // user-B should still be allowed
      const resB = createMockResponse();
      const nextB = createMockNext();
      permissionAdminRateLimiter(reqB, resB as any, nextB);
      expect(nextB).toHaveBeenCalled();
    });
  });

  describe('Sliding window behavior', () => {
    it('allows requests again after the window expires', () => {
      vi.useFakeTimers();

      const req = createAuthenticatedRequest({ user: { id: 'user-window' } });

      // Exhaust the limit
      for (let i = 0; i < 100; i++) {
        const res = createMockResponse();
        const next = createMockNext();
        permissionAdminRateLimiter(req, res as any, next);
      }

      // Should be rate limited now
      const resLimited = createMockResponse();
      const nextLimited = createMockNext();
      permissionAdminRateLimiter(req, resLimited as any, nextLimited);
      expect(nextLimited).not.toHaveBeenCalled();
      expect(resLimited.statusCode).toBe(429);

      // Advance time by 15 minutes
      vi.advanceTimersByTime(15 * 60 * 1000);

      // Should be allowed again
      const resAllowed = createMockResponse();
      const nextAllowed = createMockNext();
      permissionAdminRateLimiter(req, resAllowed as any, nextAllowed);
      expect(nextAllowed).toHaveBeenCalled();

      vi.useRealTimers();
    });

    it('uses sliding window - partial expiry frees up slots', () => {
      vi.useFakeTimers();

      const req = createAuthenticatedRequest({ user: { id: 'user-sliding' } });

      // Make 50 requests at time 0
      for (let i = 0; i < 50; i++) {
        const res = createMockResponse();
        const next = createMockNext();
        permissionAdminRateLimiter(req, res as any, next);
      }

      // Advance 10 minutes
      vi.advanceTimersByTime(10 * 60 * 1000);

      // Make 50 more requests (total 100 in window)
      for (let i = 0; i < 50; i++) {
        const res = createMockResponse();
        const next = createMockNext();
        permissionAdminRateLimiter(req, res as any, next);
      }

      // Should be rate limited now (100 requests in window)
      const resLimited = createMockResponse();
      const nextLimited = createMockNext();
      permissionAdminRateLimiter(req, resLimited as any, nextLimited);
      expect(nextLimited).not.toHaveBeenCalled();

      // Advance 5 more minutes (total 15 from first batch)
      // The first 50 requests should now be outside the window
      vi.advanceTimersByTime(5 * 60 * 1000);

      // Should be allowed again (only 50 requests in window now)
      const resAllowed = createMockResponse();
      const nextAllowed = createMockNext();
      permissionAdminRateLimiter(req, resAllowed as any, nextAllowed);
      expect(nextAllowed).toHaveBeenCalled();

      vi.useRealTimers();
    });
  });

  describe('Unauthenticated requests', () => {
    it('passes through unauthenticated requests without rate limiting', () => {
      const req = createMockRequest({ ip: '10.0.0.1' });
      const res = createMockResponse();
      const next = createMockNext();

      permissionAdminRateLimiter(req, res as any, next);

      expect(next).toHaveBeenCalled();
      // Should not set any rate limit response
      expect(res.statusCode).toBe(200);
    });
  });

  describe('Helper functions', () => {
    it('getPermissionAdminRateLimitCount returns correct count', () => {
      const req = createAuthenticatedRequest({ user: { id: 'user-count' } });

      for (let i = 0; i < 5; i++) {
        const res = createMockResponse();
        const next = createMockNext();
        permissionAdminRateLimiter(req, res as any, next);
      }

      expect(getPermissionAdminRateLimitCount('user-count')).toBe(5);
    });

    it('resetPermissionAdminRateLimiterStore clears all entries', () => {
      const req = createAuthenticatedRequest({ user: { id: 'user-reset' } });
      const res = createMockResponse();
      const next = createMockNext();

      permissionAdminRateLimiter(req, res as any, next);
      expect(getPermissionAdminRateLimitCount('user-reset')).toBe(1);

      resetPermissionAdminRateLimiterStore();
      expect(getPermissionAdminRateLimitCount('user-reset')).toBe(0);
    });
  });
});
