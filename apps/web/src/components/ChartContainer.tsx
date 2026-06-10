import React, { useState, useEffect, useRef, ReactNode } from 'react';

interface ChartContainerProps {
  children: (width: number, height: number) => ReactNode;
  className?: string;
  minHeight?: number | string;
  debugName?: string;
}

const ChartContainer: React.FC<ChartContainerProps> = ({ 
  children, 
  className = "w-full h-full min-w-0", 
  minHeight = 300,
  debugName = "Unnamed Chart"
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;

    const observeTarget = containerRef.current;
    
    const resizeObserver = new ResizeObserver((entries) => {
      if (!entries || entries.length === 0) return;
      
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      
      if (width > 0 && height > 0) {
        setDimensions({ width, height });
        setIsReady(true);
      }
    });

    resizeObserver.observe(observeTarget);

    // Initial check
    const rect = observeTarget.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      setDimensions({ width: rect.width, height: rect.height });
      setIsReady(true);
    }

    return () => {
      resizeObserver.unobserve(observeTarget);
      resizeObserver.disconnect();
    };
  }, [debugName]);

  return (
    <div 
      ref={containerRef} 
      className={className} 
      style={{ minHeight: typeof minHeight === 'number' ? `${minHeight}px` : minHeight }}
    >
      {isReady && dimensions.width > 0 && dimensions.height > 0 ? (
        children(dimensions.width, dimensions.height)
      ) : (
        <div className="w-full h-full flex items-center justify-center text-[var(--color-text-muted)] text-xs italic">
          Initializing chart...
        </div>
      )}
    </div>
  );
};

export default ChartContainer;
