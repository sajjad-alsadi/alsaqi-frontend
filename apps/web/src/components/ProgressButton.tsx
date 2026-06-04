import React from 'react';
import { motion } from 'motion/react';
import { Loader2, Check, AlertCircle } from 'lucide-react';
import { LucideIcon } from 'lucide-react';

type ButtonState = 'idle' | 'loading' | 'success' | 'error';

interface ProgressButtonProps {
  /** Current state of the button */
  state: ButtonState;
  /** Click handler */
  onClick?: () => void;
  /** Button text for idle state */
  children: React.ReactNode;
  /** Loading text (optional) */
  loadingText?: string;
  /** Success text (optional, shown briefly) */
  successText?: string;
  /** Error text (optional, shown briefly) */
  errorText?: string;
  /** Icon to show in idle state */
  icon?: LucideIcon;
  /** Button variant */
  variant?: 'primary' | 'secondary' | 'danger';
  /** Additional className */
  className?: string;
  /** Disabled state */
  disabled?: boolean;
  /** Button type */
  type?: 'button' | 'submit';
}

/**
 * Button with loading, success, and error states.
 * Provides clear feedback for async operations.
 * 
 * @example
 * const [state, setState] = useState<ButtonState>('idle');
 * 
 * const handleSave = async () => {
 *   setState('loading');
 *   try {
 *     await saveData();
 *     setState('success');
 *     setTimeout(() => setState('idle'), 2000);
 *   } catch {
 *     setState('error');
 *     setTimeout(() => setState('idle'), 3000);
 *   }
 * };
 * 
 * <ProgressButton state={state} onClick={handleSave} icon={Save}>
 *   Save Changes
 * </ProgressButton>
 */
const ProgressButton: React.FC<ProgressButtonProps> = ({
  state,
  onClick,
  children,
  loadingText,
  successText,
  errorText,
  icon: Icon,
  variant = 'primary',
  className = '',
  disabled = false,
  type = 'button',
}) => {
  const isDisabled = disabled || state === 'loading';

  const variantClasses = {
    primary: 'btn-primary',
    secondary: 'btn-secondary',
    danger: 'btn-danger',
  };

  const getContent = () => {
    switch (state) {
      case 'loading':
        return (
          <>
            <Loader2 size={18} className="animate-spin" />
            <span>{loadingText || children}</span>
          </>
        );
      case 'success':
        return (
          <>
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            >
              <Check size={18} />
            </motion.div>
            <span>{successText || children}</span>
          </>
        );
      case 'error':
        return (
          <>
            <AlertCircle size={18} />
            <span>{errorText || children}</span>
          </>
        );
      default:
        return (
          <>
            {Icon && <Icon size={18} />}
            <span>{children}</span>
          </>
        );
    }
  };

  const stateClasses = {
    idle: '',
    loading: 'opacity-80 cursor-wait',
    success: '!bg-[var(--color-success)] !shadow-[var(--color-success)]/20',
    error: '!bg-[var(--color-danger)] !shadow-[var(--color-danger)]/20',
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={isDisabled}
      className={`${variantClasses[variant]} ${stateClasses[state]} ${className} disabled:opacity-50`}
    >
      {getContent()}
    </button>
  );
};

export default ProgressButton;
