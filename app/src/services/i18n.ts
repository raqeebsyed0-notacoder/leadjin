/**
 * LeadJin i18n service
 * Simple, no-dependency translation layer with Arabic (Gulf/KSA) and English.
 */

export type Locale = 'en' | 'ar';

export interface I18nService {
  locale: Locale;
  dir: 'ltr' | 'rtl';
  t(key: string): string;
  setLocale(locale: Locale): void;
}

// ---------------------------------------------------------------------------
// Translation dictionaries
// Natural Saudi/Gulf Arabic — professional but not stiff.
// ---------------------------------------------------------------------------
const dict: Record<Locale, Record<string, any>> = {
  en: {
    // Navigation
    dashboard: 'Dashboard',
    harvest: 'Harvest',
    pipeline: 'Pipeline',
    analytics: 'Analytics',
    settings: 'Settings',
    email: 'Email',
    calendar: 'Calendar',
    quotations: 'Quotations',

    // Harvest / Enrichment
    harvestTitle: 'Harvest High-Value Leads',
    targetIndustry: 'Target Industry',
    companySize: 'Company Size',
    geography: 'Geography',
    jobTitles: 'Job Titles',
    enriching: 'Enriching...',
    emailFound: 'Email found',
    phoneFound: 'Phone found',
    verified: 'Verified',
    notFound: 'Not found',
    uploadCsv: 'Upload CSV',
    importLeads: 'Import Leads',
    enrichMissingEmails: 'Enrich missing emails',

    // Pipeline stages
    stageNew: 'New',
    stageContacted: 'Contacted',
    stageReplied: 'Replied',
    stageMeeting: 'Meeting',
    stageProposal: 'Proposal',
    stageClosedWon: 'Closed Won',
    stageClosedLost: 'Closed Lost',

    // CRM / Lead details
    name: 'Name',
    company: 'Company',
    title: 'Title',
    emailLabel: 'Email',
    phone: 'Phone',
    linkedin: 'LinkedIn',
    website: 'Website',
    industry: 'Industry',
    leadScore: 'Lead Score',
    status: 'Status',
    created: 'Created',
    lastActivity: 'Last Activity',

    // Actions
    save: 'Save',
    cancel: 'Cancel',
    delete: 'Delete',
    edit: 'Edit',
    export: 'Export',
    search: 'Search',
    filter: 'Filter',
    send: 'Send',
    bookMeeting: 'Book Meeting',
    downloadPdf: 'Download PDF',
    sendEmail: 'Send Email',
    addNote: 'Add Note',

    // Auth
    login: 'Sign In',
    register: 'Create Account',
    emailAddress: 'Email address',
    password: 'Password',
    forgotPassword: 'Forgot password?',
    signInWithGoogle: 'Sign in with Google',
    trialExpiresIn: 'Trial expires in {days} days',
    upgradePlan: 'Upgrade Plan',
    signIn: 'Sign In',
    createAccount: 'Create Account',
    resetPassword: 'Reset Password',
    newPassword: 'New Password',
    sendResetLink: 'Send Reset Link',
    setNewPassword: 'Set New Password',
    pleaseWait: 'Please wait...',
    alreadyHaveAccount: 'Already have an account? Sign in',
    dontHaveAccount: 'Sign up',
    backToSignIn: 'Back to sign in',
    accessWorkspace: 'Access your LEADJIN workspace.',
    startFreeAccount: 'Start your free account — no credit card needed.',
    enterEmailForReset: "Enter your email and we'll send a reset link.",
    enterNewPassword: 'Enter your new password.',

    // Common
    loading: 'Loading',
    error: 'Error',
    success: 'Success',
    noResults: 'No results',
    areYouSure: 'Are you sure?',
    confirm: 'Confirm',
    today: 'Today',
    yesterday: 'Yesterday',
    daysAgo: '{n} days ago',
    justNow: 'just now',
    leadsCount: 'Leads',
    empty: 'Empty',

    // Existing keys (legacy compatibility)
    light: 'Light',
    dark: 'Dark',
    exportCsv: 'Export CSV',
    googleLogin: 'Google Login',
    configure: 'Configure Profile',
    icp: 'Define your Ideal Customer Profile (ICP)',
    model: 'Intelligence Model',
    industries: 'Target Industries',
    geography2: 'Target Geography',
    harvestBtn: 'Harvest High-Value Leads',
    refine: 'Refine ICP',
    return: 'Cancel & Return to Results',
    confidence: 'Confidence Level',
    score: 'Score Breakdown',
    contact: 'Contact Matrix',
    triggers: 'Trigger Events',
    pain: 'Pain Signals',
    strategy: 'Strategy Recommendation',
    initiate: 'Initiate Campaign',
    markContacted: 'Mark Contacted',
    contacted: 'Contacted',
    newProspect: 'New Prospect',
    welcome: 'Welcome to LEADJIN',
    selectLang: 'Select your preferred language',
    selectTheme: 'Select your preferred theme',
    getStarted: 'Get Started',
    arabic: 'Arabic',
    english: 'English',
    analyticsTitle: 'Engine Intelligence',
    analyticsSub: 'Real-time Performance Metrics',
    totalLeads: 'Total Leads',
    revenue: 'Revenue (USD)',
    pending: 'Pending',
    funnel: 'Conversion Funnel',
    outreachVol: 'Email Outreach Volume',
    settingsTitle: 'Application Settings',
    apiKey: 'Account',
    apiKeySub: 'Manage your LEADJIN account and subscription.',
    install: 'Installation',
    privacy: 'Privacy Controls',
    clearData: 'Clear All Local Data',
    caseStudy: 'Case Study Mode',
    runSimulation: 'Run Case Study Simulation',
    pipelineTitle: 'Lead Pipeline',
    pipelineSub: 'Self-Reliant CRM Engine',
    stages: {
      NEW: 'New',
      CONTACTED: 'Contacted',
      REPLIED: 'Replied',
      MEETING: 'Meeting',
      PROPOSAL: 'Proposal',
      CLOSED: 'Closed',
    },

    // KSA-specific
    prayerTimeConflict: 'Prayer time conflict',
    suggestedTime: 'Suggested time',
    ramadanMode: 'Ramadan Mode',
    vision2030Score: 'Vision 2030 Score',
    vision2030Alignment: 'Vision 2030 Alignment',
    vision2030: 'Vision 2030 Alignment',
    majlisMode: 'Majlis Mode: Cultural Intelligence',
    majlisVersion: 'Majlis Mode: Local Dialect Outreach',
    interactions: 'Interactions',
    vrpProgram: 'VRP Program',
    etiquette: 'Cultural Etiquette',
    alignmentScore: 'Alignment Score',

    // Gmail / integrations
    gmailTitle: 'Gmail Integration',
    gmailSub: 'Connect your Gmail account to send outreach sequences directly from your professional email.',
    gmailConnected: 'Connected',
    gmailDisconnect: 'Disconnect',
    gmailConnect: 'Connect Gmail Account',
    workspaceTitle: 'Google Workspace',
    workspaceSub: 'Connect your professional workspace for automated outreach and calendar synchronization.',
    autonomousMode: 'Autonomous Outreach',
    autonomousSub: 'When enabled, the engine will automatically send follow-up sequences in the background.',
    autonomousModeDisabled: 'Autonomous Mode is disabled. Only Day 0 email can be sent via your local email client.',
    testConnection: 'Test Connection',
    disconnect: 'Disconnect',
    authGuideTitle: 'Simplified Setup',
    authGuideSub: 'Connect your Google Workspace in 3 easy steps',
    authStep1: 'Enable Gmail API in Google Cloud',
    authStep2: 'Create OAuth Credentials',
    authStep3: 'Connect & Automate',
    connectionValid: 'Connection is valid!',
    connectionInvalid: 'Connection invalid. Please reconnect.',
    shareTitle: 'Share with Partner',
    shareSub: 'Generate a secure, time-limited link (48h) with your Gemini API integrated for your partner.',
    shareStatus: 'Link Status',
    shareActive: 'Active (Expires in 48h)',
    shareCopy: 'Copy Integrated Link',
    shareSuccess: 'Shareable link with integrated API copied to clipboard!',
    settingsGeneral: 'General',
    settingsIntegrations: 'Integrations',
    settingsOutreach: 'Outreach & AI',
    settingsServices: 'Services & Pricing',
    settingsSystem: 'System & Engine',

    // Legal
    legalTitle: 'Legal & IP Protection',
    patentTitle: 'Patent Blueprint: GSSE Engine',
    patentSub: 'Geo-Semantic Synthesis Engine (GSSE) - Proprietary Architecture',
    ipStatus: 'IP Status',
    registered: 'Registered',
    patentPending: 'Patent Pending',
    tos: 'Terms of Service',
    privacyPolicy: 'Privacy Policy',
    gsseProof: 'GSSE Intelligence Proof',
    originProof: 'Proof of Origin',
    timestamp: 'Harvest Timestamp',
    logicHash: 'Logic Hash',
    signature: 'Digital Signature',
    spatialHarvest: 'Spatial Harvesting (Layer 1)',
    semanticSynthesis: 'Semantic Synthesis (Layer 2)',
    culturalContext: 'Cultural Contextualization (Layer 3)',
    auditTrail: 'Audit Trail',
    whitepaper: 'Technical Whitepaper',

    // Language toggle
    langToggle: 'AR',
  },

  ar: {
    // Navigation
    dashboard: 'لوحة التحكم',
    harvest: 'اكتشف العملاء',
    pipeline: 'مسار المبيعات',
    analytics: 'التحليلات',
    settings: 'الإعدادات',
    email: 'البريد الإلكتروني',
    calendar: 'التقويم',
    quotations: 'عروض الأسعار',

    // Harvest / Enrichment
    harvestTitle: 'اكتشف العملاء المحتملين',
    targetIndustry: 'القطاع المستهدف',
    companySize: 'حجم الشركة',
    geography: 'المنطقة الجغرافية',
    jobTitles: 'المسميات الوظيفية',
    enriching: 'جاري الإثراء...',
    emailFound: 'تم العثور على البريد',
    phoneFound: 'تم العثور على الهاتف',
    verified: 'موثّق',
    notFound: 'غير موجود',
    uploadCsv: 'رفع ملف CSV',
    importLeads: 'استيراد العملاء',
    enrichMissingEmails: 'إثراء الإيميلات الناقصة',

    // Pipeline stages
    stageNew: 'جديد',
    stageContacted: 'تم التواصل',
    stageReplied: 'ردّ',
    stageMeeting: 'اجتماع',
    stageProposal: 'عرض',
    stageClosedWon: 'أُغلق - رابح',
    stageClosedLost: 'أُغلق - خاسر',

    // CRM / Lead details
    name: 'الاسم',
    company: 'الشركة',
    title: 'المسمى الوظيفي',
    emailLabel: 'البريد الإلكتروني',
    phone: 'الهاتف',
    linkedin: 'لينكدإن',
    website: 'الموقع',
    industry: 'القطاع',
    leadScore: 'درجة العميل',
    status: 'الحالة',
    created: 'تاريخ الإضافة',
    lastActivity: 'آخر نشاط',

    // Actions
    save: 'حفظ',
    cancel: 'إلغاء',
    delete: 'حذف',
    edit: 'تعديل',
    export: 'تصدير',
    search: 'بحث',
    filter: 'تصفية',
    send: 'إرسال',
    bookMeeting: 'حجز اجتماع',
    downloadPdf: 'تحميل PDF',
    sendEmail: 'إرسال إيميل',
    addNote: 'إضافة ملاحظة',

    // Auth
    login: 'تسجيل الدخول',
    register: 'إنشاء حساب',
    emailAddress: 'البريد الإلكتروني',
    password: 'كلمة المرور',
    forgotPassword: 'نسيت كلمة المرور؟',
    signInWithGoogle: 'الدخول بـ Google',
    trialExpiresIn: 'تنتهي التجربة خلال {days} أيام',
    upgradePlan: 'ترقية الباقة',
    signIn: 'دخول',
    createAccount: 'إنشاء حساب',
    resetPassword: 'إعادة تعيين كلمة المرور',
    newPassword: 'كلمة مرور جديدة',
    sendResetLink: 'إرسال رابط الاستعادة',
    setNewPassword: 'تعيين كلمة مرور جديدة',
    pleaseWait: 'انتظر لحظة...',
    alreadyHaveAccount: 'عندك حساب؟ سجّل دخول',
    dontHaveAccount: 'سجّل الآن',
    backToSignIn: 'الرجوع لتسجيل الدخول',
    accessWorkspace: 'ادخل على مساحة عملك في LEADJIN.',
    startFreeAccount: 'ابدأ حسابك مجاناً — بدون بطاقة بنكية.',
    enterEmailForReset: 'أدخل إيميلك وراح نرسل لك رابط استعادة.',
    enterNewPassword: 'أدخل كلمة المرور الجديدة.',

    // Common
    loading: 'جاري التحميل',
    error: 'خطأ',
    success: 'تم بنجاح',
    noResults: 'لا توجد نتائج',
    areYouSure: 'متأكد؟',
    confirm: 'تأكيد',
    today: 'اليوم',
    yesterday: 'أمس',
    daysAgo: 'منذ {n} أيام',
    justNow: 'الآن',
    leadsCount: 'عملاء',
    empty: 'فارغ',

    // Legacy compatibility
    light: 'فاتح',
    dark: 'داكن',
    exportCsv: 'تصدير CSV',
    googleLogin: 'الدخول بجوجل',
    configure: 'إعداد الملف الشخصي',
    icp: 'حدّد ملف عميلك المثالي',
    model: 'نموذج الذكاء',
    industries: 'القطاعات المستهدفة',
    geography2: 'المنطقة الجغرافية',
    harvestBtn: 'اكتشف العملاء ذوي القيمة العالية',
    refine: 'تحسين ICP',
    return: 'إلغاء والعودة للنتائج',
    confidence: 'مستوى الثقة',
    score: 'تفاصيل الدرجة',
    contact: 'معلومات التواصل',
    triggers: 'محفّزات الشراء',
    pain: 'نقاط الألم',
    strategy: 'توصية الاستراتيجية',
    initiate: 'ابدأ الحملة',
    markContacted: 'تحديد كـ متواصَل معه',
    contacted: 'تم التواصل',
    newProspect: 'عميل جديد',
    welcome: 'أهلاً بك في LEADJIN',
    selectLang: 'اختر لغتك المفضلة',
    selectTheme: 'اختر المظهر المفضل',
    getStarted: 'ابدأ الآن',
    arabic: 'العربية',
    english: 'الإنجليزية',
    analyticsTitle: 'تحليلات المحرك',
    analyticsSub: 'مقاييس الأداء اللحظية',
    totalLeads: 'إجمالي العملاء',
    revenue: 'الإيرادات (ريال / دولار)',
    pending: 'قيد الانتظار',
    funnel: 'قمع التحويل',
    outreachVol: 'حجم مراسلات البريد',
    settingsTitle: 'إعدادات التطبيق',
    apiKey: 'الحساب',
    apiKeySub: 'إدارة حسابك واشتراكك في LEADJIN.',
    install: 'التثبيت',
    privacy: 'إعدادات الخصوصية',
    clearData: 'مسح جميع البيانات المحلية',
    caseStudy: 'وضع دراسة الحالة',
    runSimulation: 'تشغيل المحاكاة',
    pipelineTitle: 'مسار العملاء',
    pipelineSub: 'محرك CRM الذاتي',
    stages: {
      NEW: 'جديد',
      CONTACTED: 'تم التواصل',
      REPLIED: 'ردّ',
      MEETING: 'اجتماع',
      PROPOSAL: 'عرض',
      CLOSED: 'مغلق',
    },

    // KSA-specific
    prayerTimeConflict: 'تعارض مع وقت الصلاة',
    suggestedTime: 'وقت مقترح',
    ramadanMode: 'وضع رمضان',
    vision2030Score: 'درجة رؤية 2030',
    vision2030Alignment: 'توافق مع رؤية 2030',
    vision2030: 'توافق رؤية 2030',
    majlisMode: 'وضع المجلس: الذكاء الثقافي',
    majlisVersion: 'وضع المجلس: التواصل باللهجة المحلية',
    interactions: 'التفاعلات',
    vrpProgram: 'برنامج تحقيق الرؤية',
    etiquette: 'الآداب الثقافية',
    alignmentScore: 'درجة التوافق',

    // Gmail / integrations
    gmailTitle: 'ربط Gmail',
    gmailSub: 'اربط حساب Gmail الخاص بك لإرسال تسلسلات التواصل مباشرة من بريدك المهني.',
    gmailConnected: 'متصل',
    gmailDisconnect: 'قطع الاتصال',
    gmailConnect: 'ربط حساب Gmail',
    workspaceTitle: 'مساحة عمل Google',
    workspaceSub: 'اربط مساحة عملك المهنية للتواصل الآلي ومزامنة التقويم.',
    autonomousMode: 'التواصل الذاتي',
    autonomousSub: 'عند التفعيل، المحرك يرسل متابعات تلقائية في الخلفية.',
    autonomousModeDisabled: 'الوضع الذاتي موقوف. يمكن إرسال بريد اليوم 0 فقط عبر عميل البريد.',
    testConnection: 'اختبار الاتصال',
    disconnect: 'قطع الاتصال',
    authGuideTitle: 'إعداد مبسّط',
    authGuideSub: 'اربط Google Workspace في 3 خطوات بسيطة',
    authStep1: 'تفعيل Gmail API في Google Cloud',
    authStep2: 'إنشاء بيانات اعتماد OAuth',
    authStep3: 'الاتصال والأتمتة',
    connectionValid: 'الاتصال يعمل!',
    connectionInvalid: 'الاتصال مقطوع. يرجى إعادة الربط.',
    shareTitle: 'مشاركة مع شريك',
    shareSub: 'أنشئ رابطاً آمناً ومؤقتاً (48 ساعة) مع Gemini API مدمج.',
    shareStatus: 'حالة الرابط',
    shareActive: 'نشط (ينتهي بعد 48 ساعة)',
    shareCopy: 'نسخ الرابط المدمج',
    shareSuccess: 'تم نسخ الرابط إلى الحافظة!',
    settingsGeneral: 'عام',
    settingsIntegrations: 'التكاملات',
    settingsOutreach: 'التواصل والذكاء الاصطناعي',
    settingsServices: 'الخدمات والأسعار',
    settingsSystem: 'النظام والمحرك',

    // Legal
    legalTitle: 'الحماية القانونية والملكية الفكرية',
    patentTitle: 'مخطط البراءة: محرك GSSE',
    patentSub: 'محرك التوليف الجغرافي الدلالي (GSSE) - بنية مملوكة',
    ipStatus: 'حالة الملكية الفكرية',
    registered: 'مسجّل',
    patentPending: 'براءة اختراع معلّقة',
    tos: 'شروط الخدمة',
    privacyPolicy: 'سياسة الخصوصية',
    gsseProof: 'إثبات ذكاء GSSE',
    originProof: 'إثبات المصدر',
    timestamp: 'توقيت الاكتشاف',
    logicHash: 'بصمة المنطق',
    signature: 'التوقيع الرقمي',
    spatialHarvest: 'الاكتشاف المكاني (الطبقة 1)',
    semanticSynthesis: 'التوليف الدلالي (الطبقة 2)',
    culturalContext: 'السياق الثقافي (الطبقة 3)',
    auditTrail: 'سجل التدقيق',
    whitepaper: 'الورقة البيضاء التقنية',

    // Language toggle
    langToggle: 'EN',
  },
};

