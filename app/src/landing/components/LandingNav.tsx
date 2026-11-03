import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Menu, X, Sun, Moon } from 'lucide-react';

interface LandingNavProps {
  language: 'en' | 'ar';
  setLanguage: (lang: 'en' | 'ar') => void;
  darkMode: boolean;
  setDarkMode: (dark: boolean) => void;
  t: any;
}

export const LandingNav: React.FC<LandingNavProps> = ({ 
  language, 
  setLanguage, 
  darkMode, 
  setDarkMode,
  t 
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  
  const navLinks = [
    { href: '#why', label: t.nav.why },
    { href: '#features', label: t.nav.features },
    { href: '#pricing', label: t.nav.pricing },
    { href: '#market', label: t.nav.market },
  ];

  const scrollToSection = (href: string) => {
    const element = document.querySelector(href);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
    setMobileMenuOpen(false);
  };

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 h-[60px] flex items-center px-4 md:px-10 glass border-b border-app-border/50">
      {/* Logo */}
      <a href="#" className="text-sm font-medium tracking-[0.35em] uppercase text-app-text no-underline shrink-0">
        L E A D J I N
      </a>

      {/* Desktop Nav Links */}
      <div className="hidden md:flex items-center gap-7 ml-auto rtl:ml-0 rtl:mr-auto">
        {navLinks.map((link) => (
          <button
            key={link.href}
            onClick={() => scrollToSection(link.href)}
            className="text-[10px] font-bold tracking-[0.12em] uppercase text-app-text/40 hover:text-app-text transition-opacity no-underline"
          >
            {link.label}
          </button>
        ))}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 ml-auto md:ml-6 rtl:ml-0 rtl:md:ml-0 rtl:mr-auto rtl:md:mr-6">
        {/* Language Toggle */}
        <button 
          onClick={() => setLanguage(language === 'en' ? 'ar' : 'en')}
          className="w-9 h-9 rounded-lg border border-app-border bg-app-surface text-app-text text-sm hover:border-app-text/30 transition-all"
        >
          {language === 'en' ? 'ع' : 'EN'}
        </button>
        
        {/* Theme Toggle */}
        <button 
          onClick={() => setDarkMode(!darkMode)}
          className="w-9 h-9 rounded-lg border border-app-border bg-app-surface text-app-text hover:border-app-text/30 transition-all flex items-center justify-center"
        >
          {darkMode ? <Sun size={14} /> : <Moon size={14} />}
        </button>
        
        {/* Desktop CTAs */}
        <div className="hidden md:flex gap-2 ml-2 rtl:ml-0 rtl:mr-2">
          <button 
            onClick={() => scrollToSection('#pricing')}
            className="px-4 py-2 rounded-lg border border-app-border text-app-text text-xs font-medium uppercase tracking-wide hover:bg-app-surface transition-all"
          >
            {t.nav.bookCall}
          </button>
          <button 
            onClick={() => scrollToSection('#pricing')}
            className="px-4 py-2 rounded-lg bg-app-accent text-app-bg text-xs font-medium uppercase tracking-wide hover:opacity-80 transition-all"
          >
            {t.nav.freeTrial}
          </button>
        </div>

        {/* Mobile Menu Toggle */}
        <button 
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="md:hidden w-9 h-9 rounded-lg border border-app-border bg-app-surface text-app-text flex items-center justify-center"
        >
          {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
        </button>
      </div>

      {/* Mobile Menu Overlay */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, x: language === 'ar' ? '100%' : '-100%' }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: language === 'ar' ? '100%' : '-100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed inset-0 top-[60px] z-40 bg-app-bg/95 backdrop-blur-xl md:hidden"
          >
            <div className="flex flex-col p-6 gap-4">
              {navLinks.map((link) => (
                <button
                  key={link.href}
                  onClick={() => scrollToSection(link.href)}
                  className="text-left text-lg font-medium text-app-text py-3 border-b border-app-border/20"
                >
                  {link.label}
                </button>
              ))}
              <div className="flex flex-col gap-3 mt-4">
                <button 
                  onClick={() => scrollToSection('#pricing')}
                  className="w-full py-3 rounded-lg border border-app-border text-app-text text-sm font-medium uppercase tracking-wide"
                >
                  {t.nav.bookCall}
                </button>
                <button 
                  onClick={() => scrollToSection('#pricing')}
                  className="w-full py-3 rounded-lg bg-app-accent text-app-bg text-sm font-medium uppercase tracking-wide"
                >
                  {t.nav.freeTrial}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
};
