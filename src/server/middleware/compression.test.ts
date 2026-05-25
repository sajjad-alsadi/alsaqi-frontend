// @vitest-environment node
import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createCompressionMiddleware } from './compression';

/**
 * Creates a test Express app with compression middleware.
 * Routes return various content types and sizes for testing.
 */
function createTestApp() {
  const app = express();
  app.use(createCompressionMiddleware());

  // JSON endpoint returning large payload (> 1KB)
  app.get('/api/large-json', (req, res) => {
    const data = { items: Array.from({ length: 100 }, (_, i) => ({ id: i, name: `Item ${i}`, description: 'A'.repeat(50) })) };
    res.json(data);
  });

  // JSON endpoint returning small payload (< 1KB)
  app.get('/api/small-json', (req, res) => {
    res.json({ ok: true, message: 'small' });
  });

  // HTML endpoint returning large content
  app.get('/html', (req, res) => {
    const html = `<html><body>${'<p>Paragraph content for testing compression middleware.</p>'.repeat(50)}</body></html>`;
    res.type('text/html').send(html);
  });

  // CSS endpoint returning large content
  app.get('/styles.css', (req, res) => {
    const css = `.class { color: red; margin: 0; padding: 0; }\n`.repeat(100);
    res.type('text/css').send(css);
  });

  // JavaScript endpoint returning large content
  app.get('/script.js', (req, res) => {
    const js = `function handler${0}() { console.log("handler"); }\n`.repeat(100);
    res.type('application/javascript').send(js);
  });

  // Binary image endpoint (should NOT be compressed)
  app.get('/image.png', (req, res) => {
    // Create a fake PNG-like binary buffer > 1KB
    const buffer = Buffer.alloc(2048, 0x89);
    res.type('image/png').send(buffer);
  });

  // PDF endpoint (should NOT be compressed)
  app.get('/document.pdf', (req, res) => {
    const buffer = Buffer.alloc(2048, 0x25);
    res.type('application/pdf').send(buffer);
  });

  // Plain text endpoint returning large content
  app.get('/text', (req, res) => {
    const text = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(50);
    res.type('text/plain').send(text);
  });

  return app;
}

describe('Compression middleware', () => {
  const app = createTestApp();

  describe('compresses text-based responses > 1KB', () => {
    it('compresses large JSON responses when Accept-Encoding includes gzip', async () => {
      const res = await request(app)
        .get('/api/large-json')
        .set('Accept-Encoding', 'gzip');

      expect(res.headers['content-encoding']).toBe('gzip');
    });

    it('compresses large HTML responses when Accept-Encoding includes gzip', async () => {
      const res = await request(app)
        .get('/html')
        .set('Accept-Encoding', 'gzip');

      expect(res.headers['content-encoding']).toBe('gzip');
    });

    it('compresses large CSS responses when Accept-Encoding includes gzip', async () => {
      const res = await request(app)
        .get('/styles.css')
        .set('Accept-Encoding', 'gzip');

      expect(res.headers['content-encoding']).toBe('gzip');
    });

    it('compresses large JavaScript responses when Accept-Encoding includes gzip', async () => {
      const res = await request(app)
        .get('/script.js')
        .set('Accept-Encoding', 'gzip');

      expect(res.headers['content-encoding']).toBe('gzip');
    });

    it('compresses large plain text responses when Accept-Encoding includes gzip', async () => {
      const res = await request(app)
        .get('/text')
        .set('Accept-Encoding', 'gzip');

      expect(res.headers['content-encoding']).toBe('gzip');
    });
  });

  describe('does NOT compress responses smaller than 1KB', () => {
    it('does not compress small JSON responses', async () => {
      const res = await request(app)
        .get('/api/small-json')
        .set('Accept-Encoding', 'gzip');

      expect(res.headers['content-encoding']).toBeUndefined();
    });
  });

  describe('does NOT compress binary content', () => {
    it('does not compress PNG images', async () => {
      const res = await request(app)
        .get('/image.png')
        .set('Accept-Encoding', 'gzip');

      expect(res.headers['content-encoding']).toBeUndefined();
    });

    it('does not compress PDF files', async () => {
      const res = await request(app)
        .get('/document.pdf')
        .set('Accept-Encoding', 'gzip');

      expect(res.headers['content-encoding']).toBeUndefined();
    });
  });

  describe('respects Accept-Encoding header', () => {
    it('does not compress when Accept-Encoding does not include gzip', async () => {
      const res = await request(app)
        .get('/api/large-json')
        .set('Accept-Encoding', 'identity');

      expect(res.headers['content-encoding']).toBeUndefined();
    });

    it('compresses when Accept-Encoding includes gzip among others', async () => {
      const res = await request(app)
        .get('/api/large-json')
        .set('Accept-Encoding', 'gzip, deflate, br');

      // The compression package may choose gzip or br depending on priority
      expect(res.headers['content-encoding']).toMatch(/^(gzip|br)$/);
    });
  });
});
