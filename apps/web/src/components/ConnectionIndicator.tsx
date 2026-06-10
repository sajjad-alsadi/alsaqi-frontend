import React from 'react';
import { useTranslation } from 'react-i18next';
import { Wifi, WifiOff, Signal } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useConnectionStatus } from '../hooks/useConnectionStatus';
import type { ConnectionStatus } from '../hooks/useConnectionStatus';

/**
 * ConnectionIndicator — persistent visual indicator for network connection state.
 *
 * - Green (online): minimal dot indicator, auto-hides after a brief appearance
 * - Yellow/amber (degraded): visible banner with warning icon and message
 * - Red (offline): visible banner with offline icon and message
 *
 * Transitions animate smoothly between states.
 * Status updates are reflected within 2 seconds (handled by the useConnectionStatus hook).
 *
 * Requirements: 3.1, 3.6, 3.7
 */

interface StatusConfig {
  icon: React.ReactNode;
  label: string;
  dotColor: string;
  bgColor: string;
  borderColor: string;
  textColor: string;
}

function getStatusConfig(
  status: ConnectionStatus,
  t: (key: string) => string
): StatusConfig {
  switch (status) {
    case 'online':
      return {
        icon: <Wifi size={14} className="shrink-0" />,
        label: t('common.connectionOnline'),
        dotColor: 'bg-green-500',
        bgColor: 'bg-green-500/10',
        borderColor: 'border-green-500/30',
        textColor: 'text-green-600 dark:text-green-400',
      };
    case 'degraded':
      return {
        icon: <Signal size={14} className="shrink-0" />,
        label: t('common.connectionDegraded'),
        dotColor: 'bg-amber-500',
        bgColor: 'bg-amber-500/10',
        borderColor: 'border-amber-500/30',
        textColor: 'text-amber-600 dark:text-amber-400',
      };
    case 'offline':
      return {
        icon: <WifiOff size={14} className="shrink-0" />,
        label: t('common.connectionOffline'),
        dotColor: 'bg-red-500',
        bgColor: 'bg-red-500/10',
        borderColor: 'border-red-500/30',
        textColor: 'text-red-600 dark:text-red-400',
      };
  }
}

const ConnectionIndicator: React.FC = () => {
  const { status } = useConnectionStatus();
  const { t } = useTranslation();

  const config = getStatusConfig(status, t);
  const isExpanded = status !== 'online';

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      aria-label={config.label}
      className="relative"
    >
      <AnimatePresence mode="wait">
        {isExpanded ? (
          <motion.div
            key={status}
            initial={{ opacity: 0, scale: 0.9, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: -4 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium select-none ${config.bgColor} ${config.borderColor} ${config.textColor}`}
          >
            {config.icon}
            <span>{config.label}</span>
            <span
              className={`w-2 h-2 rounded-full ${config.dotColor} animate-pulse`}
              aria-hidden="true"
            />
          </motion.div>
        ) : (
          <motion.div
            key="online"
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.5 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="flex items-center gap-1.5 px-2 py-1 rounded-md"
            title={config.label}
          >
            <span
              className={`w-2 h-2 rounded-full ${config.dotColor}`}
              aria-hidden="true"
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ConnectionIndicator;
