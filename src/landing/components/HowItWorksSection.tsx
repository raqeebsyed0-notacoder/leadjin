import { motion } from 'motion/react';

interface HowItWorksSectionProps {
  t: any;
}

export const HowItWorksSection: React.FC<HowItWorksSectionProps> = ({ t }) => {
  return (
    <section id="how-it-works" className="py-24 px-4 md:px-10">
      <div className="max-w-[1080px] mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <div className="text-[10px] font-bold tracking-[0.15em] uppercase opacity-40 mb-3 text-app-text">
            {t.howItWorks.eyebrow}
          </div>
          <h2 className="text-[clamp(22px,2.8vw,38px)] font-light leading-[1.2] tracking-[-0.02em] text-app-text">
            <strong className="font-bold">{t.howItWorks.title}</strong>
          </h2>
        </motion.div>

        {/* Steps Timeline */}
        <div className="relative">
          {/* Horizontal Line (Desktop) */}
          <div className="hidden md:block absolute top-[40px] left-[12.5%] right-[12.5%] h-px bg-app-border" />
          
          {/* Steps */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 md:gap-4">
            {t.howItWorks.steps.map((step: any, idx: number) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-100px' }}
                transition={{ duration: 0.6, delay: idx * 0.15 }}
                className="relative flex flex-col items-center text-center"
              >
                {/* Step Number Circle */}
                <div className="relative z-10 w-20 h-20 rounded-full border-2 border-app-accent bg-app-bg flex items-center justify-center mb-6">
                  <span className="text-2xl font-light text-app-accent">{idx + 1}</span>
                </div>
                
                {/* Content */}
                <h3 className="text-base font-semibold mb-2 text-app-text">{step.title}</h3>
                <p className="text-sm opacity-50 leading-relaxed max-w-[200px]">{step.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};
