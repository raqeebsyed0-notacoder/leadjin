/**
 * App Context for LeadJin
 * Provides global state management for the application
 * 
 * NOTE: This is a scaffold for future extraction. Currently, most state
 * is still managed in App.tsx. Gradually move state here as components
 * are extracted.
 */

import React, { createContext, useContext, useState, useCallback } from 'react';
import type { LeadjinLead } from '../services/geminiService';

// Types
export interface User {
  id: number;
  email: string;
  subscription_plan: string;
  plan?: string;
  monthly_searches_used: number;
  monthly_searches_limit: number;
  subscription_expires_at?: string;
  founder?: boolean;
  is_founder?: number;
}

export interface CompanyProfile {
  name: string;
  tagline: string;
  email: string;
  phone: string;
  website: string;
  address: string;
}

export interface Notification {
  message: string;
  type: 'success' | 'error' | 'info';
}

export type View = 'harvest' | 'crm' | 'analytics' | 'settings';
export type SettingsTab = 'profile' | 'integrations' | 'billing' | 'system' | 'services' | 'outreach';

// Context State Interface
interface AppState {
  // Auth
  authToken: string;
  currentUser: User | null;
  
  // UI State
  currentView: View;
  language: 'en' | 'ar';
  darkMode: boolean;
  showSidebar: boolean;
  notification: Notification | null;
  
  // Feature Flags
  majlisModeEnabled: boolean;
  vision2030Enabled: boolean;
  autonomousMode: boolean;
  
  // Data
  leads: LeadjinLead[];
  crmLeads: LeadjinLead[];
  selectedLead: LeadjinLead | null;
  companyProfile: CompanyProfile;
  
  // Actions
  setAuthToken: (token: string) => void;
  setCurrentUser: (user: User | null) => void;
  setCurrentView: (view: View) => void;
  setLanguage: (lang: 'en' | 'ar') => void;
  setDarkMode: (dark: boolean) => void;
  setNotification: (notification: Notification | null) => void;
  setSelectedLead: (lead: LeadjinLead | null) => void;
  refreshLeads: () => Promise<void>;
}

// Create Context
const AppContext = createContext<AppState | undefined>(undefined);

// Provider Props
interface AppProviderProps {
  children: React.ReactNode;
}

// Provider Component
export const AppProvider: React.FC<AppProviderProps> = ({ children }) => {
  // Auth State
  const [authToken, setAuthToken] = useState(() => {
    try { return localStorage.getItem('leadjin_token') || ''; } catch { return ''; }
  });
  
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  
  // UI State
  const [currentView, setCurrentView] = useState<View>('harvest');
  const [language, setLanguage] = useState<'en' | 'ar'>(() => {
    try {
      const saved = localStorage.getItem('leadjin_lang');
      return (saved === 'ar' || saved === 'en') ? saved : 'en';
    } catch { return 'en'; }
  });
  
  const [darkMode, setDarkMode] = useState(() => {
    try { return localStorage.getItem('leadjin_theme') === 'dark'; } catch { return false; }
  });
  
  const [showSidebar, setShowSidebar] = useState(false);
  const [notification, setNotification] = useState<Notification | null>(null);
  
  // Feature Flags
  const [majlisModeEnabled, setMajlisModeEnabled] = useState(() => {
    try { return localStorage.getItem('leadjin_majlis') === 'true'; } catch { return false; }
  });
  
  const [vision2030Enabled, setVision2030Enabled] = useState(() => {
    try { return localStorage.getItem('leadjin_v2030') === 'true'; } catch { return false; }
  });
  
  const [autonomousMode, setAutonomousMode] = useState(() => {
    try { return localStorage.getItem('leadjin_autonomous') === 'true'; } catch { return false; }
  });
  
  // Data State
  const [leads, setLeads] = useState<LeadjinLead[]>([]);
  const [crmLeads, setCrmLeads] = useState<LeadjinLead[]>([]);
  const [selectedLead, setSelectedLead] = useState<LeadjinLead | null>(null);
  
  const [companyProfile, setCompanyProfile] = useState<CompanyProfile>(() => {
    try {
      const saved = localStorage.getItem('leadjin_company_profile');
      return saved ? JSON.parse(saved) : { name: '', tagline: '', email: '', phone: '', website: '', address: '' };
    } catch { 
      return { name: '', tagline: '', email: '', phone: '', website: '', address: '' }; 
    }
  });
  
  // Actions
  const refreshLeads = useCallback(async () => {
    if (!authToken) return;
    try {
      const res = await fetch('/api/leads', {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        setCrmLeads(data);
      }
    } catch (err) {
      console.error('Failed to refresh leads:', err);
    }
  }, [authToken]);
  
  // Persist state changes to localStorage
  React.useEffect(() => {
    localStorage.setItem('leadjin_token', authToken);
  }, [authToken]);
  
  React.useEffect(() => {
    localStorage.setItem('leadjin_theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);
  
  React.useEffect(() => {
    localStorage.setItem('leadjin_lang', language);
  }, [language]);
  
  const value: AppState = {
    authToken,
    currentUser,
    currentView,
    language,
    darkMode,
    showSidebar,
    notification,
    majlisModeEnabled,
    vision2030Enabled,
    autonomousMode,
    leads,
    crmLeads,
    selectedLead,
    companyProfile,
    setAuthToken,
    setCurrentUser,
    setCurrentView,
    setLanguage,
    setDarkMode,
    setNotification,
    setSelectedLead,
    refreshLeads,
  };
  
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

// Hook
export const useApp = (): AppState => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
