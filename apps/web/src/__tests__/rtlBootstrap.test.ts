import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/**
 * Unit tests for the RTL pre-React bootstrap (Requirement 11.2) and the
 * Arabic health-percent formatting (Requirement 14.3).
 *
 * Validates: Requirements 11.2, 14.3
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Test file lives at apps/web/src/__tests__/, index.html is at apps/web/
const indexHtmlPath = path.resolve(__dirname, '../../index.html');
const html = readFileSync(indexHtmlPath, 'utf8');

/**
 * Extracts the inline (no `src`) <script> block that references `i18nextLng`.
 * Returns the raw JavaScript body of that script.
 */
function extractBootstrapScript(source: string): string {
  const scriptRegex = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = scriptRegex.exec(source)) !== null) {
    const attrs = match[1] ?? '';
    const body = match[2] ?? '';
    const isInline = !/\bsrc\s*=/.test(attrs);
    if (isInline && body.includes('i18nextLng')) {
      return body;
    }
  }
  throw new Error('Inline RTL bootstrap script (referencing i18nextLng) not found in index.html');
}

describe('RTL bootstrap in index.html (Requirement 11.2)', () => {
  it('places the inline bootstrap script before the module script', () => {
    const moduleScriptIndex = html.indexOf('src="/src/main.tsx"');
    expect(moduleScriptIndex).toBeGreaterThan(-1);

    // Locate the inline bootstrap script by the position of its i18nextLng reference.
    const bootstrapRefIndex = html.indexOf('i18nextLng');
    expect(bootstrapRefIndex).toBeGreaterThan(-1);

    // The bootstrap must execute before the module bundle loads.
    expect(bootstrapRefIndex).toBeLessThan(moduleScriptIndex);
  });

  it('declares static Arabic/RTL defaults on the <html> element', () => {
    expect(html).toMatch(/<html[^>]*\blang="ar"/i);
    expect(html).toMatch(/<html[^>]*\bdir="rtl"/i);
  });

  function runBootstrap(storedLng: string | null) {
    const script = extractBootstrapScript(html);
    const documentElement = { lang: '', dir: '' };
    const mockDocument = { documentElement };
    const mockLocalStorage = {
      getItem: (key: string) => (key === 'i18nextLng' ? storedLng : null),
    };
    // Shadow the globals `document` and `localStorage` with our mocks by
    // passing them as function parameters, then execute the extracted snippet.
    const fn = new Function('document', 'localStorage', script);
    fn(mockDocument, mockLocalStorage);
    return documentElement;
  }

  it("sets dir=rtl and lang=ar when localStorage holds 'ar'", () => {
    const el = runBootstrap('ar');
    expect(el.lang).toBe('ar');
    expect(el.dir).toBe('rtl');
  });

  it("sets dir=ltr and lang=en when localStorage holds 'en'", () => {
    const el = runBootstrap('en');
    expect(el.lang).toBe('en');
    expect(el.dir).toBe('ltr');
  });

  it('leaves static defaults untouched when no language is stored', () => {
    const el = runBootstrap(null);
    // No stored language -> the bootstrap does not override the static ar/rtl defaults.
    expect(el.lang).toBe('');
    expect(el.dir).toBe('');
  });

  it('does not throw when localStorage access fails', () => {
    const script = extractBootstrapScript(html);
    const documentElement = { lang: '', dir: '' };
    const mockDocument = { documentElement };
    const throwingLocalStorage = {
      getItem: () => {
        throw new Error('localStorage unavailable');
      },
    };
    const fn = new Function('document', 'localStorage', script);
    expect(() => fn(mockDocument, throwingLocalStorage)).not.toThrow();
    // Static defaults remain unchanged after a thrown access.
    expect(documentElement.dir).toBe('');
    expect(documentElement.lang).toBe('');
  });
});

describe('Arabic health-percent formatting (Requirement 14.3)', () => {
  // Mirrors the expression used in SystemLogsManagement.tsx.
  const formatHealthPercent = (healthPercent: number) =>
    new Intl.NumberFormat('ar-IQ', { style: 'percent', maximumFractionDigits: 1 }).format(
      healthPercent / 100,
    );

  const easternArabicDigit = /[\u0660-\u0669]/; // ٠-٩
  const percentSign = /[\u066A%]/; // ٪ (Arabic) or %

  it('renders Eastern Arabic numerals with a percent sign', () => {
    const formatted = formatHealthPercent(95.7);
    expect(formatted).toMatch(easternArabicDigit);
    expect(formatted).toMatch(percentSign);
    // No Western ASCII digits should appear in the Arabic-locale output.
    expect(formatted).not.toMatch(/[0-9]/);
  });

  it('formats a range of health values with Eastern Arabic digits and a percent sign', () => {
    for (const value of [0, 50, 70, 90, 99.9, 100]) {
      const formatted = formatHealthPercent(value);
      expect(formatted).toMatch(easternArabicDigit);
      expect(formatted).toMatch(percentSign);
    }
  });
});
