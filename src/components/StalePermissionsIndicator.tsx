import React from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle } from 'lucide-react';
import { usePermissions } from '../hooks/usePermissions';

/**
 * Displays a persistent non-modal visual indicator when the permissions API
 * is unavailable and the static fallback matrix is in use.
 *
 * Requirement 13.2: Display a persistent non-modal visual indicator stating
 * that permissions may be stale when the API is unavailable.
 */
const StalePermissionsIndicator: React.FC = () => {
  const { isFallback } = usePermissions();
  const { t } = useTranslation();

  if (!isFallback) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-xs font-medium select-none"
    >
      <AlertTriangle size={14} className="shrink-0" />
      <span>{t('common.stalePermissions')}</span>
    </div>
  );
};

export default StalePermissionsIndicator;
