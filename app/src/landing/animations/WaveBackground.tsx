import { useEffect, useRef, useState } from 'react';

export const WaveBackground: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || prefersReducedMotion) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let time = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio, 2);
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = window.innerWidth + 'px';
      canvas.style.height = window.innerHeight + 'px';
      ctx.scale(dpr, dpr);
    };

    const drawWave = (
      yBase: number,
      amplitude: number,
      frequency: number,
      speed: number,
      alpha: number,
      color: string
    ) => {
      const w = window.innerWidth;
      const h = window.innerHeight;

      ctx.beginPath();
      ctx.moveTo(0, h);

      for (let x = 0; x <= w; x += 2) {
        const nx = x / w;
        // Layered noise-like waves using multiple sine functions
        const y = yBase
          + Math.sin(nx * frequency + time * speed) * amplitude
          + Math.sin(nx * frequency * 1.7 + time * speed * 0.8 + 1.3) * amplitude * 0.5
          + Math.sin(nx * frequency * 0.5 + time * speed * 1.2 + 2.7) * amplitude * 0.7;
        ctx.lineTo(x, y);
      }

      ctx.lineTo(w, h);
      ctx.closePath();

      // Gradient fill
      const grad = ctx.createLinearGradient(0, yBase - amplitude * 2, 0, h);
      grad.addColorStop(0, color.replace('ALPHA', String(alpha)));
      grad.addColorStop(0.5, color.replace('ALPHA', String(alpha * 0.5)));
      grad.addColorStop(1, color.replace('ALPHA', '0'));
      ctx.fillStyle = grad;
      ctx.fill();
    };

    const animate = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      time += 0.008;

      ctx.clearRect(0, 0, w, h);

      // Three wave layers - blue tones matching brand, positioned mid-screen
      drawWave(h * 0.45, 40, 5, 0.3, 0.12, 'rgba(49,130,206,ALPHA)');
      drawWave(h * 0.55, 35, 7, 0.5, 0.09, 'rgba(56,189,248,ALPHA)');
      drawWave(h * 0.63, 28, 9, 0.7, 0.06, 'rgba(99,102,241,ALPHA)');

      animId = requestAnimationFrame(animate);
    };

    resize();
    animate();

    window.addEventListener('resize', resize);
    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animId);
    };
  }, [prefersReducedMotion]);

  if (prefersReducedMotion) return null;

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none"
      style={{ zIndex: 1 }}
    />
  );
};
