import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';

// Test utility to check basic accessibility patterns
function checkAccessibility(element: HTMLElement) {
  const issues: string[] = [];

  // Check images have alt text
  const images = element.querySelectorAll('img');
  images.forEach((img, i) => {
    if (!img.getAttribute('alt') && !img.getAttribute('aria-hidden')) {
      issues.push(`Image ${i} missing alt text`);
    }
  });

  // Check buttons have accessible names
  const buttons = element.querySelectorAll('button');
  buttons.forEach((btn, i) => {
    const hasText = btn.textContent?.trim();
    const hasAriaLabel = btn.getAttribute('aria-label');
    const hasAriaLabelledBy = btn.getAttribute('aria-labelledby');
    const hasTitle = btn.getAttribute('title');
    if (!hasText && !hasAriaLabel && !hasAriaLabelledBy && !hasTitle) {
      issues.push(`Button ${i} missing accessible name`);
    }
  });

  // Check form inputs have labels
  const inputs = element.querySelectorAll('input, select, textarea');
  inputs.forEach((input, i) => {
    const id = input.getAttribute('id');
    const hasAriaLabel = input.getAttribute('aria-label');
    const hasAriaLabelledBy = input.getAttribute('aria-labelledby');
    const hasLabel = id ? element.querySelector(`label[for="${id}"]`) : null;
    const hasPlaceholder = input.getAttribute('placeholder');
    if (!hasLabel && !hasAriaLabel && !hasAriaLabelledBy && !hasPlaceholder) {
      issues.push(`Input ${i} (${input.getAttribute('type') || 'text'}) missing label`);
    }
  });

  // Check heading hierarchy
  const headings = element.querySelectorAll('h1, h2, h3, h4, h5, h6');
  let lastLevel = 0;
  headings.forEach((heading) => {
    const level = parseInt(heading.tagName[1]);
    if (level > lastLevel + 1 && lastLevel > 0) {
      issues.push(`Heading level skipped: h${lastLevel} -> h${level}`);
    }
    lastLevel = level;
  });

  return issues;
}

describe('Accessibility Audit Utilities', () => {
  it('should detect missing alt text on images', () => {
    const { container } = render(
      <div>
        <img src="test.png" />
        <img src="test2.png" alt="Valid alt" />
      </div>
    );
    
    const issues = checkAccessibility(container);
    expect(issues).toContain('Image 0 missing alt text');
    expect(issues).not.toContain('Image 1 missing alt text');
  });

  it('should detect buttons without accessible names', () => {
    const { container } = render(
      <div>
        <button><svg /></button>
        <button>Click me</button>
        <button aria-label="Close">×</button>
      </div>
    );
    
    const issues = checkAccessibility(container);
    expect(issues.some(i => i.includes('Button 0'))).toBe(true);
    expect(issues.some(i => i.includes('Button 1'))).toBe(false);
    expect(issues.some(i => i.includes('Button 2'))).toBe(false);
  });

  it('should detect inputs without labels', () => {
    const { container } = render(
      <div>
        <input type="text" />
        <input type="text" aria-label="Search" />
        <label htmlFor="name">Name</label>
        <input type="text" id="name" />
      </div>
    );
    
    const issues = checkAccessibility(container);
    expect(issues.some(i => i.includes('Input 0'))).toBe(true);
    expect(issues.some(i => i.includes('Input 1'))).toBe(false);
    expect(issues.some(i => i.includes('Input 2'))).toBe(false);
  });

  it('should detect heading level skips', () => {
    const { container } = render(
      <div>
        <h1>Title</h1>
        <h3>Skipped h2</h3>
      </div>
    );
    
    const issues = checkAccessibility(container);
    expect(issues.some(i => i.includes('Heading level skipped'))).toBe(true);
  });

  it('should pass for properly structured content', () => {
    const { container } = render(
      <div>
        <h1>Page Title</h1>
        <h2>Section</h2>
        <img src="photo.jpg" alt="A photo" />
        <button>Submit</button>
        <label htmlFor="email">Email</label>
        <input id="email" type="email" />
      </div>
    );
    
    const issues = checkAccessibility(container);
    expect(issues).toHaveLength(0);
  });
});
