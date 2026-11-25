import { motion } from 'motion/react';
import { Check, X } from 'lucide-react';
import { TiltCard } from '../animations/TiltCard';
import { MagneticButton } from '../animations/MagneticButton';

interface PricingSectionProps {
  t: any;
  onCtaClick?: () => void;
}

export const PricingSection: React.FC<PricingSectionProps> = ({ t, onCtaClick }) => {
  const scrollToSection = (href: string) => {
    const element = document.querySelector(href);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <section id="pricing" className="py-24 px-4 md:px-10">
      <div className="max-w-[1080px] mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <div className="text-[10px] font-bold tracking-[0.15em] uppercase opacity-40 mb-3 text-app-text">
            {t.pricing.eyebrow}
          </div>
          <h2 className="text-[clamp(22px,2.8vw,38px)] font-light leading-[1.2] tracking-[-0.02em] text-app-text">
            <strong className="font-bold">{t.pricing.title1}</strong> {t.pricing.title2}
          </h2>
          <p className="mt-3 text-sm opacity-50 max-w-[460px] mx-auto">
            {t.pricing.subtitle}
          </p>
        </motion.div>

        {/* Pricing Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 items-start">
          {t.pricing.tiers.map((tier: any, idx: number) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-100px' }}
              transition={{ duration: 0.6, delay: idx * 0.1 }}
              className={`relative ${tier.featured ? 'md:-mt-4 md:mb-4' : ''}`}
            >
              <TiltCard className={`p-8 rounded-[32px] border bg-app-surface backdrop-blur-xl h-full ${
                tier.featured 
                  ? 'border-app-text/30' 
                  : 'border-app-border hover:border-app-text/25'
              } transition-colors`}>
                {/* Featured Badge */}
                {tier.featured && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-app-accent text-app-bg text-[9px] font-bold tracking-[0.12em] uppercase whitespace-nowrap">
                    MOST POPULAR
                  </div>
                )}

                {/* Tier Info */}
                <div className="text-[10px] font-bold tracking-[0.15em] uppercase opacity-35 mb-1">
                  {tier.tier}
                </div>
                <div className="text-lg font-semibold mb-4 text-app-text">{tier.name}</div>
                
                {/* Price */}
                <div className="text-[34px] font-extralight tracking-[-0.02em] leading-none text-app-text flex items-start justify-center gap-1">
                  <sup className="text-sm font-medium mt-2">SAR</sup>
                  {tier.price}
                  <sub className="text-sm font-normal opacity-40 self-end mb-2">/mo</sub>
                </div>
                
                {/* Leads */}
                <div className="text-[10px] font-bold tracking-[0.08em] uppercase opacity-40 mt-2 mb-5">
                  {tier.leads}
                </div>

                <div className="h-px bg-app-border my-4" />

                {/* Features */}
                <ul className="space-y-2">
                  {tier.features.map((feature: any, fidx: number) => (
                    <li key={fidx} className="flex items-start gap-2 text-sm leading-relaxed">
                      {feature.included ? (
                        <Check size={14} className="text-emerald-500 mt-1 shrink-0" />
                      ) : (
                        <X size={14} className="opacity-20 mt-1 shrink-0" />
                      )}
                      <span className={feature.included ? 'opacity-70' : 'opacity-30'}>
                        {feature.text}
                      </span>
                    </li>
                  ))}
                </ul>

                {/* CTA */}
                <MagneticButton
                  onClick={onCtaClick}
                  className={`w-full mt-6 py-3 rounded-lg text-xs font-medium uppercase tracking-wide transition-all ${
                    tier.featured
                      ? 'bg-app-accent text-app-bg hover:opacity-80'
                      : 'border border-app-border text-app-text hover:bg-app-surface'
                  }`}
                >
                  {tier.cta}
                </MagneticButton>
              </TiltCard>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};
