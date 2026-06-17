/**
 * Property-based test for font-face unicode-range declarations.
 *
 * Property 8: Font-face declarations include unicode-range
 * Every Tajawal @font-face rule in fonts.css must have a unicode-range
 * descriptor covering either Arabic ranges (U+0600-06FF, U+FB50-FDFF,
 * U+FE70-FEFF) or Latin ranges (U+0000-007F, U+0080-00FF, U+0100-024F).
 *
 * **Validates: Requirements 4.2**
 *
 * Feature: app-rebuild, Property 8
 *
 * Strategy: Read the fonts.css file, parse all @font-face blocks for
 * font-family 'Tajawal'. Use fast-check to generate weight values from
 * {400, 700, 800} and assert each weight has both Arabic and Latin
 * declarations with valid unicode-range descriptors.
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { readFileSync } from 'fs';
import path from 'path';

// ─── Helpers ────────────────────────────────────────────────────────────────

interface FontFaceBlock {
  fontFamily: string;
  fontWeight: number;
  unicodeRange: string;
  src: string;
}

/**
 * Parse all @font-face blocks from CSS text and return structured data.
 */
function parseFontFaceBlocks(css: string): FontFaceBlock[] {
  const blocks: FontFaceBlock[] = [];
  const fontFaceRegex = /@font-face\s*\{([^}]+)\}/g;

  let match: RegExpExecArray | null;
  while ((match = fontFaceRegex.exec(css)) !== null) {
    const body = match[1];

    const familyMatch = body.match(/font-family:\s*'([^']+)'/);
    const weightMatch = body.match(/font-weight:\s*(\d+)/);
    const rangeMatch = body.match(/unicode-range:\s*([^;]+)/);
    const srcMatch = body.match(/src:\s*([^;]+)/);

    if (familyMatch && weightMatch) {
      blocks.push({
        fontFamily: familyMatch[1],
        fontWeight: parseInt(weightMatch[1], 10),
        unicodeRange: rangeMatch ? rangeMatch[1].trim() : '',
        src: srcMatch ? srcMatch[1].trim() : '',
      });
    }
  }

  return blocks;
}

// Known expected ranges
const ARABIC_RANGES = ['U+0600-06FF', 'U+FB50-FDFF', 'U+FE70-FEFF'];
const LATIN_RANGES = ['U+0000-007F', 'U+0080-00FF', 'U+0100-024F'];

/**
 * Check if a unicode-range descriptor covers the Arabic character set.
 */
function coversArabic(unicodeRange: string): boolean {
  return ARABIC_RANGES.every((range) =>
    unicodeRange.toUpperCase().includes(range)
  );
}

/**
 * Check if a unicode-range descriptor covers the Latin character set.
 */
function coversLatin(unicodeRange: string): boolean {
  return LATIN_RANGES.every((range) =>
    unicodeRange.toUpperCase().includes(range)
  );
}

// ─── Test Suite ─────────────────────────────────────────────────────────────

describe('Property 8: Font-face declarations include unicode-range', () => {
  const fontsPath = path.resolve(__dirname, 'fonts.css');
  const css = readFileSync(fontsPath, 'utf-8');
  const allBlocks = parseFontFaceBlocks(css);
  const tajawalBlocks = allBlocks.filter((b) => b.fontFamily === 'Tajawal');

  it('every Tajawal @font-face rule has a non-empty unicode-range descriptor', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...tajawalBlocks),
        (block) => {
          expect(block.unicodeRange).not.toBe('');
          expect(block.unicodeRange.length).toBeGreaterThan(0);
        }
      ),
      { numRuns: tajawalBlocks.length * 10 }
    );
  });

  it('every Tajawal @font-face unicode-range covers either Arabic or Latin ranges', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...tajawalBlocks),
        (block) => {
          const isArabic = coversArabic(block.unicodeRange);
          const isLatin = coversLatin(block.unicodeRange);
          expect(isArabic || isLatin).toBe(true);
        }
      ),
      { numRuns: tajawalBlocks.length * 10 }
    );
  });

  it('each weight from {400, 700, 800} has both Arabic and Latin declarations', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(400, 700, 800),
        (weight) => {
          const blocksForWeight = tajawalBlocks.filter(
            (b) => b.fontWeight === weight
          );

          // Must have at least 2 declarations (one Arabic, one Latin)
          expect(blocksForWeight.length).toBeGreaterThanOrEqual(2);

          const hasArabic = blocksForWeight.some((b) => coversArabic(b.unicodeRange));
          const hasLatin = blocksForWeight.some((b) => coversLatin(b.unicodeRange));

          expect(hasArabic).toBe(true);
          expect(hasLatin).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Tajawal Arabic declarations reference Arabic subset font files', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          ...tajawalBlocks.filter((b) => coversArabic(b.unicodeRange))
        ),
        (block) => {
          expect(block.src).toMatch(/tajawal-arabic/i);
        }
      ),
      { numRuns: 50 }
    );
  });

  it('Tajawal Latin declarations reference Latin subset font files', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          ...tajawalBlocks.filter((b) => coversLatin(b.unicodeRange))
        ),
        (block) => {
          expect(block.src).toMatch(/tajawal-latin/i);
        }
      ),
      { numRuns: 50 }
    );
  });
});
