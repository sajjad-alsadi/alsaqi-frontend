import React, { ReactNode } from 'react';
import type { FlagKey } from './types';
import { useFeatureFlag } from './useFeatureFlag';

interface FeatureGateProps {
  /** The flag that controls whether the children render. */
  flag: FlagKey;
  /** Content rendered only when the flag evaluates to enabled. */
  children: ReactNode;
  /** Optional content rendered when the flag is disabled (defaults to nothing). */
  fallback?: ReactNode;
}

/**
 * Renders its children only when the named flag is enabled; otherwise renders
 * the optional fallback (or nothing).
 */
export const FeatureGate: React.FC<FeatureGateProps> = ({ flag, children, fallback = null }) => {
  const enabled = useFeatureFlag(flag);
  return <>{enabled ? children : fallback}</>;
};
