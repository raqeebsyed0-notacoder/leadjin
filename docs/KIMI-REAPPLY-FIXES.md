# LeadJin v9 — Reapply Fixes Guide

**For:** Kimi (implementation agent)  
**Purpose:** 10 surgical fixes to restore features lost during monolith split  
**Style:** ELI5 — exact line numbers, exact code, no ambiguity  

---

## FIX-1: HarvestView — Add Missing Props (Line 11-51)

**File:** `src/views/HarvestView.tsx`  
**Problem:** Interface missing `userCaseStudy`, `userCompetitors`, `emailTemplates`, `selectedTemplateId` props

**FIND (lines 11-51):**
```typescript
interface HarvestViewProps {
  t: any;
  language: 'en' | 'ar';
  leads: LeadjinLead[];
  loading: boolean;
  loadingStatus: string;
  showConfig: boolean;
  setShowConfig: (v: boolean) => void;
  hasSearched: boolean;
  userIndustry: string;
  setUserIndustry: (v: string) => void;
  userServices: string;
  setUserServices: (v: string) => void;
  jobTitles: string;
  setJobTitles: (v: string) => void;
  geography: string;
  setGeography: (v: string) => void;
  companySize: string;
  setCompanySize: (v: string) => void;
  targetIndustry: string;
  setTargetIndustry: (v: string) => void;
  industries: string;
  setIndustries: (v: string) => void;
  limit: number;
  setLimit: (v: number) => void;
  model: string;
  setModel: (v: any) => void;
  onGenerate: (e: React.FormEvent) => void;
  onExportCSV: () => void;
  setSelectedLead: (lead: LeadjinLead | null) => void;
  contactedLeads: Set<string>;
  toggleContacted: (e: React.MouseEvent, id: string) => void;
  getScoreColor: (score: number) => string;
  getStatusLabel: (score: number) => { label: string; color: string };
  arabicCardMode: boolean;
  setArabicCardMode: (v: boolean) => void;
  icpPresets: any[];
  setShowPresetModal: (v: boolean) => void;
  loadPreset: (preset: any) => void;
  isMobile: boolean;
}
```

**REPLACE WITH:**
```typescript
interface EmailTemplate {
  id: number;
  name: string;
  subject: string;
  body: string;
}

interface HarvestViewProps {
  t: any;
  language: 'en' | 'ar';
  leads: LeadjinLead[];
  loading: boolean;
  loadingStatus: string;
  showConfig: boolean;
  setShowConfig: (v: boolean) => void;
  hasSearched: boolean;
  userIndustry: string;
  setUserIndustry: (v: string) => void;
  userServices: string;
  setUserServices: (v: string) => void;
  userCaseStudy: string;
  setUserCaseStudy: (v: string) => void;
  userCompetitors: string;
  setUserCompetitors: (v: string) => void;
  jobTitles: string;
  setJobTitles: (v: string) => void;
  geography: string;
  setGeography: (v: string) => void;
  companySize: string;
  setCompanySize: (v: string) => void;
  targetIndustry: string;
  setTargetIndustry: (v: string) => void;
  industries: string;
  setIndustries: (v: string) => void;
  limit: number;
  setLimit: (v: number) => void;
  model: string;
  setModel: (v: any) => void;
  emailTemplates: EmailTemplate[];
  selectedTemplateId: number | null;
  setSelectedTemplateId: (v: number | null) => void;
  onGenerate: (e: React.FormEvent) => void;
  onExportCSV: () => void;
  setSelectedLead: (lead: LeadjinLead | null) => void;
  contactedLeads: Set<string>;
  toggleContacted: (e: React.MouseEvent, id: string) => void;
  getScoreColor: (score: number) => string;
  getStatusLabel: (score: number) => { label: string; color: string };
  arabicCardMode: boolean;
  setArabicCardMode: (v: boolean) => void;
  icpPresets: any[];
  setShowPresetModal: (v: boolean) => void;
  loadPreset: (preset: any) => void;
  isMobile: boolean;
}
```

---

## FIX-2: HarvestView — Add Industry Dropdowns (After line 93)

**File:** `src/views/HarvestView.tsx`  
**Problem:** Form uses plain text inputs instead of dropdown selects for industries

**FIND the form start (around line 93-135):**
Look for the form that starts with `<form onSubmit={onGenerate}>`

**AFTER the ICP Presets section (around line 132), ADD this BEFORE the Target Industries input:**

