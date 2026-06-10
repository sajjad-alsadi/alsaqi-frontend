import React, { useId } from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { AlertCircle } from 'lucide-react';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface FormFieldProps {
  label?: React.ReactNode;
  error?: string | undefined;
  required?: boolean;
  children: React.ReactNode;
  className?: string | undefined;
  hint?: string | undefined;
}

export const FormField: React.FC<FormFieldProps> = ({
  label,
  error,
  required,
  children,
  className,
  hint,
}) => {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;

  return (
    <div className={cn("flex flex-col gap-2 w-full", className)}>
      {label && (
        <label className="text-sm font-semibold text-[var(--color-text-main)] px-1 flex items-center gap-1">
          {label}
          {required && <span className="text-[var(--color-danger)]" aria-hidden="true">*</span>}
        </label>
      )}
      {/* Clone children to inject aria attributes */}
      {React.Children.map(children, child => {
        if (React.isValidElement(child)) {
          return React.cloneElement(child as React.ReactElement<any>, {
            'aria-invalid': error ? true : undefined,
            'aria-describedby': error ? errorId : hint ? hintId : undefined,
            'aria-required': required || undefined,
            error: !!error,
          });
        }
        return child;
      })}
      {hint && !error && (
        <p id={hintId} className="text-xs text-[var(--color-text-muted)] px-1">
          {hint}
        </p>
      )}
      {error && (
        <p 
          id={errorId} 
          className="text-xs font-semibold text-[var(--color-danger)] px-1 flex items-center gap-1.5 animate-fade-in"
          role="alert"
        >
          <AlertCircle size={12} className="shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
};
