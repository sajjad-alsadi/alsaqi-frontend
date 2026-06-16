/**
 * Lightweight accessible tooltip.
 *
 * Uses a CSS-only `[data-tooltip]` + `::after` approach with:
 * - `aria-describedby` pointing to a visually-hidden description element
 *   (avoids native browser tooltip duplication in Firefox that `title` causes)
 * - RTL-aware inline positioning via `inset-inline-start`
 * - Dark-mode token support via CSS custom properties
 * - `prefers-reduced-motion` respected by the parent CSS
 *
 * Usage:
 *   <Tooltip content="Findings rated High or Critical severity">
 *     <span>High-Risk Findings</span>
 *   </Tooltip>
 */
import React, { useId } from 'react';

interface TooltipProps {
  /** Tooltip text shown on hover / focus */
  content: string;
  children: React.ReactElement;
  /** Preferred side. Defaults to 'top'. */
  side?: 'top' | 'bottom';
  className?: string;
}

const Tooltip: React.FC<TooltipProps> = ({
  content,
  children,
  side = 'top',
  className = '',
}) => {
  const descId = useId();

  if (!content) return children;

  // Clone the child to inject aria-describedby — this correctly associates the
  // description with the interactive element rather than the wrapper span.
  const child = React.cloneElement(children, {
    'aria-describedby': descId,
  } as React.HTMLAttributes<HTMLElement>);

  return (
    <span
      data-tooltip={content}
      data-tooltip-side={side}
      className={`kiro-tooltip ${className}`}
      role="presentation"
    >
      {child}
      {/* Visually hidden description for screen readers */}
      <span
        id={descId}
        role="tooltip"
        className="sr-only"
      >
        {content}
      </span>
    </span>
  );
};

export default Tooltip;
