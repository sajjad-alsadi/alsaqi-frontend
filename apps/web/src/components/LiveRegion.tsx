import React from 'react';

interface LiveRegionProps {
  message: string;
  politeness?: 'polite' | 'assertive';
}

/**
 * LiveRegion announces dynamic content changes to screen readers
 * using ARIA live regions.
 *
 * - `polite`: Waits for the user to finish current interaction (route changes, form results)
 * - `assertive`: Interrupts immediately (toast notifications, errors)
 */
export const LiveRegion: React.FC<LiveRegionProps> = ({ message, politeness = 'polite' }) => (
  <div
    role="status"
    aria-live={politeness}
    aria-atomic="true"
    className="sr-only"
  >
    {message}
  </div>
);

export default LiveRegion;
