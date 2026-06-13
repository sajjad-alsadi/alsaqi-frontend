import React, { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { usePermissions } from '../hooks/usePermissions';

/**
 * Loading state shown while permissions are still being resolved.
 * Mirrors the app-wide loading spinner used by route Suspense fallbacks.
 */
const PermissionLoadingFallback: React.FC = () => (
  <div className="flex items-center justify-center h-full min-h-[400px]">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--color-primary)]"></div>
  </div>
);

export interface RequirePermissionProps {
  /** Module key whose `View` permission gates access to the wrapped route. */
  module: string;
  children: ReactNode;
}

/**
 * Permission-gated routing wrapper (Req 13).
 *
 * Access is evaluated ONLY after permissions have finished loading:
 * - WHILE permissions are loading, a loading state is rendered and access is
 *   NOT evaluated (no redirect) — Req 13.1, 13.3.
 * - WHEN loading has completed, access is evaluated: the children render when
 *   the user can view the module, otherwise the user is redirected to
 *   `/dashboard` — Req 13.2.
 */
export const RequirePermission: React.FC<RequirePermissionProps> = ({ module, children }) => {
  const { isLoading, canView } = usePermissions();

  // Req 13.1 / 13.3: do not evaluate access or redirect while loading.
  if (isLoading) {
    return <PermissionLoadingFallback />;
  }

  // Req 13.2: evaluate access only after load completes.
  return canView(module) ? <>{children}</> : <Navigate to="/dashboard" replace />;
};

export default RequirePermission;
