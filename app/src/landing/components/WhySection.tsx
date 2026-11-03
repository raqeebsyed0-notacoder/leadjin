import { motion } from 'motion/react';
import { TiltCard } from '../animations/TiltCard';

interface WhySectionProps {
  t: any;
}

export const WhySection: React.FC<WhySectionProps> = ({ t }) => {
  return (
    <section id="why" className="py-24 px-4 md:px-10">
      <div className="max-w-[1080px] mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.6 }}
          className="mb-12"
        >
          <div className="text-[10px] font-bold tracking-[0.15em] uppercase opacity-40 mb-3 text-app-text">
            {t.why.eyebrow}
          </div>
          <h2 className="text-[clamp(22px,2.8vw,38px)] font-light leading-[1.2] tracking-[-0.02em] text-app-text">
            {t.why.title1} <strong className="font-bold">{t.why.title2}</strong>
          </h2>
          <p className="mt-3 text-sm leading-[1.7] opacity-50 max-w-[460px]">
            {t.why.subtitle}
          </p>
        </motion.div>

        {/* Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
          {/* Majlis Mode Card - Span 2 */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-100px' }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="md:col-span-2"
          >
            <TiltCard className="p-8 rounded-[32px] border border-app-border bg-app-surface backdrop-blur-xl border-l-2 md:border-l-2 rtl:border-l-0 rtl:border-r-2 rtl:md:border-r-2 border-app-accent">
              <div className="text-[10px] font-bold tracking-[0.12em] uppercase opacity-40 mb-2.5">
                {t.why.majlisMode.eyebrow}
              </div>
              <h3 className="text-base font-semibold mb-2 text-app-text">{t.why.majlisMode.title}</h3>
              <p className="text-sm leading-[1.7] opacity-50">{t.why.majlisMode.description}</p>
            </TiltCard>
          </motion.div>

          {/* Vision 2030 Card */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-100px' }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <TiltCard className="p-8 rounded-[32px] border border-app-border bg-app-surface backdrop-blur-xl h-full hover:border-app-text/25 transition-colors">
              <div className="text-[10px] font-bold tracking-[0.12em] uppercase opacity-40 mb-2.5">
                {t.why.v2030.eyebrow}
              </div>
              <h3 className="text-base font-semibold mb-2 text-app-text">{t.why.v2030.title}</h3>
              <p className="text-sm leading-[1.7] opacity-50">{t.why.v2030.description}</p>
            </TiltCard>
          </motion.div>

          {/* Geo-Semantic Card */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-100px' }}
            transition={{ duration: 0.6, delay: 0.3 }}
          >
            <TiltCard className="p-8 rounded-[32px] border border-app-border bg-app-surface backdrop-blur-xl h-full hover:border-app-text/25 transition-colors">
              <div className="text-[10px] font-bold tracking-[0.12em] uppercase opacity-40 mb-2.5">
                {t.why.geoSemantic.eyebrow}
              </div>
              <h3 className="text-base font-semibold mb-2 text-app-text">{t.why.geoSemantic.title}</h3>
              <p className="text-sm leading-[1.7] opacity-50">{t.why.geoSemantic.description}</p>
            </TiltCard>
          </motion.div>
        </div>
      </div>
    </section>
  );
};
