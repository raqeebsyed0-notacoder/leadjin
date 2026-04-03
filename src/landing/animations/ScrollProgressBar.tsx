import { motion, useScroll } from 'motion/react';

export const ScrollProgressBar: React.FC = () => {
  const { scrollYProgress } = useScroll();

  return (
    <motion.div
      style={{ 
        scaleX: scrollYProgress,
        transformOrigin: '0%',
      }}
      className="fixed top-0 left-0 right-0 h-0.5 bg-[#3182ce] z-[60]"
    />
  );
};
