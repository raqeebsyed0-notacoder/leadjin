import { motion } from 'motion/react';
import { TiltCard } from '../animations/TiltCard';

interface FeaturesSectionProps {
  t: any;
}

export const FeaturesSection: React.FC<FeaturesSectionProps> = ({ t }) => {
  return (
    <section id="features" className="py-24 px-4 md:px-10">
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
            {t.features.eyebrow}
          </div>
          <h2 className="text-[clamp(22px,2.8vw,38px)] font-light leading-[1.2] tracking-[-0.02em] text-app-text">
            {t.features.title1} <strong className="font-bold">{t.features.title2}</strong>
          </h2>
        </motion.div>

        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {t.features.list.map((feature: any, idx: number) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-100px' }}
              transition={{ duration: 0.6, delay: idx * 0.08 }}
            >
              <TiltCard className="p-6 rounded-3xl border border-app-border bg-app-surface backdrop-blur-xl h-full hover:border-app-text/25 transition-colors">
                <div className="font-mono text-[10px] font-medium opacity-30 mb-3.5">
                  {feature.num}
                </div>
                <h3 className="text-sm font-semibold mb-2 text-app-text">{feature.title}</h3>
                <p className="text-xs leading-[1.65] opacity-50">{feature.desc}</p>
              </TiltCard>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};
