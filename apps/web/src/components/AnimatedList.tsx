import React from 'react';
import { motion } from 'motion/react';

interface AnimatedListProps {
  children: React.ReactNode;
  className?: string;
  staggerDelay?: number;
}

/**
 * Wraps children in staggered fade-in animations.
 * Use as a container for list items, cards, or table rows.
 */
const AnimatedList: React.FC<AnimatedListProps> = ({ children, className = '', staggerDelay = 0.05 }) => {
  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={{
        hidden: {},
        visible: {
          transition: {
            staggerChildren: staggerDelay,
          },
        },
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
};

/**
 * Individual animated item — use inside AnimatedList.
 */
export const AnimatedItem: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => {
  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 12 },
        visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' } },
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
};

export default AnimatedList;
