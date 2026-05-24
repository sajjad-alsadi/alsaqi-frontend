import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createRateLimiter,
  resetRateLimiterStore,
  stopRateLimiterCleanup,
} from './rateLimiter';
import {
  createMockRequest,
  createMockResponse,
  createMockNext,
  createAuthenticatedRequest,
} from '../__tests__/helpers/apiTestUtils';

describe('Per-User Rate Limiter Middleware', () => {
  let rateLimiter: ReturnType<typeof createRateLimiter>;

  beforeEach(() => {
    resetRateLimiterStore();
    rateLimiter = createRateLimiter({
      authenticatedLimit: 5,
      unauthenticatedLimit: 3,
      windowSeconds: 60,
    });
  });

  afterEach(() => {
    resetRateLimiterStore();
    stopRateLimiterCleanup();
  });

  describe('Authenticated users (keyed by user ID)', () => {
    it('allows requests within the limit', () => {
      const req = createAuthenticatedRequest({ user: { id: 'user-1' } });
      const res = createMockResponse();
      const next = createMockNext();

      rateLimiter(req, res as any, next);

      expect(next).toHaveBeenCalled();
      expect(res._headers['x-ratelimit-limit']).toBe('5');
      expect(res._headers['x-ratelimit-remaining']).toBe('4');
      expect(res._headers['x-ratelimit-reset']).toBeDefined();
    });

    it('returns 429 when limit is exceeded', () => {
      const req = createAuthenticatedRequest({ user: { id: 'user-2' } });

      // Exhaust the limit
      for (let i = 0; i < 5; i++) {
        const res = createMockResponse();
        const next = createMockNext();
        rateLimiter(req, res as any, next);
        expect(next).toHaveBeenCalled();
      }

      // Next request should be rate limited
      const res = createMockResponse();
      const next = createMockNext();
      rateLimiter(req, res as any, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(429);
      expect(res._json).toEqual({ error: 'Too many requests. Please try again later.' });
      expect(res._headers['retry-after']).toBeDefined();
      expect(parseInt(res._headers['retry-after'])).toBeGreaterThan(0);
    });

    it('uses user ID as key, not IP', () => {
      // Two users on same IP should have independent limits
      const req1 = createAuthenticatedRequest({
        user: { id: 'user-A' },
        ip: '192.168.1.1',
      });
      const req2 = createAuthenticatedRequest({
        user: { id: 'user-B' },
        ip: '192.168.1.1',
      });

      // Exhaust user-A's limit
      for (let i = 0; i < 5; i++) {
        const res = createMockResponse();
        const next = createMockNext();
        rateLimiter(req1, res as any, next);
      }

      // user-A should be rate limited
      const resA = createMockResponse();
      const nextA = createMockNext();
      rateLimiter(req1, resA as any, nextA);
      expect(nextA).not.toHaveBeenCalled();
      expect(resA.statusCode).toBe(429);

      // user-B should still be allowed
      const resB = createMockResponse();
      const nextB = createMockNext();
      rateLimiter(req2, resB as any, nextB);
      expect(nextB).toHaveBeenCalled();
      expect(resB._headers['x-ratelimit-remaining']).toBe('4');
    });
  });

  describe('Unauthenticated users (keyed by IP)', () => {
    it('allows requests within the limit', () => {
      const req = createMockRequest({ ip: '10.0.0.1' });
      const res = createMockResponse();
      const next = createMockNext();

      rateLimiter(req, res as any, next);

      expect(next).toHaveBeenCalled();
      expect(res._headers['x-ratelimit-limit']).toBe('3');
      expect(res._headers['x-ratelimit-remaining']).toBe('2');
    });

    it('returns 429 when limit is exceeded', () => {
      const req = createMockRequest({ ip: '10.0.0.2' });

      // Exhaust the limit
      for (let i = 0; i < 3; i++) {
        const res = createMockResponse();
        const next = createMockNext();
        rateLimiter(req, res as any, next);
      }

      // Next request should be rate limited
      const res = createMockResponse();
      const next = createMockNext();
      rateLimiter(req, res as any, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(429);
      expect(res._headers['retry-after']).toBeDefined();
    });

    it('uses lower limit than authenticated users', () => {
      const req = createMockRequest({ ip: '10.0.0.3' });
      const res = createMockResponse();
      const next = createMockNext();

      rateLimiter(req, res as any, next);

      expect(res._headers['x-ratelimit-limit']).toBe('3');
    });
  });

  describe('Per-user isolation (Requirement 14.4)', () => {
    it('one user exhausting limit does not affect others on same IP', () => {
      // Authenticated user exhausts their limit
      const authReq = createAuthenticatedRequest({
        user: { id: 'heavy-user' },
        ip: '192.168.1.100',
      });

      for (let i = 0; i < 5; i++) {
        const res = createMockResponse();
        const next = createMockNext();
        rateLimiter(authReq, res as any, next);
      }

      // Verify heavy-user is rate limited
      const resHeavy = createMockResponse();
      const nextHeavy = createMockNext();
      rateLimiter(authReq, resHeavy as any, nextHeavy);
      expect(nextHeavy).not.toHaveBeenCalled();

      // Another authenticated user on same IP should be fine
      const otherReq = createAuthenticatedRequest({
        user: { id: 'light-user' },
        ip: '192.168.1.100',
      });
      const resOther = createMockResponse();
      const nextOther = createMockNext();
      rateLimiter(otherReq, resOther as any, nextOther);
      expect(nextOther).toHaveBeenCalled();
      expect(resOther._headers['x-ratelimit-remaining']).toBe('4');
    });

    it('unauthenticated users on different IPs have independent limits', () => {
      const req1 = createMockRequest({ ip: '10.0.0.10' });
      const req2 = createMockRequest({ ip: '10.0.0.11' });

      // Exhaust IP 10.0.0.10
      for (let i = 0; i < 3; i++) {
        const res = createMockResponse();
        const next = createMockNext();
        rateLimiter(req1, res as any, next);
      }

      // IP 10.0.0.10 should be limited
      const res1 = createMockResponse();
      const next1 = createMockNext();
      rateLimiter(req1, res1 as any, next1);
      expect(next1).not.toHaveBeenCalled();

      // IP 10.0.0.11 should still be fine
      const res2 = createMockResponse();
      const next2 = createMockNext();
      rateLimiter(req2, res2 as any, next2);
      expect(next2).toHaveBeenCalled();
    });
  });

  describe('Response headers (Requirement 14.5)', () => {
    it('includes X-RateLimit-Limit header in every response', () => {
      const req = createAuthenticatedRequest({ user: { id: 'header-test' } });
      const res = createMockResponse();
      const next = createMockNext();

      rateLimiter(req, res as any, next);

      expect(res._headers['x-ratelimit-limit']).toBe('5');
    });

    it('includes X-RateLimit-Remaining header that decrements', () => {
      const req = createAuthenticatedRequest({ user: { id: 'remaining-test' } });

      for (let i = 0; i < 3; i++) {
        const res = createMockResponse();
        const next = createMockNext();
        rateLimiter(req, res as any, next);
        expect(res._headers['x-ratelimit-remaining']).toBe(String(5 - (i + 1)));
      }
    });

    it('includes X-RateLimit-Reset header as UTC epoch seconds', () => {
      const req = createAuthenticatedRequest({ user: { id: 'reset-test' } });
      const res = createMockResponse();
      const next = createMockNext();

      const beforeTime = Math.ceil(Date.now() / 1000);
      rateLimiter(req, res as any, next);
      const afterTime = Math.ceil(Date.now() / 1000) + 60;

      const resetValue = parseInt(res._headers['x-ratelimit-reset']);
      expect(resetValue).toBeGreaterThanOrEqual(beforeTime);
      expect(resetValue).toBeLessThanOrEqual(afterTime);
    });

    it('includes Retry-After header on 429 responses', () => {
      const req = createAuthenticatedRequest({ user: { id: 'retry-test' } });

      // Exhaust limit
      for (let i = 0; i < 5; i++) {
        const res = createMockResponse();
        const next = createMockNext();
        rateLimiter(req, res as any, next);
      }

      const res = createMockResponse();
      const next = createMockNext();
      rateLimiter(req, res as any, next);

      expect(res._headers['retry-after']).toBeDefined();
      const retryAfter = parseInt(res._headers['retry-after']);
      expect(retryAfter).toBeGreaterThan(0);
      expect(retryAfter).toBeLessThanOrEqual(60);
    });
  });

  describe('Default configuration', () => {
    it('uses 100 requests for authenticated users by default', () => {
      resetRateLimiterStore();
      const defaultLimiter = createRateLimiter();
      const req = createAuthenticatedRequest({ user: { id: 'default-auth' } });
      const res = createMockResponse();
      const next = createMockNext();

      defaultLimiter(req, res as any, next);

      expect(res._headers['x-ratelimit-limit']).toBe('100');
    });

    it('uses 50 requests for unauthenticated users by default', () => {
      resetRateLimiterStore();
      const defaultLimiter = createRateLimiter();
      const req = createMockRequest({ ip: '1.2.3.4' });
      const res = createMockResponse();
      const next = createMockNext();

      defaultLimiter(req, res as any, next);

      expect(res._headers['x-ratelimit-limit']).toBe('50');
    });
  });
});
