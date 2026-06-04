import React from 'react';

interface ResponsiveActionsProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Wrapper for table row action buttons.
 * On desktop: hidden until row hover (opacity-0 → opacity-100).
 * On mobile/touch: always visible.
 * 
 * This fixes the UX issue where action buttons are invisible on touch devices
 * because there's no hover state.
 * 
 * @example
 * <td>
 *   <ResponsiveActions>
 *     <button>Edit</button>
 *     <button>Delete</button>
 *   </ResponsiveActions>
 * </td>
 */
const ResponsiveActions: React.FC<ResponsiveActionsProps> = ({ children, className = '' }) => {
  return (
    <div className={`flex items-center justify-end gap-2 md:opacity-0 md:group-hover:opacity-100 transition-opacity ${className}`}>
      {children}
    </div>
  );
};

export default ResponsiveActions;
