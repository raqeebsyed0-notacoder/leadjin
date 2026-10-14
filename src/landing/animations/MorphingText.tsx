import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';

interface MorphingTextProps {
  phrases: string[];
  interval?: number;
}

export const MorphingText: React.FC<MorphingTextProps> = ({ 
  phrases, 
  interval = 3000 
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);
    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    if (prefersReducedMotion) return;
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % phrases.length);
    }, interval);
    return () => clearInterval(timer);
  }, [phrases.length, interval, prefersReducedMotion]);

  if (prefersReducedMotion) {
    return <span>{phrases[0]}</span>;
  }

  return (
    <span className="relative inline-block">
      <AnimatePresence mode="wait">
        <motion.span
          key={currentIndex}
          initial={{ opacity: 0, filter: 'blur(8px)', y: 20 }}
          animate={{ opacity: 1, filter: 'blur(0px)', y: 0 }}
          exit={{ opacity: 0, filter: 'blur(8px)', y: -20 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="inline-block"
        >
          {phrases[currentIndex]}
        </motion.span>
      </AnimatePresence>
    </span>
  );
};
