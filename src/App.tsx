/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, Suspense, lazy, useRef, useCallback } from 'react';
import AdminDashboard from './AdminDashboard';
import { landingTranslations } from './landing/landingTranslations';
import { JinEmployeeDashboard } from './components/JinEmployeeDashboard';
// Task 2G: Lazy load LandingPage for performance
const LandingPage = lazy(() => import('./landing/LandingPage').then(m => ({ default: m.LandingPage })));

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean, error: Error | null }> {
  state: { hasError: boolean, error: Error | null } = { hasError: false, error: null };

  constructor(props: { children: React.ReactNode }) {
    super(props);
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-10 text-center">
          <h1 className="text-4xl font-bold mb-4">Something went wrong.</h1>
          <pre className="bg-zinc-900 p-6 rounded-xl text-left overflow-auto max-w-full text-xs text-red-400 border border-red-900/50">
            {this.state.error?.toString()}
          </pre>
          <button 
            onClick={() => window.location.reload()}
            className="mt-8 px-8 py-3 bg-white text-black rounded-full font-bold uppercase tracking-widest text-xs"
          >
            Reload Application
          </button>
        </div>
      );
    }

    return (this.props as { children: React.ReactNode }).children;
  }
}
import { 
  Search, 
  MapPin, 
  Mail, 
  Linkedin, 
  Zap, 
  ExternalLink, 
  Download, 
  Loader2,
  Filter,
  ChevronRight,
  Sparkles,
  Target,
  Users,
  Briefcase,
  AlertCircle,
  CheckCircle2,
  Send,
  Sun,
  Moon,
  Twitter,
  Globe,
  TrendingUp,
  ArrowLeft,
  Settings,
  Trash2,
  Key,
  Smartphone,
  ShieldCheck,
  LayoutDashboard,
  Database,
  Clock,
  BarChart3,
  MailCheck,
  Phone,
  History,
  FileText,
  CreditCard,
  Play,
  Menu,
  X,
  Plus,
  GripVertical,
  Trophy,
  MoreVertical,
  DollarSign,
  Share2,
  Copy,
  Edit2,
  Building2,
  UploadCloud,
  FileCheck2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { 
  DndContext, 
  closestCenter, 
  KeyboardSensor, 
  PointerSensor, 
  useSensor, 
  useSensors, 
  DragOverlay, 
  defaultDropAnimationSideEffects,
  DragEndEvent,
  DragStartEvent
} from '@dnd-kit/core';
import { 
  arrayMove, 
  SortableContext, 
  sortableKeyboardCoordinates, 
  verticalListSortingStrategy, 
  useSortable 
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import confetti from 'canvas-confetti';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  AreaChart, 
  Area,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import type { LeadjinLead } from './services/geminiService';

const SortableLeadCard = ({ lead, language }: any) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: lead.lead_id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const priority = lead.lead_score > 90 ? 'High' : lead.lead_score > 80 ? 'Medium' : 'Low';
  const priorityColor = priority === 'High' ? 'text-red-500 bg-red-500/10' : priority === 'Medium' ? 'text-orange-500 bg-orange-500/10' : 'text-blue-500 bg-blue-500/10';

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group relative"
    >
      <div 
        {...attributes} 
        {...listeners}
        className="absolute left-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-40 cursor-grab active:cursor-grabbing p-1"
      >
        <GripVertical size={14} />
      </div>
      
      <motion.div 
        className="glass p-4 rounded-2xl space-y-3 text-xs border-l-2 rtl:border-l-0 rtl:border-r-2 border-app-accent/30 hover:border-app-accent transition-all cursor-pointer active:scale-[0.98] ml-6 rtl:ml-0 rtl:mr-6"
      >
        <div className="flex justify-between items-start gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-bold truncate text-sm tracking-tight">{lead.name}</p>
              {lead.vision_2030_alignment && lead.vision_2030_alignment.score > 70 && (
                <span className="px-1 py-0.5 bg-emerald-500/10 text-emerald-500 text-[6px] font-bold uppercase tracking-widest rounded border border-emerald-500/20 shrink-0">
                  V2030
                </span>
              )}
            </div>
            <p className="opacity-60 truncate mt-0.5">{lead.company}</p>
            {lead.email && (
              <div className="flex items-center gap-1.5 mt-1">
                <Mail size={10} className="opacity-40" />
                <span className="text-[10px] opacity-60 truncate">{lead.email}</span>
                {lead.email_verified ? (
                  <span className="text-[8px] px-1.5 py-0.5 bg-emerald-500/10 text-emerald-500 rounded-full font-bold">VERIFIED</span>
                ) : (
                  <span className="text-[8px] px-1.5 py-0.5 bg-amber-500/10 text-amber-500 rounded-full font-bold">UNVERIFIED</span>
                )}
              </div>
            )}
            {lead.phone && (
              <div className="flex items-center gap-1.5">
                <Phone size={10} className="opacity-40" />
                <span className="text-[10px] opacity-60">{lead.phone}</span>
              </div>
            )}
            {(lead.company_x || lead.company_snapchat || lead.company_tiktok) && (
              <div className="flex items-center gap-2 mt-1">
                {lead.company_x && <span className="text-[9px] opacity-40">{lead.company_x}</span>}
                {lead.company_snapchat && <span className="text-[9px] opacity-40">{lead.company_snapchat}</span>}
                {lead.company_tiktok && <span className="text-[9px] opacity-40">{lead.company_tiktok}</span>}
              </div>
            )}
          </div>
          <span className="text-[10px] font-mono opacity-40 shrink-0 bg-app-accent/5 px-2 py-0.5 rounded-md">
            {lead.lead_score}%
          </span>
        </div>

        <div className="flex flex-wrap gap-2">
          <span className={`text-[8px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-md ${priorityColor}`}>
            {priority}
          </span>
          <span className="text-[8px] font-medium opacity-40 uppercase tracking-widest flex items-center gap-1">
            <Clock size={8} />
            {lead.stage_entered_at ? `${Math.max(1, Math.floor((Date.now() - new Date(lead.stage_entered_at).getTime()) / 86400000))}d in stage` : 'New'}
          </span>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-app-border/5">
          <div className="flex gap-2">
            {/* Task 1F: Color-code Mail icon based on verification status */}
            {lead.email && (
              <Mail 
                size={12} 
                className={`hover:opacity-100 transition-opacity ${
                  lead.email_verified === true 
                    ? 'text-emerald-500' 
                    : lead.email_source === 'pattern_guess'
                    ? 'text-amber-500'
                    : 'opacity-40'
                }`} 
              />
            )}
            {lead.linkedin && <Linkedin size={12} className="opacity-40 hover:opacity-100 transition-opacity" />}
            {lead.phone && <Phone size={12} className="opacity-40 hover:opacity-100 transition-opacity" />}
          </div>
          <div className="flex items-center gap-1 text-[9px] opacity-40 italic">
            <Zap size={10} className="text-app-accent" />
            Next: Follow up
          </div>
        </div>
      </motion.div>
    </div>
  );
};

const PipelineColumn = ({ id, title, leads, language, metrics, t }: any) => {
  const { setNodeRef } = useSortable({ id });

  return (
    <div className="w-72 md:w-80 flex flex-col gap-6 shrink-0">
      <div className="space-y-4 px-2">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h3 className="text-[11px] font-bold uppercase tracking-[0.2em] opacity-40">{title}</h3>
            <div className="flex items-center gap-2">
              <span className="text-xl font-light">{leads.length}</span>
              <span className="text-[10px] opacity-20 uppercase tracking-widest">{t.leadsCount}</span>
            </div>
          </div>
          <div className="text-right space-y-1">
            <p className="text-[10px] font-mono text-app-accent font-bold">${metrics.value.toLocaleString()}</p>
            <div className="flex items-center gap-1 justify-end opacity-30">
              <TrendingUp size={10} />
              <span className="text-[9px] font-bold">{metrics.probability}% prob.</span>
            </div>
          </div>
        </div>
        
        <div className="h-1 w-full bg-app-accent/5 rounded-full overflow-hidden">
          <motion.div 
            initial={{ width: 0 }}
            animate={{ width: `${metrics.probability}%` }}
            className="h-full bg-app-accent"
          />
        </div>
      </div>

      <div 
        ref={setNodeRef}
        className="flex-1 space-y-4 overflow-y-auto pr-2 custom-scrollbar min-h-[200px]"
      >
        <SortableContext items={leads.map((l: any) => l.lead_id)} strategy={verticalListSortingStrategy}>
          {leads.map((lead: any) => (
            <SortableLeadCard key={lead.lead_id} lead={lead} language={language} />
          ))}
        </SortableContext>
        
        {leads.length === 0 && (
          <div className="h-32 border-2 border-dashed border-app-border/10 rounded-3xl flex flex-col items-center justify-center gap-2 opacity-20 grayscale">
            <Plus size={20} />
            <p className="text-[9px] uppercase tracking-widest font-bold">{t.empty}</p>
          </div>
        )}
      </div>
    </div>
  );
};

const MobileLeadCard = ({ lead, contactedLeads, toggleContacted, setSelectedLead, getScoreColor, getStatusLabel }: any) => {
  const status = getStatusLabel(lead.lead_score);
  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.02 }}
      onClick={() => setSelectedLead(lead)}
      className={`lead-card-mobile p-6 rounded-[32px] shadow-sm hover:shadow-xl transition-all duration-300 group ${contactedLeads.has(lead.lead_id) ? 'opacity-40 grayscale-[0.5]' : ''}`}
    >
      <div className="flex justify-between items-start">
        <div className="flex items-center gap-4">
          <div className={`text-3xl font-light italic ${getScoreColor(lead.lead_score)}`}>
            {lead.lead_score}
          </div>
          <div className="overflow-hidden">
            <div className="flex items-center gap-2">
              <h4 className="text-base font-medium truncate tracking-tight">{lead.name}</h4>
              {lead.vision_2030_alignment && lead.vision_2030_alignment.score > 70 && (
                <span className="px-1.5 py-0.5 bg-emerald-500/10 text-emerald-500 text-[7px] font-bold uppercase tracking-widest rounded border border-emerald-500/20 shrink-0">
                  V2030
                </span>
              )}
            </div>
            <p className="text-[10px] opacity-50 uppercase tracking-[0.2em] truncate">{lead.title}</p>
            {lead.email && (
              <div className="flex items-center gap-1.5 mt-1">
                <Mail size={10} className="opacity-40" />
                <span className="text-[10px] opacity-60 truncate">{lead.email}</span>
                {lead.email_verified ? (
                  <span className="text-[8px] px-1.5 py-0.5 bg-emerald-500/10 text-emerald-500 rounded-full font-bold">VERIFIED</span>
                ) : (
                  <span className="text-[8px] px-1.5 py-0.5 bg-amber-500/10 text-amber-500 rounded-full font-bold">UNVERIFIED</span>
                )}
              </div>
            )}
            {lead.phone && (
              <div className="flex items-center gap-1.5">
                <Phone size={10} className="opacity-40" />
                <span className="text-[10px] opacity-60">{lead.phone}</span>
              </div>
            )}
          </div>
        </div>
        <button
          onClick={(e) => toggleContacted(e, lead.lead_id)}
          className={`w-12 h-12 rounded-full flex items-center justify-center transition-all shadow-lg ${contactedLeads.has(lead.lead_id) ? 'bg-app-accent text-app-bg' : 'glass hover:bg-app-accent/10'}`}
        >
          <CheckCircle2 size={20} />
        </button>
      </div>
      <div className="flex justify-between items-center mt-4 pt-4 border-t border-app-border/10">
        <span className="text-[11px] font-light opacity-60 truncate max-w-[60%]">{lead.company}</span>
        <span className={`text-[9px] font-bold px-4 py-1 rounded-full border tracking-widest uppercase ${status.color}`}>
          {status.label}
        </span>
      </div>
    </motion.div>
  );
};

const LeadSkeleton = () => (
  <div className="grid grid-cols-[50px_1fr_70px] md:grid-cols-[100px_1fr_1fr_120px] border-b border-app-border glass items-center animate-pulse">
    <div className="p-3 md:p-6 flex justify-center">
      <div className="w-8 h-8 md:w-12 md:h-12 bg-app-accent/10 rounded-full" />
    </div>
    <div className="p-3 md:p-6 space-y-2">
      <div className="h-4 bg-app-accent/10 rounded w-3/4" />
      <div className="h-3 bg-app-accent/5 rounded w-1/2" />
    </div>
    <div className="hidden md:block p-6">
      <div className="h-4 bg-app-accent/10 rounded w-1/2" />
    </div>
    <div className="p-3 md:p-6 flex justify-center">
      <div className="w-8 h-8 bg-app-accent/10 rounded-full" />
    </div>
  </div>
);

// landingTranslations is imported from './landing/landingTranslations'

const translations = {
  en: {
    harvest: "Harvest",
    pipeline: "Pipeline",
    analytics: "Analytics",
    settings: "Settings",
    light: "Light",
    dark: "Dark",
    export: "Export CSV",
    login: "Google Login",
    configure: "Configure Profile",
    icp: "Define your Ideal Customer Profile (ICP)",
    model: "Intelligence Model",
    industries: "Target Industries",
    companySize: "Company Size",
    geography: "Target Geography",
    jobTitles: "Job Titles",
    harvestBtn: "Harvest High-Value Leads",
    refine: "Refine ICP",
    return: "Cancel & Return to Results",
    confidence: "Confidence Level",
    status: "Lead Status",
    score: "Score Breakdown",
    contact: "Contact Matrix",
    company: "Company Profile",
    triggers: "Trigger Events",
    pain: "Pain Signals",
    strategy: "Strategy Recommendation",
    initiate: "Initiate Campaign",
    markContacted: "Mark Contacted",
    contacted: "Contacted",
    newProspect: "New Prospect",
    welcome: "Welcome to LEADJIN",
    selectLang: "Select your preferred language",
    selectTheme: "Select your preferred theme",
    getStarted: "Get Started",
    arabic: "Arabic",
    english: "English",
    analyticsTitle: "Engine Intelligence",
    analyticsSub: "Real-time Performance Metrics",
    totalLeads: "Total Leads",
    revenue: "Revenue (SAR)",
    pending: "Pending",
    funnel: "Conversion Funnel",
    outreachVol: "Email Outreach Volume",
    settingsTitle: "Application Settings",
    apiKey: "Account",
    apiKeySub: "Manage your LEADJIN account and subscription.",
    install: "Installation",
    mobileInstall: "Mobile: Open in Safari (iOS) or Chrome (Android) and select \"Add to Home Screen\".",
    extensionInstall: "Chrome Extension: Download the source, go to chrome://extensions, enable Developer Mode, and click \"Load unpacked\" selecting the dist folder.",
    privacy: "Privacy Controls",
    clearData: "Clear All Local Data",
    caseStudy: "Case Study Mode",
    runSimulation: "Run Case Study Simulation",
    empty: "Empty",
    pipelineTitle: "Lead Pipeline",
    pipelineSub: "Self-Reliant CRM Engine",
    leadsCount: "Leads",
    stages: {
      NEW: "New",
      CONTACTED: "Contacted",
      REPLIED: "Replied",
      MEETING: "Meeting",
      PROPOSAL: "Proposal",
      CLOSED: "Closed"
    },
    legalTitle: "Legal & IP Protection",
    patentTitle: "Patent Blueprint: GSSE Engine",
    patentSub: "Geo-Semantic Synthesis Engine (GSSE) - Proprietary Architecture",
    ipStatus: "IP Status",
    registered: "Registered",
    patentPending: "Patent Pending",
    tos: "Terms of Service",
    privacyPolicy: "Privacy Policy",
    gsseProof: "GSSE Intelligence Proof",
    originProof: "Proof of Origin",
    timestamp: "Harvest Timestamp",
    logicHash: "Logic Hash",
    signature: "Digital Signature",
    spatialHarvest: "Spatial Harvesting (Layer 1)",
    semanticSynthesis: "Semantic Synthesis (Layer 2)",
    culturalContext: "Cultural Contextualization (Layer 3)",
    auditTrail: "Audit Trail",
    whitepaper: "Technical Whitepaper",
    vision2030: "Vision 2030 Alignment",
    majlisMode: "Majlis Mode: Cultural Intelligence",
    interactions: "Interactions",
    vrpProgram: "VRP Program",
    etiquette: "Cultural Etiquette",
    alignmentScore: "Alignment Score",
    majlisVersion: "Majlis Mode: Local Dialect Outreach",
    gmailTitle: "Gmail Integration",
    gmailSub: "Connect your Gmail account to send outreach sequences directly from your professional email.",
    gmailConnected: "Connected",
    gmailDisconnect: "Disconnect",
    gmailConnect: "Connect Gmail Account",
    workspaceTitle: "Google Workspace",
    workspaceSub: "Connect your professional workspace for automated outreach and calendar synchronization.",
    autonomousMode: "Autonomous Outreach",
    autonomousSub: "When enabled, the engine will automatically send follow-up sequences in the background.",
    testConnection: "Test Connection",
    disconnect: "Disconnect",
    authGuideTitle: "Simplified Setup",
    authGuideSub: "Connect your Google Workspace in 3 easy steps",
    authStep1: "Enable Gmail API in Google Cloud",
    authStep2: "Create OAuth Credentials",
    authStep3: "Connect & Automate",
    connectionValid: "Connection is valid!",
    connectionInvalid: "Connection invalid. Please reconnect.",
    shareTitle: "Share with Partner",
    shareSub: "Generate a secure, time-limited link (48h) with your Gemini API integrated for your partner.",
    shareStatus: "Link Status",
    shareActive: "Active (Expires in 48h)",
    shareCopy: "Copy Integrated Link",
    shareSuccess: "Shareable link with integrated API copied to clipboard!",
    settingsGeneral: "General",
    settingsIntegrations: "Integrations",
    settingsOutreach: "Outreach & AI",
    settingsServices: "Services & Pricing",
    settingsSystem: "System & Engine",
    langToggle: "AR"
  },
  ar: {
    harvest: "اكتشف العملاء",
    pipeline: "مسار المبيعات",
    analytics: "التحليلات",
    settings: "الإعدادات",
    light: "فاتح",
    dark: "داكن",
    export: "تصدير CSV",
    login: "تسجيل الدخول بجوجل",
    configure: "تكوين الملف الشخصي",
    icp: "حدد ملف تعريف العميل المثالي (ICP)",
    model: "نموذج الذكاء",
    industries: "الصناعات المستهدفة",
    companySize: "حجم الشركة",
    geography: "الجغرافيا المستهدفة",
    jobTitles: "المسميات الوظيفية",
    harvestBtn: "حصاد العملاء ذوي القيمة العالية",
    refine: "تحسين ICP",
    return: "إلغاء والعودة إلى النتائج",
    confidence: "مستوى الثقة",
    status: "حالة العميل",
    score: "تفاصيل الدرجة",
    contact: "مصفوفة الاتصال",
    company: "ملف الشركة",
    triggers: "أحداث التحفيز",
    pain: "إشارات الألم",
    strategy: "توصية الاستراتيجية",
    initiate: "بدء الحملة",
    markContacted: "تحديد كمواصل",
    contacted: "تم التواصل",
    newProspect: "عميل محتمل جديد",
    welcome: "مرحباً بك في LEADJIN",
    selectLang: "اختر لغتك المفضلة",
    selectTheme: "اختر المظهر المفضل لديك",
    getStarted: "ابدأ الآن",
    arabic: "العربية",
    english: "الإنجليزية",
    analyticsTitle: "ذكاء المحرك",
    analyticsSub: "مقاييس الأداء في الوقت الفعلي",
    totalLeads: "إجمالي العملاء",
    revenue: "الإيرادات (ر.س)",
    pending: "قيد الانتظار",
    funnel: "قمع التحويل",
    outreachVol: "حجم التواصل عبر البريد",
    settingsTitle: "إعدادات التطبيق",
    apiKey: "الحساب",
    apiKeySub: "إدارة حساب LEADJIN واشتراكك.",
    install: "التثبيت",
    mobileInstall: "الجوال: افتح في Safari (iOS) أو Chrome (Android) واختر \"إضافة إلى الشاشة الرئيسية\".",
    extensionInstall: "إضافة Chrome: قم بتنزيل المصدر، انتقل إلى chrome://extensions، وقم بتمكين وضع المطور، وانقر فوق \"تحميل غير معبأ\" مع اختيار مجلد dist.",
    privacy: "ضوابط الخصوصية",
    clearData: "مسح جميع البيانات المحلية",
    caseStudy: "وضع دراسة الحالة",
    runSimulation: "تشغيل محاكاة دراسة الحالة",
    empty: "فارغ",
    pipelineTitle: "مسار العملاء",
    pipelineSub: "محرك CRM الذاتي",
    leadsCount: "عملاء",
    stages: {
      NEW: "جديد",
      CONTACTED: "تم التواصل",
      REPLIED: "تم الرد",
      MEETING: "اجتماع",
      PROPOSAL: "مقترح",
      CLOSED: "مغلق"
    },
    legalTitle: "الحماية القانونية والملكية الفكرية",
    patentTitle: "مخطط براءة الاختراع: محرك GSSE",
    patentSub: "محرك التوليف الجغرافي الدلالي (GSSE) - بنية مملوكة",
    ipStatus: "حالة الملكية الفكرية",
    registered: "مسجل",
    patentPending: "براءة اختراع معلقة",
    tos: "شروط الخدمة",
    privacyPolicy: "سياسة الخصوصية",
    gsseProof: "إثبات ذكاء GSSE",
    originProof: "إثبات المنشأ",
    timestamp: "طابع وقت الحصاد",
    logicHash: "تجزئة المنطق",
    signature: "التوقيع الرقمي",
    spatialHarvest: "الحصاد المكاني (الطبقة 1)",
    semanticSynthesis: "التوليف الدلالي (الطبقة 2)",
    culturalContext: "السياق الثقافي (الطبقة 3)",
    auditTrail: "مسار التدقيق",
    whitepaper: "الورقة البيضاء التقنية",
    vision2030: "توافق رؤية 2030",
    majlisMode: "وضع المجلس: الذكاء الثقافي",
    interactions: "التفاعلات",
    vrpProgram: "برنامج تحقيق الرؤية",
    etiquette: "الآداب الثقافية",
    alignmentScore: "درجة التوافق",
    majlisVersion: "نسخة المجلس: التواصل باللهجة المحلية",
    gmailTitle: "تكامل Gmail",
    gmailSub: "اربط حساب Gmail الخاص بك لإرسال تسلسلات التواصل مباشرة من بريدك المهني.",
    gmailConnected: "متصل",
    gmailDisconnect: "قطع الاتصال",
    gmailConnect: "ربط حساب Gmail",
    workspaceTitle: "مساحة عمل جوجل",
    workspaceSub: "اربط مساحة عملك المهنية للتواصل الآلي ومزامنة التقويم.",
    autonomousMode: "التواصل الذاتي",
    autonomousSub: "عند التمكين، سيقوم المحرك بإرسال تسلسلات المتابعة تلقائياً في الخلفية.",
    testConnection: "اختبار الاتصال",
    disconnect: "قطع الاتصال",
    authGuideTitle: "إعداد مبسط",
    authGuideSub: "اربط مساحة عمل Google الخاصة بك في 3 خطوات سهلة",
    authStep1: "تفعيل Gmail API في Google Cloud",
    authStep2: "إنشاء بيانات اعتماد OAuth",
    authStep3: "الاتصال والأتمتة",
    connectionValid: "الاتصال صالح!",
    connectionInvalid: "الاتصال غير صالح. يرجى إعادة الاتصال.",
    shareTitle: "مشاركة مع شريك",
    shareSub: "أنشئ رابطاً آمناً ومحدود الوقت (48 ساعة) مع دمج Gemini API لشريكك.",
    shareStatus: "حالة الرابط",
    shareActive: "نشط (ينتهي خلال 48 ساعة)",
    shareCopy: "نسخ الرابط المدمج",
    shareSuccess: "تم نسخ الرابط القابل للمشاركة مع API المدمج إلى الحافظة!",
    // New keys (ar)
    dashboard: "لوحة التحكم",
    harvestTitle: "اكتشف العملاء المحتملين",
    enriching: "جاري الإثراء...",
    emailFound: "تم العثور على البريد",
    phoneFound: "تم العثور على الهاتف",
    verified: "موثّق",
    notFound: "غير موجود",
    uploadCsv: "رفع ملف CSV",
    importLeads: "استيراد العملاء",
    enrichMissingEmails: "إثراء الإيميلات الناقصة",
    stageNew: "جديد",
    stageContacted: "تم التواصل",
    stageReplied: "ردّ",
    stageMeeting: "اجتماع",
    stageProposal: "عرض",
    stageClosedWon: "أُغلق - رابح",
    stageClosedLost: "أُغلق - خاسر",
    name: "الاسم",
    title: "المسمى الوظيفي",
    emailLabel: "البريد الإلكتروني",
    phone: "الهاتف",
    save: "حفظ",
    cancel: "إلغاء",
    delete: "حذف",
    edit: "تعديل",
    search: "بحث",
    filter: "تصفية",
    send: "إرسال",
    bookMeeting: "حجز اجتماع",
    downloadPdf: "تحميل PDF",
    sendEmail: "إرسال إيميل",
    addNote: "إضافة ملاحظة",
    emailAddress: "البريد الإلكتروني",
    password: "كلمة المرور",
    forgotPassword: "نسيت كلمة المرور؟",
    signInWithGoogle: "الدخول بـ Google",
    upgradePlan: "ترقية الباقة",
    signIn: "دخول",
    pleaseWait: "انتظر لحظة...",
    alreadyHaveAccount: "عندك حساب؟ سجّل دخول",
    dontHaveAccount: "سجّل الآن",
    backToSignIn: "الرجوع لتسجيل الدخول",
    accessWorkspace: "ادخل على مساحة عملك في LEADJIN.",
    startFreeAccount: "ابدأ حسابك مجاناً — بدون بطاقة بنكية.",
    enterEmailForReset: "أدخل إيميلك وراح نرسل لك رابط استعادة.",
    enterNewPassword: "أدخل كلمة المرور الجديدة.",
    loading: "جاري التحميل",
    noResults: "لا توجد نتائج",
    today: "اليوم",
    yesterday: "أمس",
    justNow: "الآن",
    prayerTimeConflict: "تعارض مع وقت الصلاة",
    suggestedTime: "وقت مقترح",
    ramadanMode: "وضع رمضان",
    vision2030Score: "درجة رؤية 2030",
    langToggle: "EN",
    settingsGeneral: "عام",
    settingsIntegrations: "التكاملات",
    settingsOutreach: "التواصل والذكاء الاصطناعي",
    settingsServices: "الخدمات والأسعار",
    settingsSystem: "النظام والمحرك"
  }
};

