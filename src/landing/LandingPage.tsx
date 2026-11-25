import { useState, useEffect } from 'react';
import { LandingNav } from './components/LandingNav';
import { HeroSection } from './components/HeroSection';
import { WhySection } from './components/WhySection';
import { FeaturesSection } from './components/FeaturesSection';
import { HowItWorksSection } from './components/HowItWorksSection';
import { ComparisonSection } from './components/ComparisonSection';
import { TestimonialsSection } from './components/TestimonialsSection';
import { PricingSection } from './components/PricingSection';
import { MarketSection } from './components/MarketSection';
import { FAQSection } from './components/FAQSection';
import { CTASection } from './components/CTASection';
import { Footer } from './components/Footer';
import { FloatingOrbs } from './animations/FloatingOrbs';
import { ScrollProgressBar } from './animations/ScrollProgressBar';
import { GLSLHills } from './animations/GLSLHills';
import { landingTranslations } from './landingTranslations';

interface LandingPageProps {
  onEnterApp: () => void;
}

// Export onEnterApp to be used by child components
export const LandingPage: React.FC<LandingPageProps> = ({ onEnterApp }) => {
  const [language, setLanguage] = useState<'en' | 'ar'>('en');
  const [darkMode, setDarkMode] = useState(true);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Check for saved preferences
    try {
      const savedLang = localStorage.getItem('leadjin_lang');
      if (savedLang === 'ar' || savedLang === 'en') {
        setLanguage(savedLang);
      }
      const savedTheme = localStorage.getItem('leadjin_theme');
      if (savedTheme === 'light') {
        setDarkMode(false);
      } else {
        setDarkMode(true); // default to dark
      }
    } catch (e) {
      // Ignore localStorage errors
    }
    setIsVisible(true);
  }, []);

  useEffect(() => {
    // Apply theme
    if (darkMode) {
      document.documentElement.classList.add('dark');
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.setAttribute('data-theme', 'light');
    }
    try {
      localStorage.setItem('leadjin_theme', darkMode ? 'dark' : 'light');
    } catch (e) {}
  }, [darkMode]);

  useEffect(() => {
    // Apply language direction
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = language;
    try {
      localStorage.setItem('leadjin_lang', language);
    } catch (e) {}
  }, [language]);

  const t = landingTranslations[language];

  if (!isVisible) return null;

  return (
    <div className="min-h-screen bg-app-bg text-app-text transition-colors duration-700" style={{ overflowX: 'clip' }}>
      {/* Scroll Progress */}
      <ScrollProgressBar />
      
      {/* Fixed backgrounds - persist on scroll */}
      <GLSLHills darkMode={darkMode} />
      <FloatingOrbs />
      
      {/* Navigation */}
      <LandingNav
        language={language}
        setLanguage={setLanguage}
        darkMode={darkMode}
        setDarkMode={setDarkMode}
        t={t}
      />

      {/* Main Content - above orbs */}
      <main className="relative" style={{ zIndex: 2 }}>
        <HeroSection t={t} language={language} darkMode={darkMode} onCtaClick={onEnterApp} />
        <WhySection t={t} />
        <FeaturesSection t={t} />
        <HowItWorksSection t={t} />
        <ComparisonSection t={t} />
        <TestimonialsSection t={t} language={language} />
        <PricingSection t={t} onCtaClick={onEnterApp} />
        <MarketSection t={t} />
        <FAQSection t={t} />
        <CTASection t={t} onCtaClick={onEnterApp} />
      </main>
      
      {/* Footer */}
      <Footer t={t} />
      
      {/* CSS Variables for theming */}
      <style>{`
        :root {
          --app-bg: #ffffff;
          --app-text: #3182ce;
          --app-accent: #3182ce;
          --app-surface: rgba(255, 255, 255, 0.6);
          --app-border: rgba(49, 130, 206, 0.2);
          --rgb-text: 49, 130, 206;
          --rgb-bg: 255, 255, 255;
        }
        
        :root.dark,
        [data-theme="dark"] {
          --app-bg: #050508;
          --app-text: #ffffff;
          --app-accent: #3182ce;
          --app-surface: rgba(255, 255, 255, 0.04);
          --app-border: rgba(255, 255, 255, 0.08);
          --rgb-text: 255, 255, 255;
          --rgb-bg: 5, 5, 8;
        }
        
        .glass {
          background: var(--app-surface);
          backdrop-filter: blur(24px);
          -webkit-backdrop-filter: blur(24px);
        }
        
        .pill {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 5px 12px;
          border-radius: 100px;
          border: 1px solid var(--app-border);
          background: var(--app-surface);
          backdrop-filter: blur(12px);
          color: var(--app-text);
        }
      `}</style>
    </div>
  );
};