```typescript
              {/* Section 1: Your Company Profile */}
              <div className="md:col-span-2 space-y-4">
                <h3 className="text-xl font-light border-b border-app-border/30 pb-2">1. Your Company Profile</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="flex flex-col gap-3">
                    <label className="text-[10px] font-bold uppercase tracking-widest opacity-40">Your Industry</label>
                    <select 
                      value={userIndustry}
                      onChange={(e) => setUserIndustry(e.target.value)}
                      className="w-full glass rounded-2xl p-5 text-sm focus:border-app-accent outline-none transition-all appearance-none"
                    >
                      <option value="Information Technology & AI">Information Technology & AI</option>
                      <option value="Financial Services & Fintech">Financial Services & Fintech</option>
                      <option value="General Trading & Distribution">General Trading & Distribution</option>
                      <option value="Food & Beverage (Restaurants, Cafes)">Food & Beverage (Restaurants, Cafes)</option>
                      <option value="Retail, Malls & Boutiques">Retail, Malls & Boutiques</option>
                      <option value="Energy, Oil & Gas">Energy, Oil & Gas</option>
                      <option value="Renewable Energy">Renewable Energy</option>
                      <option value="Mining & Metals">Mining & Metals</option>
                      <option value="Petrochemicals & Materials">Petrochemicals & Materials</option>
                      <option value="Healthcare & Life Sciences">Healthcare & Life Sciences</option>
                      <option value="Tourism, Hospitality & Entertainment">Tourism, Hospitality & Entertainment</option>
                      <option value="Real Estate & Mega-Projects">Real Estate & Mega-Projects</option>
                      <option value="Construction & Contracting">Construction & Contracting</option>
                      <option value="Logistics, Aviation & Transportation">Logistics, Aviation & Transportation</option>
                      <option value="Defense & Security">Defense & Security</option>
                      <option value="Education & EdTech">Education & EdTech</option>
                      <option value="Public Sector & Government">Public Sector & Government</option>
                      <option value="Consumer Retail & E-commerce">Consumer Retail & E-commerce</option>
                      <option value="Sports & Events">Sports & Events</option>
                      <option value="Telecommunications & Media">Telecommunications & Media</option>
                      <option value="Agriculture & Food Security">Agriculture & Food Security</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-3">
                    <label className="text-[10px] font-bold uppercase tracking-widest opacity-40">Your Core Services</label>
                    <input 
                      type="text" 
                      value={userServices}
                      onChange={(e) => setUserServices(e.target.value)}
                      placeholder="e.g. Cold-chain logistics and last-mile delivery"
                      className="w-full glass rounded-2xl p-5 text-sm focus:border-app-accent outline-none transition-all"
                    />
                  </div>
                  <div className="flex flex-col gap-3">
                    <label className="text-[10px] font-bold uppercase tracking-widest opacity-40">Killer Case Study / Metric</label>
                    <input 
                      type="text" 
                      value={userCaseStudy}
                      onChange={(e) => setUserCaseStudy(e.target.value)}
                      placeholder="e.g. Reduced shipping costs by 22% for a major retailer"
                      className="w-full glass rounded-2xl p-5 text-sm focus:border-app-accent outline-none transition-all"
                    />
                  </div>
                  <div className="flex flex-col gap-3">
                    <label className="text-[10px] font-bold uppercase tracking-widest opacity-40">Top Competitors</label>
                    <input 
                      type="text" 
                      value={userCompetitors}
                      onChange={(e) => setUserCompetitors(e.target.value)}
                      placeholder="e.g. DHL, FedEx"
                      className="w-full glass rounded-2xl p-5 text-sm focus:border-app-accent outline-none transition-all"
                    />
                  </div>
                </div>
              </div>

              <div className="md:col-span-2 space-y-4 mt-4">
                <h3 className="text-xl font-light border-b border-app-border/30 pb-2">2. Target Market (ICP)</h3>
              </div>
```

---

## FIX-3: HarvestView — Change Target Industry to Select (Around line 160)

**File:** `src/views/HarvestView.tsx`  
**Problem:** Target industry uses text input instead of dropdown

**FIND:**
```typescript
              {/* Target Industries */}
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-app-accent/10 flex items-center justify-center text-app-accent">
                    <Target size={16} />
                  </div>
                  <label className="text-sm font-medium">{t.industries}</label>
                </div>
                <input
                  type="text"
                  value={industries}
                  onChange={(e) => setIndustries(e.target.value)}
                  placeholder="e.g., Legal, Consulting, Finance"
                  className="w-full glass rounded-2xl px-6 py-4 text-sm outline-none focus:border-app-accent transition-all"
                />
              </div>
```

