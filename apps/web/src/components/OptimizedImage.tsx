/**
 * OptimizedImage — renders images with WebP support via `<picture>` element.
 *
 * For raster images (PNG, JPEG), a WebP `<source>` is automatically derived
 * from the original `src` by replacing the extension. Non-raster sources
 * (SVG, GIF, WebP itself) render as a plain `<img>` without a WebP source.
 *
 * Always applies `decoding="async"` and defaults `loading` to `"lazy"` for
 * performance. Explicit `width` and `height` props prevent layout shift.
 *
 * @example
 * ```tsx
 * <OptimizedImage src="/images/logo.png" alt="Company logo" width={200} height={80} />
 * ```
 *
 * @see Requirements 4.3 — Raster images produce WebP with fallback
 */

export interface OptimizedImageProps {
  /** Original image source path */
  src: string;
  /** Accessible alt text */
  alt: string;
  /** Intrinsic width — prevents layout shift */
  width?: number;
  /** Intrinsic height — prevents layout shift */
  height?: number;
  /** Additional CSS class names */
  className?: string;
  /** Loading strategy — defaults to 'lazy' for below-fold images */
  loading?: 'lazy' | 'eager';
}

/** Pattern matching raster image extensions eligible for WebP conversion */
const RASTER_PATTERN = /\.(png|jpe?g)$/i;

/**
 * Renders an optimized image with automatic WebP source derivation.
 *
 * Only adds a WebP `<source>` when the original `src` is a raster format
 * (PNG, JPEG). Other formats (SVG, GIF, already-WebP) render as a simple `<img>`.
 */
export function OptimizedImage({
  src,
  alt,
  width,
  height,
  className,
  loading = 'lazy',
}: OptimizedImageProps) {
  const isRaster = RASTER_PATTERN.test(src);
  const webpSrc = isRaster ? src.replace(RASTER_PATTERN, '.webp') : null;

  return (
    <picture>
      {webpSrc && <source srcSet={webpSrc} type="image/webp" />}
      <img
        src={src}
        alt={alt}
        width={width}
        height={height}
        className={className}
        loading={loading}
        decoding="async"
      />
    </picture>
  );
}

export default OptimizedImage;
