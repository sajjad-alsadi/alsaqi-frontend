import React, { createContext, useContext, useMemo, ReactNode } from 'react';
import type { FeatureFlagApi, FeatureFlagConfig } from './types';
import { loadFeatureFlagConfig } from './config';
import { isEnabled as evaluateFlag } from './evaluate';

const FeatureFlagContext = createContext<FeatureFlagApi | undefined>(undefined);

interface FeatureFlagProviderProps {
  children: ReactNode;
  /**
   * Optional explicit configuration. When omitted, the config is loaded from the
   * env source. Useful for tests and Storybook to inject a fixed config.
   */
  config?: FeatureFlagConfig;
}

export const FeatureFlagProvider: React.FC<FeatureFlagProviderProps> = ({ children, config }) => {
  const value = useMemo<FeatureFlagApi>(() => {
    const resolved = config ?? loadFeatureFlagConfig();
    return {
      config: resolved,
      isEnabled: (key) => evaluateFlag(resolved, key),
    };
  }, [config]);

  return (
    <FeatureFlagContext.Provider value={value}>
      {children}
    </FeatureFlagContext.Provider>
  );
};

export const useFeatureFlags = (): FeatureFlagApi => {
  const context = useContext(FeatureFlagContext);
  if (!context) throw new Error('useFeatureFlags must be used within FeatureFlagProvider');
  return context;
};

export { FeatureFlagContext };