**REPLACE WITH:**
```typescript
              {/* Target Industry */}
              <div className="flex flex-col gap-3">
                <label className="text-[10px] font-bold uppercase tracking-widest opacity-40">Target Industry</label>
                <select 
                  value={targetIndustry}
                  onChange={(e) => setTargetIndustry(e.target.value)}
                  className="w-full glass rounded-2xl p-5 text-sm focus:border-app-accent outline-none transition-all appearance-none"
                >
                  <option value="Any / Auto-Match (AI Driven)">✨ Any / Auto-Match (AI Driven)</option>
                  <option value="Information Technology & AI">Information Technology & AI</option>
                  <option value="Financial Services & Fintech">Financial Services & Fintech</option>
                  <option value="General Trading & Distribution">General Trading & Distribution</option>
                  <option value="Food & Beverage (Restaurants, Cafes)">Food & Beverage (Restaurants, Cafes)</option>
                  <option value="Retail, Malls & Boutiques">Retail, Malls & Boutiques</option>
                  <option value="Energy, Oil & Gas">Energy, Oil & Gas</option>
                  <option value="Renewable Energy">Renewable Energy</option>
                  <option value="Mining & Metals">Mining & Metals</option>
                  <option value="Petrochemicals & Materials">Petrochemicals & Materials</option>
                  <option value="Healthcare & Life Sciences">Healthcare & Life Sciences</option>
                  <option value="Tourism, Hospitality & Entertainment">Tourism, Hospitality & Entertainment</option>
                  <option value="Real Estate & Mega-Projects">Real Estate & Mega-Projects</option>
                  <option value="Construction & Contracting">Construction & Contracting</option>
                  <option value="Logistics, Aviation & Transportation">Logistics, Aviation & Transportation</option>
                  <option value="Defense & Security">Defense & Security</option>
                  <option value="Education & EdTech">Education & EdTech</option>
                  <option value="Public Sector & Government">Public Sector & Government</option>
                  <option value="Consumer Retail & E-commerce">Consumer Retail & E-commerce</option>
                  <option value="Sports & Events">Sports & Events</option>
                  <option value="Telecommunications & Media">Telecommunications & Media</option>
                  <option value="Agriculture & Food Security">Agriculture & Food Security</option>
                </select>
              </div>
```

---

## FIX-4: HarvestView — Add Outreach Template Selector (Before Model Selection)

**File:** `src/views/HarvestView.tsx`  
**Problem:** Missing template selector dropdown

**FIND the Model Selection section (around line 225):**
Look for `/* Model Selection */` or the model selection buttons

**BEFORE the Model Selection section, ADD:**
```typescript
              {/* Outreach Template Selector */}
              {emailTemplates.length > 0 && (
                <div className="md:col-span-2 flex flex-col gap-4 mt-4">
                  <label className="text-[10px] font-bold uppercase tracking-widest opacity-40">Outreach Template (Optional)</label>
                  <select 
                    value={selectedTemplateId || ''}
                    onChange={(e) => setSelectedTemplateId(e.target.value ? parseInt(e.target.value) : null)}
                    className="w-full glass rounded-2xl p-5 text-sm focus:border-app-accent outline-none transition-all appearance-none"
                  >
                    <option value="">AI Generated (Default)</option>
                    {emailTemplates.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
              )}
```

---

## FIX-5: SettingsView — Add Missing Imports (Line 1-8)

**File:** `src/views/SettingsView.tsx`  
**Problem:** Missing imports for Edit2, Plus, Trash2, useEffect

**FIND:**
```typescript
import { useState } from 'react';
import { motion } from 'motion/react';
import { 
  User, Key, CreditCard, Settings, Briefcase, Mail, 
  Sun, Moon, Globe, Trophy, CheckCircle2, AlertCircle,
  Smartphone, History, ShieldCheck
} from 'lucide-react';
```

**REPLACE WITH:**
```typescript
import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { 
  User, Key, CreditCard, Settings, Briefcase, Mail, 
  Sun, Moon, Globe, Trophy, CheckCircle2, AlertCircle,
  Smartphone, History, ShieldCheck, Trash2, FileText, Plus,
  Edit2, ChevronRight, Zap, LayoutGrid, Cpu
} from 'lucide-react';
```

---

## FIX-6: SettingsView — Add 'outreach' Tab (Line 46)

