import React from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface FormFieldProps {
  label?: React.ReactNode;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}

export const FormField: React.FC<FormFieldProps> = ({
  label,
  error,
  required,
  children,
  className,
}) => {
  return (
    <div className={cn("flex flex-col gap-2 w-full", className)}>
      {label && (
        <label className="text-sm font-bold text-[var(--color-text-main)] px-2 flex items-center gap-1 opacity-80">
          {label}
          {required && <span className="text-rose-500">*</span>}
        </label>
      )}
      {children}
      {error && (
        <span className="text-xs font-bold text-rose-500 px-2 animate-in fade-in slide-in-from-top-1">
          {error}
        </span>
      )}
    </div>
  );
};