// ---------------------------------------------------------------------------
// Singleton instance
// ---------------------------------------------------------------------------
let _locale: Locale = (() => {
  try {
    const saved = localStorage.getItem('leadjin_lang');
    return saved === 'ar' ? 'ar' : 'en';
  } catch {
    return 'en';
  }
})();

function applyDocumentDir(locale: Locale) {
  document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr';
  document.documentElement.lang = locale;
}

export const i18n: I18nService = {
  get locale() {
    return _locale;
  },
  get dir(): 'ltr' | 'rtl' {
    return _locale === 'ar' ? 'rtl' : 'ltr';
  },
  t(key: string): string {
    const d = dict[_locale] || dict.en;
    // Support dot-notation for nested keys like "stages.NEW"
    const parts = key.split('.');
    let val: any = d;
    for (const p of parts) {
      val = val?.[p];
      if (val === undefined) break;
    }
    if (typeof val === 'string') return val;
    // Fallback to English
    val = dict.en;
    for (const p of parts) {
      val = val?.[p];
      if (val === undefined) break;
    }
    return typeof val === 'string' ? val : key;
  },
  setLocale(locale: Locale) {
    _locale = locale;
    try { localStorage.setItem('leadjin_lang', locale); } catch { /* noop */ }
    applyDocumentDir(locale);
  },
};

// Apply on load
applyDocumentDir(_locale);

export default i18n;