**File:** `src/views/SettingsView.tsx`  
**Problem:** Missing Outreach & AI tab

**FIND:**
```typescript
  const [activeTab, setActiveTab] = useState<'general' | 'integrations' | 'billing' | 'system'>('general');

  const tabs = [
    { id: 'general', label: t.settingsGeneral || 'General', icon: User },
    { id: 'integrations', label: t.settingsIntegrations || 'Integrations', icon: Key },
    { id: 'billing', label: t.settingsServices || 'Services', icon: Briefcase },
    { id: 'system', label: t.settingsSystem || 'System', icon: Settings },
  ];
```

**REPLACE WITH:**
```typescript
  const [activeTab, setActiveTab] = useState<'general' | 'integrations' | 'outreach' | 'billing' | 'system'>('general');

  const tabs = [
    { id: 'general', label: t.settingsGeneral || 'General', icon: User },
    { id: 'integrations', label: t.settingsIntegrations || 'Integrations', icon: Key },
    { id: 'outreach', label: 'Outreach & AI', icon: Mail },
    { id: 'billing', label: t.settingsServices || 'Services', icon: Briefcase },
    { id: 'system', label: t.settingsSystem || 'System', icon: Settings },
  ];
```

---

## FIX-7: SettingsView — Add outreach Tab Content (After integrations, before billing)

**File:** `src/views/SettingsView.tsx`  
**Problem:** No content rendered for outreach tab

**FIND the tab content switch (around line 100-130):**
```typescript
            {activeTab === 'integrations' && (
              <IntegrationsTab 
                t={t}
                onNotify={onNotify}
              />
            )}
            
            {activeTab === 'billing' && (
```

**ADD BETWEEN integrations AND billing:**
```typescript
            {activeTab === 'outreach' && (
              <OutreachTab
                authToken={authToken}
                emailTemplates={emailTemplates}
                setEmailTemplates={setEmailTemplates}
                majlisModeEnabled={majlisModeEnabled}
                setMajlisModeEnabled={setMajlisModeEnabled}
                vision2030Enabled={vision2030Enabled}
                setVision2030Enabled={setVision2030Enabled}
                onNotify={onNotify}
              />
            )}
```

---

## FIX-8: SettingsView — Update Interface Props (Line 9-26)

**File:** `src/views/SettingsView.tsx`  
**Problem:** Interface missing critical props

**FIND:**
```typescript
interface SettingsViewProps {
  t: any;
  language: 'en' | 'ar';
  setLanguage: (lang: 'en' | 'ar') => void;
  darkMode: boolean;
  setDarkMode: (v: boolean) => void;
  majlisModeEnabled: boolean;
  setMajlisModeEnabled: (v: boolean) => void;
  vision2030Enabled: boolean;
  setVision2030Enabled: (v: boolean) => void;
  autonomousMode: boolean;
  setAutonomousMode: (v: boolean) => void;
  companyProfile: any;
  setCompanyProfile: (v: any) => void;
  currentUser: any;
  authToken: string;
  onNotify: (message: string, type: 'success' | 'error' | 'info') => void;
}
```

**REPLACE WITH:**
```typescript
interface EmailTemplate {
  id: number;
  name: string;
  subject: string;
  body: string;
}

interface SettingsViewProps {
  t: any;
  language: 'en' | 'ar';
  setLanguage: (lang: 'en' | 'ar') => void;
  darkMode: boolean;
  setDarkMode: (v: boolean) => void;
  majlisModeEnabled: boolean;
  setMajlisModeEnabled: (v: boolean) => void;
  vision2030Enabled: boolean;
  setVision2030Enabled: (v: boolean) => void;
  autonomousMode: boolean;
  setAutonomousMode: (v: boolean) => void;
  companyProfile: any;
  setCompanyProfile: (v: any) => void;
  currentUser: any;
  authToken: string;
  gmailConnected: boolean;
  setGmailConnected: (v: boolean) => void;
  gmailEmail: string | null;
  gmailName: string | null;
  onNotify: (message: string, type: 'success' | 'error' | 'info') => void;
  onLogout: () => void;
  onShowWhitepaper: () => void;
  onClearData: () => void;
  onRunSimulation: () => void;
  emailTemplates: EmailTemplate[];
  setEmailTemplates: (templates: EmailTemplate[]) => void;
}
```

---

## FIX-9: App.tsx — Pass New Props to SettingsView (Around line 1704)

