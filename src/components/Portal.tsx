import { createPortal } from 'react-dom';

interface PortalProps {
  children: React.ReactNode;
}

/**
 * Renders children into document.body via React Portal.
 * This ensures modals, dropdowns, and overlays are not clipped
 * by parent overflow:hidden or stacking contexts.
 */
const Portal: React.FC<PortalProps> = ({ children }) => {
  if (typeof document === 'undefined') return null;
  return createPortal(children, document.body);
};

export default Portal;