// Extend en translations with new keys
(translations.en as any).dashboard = "Dashboard";
(translations.en as any).harvestTitle = "Harvest High-Value Leads";
(translations.en as any).targetIndustry = "Target Industry";
(translations.en as any).geography = "Geography";
(translations.en as any).enriching = "Enriching...";
(translations.en as any).emailFound = "Email found";
(translations.en as any).phoneFound = "Phone found";
(translations.en as any).verified = "Verified";
(translations.en as any).notFound = "Not found";
(translations.en as any).uploadCsv = "Upload CSV";
(translations.en as any).importLeads = "Import Leads";
(translations.en as any).enrichMissingEmails = "Enrich missing emails";
(translations.en as any).stageNew = "New";
(translations.en as any).stageContacted = "Contacted";
(translations.en as any).stageReplied = "Replied";
(translations.en as any).stageMeeting = "Meeting";
(translations.en as any).stageProposal = "Proposal";
(translations.en as any).stageClosedWon = "Closed Won";
(translations.en as any).stageClosedLost = "Closed Lost";
(translations.en as any).name = "Name";
(translations.en as any).title = "Title";
(translations.en as any).emailLabel = "Email";
(translations.en as any).phone = "Phone";
(translations.en as any).save = "Save";
(translations.en as any).cancel = "Cancel";
(translations.en as any).delete = "Delete";
(translations.en as any).edit = "Edit";
(translations.en as any).search = "Search";
(translations.en as any).filter = "Filter";
(translations.en as any).send = "Send";
(translations.en as any).bookMeeting = "Book Meeting";
(translations.en as any).downloadPdf = "Download PDF";
(translations.en as any).sendEmail = "Send Email";
(translations.en as any).addNote = "Add Note";
(translations.en as any).emailAddress = "Email address";
(translations.en as any).password = "Password";
(translations.en as any).forgotPassword = "Forgot password?";
(translations.en as any).signInWithGoogle = "Sign in with Google";
(translations.en as any).upgradePlan = "Upgrade Plan";
(translations.en as any).signIn = "Sign In";
(translations.en as any).pleaseWait = "Please wait...";
(translations.en as any).alreadyHaveAccount = "Already have an account? Sign in";
(translations.en as any).dontHaveAccount = "Sign up";
(translations.en as any).backToSignIn = "Back to sign in";
(translations.en as any).accessWorkspace = "Access your LEADJIN workspace.";
(translations.en as any).startFreeAccount = "Start your free account — no credit card needed.";
(translations.en as any).enterEmailForReset = "Enter your email and we'll send a reset link.";
(translations.en as any).enterNewPassword = "Enter your new password.";
(translations.en as any).loading = "Loading";
(translations.en as any).noResults = "No results";
(translations.en as any).today = "Today";
(translations.en as any).yesterday = "Yesterday";
(translations.en as any).justNow = "just now";
(translations.en as any).prayerTimeConflict = "Prayer time conflict";
(translations.en as any).suggestedTime = "Suggested time";
(translations.en as any).ramadanMode = "Ramadan Mode";
(translations.en as any).vision2030Score = "Vision 2030 Score";
(translations.en as any).langToggle = "AR";

