import React from 'react';

interface SkeletonProps {
  className?: string;
}

const Skeleton: React.FC<SkeletonProps> = ({ className = '' }) => (
  <div className={`animate-pulse bg-[var(--color-border-soft)]/50 rounded-xl ${className}`} />
);

/**
 * Table skeleton loader — shows placeholder rows while data loads.
 */
export const TableSkeleton: React.FC<{ rows?: number; cols?: number }> = ({ rows = 5, cols = 4 }) => (
  <div className="glass-card overflow-hidden">
    {/* Header */}
    <div className="flex gap-4 p-5 bg-[var(--color-bg-soft)] border-b border-[var(--color-border-soft)]">
      {Array.from({ length: cols }).map((_, i) => (
        <Skeleton key={i} className="h-4 flex-1" />
      ))}
    </div>
    {/* Rows */}
    {Array.from({ length: rows }).map((_, rowIdx) => (
      <div key={rowIdx} className="flex gap-4 p-5 border-b border-[var(--color-border-soft)]/40">
        {Array.from({ length: cols }).map((_, colIdx) => (
          <Skeleton key={colIdx} className={`h-4 flex-1 ${colIdx === 0 ? 'max-w-[80px]' : ''}`} />
        ))}
      </div>
    ))}
  </div>
);

/**
 * Card grid skeleton loader.
 */
export const CardSkeleton: React.FC<{ count?: number }> = ({ count = 6 }) => (
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className="glass-card p-6 space-y-4">
        <div className="flex items-center gap-3">
          <Skeleton className="w-10 h-10 rounded-xl" />
          <Skeleton className="h-5 flex-1 max-w-[150px]" />
        </div>
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <div className="flex gap-2 pt-2">
          <Skeleton className="h-6 w-16 rounded-lg" />
          <Skeleton className="h-6 w-20 rounded-lg" />
        </div>
      </div>
    ))}
  </div>
);

/**
 * KPI/Stats skeleton loader.
 */
export const StatsSkeleton: React.FC<{ count?: number }> = ({ count = 4 }) => (
  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className="glass-card p-5 space-y-3">
        <Skeleton className="w-10 h-10 rounded-xl" />
        <Skeleton className="h-7 w-16" />
        <Skeleton className="h-3 w-24" />
      </div>
    ))}
  </div>
);

export default Skeleton;
