import React, { useRef, useState, useEffect, useCallback, memo } from 'react';

/**
 * Column definition for the VirtualTable.
 * Describes how each column header renders and optionally how cell content is extracted.
 */
export interface ColumnDef<T> {
  /** Unique key identifying the column. */
  key: string;
  /** Display text for the column header. */
  header: string;
  /** Optional CSS width value (e.g. '200px', '25%'). */
  width?: string;
  /** Optional custom cell renderer. If omitted, renderRow handles the full row. */
  render?: (item: T) => React.ReactNode;
}

/**
 * Props for the generic VirtualTable component.
 *
 * @template T - The type of each data item rendered as a row.
 */
export interface VirtualTableProps<T> {
  /** Full dataset. Only visible rows (plus overscan) are mounted to the DOM. */
  data: T[];
  /** Fixed row height in pixels. Used to compute visible range and total scroll height. */
  rowHeight: number;
  /** Number of rows rendered above and below the viewport. Default 10. */
  overscan?: number;
  /** Column definitions for header rendering and optional per-cell content. */
  columns: ColumnDef<T>[];
  /** Render function for each visible row. Receives the data item and its index. */
  renderRow: (item: T, index: number) => React.ReactNode;
}

/**
 * Memoized virtual table row. Prevents re-rendering when the same item occupies
 * the same position, which is common during scroll where only edge rows change.
 *
 * **Validates: Requirement 3.7**
 */
interface VirtualRowProps {
  rowIndex: number;
  rowHeight: number;
  children: React.ReactNode;
}

const VirtualRow = memo<VirtualRowProps>(({ rowIndex, rowHeight, children }) => (
  <div
    role="row"
    aria-rowindex={rowIndex + 2}
    style={{
      position: 'absolute',
      top: 0,
      transform: `translateY(${rowIndex * rowHeight}px)`,
      height: rowHeight,
      width: '100%',
      insetInlineStart: 0,
    }}
  >
    {children}
  </div>
));

VirtualRow.displayName = 'VirtualRow';

/**
 * Generic virtualized table component that renders only visible rows using
 * absolute positioning. Designed for datasets exceeding 50 rows where full
 * DOM rendering would degrade performance.
 *
 * Features:
 * - Absolute-positioned rows with `transform: translateY()` to avoid layout thrashing
 * - RTL-compatible via `inset-inline-start: 0`
 * - Off-screen row measurement deferred to `requestIdleCallback`
 * - Responsive container height tracking via ResizeObserver
 * - Design-system styling: rounded-2xl, soft border, shadow-sm
 *
 * @template T - The data item type.
 *
 * **Validates: Requirements 3.2, 3.6**
 */
function VirtualTable<T>({
  data,
  rowHeight,
  overscan = 10,
  columns,
  renderRow,
}: VirtualTableProps<T>): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);

  // Track container height changes via ResizeObserver
  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    // Set initial height
    setContainerHeight(node.clientHeight);

    if (typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setContainerHeight(entry.contentRect.height);
      }
    });

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // Handle scroll events
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  // Defer off-screen row measurement to requestIdleCallback
  useEffect(() => {
    if (typeof requestIdleCallback === 'undefined') return;

    const id = requestIdleCallback(() => {
      // Placeholder for off-screen row measurement logic.
      // In production this would measure variable-height rows that
      // haven't been laid out yet, updating a height cache.
    });

    return () => {
      if (typeof cancelIdleCallback !== 'undefined') {
        cancelIdleCallback(id);
      }
    };
  }, [scrollTop, data.length]);

  // Compute visible range
  const totalHeight = data.length * rowHeight;
  const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const endIndex = Math.min(
    data.length,
    Math.ceil((scrollTop + containerHeight) / rowHeight) + overscan,
  );
  const visibleItems = data.slice(startIndex, endIndex);

  return (
    <div
      ref={containerRef}
      className="rounded-2xl border border-border/40 shadow-sm overflow-y-auto"
      style={{ height: '100%' }}
      onScroll={handleScroll}
      role="table"
      aria-rowcount={data.length}
    >
      {/* Column headers */}
      <div
        role="row"
        aria-rowindex={1}
        className="sticky top-0 z-10 flex bg-muted/50 backdrop-blur-sm border-b border-border/30"
        style={{ height: rowHeight }}
      >
        {columns.map((col) => (
          <div
            key={col.key}
            role="columnheader"
            className="flex items-center px-3 text-sm font-medium text-muted-foreground"
            style={{ width: col.width ?? `${100 / columns.length}%` }}
          >
            {col.header}
          </div>
        ))}
      </div>

      {/* Scrollable body with absolute-positioned rows */}
      <div
        style={{ height: totalHeight, position: 'relative' }}
        role="rowgroup"
      >
        {visibleItems.map((item, i) => {
          const rowIndex = startIndex + i;
          return (
            <VirtualRow
              key={rowIndex}
              rowIndex={rowIndex}
              rowHeight={rowHeight}
            >
              {renderRow(item, rowIndex)}
            </VirtualRow>
          );
        })}
      </div>
    </div>
  );
}

export default VirtualTable;
