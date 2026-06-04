import React from 'react';

/**
 * SkipToContent provides a keyboard-accessible link that allows users
 * to skip navigation and jump directly to the main content area.
 * Visually hidden until focused.
 */
export const SkipToContent: React.FC = () => (
  <a href="#main-content" className="skip-link">
    Skip to content
  </a>
);

export default SkipToContent;
