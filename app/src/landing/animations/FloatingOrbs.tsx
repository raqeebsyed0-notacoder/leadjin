import { useEffect, useState } from 'react';

export const FloatingOrbs: React.FC = () => {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);
    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  if (prefersReducedMotion) return null;

  return (
    <>
      <style>{`
        @keyframes orbFloat1 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(30px, -40px) scale(1.1); }
        }
        @keyframes orbFloat2 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(-40px, 30px) scale(0.95); }
        }
        @keyframes orbFloat3 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(20px, 50px) scale(1.05); }
        }
        .orb-1 { animation: orbFloat1 25s ease-in-out infinite; }
        .orb-2 { animation: orbFloat2 30s ease-in-out infinite; }
        .orb-3 { animation: orbFloat3 20s ease-in-out infinite; }
      `}</style>
      
      {/* Orb container - fixed, full viewport, above bg but below content */}
      <div className="fixed inset-0 pointer-events-none" style={{ zIndex: 1 }}>
        {/* Orb 1 - top left, blue */}
        <div
          className="orb-1 absolute w-[700px] h-[700px] rounded-full"
          style={{
            background: 'radial-gradient(circle, rgba(49,130,206,0.25) 0%, rgba(49,130,206,0.08) 40%, transparent 70%)',
            filter: 'blur(80px)',
            top: '-5%',
            left: '-15%',
          }}
        />

        {/* Orb 2 - mid right, cyan */}
        <div
          className="orb-2 absolute w-[600px] h-[600px] rounded-full"
          style={{
            background: 'radial-gradient(circle, rgba(56,189,248,0.18) 0%, rgba(56,189,248,0.05) 40%, transparent 70%)',
            filter: 'blur(70px)',
            top: '30%',
            right: '-10%',
          }}
        />

        {/* Orb 3 - bottom center, blue-purple */}
        <div
          className="orb-3 absolute w-[800px] h-[800px] rounded-full"
          style={{
            background: 'radial-gradient(circle, rgba(99,102,241,0.15) 0%, rgba(49,130,206,0.05) 40%, transparent 70%)',
            filter: 'blur(90px)',
            bottom: '-10%',
            left: '20%',
          }}
        />
      </div>
    </>
  );
};
