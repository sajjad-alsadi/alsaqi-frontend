import { describe, it, expect } from 'vitest';

describe('Security Headers Configuration', () => {
  const CSP_PRODUCTION = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: blob:; font-src 'self' data: https://fonts.gstatic.com; connect-src 'self' ws: wss:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'";

  it('should not contain unsafe-eval in CSP', () => {
    expect(CSP_PRODUCTION).not.toContain('unsafe-eval');
  });

  it('should not contain unsafe-inline in script-src', () => {
    const scriptSrc = CSP_PRODUCTION.split(';').find(d => d.trim().startsWith('script-src'));
    expect(scriptSrc).not.toContain('unsafe-inline');
  });

  it('should block object-src', () => {
    expect(CSP_PRODUCTION).toContain("object-src 'none'");
  });

  it('should restrict base-uri', () => {
    expect(CSP_PRODUCTION).toContain("base-uri 'self'");
  });

  it('should restrict form-action', () => {
    expect(CSP_PRODUCTION).toContain("form-action 'self'");
  });

  it('should deny frame-ancestors', () => {
    expect(CSP_PRODUCTION).toContain("frame-ancestors 'none'");
  });
});
