import { motion } from "motion/react";

const initial = { pathLength: 0, opacity: 0, scale: 0.7, rotateY: -15 } as const;
const animate = { pathLength: 1, opacity: 1, scale: 1, rotateY: 0 } as const;

interface Props {
  className?: string;
  speed?: number;
  loop?: boolean;
}

export function EuphoriaLogoSVG({ className = "", speed = 1, loop = false }: Props) {
  const c = (x: number) => x * speed;
  const repeat = loop ? Infinity : 0;
  const repeatDelay = loop ? 3 : 0;
  const spring = (stiffness: number, delay: number) => ({
    type: "spring" as const,
    stiffness,
    delay: c(delay),
    repeat,
    repeatDelay,
  });

  return (
    <motion.svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 800 200"
      fill="none"
      stroke="currentColor"
      strokeWidth="8"
      initial={{ opacity: 1, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.8, type: "spring", stiffness: 120, damping: 15 }}
    >
      <title>EUPHORIA</title>

      {/* E */}
      <motion.path d="M40 50L40 150" strokeLinecap="square" initial={initial} animate={animate} transition={spring(280, 0)} />
      <motion.path d="M40 50L90 50" strokeLinecap="square" initial={initial} animate={animate} transition={spring(320, 0.2)} />
      <motion.path d="M40 100L80 100" strokeLinecap="square" initial={initial} animate={animate} transition={spring(320, 0.4)} />
      <motion.path d="M40 150L90 150" strokeLinecap="square" initial={initial} animate={animate} transition={spring(320, 0.6)} />

      {/* U */}
      <motion.path d="M130 50L130 130L180 130L180 50" strokeLinecap="square" initial={initial} animate={animate} transition={spring(240, 0.8)} />

      {/* P */}
      <motion.path d="M220 50L220 150" strokeLinecap="square" initial={initial} animate={animate} transition={spring(280, 1.2)} />
      <motion.path d="M220 50L270 50L270 100L220 100" strokeLinecap="square" initial={initial} animate={animate} transition={spring(260, 1.4)} />

      {/* H */}
      <motion.path d="M310 50L310 150" strokeLinecap="square" initial={initial} animate={animate} transition={spring(280, 1.8)} />
      <motion.path d="M310 100L370 100" strokeLinecap="square" initial={initial} animate={animate} transition={spring(320, 2.0)} />
      <motion.path d="M370 50L370 150" strokeLinecap="square" initial={initial} animate={animate} transition={spring(280, 2.2)} />

      {/* O */}
      <motion.path d="M430 70L460 50L490 70L490 130L460 150L430 130L430 70" strokeLinecap="square" initial={initial} animate={animate} transition={spring(200, 2.6)} />

      {/* R */}
      <motion.path d="M530 50L530 150" strokeLinecap="square" initial={initial} animate={animate} transition={spring(280, 3.0)} />
      <motion.path d="M530 50L580 50L580 100L530 100" strokeLinecap="square" initial={initial} animate={animate} transition={spring(260, 3.2)} />
      <motion.path d="M530 100L580 150" strokeLinecap="square" initial={initial} animate={animate} transition={spring(300, 3.5)} />

      {/* I */}
      <motion.path d="M620 50L660 50" strokeLinecap="square" initial={initial} animate={animate} transition={spring(340, 3.8)} />
      <motion.path d="M640 50L640 150" strokeLinecap="square" initial={initial} animate={animate} transition={spring(280, 4.0)} />
      <motion.path d="M620 150L660 150" strokeLinecap="square" initial={initial} animate={animate} transition={spring(340, 4.2)} />

      {/* A */}
      <motion.path d="M700 150L730 50L760 150" strokeLinecap="square" initial={initial} animate={animate} transition={spring(220, 4.5)} />
      <motion.path d="M715 110L745 110" strokeLinecap="square" initial={initial} animate={animate} transition={spring(280, 4.8)} />

    </motion.svg>
  );
}
