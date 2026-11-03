import { motion } from 'motion/react';
import { MagneticButton } from '../animations/MagneticButton';

interface CTASectionProps {
  t: any;
  onCtaClick?: () => void;
}

export const CTASection: React.FC<CTASectionProps> = ({ t, onCtaClick }) => {
  const scrollToSection = (href: string) => {
    const element = document.querySelector(href);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <section id="cta" className="py-24 px-4 md:px-10">
      <div className="max-w-[1080px] mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.6 }}
          className="relative rounded-[40px] border border-app-border bg-app-surface backdrop-blur-xl p-12 md:p-16 text-center overflow-hidden"
        >
          {/* Top gradient line */}
          <div 
            className="absolute top-0 left-[20%] right-[20%] h-px opacity-40"
            style={{
              background: 'linear-gradient(to right, transparent, var(--app-accent), transparent)',
            }}
          />

          <h2 className="text-[clamp(22px,3.2vw,42px)] font-light tracking-[-0.02em] leading-[1.2] mb-3 text-app-text">
            {t.cta.title1}<br />
            <strong className="font-bold">{t.cta.title2}</strong>
          </h2>
          
          <p className="text-sm opacity-50 mb-8 max-w-[400px] mx-auto">
            {t.cta.subtitle}
          </p>
          
          <div className="flex flex-wrap gap-3 justify-center">
            <MagneticButton
              onClick={onCtaClick}
              className="px-9 py-4 rounded-lg bg-app-accent text-app-bg text-sm font-medium uppercase tracking-wide hover:opacity-80 transition-all"
            >
              {t.cta.primary}
            </MagneticButton>
            <MagneticButton
              onClick={() => scrollToSection('#pricing')}
              className="px-9 py-4 rounded-lg border border-app-border text-app-text text-sm font-medium uppercase tracking-wide hover:bg-app-surface transition-all"
            >
              {t.cta.secondary}
            </MagneticButton>
          </div>
        </motion.div>
      </div>
    </section>
  );
};
