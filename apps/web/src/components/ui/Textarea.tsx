import React, { forwardRef } from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean;
}

const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, error, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          "flex min-h-[120px] w-full px-6 py-4 bg-[var(--color-card)] border border-[var(--color-border-soft)] rounded-2xl focus:ring-2 focus:ring-[var(--color-primary)]/50 focus:border-[var(--color-primary)] outline-none transition-all text-[var(--color-text-main)] shadow-sm placeholder:text-[var(--color-text-muted)]/60 disabled:cursor-not-allowed disabled:opacity-50 resize-none",
          error && "border-[var(--color-danger)] focus:ring-[var(--color-danger)]/30 focus:border-[var(--color-danger)]",
          className
        )}
        ref={ref}
        aria-invalid={error || undefined}
        {...props}
      />
    );
  }
);
Textarea.displayName = "Textarea";

export { Textarea };