const OnboardingModal = ({ onComplete, language, setLanguage, darkMode, setDarkMode, majlisModeEnabled, setMajlisModeEnabled, vision2030Enabled, setVision2030Enabled }: any) => {
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

// Helper: extract subject & body from outreach sequence entry (handles both old string and new {subject,body} format)
function parseOutreach(entry: any): { subject: string; body: string } {
  if (!entry) return { subject: '', body: '' };
  if (typeof entry === 'object' && entry.subject) return { subject: entry.subject, body: entry.body || '' };
  // Old format: "Subject: XYZ | Body text..." or "Subject: XYZ\n\nBody text..."
  const str = String(entry);
  const nlMatch = str.match(/^Subject:\s*(.+?)\n\n([\s\S]+)/);
  if (nlMatch) return { subject: nlMatch[1].trim(), body: nlMatch[2].trim() };
  const pipeMatch = str.match(/^Subject:\s*(.+?)\s*\|\s*([\s\S]+)/);
  if (pipeMatch) return { subject: pipeMatch[1].trim(), body: pipeMatch[2].trim() };
  // No subject found — use first sentence as subject
  const firstDot = str.indexOf('. ');
  if (firstDot > 0 && firstDot < 80) return { subject: str.slice(0, firstDot), body: str.slice(firstDot + 2) };
  return { subject: 'Outreach', body: str };
}

function AppContent() {
  const [industries, setIndustries] = useState('Legal, Consulting, Finance');
  const [companySize, setCompanySize] = useState('10-50');
  const [geography, setGeography] = useState('Saudi Arabia, UAE, US, UK');
  const [jobTitles, setJobTitles] = useState('Founder, Managing Partner, CEO');
  const [userIndustry, setUserIndustry] = useState('Information Technology & AI');
  const [userServices, setUserServices] = useState('Custom software development and AI integration');
  const [userCaseStudy, setUserCaseStudy] = useState('Increased client revenue by 30% through automation');
  const [userCompetitors, setUserCompetitors] = useState('Accenture, Deloitte');
  const [targetIndustry, setTargetIndustry] = useState('Any / Auto-Match (AI Driven)');
  const [limit, setLimit] = useState(20);
  const [model, setModel] = useState<"gemini-2.5-flash" | "gemini-2.5-pro-preview" | "gemini-flash-lite-latest">("gemini-flash-lite-latest");
  const [darkMode, setDarkMode] = useState(() => {
    try {
      const saved = localStorage.getItem('leadjin_theme');
      return saved !== 'light'; // default to dark if no preference stored
    } catch (e) {
      return true;
    }
  });
  const [language, setLanguage] = useState<'en' | 'ar'>(() => {
    try {
      const saved = localStorage.getItem('leadjin_lang');
      return (saved === 'ar' || saved === 'en') ? saved : 'en';
    } catch (e) {
      return 'en';
    }
  });
  const [showOnboarding, setShowOnboarding] = useState(() => {
    try {
      return !localStorage.getItem('leadjin_onboarded');
    } catch (e) {
      return true;
    }
  });
  const [authToken, setAuthToken] = useState(() => {
    try { return localStorage.getItem('leadjin_token') || ''; } catch (e) { return ''; }
  });
  const [currentUser, setCurrentUser] = useState<{ id: number; email: string; subscription_plan: string; monthly_searches_used: number; monthly_searches_limit: number; subscription_expires_at?: string; trial_ends_at?: string; subscription_status?: string; subscription_days_left?: number; subscription_active?: boolean } | null>(null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register' | 'forgot' | 'reset'>('login');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authConfirmPassword, setAuthConfirmPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authSuccess, setAuthSuccess] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [currentView, setCurrentView] = useState<'harvest' | 'crm' | 'analytics' | 'settings'>('harvest');
  const [crmLeads, setCrmLeads] = useState<any[]>([]);
  const [analyticsData, setAnalyticsData] = useState<any>(null);
  const [analyticsDateRange, setAnalyticsDateRange] = useState<'7' | '30' | '90' | 'all'>('30');
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);
  
  const [leads, setLeads] = useState<LeadjinLead[]>(() => {
    try {
      const saved = localStorage.getItem('leadjin_leads');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      console.error('Failed to parse leads from localStorage', e);
      return [];
    }
  });
  const [hasSearched, setHasSearched] = useState(false);
  const [showConfig, setShowConfig] = useState(true);
  const [majlisModeEnabled, setMajlisModeEnabled] = useState(true);
  const [vision2030Enabled, setVision2030Enabled] = useState(true);
  
  const [loading, setLoading] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [contactedLeads, setContactedLeads] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('leadjin_contacted');
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch (e) {
      console.error('Failed to parse contactedLeads from localStorage', e);
      return new Set();
    }
  });
  const [notification, setNotification] = useState<{ message: string, type: 'success' | 'error' | 'info' } | null>(null);

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const [selectedLead, setSelectedLead] = useState<LeadjinLead | null>(null);
  const [enriching, setEnriching] = useState(false);
  const [activeTab, setActiveTab] = useState<'details' | 'sequence' | 'proposal' | 'quotation' | 'calendar' | 'interactions'>('details');
  const [showProposalPreview, setShowProposalPreview] = useState(false);
  const [quotations, setQuotations] = useState<any[]>([]);
  const [bookings, setBookings] = useState<any[]>([]);
  const [quotationLoading, setQuotationLoading] = useState(false);
  const [bookingLoading, setBookingLoading] = useState(false);
  // Quotation builder state
  const [interactions, setInteractions] = useState<any[]>([]);
  const [newInteraction, setNewInteraction] = useState({ type: 'email', summary: '', outcome: '' });
  const [quotationItems, setQuotationItems] = useState<{label: string; amount: string}[]>([
    { label: 'Intelligence Harvesting & Enrichment', amount: '2500' },
    { label: 'Automated Outreach Infrastructure', amount: '1500' },
  ]);
  const [quotationNotes, setQuotationNotes] = useState('Payment terms: 50% upfront, 50% on delivery. Valid for 30 days.');
  const [quotationValidDays, setQuotationValidDays] = useState('30');
  const [isSimulating, setIsSimulating] = useState(false);
  const [searchDuration, setSearchDuration] = useState<number | null>(null);
  const [showIcpSheet, setShowIcpSheet] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const [pipelineSearch, setPipelineSearch] = useState('');
  const [pipelineFilter, setPipelineFilter] = useState<'all' | 'hot' | 'warm' | 'cold'>('all');
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [showWhitepaper, setShowWhitepaper] = useState(false);
  const [gmailConnected, setGmailConnected] = useState(() => !!localStorage.getItem('leadjin_gmail_email'));
  const [gmailEmail, setGmailEmail] = useState(() => localStorage.getItem('leadjin_gmail_email') || '');
  const [gmailName, setGmailName] = useState(() => localStorage.getItem('leadjin_gmail_name') || '');
  const [companyProfile, setCompanyProfile] = useState(() => {
    try {
      const saved = localStorage.getItem('leadjin_company_profile');
      return saved ? JSON.parse(saved) : { name: '', tagline: '', email: '', phone: '', website: '', address: '' };
    } catch (e) { return { name: '', tagline: '', email: '', phone: '', website: '', address: '' }; }
  });

  const isProUser = currentUser?.subscription_plan === 'pro' || (currentUser as any)?.is_founder || (currentUser as any)?.founder;
  const [autonomousMode, setAutonomousMode] = useState(() => {
    try {
      return localStorage.getItem('leadjin_autonomous') === 'true';
    } catch (e) {
      return false;
    }
  });
  const [emailTemplates, setEmailTemplates] = useState<any[]>([]);
  const [editingTemplate, setEditingTemplate] = useState<any>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(() => {
    try {
      const saved = localStorage.getItem('leadjin_selected_template');
      return saved ? parseInt(saved) : null;
    } catch (e) {
      return null;
    }
  });
  const [settingsTab, setSettingsTab] = useState<'general' | 'integrations' | 'outreach' | 'system'>('general');
  const [dbStats, setDbStats] = useState<any>(null);
  const [showJinPanel, setShowJinPanel] = useState(false);

  // Integrations panel state
  const [enrichmentProviders, setEnrichmentProviders] = useState<{ name: string; status: string }[]>([]);
  const [creditsBalance, setCreditsBalance] = useState<{ remaining: number; used: number; total: number; transactions: { id: string; description: string; amount: number; created_at: string }[] } | null>(null);
  const [whatsappStatus, setWhatsappStatus] = useState<{ connected: boolean; phone_number_id?: string } | null>(null);
  const [integrationsLoading, setIntegrationsLoading] = useState(false);

  // CSV Upload state
  const [csvStep, setCsvStep] = useState<'idle' | 'uploading' | 'preview' | 'importing' | 'done'>('idle');
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvUploadId, setCsvUploadId] = useState<string | null>(null);
  const [csvParsed, setCsvParsed] = useState<{ total: number; sample: any[] } | null>(null);
  const [csvColumns, setCsvColumns] = useState<{ detected: Record<string, string>; available: string[] } | null>(null);
  const [csvEnrich, setCsvEnrich] = useState(true);
  const [csvResult, setCsvResult] = useState<{ imported: number; enriched: number; failed: number } | null>(null);
  const [csvDragging, setCsvDragging] = useState(false);
  const [csvError, setCsvError] = useState<string | null>(null);
  const csvFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    localStorage.setItem('leadjin_autonomous', autonomousMode.toString());
  }, [autonomousMode]);

  useEffect(() => {
    if (settingsTab !== 'integrations') return;
    setIntegrationsLoading(true);
    Promise.all([
      authFetch('/api/enrichment/providers').then(r => r.json()).catch(() => []),
      authFetch('/api/credits/balance').then(r => r.json()).catch(() => null),
      authFetch('/api/whatsapp/status').then(r => r.json()).catch(() => null),
    ]).then(([providers, credits, whatsapp]) => {
      setEnrichmentProviders(Array.isArray(providers) ? providers : []);
      setCreditsBalance(credits && typeof credits.remaining === 'number' ? credits : null);
      setWhatsappStatus(whatsapp && typeof whatsapp.connected === 'boolean' ? whatsapp : null);
      setIntegrationsLoading(false);
    });
  }, [settingsTab]);

  useEffect(() => {
    if (settingsTab === 'system') {
      authFetch('/api/precrawl/stats').then(r => r.json()).then(setDbStats).catch(() => {});
    }
  }, [settingsTab]);

  useEffect(() => {
    if (selectedTemplateId) {
      localStorage.setItem('leadjin_selected_template', selectedTemplateId.toString());
    } else {
      localStorage.removeItem('leadjin_selected_template');
    }
  }, [selectedTemplateId]);

  useEffect(() => {
    authFetch('/api/templates')
      .then(res => res.json())
      .then(data => setEmailTemplates(Array.isArray(data) ? data : []))
      .catch(err => console.error(err));
  }, [authToken]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const t = translations[language as keyof typeof translations] || translations.en;

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === 'GOOGLE_AUTH_SUCCESS') {
        setGmailConnected(true);
        setGmailEmail(event.data.email);
        setGmailName(event.data.name || '');
        if (!event.data.token) {
          setNotification({ message: `Gmail Connected: ${event.data.email}`, type: 'success' });
        }
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  useEffect(() => {
    fetch('/api/auth/google/status')
      .then(res => res.json())
      .then(data => {
        setGmailConnected(data.connected);
        setGmailEmail(data.email || '');
        setGmailName(data.name || '');
      });
  }, []);

  const handleOnboardingComplete = () => {
    localStorage.setItem('leadjin_onboarded', 'true');
    setShowOnboarding(false);
  };

  const runCaseStudySimulation = async () => {
    setIsSimulating(true);
    setLoading(true);
    setLoadingStatus('Initializing Saudi Case Study Simulation...');
    
    try {
      await new Promise(r => setTimeout(r, 1000));
      setLoadingStatus('Harvesting 10 High-Value Saudi Leads...');
      await new Promise(r => setTimeout(r, 1500));
      
      const res = await fetch('/api/test/seed', { method: 'POST' });
      if (res.ok) {
        setLoadingStatus('Syncing CRM Pipeline & Financial Data...');
        await new Promise(r => setTimeout(r, 1500));
        
        setLoadingStatus('Generating Intelligence Reports...');
        await new Promise(r => setTimeout(r, 1000));
        
        setCurrentView('analytics');
        await fetchAnalytics();
        setNotification({ message: 'Case Study Simulation Complete!', type: 'success' });
      }
    } catch (err) {
      console.error('Simulation failed:', err);
    } finally {
      setLoading(false);
      setIsSimulating(false);
    }
  };

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('leadjin_theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('leadjin_theme', 'light');
    }
  }, [darkMode]);

  useEffect(() => {
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = language;
    localStorage.setItem('leadjin_lang', language);
  }, [language]);

  useEffect(() => {
    localStorage.setItem('leadjin_contacted', JSON.stringify(Array.from(contactedLeads)));
  }, [contactedLeads]);

  useEffect(() => {
    localStorage.setItem('leadjin_leads', JSON.stringify(leads));
  }, [leads]);

  useEffect(() => {
    localStorage.setItem('leadjin_token', authToken);
  }, [authToken]);

  useEffect(() => {
    localStorage.setItem('leadjin_company_profile', JSON.stringify(companyProfile));
    // Auto-save to server (debounced) so profile persists across devices
    if (!authToken) return;
    const timer = setTimeout(() => {
      fetch('/api/user/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({
          company_name: companyProfile.name,
          company_tagline: companyProfile.tagline,
          company_email: companyProfile.email,
          company_phone: companyProfile.phone,
          company_website: companyProfile.website,
          company_address: companyProfile.address,
        })
      }).catch(() => {}); // silent — localStorage is the fallback
    }, 1500);
    return () => clearTimeout(timer);
  }, [companyProfile, authToken]);

  // Handle ?reset=token from password reset email
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const resetToken = params.get('reset');
    if (resetToken) {
      setAuthMode('reset');
      setAuthEmail(resetToken); // reuse authEmail field to carry token
      setShowAuthModal(true);
      window.history.replaceState({}, '', '/');
    }
  }, []);

  useEffect(() => {
    if (!authToken) return;
    fetch('/api/auth/me', { headers: { Authorization: `Bearer ${authToken}` } })
      .then(r => r.json())
      .then(data => { if (data.user) setCurrentUser(data.user); else setAuthToken(''); })
      .catch(() => {});
    // Always load company profile from server — localStorage is just a cache
    fetch('/api/user/profile', { headers: { Authorization: `Bearer ${authToken}` } })
      .then(r => r.json())
      .then(profile => {
        if (profile && !profile.error) {
          const p = { name: profile.company_name || '', tagline: profile.company_tagline || '', email: profile.company_email || '', phone: profile.company_phone || '', website: profile.company_website || '', address: profile.company_address || '' };
          setCompanyProfile(p);
          localStorage.setItem('leadjin_company_profile', JSON.stringify(p));
        }
      })
      .catch(() => {});
}, [authToken]);

  useEffect(() => {
    if (gmailEmail) {
      localStorage.setItem('leadjin_gmail_email', gmailEmail);
      localStorage.setItem('leadjin_gmail_name', gmailName);
    } else {
      localStorage.removeItem('leadjin_gmail_email');
      localStorage.removeItem('leadjin_gmail_name');
    }
  }, [gmailEmail, gmailName]);


  useEffect(() => {
    if (leads.length > 0) {
      authFetch('/api/leads/sync', {
        method: 'POST',
        body: JSON.stringify({ leads })
      }).catch(err => console.error('Sync failed:', err));
    }
  }, [leads]);

  const fetchCRMLeads = async () => {
    try {
      const res = await authFetch('/api/leads');
      const data = await res.json();
      // Add some mock data for the new fields if they don't exist
      const enrichedData = data.map((l: any) => ({
        ...l,
        value: l.value || Math.floor(Math.random() * 5000) + 1000,
        lastAction: l.lastAction || 'Initial outreach sent',
        daysInStage: l.daysInStage || Math.floor(Math.random() * 10) + 1
      }));
      setCrmLeads(enrichedData);
    } catch (err) {
      console.error('Failed to fetch CRM leads:', err);
    }
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveDragId(event.active.id as string);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveDragId(null);

    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    // If dropped on a column
    const stages = ['NEW', 'CONTACTED', 'REPLIED', 'MEETING', 'PROPOSAL', 'CLOSED'];
    if (stages.includes(overId)) {
      const lead = crmLeads.find(l => l.lead_id === activeId);
      if (lead && lead.status !== overId) {
        // Update locally
        const updatedLeads = crmLeads.map(l => 
          l.lead_id === activeId ? { ...l, status: overId } : l
        );
        setCrmLeads(updatedLeads);

        // Update backend
        try {
          await authFetch('/api/leads/status', {
            method: 'POST',
            body: JSON.stringify({ id: activeId, status: overId })
          });

          if (overId === 'CLOSED') {
            confetti({
              particleCount: 150,
              spread: 70,
              origin: { y: 0.6 },
              colors: ['#3182ce', '#63b3ed', '#ffffff']
            });
          }
        } catch (err) {
          console.error('Failed to update status:', err);
        }
      }
      return;
    }

    // If dropped on another card (reordering within same column or moving to new column)
    const activeLead = crmLeads.find(l => l.lead_id === activeId);
    const overLead = crmLeads.find(l => l.lead_id === overId);

    if (activeLead && overLead && activeLead.status !== overLead.status) {
      const newStatus = overLead.status;
      const updatedLeads = crmLeads.map(l => 
        l.lead_id === activeId ? { ...l, status: newStatus } : l
      );
      setCrmLeads(updatedLeads);
      
      try {
        await authFetch('/api/leads/status', {
          method: 'POST',
          body: JSON.stringify({ id: activeId, status: newStatus })
        });
        
        if (newStatus === 'CLOSED') {
          confetti({
            particleCount: 150,
            spread: 70,
            origin: { y: 0.6 },
            colors: ['#3182ce', '#63b3ed', '#ffffff']
          });
        }
      } catch (err) {
        console.error('Failed to update status:', err);
      }
    }
  };

  useEffect(() => {
    if (currentView === 'crm') {
      fetchCRMLeads();
    }
    if (currentView === 'analytics') {
      fetchAnalytics(analyticsDateRange);
    }
  }, [currentView]);

  const fetchAnalytics = async (range?: string) => {
    const r = range || analyticsDateRange;
    setAnalyticsError(null);
    try {
      let url = '/api/analytics/stats';
      if (r !== 'all') {
        const to = new Date().toISOString().split('T')[0];
        const from = new Date(Date.now() - parseInt(r) * 86400000).toISOString().split('T')[0];
        url = `/api/analytics/stats?from=${from}&to=${to}`;
      }
      const res = await authFetch(url);
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const data = await res.json();
      setAnalyticsData(data);
    } catch (err: any) {
      console.error('Failed to fetch analytics:', err);
      setAnalyticsError(err.message || 'Failed to load analytics');
    }
  };

  useEffect(() => {
    if (selectedLead && activeTab === 'quotation') {
      authFetch(`/api/quotations/${selectedLead.lead_id}`)
        .then(res => res.json())
        .then(data => setQuotations(data))
        .catch(err => console.error('Failed to fetch quotations:', err));
    }
    if (selectedLead && activeTab === 'interactions') {
      authFetch(`/api/leads/${selectedLead.lead_id}/interactions`)
        .then(res => res.json())
        .then(data => setInteractions(data))
        .catch(err => console.error('Failed to fetch interactions:', err));
    }
    if (selectedLead && activeTab === 'calendar') {
      authFetch(`/api/calendar/bookings/${selectedLead.lead_id}`)
        .then(res => res.json())
        .then(data => setBookings(data))
        .catch(err => console.error('Failed to fetch bookings:', err));
    }
  }, [selectedLead, activeTab]);

  const handleBookMeeting = async () => {
    if (!selectedLead) return;
    setBookingLoading(true);
    try {
      const startTime = new Date();
      startTime.setDate(startTime.getDate() + 1);
      startTime.setHours(10, 0, 0, 0);
      
      const endTime = new Date(startTime);
      endTime.setHours(11, 0, 0, 0);

      const res = await authFetch('/api/calendar/book', {
        method: 'POST',
        body: JSON.stringify({
          lead_id: selectedLead.lead_id,
          email: selectedLead.email,
          start_time: startTime.toISOString(),
          end_time: endTime.toISOString(),
          summary: `Strategic Partnership Discovery: ${selectedLead.company}`
        })
      });

      if (res.ok) {
        setNotification({ message: 'Meeting booked and confirmation email queued!', type: 'success' });
        // Refresh bookings
        const bRes = await authFetch(`/api/calendar/bookings/${selectedLead.lead_id}`);
        setBookings(await bRes.json());
      } else {
        const errData = await res.json().catch(() => ({}));
        if (errData.error === 'prayer_time_conflict') {
          const suggested = errData.suggested_time
            ? new Date(errData.suggested_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : null;
          const msg = suggested
            ? `Meeting conflicts with ${errData.prayer} prayer time. Suggested alternative: ${suggested}.`
            : `Meeting conflicts with ${errData.prayer} prayer time. Please choose a different time.`;
          setNotification({ message: msg, type: 'error' });
        } else {
          setNotification({ message: 'Failed to book meeting. Please try again.', type: 'error' });
        }
      }
    } catch (err) {
      console.error('Booking failed:', err);
      setNotification({ message: 'Failed to book meeting. Please try again.', type: 'error' });
    } finally {
      setBookingLoading(false);
    }
  };

  const handleCreateQuotation = async () => {
    if (!selectedLead) return;
    setQuotationLoading(true);
    try {
      const res = await authFetch('/api/quotations/create', {
        method: 'POST',
        body: JSON.stringify({
          lead_id: selectedLead.lead_id,
          items: quotationItems.filter(i => i.label.trim()),
          notes: quotationNotes,
          valid_days: parseInt(quotationValidDays) || 30,
          currency: 'SAR',
          vat_rate: 15,
        })
      });
      const data = await res.json();
      if (data.status === 'created') {
        setNotification({ message: `Quotation #${data.invoice_id} created — Total: SAR ${data.total.toLocaleString()}`, type: 'success' });
        const qRes = await authFetch(`/api/quotations/${selectedLead.lead_id}`);
        setQuotations(await qRes.json());
      }
    } catch (err) {
      console.error('Quotation creation failed:', err);
      setNotification({ message: 'Failed to save quotation. Please try again.', type: 'error' });
    } finally {
      setQuotationLoading(false);
    }
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!authToken) {
      setShowAuthModal(true);
      return;
    }

    // Trial gate — refresh subscription status before allowing harvest
    try {
      const meRes = await fetch('/api/auth/me', { headers: { Authorization: `Bearer ${authToken}` } });
      const meData = await meRes.json();
      if (meData.user) {
        setCurrentUser(meData.user);
        if (!meData.user || meData.user.subscription_status === 'trial_expired') {
          setShowUpgradeModal(true);
          return;
        }
      } else {
        // Token invalid or user not found — block harvest
        setShowUpgradeModal(true);
        return;
      }
    } catch {
      // Network error — fall back to cached state; block if null or expired
      if (!currentUser || currentUser.subscription_status === 'trial_expired') {
        setShowUpgradeModal(true);
        return;
      }
    }

    setLoading(true);
    setHasSearched(true);
    setShowConfig(false);
    setLoadingStatus('Initializing Intelligence Harvest...');
    setLeads([]);
    setSelectedLead(null);
    setSearchDuration(null);

    const startTime = Date.now();
    try {
      if (model === "gemini-2.5-pro-preview") {
        setLoadingStatus('LEADJIN Pro 2.5 — Deep Intelligence Harvest...');
      } else if (model === "gemini-2.5-flash") {
        setLoadingStatus('LEADJIN Flash — Scanning Target Market...');
      } else {
        setLoadingStatus('LEADJIN Rapid — Harvesting Leads...');
      }

      const selectedTemplate = emailTemplates.find(t => t.id === selectedTemplateId);

      const res = await fetch('/api/leads/harvest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({
          searchParams: {
            userIndustry,
            userServices,
            userCaseStudy,
            userCompetitors,
            targetIndustry,
            company_size: companySize,
            geography: geography.split(',').map(s => s.trim()),
            job_titles: jobTitles.split(',').map(s => s.trim()),
            limit,
            model,
            majlisMode: majlisModeEnabled,
            vision2030: vision2030Enabled,
            emailTemplate: selectedTemplate ? { subject: selectedTemplate.subject, body: selectedTemplate.body } : undefined
          }
        })
      });

      if (res.status === 401) {
        setAuthToken('');
        setCurrentUser(null);
        setShowAuthModal(true);
        throw new Error('Session expired. Please sign in again.');
      }
      if (res.status === 403) {
        const errData = await res.json();
        if (errData.upgrade) {
          setShowUpgradeModal(true);
          setLoading(false);
          return;
        }
      }
      if (res.status === 429) {
        const data = await res.json();
        throw new Error(`Monthly search quota reached (${data.used}/${data.limit}). Upgrade to continue.`);
      }
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Harvest failed');
      }

      const data = await res.json();
      setLeads(data.leads);
      const endTime = Date.now();
      setSearchDuration((endTime - startTime) / 1000);

      // Task 1G: Multi-Phase Background Enrichment Pipeline
      (async () => {
        const enrichedLeadIds = new Set();
        
        // Phase 1: Email enrichment (existing code, keep sequential)
        for (let idx = 0; idx < data.leads.length; idx++) {
          try {
            const r = await fetch('/api/leads/enrich', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
              body: JSON.stringify({ lead: data.leads[idx] })
            });
            const enrichResult = await r.json();
            if (enrichResult.email) {
              setLeads(prev => prev.map((l: any, i: number) =>
                i === idx ? { ...l, email: enrichResult.email, email_verified: enrichResult.email_verified, email_source: enrichResult.email_source } : l
              ));
            }
          } catch {}
        }
        
        // Phase 2: Website verification (parallel batches of 3)
        const leadsWithWebsites = data.leads.filter((l: any) => l.website);
        for (let i = 0; i < leadsWithWebsites.length; i += 3) {
          const batch = leadsWithWebsites.slice(i, i + 3);
          await Promise.all(batch.map(async (lead: any) => {
            try {
              const r = await fetch('/api/leads/verify-website', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
                body: JSON.stringify({ lead_id: lead.lead_id, website: lead.website })
              });
              const result = await r.json();
              setLeads(prev => prev.map((l: any) =>
                l.lead_id === lead.lead_id ? { ...l, website_verified: result.website_verified, website_status: result.website_status } : l
              ));
            } catch {}
          }));
        }
        
        // Phase 3: LinkedIn enrichment (sequential, uses Gemini API)
        for (const lead of data.leads) {
          if (!lead.linkedin) {
            try {
              const r = await fetch('/api/leads/enrich-linkedin', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
                body: JSON.stringify({ lead_id: lead.lead_id, name: lead.name, company: lead.company })
              });
              const result = await r.json();
              if (result.linkedin) {
                setLeads(prev => prev.map((l: any) =>
                  l.lead_id === lead.lead_id ? { ...l, linkedin: result.linkedin } : l
                ));
              }
            } catch {}
          }
        }
        
        // Phase 4: Score recalculation (single batch call)
        try {
          const currentLeads = data.leads.map((l: any) => ({
            lead_id: l.lead_id,
            score_breakdown: l.score_breakdown,
            pain_signals: l.pain_signals,
            website_verified: l.website_verified,
            email_verified: l.email_verified,
            email_source: l.email_source,
            linkedin: l.linkedin
          }));
          
          const r = await fetch('/api/leads/recalculate-scores', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
            body: JSON.stringify({ leads: currentLeads })
          });
          const result = await r.json();
          
          // Update scores
          if (result.results) {
            for (const recalc of result.results) {
              setLeads(prev => prev.map((l: any) =>
                l.lead_id === recalc.lead_id ? { ...l, lead_score: recalc.score, score_breakdown: recalc.breakdown } : l
              ));
            }
          }
        } catch {}
      })();

      // Refresh user quota display
      if (authToken) {
        fetch('/api/auth/me', { headers: { Authorization: `Bearer ${authToken}` } })
          .then(r => r.json()).then(d => { if (d.user) setCurrentUser(d.user); }).catch(() => {});
      }
    } catch (error: any) {
      console.error("Generation failed:", error);
      setErrorMessage(error.message || 'Please check your ICP parameters.');
    } finally {
      setLoading(false);
      setLoadingStatus('');
    }
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthSuccess('');
    setAuthLoading(true);
    try {
      if (authMode === 'forgot') {
        await fetch('/api/auth/forgot', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: authEmail }) });
        setAuthSuccess('If that email exists, a reset link has been sent.');
        setAuthLoading(false);
        return;
      }
      if (authMode === 'reset') {
        const res = await fetch('/api/auth/reset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: authEmail, password: authPassword }) });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Reset failed');
        setAuthSuccess('Password updated. Please sign in.');
        setAuthMode('login');
        setAuthEmail('');
        setAuthPassword('');
        setAuthLoading(false);
        return;
      }
      if (authMode === 'register' && authPassword !== authConfirmPassword) {
        setAuthError('Passwords do not match.');
        setAuthLoading(false);
        return;
      }
      const res = await fetch(`/api/auth/${authMode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: authEmail, password: authPassword })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Authentication failed');
      setAuthToken(data.token);
      setCurrentUser(data.user);
      setShowAuthModal(false);
      setAuthEmail('');
      setAuthPassword('');
      setAuthConfirmPassword('');
      // Load this user's company profile from server to prevent stale data from previous user
      fetch('/api/user/profile', { headers: { Authorization: `Bearer ${data.token}` } })
        .then(r => r.json())
        .then(profile => {
          if (profile && !profile.error) {
            const p = { name: profile.company_name || '', tagline: profile.company_tagline || '', email: profile.company_email || '', phone: profile.company_phone || '', website: profile.company_website || '', address: profile.company_address || '' };
            setCompanyProfile(p);
            localStorage.setItem('leadjin_company_profile', JSON.stringify(p));
          } else {
            setCompanyProfile({ name: '', tagline: '', email: '', phone: '', website: '', address: '' });
            localStorage.removeItem('leadjin_company_profile');
          }
        })
        .catch(() => {});
      // Clear previous user's local leads — each user has their own CRM data on server
      setLeads([]);
      setContactedLeads(new Set());
      localStorage.removeItem('leadjin_leads');
      localStorage.removeItem('leadjin_contacted');
      setNotification({ message: authMode === 'register' ? 'Account created!' : 'Signed in successfully.', type: 'success' });
    } catch (err: any) {
      setAuthError(err.message);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${authToken}` } }).catch(() => {});
    setAuthToken('');
    setCurrentUser(null);
    // Clear ALL user-specific localStorage to prevent data leaking to next login
    localStorage.removeItem('leadjin_token');
    localStorage.removeItem('leadjin_company_profile');
    localStorage.removeItem('leadjin_leads');
    localStorage.removeItem('leadjin_contacted');
    localStorage.removeItem('leadjin_gmail_email');
    localStorage.removeItem('leadjin_gmail_name');
    localStorage.removeItem('leadjin_autonomous');
    localStorage.removeItem('leadjin_selected_template');
    localStorage.removeItem('leadjin_onboarded');
    window.location.href = '/';
  };

  // Authenticated fetch wrapper — injects Bearer token on every call
  const authFetch = (url: string, options: RequestInit = {}) =>
    fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        ...(options.headers as Record<string, string> || {}),
      },
    });

  // CSV Upload handlers
  const handleCsvFileSelect = useCallback((file: File) => {
    if (!file) return;
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext !== 'csv' && ext !== 'xlsx') {
      setCsvError('Only .csv and .xlsx files are supported.');
      return;
    }
    setCsvFile(file);
    setCsvError(null);
    setCsvStep('idle');
  }, []);

  const handleCsvUpload = async () => {
    if (!csvFile) return;
    if (!authToken) { setShowAuthModal(true); return; }
    setCsvStep('uploading');
    setCsvError(null);
    try {
      const formData = new FormData();
      formData.append('file', csvFile);
      const res = await fetch('/api/leads/upload-csv', {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` },
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Upload failed (${res.status})`);
      }
      const data = await res.json();
      setCsvUploadId(data.uploadId);
      setCsvParsed(data.parsed);
      setCsvColumns(data.columns);
      setCsvStep('preview');
    } catch (err: any) {
      setCsvError(err.message || 'Upload failed. Please try again.');
      setCsvStep('idle');
    }
  };

  const handleCsvConfirm = async () => {
    if (!csvUploadId) return;
    setCsvStep('importing');
    setCsvError(null);
    try {
      const res = await authFetch('/api/leads/upload-csv/confirm', {
        method: 'POST',
        body: JSON.stringify({ uploadId: csvUploadId, enrichEnabled: csvEnrich }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Import failed (${res.status})`);
      }
      const data = await res.json();
      setCsvResult(data);
      setCsvStep('done');
      setNotification({ message: `CSV imported: ${data.imported} leads added!`, type: 'success' });
      fetchCRMLeads();
    } catch (err: any) {
      setCsvError(err.message || 'Import failed. Please try again.');
      setCsvStep('preview');
    }
  };

  const handleCsvReset = () => {
    setCsvStep('idle');
    setCsvFile(null);
    setCsvUploadId(null);
    setCsvParsed(null);
    setCsvColumns(null);
    setCsvResult(null);
    setCsvError(null);
    if (csvFileInputRef.current) csvFileInputRef.current.value = '';
  };

  const handleClearData = () => {
    if (window.confirm("Are you sure you want to clear all local data? This includes all leads and contacted status.")) {
      setLeads([]);
      setContactedLeads(new Set());
      localStorage.removeItem('leadjin_leads');
      localStorage.removeItem('leadjin_contacted');
      setSelectedLead(null);
    }
  };

  const toggleContacted = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const newContacted = new Set(contactedLeads);
    if (newContacted.has(id)) {
      newContacted.delete(id);
    } else {
      newContacted.add(id);
    }
    setContactedLeads(newContacted);
  };

  const handleInitiateCampaign = async () => {
    if (!selectedLead || !selectedLead.outreach_sequence) return;
    
    try {
      if (!autonomousMode) throw new Error('Autonomous mode disabled');
      
      const day0 = parseOutreach(selectedLead.outreach_sequence.day0);
      const day3 = parseOutreach(selectedLead.outreach_sequence.day3);
      const day7 = parseOutreach(selectedLead.outreach_sequence.day7);
      const day3At = new Date(Date.now() + 3*24*60*60*1000).toISOString().replace('T',' ').split('.')[0];
      const day7At = new Date(Date.now() + 7*24*60*60*1000).toISOString().replace('T',' ').split('.')[0];

      const res = await authFetch('/api/email/queue', {
        method: 'POST',
        body: JSON.stringify({
          lead_id: selectedLead.lead_id,
          to_email: selectedLead.email,
          subject: day0.subject,
          body: day0.body,
          with_followups: [
            { subject: day3.subject, body: day3.body, scheduled_at: day3At },
            { subject: day7.subject, body: day7.body, scheduled_at: day7At },
          ]
        })
      });

      if (res.ok) {
        setNotification({ message: 'Email queued successfully via LEADJIN Engine!', type: 'success' });
        // Update status to CONTACTED
        await authFetch('/api/leads/status', {
          method: 'POST',
          body: JSON.stringify({ id: selectedLead.lead_id, status: 'CONTACTED' })
        });
        setContactedLeads(prev => new Set([...Array.from(prev), selectedLead.lead_id]));
      } else {
        const data = await res.json();
        throw new Error(data.error || 'Server queue failed');
      }
    } catch (err) {
      console.warn('Server queue failed, falling back to local mail client:', err);
      const fallback = parseOutreach(selectedLead.outreach_sequence.day0);
      const subject = encodeURIComponent(fallback.subject);
      const body = encodeURIComponent(fallback.body);
      window.location.href = `mailto:${selectedLead.email}?subject=${subject}&body=${body}`;
    }
  };

  const handleExportCSV = () => {
    if (leads.length === 0) return;
    
    const headers = ["Name", "Title", "Company", "Email", "LinkedIn", "Score", "Status"];
    const rows = leads.map(l => [
      l.name,
      l.title,
      l.company,
      l.email || "N/A",
      l.linkedin || "N/A",
      l.lead_score,
      contactedLeads.has(l.lead_id) ? "Contacted" : "New"
    ]);
    
    const csvContent = [
      headers.join(","),
      ...rows.map(r => r.map(field => `"${field}"`).join(","))
    ].join("\n");
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `leadjin_leads_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadProposal = async () => {
    const element = document.getElementById('proposal-template');
    if (!element) return;

    try {
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        onclone: (clonedDoc) => {
          // Remove all stylesheets that might contain oklch/oklab which html2canvas fails to parse
          const styleSheets = clonedDoc.querySelectorAll('style, link[rel="stylesheet"]');
          styleSheets.forEach(s => s.remove());

          const el = clonedDoc.getElementById('proposal-template');
          if (el) {
            // Force light theme variables and basic layout styles since we removed stylesheets
            el.style.display = 'block';
            el.style.width = '800px'; // Fixed width for PDF consistency
            el.style.padding = '60px';
            el.style.borderRadius = '40px';
            el.style.border = '1px solid rgba(49, 130, 206, 0.2)';
            el.style.fontFamily = 'Inter, sans-serif';
            el.style.setProperty('--app-text', '#3182ce');
            el.style.setProperty('--app-accent', '#3182ce');
            el.style.setProperty('--app-bg', '#ffffff');
            el.style.setProperty('--app-border', 'rgba(49, 130, 206, 0.2)');
            el.style.color = '#3182ce';
            el.style.backgroundColor = '#ffffff';
            
            // Add GSSE Watermark/Seal
            const escapeHtml = (str: string) => str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
            const seal = clonedDoc.createElement('div');
            const rawHash = selectedLead?.gsse_metadata?.logic_hash?.substring(0, 16) || 'SECURE-HASH';
            seal.innerHTML = `
              <div style="position: absolute; top: 40px; right: 40px; border: 3px solid #3182ce; color: #3182ce; padding: 15px; border-radius: 15px; transform: rotate(15deg); opacity: 0.3; font-family: sans-serif; text-align: center; pointer-events: none; z-index: 100;">
                <div style="font-size: 12px; font-weight: 900; text-transform: uppercase; letter-spacing: 3px;">GSSE VERIFIED</div>
                <div style="font-size: 8px; font-family: monospace; margin-top: 6px; font-weight: bold;">ORIGIN: LEADJIN-PROPRIETARY</div>
                <div style="font-size: 7px; font-family: monospace; margin-top: 2px;">${escapeHtml(rawHash)}</div>
              </div>
            `;
            el.appendChild(seal);
            
            // Force all children
            const all = el.getElementsByTagName('*');
            for (let i = 0; i < all.length; i++) {
              const child = all[i] as HTMLElement;
              
              // If it's using the accent color (which might be white in dark mode)
              if (child.classList.contains('text-app-accent')) {
                child.style.color = '#3182ce';
              }
              
              // If it's using the text color (which might be white in dark mode)
              if (child.classList.contains('text-app-text') || child.classList.contains('text-app-bg')) {
                // We want blue text on white bg for the PDF
                if (child.classList.contains('text-app-bg')) {
                   child.style.color = '#ffffff'; // Keep white if it was meant to be on an accent bg
                } else {
                   child.style.color = '#3182ce';
                }
              } else if (!child.style.color) {
                child.style.color = '#3182ce';
              }

              if (child.classList.contains('border-app-accent') || child.classList.contains('border-app-border') || child.classList.contains('border-b')) {
                child.style.borderColor = 'rgba(49, 130, 206, 0.2)';
                if (child.classList.contains('border-b')) child.style.borderBottomWidth = '1px';
                if (child.classList.contains('border-l-4')) child.style.borderLeftWidth = '4px';
              }

              if (child.classList.contains('glass') || child.classList.contains('bg-app-accent/5') || child.classList.contains('bg-app-accent/10')) {
                child.style.backgroundColor = 'rgba(49, 130, 206, 0.05)';
                child.style.backdropFilter = 'none';
                (child.style as any).webkitBackdropFilter = 'none';
                child.style.borderRadius = '20px';
              }

              // Ensure layout properties are preserved since we removed CSS
              if (child.classList.contains('flex')) child.style.display = 'flex';
              if (child.classList.contains('justify-between')) child.style.justifyContent = 'space-between';
              if (child.classList.contains('items-center')) child.style.alignItems = 'center';
              if (child.classList.contains('items-end')) child.style.alignItems = 'flex-end';
              if (child.classList.contains('grid')) child.style.display = 'grid';
              if (child.classList.contains('grid-cols-2')) child.style.gridTemplateColumns = '1fr 1fr';
              if (child.classList.contains('gap-12')) child.style.gap = '48px';
              if (child.classList.contains('gap-4')) child.style.gap = '16px';
              if (child.classList.contains('space-y-12')) {
                Array.from(child.children).forEach((c, idx) => {
                  if (idx > 0) (c as HTMLElement).style.marginTop = '48px';
                });
              }
              if (child.classList.contains('space-y-6')) {
                Array.from(child.children).forEach((c, idx) => {
                  if (idx > 0) (c as HTMLElement).style.marginTop = '24px';
                });
              }
              if (child.classList.contains('space-y-4')) {
                Array.from(child.children).forEach((c, idx) => {
                  if (idx > 0) (c as HTMLElement).style.marginTop = '16px';
                });
              }
              if (child.classList.contains('space-y-1')) {
                Array.from(child.children).forEach((c, idx) => {
                  if (idx > 0) (c as HTMLElement).style.marginTop = '4px';
                });
              }

              if (child.tagName === 'TABLE') {
                child.style.width = '100%';
                child.style.borderCollapse = 'collapse';
              }
              if (child.tagName === 'TH' || child.tagName === 'TD') {
                child.style.padding = '24px';
                if (child.classList.contains('text-right')) {
                  child.style.textAlign = 'right';
                } else {
                  child.style.textAlign = 'left';
                }
              }

              if (child.classList.contains('text-right')) child.style.textAlign = 'right';
              if (child.classList.contains('text-4xl')) child.style.fontSize = '36px';
              if (child.classList.contains('text-2xl')) child.style.fontSize = '24px';
              if (child.classList.contains('text-xl')) child.style.fontSize = '20px';
              if (child.classList.contains('text-sm')) child.style.fontSize = '14px';
              if (child.classList.contains('text-[10px]')) child.style.fontSize = '10px';
              if (child.classList.contains('text-[9px]')) child.style.fontSize = '9px';
              if (child.classList.contains('font-light')) child.style.fontWeight = '300';
              if (child.classList.contains('font-bold')) child.style.fontWeight = '700';
              if (child.classList.contains('font-mono')) child.style.fontFamily = 'monospace';
              if (child.classList.contains('uppercase')) child.style.textTransform = 'uppercase';
              if (child.classList.contains('tracking-widest')) child.style.letterSpacing = '0.1em';
              if (child.classList.contains('tracking-tighter')) child.style.letterSpacing = '-0.05em';
              if (child.classList.contains('pb-12')) child.style.paddingBottom = '48px';
              if (child.classList.contains('pl-6')) child.style.paddingLeft = '24px';
              if (child.classList.contains('pt-12')) child.style.paddingTop = '48px';
              if (child.classList.contains('w-64')) child.style.width = '256px';
            }
          }
        }
      });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const imgProps = pdf.getImageProperties(imgData);
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
      
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`proposal_${selectedLead?.company.toLowerCase().replace(/\s+/g, '_')}.pdf`);
    } catch (err) {
      console.error('PDF Generation failed:', err);
    }
  };

  const handleDownloadQuotation = async (q: any) => {
    if (!selectedLead) return;
    try {
      const escapeHtml = (s: string): string =>
        String(s)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');
      const items = (() => { try { return JSON.parse(q.payment_link || '{}').items || []; } catch { return []; } })();
      const notes = (() => { try { return JSON.parse(q.payment_link || '{}').notes || ''; } catch { return ''; } })();
      const total = (q.amount / 100).toLocaleString();
      const sender = companyProfile.name || 'LEADJIN Engine';
      const senderTagline = companyProfile.tagline || 'Intelligence Division';
      const htmlContent = `
        <div id="quotation-pdf" style="font-family:Inter,sans-serif;background:#fff;color:#1a1a1a;padding:60px;width:800px;box-sizing:border-box;">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #3182ce;padding-bottom:40px;margin-bottom:40px;">
            <div>
              <h1 style="font-size:32px;font-weight:300;margin:0;letter-spacing:-1px;">${escapeHtml(sender)} <span style="color:#3182ce">QUOTATION</span></h1>
              <p style="font-size:10px;letter-spacing:4px;opacity:0.4;text-transform:uppercase;margin:8px 0 0;">${escapeHtml(senderTagline)}</p>
              ${companyProfile.email ? `<p style="font-size:11px;opacity:0.6;margin:4px 0 0;">${escapeHtml(companyProfile.email)}</p>` : ''}
              ${companyProfile.phone ? `<p style="font-size:11px;opacity:0.6;margin:2px 0 0;">${escapeHtml(companyProfile.phone)}</p>` : ''}
              ${companyProfile.website ? `<p style="font-size:11px;opacity:0.6;margin:2px 0 0;">${escapeHtml(companyProfile.website)}</p>` : ''}
            </div>
            <div style="text-align:right;">
              <p style="font-size:10px;font-weight:700;opacity:0.4;text-transform:uppercase;letter-spacing:2px;margin:0;">Quotation #${escapeHtml(String(q.id))}</p>
              <p style="font-size:13px;margin:6px 0 0;">${new Date().toLocaleDateString()}</p>
              <p style="font-size:10px;opacity:0.5;margin:4px 0 0;">Status: ${escapeHtml(q.status)}</p>
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-bottom:40px;">
            <div>
              <p style="font-size:10px;font-weight:700;opacity:0.4;text-transform:uppercase;letter-spacing:2px;margin:0 0 12px;">Prepared For</p>
              <p style="font-size:18px;font-weight:300;margin:0;">${escapeHtml(selectedLead.name)}</p>
              <p style="font-size:12px;opacity:0.6;margin:4px 0 0;">${escapeHtml(selectedLead.title)}</p>
              <p style="font-size:12px;opacity:0.6;margin:2px 0 0;">${escapeHtml(selectedLead.company)}</p>
            </div>
            <div style="text-align:right;">
              <p style="font-size:10px;font-weight:700;opacity:0.4;text-transform:uppercase;letter-spacing:2px;margin:0 0 12px;">Prepared By</p>
              <p style="font-size:18px;font-weight:300;margin:0;">${escapeHtml(sender)}</p>
              <p style="font-size:12px;opacity:0.6;margin:4px 0 0;">${escapeHtml(senderTagline)}</p>
              ${companyProfile.address ? `<p style="font-size:11px;opacity:0.5;margin:4px 0 0;">${escapeHtml(companyProfile.address)}</p>` : ''}
            </div>
          </div>
          <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
            <thead>
              <tr style="background:#3182ce14;border-bottom:1px solid #3182ce33;">
                <th style="padding:14px 16px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:2px;">Service Item</th>
                <th style="padding:14px 16px;text-align:right;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:2px;">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${items.length > 0 ? items.map((item: any) => `
                <tr style="border-bottom:1px solid #eee;">
                  <td style="padding:14px 16px;font-size:13px;">${escapeHtml(item.label || item)}</td>
                  <td style="padding:14px 16px;text-align:right;font-family:monospace;font-size:13px;">SAR ${Number(item.amount || 0).toLocaleString()}</td>
                </tr>`).join('') : `
                <tr style="border-bottom:1px solid #eee;">
                  <td style="padding:14px 16px;font-size:13px;">Services</td>
                  <td style="padding:14px 16px;text-align:right;font-family:monospace;font-size:13px;">SAR ${total}</td>
                </tr>`}
              <tr style="background:#3182ce08;">
                <td style="padding:16px;font-weight:700;font-size:14px;">Total</td>
                <td style="padding:16px;text-align:right;font-weight:700;color:#3182ce;font-family:monospace;font-size:18px;">SAR ${total}</td>
              </tr>
            </tbody>
          </table>
          ${notes ? `<div style="background:#f9f9f9;padding:20px 24px;border-radius:12px;margin-bottom:32px;"><p style="font-size:10px;font-weight:700;opacity:0.4;text-transform:uppercase;margin:0 0 8px;">Notes</p><p style="font-size:12px;line-height:1.6;margin:0;">${escapeHtml(notes)}</p></div>` : ''}
          <div style="border-top:1px solid #eee;padding-top:32px;display:flex;justify-content:space-between;align-items:flex-end;">
            <div>
              <div style="width:200px;border-bottom:1px solid #ccc;padding-bottom:8px;margin-bottom:8px;"><span style="font-size:10px;opacity:0.3;font-style:italic;">Signature</span></div>
              <p style="font-size:12px;margin:0;">${escapeHtml(selectedLead.name)}</p>
              <p style="font-size:10px;opacity:0.4;text-transform:uppercase;letter-spacing:1px;margin:2px 0 0;">Authorized Signatory</p>
            </div>
            <p style="font-size:10px;opacity:0.3;font-family:monospace;">QT-${escapeHtml(String(q.id))}-${Date.now().toString(36).toUpperCase()}</p>
          </div>
        </div>`;
      const container = document.createElement('div');
      container.style.position = 'fixed';
      container.style.left = '-9999px';
      container.innerHTML = htmlContent;
      document.body.appendChild(container);
      const el = container.querySelector('#quotation-pdf') as HTMLElement;
      const canvas = await (await import('html2canvas')).default(el, { scale: 2, useCORS: true, backgroundColor: '#fff' });
      document.body.removeChild(container);
      const { jsPDF } = await import('jspdf');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const imgData = canvas.toDataURL('image/png');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`quotation_${q.id}_${selectedLead.company.toLowerCase().replace(/\s+/g, '_')}.pdf`);
    } catch (err) {
      console.error('Quotation PDF failed:', err);
    }
  };

  const handleMarkAllContacted = () => {
    const allIds = leads.map(l => l.lead_id);
    setContactedLeads(new Set([...Array.from(contactedLeads), ...allIds]));
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-app-accent font-black';
    if (score >= 60) return 'text-app-accent/80 font-bold';
    if (score >= 40) return 'text-app-accent/60';
    return 'opacity-30';
  };

  const getStatusLabel = (score: number) => {
    if (score >= 80) return { label: 'HOT', color: 'border-app-accent bg-app-accent/10 text-app-accent' };
    if (score >= 60) return { label: 'WARM', color: 'border-app-accent/60 bg-app-accent/5 text-app-accent/80' };
    if (score >= 40) return { label: 'COLD', color: 'border-app-accent/30 text-app-accent/60' };
    return { label: 'REJECT', color: 'border-app-text/10 opacity-30' };
  };

  const UpgradeModal = () => (
    <AnimatePresence>
      {showUpgradeModal && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[100] flex items-center justify-center p-6"
          onClick={() => currentUser?.subscription_status !== 'trial_expired' && setShowUpgradeModal(false)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            onClick={e => e.stopPropagation()}
            className="w-full max-w-md glass rounded-[24px] p-8 space-y-6 text-center"
          >
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 mb-2">
              <CreditCard className="text-red-400" size={28} />
            </div>
            <h2 className="text-2xl font-light tracking-tight">Your Pro Trial Has Ended</h2>
            <p className="text-sm opacity-60">
              You've used all 14 days of your free Pro trial. Upgrade to keep harvesting leads and sending outreach.
            </p>
            <div className="glass rounded-xl p-4 space-y-1">
              <p className="text-lg font-bold">LEADJIN Pro</p>
              <p className="text-2xl font-light text-app-accent">SAR 4,999<span className="text-xs opacity-40">/month</span></p>
              <p className="text-[10px] uppercase tracking-widest opacity-40">Unlimited harvests · Full CRM · AI outreach</p>
            </div>
            <a
              href="https://wa.me/966583081453?text=I'd%20like%20to%20upgrade%20to%20LEADJIN%20Pro"
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full py-4 bg-emerald-500 text-white rounded-xl font-bold text-sm uppercase tracking-widest hover:bg-emerald-400 transition-colors"
            >
              Upgrade via WhatsApp
            </a>
            {currentUser?.subscription_status !== 'trial_expired' && (
              <button
                onClick={() => setShowUpgradeModal(false)}
                className="text-xs opacity-40 hover:opacity-60 transition-opacity"
              >
                Maybe later
              </button>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <div className={`flex ${language === 'ar' ? 'font-arabic' : 'font-sans'} relative bg-app-bg text-app-text overflow-hidden ${currentUser?.subscription_status === 'trial' || currentUser?.subscription_status === 'trial_expired' ? 'h-[calc(100vh-2rem)] mt-8' : 'h-screen'}`}>
      {/* Background Elements */}
      <div className="topographic-waves" />

      {/* Onboarding Modal */}
      <AnimatePresence>
        {showOnboarding && (
          <OnboardingModal 
            language={language}
            setLanguage={setLanguage}
            darkMode={darkMode}
            setDarkMode={setDarkMode}
            onComplete={handleOnboardingComplete}
            majlisModeEnabled={majlisModeEnabled}
            setMajlisModeEnabled={setMajlisModeEnabled}
            vision2030Enabled={vision2030Enabled}
            setVision2030Enabled={setVision2030Enabled}
          />
        )}
      </AnimatePresence>

      {/* Jin AI Employee Status */}
      {authToken && (
        <JinEmployeeDashboard 
          isOpen={showJinPanel}
          onToggle={() => setShowJinPanel(!showJinPanel)}
          authToken={authToken}
        />
      )}

      {/* Trial Banner */}
      {currentUser && currentUser.subscription_status === 'trial' && (
        <div className={`fixed top-0 left-0 right-0 z-[80] text-center py-2 text-xs font-bold uppercase tracking-widest ${
          (currentUser.subscription_days_left || 0) <= 3
            ? 'bg-amber-500/90 text-black'
            : 'bg-app-accent/90 text-app-bg'
        }`}>
          {language === 'ar'
            ? `تجربة Pro — ${currentUser.subscription_days_left} ${currentUser.subscription_days_left !== 1 ? 'أيام' : 'يوم'} متبقية`
            : `Pro Trial — ${currentUser.subscription_days_left} day${currentUser.subscription_days_left !== 1 ? 's' : ''} remaining`}
        </div>
      )}
      {currentUser && currentUser.subscription_status === 'trial_expired' && (
        <div className="fixed top-0 left-0 right-0 z-[80] text-center py-2 text-xs font-bold uppercase tracking-widest bg-red-500/90 text-white">
          {language === 'ar' ? 'انتهت التجربة — قم بالترقية إلى Pro للاستمرار' : 'Trial expired — Upgrade to Pro to continue harvesting'}
        </div>
      )}
      <UpgradeModal />

      {/* Sidebar Navigation */}
      <AnimatePresence>
        {(showSidebar || window.innerWidth >= 768) && (
          <>
            {/* Mobile Backdrop */}
            {showSidebar && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowSidebar(false)}
                className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] md:hidden"
              />
            )}
            
            <motion.aside
              initial={showSidebar ? { x: language === 'ar' ? 300 : -300 } : undefined}
              animate={showSidebar ? { x: 0 } : undefined}
              exit={showSidebar ? { x: language === 'ar' ? 300 : -300 } : undefined}
              className={`fixed md:relative flex flex-col w-64 md:w-20 lg:w-64 h-full border-r border-app-border bg-app-bg/50 backdrop-blur-xl z-[70] md:z-50 shrink-0 transition-transform duration-300 ${!showSidebar && 'hidden md:flex'}`}
            >
              <div className="p-6 flex items-center justify-between lg:justify-start">
                <div className="w-10 h-10 bg-app-accent text-app-bg rounded-full flex items-center justify-center shadow-lg relative">
                  <Zap size={20} fill="currentColor" />
                  {gmailConnected && (
                    <div className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-500 rounded-full border-2 border-app-bg shadow-[0_0_10px_rgba(16,185,129,0.5)]" />
                  )}
                </div>
                <button onClick={() => setShowSidebar(false)} className="md:hidden w-10 h-10 glass rounded-full flex items-center justify-center">
                  <X size={20} />
                </button>
              </div>

              <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto custom-scrollbar">
                <p className="px-4 text-[10px] font-bold uppercase tracking-[0.3em] opacity-20 mb-4 hidden lg:block">{language === 'ar' ? 'القائمة الرئيسية' : 'Main Menu'}</p>
                <button 
                  onClick={() => {
                    setCurrentView('harvest');
                    setSelectedLead(null);
                    setShowSidebar(false);
                  }}
                  className={`w-full flex items-center justify-start md:justify-center lg:justify-start gap-4 p-4 rounded-2xl transition-all ${currentView === 'harvest' ? 'bg-app-accent text-app-bg shadow-lg shadow-app-accent/20' : 'opacity-40 hover:opacity-100 hover:bg-app-accent/5'}`}
                >
                  <Search size={20} className="shrink-0" />
                  <span className="md:hidden lg:block text-xs font-bold uppercase tracking-widest text-left">{t.harvest}</span>
                </button>
                <button 
                  onClick={() => {
                    setCurrentView('crm');
                    setSelectedLead(null);
                    setShowSidebar(false);
                  }}
                  className={`w-full flex items-center justify-start md:justify-center lg:justify-start gap-4 p-4 rounded-2xl transition-all ${currentView === 'crm' ? 'bg-app-accent text-app-bg shadow-lg shadow-app-accent/20' : 'opacity-40 hover:opacity-100 hover:bg-app-accent/5'}`}
                >
                  <Database size={20} className="shrink-0" />
                  <span className="md:hidden lg:block text-xs font-bold uppercase tracking-widest text-left">{t.pipeline}</span>
                </button>
                <button 
                  onClick={() => {
                    setCurrentView('analytics');
                    setSelectedLead(null);
                    setShowSidebar(false);
                  }}
                  className={`w-full flex items-center justify-start md:justify-center lg:justify-start gap-4 p-4 rounded-2xl transition-all ${currentView === 'analytics' ? 'bg-app-accent text-app-bg shadow-lg shadow-app-accent/20' : 'opacity-40 hover:opacity-100 hover:bg-app-accent/5'}`}
                >
                  <BarChart3 size={20} className="shrink-0" />
                  <span className="md:hidden lg:block text-xs font-bold uppercase tracking-widest text-left">{t.analytics}</span>
                </button>

                <div className="pt-10 space-y-2">
                  <p className="px-4 text-[10px] font-bold uppercase tracking-[0.3em] opacity-20 mb-4 hidden lg:block">{language === 'ar' ? 'الذكاء الاصطناعي' : 'Intelligence'}</p>
                  <button
                    onClick={() => setMajlisModeEnabled(!majlisModeEnabled)}
                    className={`w-full flex items-center justify-start md:justify-center lg:justify-start gap-4 p-4 rounded-2xl transition-all ${majlisModeEnabled ? 'text-app-accent bg-app-accent/5' : 'opacity-40 hover:opacity-100'}`}
                  >
                    <Globe size={20} className="shrink-0" />
                    <span className="md:hidden lg:block text-xs font-bold uppercase tracking-widest text-left rtl:text-right">{language === 'ar' ? 'وضع المجلس' : 'Majlis Mode'}</span>
                  </button>
                  <button
                    onClick={() => setVision2030Enabled(!vision2030Enabled)}
                    className={`w-full flex items-center justify-start md:justify-center lg:justify-start gap-4 p-4 rounded-2xl transition-all ${vision2030Enabled ? 'text-emerald-500 bg-emerald-500/5' : 'opacity-40 hover:opacity-100'}`}
                  >
                    <ShieldCheck size={20} className="shrink-0" />
                    <span className="md:hidden lg:block text-xs font-bold uppercase tracking-widest text-left rtl:text-right">{language === 'ar' ? 'رؤية 2030' : 'Vision 2030'}</span>
                  </button>
                </div>
              </nav>

              <div className="p-4 space-y-2 border-t border-app-border/10">
                <button 
                  onClick={() => {
                    setCurrentView('settings');
                    setSelectedLead(null);
                    setShowSidebar(false);
                  }}
                  className={`w-full flex items-center justify-start md:justify-center lg:justify-start gap-4 p-4 rounded-2xl transition-all ${currentView === 'settings' ? 'bg-app-accent text-app-bg shadow-lg shadow-app-accent/20' : 'opacity-40 hover:opacity-100 hover:bg-app-accent/5'}`}
                >
                  <Settings size={20} className="shrink-0" />
                  <span className="md:hidden lg:block text-xs font-bold uppercase tracking-widest text-left">{t.settingsTitle}</span>
                </button>
                <button 
                  onClick={() => setDarkMode(!darkMode)}
                  className="w-full flex items-center justify-start md:justify-center lg:justify-start gap-4 p-4 rounded-2xl opacity-40 hover:opacity-100 hover:bg-app-accent/5 transition-all"
                >
                  {darkMode ? <Sun size={20} className="shrink-0" /> : <Moon size={20} className="shrink-0" />}
                  <span className="md:hidden lg:block text-xs font-bold uppercase tracking-widest text-left rtl:text-right">{language === 'ar' ? (darkMode ? 'الوضع الفاتح' : 'الوضع الداكن') : (darkMode ? 'Light Mode' : 'Dark Mode')}</span>
                </button>
                <div className="pt-4">
                  <button 
                    className="w-full flex items-center justify-start md:justify-center lg:justify-start gap-4 p-4 rounded-2xl bg-app-accent/5 text-app-accent hover:bg-app-accent/10 transition-all border border-app-accent/10"
                  >
                    <div className="w-6 h-6 rounded-full bg-app-accent text-app-bg flex items-center justify-center text-[10px] font-bold shrink-0">
                      {gmailName ? gmailName.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2) : gmailEmail ? gmailEmail[0].toUpperCase() : '?'}
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="md:hidden lg:block text-[10px] font-bold uppercase tracking-widest text-left rtl:text-right truncate">{gmailName || gmailEmail || (language === 'ar' ? 'غير متصل' : 'Not Connected')}</span>
                      {gmailConnected && (
                        <span className="md:hidden lg:block text-[8px] font-bold uppercase tracking-widest text-emerald-500 text-left rtl:text-right">{language === 'ar' ? 'Gmail نشط' : 'Gmail Active'}</span>
                      )}
                    </div>
                  </button>
                </div>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <div className="flex-1 flex flex-col min-w-0 relative h-full overflow-hidden">
        {/* Header */}
        <header className="h-14 md:h-20 border-b border-app-border bg-app-bg/50 backdrop-blur-xl flex items-center justify-between px-3 md:px-10 shrink-0 relative z-40">
          <div className="flex items-center gap-3 md:gap-10">
            <button 
              onClick={() => setShowSidebar(true)}
              className="md:hidden w-10 h-10 glass rounded-full flex items-center justify-center"
            >
              <Menu size={20} />
            </button>
            <h1 className="leadjin-logo text-sm md:text-2xl tracking-[0.2em] md:tracking-[0.4em]">LEADJIN</h1>
          </div>
          
          <div className="flex gap-2 md:gap-3 items-center">
            {majlisModeEnabled && (
              <div className="hidden md:flex items-center gap-2 px-3 py-1.5 glass rounded-full border border-emerald-500/20">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[8px] font-bold uppercase tracking-widest text-emerald-500">{language === 'ar' ? 'وضع المجلس نشط' : 'Majlis Mode Active'}</span>
              </div>
            )}
            {vision2030Enabled && (
              <div className="hidden md:flex items-center gap-2 px-3 py-1.5 glass rounded-full border border-blue-500/20">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                <span className="text-[8px] font-bold uppercase tracking-widest text-blue-500">{language === 'ar' ? 'محرك رؤية 2030 نشط' : 'V2030 Engine Live'}</span>
              </div>
            )}
            {leads.length > 0 && currentView === 'harvest' && !showConfig && (
              <button
                onClick={() => setShowConfig(true)}
                className="px-4 py-2 glass rounded-full text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 hover:bg-app-accent hover:text-app-bg transition-all"
              >
                <Filter size={12} />
                {t.refine}
              </button>
            )}
            {/* Language Toggle Button */}
            <button
              onClick={() => setLanguage(language === 'en' ? 'ar' : 'en')}
              className="lang-toggle-btn flex items-center gap-1.5 px-3 py-1.5 glass rounded-full border border-app-border text-[10px] font-bold uppercase tracking-widest hover:bg-app-accent hover:text-app-bg transition-all shrink-0"
              title={language === 'en' ? 'Switch to Arabic' : 'التبديل إلى الإنجليزية'}
              aria-label={language === 'en' ? 'Switch to Arabic' : 'Switch to English'}
            >
              <Globe size={12} className="shrink-0" />
              <span className="leading-none">{(t as any).langToggle || (language === 'en' ? 'AR' : 'EN')}</span>
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto overflow-x-hidden relative custom-scrollbar">
          <div className="max-w-[1600px] mx-auto w-full">
            {currentView === 'harvest' && (
              <div className="flex-1 flex flex-col">
                {showConfig ? (
                  <div className="flex-1 p-6 md:p-20 flex flex-col items-center">
                  <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="w-full max-w-2xl space-y-12"
                  >
                    <div className="space-y-4 text-center md:text-left rtl:md:text-right">
                      <h2 className="text-3xl md:text-6xl font-light tracking-tight">{t.configure}</h2>
                      <p className="text-[10px] md:text-xs uppercase tracking-[0.4em] opacity-40">{t.icp}</p>
                    </div>

                    <form onSubmit={handleGenerate} className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
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

                      <div className="flex flex-col gap-3">
                        <label className="text-[10px] font-bold uppercase tracking-widest opacity-40">{t.companySize}</label>
                        <input 
                          type="text" 
                          value={companySize}
                          onChange={(e) => setCompanySize(e.target.value)}
                          placeholder="e.g. 10-50, 50-200"
                          className="w-full glass rounded-2xl p-5 text-sm focus:border-app-accent outline-none transition-all"
                        />
                      </div>

                      <div className="flex flex-col gap-3">
                        <label className="text-[10px] font-bold uppercase tracking-widest opacity-40">{t.geography}</label>
                        <input 
                          type="text" 
                          value={geography}
                          onChange={(e) => setGeography(e.target.value)}
                          placeholder="e.g. Saudi Arabia, UAE, US"
                          className="w-full glass rounded-2xl p-5 text-sm focus:border-app-accent outline-none transition-all"
                        />
                      </div>

                      <div className="flex flex-col gap-3">
                        <label className="text-[10px] font-bold uppercase tracking-widest opacity-40">{t.jobTitles}</label>
                        <input 
                          type="text" 
                          value={jobTitles}
                          onChange={(e) => setJobTitles(e.target.value)}
                          placeholder="e.g. Founder, CEO, Managing Partner"
                          className="w-full glass rounded-2xl p-5 text-sm focus:border-app-accent outline-none transition-all"
                        />
                      </div>

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

                      <div className="md:col-span-2 flex flex-col gap-4 mt-4">
                        <label className="text-[10px] font-bold uppercase tracking-widest opacity-40">{t.model}</label>
                        <div className="grid grid-cols-3 gap-3">
                          {[
                            { id: 'gemini-flash-lite-latest', label: 'Rapid', desc: '~5s Harvest' },
                            { id: 'gemini-2.5-flash', label: 'Flash', desc: '~25s Deep Scan' },
                            { id: 'gemini-2.5-pro-preview', label: 'Pro 2.5', desc: 'Max Intelligence' }
                          ].map((m) => (
                            <button
                              key={m.id}
                              type="button"
                              onClick={() => setModel(m.id as any)}
                              className={`p-4 text-left border rounded-2xl transition-all ${model === m.id ? 'bg-app-accent text-app-bg border-app-accent shadow-xl' : 'glass opacity-60 hover:opacity-100'}`}
                            >
                              <p className="text-xs font-bold uppercase tracking-widest">{m.label}</p>
                              <p className="text-[8px] opacity-60 mt-1">{m.desc}</p>
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="md:col-span-2 pt-6">
                        <button 
                          disabled={loading}
                          className="btn-primary w-full justify-center py-6 rounded-3xl uppercase tracking-[0.3em] text-sm font-bold shadow-2xl hover:scale-[1.02] active:scale-[0.98]"
                        >
                          {loading ? (
                            <div className="flex items-center gap-4">
                              <Loader2 className="animate-spin" size={20} />
                              <span className="animate-pulse">{loadingStatus}</span>
                            </div>
                          ) : t.harvestBtn}
                        </button>
                        {leads.length > 0 && (
                          <button 
                            type="button"
                            onClick={() => setShowConfig(false)}
                            className="w-full mt-4 py-4 text-[10px] font-bold uppercase tracking-widest opacity-40 hover:opacity-100 transition-opacity"
                          >
                            {t.return}
                          </button>
                        )}
                      </div>
                    </form>

                    {/* CSV Bulk Upload Section */}
                    <div className="mt-10 space-y-4">
                      <div className="flex items-center gap-3 border-t border-app-border/30 pt-8">
                        <UploadCloud size={16} className="opacity-40" />
                        <h3 className="text-xl font-light">Or Import via CSV</h3>
                      </div>

                      {/* Step: idle / file selected */}
                      {(csvStep === 'idle') && (
                        <div className="space-y-4">
                          <div
                            onDragOver={(e) => { e.preventDefault(); setCsvDragging(true); }}
                            onDragLeave={() => setCsvDragging(false)}
                            onDrop={(e) => {
                              e.preventDefault();
                              setCsvDragging(false);
                              const file = e.dataTransfer.files[0];
                              if (file) handleCsvFileSelect(file);
                            }}
                            onClick={() => csvFileInputRef.current?.click()}
                            className={`relative flex flex-col items-center justify-center gap-3 p-10 rounded-3xl border-2 border-dashed transition-all cursor-pointer
                              ${csvDragging ? 'border-app-accent bg-app-accent/10 scale-[1.01]' : 'border-app-border/30 hover:border-app-accent/50 hover:bg-app-accent/5'}`}
                          >
                            <UploadCloud size={28} className={`transition-colors ${csvDragging ? 'text-app-accent' : 'opacity-30'}`} />
                            <p className="text-sm opacity-60">Drag & drop a .csv or .xlsx file here</p>
                            <span className="text-[10px] font-bold uppercase tracking-widest opacity-30">or click to browse</span>
                            <input
                              ref={csvFileInputRef}
                              type="file"
                              accept=".csv,.xlsx"
                              className="hidden"
                              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleCsvFileSelect(f); }}
                            />
                          </div>
                          {csvFile && (
                            <div className="flex items-center justify-between glass rounded-2xl px-5 py-4">
                              <div className="flex items-center gap-3">
                                <FileCheck2 size={16} className="text-app-accent" />
                                <div>
                                  <p className="text-sm font-medium">{csvFile.name}</p>
                                  <p className="text-[10px] opacity-40">{(csvFile.size / 1024).toFixed(1)} KB</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-3">
                                <button
                                  onClick={handleCsvReset}
                                  className="text-[10px] opacity-40 hover:opacity-100 transition-opacity uppercase tracking-widest"
                                >
                                  Clear
                                </button>
                                <button
                                  onClick={handleCsvUpload}
                                  className="px-5 py-2 bg-app-accent text-app-bg rounded-2xl text-[11px] font-bold uppercase tracking-widest hover:opacity-90 transition-opacity flex items-center gap-2"
                                >
                                  <UploadCloud size={13} />
                                  Upload
                                </button>
                              </div>
                            </div>
                          )}
                          {csvError && (
                            <p className="text-[11px] text-red-500 font-medium px-2">{csvError}</p>
                          )}
                        </div>
                      )}

                      {/* Step: uploading */}
                      {csvStep === 'uploading' && (
                        <div className="flex items-center gap-4 glass rounded-2xl px-6 py-5">
                          <Loader2 size={18} className="animate-spin text-app-accent" />
                          <span className="text-sm opacity-60 animate-pulse">Parsing file and detecting columns...</span>
                        </div>
                      )}

                      {/* Step: preview */}
                      {csvStep === 'preview' && csvParsed && csvColumns && (
                        <div className="space-y-5">
                          {/* Stats bar */}
                          <div className="flex flex-wrap gap-4">
                            <div className="glass rounded-2xl px-5 py-3 flex items-center gap-3">
                              <Database size={14} className="text-app-accent" />
                              <div>
                                <p className="text-[10px] opacity-40 uppercase tracking-widest">Total Rows</p>
                                <p className="text-lg font-light">{csvParsed.total}</p>
                              </div>
                            </div>
                            <div className="glass rounded-2xl px-5 py-3 flex items-center gap-3">
                              <FileCheck2 size={14} className="text-app-accent" />
                              <div>
                                <p className="text-[10px] opacity-40 uppercase tracking-widest">Columns Detected</p>
                                <p className="text-lg font-light">{Object.keys(csvColumns.detected).length}</p>
                              </div>
                            </div>
                          </div>

                          {/* Column mapping */}
                          {Object.keys(csvColumns.detected).length > 0 && (
                            <div className="glass rounded-2xl p-5 space-y-3">
                              <p className="text-[10px] font-bold uppercase tracking-widest opacity-40">Auto-Detected Column Mapping</p>
                              <div className="grid grid-cols-2 gap-2">
                                {Object.entries(csvColumns.detected).map(([field, col]) => (
                                  <div key={field} className="flex items-center gap-2 text-xs">
                                    <span className="opacity-40 w-24 shrink-0 truncate">{field}</span>
                                    <ChevronRight size={10} className="opacity-20 shrink-0" />
                                    <span className="font-medium truncate">{col as string}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Preview table */}
                          {csvParsed.sample.length > 0 && (
                            <div className="glass rounded-2xl overflow-hidden">
                              <p className="text-[10px] font-bold uppercase tracking-widest opacity-40 px-5 pt-4 pb-2">Preview (first {csvParsed.sample.length} rows)</p>
                              <div className="overflow-x-auto custom-scrollbar">
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="border-b border-app-border/10">
                                      {Object.keys(csvParsed.sample[0]).slice(0, 6).map((col) => (
                                        <th key={col} className="px-4 py-2 text-left text-[9px] font-bold uppercase tracking-widest opacity-30 whitespace-nowrap">{col}</th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {csvParsed.sample.map((row: any, i: number) => (
                                      <tr key={i} className="border-b border-app-border/5 hover:bg-app-accent/5 transition-colors">
                                        {Object.keys(csvParsed.sample[0]).slice(0, 6).map((col) => (
                                          <td key={col} className="px-4 py-2.5 opacity-70 whitespace-nowrap max-w-[160px] truncate">{String(row[col] ?? '')}</td>
                                        ))}
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}

                          {/* Enrich toggle + import */}
                          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                            <label className="flex items-center gap-3 cursor-pointer select-none">
                              <div
                                onClick={() => setCsvEnrich(!csvEnrich)}
                                className={`w-10 h-5 rounded-full transition-colors relative ${csvEnrich ? 'bg-app-accent' : 'bg-app-border/30'}`}
                              >
                                <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${csvEnrich ? 'translate-x-5' : 'translate-x-0.5'}`} />
                              </div>
                              <div>
                                <p className="text-sm font-medium">Enrich missing emails</p>
                                <p className="text-[10px] opacity-40">AI will attempt to find missing contact info</p>
                              </div>
                            </label>
                            <div className="flex items-center gap-3 shrink-0">
                              <button
                                onClick={handleCsvReset}
                                className="px-4 py-2.5 glass rounded-2xl text-[11px] font-bold uppercase tracking-widest opacity-40 hover:opacity-100 transition-opacity"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={handleCsvConfirm}
                                className="px-6 py-2.5 bg-app-accent text-app-bg rounded-2xl text-[11px] font-bold uppercase tracking-widest hover:opacity-90 transition-opacity flex items-center gap-2"
                              >
                                <Zap size={13} />
                                Import {csvParsed.total} Leads
                              </button>
                            </div>
                          </div>
                          {csvError && (
                            <p className="text-[11px] text-red-500 font-medium px-2">{csvError}</p>
                          )}
                        </div>
                      )}

                      {/* Step: importing */}
                      {csvStep === 'importing' && (
                        <div className="flex items-center gap-4 glass rounded-2xl px-6 py-5">
                          <Loader2 size={18} className="animate-spin text-app-accent" />
                          <span className="text-sm opacity-60 animate-pulse">Importing leads{csvEnrich ? ' and enriching contacts' : ''}...</span>
                        </div>
                      )}

                      {/* Step: done */}
                      {csvStep === 'done' && csvResult && (
                        <div className="glass rounded-2xl p-6 space-y-5">
                          <div className="flex items-center gap-3">
                            <CheckCircle2 size={20} className="text-emerald-500" />
                            <p className="text-base font-medium">Import Complete</p>
                          </div>
                          <div className="grid grid-cols-3 gap-4">
                            <div className="text-center space-y-1">
                              <p className="text-3xl font-light text-emerald-500">{csvResult.imported}</p>
                              <p className="text-[9px] uppercase tracking-widest opacity-40">Imported</p>
                            </div>
                            <div className="text-center space-y-1">
                              <p className="text-3xl font-light text-app-accent">{csvResult.enriched}</p>
                              <p className="text-[9px] uppercase tracking-widest opacity-40">Enriched</p>
                            </div>
                            <div className="text-center space-y-1">
                              <p className="text-3xl font-light opacity-40">{csvResult.failed}</p>
                              <p className="text-[9px] uppercase tracking-widest opacity-40">Failed</p>
                            </div>
                          </div>
                          <button
                            onClick={handleCsvReset}
                            className="w-full py-3 glass rounded-2xl text-[11px] font-bold uppercase tracking-widest opacity-60 hover:opacity-100 transition-opacity"
                          >
                            Done
                          </button>
                        </div>
                      )}
                    </div>
                  </motion.div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col">
                  {/* Results Area Header */}
                  <div className="grid grid-cols-[50px_1fr_70px] md:grid-cols-[100px_1fr_1fr_120px] border-b border-app-border glass items-center shrink-0 sticky top-0 z-10">
                    <div className="p-3 md:p-6 text-[10px] font-bold uppercase tracking-widest opacity-40 text-center">Score</div>
                    <div className="p-3 md:p-6 text-[10px] font-bold uppercase tracking-widest opacity-40">Lead</div>
                    <div className="hidden md:block p-6 text-[10px] font-bold uppercase tracking-widest opacity-40">Company</div>
                    <div className="p-3 md:p-6 flex items-center justify-center gap-2 md:gap-4">
                      {searchDuration && leads.length > 0 && (
                        <div className="flex items-center gap-1 md:gap-1.5 px-2 md:px-3 py-1 glass rounded-full opacity-60">
                          <Clock size={10} className="text-app-accent" />
                          <span className="text-[8px] md:text-[9px] font-mono uppercase tracking-tighter">
                            {searchDuration.toFixed(1)}s
                          </span>
                        </div>
                      )}
                      {leads.length > 0 && (
                        <button 
                          onClick={handleMarkAllContacted}
                          className="text-[9px] font-bold uppercase tracking-widest opacity-40 hover:opacity-100 transition-opacity flex items-center gap-2"
                        >
                          <CheckCircle2 size={12} />
                          <span className="hidden sm:inline">Mark All</span>
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="flex-1 pb-24 md:pb-0 px-4 md:px-10">
                    {loading ? (
                      <div className="flex flex-col">
                        {[...Array(limit)].map((_, i) => (
                          <div key={i} className="md:hidden">
                            <div className="lead-card-mobile animate-pulse h-24 bg-app-accent/5" />
                          </div>
                        ))}
                        <div className="hidden md:block">
                          {[...Array(limit)].map((_, i) => (
                            <LeadSkeleton key={i} />
                          ))}
                        </div>
                      </div>
                    ) : errorMessage ? (
                      <div className="flex flex-col items-center justify-center p-12 md:p-24 text-center">
                        <div className="p-6 glass rounded-3xl border-red-500/30 bg-red-500/5 max-w-md">
                          <p className="text-red-500 font-bold uppercase tracking-widest text-xs mb-2">Error</p>
                          <p className="text-sm opacity-80">{errorMessage}</p>
                          <button 
                            onClick={() => setShowConfig(true)}
                            className="mt-6 px-6 py-3 glass rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-app-accent hover:text-app-bg transition-all"
                          >
                            Adjust Parameters
                          </button>
                        </div>
                      </div>
                    ) : leads.length > 0 ? (
                      <div className="md:divide-y md:divide-app-border py-4 md:py-0">
                        {leads.map((lead, idx) => {
                          const status = getStatusLabel(lead.lead_score);
                          return (
                            <React.Fragment key={lead.lead_id}>
                              {/* Mobile Card */}
                              <div className="md:hidden">
                                <MobileLeadCard 
                                  lead={lead}
                                  contactedLeads={contactedLeads}
                                  toggleContacted={toggleContacted}
                                  setSelectedLead={setSelectedLead}
                                  getScoreColor={getScoreColor}
                                  getStatusLabel={getStatusLabel}
                                />
                              </div>
                              
                              {/* Desktop Row */}
                              <motion.div 
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                whileHover={{ x: language === 'ar' ? -10 : 10 }}
                                transition={{ delay: idx * 0.05 }}
                                onClick={() => setSelectedLead(lead)}
                                className={`hidden md:grid grid-cols-[120px_1fr_1fr_150px] cursor-pointer hover:bg-app-accent/5 transition-all duration-300 group relative border-b border-app-border/5 ${selectedLead?.lead_id === lead.lead_id ? 'bg-app-accent/10' : ''} ${contactedLeads.has(lead.lead_id) ? 'opacity-40 grayscale-[0.5]' : ''}`}
                              >
                                <div className={`p-8 flex items-center justify-center text-4xl font-light italic ${getScoreColor(lead.lead_score)}`}>
                                  {lead.lead_score}
                                </div>
                                <div className="p-8 flex flex-col justify-center overflow-hidden">
                                  <div className="flex items-center gap-3">
                                    <span className="text-xl font-medium truncate tracking-tight">{lead.name}</span>
                                    {lead.vision_2030_alignment && lead.vision_2030_alignment.score > 70 && (
                                      <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-500 text-[8px] font-bold uppercase tracking-widest rounded border border-emerald-500/20 shrink-0">
                                        Vision 2030
                                      </span>
                                    )}
                                    {contactedLeads.has(lead.lead_id) && <CheckCircle2 size={16} className="text-app-accent shrink-0" />}
                                  </div>
                                  <span className="text-[10px] opacity-50 uppercase tracking-[0.3em] truncate mt-1">{lead.title}</span>
                                </div>
                                <div className="p-8 flex flex-col justify-center">
                                  <span className="text-base font-light opacity-80">{lead.company}</span>
                                  <div className="flex gap-4 mt-3 opacity-30 group-hover:opacity-60 transition-opacity">
                                    {lead.email && <Mail size={16} />}
                                    {lead.linkedin && <Linkedin size={16} />}
                                    {lead.twitter && <Twitter size={16} />}
                                    {lead.website && <Globe size={16} />}
                                  </div>
                                </div>
                                <div className="p-8 flex items-center justify-center gap-4">
                                  <span className={`text-[10px] font-bold px-5 py-1.5 rounded-full border tracking-widest uppercase ${status.color}`}>
                                    {status.label}
                                  </span>
                                  <button
                                    onClick={(e) => toggleContacted(e, lead.lead_id)}
                                    className={`w-10 h-10 rounded-full flex items-center justify-center transition-all shadow-lg ${contactedLeads.has(lead.lead_id) ? 'bg-app-accent text-app-bg' : 'glass opacity-0 group-hover:opacity-100 hover:scale-110'}`}
                                    title={contactedLeads.has(lead.lead_id) ? "Mark as Uncontacted" : "Mark as Contacted"}
                                  >
                                    <CheckCircle2 size={18} />
                                  </button>
                                </div>
                              </motion.div>
                            </React.Fragment>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center p-8 text-center opacity-10 relative overflow-hidden">
                        <div className="absolute inset-0 topographic-waves opacity-20" />
                        <Zap size={48} className="mb-4 animate-bounce duration-[3000ms]" />
                        <p className="text-xs uppercase tracking-[0.5em]">Ready to Harvest</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {currentView === 'crm' && (
            <div className="flex-1 flex flex-col overflow-hidden pb-24 md:pb-0">
              {/* Pipeline Toolbar */}
              <div className="p-5 md:p-8 border-b border-app-border bg-app-bg/50 backdrop-blur-md space-y-6">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <div>
                    <h2 className="text-xl md:text-3xl font-light tracking-tight">{t.pipelineTitle}</h2>
                    <p className="text-[10px] font-mono uppercase tracking-widest opacity-40">{t.pipelineSub}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                    <div className="relative flex-1 md:w-64">
                      <Search className="absolute left-4 rtl:left-auto rtl:right-4 top-1/2 -translate-y-1/2 opacity-20" size={14} />
                      <input
                        type="text"
                        placeholder={language === 'ar' ? 'بحث عن عميل...' : 'Search leads...'}
                        value={pipelineSearch}
                        onChange={(e) => setPipelineSearch(e.target.value)}
                        className="w-full glass rounded-full py-3 pl-10 rtl:pl-4 rtl:pr-10 pr-4 text-xs outline-none focus:border-app-accent transition-all"
                      />
                    </div>
                    <div className="flex glass rounded-full p-1">
                      {(['all', 'hot', 'warm', 'cold'] as const).map(f => (
                        <button
                          key={f}
                          onClick={() => setPipelineFilter(f)}
                          className={`px-4 py-2 rounded-full text-[9px] font-bold uppercase tracking-widest transition-all ${pipelineFilter === f ? 'bg-app-accent text-app-bg shadow-lg' : 'opacity-40 hover:opacity-100'}`}
                        >
                          {language === 'ar'
                            ? f === 'all' ? 'الكل' : f === 'hot' ? 'ساخن' : f === 'warm' ? 'دافئ' : 'بارد'
                            : f}
                        </button>
                      ))}
                    </div>
                    <button 
                      onClick={fetchCRMLeads}
                      className="w-10 h-10 md:w-12 md:h-12 glass rounded-full flex items-center justify-center hover:rotate-180 transition-transform duration-500 shrink-0"
                    >
                      <History size={18} />
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-8 overflow-x-auto no-scrollbar pb-2">
                  {[
                    { label: 'Total Value', value: `SAR ${crmLeads.reduce((acc, l) => acc + (l.value || 0), 0).toLocaleString()}`, icon: DollarSign },
                    { label: 'Avg. Score', value: `${Math.round(crmLeads.reduce((acc, l) => acc + (l.lead_score || 0), 0) / (crmLeads.length || 1))}%`, icon: TrendingUp },
                    { label: 'Active Leads', value: crmLeads.length, icon: Users }
                  ].map((stat, i) => (
                    <div key={i} className="flex items-center gap-3 shrink-0">
                      <div className="w-8 h-8 rounded-xl bg-app-accent/10 flex items-center justify-center text-app-accent">
                        <stat.icon size={14} />
                      </div>
                      <div>
                        <p className="text-[8px] font-bold uppercase tracking-widest opacity-40">{stat.label}</p>
                        <p className="text-sm font-medium">{stat.value}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              
              <div className="flex-1 overflow-x-auto p-5 md:p-8 no-scrollbar bg-app-accent/[0.02]">
                <DndContext 
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                >
                  <div className="flex gap-6 md:gap-10 min-w-max h-full">
                    {['NEW', 'CONTACTED', 'REPLIED', 'MEETING', 'PROPOSAL', 'CLOSED'].map(stage => {
                      const filteredLeads = crmLeads.filter(l => {
                        const matchesStage = l.status === stage;
                        const matchesSearch = l.name.toLowerCase().includes(pipelineSearch.toLowerCase()) || l.company.toLowerCase().includes(pipelineSearch.toLowerCase());
                        const matchesFilter = pipelineFilter === 'all' || 
                          (pipelineFilter === 'hot' && l.lead_score >= 90) ||
                          (pipelineFilter === 'warm' && l.lead_score >= 80 && l.lead_score < 90) ||
                          (pipelineFilter === 'cold' && l.lead_score < 80);
                        return matchesStage && matchesSearch && matchesFilter;
                      });

                      const metrics = {
                        value: filteredLeads.reduce((acc, l) => acc + (l.value || 0), 0),
                        probability: stage === 'CLOSED' ? 100 : stage === 'PROPOSAL' ? 80 : stage === 'MEETING' ? 60 : stage === 'REPLIED' ? 40 : stage === 'CONTACTED' ? 20 : 10
                      };

                      return (
                        <PipelineColumn 
                          key={stage}
                          id={stage}
                          title={(t.stages as any)[stage]}
                          leads={filteredLeads}
                          language={language}
                          metrics={metrics}
                          t={t}
                        />
                      );
                    })}
                  </div>

                  <DragOverlay dropAnimation={{
                    sideEffects: defaultDropAnimationSideEffects({
                      styles: {
                        active: {
                          opacity: '0.5',
                        },
                      },
                    }),
                  }}>
                    {activeDragId ? (() => {
                      const dragLead = crmLeads.find(l => l.lead_id === activeDragId);
                      if (!dragLead) return null;
                      const priority = dragLead.lead_score > 90 ? 'High' : dragLead.lead_score > 80 ? 'Medium' : 'Low';
                      const priorityColor = priority === 'High' ? 'text-red-500 bg-red-500/10' : priority === 'Medium' ? 'text-orange-500 bg-orange-500/10' : 'text-blue-500 bg-blue-500/10';
                      return (
                        <div className="w-72 md:w-80 opacity-80 scale-105 rotate-2 pointer-events-none">
                          <div className="glass p-4 rounded-2xl space-y-3 text-xs border-l-2 rtl:border-l-0 rtl:border-r-2 border-app-accent/30">
                            <div className="flex justify-between items-start gap-2">
                              <div className="flex-1 min-w-0">
                                <p className="font-bold truncate text-sm tracking-tight">{dragLead.name}</p>
                                <p className="opacity-60 truncate mt-0.5">{dragLead.company}</p>
                              </div>
                              <span className="text-[10px] font-mono opacity-40 shrink-0 bg-app-accent/5 px-2 py-0.5 rounded-md">
                                {dragLead.lead_score}%
                              </span>
                            </div>
                            <span className={`inline-block px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-widest ${priorityColor}`}>
                              {priority}
                            </span>
                          </div>
                        </div>
                      );
                    })() : null}
                  </DragOverlay>
                </DndContext>
              </div>
            </div>
          )}

        {currentView === 'analytics' && (analyticsData?.summary ? (
          <div className="flex-1 flex flex-col p-6 md:p-10 space-y-6 md:space-y-10 pb-24 md:pb-10">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <h2 className="text-xl md:text-2xl font-light">{t.analyticsTitle}</h2>
                <p className="text-[10px] font-mono uppercase tracking-widest opacity-40">{t.analyticsSub}</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex glass rounded-full p-1">
                  {(['7','30','90','all'] as const).map(r => (
                    <button
                      key={r}
                      onClick={() => { setAnalyticsDateRange(r); fetchAnalytics(r); }}
                      className={`px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all ${analyticsDateRange === r ? 'bg-app-accent text-app-bg' : 'opacity-40 hover:opacity-100'}`}
                    >
                      {r === 'all' ? 'All' : `${r}d`}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => fetchAnalytics(analyticsDateRange)}
                  className="w-10 h-10 md:w-12 md:h-12 glass rounded-full flex items-center justify-center hover:rotate-180 transition-transform duration-500"
                >
                  <History size={18} />
                </button>
              </div>
            </div>

            {/* Summary Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
              {[
                { label: t.totalLeads, value: analyticsData?.summary?.totalLeads || 0, icon: Users },
                { label: t.contacted, value: analyticsData?.summary?.contactedLeads || 0, icon: Send },
                { label: t.revenue, value: analyticsData.summary?.revenueByCurrency?.length ? analyticsData.summary.revenueByCurrency.map((r: any) => `${r.currency} ${r.amount.toLocaleString()}`).join(' · ') : '—', icon: CreditCard },
                { label: t.pending, value: analyticsData.summary?.pendingByCurrency?.length ? analyticsData.summary.pendingByCurrency.map((r: any) => `${r.currency} ${r.amount.toLocaleString()}`).join(' · ') : '—', icon: Clock },
              ].map((stat, i) => (
                <motion.div 
                  key={i}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.1 }}
                  className="glass p-4 md:p-6 rounded-2xl md:rounded-3xl space-y-1 md:space-y-2 border-l-2 rtl:border-l-0 rtl:border-r-2 border-app-accent"
                >
                  <div className="flex items-center gap-2 opacity-40">
                    <stat.icon size={10} />
                    <p className="text-[8px] md:text-[9px] font-bold uppercase tracking-widest truncate">{stat.label}</p>
                  </div>
                  <p className="text-lg md:text-2xl font-light truncate">{stat.value}</p>
                </motion.div>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Funnel Chart */}
              <div className="glass p-8 rounded-[40px] space-y-6 border border-app-border">
                <h3 className="text-[10px] font-bold uppercase tracking-widest opacity-40">{t.funnel}</h3>
                {analyticsData.funnel && analyticsData.funnel.some((d: any) => d.value > 0) ? (
                  <div className="h-64 min-w-0">
                    <ResponsiveContainer width="100%" height="100%" minWidth={0} debounce={1}>
                      <BarChart data={analyticsData.funnel} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" horizontal={false} />
                        <XAxis type="number" hide />
                        <YAxis dataKey="name" type="category" stroke="rgba(0,0,0,0.4)" fontSize={10} width={80} orientation={language === 'ar' ? 'right' : 'left'} />
                        <Tooltip 
                          contentStyle={{ backgroundColor: 'var(--app-bg)', border: '1px solid var(--app-border)', borderRadius: '12px' }}
                          itemStyle={{ color: 'var(--app-text)', fontSize: '10px' }}
                        />
                        <Bar dataKey="value" fill="var(--app-accent)" radius={language === 'ar' ? [4, 0, 0, 4] : [0, 4, 4, 0]} barSize={20}>
                          {analyticsData.funnel.map((_entry: any, index: number) => (
                            <Cell key={`cell-${index}`} fillOpacity={1 - index * 0.2} fill="var(--app-accent)" />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="h-64 flex flex-col items-center justify-center text-center opacity-20 gap-2">
                    <TrendingUp size={32} />
                    <p className="text-[10px] uppercase tracking-widest font-bold">No Pipeline Activity</p>
                  </div>
                )}
              </div>

              {/* Email Activity Chart */}
              <div className="glass p-8 rounded-[40px] space-y-6 border border-app-border">
                <h3 className="text-[10px] font-bold uppercase tracking-widest opacity-40">{t.outreachVol}</h3>
                {analyticsData.emailStats && analyticsData.emailStats.length > 0 ? (
                  <div className="h-64 min-w-0">
                    <ResponsiveContainer width="100%" height="100%" minWidth={0} debounce={1}>
                      <AreaChart data={analyticsData.emailStats}>
                        <defs>
                          <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="var(--app-accent)" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="var(--app-accent)" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" vertical={false} />
                        <XAxis dataKey="date" stroke="rgba(0,0,0,0.4)" fontSize={8} />
                        <YAxis stroke="rgba(0,0,0,0.4)" fontSize={8} orientation={language === 'ar' ? 'right' : 'left'} />
                        <Tooltip 
                          contentStyle={{ backgroundColor: 'var(--app-bg)', border: '1px solid var(--app-border)', borderRadius: '12px' }}
                          itemStyle={{ color: 'var(--app-text)', fontSize: '10px' }}
                        />
                        <Area type="monotone" dataKey="count" stroke="var(--app-accent)" fillOpacity={1} fill="url(#colorCount)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="h-64 flex flex-col items-center justify-center text-center opacity-20 gap-2">
                    <Send size={32} />
                    <p className="text-[10px] uppercase tracking-widest font-bold">No Outreach Data</p>
                  </div>
                )}
              </div>

              {/* Vision 2030 Alignment Chart */}
              {analyticsData.visionStats && analyticsData.visionStats.length > 0 ? (
                <div className="glass p-8 rounded-[40px] space-y-6 border border-app-border">
                  <h3 className="text-[10px] font-bold uppercase tracking-widest opacity-40">Vision 2030 Alignment (by Program)</h3>
                  <div className="h-64 min-w-0">
                    <ResponsiveContainer width="100%" height="100%" minWidth={0} debounce={1}>
                      <PieChart>
                        <Pie
                          data={analyticsData.visionStats}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={80}
                          paddingAngle={5}
                          dataKey="value"
                        >
                          {analyticsData.visionStats.map((_entry: any, index: number) => (
                            <Cell key={`cell-${index}`} fill={['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6'][index % 5]} />
                          ))}
                        </Pie>
                        <Tooltip 
                          contentStyle={{ backgroundColor: 'var(--app-bg)', border: '1px solid var(--app-border)', borderRadius: '12px' }}
                          itemStyle={{ color: 'var(--app-text)', fontSize: '10px' }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex flex-wrap gap-4 justify-center">
                    {analyticsData.visionStats.map((stat: any, i: number) => (
                      <div key={i} className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6'][i % 5] }} />
                        <span className="text-[10px] opacity-60">{stat.name}: {stat.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="glass p-8 rounded-[40px] space-y-6 border border-app-border flex flex-col items-center justify-center text-center opacity-30">
                  <Trophy size={32} className="mb-2" />
                  <p className="text-[10px] uppercase tracking-widest font-bold">No Vision 2030 Data Yet</p>
                  <p className="text-[9px]">Harvest leads with Vision 2030 enabled to see alignment stats.</p>
                </div>
              )}
            </div>
          </div>
        ) : analyticsError ? (
          <div className="flex-1 flex flex-col items-center justify-center p-10 space-y-4">
            <AlertCircle size={32} className="opacity-40" />
            <p className="text-sm opacity-60">{analyticsError}</p>
            <button
              onClick={() => fetchAnalytics(analyticsDateRange)}
              className="px-6 py-3 bg-app-accent text-app-bg rounded-xl text-xs font-bold uppercase tracking-widest hover:opacity-80 transition-opacity"
            >
              Retry
            </button>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-10 space-y-4">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-app-accent border-t-transparent"></div>
            <p className="text-sm opacity-40">Loading analytics...</p>
          </div>
        ))}

          {currentView === 'settings' && (
            <div className="flex-1 p-6 md:p-10 lg:p-20">
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="max-w-4xl mx-auto space-y-12 md:space-y-20"
              >
                <div className="space-y-4">
                  <h2 className="text-3xl md:text-5xl font-light tracking-tight">{t.settingsTitle}</h2>
                  <p className="text-[10px] md:text-xs uppercase tracking-[0.4em] opacity-40">System Configuration & Preferences</p>
                </div>

                <div className="flex flex-col md:flex-row gap-8 md:gap-12">
                  {/* Sidebar Navigation */}
                  <div className="w-full md:w-64 shrink-0 space-y-2 md:sticky md:top-8 h-fit">
                    <button
                      onClick={() => setSettingsTab('general')}
                      className={`w-full text-left rtl:text-right px-5 py-4 rounded-2xl text-sm font-medium transition-all flex items-center gap-3 ${settingsTab === 'general' ? 'bg-app-accent text-app-bg shadow-lg' : 'glass hover:bg-app-accent/10'}`}
                    >
                      <Globe size={18} /> {t.settingsGeneral}
                    </button>
                    <button
                      onClick={() => setSettingsTab('integrations')}
                      className={`w-full text-left rtl:text-right px-5 py-4 rounded-2xl text-sm font-medium transition-all flex items-center gap-3 ${settingsTab === 'integrations' ? 'bg-app-accent text-app-bg shadow-lg' : 'glass hover:bg-app-accent/10'}`}
                    >
                      <Key size={18} /> {t.settingsIntegrations}
                    </button>
                    <button
                      onClick={() => setSettingsTab('outreach')}
                      className={`w-full text-left rtl:text-right px-5 py-4 rounded-2xl text-sm font-medium transition-all flex items-center gap-3 ${settingsTab === 'outreach' ? 'bg-app-accent text-app-bg shadow-lg' : 'glass hover:bg-app-accent/10'}`}
                    >
                      <Mail size={18} /> {t.settingsOutreach}
                    </button>
                    <button
                      onClick={() => setSettingsTab('system')}
                      className={`w-full text-left rtl:text-right px-5 py-4 rounded-2xl text-sm font-medium transition-all flex items-center gap-3 ${settingsTab === 'system' ? 'bg-app-accent text-app-bg shadow-lg' : 'glass hover:bg-app-accent/10'}`}
                    >
                      <Zap size={18} /> {t.settingsSystem}
                    </button>
                  </div>

                  {/* Content Area */}
                  <div className="flex-1 min-w-0">
                    {settingsTab === 'general' && (
                      <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <section className="space-y-6">
                          <div className="flex items-center gap-3">
                            <Briefcase className="text-app-accent" size={20} />
                            <h3 className="text-xl font-light">Company Profile</h3>
                          </div>
                          <p className="text-xs opacity-40">Used on proposals and quotation PDFs.</p>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {[
                              { key: 'name', label: 'Company Name', placeholder: 'Acme Corp' },
                              { key: 'tagline', label: 'Tagline / Division', placeholder: 'Sales Intelligence Division' },
                              { key: 'email', label: 'Contact Email', placeholder: 'hello@acme.com' },
                              { key: 'phone', label: 'Phone', placeholder: '+1 555 000 0000' },
                              { key: 'website', label: 'Website', placeholder: 'https://acme.com' },
                              { key: 'address', label: 'Address', placeholder: '123 Main St, City' },
                            ].map(({ key, label, placeholder }) => (
                              <div key={key} className="space-y-2">
                                <p className="text-[10px] font-bold uppercase tracking-widest opacity-40">{label}</p>
                                <input
                                  type="text"
                                  placeholder={placeholder}
                                  value={(companyProfile as any)[key]}
                                  onChange={e => setCompanyProfile((p: any) => ({ ...p, [key]: e.target.value }))}
                                  className="w-full glass rounded-xl px-4 py-3 text-sm outline-none focus:border-app-accent transition-all"
                                />
                              </div>
                            ))}
                          </div>
                        </section>

                        <section className="space-y-6">
                          <div className="flex items-center gap-3">
                            <Globe className="text-app-accent" size={20} />
                            <h3 className="text-xl font-light">Language & Localization</h3>
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <button 
                              onClick={() => setLanguage('en')}
                              className={`p-6 rounded-2xl border transition-all text-sm font-medium ${language === 'en' ? 'bg-app-accent text-app-bg border-app-accent shadow-lg' : 'glass opacity-60 hover:opacity-100'}`}
                            >
                              English
                            </button>
                            <button 
                              onClick={() => setLanguage('ar')}
                              className={`p-6 rounded-2xl border transition-all text-sm font-medium ${language === 'ar' ? 'bg-app-accent text-app-bg border-app-accent shadow-lg' : 'glass opacity-60 hover:opacity-100'}`}
                            >
                              العربية
                            </button>
                          </div>
                        </section>

                        <section className="space-y-6">
                          <div className="flex items-center gap-3">
                            <ShieldCheck className="text-app-accent" size={20} />
                            <h3 className="text-xl font-light">{t.legalTitle}</h3>
                          </div>
                          <div className="glass p-8 rounded-[32px] space-y-6">
                            <div className="flex items-center justify-between">
                              <p className="text-[10px] font-bold uppercase tracking-widest opacity-40">{t.ipStatus}</p>
                              <span className="px-3 py-1 bg-emerald-500/10 text-emerald-500 text-[9px] font-bold uppercase tracking-widest rounded-full border border-emerald-500/20">
                                {t.patentPending}
                              </span>
                            </div>
                            <div className="space-y-4">
                              <button
                                onClick={() => window.open('https://leadjin.euphoriaexperiences.com/terms', '_blank')}
                                className="w-full flex items-center justify-between p-4 glass rounded-xl text-[10px] font-bold uppercase tracking-widest opacity-60 hover:opacity-100 transition-all"
                              >
                                {t.tos} <ChevronRight size={14} />
                              </button>
                              <button
                                onClick={() => window.open('https://leadjin.euphoriaexperiences.com/privacy', '_blank')}
                                className="w-full flex items-center justify-between p-4 glass rounded-xl text-[10px] font-bold uppercase tracking-widest opacity-60 hover:opacity-100 transition-all"
                              >
                                {t.privacyPolicy} <ChevronRight size={14} />
                              </button>
                              <button 
                                onClick={() => setShowWhitepaper(true)}
                                className="w-full flex items-center justify-between p-4 glass rounded-xl text-[10px] font-bold uppercase tracking-widest opacity-60 hover:opacity-100 transition-all"
                              >
                                {t.whitepaper} <FileText size={14} />
                              </button>
                            </div>
                          </div>
                        </section>

                        <section className="space-y-6">
                          <div className="flex items-center gap-3">
                            <Trash2 className="text-red-500" size={20} />
                            <h3 className="text-xl font-light">{t.privacy}</h3>
                          </div>
                          <button 
                            onClick={handleClearData}
                            className="w-full flex items-center justify-center gap-3 p-6 rounded-2xl border border-red-500/20 text-red-500 text-xs font-bold uppercase tracking-widest hover:bg-red-500/10 transition-all"
                          >
                            <Trash2 size={18} />
                            {t.clearData}
                          </button>
                        </section>
                      </div>
                    )}

                    {settingsTab === 'integrations' && (
                      <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <section className="space-y-6">
                          <div className="flex items-center gap-3">
                            <ShieldCheck className="text-app-accent" size={20} />
                            <h3 className="text-xl font-light">Account</h3>
                          </div>
                          {currentUser ? (
                            <div className="glass p-6 rounded-[24px] space-y-4">
                              <div className="flex items-center justify-between">
                                <div className="space-y-1">
                                  <p className="text-sm font-medium">{currentUser.email}</p>
                                  <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest ${currentUser.subscription_plan === 'pro' || currentUser.subscription_plan === 'trial' ? 'bg-app-accent/10 text-app-accent border border-app-accent/20' : 'bg-white/5 text-white/40 border border-white/10'}`}>
                                    <span className={`w-1.5 h-1.5 rounded-full ${currentUser.subscription_plan === 'pro' || currentUser.subscription_plan === 'trial' ? 'bg-app-accent' : 'bg-white/30'}`} />
                                    {currentUser.subscription_plan === 'pro' ? 'Pro' : currentUser.subscription_plan === 'trial' ? 'Pro Trial' : currentUser.subscription_plan === 'basic' ? 'Basic' : 'Free'}
                                  </div>
                                </div>
                                <button onClick={handleLogout} className="text-[10px] font-bold uppercase tracking-widest text-red-400 hover:text-red-300 transition-colors">
                                  Sign Out
                                </button>
                              </div>
                              <div className="space-y-2">
                                <p className="text-[10px] font-bold uppercase tracking-widest opacity-40">Monthly Searches</p>
                                <div className="flex items-center gap-3">
                                  <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
                                    <div
                                      className="h-full bg-app-accent rounded-full transition-all"
                                      style={{ width: currentUser.monthly_searches_limit === -1 ? '10%' : `${Math.min(100, (currentUser.monthly_searches_used / currentUser.monthly_searches_limit) * 100)}%` }}
                                    />
                                  </div>
                                  <span className="text-xs opacity-60 shrink-0">
                                    {currentUser.monthly_searches_used} / {currentUser.monthly_searches_limit === -1 ? '∞' : currentUser.monthly_searches_limit}
                                  </span>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="glass p-6 rounded-[24px] space-y-3">
                              <p className="text-sm opacity-60">Sign in to use LEADJIN and track your monthly searches.</p>
                              <button
                                onClick={() => { setAuthMode('login'); setShowAuthModal(true); }}
                                className="px-6 py-2.5 bg-app-accent text-white rounded-xl text-xs font-bold uppercase tracking-widest hover:opacity-90 transition-opacity"
                              >
                                Sign In / Create Account
                              </button>
                            </div>
                          )}
                        </section>

                        <section className="space-y-6">
                          <div className="flex items-center gap-3">
                            <Globe className="text-app-accent" size={20} />
                            <h3 className="text-xl font-light">{t.workspaceTitle}</h3>
                          </div>
                          <div className="glass p-8 rounded-[32px] space-y-8">
                            <p className="text-sm opacity-60 leading-relaxed">
                              {t.workspaceSub}
                            </p>
                            
                            {gmailConnected ? (
                              <div className="space-y-6">
                                <div className="p-4 bg-emerald-500/10 rounded-2xl border border-emerald-500/20 flex items-center justify-between">
                                  <div className="flex items-center gap-3">
                                    <CheckCircle2 className="text-emerald-500" size={18} />
                                    <div className="space-y-0.5">
                                      <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-500">{t.gmailConnected}</p>
                                      <p className="text-xs font-medium">{gmailName}</p>
                                      <p className="text-[10px] opacity-40">{gmailEmail}</p>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-4">
                                    <button 
                                      onClick={async () => {
                                        try {
                                          const res = await authFetch('/api/auth/google/test', { method: 'POST' });
                                          const data = await res.json();
                                          if (data.status === 'ok') setNotification({ message: t.connectionValid, type: 'success' });
                                          else setNotification({ message: t.connectionInvalid, type: 'error' });
                                        } catch (e) {
                                          setNotification({ message: t.connectionInvalid, type: 'error' });
                                        }
                                      }}
                                      className="text-[10px] font-bold uppercase tracking-widest text-app-accent hover:underline"
                                    >
                                      {t.testConnection}
                                    </button>
                                    <button
                                      onClick={async () => {
                                        if (!window.confirm('Disconnect Gmail? This will remove your Gmail outreach integration.')) return;
                                        await authFetch('/api/auth/google/disconnect', { method: 'POST' });
                                        setGmailConnected(false);
                                        setGmailEmail('');
                                        setGmailName('');
                                        setNotification({ message: 'Gmail Disconnected', type: 'info' });
                                      }}
                                      className="text-[10px] font-bold uppercase tracking-widest opacity-40 hover:opacity-100 transition-all"
                                    >
                                      {t.disconnect}
                                    </button>
                                  </div>
                                </div>

                                <div className="p-6 glass rounded-2xl border border-app-border flex items-center justify-between">
                                  <div className="space-y-1">
                                    <p className="text-xs font-bold uppercase tracking-widest">{t.autonomousMode}</p>
                                    <p className="text-[10px] opacity-50 leading-tight max-w-[200px]">{t.autonomousSub}</p>
                                  </div>
                                  <button 
                                    onClick={() => setAutonomousMode(!autonomousMode)}
                                    className={`w-12 h-6 rounded-full transition-all relative ${autonomousMode ? 'bg-app-accent' : 'bg-app-text/10'}`}
                                  >
                                    <motion.div 
                                      animate={{ x: autonomousMode ? 24 : 4 }}
                                      className="absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm"
                                    />
                                  </button>
                                </div>

                                <div className="space-y-4 pt-6 border-t border-app-border/10">
                                  <div className="flex items-center gap-2 opacity-60">
                                    <ShieldCheck size={14} className="text-app-accent" />
                                    <h4 className="text-[10px] font-bold uppercase tracking-widest">{t.authGuideTitle}</h4>
                                  </div>
                                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    {[
                                      { icon: ShieldCheck, text: t.authStep1 },
                                      { icon: Key, text: t.authStep2 },
                                      { icon: Zap, text: t.authStep3 }
                                    ].map((step, i) => (
                                      <div key={i} className="glass p-4 rounded-2xl flex items-center gap-3 border border-app-border/5">
                                        <div className="w-6 h-6 rounded-full bg-app-accent/10 text-app-accent flex items-center justify-center text-[10px] font-bold shrink-0">
                                          {i + 1}
                                        </div>
                                        <p className="text-[9px] font-medium leading-tight opacity-60">{step.text}</p>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <button 
                                onClick={async () => {
                                  try {
                                    const res = await fetch('/api/auth/google');
                                    const data = await res.json();
                                    if (!res.ok || !data.url) {
                                      setNotification({ message: data.error || 'Google OAuth is not configured on the server. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to your .env file.', type: 'error' });
                                      return;
                                    }
                                    window.open(data.url, 'google_auth', 'width=600,height=700');
                                  } catch (e) {
                                    setNotification({ message: 'Failed to reach server. Is it running?', type: 'error' });
                                  }
                                }}
                                className="w-full py-4 bg-app-accent text-app-bg rounded-2xl text-[10px] font-bold uppercase tracking-widest shadow-xl shadow-app-accent/20 flex items-center justify-center gap-2"
                              >
                                <Play size={14} fill="currentColor" />
                                {t.gmailConnect}
                              </button>
                            )}
                          </div>
                        </section>

                        {/* Gemini API Key */}
                        {!(currentUser as any)?.is_founder && (
                          <section className="space-y-4">
                            <div className="flex items-center gap-2 opacity-60">
                              <Key size={14} className="text-app-accent" />
                              <h3 className="text-[10px] font-bold uppercase tracking-widest">Gemini API Key</h3>
                            </div>
                            <p className="text-[10px] opacity-40">Your personal Gemini API key for lead harvesting. Stored encrypted.</p>
                            <div className="flex gap-3">
                              <input
                                type="password"
                                id="gemini-key-input"
                                placeholder="Enter your Gemini API key..."
                                className="flex-1 glass rounded-2xl p-4 text-sm focus:border-app-accent outline-none transition-all font-mono"
                              />
                              <button
                                onClick={async () => {
                                  const input = document.getElementById('gemini-key-input') as HTMLInputElement;
                                  const key = input?.value?.trim();
                                  if (!key) { setNotification({ message: 'Enter an API key first', type: 'error' }); return; }
                                  try {
                                    const res = await authFetch('/api/user/gemini-key', {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({ gemini_api_key: key })
                                    });
                                    if (res.ok) {
                                      setNotification({ message: 'API key saved and encrypted', type: 'success' });
                                      input.value = '';
                                    } else {
                                      const data = await res.json();
                                      setNotification({ message: data.error || 'Failed to save key', type: 'error' });
                                    }
                                  } catch { setNotification({ message: 'Failed to save', type: 'error' }); }
                                }}
                                className="px-6 py-4 bg-app-accent text-app-bg rounded-2xl text-[10px] font-bold uppercase tracking-widest"
                              >
                                Save Key
                              </button>
                            </div>
                            <button
                              onClick={async () => {
                                try {
                                  const res = await authFetch('/api/user/gemini-key');
                                  const data = await res.json();
                                  setNotification({ message: data.hasKey ? 'API key is set and active' : 'No API key saved', type: data.hasKey ? 'success' : 'info' });
                                } catch { setNotification({ message: 'Could not check status', type: 'error' }); }
                              }}
                              className="text-[10px] text-app-accent underline opacity-60 hover:opacity-100"
                            >
                              Check key status
                            </button>
                          </section>
                        )}

                        {/* Enrichment Providers */}
                        <section className="space-y-6">
                          <div className="flex items-center gap-3">
                            <Zap className="text-app-accent" size={20} />
                            <h3 className="text-xl font-light">Enrichment Providers</h3>
                          </div>
                          {integrationsLoading ? (
                            <div className="glass p-6 rounded-[24px] opacity-50 text-sm">Loading...</div>
                          ) : enrichmentProviders.length === 0 ? (
                            <div className="glass p-6 rounded-[24px]">
                              <p className="text-sm opacity-50">No enrichment providers configured.</p>
                            </div>
                          ) : (
                            <div className="grid grid-cols-2 gap-4">
                              {enrichmentProviders.map((provider, i) => (
                                <div key={i} className="glass p-5 rounded-[20px] flex items-center justify-between">
                                  <p className="text-sm font-medium">{provider.name}</p>
                                  <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest ${provider.status === 'active' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-white/5 text-white/30 border border-white/10'}`}>
                                    <span className={`w-1.5 h-1.5 rounded-full ${provider.status === 'active' ? 'bg-emerald-400' : 'bg-white/20'}`} />
                                    {provider.status === 'active' ? 'Active' : 'Not Configured'}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </section>

                        {/* Enrichment Credits */}
                        <section className="space-y-6">
                          <div className="flex items-center gap-3">
                            <Key className="text-app-accent" size={20} />
                            <h3 className="text-xl font-light">Enrichment Credits</h3>
                          </div>
                          {integrationsLoading ? (
                            <div className="glass p-6 rounded-[24px] opacity-50 text-sm">Loading...</div>
                          ) : creditsBalance ? (
                            <div className="glass p-6 rounded-[24px] space-y-5">
                              <div>
                                <p className="text-3xl font-light">{creditsBalance.remaining.toLocaleString()} <span className="text-sm opacity-50 font-normal">credits remaining</span></p>
                                <p className="text-xs opacity-40 mt-1">{creditsBalance.used.toLocaleString()} used of {creditsBalance.total.toLocaleString()} total</p>
                              </div>
                              {creditsBalance.transactions && creditsBalance.transactions.length > 0 && (
                                <div className="space-y-2 pt-4 border-t border-app-border/10">
                                  <p className="text-[10px] font-bold uppercase tracking-widest opacity-40">Recent Transactions</p>
                                  {creditsBalance.transactions.slice(0, 5).map((tx, i) => (
                                    <div key={tx.id || i} className="flex items-center justify-between text-xs py-1.5">
                                      <span className="opacity-60">{tx.description}</span>
                                      <span className={tx.amount >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                                        {tx.amount >= 0 ? '+' : ''}{tx.amount}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="glass p-6 rounded-[24px]">
                              <p className="text-sm opacity-50">No credits data available.</p>
                            </div>
                          )}
                        </section>

                        {/* WhatsApp */}
                        <section className="space-y-6">
                          <div className="flex items-center gap-3">
                            <Globe className="text-app-accent" size={20} />
                            <h3 className="text-xl font-light">WhatsApp</h3>
                          </div>
                          {integrationsLoading ? (
                            <div className="glass p-6 rounded-[24px] opacity-50 text-sm">Loading...</div>
                          ) : whatsappStatus ? (
                            <div className={`glass p-5 rounded-[20px] flex items-center gap-3 border ${whatsappStatus.connected ? 'border-emerald-500/20' : 'border-white/5'}`}>
                              <span className={`w-2 h-2 rounded-full shrink-0 ${whatsappStatus.connected ? 'bg-emerald-400' : 'bg-white/20'}`} />
                              <div>
                                <p className={`text-sm font-medium ${whatsappStatus.connected ? 'text-emerald-400' : 'opacity-40'}`}>
                                  {whatsappStatus.connected ? 'Connected' : 'Not Configured'}
                                </p>
                                {whatsappStatus.connected && whatsappStatus.phone_number_id && (
                                  <p className="text-[10px] opacity-40 mt-0.5 font-mono">{whatsappStatus.phone_number_id}</p>
                                )}
                              </div>
                            </div>
                          ) : (
                            <div className="glass p-5 rounded-[20px] flex items-center gap-3">
                              <span className="w-2 h-2 rounded-full bg-white/20 shrink-0" />
                              <p className="text-sm opacity-40">Not Configured</p>
                            </div>
                          )}
                        </section>
                      </div>
                    )}

                    {settingsTab === 'outreach' && (
                      <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <section className="space-y-6">
                          <div className="flex items-center gap-3">
                            <Mail className="text-app-accent" size={20} />
                            <h3 className="text-xl font-light">Email Templates</h3>
                          </div>
                          <div className="glass p-8 rounded-[32px] space-y-6">
                            <p className="text-sm opacity-60 leading-relaxed">
                              Manage your custom outreach templates. Use {"{{name}}"}, {"{{company}}"}, and {"{{industry}}"} as variables.
                            </p>
                            
                            {editingTemplate ? (
                              <div className="space-y-4">
                                <input 
                                  type="text" 
                                  value={editingTemplate.name}
                                  onChange={(e) => setEditingTemplate({...editingTemplate, name: e.target.value})}
                                  placeholder="Template Name"
                                  className="w-full glass rounded-xl p-4 text-sm focus:border-app-accent outline-none"
                                />
                                <input 
                                  type="text" 
                                  value={editingTemplate.subject}
                                  onChange={(e) => setEditingTemplate({...editingTemplate, subject: e.target.value})}
                                  placeholder="Subject Line"
                                  className="w-full glass rounded-xl p-4 text-sm focus:border-app-accent outline-none"
                                />
                                <textarea 
                                  value={editingTemplate.body}
                                  onChange={(e) => setEditingTemplate({...editingTemplate, body: e.target.value})}
                                  placeholder="Email Body"
                                  rows={6}
                                  className="w-full glass rounded-xl p-4 text-sm focus:border-app-accent outline-none resize-none"
                                />
                                <div className="flex gap-3">
                                  <button 
                                    onClick={async () => {
                                      if (editingTemplate.id) {
                                        await authFetch(`/api/templates/${editingTemplate.id}`, {
                                          method: 'PUT',
                                          body: JSON.stringify(editingTemplate)
                                        });
                                      } else {
                                        await authFetch('/api/templates', {
                                          method: 'POST',
                                          body: JSON.stringify(editingTemplate)
                                        });
                                      }
                                      const res = await authFetch('/api/templates');
                                      const tData = await res.json();
                                      setEmailTemplates(Array.isArray(tData) ? tData : []);
                                      setEditingTemplate(null);
                                    }}
                                    className="flex-1 py-3 bg-app-accent text-app-bg rounded-xl text-[10px] font-bold uppercase tracking-widest"
                                  >
                                    Save Template
                                  </button>
                                  <button 
                                    onClick={() => setEditingTemplate(null)}
                                    className="flex-1 py-3 glass rounded-xl text-[10px] font-bold uppercase tracking-widest"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="space-y-4">
                                {emailTemplates.map(template => (
                                  <div key={template.id} className="p-4 glass rounded-2xl border border-app-border/10 flex items-center justify-between">
                                    <div>
                                      <p className="text-sm font-medium">{template.name}</p>
                                      <p className="text-[10px] opacity-60 mt-1">{template.subject}</p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <button 
                                        onClick={() => setEditingTemplate(template)}
                                        className="p-2 hover:bg-app-accent/10 rounded-lg transition-colors"
                                      >
                                        <Edit2 size={16} className="text-app-accent" />
                                      </button>
                                      <button 
                                        onClick={async () => {
                                          if (confirm('Delete this template?')) {
                                            await authFetch(`/api/templates/${template.id}`, { method: 'DELETE' });
                                            const res = await authFetch('/api/templates');
                                            const tData = await res.json();
                                            setEmailTemplates(Array.isArray(tData) ? tData : []);
                                          }
                                        }}
                                        className="p-2 hover:bg-red-500/10 rounded-lg transition-colors"
                                      >
                                        <Trash2 size={16} className="text-red-500" />
                                      </button>
                                    </div>
                                  </div>
                                ))}
                                <button 
                                  onClick={() => setEditingTemplate({ name: '', subject: '', body: '' })}
                                  className="w-full py-4 glass border-dashed border-2 rounded-2xl text-[10px] font-bold uppercase tracking-widest hover:border-app-accent hover:text-app-accent transition-all flex items-center justify-center gap-2"
                                >
                                  <Plus size={14} />
                                  Create New Template
                                </button>
                              </div>
                            )}
                          </div>
                        </section>

                        <section className="space-y-6">
                          <div className="flex items-center gap-3">
                            <Globe className="text-app-accent" size={20} />
                            <h3 className="text-xl font-light">Regional Intelligence</h3>
                          </div>
                          <div className="glass p-8 rounded-[32px] grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="flex items-center justify-between p-4 glass rounded-2xl border border-app-border/10">
                              <div className="space-y-1">
                                <p className="text-xs font-bold uppercase tracking-widest">Majlis Mode (Cultural Tips)</p>
                                <p className="text-[10px] opacity-60">Generate Saudi-specific etiquette and local dialect outreach.</p>
                              </div>
                              <button 
                                onClick={() => setMajlisModeEnabled(!majlisModeEnabled)}
                                className={`w-12 h-6 rounded-full transition-all relative ${majlisModeEnabled ? 'bg-emerald-500' : 'bg-app-border'}`}
                              >
                                <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${majlisModeEnabled ? 'right-1' : 'left-1'}`} />
                              </button>
                            </div>
                            <div className="flex items-center justify-between p-4 glass rounded-2xl border border-app-border/10">
                              <div className="space-y-1">
                                <p className="text-xs font-bold uppercase tracking-widest">Vision 2030 Alignment</p>
                                <p className="text-[10px] opacity-60">Score leads against Saudi national strategic programs.</p>
                              </div>
                              <button 
                                onClick={() => setVision2030Enabled(!vision2030Enabled)}
                                className={`w-12 h-6 rounded-full transition-all relative ${vision2030Enabled ? 'bg-blue-500' : 'bg-app-border'}`}
                              >
                                <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${vision2030Enabled ? 'right-1' : 'left-1'}`} />
                              </button>
                            </div>
                          </div>
                        </section>
                      </div>
                    )}

                    {settingsTab === 'system' && (
                      <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <section className="space-y-6">
                          <div className="flex items-center gap-3">
                            <Zap className="text-app-accent" size={20} />
                            <h3 className="text-xl font-light">{t.caseStudy}</h3>
                          </div>
                          <div className="glass p-8 rounded-[32px] space-y-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                            <p className="text-sm opacity-60 leading-relaxed max-w-2xl">
                              Populate the engine with a pre-configured simulation of 10 high-value leads in the Saudi market to test the full pipeline.
                            </p>
                            <button
                              onClick={() => {
                                if (!window.confirm('Run Case Study Simulation? This will overwrite all existing leads and email queue data with demo data.')) return;
                                runCaseStudySimulation();
                              }}
                              disabled={isSimulating}
                              className="w-full md:w-auto px-8 py-5 bg-app-accent text-app-bg rounded-2xl text-xs font-bold uppercase tracking-widest hover:scale-[1.02] transition-all flex items-center justify-center gap-3 shadow-xl shrink-0"
                            >
                              {isSimulating ? <Loader2 size={18} className="animate-spin" /> : <Play size={18} fill="currentColor" />}
                              {t.runSimulation}
                            </button>
                          </div>
                        </section>

                        <section className="space-y-4">
                          <div className="flex items-center gap-3">
                            <Database size={20} className="text-app-accent" />
                            <h3 className="text-xl font-light">Lead Intelligence Database</h3>
                          </div>
                          <div className="glass p-6 rounded-[24px] grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div className="space-y-1">
                              <p className="text-2xl font-light">{dbStats?.total_companies ?? '—'}</p>
                              <p className="text-[9px] font-bold uppercase tracking-widest opacity-40">Companies</p>
                            </div>
                            <div className="space-y-1">
                              <p className="text-2xl font-light">{dbStats?.total_people ?? '—'}</p>
                              <p className="text-[9px] font-bold uppercase tracking-widest opacity-40">Contacts</p>
                            </div>
                            <div className="space-y-1">
                              <p className="text-2xl font-light">{dbStats?.verified_people ?? '—'}</p>
                              <p className="text-[9px] font-bold uppercase tracking-widest opacity-40">Verified</p>
                            </div>
                            <div className="space-y-1">
                              <p className="text-2xl font-light">{Number(Object.values(dbStats?.crawl_jobs || {}).reduce((a: any, b: any) => (a as number) + (b as number), 0)) || '—'}</p>
                              <p className="text-[9px] font-bold uppercase tracking-widest opacity-40">Crawl Jobs</p>
                            </div>
                          </div>
                        </section>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <section className="space-y-6">
                            <div className="flex items-center gap-3">
                              <Trophy className="text-app-accent" size={20} />
                              <h3 className="text-xl font-light">{t.patentTitle}</h3>
                            </div>
                            <div className="glass p-8 rounded-[32px] space-y-6 border-l-4 border-app-accent h-full flex flex-col">
                              <p className="text-[10px] font-bold uppercase tracking-widest opacity-40">{t.patentSub}</p>
                              <div className="space-y-6 flex-1">
                                {[
                                  { title: t.spatialHarvest, desc: "Proprietary real-world footprint mapping via Google Maps Grounding." },
                                  { title: t.semanticSynthesis, desc: "Cross-platform digital twin identification and AI-driven enrichment." },
                                  { title: t.culturalContext, desc: "Saudi Vision 2030 sector alignment and regional growth signal analysis." }
                                ].map((layer, i) => (
                                  <div key={i} className="space-y-2">
                                    <p className="text-[11px] font-bold tracking-tight">{layer.title}</p>
                                    <p className="text-xs opacity-60 leading-relaxed">{layer.desc}</p>
                                  </div>
                                ))}
                              </div>
                              <div className="pt-4 mt-auto">
                                <div className="p-4 bg-app-accent/5 rounded-2xl border border-app-accent/10 flex items-center gap-4">
                                  <ShieldCheck className="text-app-accent shrink-0" size={24} />
                                  <p className="text-[10px] font-medium leading-relaxed italic opacity-80">
                                    Every lead generated is cryptographically signed with a unique logic hash to prove the synthesis origin.
                                  </p>
                                </div>
                              </div>
                            </div>
                          </section>

                          <section className="space-y-6">
                            <div className="flex items-center gap-3">
                              <Smartphone className="text-app-accent" size={20} />
                              <h3 className="text-xl font-light">{t.install}</h3>
                            </div>
                            <div className="glass p-8 rounded-[32px] space-y-6 h-full flex flex-col justify-center">
                              <div className="space-y-2">
                                <p className="text-[10px] font-bold uppercase tracking-widest opacity-40">Mobile PWA</p>
                                <p className="text-sm opacity-60 leading-relaxed">{t.mobileInstall}</p>
                              </div>
                              <div className="space-y-2">
                                <p className="text-[10px] font-bold uppercase tracking-widest opacity-40">Chrome Extension</p>
                                <p className="text-sm opacity-60 leading-relaxed">{t.extensionInstall}</p>
                              </div>
                            </div>
                          </section>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </div>
      </main>

      <AnimatePresence>
          {selectedLead && (
            <motion.div 
              initial={{ x: language === 'ar' ? '-100%' : '100%' }}
              animate={{ x: 0 }}
              exit={{ x: language === 'ar' ? '-100%' : '100%' }}
              className={`fixed inset-y-0 ${language === 'ar' ? 'left-0' : 'right-0'} w-full md:w-[550px] glass shadow-2xl z-50 flex flex-col`}
            >
              <div className="p-4 md:p-10 border-b border-app-border flex justify-between items-center">
                <div className="flex items-center gap-3 md:gap-6 overflow-hidden">
                  <button 
                    onClick={() => setSelectedLead(null)}
                    className="w-8 h-8 md:w-10 md:h-10 glass rounded-full flex items-center justify-center hover:bg-app-accent hover:text-app-bg transition-all shrink-0"
                    title="Back to List"
                  >
                    <ArrowLeft size={16} className="rtl:rotate-180" />
                  </button>
                  <div className={`text-2xl md:text-5xl font-light italic shrink-0 ${getScoreColor(selectedLead.lead_score)}`}>
                    {selectedLead.lead_score}
                  </div>
                  <div className="overflow-hidden">
                    <h3 className="text-base md:text-2xl font-light truncate">{selectedLead.name}</h3>
                    <div className="flex items-center gap-2">
                      <p className="text-[9px] md:text-xs uppercase tracking-widest opacity-50 truncate">{selectedLead.company}</p>
                      {selectedLead.industry && (
                        <>
                          <span className="w-1 h-1 rounded-full bg-app-accent/30" />
                          <p className="text-[9px] md:text-xs uppercase tracking-widest opacity-50 truncate">{selectedLead.industry}</p>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <button 
                  onClick={() => setSelectedLead(null)}
                  className="w-8 h-8 md:w-12 md:h-12 glass rounded-full flex items-center justify-center hover:scale-110 transition-transform shrink-0"
                >
                  <AlertCircle size={18} className="rotate-45" />
                </button>
              </div>

              <div className="flex border-b border-app-border overflow-x-auto no-scrollbar whitespace-nowrap">
                <button 
                  onClick={() => setActiveTab('details')}
                  className={`px-6 py-3 md:py-6 text-[9px] md:text-[10px] font-bold uppercase tracking-[0.3em] transition-all shrink-0 ${activeTab === 'details' ? 'bg-app-accent text-app-bg' : 'opacity-40 hover:opacity-100'}`}
                >
                  Intelligence
                </button>
                <button 
                  onClick={() => setActiveTab('interactions')}
                  className={`px-6 py-3 md:py-6 text-[9px] md:text-[10px] font-bold uppercase tracking-[0.3em] transition-all shrink-0 ${activeTab === 'interactions' ? 'bg-app-accent text-app-bg' : 'opacity-40 hover:opacity-100'}`}
                >
                  {t.interactions}
                </button>
                <button
                  onClick={() => isProUser ? setActiveTab('sequence') : setNotification({ message: 'Pro subscription required to unlock Outreach.', type: 'info' })}
                  className={`px-6 py-3 md:py-6 text-[9px] md:text-[10px] font-bold uppercase tracking-[0.3em] transition-all shrink-0 ${activeTab === 'sequence' ? 'bg-app-accent text-app-bg' : 'opacity-40 hover:opacity-100'} ${!isProUser ? 'cursor-default' : ''}`}
                >
                  Outreach {!isProUser && <span className="ml-1 opacity-40">🔒</span>}
                </button>
                <button
                  onClick={() => isProUser ? setActiveTab('proposal') : setNotification({ message: 'Pro subscription required to unlock Proposals.', type: 'info' })}
                  className={`px-6 py-3 md:py-6 text-[9px] md:text-[10px] font-bold uppercase tracking-[0.3em] transition-all shrink-0 ${activeTab === 'proposal' ? 'bg-app-accent text-app-bg' : 'opacity-40 hover:opacity-100'} ${!isProUser ? 'cursor-default' : ''}`}
                >
                  Proposal {!isProUser && <span className="ml-1 opacity-40">🔒</span>}
                </button>
                <button
                  onClick={() => isProUser ? setActiveTab('quotation') : setNotification({ message: 'Pro subscription required to unlock Quotation Builder.', type: 'info' })}
                  className={`px-6 py-3 md:py-6 text-[9px] md:text-[10px] font-bold uppercase tracking-[0.3em] transition-all shrink-0 ${activeTab === 'quotation' ? 'bg-app-accent text-app-bg' : 'opacity-40 hover:opacity-100'} ${!isProUser ? 'cursor-default' : ''}`}
                >
                  Quotation {!isProUser && <span className="ml-1 opacity-40">🔒</span>}
                </button>
                <button
                  onClick={() => isProUser ? setActiveTab('calendar') : setNotification({ message: 'Pro subscription required to unlock Calendar.', type: 'info' })}
                  className={`px-6 py-3 md:py-6 text-[9px] md:text-[10px] font-bold uppercase tracking-[0.3em] transition-all shrink-0 ${activeTab === 'calendar' ? 'bg-app-accent text-app-bg' : 'opacity-40 hover:opacity-100'} ${!isProUser ? 'cursor-default' : ''}`}
                >
                  Calendar {!isProUser && <span className="ml-1 opacity-40">🔒</span>}
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-5 pt-5 md:px-10 md:pt-10 pb-32 md:pb-40 space-y-8 md:space-y-12">
                {activeTab === 'details' ? (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="glass p-4 rounded-2xl space-y-1">
                        <p className="text-[8px] uppercase tracking-widest opacity-40">{t.confidence}</p>
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${selectedLead.confidence === 'high' ? 'bg-emerald-500' : selectedLead.confidence === 'medium' ? 'bg-amber-500' : 'bg-rose-500'}`} />
                          <p className="text-sm font-medium uppercase tracking-wider">{selectedLead.confidence || 'unknown'}</p>
                        </div>
                      </div>
                      <div className="glass p-4 rounded-2xl space-y-1">
                        <p className="text-[8px] uppercase tracking-widest opacity-40">{t.status}</p>
                        <p className="text-sm font-medium uppercase tracking-wider">
                          {contactedLeads.has(selectedLead.lead_id) ? t.contacted : t.newProspect}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-4 md:space-y-6">
                      <h4 className="text-[9px] md:text-[10px] font-bold uppercase tracking-[0.4em] opacity-40">{t.score}</h4>
                      <div className="grid grid-cols-2 gap-3 md:gap-6">
                        {Object.entries(selectedLead.score_breakdown || {}).map(([key, val]) => (
                          <div key={key} className="glass p-3 md:p-6 rounded-2xl space-y-2 md:space-y-3">
                            <p className="text-[8px] md:text-[9px] uppercase tracking-widest opacity-40 truncate">{key.replace('_', ' ')}</p>
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-lg md:text-2xl font-light">{val}</span>
                              <div className="hidden sm:block w-12 md:w-16 h-1 bg-app-text/10 rounded-full overflow-hidden">
                                <div className="h-full bg-app-accent" style={{ width: `${((val as number) / 25) * 100}%` }} />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-4 md:space-y-6">
                      <h4 className="text-[9px] md:text-[10px] font-bold uppercase tracking-[0.4em] opacity-40">{t.contact}</h4>
                      <div className="space-y-2 md:space-y-4">
                        {selectedLead.email && (
                          <div onClick={() => window.open('mailto:' + selectedLead.email)} className="flex items-center justify-between p-3 md:p-6 glass rounded-2xl group cursor-pointer hover:border-app-accent transition-colors">
                            <div className="flex items-center gap-2 md:gap-4 overflow-hidden">
                              <Mail size={14} className="opacity-40 shrink-0" />
                              <span className="font-mono text-[10px] md:text-sm truncate">{selectedLead.email}</span>
                            </div>
                            <ExternalLink size={12} className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 rtl:rotate-180" />
                          </div>
                        )}
                        {selectedLead.linkedin && (
                          <div onClick={() => window.open(selectedLead.linkedin.startsWith('http') ? selectedLead.linkedin : 'https://' + selectedLead.linkedin, '_blank')} className="flex items-center justify-between p-3 md:p-6 glass rounded-2xl group cursor-pointer hover:border-app-accent transition-colors">
                            <div className="flex items-center gap-2 md:gap-4 overflow-hidden">
                              <Linkedin size={14} className="opacity-40 shrink-0" />
                              <span className="font-mono text-[10px] md:text-sm truncate">{selectedLead.linkedin}</span>
                            </div>
                            <ExternalLink size={12} className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 rtl:rotate-180" />
                          </div>
                        )}
                        {selectedLead.twitter && (
                          <div onClick={() => window.open(selectedLead.twitter.startsWith('http') ? selectedLead.twitter : 'https://' + selectedLead.twitter, '_blank')} className="flex items-center justify-between p-3 md:p-6 glass rounded-2xl group cursor-pointer hover:border-app-accent transition-colors">
                            <div className="flex items-center gap-2 md:gap-4 overflow-hidden">
                              <Twitter size={14} className="opacity-40 shrink-0" />
                              <span className="font-mono text-[10px] md:text-sm truncate">{selectedLead.twitter}</span>
                            </div>
                            <ExternalLink size={12} className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 rtl:rotate-180" />
                          </div>
                        )}
                        {selectedLead.website && (
                          <div onClick={() => window.open(selectedLead.website.startsWith('http') ? selectedLead.website : 'https://' + selectedLead.website, '_blank')} className="flex items-center justify-between p-3 md:p-6 glass rounded-2xl group cursor-pointer hover:border-app-accent transition-colors">
                            <div className="flex items-center gap-2 md:gap-4 overflow-hidden">
                              <Globe size={14} className="opacity-40 shrink-0" />
                              <span className="font-mono text-[10px] md:text-sm truncate">{selectedLead.website}</span>
                            </div>
                            <ExternalLink size={12} className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 rtl:rotate-180" />
                          </div>
                        )}
                      </div>
                      <button
                        onClick={async () => {
                          setEnriching(true);
                          try {
                            const res = await authFetch('/api/leads/enrich-v2', {
                              method: 'POST',
                              body: JSON.stringify({
                                lead_id: selectedLead.lead_id,
                                name: selectedLead.name,
                                company: selectedLead.company,
                                domain: selectedLead.website?.replace(/^https?:\/\//, '').split('/')[0],
                              }),
                            });
                            const data = await res.json();
                            // Update local state with enrichment results
                            if (data.email) setSelectedLead(prev => prev ? ({ ...prev, email: data.email, email_verified: data.emailConfidence >= 90 }) : null);
                            if (data.phone) setSelectedLead(prev => prev ? ({ ...prev, phone: data.phone }) : null);
                            if (data.linkedinUrl) setSelectedLead(prev => prev ? ({ ...prev, linkedin: data.linkedinUrl }) : null);
                            setNotification({ message: `Enriched: ${data.email || 'no email'} | ${data.phone || 'no phone'}`, type: 'success' });
                          } catch (err) {
                            setNotification({ message: 'Enrichment failed', type: 'error' });
                          }
                          setEnriching(false);
                        }}
                        disabled={enriching}
                        className="w-full flex items-center justify-center gap-2 p-3 rounded-xl bg-app-accent/10 text-app-accent text-xs font-bold uppercase tracking-widest hover:bg-app-accent/20 transition-all disabled:opacity-40"
                      >
                        {enriching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                        {enriching ? 'Enriching...' : 'Enrich Lead'}
                      </button>
                    </div>

                    {selectedLead.company_data && (
                      <div className="space-y-4 md:space-y-6">
                        <h4 className="text-[9px] md:text-[10px] font-bold uppercase tracking-[0.4em] opacity-40">{t.company}</h4>
                        <div className="glass p-6 md:p-8 rounded-[32px] space-y-6 border border-app-border">
                          <p className="text-sm md:text-base font-light leading-relaxed opacity-80 italic">
                            "{selectedLead.company_data.description}"
                          </p>
                          <div className="grid grid-cols-2 gap-6">
                            {selectedLead.company_data.founded && (
                              <div className="space-y-1">
                                <p className="text-[8px] uppercase tracking-widest opacity-40">Founded</p>
                                <p className="text-xs font-bold">{selectedLead.company_data.founded}</p>
                              </div>
                            )}
                            {selectedLead.company_data.size && (
                              <div className="space-y-1">
                                <p className="text-[8px] uppercase tracking-widest opacity-40">Company Size</p>
                                <p className="text-xs font-bold">{selectedLead.company_data.size}</p>
                              </div>
                            )}
                            {selectedLead.company_data.headquarters && (
                              <div className="space-y-1 col-span-2">
                                <p className="text-[8px] uppercase tracking-widest opacity-40">Headquarters</p>
                                <p className="text-xs font-bold">{selectedLead.company_data.headquarters}</p>
                              </div>
                            )}
                          </div>
                          {selectedLead.company_data.specialties && selectedLead.company_data.specialties.length > 0 && (
                            <div className="space-y-3">
                              <p className="text-[8px] uppercase tracking-widest opacity-40">Specialties</p>
                              <div className="flex flex-wrap gap-2">
                                {selectedLead.company_data.specialties.map(spec => (
                                  <span key={spec} className="px-3 py-1 bg-app-accent/5 rounded-full text-[9px] font-bold uppercase tracking-widest border border-app-accent/10">
                                    {spec}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {selectedLead.vision_2030_alignment && (
                      <div className="space-y-4 md:space-y-6">
                        <div className="flex items-center justify-between">
                          <h4 className="text-[9px] md:text-[10px] font-bold uppercase tracking-[0.4em] opacity-40">{t.vision2030}</h4>
                          <div className="flex items-center gap-2">
                            <span className="text-xl md:text-3xl font-light text-app-accent">{selectedLead.vision_2030_alignment.score}%</span>
                            <div className="w-12 md:w-20 h-1 bg-app-accent/10 rounded-full overflow-hidden">
                              <div className="h-full bg-app-accent" style={{ width: `${selectedLead.vision_2030_alignment.score}%` }} />
                            </div>
                          </div>
                        </div>
                        <div className="glass p-6 rounded-[32px] space-y-4 border-l-2 border-app-accent bg-emerald-500/5">
                          <div className="space-y-1">
                            <p className="text-[8px] uppercase tracking-widest opacity-40">{t.vrpProgram}</p>
                            <p className="text-xs font-bold text-app-accent">{selectedLead.vision_2030_alignment.program}</p>
                          </div>
                          <p className="text-xs opacity-60 leading-relaxed italic">"{selectedLead.vision_2030_alignment.reasoning}"</p>
                        </div>
                      </div>
                    )}

                    {selectedLead.majlis_mode_tips && selectedLead.majlis_mode_tips.length > 0 && (
                      <div className="space-y-4 md:space-y-6">
                        <h4 className="text-[9px] md:text-[10px] font-bold uppercase tracking-[0.4em] opacity-40">{t.majlisMode}</h4>
                        <div className="grid grid-cols-1 gap-3">
                          {selectedLead.majlis_mode_tips.map((tip, i) => (
                            <div key={i} className="p-4 glass rounded-2xl border border-app-accent/10 flex items-start gap-4 group hover:bg-app-accent/5 transition-colors">
                              <div className="w-6 h-6 rounded-lg bg-app-accent/10 flex items-center justify-center text-app-accent shrink-0 mt-0.5">
                                <span className="text-[10px] font-bold">{i + 1}</span>
                              </div>
                              <p className="text-xs opacity-70 leading-relaxed">{tip}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {selectedLead.gsse_metadata && (
                      <div className="space-y-4 md:space-y-6">
                        <div className="flex items-center justify-between">
                          <h4 className="text-[9px] md:text-[10px] font-bold uppercase tracking-[0.4em] opacity-40">{t.gsseProof}</h4>
                          <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-500 text-[8px] font-bold uppercase tracking-widest rounded-full border border-emerald-500/20">
                            {t.patentPending}
                          </span>
                        </div>
                        <div className="glass p-6 rounded-[32px] space-y-6 border-l-2 border-app-accent relative overflow-hidden">
                          <div className="absolute top-4 right-4 opacity-10 -rotate-12 pointer-events-none">
                            <ShieldCheck size={80} className="text-app-accent" />
                          </div>
                          
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 relative z-10">
                            <div className="space-y-1">
                              <p className="text-[8px] uppercase tracking-widest opacity-40">{t.timestamp}</p>
                              <p className="text-[10px] font-mono opacity-80">{selectedLead.gsse_metadata.harvest_timestamp}</p>
                            </div>
                            <div className="space-y-1">
                              <p className="text-[8px] uppercase tracking-widest opacity-40">{t.logicHash}</p>
                              <p className="text-[10px] font-mono opacity-80 truncate">{selectedLead.gsse_metadata.logic_hash}</p>
                            </div>
                            <div className="md:col-span-2 space-y-1">
                              <p className="text-[8px] uppercase tracking-widest opacity-40">{t.signature}</p>
                              <p className="text-[9px] font-mono text-app-accent break-all bg-app-accent/5 p-2 rounded-lg border border-app-accent/10">
                                {selectedLead.gsse_metadata.signature}
                              </p>
                            </div>
                          </div>
                          
                          <div className="space-y-4 relative z-10">
                            <div className="space-y-2">
                              <p className="text-[9px] font-bold uppercase tracking-widest opacity-40">{t.spatialHarvest}</p>
                              <p className="text-xs opacity-60 leading-relaxed italic">"{selectedLead.gsse_metadata.spatial_layer_proof}"</p>
                            </div>
                            <div className="space-y-2">
                              <p className="text-[9px] font-bold uppercase tracking-widest opacity-40">{t.semanticSynthesis}</p>
                              <p className="text-xs opacity-60 leading-relaxed italic">"{selectedLead.gsse_metadata.semantic_layer_proof}"</p>
                            </div>
                            <div className="space-y-2">
                              <p className="text-[9px] font-bold uppercase tracking-widest opacity-40">{t.culturalContext}</p>
                              <p className="text-xs opacity-60 leading-relaxed italic">"{selectedLead.gsse_metadata.cultural_layer_proof}"</p>
                            </div>
                          </div>

                          <div className="pt-4 border-t border-app-border/10 flex items-center justify-between">
                            <div className="flex items-center gap-2 opacity-40">
                              <ShieldCheck size={12} />
                              <span className="text-[9px] font-bold uppercase tracking-widest">{t.auditTrail}</span>
                            </div>
                            <button className="text-[9px] font-bold uppercase tracking-widest text-app-accent hover:underline">
                              {t.whitepaper}
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {selectedLead.trigger_events && selectedLead.trigger_events.length > 0 && (
                      <div className="space-y-4 md:space-y-6">
                        <h4 className="text-[9px] md:text-[10px] font-bold uppercase tracking-[0.4em] opacity-40">{t.triggers}</h4>
                        <div className="space-y-2 md:space-y-4">
                          {selectedLead.trigger_events.map((event, i) => (
                            <div key={i} className="p-3 md:p-6 glass rounded-2xl border-l-2 rtl:border-l-0 rtl:border-r-2 border-app-accent/40 flex gap-3 md:gap-4">
                              <TrendingUp size={14} className="opacity-40 shrink-0" />
                              <div className="space-y-1">
                                <p className="text-[8px] md:text-[9px] font-bold uppercase tracking-widest text-app-accent">{event.type}</p>
                                <p className="text-[11px] md:text-sm font-light leading-relaxed">{event.description}</p>
                                {event.date && <p className="text-[7px] md:text-[9px] opacity-30 uppercase">{event.date}</p>}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="space-y-4 md:space-y-6">
                      <h4 className="text-[9px] md:text-[10px] font-bold uppercase tracking-[0.4em] opacity-40">{t.pain}</h4>
                      <div className="flex flex-wrap gap-2 md:gap-3">
                        {(selectedLead.pain_signals || []).map(signal => (
                          <span key={signal} className="px-3 md:px-5 py-1.5 md:py-2 glass rounded-full text-[8px] md:text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 md:gap-3">
                            <AlertCircle size={10} className="opacity-40" /> {signal}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="p-5 md:p-8 bg-app-accent text-app-bg rounded-3xl space-y-1 md:space-y-2 shadow-xl">
                      <p className="text-[8px] md:text-[10px] font-bold uppercase tracking-[0.3em] opacity-60">{t.strategy}</p>
                      <p className="text-base md:text-xl font-light leading-tight italic">"{selectedLead.outreach_recommendation || 'No recommendation available'}"</p>
                    </div>
                  </>
                ) : activeTab === 'interactions' ? (
                  <div className="space-y-8 md:space-y-12">
                    <div className="flex justify-between items-center">
                      <h4 className="text-[9px] md:text-[10px] font-bold uppercase tracking-[0.4em] opacity-40">{t.interactions}</h4>
                    </div>
                    {/* Log new interaction */}
                    <div className="glass p-6 rounded-3xl space-y-4 border border-app-border">
                      <p className="text-[10px] font-bold uppercase tracking-widest opacity-60">Log Interaction</p>
                      <div className="flex flex-wrap gap-3">
                        <select
                          value={newInteraction.type}
                          onChange={e => setNewInteraction({...newInteraction, type: e.target.value})}
                          className="bg-app-accent/5 border border-app-border rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-app-accent"
                        >
                          <option value="email">Email</option>
                          <option value="call">Call</option>
                          <option value="meeting">Meeting</option>
                          <option value="linkedin">LinkedIn</option>
                        </select>
                        <input
                          type="text"
                          placeholder="Brief summary of interaction..."
                          value={newInteraction.summary}
                          onChange={e => setNewInteraction({...newInteraction, summary: e.target.value})}
                          className="flex-1 min-w-[200px] bg-app-accent/5 border border-app-border rounded-xl px-4 py-2 text-xs focus:outline-none focus:border-app-accent"
                        />
                        <input
                          type="text"
                          placeholder="Outcome (optional)"
                          value={newInteraction.outcome}
                          onChange={e => setNewInteraction({...newInteraction, outcome: e.target.value})}
                          className="w-36 bg-app-accent/5 border border-app-border rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-app-accent"
                        />
                        <button
                          onClick={async () => {
                            if (!newInteraction.summary.trim() || !selectedLead) return;
                            await authFetch(`/api/leads/${selectedLead.lead_id}/interactions`, {
                              method: 'POST',
                              body: JSON.stringify(newInteraction)
                            });
                            setNewInteraction({ type: 'email', summary: '', outcome: '' });
                            const res = await authFetch(`/api/leads/${selectedLead.lead_id}/interactions`);
                            setInteractions(await res.json());
                          }}
                          className="px-4 py-2 bg-app-accent text-app-bg rounded-xl text-[10px] font-bold uppercase tracking-widest hover:scale-105 transition-all"
                        >
                          Log
                        </button>
                      </div>
                    </div>
                    {/* Interaction history */}
                    <div className="space-y-4">
                      {interactions.length > 0 ? (
                        interactions.map((interaction: any, i: number) => (
                          <div key={i} className="p-6 glass rounded-3xl border-l-2 border-app-accent/40 space-y-3">
                            <div className="flex justify-between items-start">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-xl bg-app-accent/10 flex items-center justify-center text-app-accent">
                                  {interaction.type?.toLowerCase() === 'email' ? <Mail size={14} /> :
                                   interaction.type?.toLowerCase() === 'call' ? <Smartphone size={14} /> :
                                   interaction.type?.toLowerCase() === 'meeting' ? <Users size={14} /> :
                                   <Linkedin size={14} />}
                                </div>
                                <div>
                                  <p className="text-[10px] font-bold uppercase tracking-widest text-app-accent">{interaction.type}</p>
                                  <p className="text-[9px] opacity-40">
                                    {interaction.scheduled_at && new Date(interaction.scheduled_at) > new Date()
                                      ? `Scheduled: ${new Date(interaction.scheduled_at).toLocaleDateString()}`
                                      : interaction.date ? new Date(interaction.date).toLocaleDateString() : ''}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                {interaction.scheduled_at && new Date(interaction.scheduled_at) > new Date() && (
                                  <span className="px-2 py-0.5 bg-blue-500/10 text-blue-400 text-[8px] font-bold uppercase tracking-widest rounded-full border border-blue-500/20">
                                    Scheduled
                                  </span>
                                )}
                                {interaction.outcome && interaction.outcome !== '' && (
                                  <span className={`px-2 py-0.5 text-[8px] font-bold uppercase tracking-widest rounded-full border ${
                                    interaction.outcome === 'SENT' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' :
                                    interaction.outcome === 'FAILED' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                                    'bg-white/5 text-white/40 border-white/10'
                                  }`}>
                                    {interaction.outcome}
                                  </span>
                                )}
                              </div>
                            </div>
                            <p className="text-sm font-light leading-relaxed opacity-80">{interaction.summary}</p>
                          </div>
                        ))
                      ) : (
                        <div className="h-48 border border-dashed border-app-border rounded-[40px] flex flex-col items-center justify-center gap-4 opacity-20">
                          <History size={32} strokeWidth={1} />
                          <p className="text-[10px] uppercase tracking-widest font-bold">No interaction history yet</p>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-8 md:space-y-12">
                    {(() => {
                      // DB-loaded leads return outreach_sequence as a raw JSON string; harvested
                      // leads already hold an object. Parse only the string case so both render.
                      const rawSeq: any = selectedLead.outreach_sequence;
                      const seq: any = typeof rawSeq === 'string'
                        ? (() => { try { return JSON.parse(rawSeq); } catch { return null; } })()
                        : rawSeq;
                      return seq ? (
                      <>
                        {[
                          { key: 'day0', label: 'Day 0: Pattern Interrupt', border: 'border-app-accent' },
                          { key: 'day3', label: 'Day 3: Value Drop', border: 'border-app-accent/60' },
                          { key: 'day7', label: 'Day 7: Break-up', border: 'border-app-accent/30' },
                        ].map(({ key, label, border }) => {
                          const parsed = parseOutreach((seq as any)?.[key]);
                          return (
                            <div key={key} className="space-y-4 md:space-y-6">
                              <h4 className="text-[9px] md:text-[10px] font-bold uppercase tracking-[0.4em] opacity-40">{label}</h4>
                              <div className={`p-5 md:p-8 glass rounded-3xl border-l-2 ${border}`}>
                                <p className="text-[10px] md:text-xs font-bold opacity-60 mb-3">Subject: {parsed.subject}</p>
                                <div className="text-[11px] md:text-sm font-mono leading-relaxed whitespace-pre-wrap">{parsed.body}</div>
                              </div>
                            </div>
                          );
                        })}
                        {seq.majlis_version && (
                          <div className="space-y-4 md:space-y-6">
                            <h4 className="text-[9px] md:text-[10px] font-bold uppercase tracking-[0.4em] text-app-accent">{t.majlisVersion}</h4>
                            <div className="p-5 md:p-8 glass rounded-3xl text-[11px] md:text-sm font-mono leading-relaxed whitespace-pre-wrap border-l-2 border-app-accent bg-app-accent/5">
                              {seq.majlis_version}
                            </div>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center p-8 md:p-12 text-center opacity-20 gap-4 md:gap-6">
                        <AlertCircle className="w-12 h-12 md:w-16 md:h-16" strokeWidth={1} />
                        <p className="text-[10px] md:text-sm uppercase font-bold tracking-widest">Sequence only available for HOT leads</p>
                      </div>
                      );
                    })()}
                  </div>
                )}

                {activeTab === 'proposal' && (
                  <div className="space-y-8 md:space-y-12">
                    <div className="flex justify-between items-center">
                      <h4 className="text-[9px] md:text-[10px] font-bold uppercase tracking-[0.4em] opacity-40">Proposal Generator</h4>
                      <button 
                        onClick={handleDownloadProposal}
                        className="flex items-center gap-2 px-4 py-2 glass rounded-full text-[10px] font-bold uppercase tracking-widest hover:bg-app-accent hover:text-app-bg transition-all"
                      >
                        <Download size={14} />
                        Download PDF
                      </button>
                    </div>

                    <div id="proposal-template" className="bg-app-bg p-10 md:p-16 rounded-[40px] border border-app-border space-y-12 text-app-text shadow-2xl">
                      {/* Proposal Header */}
                      <div className="flex justify-between items-start border-b border-app-border pb-12">
                        <div className="space-y-4">
                          <h1 className="text-4xl font-light tracking-tighter">{companyProfile.name || 'LEADJIN'} <span className="text-app-accent">PROPOSAL</span></h1>
                          <p className="text-[10px] font-mono uppercase tracking-[0.5em] opacity-40">Strategic Partnership Proposal</p>
                        </div>
                        <div className="text-right space-y-1">
                          <p className="text-[10px] font-bold uppercase tracking-widest opacity-40">Date</p>
                          <p className="text-sm font-light">{new Date().toLocaleDateString()}</p>
                        </div>
                      </div>

                      {/* Client Info */}
                      <div className="grid grid-cols-2 gap-12">
                        <div className="space-y-4">
                          <p className="text-[10px] font-bold uppercase tracking-widest opacity-40">Prepared For</p>
                          <div className="space-y-1">
                            <p className="text-xl font-light">{selectedLead.name}</p>
                            <p className="text-sm opacity-60">{selectedLead.title}</p>
                            <p className="text-sm opacity-60">{selectedLead.company}</p>
                          </div>
                        </div>
                        <div className="space-y-4 text-right">
                          <p className="text-[10px] font-bold uppercase tracking-widest opacity-40">Prepared By</p>
                          <div className="space-y-1">
                            <p className="text-xl font-light">{companyProfile.name || 'LEADJIN Engine'}</p>
                            <p className="text-sm opacity-60">{companyProfile.tagline || 'Intelligence Division'}</p>
                            {companyProfile.email && <p className="text-xs opacity-40">{companyProfile.email}</p>}
                            {companyProfile.address && <p className="text-xs opacity-40">{companyProfile.address}</p>}
                          </div>
                        </div>
                      </div>

                      {/* Executive Summary */}
                      <div className="space-y-6">
                        <h2 className="text-2xl font-light border-l-4 border-app-accent pl-6">Executive Summary</h2>
                        <p className="text-sm leading-relaxed opacity-80">
                          Based on our deep intelligence analysis of {selectedLead.company}, we have identified significant opportunities for growth in the {selectedLead.industry} sector. Our engine has detected specific pain signals related to your current digital presence and outreach strategy.
                        </p>
                      </div>

                      {/* Pricing Table */}
                      <div className="space-y-6">
                        <h2 className="text-2xl font-light border-l-4 border-app-accent pl-6">Investment Strategy</h2>
                        <div className="glass rounded-3xl overflow-hidden">
                          <table className="w-full text-left text-sm">
                            <thead className="bg-app-accent/10 border-b border-app-border">
                              <tr>
                                <th className="p-6 font-bold uppercase tracking-widest text-[10px]">Service Item</th>
                                <th className="p-6 font-bold uppercase tracking-widest text-[10px] text-right">Investment</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-app-border">
                              {quotationItems.map((item, idx) => (
                                <tr key={idx}>
                                  <td className="p-6">{item.label}</td>
                                  <td className="p-6 text-right font-mono">SAR ${Number(item.amount).toLocaleString()}</td>
                                </tr>
                              ))}
                              <tr className="bg-app-accent/5">
                                <td className="p-6 font-bold">Total Investment</td>
                                <td className="p-6 text-right font-bold text-app-accent font-mono">
                                  SAR ${quotationItems.reduce((s, i) => s + (Number(i.amount) || 0), 0).toLocaleString()}
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {/* Terms & Conditions */}
                      <div className="space-y-4 opacity-40">
                        <p className="text-[10px] font-bold uppercase tracking-widest">Terms & Conditions</p>
                        <p className="text-[9px] leading-relaxed">
                          This proposal is valid for 30 days. Services are provided on a month-to-month basis with a 30-day notice period for termination. All intelligence data remains the property of the client.
                        </p>
                      </div>

                      {/* E-Signature */}
                      <div className="pt-12 border-t border-app-border flex justify-between items-end">
                        <div className="space-y-8">
                          <div className="w-64 border-b border-app-text/20 pb-2">
                            <p className="text-[10px] font-mono opacity-20 italic">Signature Placeholder</p>
                          </div>
                          <div className="space-y-1">
                            <p className="text-sm font-light">{selectedLead.name}</p>
                            <p className="text-[10px] font-bold uppercase tracking-widest opacity-40">Authorized Signatory</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="w-48 h-48 border border-dashed border-app-border rounded-2xl flex items-center justify-center opacity-20">
                            <p className="text-[10px] uppercase tracking-widest">Company Seal</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'quotation' && (
                  <div className="space-y-8 md:space-y-12">
                    <div className="flex justify-between items-center">
                      <h4 className="text-[9px] md:text-[10px] font-bold uppercase tracking-[0.4em] opacity-40">Custom Quotation Builder</h4>
                      <button
                        onClick={handleCreateQuotation}
                        disabled={quotationLoading}
                        className="flex items-center gap-2 px-4 py-2 bg-app-accent text-app-bg rounded-full text-[10px] font-bold uppercase tracking-widest hover:scale-105 transition-all disabled:opacity-50"
                      >
                        {quotationLoading ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
                        Save Quotation
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      {/* Line Items Builder */}
                      <div className="space-y-6">
                        <h5 className="text-[10px] font-bold uppercase tracking-widest opacity-40">Service Line Items</h5>
                        <div className="space-y-3">
                          {quotationItems.map((item, idx) => (
                            <div key={idx} className="flex gap-3 items-center">
                              <input
                                type="text"
                                value={item.label}
                                onChange={e => {
                                  const updated = [...quotationItems];
                                  updated[idx].label = e.target.value;
                                  setQuotationItems(updated);
                                }}
                                placeholder="Service description"
                                className="flex-1 bg-app-accent/5 border border-app-border rounded-xl px-4 py-2 text-xs focus:outline-none focus:border-app-accent"
                              />
                              <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs opacity-40">$</span>
                                <input
                                  type="number"
                                  value={item.amount}
                                  onChange={e => {
                                    const updated = [...quotationItems];
                                    updated[idx].amount = e.target.value;
                                    setQuotationItems(updated);
                                  }}
                                  placeholder="0"
                                  className="w-28 bg-app-accent/5 border border-app-border rounded-xl pl-7 pr-3 py-2 text-xs focus:outline-none focus:border-app-accent"
                                />
                              </div>
                              <button
                                onClick={() => setQuotationItems(quotationItems.filter((_, i) => i !== idx))}
                                className="text-rose-500/60 hover:text-rose-500 transition-colors"
                                aria-label="Remove line item"
                              >
                                <X size={14} />
                              </button>
                            </div>
                          ))}
                          <button
                            onClick={() => setQuotationItems([...quotationItems, { label: '', amount: '' }])}
                            className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest opacity-40 hover:opacity-100 transition-opacity"
                          >
                            <Plus size={12} /> Add Line Item
                          </button>
                        </div>

                        {/* Total */}
                        <div className="glass p-6 rounded-2xl border border-app-accent/20 flex justify-between items-center">
                          <span className="text-[10px] font-bold uppercase tracking-widest opacity-60">Total</span>
                          <span className="text-xl font-light text-app-accent">
                            ${quotationItems.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0).toLocaleString()}
                          </span>
                        </div>

                        {/* Notes + Validity */}
                        <div className="space-y-3">
                          <label className="text-[10px] font-bold uppercase tracking-widest opacity-40">Payment Notes</label>
                          <textarea
                            value={quotationNotes}
                            onChange={e => setQuotationNotes(e.target.value)}
                            rows={3}
                            className="w-full bg-app-accent/5 border border-app-border rounded-xl px-4 py-3 text-xs focus:outline-none focus:border-app-accent resize-none"
                          />
                          <div className="flex items-center gap-3">
                            <label className="text-[10px] font-bold uppercase tracking-widest opacity-40 whitespace-nowrap">Valid for (days)</label>
                            <input
                              type="number"
                              value={quotationValidDays}
                              onChange={e => setQuotationValidDays(e.target.value)}
                              className="w-20 bg-app-accent/5 border border-app-border rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-app-accent"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Saved Quotations */}
                      <div className="space-y-6">
                        <h5 className="text-[10px] font-bold uppercase tracking-widest opacity-40">Saved Quotations</h5>
                        {quotations.length > 0 ? quotations.map((q: any) => (
                          <div key={q.id} className="glass p-6 rounded-3xl space-y-3 border-l-2 border-app-accent">
                            <div className="flex justify-between items-start">
                              <div>
                                <p className="text-lg font-light">SAR ${(q.amount / 100).toLocaleString()}</p>
                                <p className="text-[9px] font-mono opacity-40 uppercase">Quotation #{q.id}</p>
                              </div>
                              <span className={`px-2 py-1 rounded-full text-[8px] font-bold uppercase tracking-widest ${q.status === 'PAID' ? 'bg-emerald-500/20 text-emerald-500' : q.status === 'ACCEPTED' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-app-accent/20 text-app-accent'}`}>
                                {q.status}
                              </span>
                            </div>
                            <button
                              onClick={() => handleDownloadQuotation(q)}
                              className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest opacity-40 hover:opacity-100 hover:text-app-accent transition-all mt-1"
                            >
                              <Download size={11} /> Download PDF
                            </button>
                            {q.status !== 'PAID' && (
                              <div className="flex gap-2">
                                {q.status === 'DRAFT' && (
                                  <button
                                    onClick={async () => {
                                      await authFetch(`/api/quotations/${q.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: 'ACCEPTED' }) });
                                      const res = await authFetch(`/api/quotations/${selectedLead.lead_id}`);
                                      setQuotations(await res.json());
                                    }}
                                    className="text-[9px] font-bold uppercase tracking-widest opacity-60 hover:opacity-100 hover:text-yellow-400 transition-all"
                                  >
                                    Mark Accepted
                                  </button>
                                )}
                                {q.status === 'ACCEPTED' && (
                                  <button
                                    onClick={async () => {
                                      await authFetch(`/api/quotations/${q.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: 'PAID' }) });
                                      const res = await authFetch(`/api/quotations/${selectedLead.lead_id}`);
                                      setQuotations(await res.json());
                                    }}
                                    className="text-[9px] font-bold uppercase tracking-widest opacity-60 hover:opacity-100 hover:text-emerald-400 transition-all"
                                  >
                                    Mark Paid
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        )) : (
                          <div className="h-32 border border-dashed border-app-border rounded-3xl flex items-center justify-center opacity-20">
                            <p className="text-[10px] uppercase tracking-widest">No quotations yet</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'calendar' && (
                  <div className="space-y-8 md:space-y-12">
                    <div className="flex justify-between items-center">
                      <h4 className="text-[9px] md:text-[10px] font-bold uppercase tracking-[0.4em] opacity-40">Calendar Booking</h4>
                      <button 
                        onClick={handleBookMeeting}
                        disabled={bookingLoading}
                        className="flex items-center gap-2 px-4 py-2 bg-app-accent text-app-bg rounded-full text-[10px] font-bold uppercase tracking-widest hover:scale-105 transition-all disabled:opacity-50"
                      >
                        {bookingLoading ? <Loader2 size={14} className="animate-spin" /> : <Clock size={14} />}
                        Book Discovery Call
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      <div className="space-y-6">
                        <h5 className="text-[10px] font-bold uppercase tracking-widest opacity-40">Upcoming Meetings</h5>
                        <div className="space-y-4">
                          {bookings.length > 0 ? bookings.map(book => (
                            <div key={book.id} className="glass p-6 rounded-3xl space-y-4 border-l-2 border-app-accent">
                              <div className="flex justify-between items-start">
                                <div>
                                  <p className="text-sm font-light">{book.summary}</p>
                                  <p className="text-[9px] font-mono opacity-40 uppercase">{book.start_time ? new Date(book.start_time).toLocaleString() : 'Time TBD'}</p>
                                </div>
                                <span className="px-2 py-1 rounded-full text-[8px] font-bold uppercase tracking-widest bg-app-accent/20 text-app-accent">
                                  {book.status}
                                </span>
                              </div>
                            </div>
                          )) : (
                            <div className="h-32 border border-dashed border-app-border rounded-3xl flex items-center justify-center opacity-20">
                              <p className="text-[10px] uppercase tracking-widest">No meetings scheduled</p>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="space-y-6">
                        <h5 className="text-[10px] font-bold uppercase tracking-widest opacity-40">Availability Settings</h5>
                        <div className="glass p-8 rounded-[40px] space-y-6 border border-app-border">
                          <div className="flex items-center gap-3">
                            <ShieldCheck size={20} className="text-app-accent" />
                            <p className="text-sm font-light">Google Calendar Sync</p>
                          </div>
                          <p className="text-[11px] opacity-60 leading-relaxed">
                            Your calendar is currently synced with <strong>{ (typeof process !== 'undefined' && process.env?.GOOGLE_CALENDAR_ID) || 'leadjin-engine@google.com'}</strong>.
                            Timezone: <strong>{Intl.DateTimeFormat().resolvedOptions().timeZone}</strong>.
                          </p>
                          <div className="p-4 bg-app-accent/5 rounded-2xl border border-app-accent/20">
                            <p className="text-[9px] leading-relaxed opacity-60">
                              * Discovery calls are automatically set to 45 minutes with a 15-minute buffer.
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Quick Actions Bar */}
              <div className="absolute bottom-0 left-0 right-0 p-4 md:p-6 glass border-t border-app-border flex gap-2 md:gap-3 z-10">
                <button 
                  onClick={() => {
                    const text = `${selectedLead.name}\n${selectedLead.title} @ ${selectedLead.company}\nEmail: ${selectedLead.email || 'N/A'}\nLinkedIn: ${selectedLead.linkedin || 'N/A'}`;
                    navigator.clipboard.writeText(text);
                    setNotification({ message: 'Lead details copied to clipboard', type: 'info' });
                  }}
                  className="w-12 md:w-14 flex items-center justify-center glass rounded-2xl hover:bg-app-accent/10 transition-all"
                  title="Copy Details"
                >
                  <FileText size={16} />
                </button>
                <button 
                  onClick={(e) => toggleContacted(e, selectedLead.lead_id)}
                  className={`flex-1 flex items-center justify-center gap-2 py-3 md:py-4 rounded-2xl text-[9px] md:text-[10px] font-bold uppercase tracking-widest transition-all ${contactedLeads.has(selectedLead.lead_id) ? 'bg-app-accent text-app-bg' : 'glass hover:bg-app-accent/10'}`}
                >
                  <CheckCircle2 size={14} />
                  {contactedLeads.has(selectedLead.lead_id) ? t.contacted : t.markContacted}
                </button>
                <button 
                  onClick={handleInitiateCampaign}
                  className="flex-1 flex items-center justify-center gap-2 py-3 md:py-4 bg-app-accent text-app-bg rounded-2xl text-[9px] md:text-[10px] font-bold uppercase tracking-widest hover:scale-[1.02] active:scale-[0.98] transition-all"
                >
                  <Send size={14} className="rtl:rotate-180" />
                  {t.initiate}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

      {/* Whitepaper Modal */}
      <AnimatePresence>
        {showWhitepaper && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-app-bg/90 backdrop-blur-xl z-[150] flex items-center justify-center p-6"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="glass w-full max-w-4xl max-h-[80vh] rounded-[40px] overflow-hidden flex flex-col border border-app-accent/20"
            >
              <div className="p-8 border-b border-app-accent/10 flex items-center justify-between bg-app-accent/5">
                <div>
                  <h2 className="text-2xl font-bold tracking-tight text-app-accent">GSSE Technical Whitepaper</h2>
                  <p className="text-xs opacity-60 uppercase tracking-widest mt-1">v1.0.4 | Proprietary & Confidential</p>
                </div>
                <button 
                  onClick={() => setShowWhitepaper(false)}
                  className="p-3 hover:bg-app-accent/10 rounded-full transition-colors"
                >
                  <X size={24} />
                </button>
              </div>
              
              <div className="p-8 overflow-y-auto space-y-12 custom-scrollbar">
                <section className="space-y-4">
                  <h3 className="text-lg font-bold flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-app-accent" />
                    1. Executive Summary
                  </h3>
                  <p className="text-sm opacity-70 leading-relaxed">
                    The Geo-Semantic Synthesis Engine (GSSE) represents a paradigm shift in lead generation. By moving beyond simple web scraping to a multi-layered synthesis of physical, digital, and cultural data, GSSE creates a "High-Fidelity Lead Profile" that is cryptographically signed and verified.
                  </p>
                </section>

                <section className="space-y-6">
                  <h3 className="text-lg font-bold flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-app-accent" />
                    2. The Three-Layer Architecture
                  </h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="p-6 glass rounded-3xl border border-app-accent/10 space-y-3">
                      <div className="w-10 h-10 rounded-2xl bg-app-accent/10 flex items-center justify-center text-app-accent">
                        <Database size={20} />
                      </div>
                      <h4 className="font-bold text-sm">Spatial Layer</h4>
                      <p className="text-[11px] opacity-60 leading-relaxed">Verification of physical business existence via geospatial grounding. Eliminates non-existent entities.</p>
                    </div>
                    
                    <div className="p-6 glass rounded-3xl border border-app-accent/10 space-y-3">
                      <div className="w-10 h-10 rounded-2xl bg-app-accent/10 flex items-center justify-center text-app-accent">
                        <ShieldCheck size={20} />
                      </div>
                      <h4 className="font-bold text-sm">Semantic Layer</h4>
                      <p className="text-[11px] opacity-60 leading-relaxed">Cross-platform digital twin synthesis. Merges LinkedIn, Web, and News data into a unified profile.</p>
                    </div>
                    
                    <div className="p-6 glass rounded-3xl border border-app-accent/10 space-y-3">
                      <div className="w-10 h-10 rounded-2xl bg-app-accent/10 flex items-center justify-center text-app-accent">
                        <Trophy size={20} />
                      </div>
                      <h4 className="font-bold text-sm">Cultural Layer</h4>
                      <p className="text-[11px] opacity-60 leading-relaxed">Alignment with regional strategic goals (e.g. Saudi Vision 2030). Contextualizes leads for local relevance.</p>
                    </div>
                  </div>
                </section>

                <section className="space-y-4">
                  <h3 className="text-lg font-bold flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-app-accent" />
                    3. Cryptographic Proof of Origin
                  </h3>
                  <p className="text-sm opacity-70 leading-relaxed">
                    Each lead generated by GSSE is assigned a unique Logic Hash and a Digital Signature. This signature is generated using a proprietary algorithm that factors in the harvest timestamp, the specific AI model parameters, and the source data entropy. This ensures that the lead data is unique to the LEADJIN platform and provides an immutable audit trail for IP protection.
                  </p>
                  <div className="p-4 bg-app-accent/5 rounded-2xl border border-app-accent/10 font-mono text-[10px] text-app-accent/60">
                    SIGNATURE_ALGO: SHA-256(TIMESTAMP + MODEL_ID + DATA_ENTROPY)
                  </div>
                </section>

                <section className="space-y-4">
                  <h3 className="text-lg font-bold flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-app-accent" />
                    4. Strategic Advantage in Saudi Arabia
                  </h3>
                  <p className="text-sm opacity-70 leading-relaxed">
                    GSSE is specifically tuned for the Saudi market. It prioritizes leads that show hiring signals in Vision 2030 sectors, identifies companies with active government contracts, and suggests outreach strategies that respect local business customs and hierarchies.
                  </p>
                </section>
              </div>
              
              <div className="p-6 bg-app-accent/5 border-t border-app-accent/10 flex justify-center">
                <p className="text-[10px] font-bold uppercase tracking-[0.3em] opacity-40">© 2024 LEADJIN - All Rights Reserved</p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Auth Modal */}
      <AnimatePresence>
        {showAuthModal && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm"
            onClick={() => setShowAuthModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="glass rounded-[32px] p-8 w-full max-w-sm mx-4 space-y-6"
              onClick={e => e.stopPropagation()}
            >
              <div className="space-y-1">
                <h2 className="text-xl font-light">
                  {authMode === 'login' ? (t as any).signIn || 'Sign In' : authMode === 'register' ? (t as any).createAccount || 'Create Account' : authMode === 'forgot' ? (t as any).resetPassword || 'Reset Password' : (t as any).newPassword || 'New Password'}
                </h2>
                <p className="text-xs opacity-40">
                  {authMode === 'login' ? (t as any).accessWorkspace || 'Access your LEADJIN workspace.' : authMode === 'register' ? (t as any).startFreeAccount || 'Start your free account — no credit card needed.' : authMode === 'forgot' ? (t as any).enterEmailForReset || "Enter your email and we'll send a reset link." : (t as any).enterNewPassword || 'Enter your new password.'}
                </p>
              </div>
              <form onSubmit={handleAuthSubmit} className="space-y-4">
                {authMode !== 'reset' && (
                  <input
                    type="email" placeholder={(t as any).emailAddress || 'Email address'} required
                    value={authEmail} onChange={e => setAuthEmail(e.target.value)}
                    className="w-full glass rounded-2xl px-5 py-4 text-sm outline-none focus:border-app-accent transition-all"
                  />
                )}
                {(authMode === 'login' || authMode === 'register' || authMode === 'reset') && (
                  <input
                    type="password" placeholder={authMode === 'reset' ? ((t as any).newPassword || 'New password') : ((t as any).password || 'Password')} required
                    value={authPassword} onChange={e => setAuthPassword(e.target.value)}
                    className="w-full glass rounded-2xl px-5 py-4 text-sm outline-none focus:border-app-accent transition-all"
                  />
                )}
                {authMode === 'register' && (
                  <input
                    type="password" placeholder={(t as any).confirmPassword || 'Confirm password'} required
                    value={authConfirmPassword} onChange={e => setAuthConfirmPassword(e.target.value)}
                    className="w-full glass rounded-2xl px-5 py-4 text-sm outline-none focus:border-app-accent transition-all"
                  />
                )}
                {authError && <p className="text-xs text-red-400">{authError}</p>}
                {authSuccess && <p className="text-xs text-emerald-400">{authSuccess}</p>}
                <button
                  type="submit" disabled={authLoading}
                  className="w-full py-4 bg-app-accent text-white rounded-2xl text-xs font-bold uppercase tracking-widest hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {authLoading ? ((t as any).pleaseWait || 'Please wait...') : authMode === 'login' ? ((t as any).signIn || 'Sign In') : authMode === 'register' ? ((t as any).createAccount || 'Create Account') : authMode === 'forgot' ? ((t as any).sendResetLink || 'Send Reset Link') : ((t as any).setNewPassword || 'Set New Password')}
                </button>
              </form>
              <div className="flex justify-between text-xs opacity-40">
                {authMode === 'login' && (
                  <>
                    <button onClick={() => { setAuthMode('forgot'); setAuthError(''); setAuthSuccess(''); }} className="hover:text-app-accent transition-colors">{(t as any).forgotPassword || 'Forgot password?'}</button>
                    <button onClick={() => { setAuthMode('register'); setAuthError(''); setAuthSuccess(''); }} className="text-app-accent hover:underline">{(t as any).dontHaveAccount || 'Sign up'}</button>
                  </>
                )}
                {authMode === 'register' && (
                  <button onClick={() => { setAuthMode('login'); setAuthError(''); setAuthSuccess(''); }} className="mx-auto text-app-accent hover:underline">{(t as any).alreadyHaveAccount || 'Already have an account? Sign in'}</button>
                )}
                {(authMode === 'forgot' || authMode === 'reset') && (
                  <button onClick={() => { setAuthMode('login'); setAuthError(''); setAuthSuccess(''); }} className="mx-auto hover:text-app-accent transition-colors">{(t as any).backToSignIn || 'Back to sign in'}</button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Notification Toast */}
      <AnimatePresence>
        {notification && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[100] px-6 py-3 glass rounded-2xl border border-app-border shadow-2xl flex items-center gap-3 min-w-[300px]"
          >
            <div className={`w-2 h-2 rounded-full ${
              notification.type === 'success' ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]' : 
              notification.type === 'error' ? 'bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.5)]' : 
              'bg-app-accent shadow-[0_0_10px_rgba(242,125,38,0.5)]'
            }`} />
            <p className="text-xs font-bold uppercase tracking-widest">{notification.message}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  </div>
);
}

// Export landingTranslations for use in LandingPage
export { landingTranslations };

export default function App() {
  if (window.location.pathname === '/admin') {
    return <ErrorBoundary><AdminDashboard /></ErrorBoundary>;
  }
  return (
    <ErrorBoundary>
      <AppWithLanding />
    </ErrorBoundary>
  );
}

// Component that handles landing page vs dashboard
function AppWithLanding() {
  const [showDashboard, setShowDashboard] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [hasAuth, setHasAuth] = useState(false);
  const [needsCompanyProfile, setNeedsCompanyProfile] = useState(false);
  const [companyForm, setCompanyForm] = useState({ company_name: '', company_tagline: '', company_email: '', company_phone: '', company_website: '' });
  const [companySaving, setCompanySaving] = useState(false);
  const [companyError, setCompanyError] = useState('');

  useEffect(() => {
    // Check for auth token
    const token = localStorage.getItem('leadjin_token');
    if (token) {
      // Verify token is valid and check company profile
      Promise.all([
        fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
        fetch('/api/user/profile', { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()).catch(() => null)
      ]).then(([authData, profileData]) => {
        if (authData.user) {
          setHasAuth(true);
          // Check if company profile is filled
          if (profileData && profileData.company_name) {
            setShowDashboard(true);
          } else {
            setNeedsCompanyProfile(true);
          }
        } else {
          localStorage.removeItem('leadjin_token');
        }
        setAuthChecked(true);
      }).catch(() => {
        setAuthChecked(true);
      });
    } else {
      setAuthChecked(true);
    }
  }, []);

  const handleCompanySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyForm.company_name.trim() || !companyForm.company_email.trim()) {
      setCompanyError('Company name and email are required.');
      return;
    }
    setCompanySaving(true);
    setCompanyError('');
    try {
      const token = localStorage.getItem('leadjin_token');
      const res = await fetch('/api/user/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(companyForm)
      });
      if (!res.ok) throw new Error('Failed to save');
      setNeedsCompanyProfile(false);
      setShowDashboard(true);
    } catch {
      setCompanyError('Failed to save company profile. Please try again.');
    } finally {
      setCompanySaving(false);
    }
  };

  useEffect(() => {
    const handleGoogleLogin = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === 'GOOGLE_AUTH_SUCCESS' && event.data.token) {
        try { localStorage.setItem('leadjin_token', event.data.token); } catch(e) {}
        setHasAuth(true);
        setShowDashboard(true);
      }
    };
    window.addEventListener('message', handleGoogleLogin);
    return () => window.removeEventListener('message', handleGoogleLogin);
  }, []);

  const handleEnterApp = () => {
    // Start Google OAuth flow
    fetch('/api/auth/google')
      .then(r => r.json())
      .then(data => {
        if (data.url) {
          window.open(data.url, 'google_auth', 'width=500,height=620,left=400,top=100');
        }
      })
      .catch(() => setShowDashboard(true));
  };

  // Show loading while checking auth
  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-app-bg text-app-text">
        <div className="animate-pulse text-sm opacity-50">Loading...</div>
      </div>
    );
  }

  // Show landing page for unauthenticated users
  if (!showDashboard && !hasAuth) {
    return (
      <Suspense fallback={
        <div className="min-h-screen flex items-center justify-center bg-app-bg text-app-text">
          <div className="animate-pulse text-sm opacity-50">Loading...</div>
        </div>
      }>
        <LandingPage onEnterApp={handleEnterApp} />
      </Suspense>
    );
  }

  // Mandatory company profile gate — B2B requires company details before access
  if (needsCompanyProfile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-app-bg text-app-text p-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-lg"
        >
          <div className="text-center mb-10">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-app-accent/10 border border-app-accent/20 mb-6">
              <Building2 className="text-app-accent" size={28} />
            </div>
            <h1 className="text-3xl font-light tracking-tight mb-2">Set Up Your Company</h1>
            <p className="text-sm opacity-50">LEADJIN is built for B2B. Tell us about your company to get started.</p>
          </div>

          <form onSubmit={handleCompanySubmit} className="glass rounded-[24px] p-8 space-y-5">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-widest opacity-40 mb-2">Company Name *</label>
              <input
                type="text"
                value={companyForm.company_name}
                onChange={e => setCompanyForm(f => ({ ...f, company_name: e.target.value }))}
                placeholder="e.g. Euphoria Vision"
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm focus:outline-none focus:border-app-accent/50 transition-colors"
                required
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-widest opacity-40 mb-2">Tagline</label>
              <input
                type="text"
                value={companyForm.company_tagline}
                onChange={e => setCompanyForm(f => ({ ...f, company_tagline: e.target.value }))}
                placeholder="e.g. AI-Powered Lead Intelligence"
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm focus:outline-none focus:border-app-accent/50 transition-colors"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-widest opacity-40 mb-2">Company Email *</label>
              <input
                type="email"
                value={companyForm.company_email}
                onChange={e => setCompanyForm(f => ({ ...f, company_email: e.target.value }))}
                placeholder="e.g. hello@company.com"
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm focus:outline-none focus:border-app-accent/50 transition-colors"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest opacity-40 mb-2">Phone</label>
                <input
                  type="tel"
                  value={companyForm.company_phone}
                  onChange={e => setCompanyForm(f => ({ ...f, company_phone: e.target.value }))}
                  placeholder="+966 5XX XXX XXXX"
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm focus:outline-none focus:border-app-accent/50 transition-colors"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest opacity-40 mb-2">Website</label>
                <input
                  type="url"
                  value={companyForm.company_website}
                  onChange={e => setCompanyForm(f => ({ ...f, company_website: e.target.value }))}
                  placeholder="https://company.com"
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm focus:outline-none focus:border-app-accent/50 transition-colors"
                />
              </div>
            </div>

            {companyError && (
              <p className="text-red-400 text-xs">{companyError}</p>
            )}

            <button
              type="submit"
              disabled={companySaving}
              className="w-full py-4 bg-app-accent text-app-bg rounded-xl font-bold text-sm uppercase tracking-widest hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {companySaving ? 'Saving...' : 'Continue to LEADJIN'}
            </button>
          </form>
        </motion.div>
      </div>
    );
  }

  // Show dashboard
  return <AppContent />;
}
