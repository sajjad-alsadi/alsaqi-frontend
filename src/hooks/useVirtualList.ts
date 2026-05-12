import { useState, useCallback, useMemo, useRef, useEffect } from 'react';

interface VirtualListOptions {
  /** Total number of items */
  totalItems: number;
  /** Height of each item in pixels */
  itemHeight: number;
  /** Number of items to render above/below the visible area (default: 5) */
  overscan?: number;
  /** Height of the container in pixels */
  containerHeight: number;
}

interface VirtualListResult {
  /** Items to render (start and end indices) */
  visibleRange: { start: number; end: number };
  /** Total height of the scrollable area */
  totalHeight: number;
  /** Offset for the visible items container */
  offsetY: number;
  /** Ref to attach to the scroll container */
  containerRef: (node: HTMLElement | null) => void;
  /** Number of visible items */
  visibleCount: number;
}

/**
 * Lightweight virtualization hook for large lists.
 * Only renders items that are visible in the viewport + overscan buffer.
 * 
 * For lists with 50+ items, this significantly improves performance
 * by reducing DOM nodes from hundreds to ~20-30.
 * 
 * @example
 * const { visibleRange, totalHeight, offsetY, containerRef } = useVirtualList({
 *   totalItems: items.length,
 *   itemHeight: 64,
 *   containerHeight: 600,
 * });
 * 
 * <div ref={containerRef} style={{ height: 600, overflow: 'auto' }}>
 *   <div style={{ height: totalHeight, position: 'relative' }}>
 *     <div style={{ transform: `translateY(${offsetY}px)` }}>
 *       {items.slice(visibleRange.start, visibleRange.end).map(item => (
 *         <div key={item.id} style={{ height: 64 }}>{item.name}</div>
 *       ))}
 *     </div>
 *   </div>
 * </div>
 */
export function useVirtualList(options: VirtualListOptions): VirtualListResult {
  const { totalItems, itemHeight, overscan = 5, containerHeight } = options;
  const [scrollTop, setScrollTop] = useState(0);
  const nodeRef = useRef<HTMLElement | null>(null);

  const containerRef = useCallback((node: HTMLElement | null) => {
    if (nodeRef.current) {
      nodeRef.current.removeEventListener('scroll', handleScroll);
    }
    nodeRef.current = node;
    if (node) {
      node.addEventListener('scroll', handleScroll, { passive: true });
    }
  }, []);

  const handleScroll = useCallback(() => {
    if (nodeRef.current) {
      setScrollTop(nodeRef.current.scrollTop);
    }
  }, []);

  // Cleanup
  useEffect(() => {
    return () => {
      if (nodeRef.current) {
        nodeRef.current.removeEventListener('scroll', handleScroll);
      }
    };
  }, [handleScroll]);

  const result = useMemo(() => {
    const totalHeight = totalItems * itemHeight;
    const visibleCount = Math.ceil(containerHeight / itemHeight);
    
    const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
    const endIndex = Math.min(totalItems, startIndex + visibleCount + overscan * 2);
    
    const offsetY = startIndex * itemHeight;

    return {
      visibleRange: { start: startIndex, end: endIndex },
      totalHeight,
      offsetY,
      visibleCount,
    };
  }, [scrollTop, totalItems, itemHeight, containerHeight, overscan]);

  return {
    ...result,
    containerRef,
  };
}
