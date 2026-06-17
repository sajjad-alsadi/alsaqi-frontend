/**
 * Property-Based Test: Raster images produce WebP with fallback
 *
 * **Property 9: Raster images produce WebP with fallback**
 * **Validates: Requirements 4.3**
 *
 * For any raster image src (.png, .jpg, .jpeg), the OptimizedImage component
 * renders a `<picture>` element containing:
 * - A `<source>` with `type="image/webp"` and `srcSet` derived from the original path
 * - An `<img>` with the original `src` as fallback
 *
 * For non-raster sources (.svg, .gif, .webp), no WebP `<source>` is rendered —
 * only the `<img>` fallback inside `<picture>`.
 *
 * Additionally, the `<img>` element always has `decoding="async"` and the correct
 * `loading` attribute.
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { render } from '@testing-library/react';
import { OptimizedImage } from './OptimizedImage';

describe('OptimizedImage — Property 9: Raster images produce WebP with fallback', () => {
  it('raster images (.png, .jpg, .jpeg) render <picture> with WebP <source> and original <img> fallback', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }).filter((s) => /^[a-zA-Z0-9/_-]+$/.test(s)),
        fc.constantFrom('.png', '.jpg', '.jpeg'),
        fc.constantFrom<'lazy' | 'eager'>('lazy', 'eager'),
        (pathPrefix, extension, loading) => {
          const src = `/images/${pathPrefix}${extension}`;
          const expectedWebpSrc = src.replace(/\.(png|jpe?g)$/i, '.webp');

          const { container } = render(
            <OptimizedImage src={src} alt="test image" loading={loading} />,
          );

          const picture = container.querySelector('picture');
          expect(picture).not.toBeNull();

          // WebP source must be present
          const source = picture!.querySelector('source[type="image/webp"]');
          expect(source).not.toBeNull();
          expect(source!.getAttribute('srcSet')).toBe(expectedWebpSrc);

          // Original img fallback must be present
          const img = picture!.querySelector('img');
          expect(img).not.toBeNull();
          expect(img!.getAttribute('src')).toBe(src);

          // decoding and loading attributes
          expect(img!.getAttribute('decoding')).toBe('async');
          expect(img!.getAttribute('loading')).toBe(loading);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('non-raster images (.svg, .gif, .webp) render <picture> with only <img> — no WebP <source>', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }).filter((s) => /^[a-zA-Z0-9/_-]+$/.test(s)),
        fc.constantFrom('.svg', '.gif', '.webp'),
        fc.constantFrom<'lazy' | 'eager'>('lazy', 'eager'),
        (pathPrefix, extension, loading) => {
          const src = `/assets/${pathPrefix}${extension}`;

          const { container } = render(
            <OptimizedImage src={src} alt="test image" loading={loading} />,
          );

          const picture = container.querySelector('picture');
          expect(picture).not.toBeNull();

          // No WebP source should exist
          const source = picture!.querySelector('source[type="image/webp"]');
          expect(source).toBeNull();

          // img fallback must still be present with correct src
          const img = picture!.querySelector('img');
          expect(img).not.toBeNull();
          expect(img!.getAttribute('src')).toBe(src);

          // decoding and loading attributes
          expect(img!.getAttribute('decoding')).toBe('async');
          expect(img!.getAttribute('loading')).toBe(loading);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('img always has decoding="async" regardless of image format', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }).filter((s) => /^[a-zA-Z0-9/_-]+$/.test(s)),
        fc.constantFrom('.png', '.jpg', '.jpeg', '.svg', '.gif', '.webp'),
        (pathPrefix, extension) => {
          const src = `/img/${pathPrefix}${extension}`;

          const { container } = render(
            <OptimizedImage src={src} alt="test" />,
          );

          const img = container.querySelector('img');
          expect(img).not.toBeNull();
          expect(img!.getAttribute('decoding')).toBe('async');
        },
      ),
      { numRuns: 200 },
    );
  });

  it('default loading attribute is "lazy" when not specified', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }).filter((s) => /^[a-zA-Z0-9/_-]+$/.test(s)),
        fc.constantFrom('.png', '.jpg', '.jpeg', '.svg', '.gif', '.webp'),
        (pathPrefix, extension) => {
          const src = `/media/${pathPrefix}${extension}`;

          const { container } = render(
            <OptimizedImage src={src} alt="test" />,
          );

          const img = container.querySelector('img');
          expect(img).not.toBeNull();
          expect(img!.getAttribute('loading')).toBe('lazy');
        },
      ),
      { numRuns: 100 },
    );
  });
});
