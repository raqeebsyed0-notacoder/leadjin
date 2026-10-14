import { motion } from "motion/react";
import { EuphoriaLogoSVG } from "./EuphoriaLogoSVG";

interface FooterProps {
  t: any;
}

const viewportOpts = { once: true, margin: "-50px" };

export const Footer: React.FC<FooterProps> = ({ t }) => {
  return (
    <motion.footer
      className="relative"
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={viewportOpts}
      transition={{ duration: 0.6 }}
    >
      {/* Gradient separator line */}
      <motion.div
        className="h-px w-full"
        style={{
          background: "linear-gradient(90deg, transparent 0%, var(--app-accent) 50%, transparent 100%)",
          transformOrigin: "left",
        }}
        initial={{ scaleX: 0, opacity: 0 }}
        whileInView={{ scaleX: 1, opacity: 0.5 }}
        viewport={viewportOpts}
        transition={{ duration: 1.2, ease: "easeOut" }}
      />

      {/* Main grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-10 max-w-[1080px] mx-auto px-4 md:px-10 py-14">

        {/* Col 1: Brand */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={viewportOpts}
          transition={{ duration: 0.5, delay: 0 }}
        >
          <div className="leadjin-logo text-sm text-app-text mb-4">LEADJIN</div>
          <p className="text-[11px] opacity-40 leading-relaxed max-w-[200px] text-app-text">
            AI-native B2B lead intelligence built for the Saudi market.
          </p>
          <p className="text-[10px] opacity-20 mt-8 text-app-text">{t.footer.copyright}</p>
        </motion.div>

        {/* Col 2: Platform */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={viewportOpts}
          transition={{ duration: 0.5, delay: 0.08 }}
        >
          <p className="text-[9px] font-semibold tracking-[0.22em] uppercase opacity-30 mb-5 text-app-text">
            Platform
          </p>
          {[
            ["Harvest", "#features"],
            ["CRM", "#features"],
            ["Analytics", "#features"],
            ["Pricing", "#pricing"],
          ].map(([label, href]) => (
            <a
              key={label}
              href={href}
              className="block text-[11px] opacity-35 hover:opacity-75 transition-opacity duration-200 mb-[10px] uppercase tracking-[0.06em] text-app-text"
            >
              {label}
            </a>
          ))}
        </motion.div>

        {/* Col 3: Support */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={viewportOpts}
          transition={{ duration: 0.5, delay: 0.16 }}
        >
          <p className="text-[9px] font-semibold tracking-[0.22em] uppercase opacity-30 mb-5 text-app-text">
            Support
          </p>
          {[
            ["Contact", "mailto:support@euphoriaexperiences.com"],
            ["Privacy", "mailto:support@euphoriaexperiences.com?subject=Privacy"],
            ["Terms", "mailto:support@euphoriaexperiences.com?subject=Terms"],
          ].map(([label, href]) => (
            <a
              key={label}
              href={href}
              className="block text-[11px] opacity-35 hover:opacity-75 transition-opacity duration-200 mb-[10px] uppercase tracking-[0.06em] text-app-text"
            >
              {label}
            </a>
          ))}
        </motion.div>
      </div>

      {/* Euphoria brand strip */}
      <motion.div
        className="border-t border-app-border/30 py-10 flex flex-col items-center gap-3"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={viewportOpts}
        transition={{ duration: 0.8, delay: 0.3 }}
      >
        <p className="text-[8px] tracking-[0.38em] uppercase opacity-20 text-app-text">
          a product by
        </p>
        <EuphoriaLogoSVG
          className="h-8 md:h-11 text-app-text opacity-45 hover:opacity-85 transition-opacity duration-700"
          speed={0.65}
          loop={true}
        />
      </motion.div>
    </motion.footer>
  );
};
