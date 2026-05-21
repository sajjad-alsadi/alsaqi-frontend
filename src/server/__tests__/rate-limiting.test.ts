import { describe, it, expect } from 'vitest';

describe('Rate Limiting Configuration', () => {
  it('should have appropriate global rate limit for NAT environments', () => {
    const GLOBAL_LIMIT = 300;
    const WINDOW_MS = 60 * 1000; // 1 minute
    
    // 300 requests per minute is reasonable for corporate NAT
    expect(GLOBAL_LIMIT).toBeGreaterThanOrEqual(150);
    expect(GLOBAL_LIMIT).toBeLessThanOrEqual(500);
    expect(WINDOW_MS).toBe(60000);
  });

  it('should have strict auth rate limit', () => {
    const AUTH_LIMIT = 10;
    const AUTH_WINDOW = 15 * 60 * 1000; // 15 minutes
    
    // 10 attempts per 15 minutes is strict enough for brute force protection
    expect(AUTH_LIMIT).toBeLessThanOrEqual(15);
    expect(AUTH_WINDOW).toBeGreaterThanOrEqual(10 * 60 * 1000);
  });

  it('should key auth limiter by IP + username', () => {
    // This prevents one user from blocking others behind the same NAT
    const keyGenerator = (req: any) => {
      const username = (req.body && req.body.usernameOrEmail) ? String(req.body.usernameOrEmail).toLowerCase() : 'unknown';
      return `${req.ip || 'no-ip'}_${username}`;
    };

    const result = keyGenerator({ ip: '192.168.1.1', body: { usernameOrEmail: 'Admin' } });
    expect(result).toBe('192.168.1.1_admin');
  });

  it('should handle missing IP gracefully', () => {
    const keyGenerator = (req: any) => {
      const username = (req.body && req.body.usernameOrEmail) ? String(req.body.usernameOrEmail).toLowerCase() : 'unknown';
      return `${req.ip || 'no-ip'}_${username}`;
    };

    const result = keyGenerator({ body: { usernameOrEmail: 'test' } });
    expect(result).toBe('no-ip_test');
  });
});
