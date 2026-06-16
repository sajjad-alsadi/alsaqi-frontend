import React from 'react';
import { useVirtualList } from '../hooks/useVirtualList';

interface VirtualizedTableProps<T> {
  /** Full row collection. Only the visible window is mounted to the DOM. */
  items: T[];
  /** Estimated height (px) of one table row. */
  rowHeight: number;
  /** Height (px) of the vertical scroll viewport when virtualizing. */
  height: number;
  /** `<tr>` markup for the table head. */
  head: React.ReactNode;
  /** Render one row as a `<tr>` element. */
  renderRow: (item: T, index: number) => React.ReactNode;
  /** Stable React key for a row. */
  getKey: (item: T, index: number) => React.Key;
  /** Column count, used to size the spacer rows. */
  colSpan: number;
  /** Below this row count the table renders in full without virtualization. Default 40. */
  threshold?: number;
  /** Rows rendered above/below the viewport. Default 6. */
  overscan?: number;
  /** Class applied to the scroll/overflow container. */
  containerClassName?: string;
  /** Class applied to the `<table>`. */
  tableClassName?: string;
  /** Class applied to the `<tbody>`. */
  bodyClassName?: string;
  /** Optional content rendered when there are no items. */
  emptyState?: React.ReactNode;
}

const spacerCellStyle: React.CSSProperties = { padding: 0, border: 0 };

/**
 * Virtualized `<table>` that only mounts the rows visible in its scroll
 * viewport plus a small overscan buffer, keeping the DOM bounded for large
 * collections (Req 23.1). Off-screen height is preserved with two spacer rows
 * (top and bottom) so the native scrollbar stays accurate.
 *
 * Collections at or below `threshold` render in full without an inner scroll
 * viewport, preserving the natural table layout for small datasets.
 */
function VirtualizedTable<T>({
  items,
  rowHeight,
  height,
  head,
  renderRow,
  getKey,
  colSpan,
  threshold = 40,
  overscan = 6,
  containerClassName = '',
  tableClassName = '',
  bodyClassName = '',
  emptyState,
}: VirtualizedTableProps<T>): React.ReactElement {
  const { visibleRange, totalHeight, offsetY, containerRef } = useVirtualList({
    totalItems: items.length,
    itemHeight: rowHeight,
    containerHeight: height,
    overscan,
  });

  const virtualize = items.length > threshold;

  let bodyRows: React.ReactNode;
  if (!virtualize) {
    bodyRows = items.map((item, index) => (
      <React.Fragment key={getKey(item, index)}>{renderRow(item, index)}</React.Fragment>
    ));
  } else {
    const visible: React.ReactNode[] = [];
    for (let i = visibleRange.start; i < visibleRange.end; i += 1) {
      const item = items[i];
      if (item !== undefined) {
        visible.push(
          <React.Fragment key={getKey(item, i)}>{renderRow(item, i)}</React.Fragment>,
        );
      }
    }
    const bottomSpacer = Math.max(0, totalHeight - offsetY - (visibleRange.end - visibleRange.start) * rowHeight);
    bodyRows = (
      <>
        {offsetY > 0 && (
          <tr aria-hidden="true" style={{ height: offsetY }}>
            <td colSpan={colSpan} style={spacerCellStyle} />
          </tr>
        )}
        {visible}
        {bottomSpacer > 0 && (
          <tr aria-hidden="true" style={{ height: bottomSpacer }}>
            <td colSpan={colSpan} style={spacerCellStyle} />
          </tr>
        )}
      </>
    );
  }

  return (
    <div
      ref={virtualize ? containerRef : undefined}
      className={containerClassName}
      style={virtualize ? { maxHeight: height, overflowY: 'auto' } : undefined}
    >
      <table className={tableClassName}>
        <thead>{head}</thead>
        <tbody className={bodyClassName}>{bodyRows}</tbody>
      </table>
      {items.length === 0 && emptyState}
    </div>
  );
}

export default VirtualizedTable;
