import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualList } from '../hooks/useVirtualList';

/** Responsive column rule: use `columns` once the container is at least `minWidth` px wide. */
export interface ColumnBreakpoint {
  minWidth: number;
  columns: number;
}

interface VirtualizedListProps<T> {
  /** Full collection. Only the visible window is rendered to the DOM. */
  items: T[];
  /** Estimated height (px) of one row of items, including the vertical gap. */
  rowHeight: number;
  /** Height (px) of the scroll viewport. */
  height: number;
  /** Render a single item. */
  renderItem: (item: T, index: number) => React.ReactNode;
  /** Stable React key for an item. */
  getKey: (item: T, index: number) => React.Key;
  /**
   * Responsive column rules, evaluated largest-`minWidth`-first against the
   * measured container width. Defaults to a single column.
   */
  columnsByWidth?: ColumnBreakpoint[];
  /** Below this item count the list renders without virtualization. Default 40. */
  threshold?: number;
  /** Rows rendered above/below the viewport. Default 3. */
  overscan?: number;
  /** Class applied to the scroll container. */
  className?: string;
  /** Class applied to each row wrapper (e.g. grid gap utilities). */
  rowClassName?: string;
}

function resolveColumns(width: number, rules?: ColumnBreakpoint[]): number {
  if (!rules || rules.length === 0) return 1;
  const sorted = [...rules].sort((a, b) => b.minWidth - a.minWidth);
  for (const rule of sorted) {
    if (width >= rule.minWidth) return Math.max(1, rule.columns);
  }
  return 1;
}

/**
 * Windowed list that only mounts the rows visible in its scroll viewport plus a
 * small overscan buffer, keeping the DOM bounded for large collections
 * (Req 23.1). Items are grouped into rows of `columns` cells so a responsive
 * card grid keeps its multi-column layout while virtualizing by row.
 *
 * For collections at or below `threshold`, it renders every item normally so
 * small lists keep their natural (non-scroll) layout.
 */
function VirtualizedList<T>({
  items,
  rowHeight,
  height,
  renderItem,
  getKey,
  columnsByWidth,
  threshold = 40,
  overscan = 3,
  className = '',
  rowClassName = '',
}: VirtualizedListProps<T>): React.ReactElement {
  const measureRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    const node = measureRef.current;
    if (!node || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setContainerWidth(entry.contentRect.width);
    });
    observer.observe(node);
    setContainerWidth(node.getBoundingClientRect().width);
    return () => observer.disconnect();
  }, []);

  const columns = useMemo(
    () => resolveColumns(containerWidth, columnsByWidth),
    [containerWidth, columnsByWidth],
  );

  const rowCount = Math.ceil(items.length / columns);

  const { visibleRange, totalHeight, offsetY, containerRef } = useVirtualList({
    totalItems: rowCount,
    itemHeight: rowHeight,
    containerHeight: height,
    overscan,
  });

  const renderRow = (rowIndex: number): React.ReactNode => {
    const start = rowIndex * columns;
    const rowItems = items.slice(start, start + columns);
    return (
      <div
        key={`row-${rowIndex}`}
        className={rowClassName}
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
        }}
      >
        {rowItems.map((item, col) => {
          const index = start + col;
          return <React.Fragment key={getKey(item, index)}>{renderItem(item, index)}</React.Fragment>;
        })}
      </div>
    );
  };

  // Small collections render in full, without an inner scroll viewport.
  if (items.length <= threshold) {
    return (
      <div ref={measureRef} className={className}>
        {Array.from({ length: rowCount }, (_, rowIndex) => renderRow(rowIndex))}
      </div>
    );
  }

  const rows: React.ReactNode[] = [];
  for (let rowIndex = visibleRange.start; rowIndex < visibleRange.end; rowIndex += 1) {
    rows.push(renderRow(rowIndex));
  }

  return (
    <div ref={measureRef}>
      <div
        ref={containerRef}
        className={className}
        style={{ height, overflowY: 'auto' }}
      >
        <div style={{ height: totalHeight, position: 'relative' }}>
          <div style={{ transform: `translateY(${offsetY}px)` }}>{rows}</div>
        </div>
      </div>
    </div>
  );
}

export default VirtualizedList;
