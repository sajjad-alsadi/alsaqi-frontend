import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import { OptimizedImage } from './OptimizedImage';

describe('OptimizedImage', () => {
  it('renders a <picture> element with WebP source for .png files', () => {
    const { container } = render(
      <OptimizedImage src="/images/hero.png" alt="Hero banner" />,
    );

    const picture = container.querySelector('picture');
    expect(picture).toBeInTheDocument();

    const source = picture!.querySelector('source');
    expect(source).toBeInTheDocument();
    expect(source).toHaveAttribute('srcSet', '/images/hero.webp');
    expect(source).toHaveAttribute('type', 'image/webp');

    const img = picture!.querySelector('img');
    expect(img).toHaveAttribute('src', '/images/hero.png');
    expect(img).toHaveAttribute('alt', 'Hero banner');
  });

  it('renders a <picture> element with WebP source for .jpg files', () => {
    const { container } = render(
      <OptimizedImage src="/photos/team.jpg" alt="Team photo" />,
    );

    const source = container.querySelector('source');
    expect(source).toHaveAttribute('srcSet', '/photos/team.webp');
    expect(source).toHaveAttribute('type', 'image/webp');
  });

  it('renders a <picture> element with WebP source for .jpeg files', () => {
    const { container } = render(
      <OptimizedImage src="/photos/office.jpeg" alt="Office" />,
    );

    const source = container.querySelector('source');
    expect(source).toHaveAttribute('srcSet', '/photos/office.webp');
    expect(source).toHaveAttribute('type', 'image/webp');
  });

  it('handles case-insensitive extensions (.PNG, .JPG)', () => {
    const { container: pngContainer } = render(
      <OptimizedImage src="/img/logo.PNG" alt="Logo" />,
    );
    expect(pngContainer.querySelector('source')).toHaveAttribute(
      'srcSet',
      '/img/logo.webp',
    );

    const { container: jpgContainer } = render(
      <OptimizedImage src="/img/banner.JPG" alt="Banner" />,
    );
    expect(jpgContainer.querySelector('source')).toHaveAttribute(
      'srcSet',
      '/img/banner.webp',
    );
  });

  it('does NOT render a WebP source for SVG files', () => {
    const { container } = render(
      <OptimizedImage src="/icons/arrow.svg" alt="Arrow icon" />,
    );

    const source = container.querySelector('source');
    expect(source).not.toBeInTheDocument();

    const img = container.querySelector('img');
    expect(img).toHaveAttribute('src', '/icons/arrow.svg');
  });

  it('does NOT render a WebP source for .webp files (already WebP)', () => {
    const { container } = render(
      <OptimizedImage src="/images/photo.webp" alt="Photo" />,
    );

    const source = container.querySelector('source');
    expect(source).not.toBeInTheDocument();
  });

  it('does NOT render a WebP source for .gif files', () => {
    const { container } = render(
      <OptimizedImage src="/animations/loading.gif" alt="Loading" />,
    );

    const source = container.querySelector('source');
    expect(source).not.toBeInTheDocument();
  });

  it('defaults loading to "lazy"', () => {
    const { container } = render(
      <OptimizedImage src="/images/photo.png" alt="Photo" />,
    );

    const img = container.querySelector('img');
    expect(img).toHaveAttribute('loading', 'lazy');
  });

  it('respects loading="eager" when specified', () => {
    const { container } = render(
      <OptimizedImage src="/images/hero.png" alt="Hero" loading="eager" />,
    );

    const img = container.querySelector('img');
    expect(img).toHaveAttribute('loading', 'eager');
  });

  it('always sets decoding="async" on the img element', () => {
    const { container } = render(
      <OptimizedImage src="/images/chart.png" alt="Chart" />,
    );

    const img = container.querySelector('img');
    expect(img).toHaveAttribute('decoding', 'async');
  });

  it('passes width and height props to the img element', () => {
    const { container } = render(
      <OptimizedImage
        src="/images/thumb.jpg"
        alt="Thumbnail"
        width={300}
        height={200}
      />,
    );

    const img = container.querySelector('img');
    expect(img).toHaveAttribute('width', '300');
    expect(img).toHaveAttribute('height', '200');
  });

  it('passes className to the img element', () => {
    const { container } = render(
      <OptimizedImage
        src="/images/avatar.png"
        alt="Avatar"
        className="rounded-full shadow-md"
      />,
    );

    const img = container.querySelector('img');
    expect(img).toHaveAttribute('class', 'rounded-full shadow-md');
  });

  it('renders without width/height when not provided', () => {
    const { container } = render(
      <OptimizedImage src="/images/icon.png" alt="Icon" />,
    );

    const img = container.querySelector('img');
    expect(img).not.toHaveAttribute('width');
    expect(img).not.toHaveAttribute('height');
  });
});
