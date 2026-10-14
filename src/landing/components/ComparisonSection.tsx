import { motion } from 'motion/react';
import { Check, X } from 'lucide-react';

interface ComparisonSectionProps {
  t: any;
}

export const ComparisonSection: React.FC<ComparisonSectionProps> = ({ t }) => {
  return (
    <section className="py-24 px-4 md:px-10">
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
            {t.comparison.eyebrow}
          </div>
          <h2 className="text-[clamp(22px,2.8vw,38px)] font-light leading-[1.2] tracking-[-0.02em] text-app-text">
            {t.comparison.title1} <strong className="font-bold">{t.comparison.title2}</strong>
          </h2>
        </motion.div>

        {/* Comparison Table */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="rounded-3xl border border-app-border bg-app-surface backdrop-blur-xl overflow-hidden"
        >
          {/* Header Row */}
          <div className="grid grid-cols-[2fr_1fr_1fr] md:grid-cols-[2fr_1fr_1fr] px-6 py-3 border-b border-app-border bg-app-accent/5">
            <div className="text-[10px] font-bold tracking-[0.12em] uppercase opacity-35 text-app-text">
              {t.comparison.headers[0]}
            </div>
            <div className="text-[10px] font-bold tracking-[0.12em] uppercase text-app-text text-center">
              {t.comparison.headers[1]}
            </div>
            <div className="text-[10px] font-bold tracking-[0.12em] uppercase opacity-35 text-app-text text-center">
              {t.comparison.headers[2]}
            </div>
          </div>

          {/* Data Rows */}
          {t.comparison.rows.map((row: any, idx: number) => (
            <div 
              key={idx}
              className="grid grid-cols-[2fr_1fr_1fr] md:grid-cols-[2fr_1fr_1fr] px-6 py-3.5 border-b border-app-border/50 items-center last:border-b-0"
            >
              <div className="text-sm opacity-55 text-app-text pr-4">{row[0]}</div>
              <div className="flex justify-center">
                {row[1] ? (
                  <span className="text-emerald-500 text-sm font-semibold flex items-center gap-1">
                    <Check size={16} />
                  </span>
                ) : (
                  <span className="opacity-20 text-sm"><X size={16} /></span>
                )}
              </div>
              <div className="flex justify-center">
                {row[2] ? (
                  <span className="text-emerald-500 text-sm font-semibold flex items-center gap-1">
                    <Check size={16} />
                  </span>
                ) : (
                  <span className="opacity-20 text-sm"><X size={16} /></span>
                )}
              </div>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  );
};
