import { describe, it, expect } from 'vitest';
import { criticalCssPlugin } from './criticalCss';

describe('criticalCssPlugin', () => {
  const plugin = criticalCssPlugin();

  it('returns a plugin with name "critical-css"', () => {
    expect(plugin.name).toBe('critical-css');
  });

  it('injects a <style> block before </head>', () => {
    const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <title>Al-Saqi</title>
</head>
<body><div id="root"></div></body>
</html>`;

    const transformIndexHtml = plugin.transformIndexHtml as (html: string) => string;
    const result = transformIndexHtml(html);

    expect(result).toContain('<style>');
    expect(result).toContain('</style>\n</head>');
  });

  it('includes CSS custom properties for light mode', () => {
    const html = '<head></head>';
    const transformIndexHtml = plugin.transformIndexHtml as (html: string) => string;
    const result = transformIndexHtml(html);

    expect(result).toContain('--color-bg-main: #f4f7f9');
    expect(result).toContain('--color-primary: #0a7d85');
  });

  it('includes dark mode override', () => {
    const html = '<head></head>';
    const transformIndexHtml = plugin.transformIndexHtml as (html: string) => string;
    const result = transformIndexHtml(html);

    expect(result).toContain('.dark');
    expect(result).toContain('--color-bg-main: #0c1220');
  });

  it('includes app-shell grid layout', () => {
    const html = '<head></head>';
    const transformIndexHtml = plugin.transformIndexHtml as (html: string) => string;
    const result = transformIndexHtml(html);

    expect(result).toContain('.app-shell');
    expect(result).toContain('grid-template-columns: 260px 1fr');
    expect(result).toContain('min-height: 100vh');
  });

  it('includes RTL-aware styles', () => {
    const html = '<head></head>';
    const transformIndexHtml = plugin.transformIndexHtml as (html: string) => string;
    const result = transformIndexHtml(html);

    expect(result).toContain('[dir="rtl"] .app-shell');
    expect(result).toContain('direction: rtl');
  });

  it('includes spinner animation', () => {
    const html = '<head></head>';
    const transformIndexHtml = plugin.transformIndexHtml as (html: string) => string;
    const result = transformIndexHtml(html);

    expect(result).toContain('.app-shell-spinner');
    expect(result).toContain('@keyframes spin');
    expect(result).toContain('animation: spin 0.8s linear infinite');
  });

  it('includes responsive mobile breakpoint', () => {
    const html = '<head></head>';
    const transformIndexHtml = plugin.transformIndexHtml as (html: string) => string;
    const result = transformIndexHtml(html);

    expect(result).toContain('@media (max-width: 768px)');
    expect(result).toContain('grid-template-columns: 1fr');
  });

  it('includes Tajawal font in font-family stack', () => {
    const html = '<head></head>';
    const transformIndexHtml = plugin.transformIndexHtml as (html: string) => string;
    const result = transformIndexHtml(html);

    expect(result).toContain('font-family: Tajawal, Inter, system-ui, sans-serif');
  });

  it('preserves existing HTML content outside </head>', () => {
    const html = `<html><head><meta charset="UTF-8"></head><body><div id="root"></div></body></html>`;
    const transformIndexHtml = plugin.transformIndexHtml as (html: string) => string;
    const result = transformIndexHtml(html);

    expect(result).toContain('<meta charset="UTF-8">');
    expect(result).toContain('<div id="root"></div>');
  });
});