**File:** `src/App.tsx`  
**Problem:** SettingsView not receiving all required props

**FIND:**
```typescript
          <SettingsView
            t={t}
            language={language}
            setLanguage={setLanguage}
            darkMode={darkMode}
            setDarkMode={setDarkMode}
            majlisModeEnabled={majlisModeEnabled}
            setMajlisModeEnabled={setMajlisModeEnabled}
            vision2030Enabled={vision2030Enabled}
            setVision2030Enabled={setVision2030Enabled}
            autonomousMode={autonomousMode}
            setAutonomousMode={setAutonomousMode}
            companyProfile={companyProfile}
            setCompanyProfile={setCompanyProfile}
            currentUser={currentUser}
            authToken={authToken}
            onNotify={(message, type) => setNotification({ message, type })}
          />
```

**REPLACE WITH:**
```typescript
          <SettingsView
            t={t}
            language={language}
            setLanguage={setLanguage}
            darkMode={darkMode}
            setDarkMode={setDarkMode}
            majlisModeEnabled={majlisModeEnabled}
            setMajlisModeEnabled={setMajlisModeEnabled}
            vision2030Enabled={vision2030Enabled}
            setVision2030Enabled={setVision2030Enabled}
            autonomousMode={autonomousMode}
            setAutonomousMode={setAutonomousMode}
            companyProfile={companyProfile}
            setCompanyProfile={setCompanyProfile}
            currentUser={currentUser}
            authToken={authToken}
            gmailConnected={gmailConnected}
            setGmailConnected={setGmailConnected}
            gmailEmail={gmailEmail}
            gmailName={gmailName}
            onNotify={(message, type) => setNotification({ message, type })}
            onLogout={handleLogout}
            onShowWhitepaper={() => setShowWhitepaper(true)}
            onClearData={handleClearData}
            onRunSimulation={runCaseStudySimulation}
            emailTemplates={emailTemplates}
            setEmailTemplates={setEmailTemplates}
          />
```

---

## FIX-10: App.tsx — Update HarvestView Props (Around line 1611)

**File:** `src/App.tsx`  
**Problem:** HarvestView missing userCaseStudy, userCompetitors, emailTemplates, selectedTemplateId props

**FIND the HarvestView component call and ADD these props:**

**ADD AFTER `setUserServices={setUserServices}`:**
```typescript
                userCaseStudy={userCaseStudy}
                setUserCaseStudy={setUserCaseStudy}
                userCompetitors={userCompetitors}
                setUserCompetitors={setUserCompetitors}
```

**ADD AFTER `setModel={setModel}`:**
```typescript
                emailTemplates={emailTemplates}
                selectedTemplateId={selectedTemplateId}
                setSelectedTemplateId={setSelectedTemplateId}
```

**ALSO UPDATE the loadPreset function to include:**
```typescript
                loadPreset={(preset) => {
                  setTargetIndustry(preset.targetIndustry);
                  setTargetServices(preset.targetServices || []);
                  setUserServices(preset.userServices);
                  setUserCaseStudy(preset.userCaseStudy || '');
                  setUserCompetitors(preset.userCompetitors || '');
                  setJobTitles(preset.jobTitles);
                  setGeography(preset.geography);
                  setCompanySize(preset.companySize);
                  setNotification({ message: `Loaded preset: ${preset.name}`, type: 'success' });
                }}
```

---

## How to Apply These Fixes

1. **Open each file** in your editor
2. **Find the exact line numbers** shown above
3. **Copy the "FIND" block** and search for it in the file
4. **Replace with the "REPLACE WITH" block**
5. **Save and verify:** Run `npx tsc --noEmit` to check for errors

## Test Checklist After Applying

- [ ] Harvest form shows "Your Industry" dropdown with 21 options
- [ ] Harvest form shows "Target Industry" dropdown with "Any / Auto-Match" as first option
- [ ] "Killer Case Study" and "Top Competitors" fields visible in harvest form
- [ ] Outreach Template selector visible at bottom of harvest form
- [ ] Settings has 5 tabs: General, Integrations, Outreach & AI, Services, System
- [ ] Email Templates CRUD works in Outreach & AI tab
- [ ] Account shows plan badge + usage progress bar in Integrations tab
- [ ] Clear Data button exists in General settings
- [ ] Whitepaper button opens modal
- [ ] `npx tsc --noEmit` passes with 0 errors

---
*Generated: 2026-03-27 | All line numbers reference the restored App.tsx.backup (4,007 lines)*
