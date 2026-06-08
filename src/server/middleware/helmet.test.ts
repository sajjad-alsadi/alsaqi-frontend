// @vitest-environment node
import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createHelmetMiddleware } from './helmet';

function createTestApp(env: string) {
  const app = express();
  app.use(createHelmetMiddleware(env));
  app.get('/test', (req, res) => {
    res.json({ ok: true });
  });
  return app;
}

describe('Helmet middleware', () => {
  describe('production environment', () => {
    const app = createTestApp('production');

    it('sets X-Content-Type-Options to nosniff', async () => {
      const res = await request(app).get('/test');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
    });

    it('sets X-Frame-Options to DENY', async () => {
      const res = await request(app).get('/test');
      expect(res.headers['x-frame-options']).toBe('DENY');
    });

    it('removes X-Powered-By header', async () => {
      const res = await request(app).get('/test');
      expect(res.headers['x-powered-by']).toBeUndefined();
    });

    it('sets Referrer-Policy to strict-origin-when-cross-origin', async () => {
      const res = await request(app).get('/test');
      expect(res.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    });

    it('sets Strict-Transport-Security with correct values', async () => {
      const res = await request(app).get('/test');
      const hsts = res.headers['strict-transport-security'];
      expect(hsts).toBeDefined();
      expect(hsts).toContain('max-age=31536000');
      expect(hsts).toContain('includeSubDomains');
      expect(hsts).toContain('preload');
    });

    it('sets Content-Security-Policy with expected directives', async () => {
      const res = await request(app).get('/test');
      const csp = res.headers['content-security-policy'];
      expect(csp).toBeDefined();
      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain("script-src 'self'");
      expect(csp).toContain("style-src 'self' 'unsafe-inline' https://fonts.googleapis.com");
      expect(csp).toContain("font-src 'self' https://fonts.gstatic.com");
      expect(csp).toContain("img-src 'self' data: blob:");
      expect(csp).toContain("connect-src 'self' ws: wss:");
      expect(csp).toContain("frame-ancestors 'none'");
      expect(csp).toContain("base-uri 'self'");
      expect(csp).toContain("form-action 'self'");
      expect(csp).toContain("object-src 'none'");
    });

    it('sets Cross-Origin-Opener-Policy to same-origin', async () => {
      const res = await request(app).get('/test');
      expect(res.headers['cross-origin-opener-policy']).toBe('same-origin');
    });

    it('sets Cross-Origin-Resource-Policy to same-origin', async () => {
      const res = await request(app).get('/test');
      expect(res.headers['cross-origin-resource-policy']).toBe('same-origin');
    });
  });

  describe('development environment', () => {
    const app = createTestApp('development');

    it('does NOT set Strict-Transport-Security in development', async () => {
      const res = await request(app).get('/test');
      expect(res.headers['strict-transport-security']).toBeUndefined();
    });

    it('still sets X-Content-Type-Options in development', async () => {
      const res = await request(app).get('/test');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
    });

    it('still sets X-Frame-Options in development', async () => {
      const res = await request(app).get('/test');
      expect(res.headers['x-frame-options']).toBe('DENY');
    });

    it('does NOT set Content-Security-Policy in development (avoids HMR/dev tool conflicts)', async () => {
      const res = await request(app).get('/test');
      expect(res.headers['content-security-policy']).toBeUndefined();
    });

    it('still removes X-Powered-By in development', async () => {
      const res = await request(app).get('/test');
      expect(res.headers['x-powered-by']).toBeUndefined();
    });

    it('still sets Referrer-Policy in development', async () => {
      const res = await request(app).get('/test');
      expect(res.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    });
  });

  describe('no regression: all previously set headers are still present', () => {
    const app = createTestApp('production');

    it('provides equivalent or better protection than manual headers', async () => {
      const res = await request(app).get('/test');

      // Previously set manually — all must still be present
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-frame-options']).toBe('DENY');
      expect(res.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
      expect(res.headers['strict-transport-security']).toContain('max-age=31536000');
      expect(res.headers['content-security-policy']).toBeDefined();
      expect(res.headers['x-powered-by']).toBeUndefined();

      // Additional headers provided by Helmet (improvement over manual)
      expect(res.headers['cross-origin-opener-policy']).toBe('same-origin');
      expect(res.headers['cross-origin-resource-policy']).toBe('same-origin');
    });

    it('CSP contains all directives from the previous manual implementation', async () => {
      const res = await request(app).get('/test');
      const csp = res.headers['content-security-policy'];

      // All directives from the old manual CSP header
      const requiredDirectives = [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "img-src 'self' data: blob:",
        "connect-src 'self' ws: wss:",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "object-src 'none'",
      ];

      for (const directive of requiredDirectives) {
        expect(csp).toContain(directive);
      }
    });
  });
});
