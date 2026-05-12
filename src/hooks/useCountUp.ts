import { useEffect, useState } from 'react';

interface CountUpOptions {
  /** Duration of the animation in milliseconds */
  duration?: number;
  /** Whether to start the animation */
  enabled?: boolean;
  /** Easing function — 'easeOut' gives a natural deceleration */
  easing?: 'linear' | 'easeOut' | 'easeInOut';
}

/**
 * Hook that animates a number from 0 to the target value.
 * Used for KPI cards and dashboard statistics.
 * 
 * @example
 * const animatedValue = useCountUp(1240, { enabled: isVisible });
 * <span>{animatedValue}</span>
 */
export function useCountUp(
  target: number,
  options: CountUpOptions = {}
): number {
  const { duration = 800, enabled = true, easing = 'easeOut' } = options;
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    if (!enabled || target === 0) {
      if (enabled) setCurrent(target);
      return;
    }

    // Respect reduced motion
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
      setCurrent(target);
      return;
    }

    let startTime: number | null = null;
    let animationFrame: number;

    const easingFn = (t: number): number => {
      switch (easing) {
        case 'easeOut':
          return 1 - Math.pow(1 - t, 3);
        case 'easeInOut':
          return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        case 'linear':
        default:
          return t;
      }
    };

    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const elapsed = timestamp - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easedProgress = easingFn(progress);

      setCurrent(Math.round(easedProgress * target));

      if (progress < 1) {
        animationFrame = requestAnimationFrame(animate);
      }
    };

    animationFrame = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animationFrame);
    };
  }, [target, duration, enabled, easing]);

  return current;
}
