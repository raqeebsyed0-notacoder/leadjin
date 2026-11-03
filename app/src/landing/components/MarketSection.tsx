import { motion } from 'motion/react';
import { TiltCard } from '../animations/TiltCard';

interface MarketSectionProps {
  t: any;
}

export const MarketSection: React.FC<MarketSectionProps> = ({ t }) => {
  return (
    <section id="market" className="py-24 px-4 md:px-10">
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
            {t.market.eyebrow}
          </div>
          <h2 className="text-[clamp(22px,2.8vw,38px)] font-light leading-[1.2] tracking-[-0.02em] text-app-text">
            {t.market.title1} <strong className="font-bold">{t.market.title2}</strong>
          </h2>
          <p className="mt-3 text-sm opacity-50 max-w-[460px]">
            {t.market.subtitle}
          </p>
        </motion.div>

        {/* Market Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
          {t.market.cards.map((card: any, idx: number) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-100px' }}
              transition={{ duration: 0.6, delay: idx * 0.1 }}
            >
              <TiltCard className="p-7 rounded-3xl border border-app-border bg-app-surface backdrop-blur-xl hover:border-app-text/25 transition-colors">
                <div className="text-2xl font-extralight tracking-[-0.02em] text-app-text mb-1.5">
                  {card.rate}
                </div>
                <div className="text-sm font-semibold text-app-text mb-1">
                  {card.industry}
                </div>
                <div className="text-xs opacity-40">
                  {card.desc}
                </div>
              </TiltCard>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};
