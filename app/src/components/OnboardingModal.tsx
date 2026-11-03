import { motion } from 'motion/react';
import { Zap, Sun, Moon, Globe, Trophy } from 'lucide-react';
import { translations } from '../i18n/translations';

interface OnboardingModalProps {
  onComplete: () => void;
  language: 'en' | 'ar';
  setLanguage: (lang: 'en' | 'ar') => void;
  darkMode: boolean;
  setDarkMode: (dark: boolean) => void;
  majlisModeEnabled: boolean;
  setMajlisModeEnabled: (enabled: boolean) => void;
  vision2030Enabled: boolean;
  setVision2030Enabled: (enabled: boolean) => void;
}

export const OnboardingModal = ({ 
  onComplete, 
  language, 
  setLanguage, 
  darkMode, 
  setDarkMode, 
  majlisModeEnabled, 
  setMajlisModeEnabled, 
  vision2030Enabled, 
  setVision2030Enabled 
}: OnboardingModalProps) => {
  const t = translations[language as keyof typeof translations] || translations.en;
  
  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 bg-app-bg/90 backdrop-blur-xl z-[100] flex items-center justify-center p-6"
    >
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="w-full max-w-lg glass p-10 rounded-[40px] border border-app-accent/20 space-y-10 text-center"
      >
        <div className="space-y-4">
          <div className="w-20 h-20 bg-app-accent text-app-bg rounded-full flex items-center justify-center mx-auto shadow-2xl shadow-app-accent/20">
            <Zap size={40} fill="currentColor" />
          </div>
          <h2 className="text-4xl font-light tracking-tight">{t.welcome}</h2>
        </div>

        <div className="space-y-8">
          <div className="space-y-4">
            <p className="text-[10px] uppercase tracking-[0.3em] opacity-40">{t.selectLang}</p>
            <div className="grid grid-cols-2 gap-4">
              <button 
                onClick={() => setLanguage('en')}
                className={`p-4 rounded-2xl border transition-all ${language === 'en' ? 'bg-app-accent text-app-bg border-app-accent' : 'glass opacity-60'}`}
              >
                {t.english}
              </button>
              <button 
                onClick={() => setLanguage('ar')}
                className={`p-4 rounded-2xl border transition-all ${language === 'ar' ? 'bg-app-accent text-app-bg border-app-accent' : 'glass opacity-60'}`}
              >
                {t.arabic}
              </button>
            </div>
          </div>

          <div className="space-y-4">
            <p className="text-[10px] uppercase tracking-[0.3em] opacity-40">Regional Intelligence</p>
            <div className="grid grid-cols-2 gap-4">
              <button 
                onClick={() => setMajlisModeEnabled(!majlisModeEnabled)}
                className={`p-4 rounded-2xl border transition-all flex flex-col items-center gap-2 ${majlisModeEnabled ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : 'glass opacity-60'}`}
              >
                <Globe size={18} />
                <span className="text-[8px] font-bold uppercase tracking-widest">Majlis Mode</span>
              </button>
              <button 
                onClick={() => setVision2030Enabled(!vision2030Enabled)}
                className={`p-4 rounded-2xl border transition-all flex flex-col items-center gap-2 ${vision2030Enabled ? 'bg-blue-500/10 text-blue-500 border-blue-500/20' : 'glass opacity-60'}`}
              >
                <Trophy size={18} />
                <span className="text-[8px] font-bold uppercase tracking-widest">Vision 2030</span>
              </button>
            </div>
          </div>

          <div className="space-y-4">
            <p className="text-[10px] uppercase tracking-[0.3em] opacity-40">{t.selectTheme}</p>
            <div className="grid grid-cols-2 gap-4">
              <button 
                onClick={() => setDarkMode(false)}
                className={`p-4 rounded-2xl border transition-all flex items-center justify-center gap-3 ${!darkMode ? 'bg-app-accent text-app-bg border-app-accent' : 'glass opacity-60'}`}
              >
                <Sun size={18} /> {t.light}
              </button>
              <button 
                onClick={() => setDarkMode(true)}
                className={`p-4 rounded-2xl border transition-all flex items-center justify-center gap-3 ${darkMode ? 'bg-app-accent text-app-bg border-app-accent' : 'glass opacity-60'}`}
              >
                <Moon size={18} /> {t.dark}
              </button>
            </div>
          </div>
        </div>

        <button 
          onClick={onComplete}
          className="btn-primary w-full justify-center py-6 rounded-3xl uppercase tracking-[0.3em] text-sm font-bold shadow-2xl"
        >
          {t.getStarted}
        </button>
      </motion.div>
    </motion.div>
  );
};
