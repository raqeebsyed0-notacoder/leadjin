import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronLeft, ChevronRight, Quote } from 'lucide-react';

interface TestimonialsSectionProps {
  t: any;
  language: 'en' | 'ar';
}

export const TestimonialsSection: React.FC<TestimonialsSectionProps> = ({ t, language }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  
  // PLACEHOLDER: These can be replaced with real testimonials
  const testimonials = t.testimonials.items || [];

  const next = () => setCurrentIndex((prev) => (prev + 1) % testimonials.length);
  const prev = () => setCurrentIndex((prev) => (prev - 1 + testimonials.length) % testimonials.length);

  if (testimonials.length === 0) return null;

  return (
    <section className="py-24 px-4 md:px-10 overflow-hidden">
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
            {t.testimonials.eyebrow}
          </div>
          <h2 className="text-[clamp(22px,2.8vw,38px)] font-light leading-[1.2] tracking-[-0.02em] text-app-text">
            <strong className="font-bold">{t.testimonials.title}</strong>
          </h2>
        </motion.div>

        {/* Testimonial Cards */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="relative"
        >
          <div className="relative h-[300px] md:h-[250px]">
            <AnimatePresence mode="wait">
              <motion.div
                key={currentIndex}
                initial={{ opacity: 0, x: language === 'ar' ? 100 : -100 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: language === 'ar' ? -100 : 100 }}
                transition={{ duration: 0.3 }}
                drag="x"
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.2}
                onDragEnd={(_, info) => {
                  if (info.offset.x > 100) prev();
                  if (info.offset.x < -100) next();
                }}
                className="absolute inset-0 p-8 md:p-12 rounded-[40px] border border-app-border bg-app-surface backdrop-blur-xl cursor-grab active:cursor-grabbing"
              >
                <Quote className="absolute top-6 right-6 w-8 h-8 opacity-10" />
                <blockquote className="text-lg md:text-xl font-light leading-relaxed mb-8 text-app-text">
                  "{testimonials[currentIndex].quote}"
                </blockquote>
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-app-accent/10 flex items-center justify-center text-app-accent font-bold text-lg">
                    {testimonials[currentIndex].name[0]}
                  </div>
                  <div>
                    <div className="font-medium text-app-text">{testimonials[currentIndex].name}</div>
                    <div className="text-sm opacity-50">{testimonials[currentIndex].role}, {testimonials[currentIndex].company}</div>
                  </div>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Navigation */}
          <div className="flex justify-center gap-4 mt-8">
            <button
              onClick={prev}
              className="w-10 h-10 rounded-full border border-app-border bg-app-surface flex items-center justify-center hover:bg-app-accent/10 transition-colors"
            >
              <ChevronLeft size={18} className="rtl:rotate-180" />
            </button>
            <div className="flex items-center gap-2">
              {testimonials.map((_: any, idx: number) => (
                <button
                  key={idx}
                  onClick={() => setCurrentIndex(idx)}
                  className={`w-2 h-2 rounded-full transition-all ${
                    idx === currentIndex ? 'bg-app-accent w-6' : 'bg-app-text/20'
                  }`}
                />
              ))}
            </div>
            <button
              onClick={next}
              className="w-10 h-10 rounded-full border border-app-border bg-app-surface flex items-center justify-center hover:bg-app-accent/10 transition-colors"
            >
              <ChevronRight size={18} className="rtl:rotate-180" />
            </button>
          </div>
        </motion.div>
      </div>
    </section>
  );
};
