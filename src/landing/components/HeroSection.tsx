import { motion } from 'motion/react';
import { MagneticButton } from '../animations/MagneticButton';
import { MorphingText } from '../animations/MorphingText';
import { IntelligenceOrb } from '../animations/IntelligenceOrb';

interface HeroSectionProps {
  t: any;
  language: 'en' | 'ar';
  darkMode: boolean;
  onCtaClick?: () => void;
}

export const HeroSection: React.FC<HeroSectionProps> = ({ t, language, darkMode, onCtaClick }) => {
  const morphingPhrases = language === 'en'
    ? ['Intelligence.', 'Relationships.', 'Growth.', 'Success.']
    : ['الذكاء.', 'العلاقات.', 'النمو.', 'النجاح.'];

  const scrollToSection = (href: string) => {
    const element = document.querySelector(href);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <section className="min-h-screen flex items-center pt-[80px] pb-[40px] px-6 md:px-12 lg:px-20 relative overflow-hidden">
      {/* Grid background */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(rgba(var(--rgb-text), 0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(var(--rgb-text), 0.03) 1px, transparent 1px)
          `,
          backgroundSize: '48px 48px',
        }}
      />

      {/* Split Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[55%_45%] gap-8 lg:gap-4 max-w-[1300px] mx-auto w-full relative z-10 items-center">

        {/* Left: Content -- RTL-aware alignment */}
        <div className="text-left rtl:text-right">
          {/* Pills */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="flex flex-wrap gap-2 mb-8"
          >
            <div className="pill">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5 rtl:mr-0 rtl:ml-1.5" />
              <span className="text-[10px] font-bold tracking-[0.12em] uppercase">{t.hero.nowLive}</span>
            </div>
            <div className="pill">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mr-1.5 rtl:mr-0 rtl:ml-1.5" />
              <span className="text-[10px] font-bold tracking-[0.12em] uppercase">{t.hero.majlisMode}</span>
            </div>
            <div className="pill">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mr-1.5 rtl:mr-0 rtl:ml-1.5" />
              <span className="text-[10px] font-bold tracking-[0.12em] uppercase">{t.hero.v2030Engine}</span>
            </div>
          </motion.div>

          {/* Title */}
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-[clamp(28px,4vw,52px)] font-extralight tracking-[-0.02em] leading-[1.12] text-app-text mb-2"
          >
            <span className="block">{t.hero.line1}</span>
            <span className="block">{t.hero.line2}</span>
            <span className="block font-bold text-[#3182ce]">
              {t.hero.line3.split(' ').slice(0, -1).join(' ')}{' '}
              <MorphingText phrases={morphingPhrases} interval={3000} />
            </span>
          </motion.h1>

          {/* Subtitle */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="mt-5 text-sm font-normal leading-[1.8] opacity-50 max-w-[460px]"
          >
            {t.hero.subtitle}
          </motion.p>

          {/* CTAs */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="mt-8 flex gap-3 flex-wrap"
          >
            <MagneticButton
              onClick={onCtaClick}
              className="px-8 py-3.5 rounded-lg bg-[#3182ce] text-white text-sm font-medium uppercase tracking-wide hover:bg-[#2b6cb0] transition-all"
            >
              {t.hero.ctaPrimary}
            </MagneticButton>
            <MagneticButton
              onClick={() => scrollToSection('#pricing')}
              className="px-8 py-3.5 rounded-lg border border-app-border text-app-text text-sm font-medium uppercase tracking-wide hover:bg-app-surface transition-all"
            >
              {t.hero.ctaSecondary}
            </MagneticButton>
          </motion.div>
        </div>

        {/* Right: 3D Intelligence Orb */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, delay: 0.3 }}
          className="hidden md:flex items-center justify-center h-[400px] lg:h-[520px]"
        >
          <IntelligenceOrb darkMode={darkMode} />
        </motion.div>
      </div>
    </section>
  );
};
