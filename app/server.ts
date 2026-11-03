// Prevent server crash from unhandled Gemini SDK rejections
process.on('unhandledRejection', (reason: any) => {
  console.error('[UnhandledRejection]', reason?.message || reason);
});

import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import nodemailer from "nodemailer";
import { google } from "googleapis";
import Database from "better-sqlite3";
import { createHash, createHmac, randomBytes, randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import cors from "cors";
import dns from 'dns/promises';
import net from 'net';
import { generateLeadjinLeads } from "./src/services/geminiService.js";
import { getGenAI } from "./src/services/genaiClient.js";
import { waterfallEnrichment } from './src/services/waterfallEnrichment.js';
import { enrichLead, enqueueEnrichment, enrichBatch, getQueueItem, getEnrichmentStats, type EnrichmentInput, setDatabase } from './src/services/enrichmentEngine.js';
import { initPreCrawlTables, runPreCrawlBatch, getPreCrawlStats, lookupCompany, lookupPerson, searchPeople, startPerpetualCrawl, runDailyVerification, KSA_CITIES, INDUSTRIES, CRAWL_PHASES } from './src/services/preCrawler.js';
import { initEnrichmentTables } from './src/services/enrichmentCache.js';
import { whatsappService } from './src/services/whatsappService.js';
import { intentSignalService } from './src/services/intentSignals.js';
import { createCompleteJinRouter } from './src/services/jinCompleteRoutes.js';
import { createArtisanRouter } from './src/services/artisanRoutes.js';
import { huntExecutives } from './src/services/linkedinHunter.js';
import { fetchWathqLead } from './src/services/wathqService.js';
import { huntOrchestrate, type OrchestrateInput } from './src/services/huntOrchestrator.js';
import { tripleVerify } from './src/services/sovereignVerifier.js';
import { craftOutreach, type LeadProfile, type OutreachContext } from './src/services/visionStrategist.js';
import { ProtocolManager, type ClassifyOptions } from './src/services/protocolManager.js';
import { 
  initIntelligenceSchema, 
  setIntelligenceDatabase,
  updateLeadIntelligence,
  getLeadPipeline,
  getPipelineView,
  getLeadScore,
  getNextAction,
  trackRelationship,
  getRelationshipHistory,
  calculateEngagementMetrics,
  processHuntResult,
  processOutreachSent,
  processReplyReceived,
  updateVisionAlignment,
  getPipelineMetrics,
  type UpdateIntelligenceInput
} from './src/services/intelligenceHub.js';
dotenv.config();

// --- FOUNDER MODE Configuration ---
const FOUNDER_EMAIL = process.env.FOUNDER_EMAIL || '';
const isFounder = (email: string) => FOUNDER_EMAIL ? email?.toLowerCase() === FOUNDER_EMAIL.toLowerCase() : false;

// --- Subscription Status Helper ---
function getSubscriptionStatus(user: any): { status: 'trial' | 'trial_expired' | 'pro' | 'founder'; daysLeft: number; isActive: boolean } {
  if (isFounder(user.email) || user.is_founder) {
    return { status: 'founder', daysLeft: -1, isActive: true };
  }
  if (user.subscription_plan === 'pro') {
    if (user.subscription_expires_at) {
      const expires = new Date(user.subscription_expires_at);
      if (expires > new Date()) {
        return { status: 'pro', daysLeft: Math.ceil((expires.getTime() - Date.now()) / 86400000), isActive: true };
      }
    } else {
      return { status: 'pro', daysLeft: -1, isActive: true };
    }
  }
  if (user.trial_ends_at) {
    const trialEnd = new Date(user.trial_ends_at);
    const daysLeft = Math.ceil((trialEnd.getTime() - Date.now()) / 86400000);
    if (daysLeft > 0) {
      return { status: 'trial', daysLeft, isActive: true };
    }
  }
  return { status: 'trial_expired', daysLeft: 0, isActive: false };
}

// --- N1: Islamic Calendar Configuration ---
// Update these dates yearly for accurate Ramadan/Eid detection
// OR use the dynamic Hijri approximation below (approximate, ±1-2 days)
const RAMADAN_CONFIG = {
  // 2026 dates (Ramadan 1447 ended Mar 2026)
  year: 2026,
  ramadanStart: '2026-02-18',
  ramadanEnd: '2026-03-19',
  eidStart: '2026-03-20',
  eidEnd: '2026-03-23',
  // Use dynamic Hijri approximation (±1-2 days accuracy)
  useDynamicCalc: true,
};

// Simple Hijri approximation (±1-2 days accuracy)
// Based on the fact that Islamic year is ~354 days, ~11 days shorter than Gregorian
function getApproximateHijriDate(gregorianDate: Date): { year: number; month: number; day: number } {
  // Reference: 2026-02-18 is expected to be ~1 Ramadan 1448
  const referenceDate = new Date('2026-02-18');
  const referenceHijri = { year: 1448, month: 1, day: 1 }; // 1 Ramadan 1448
  
  const diffMs = gregorianDate.getTime() - referenceDate.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  // Approximate Hijri days (354 days/year)
  const hijriDays = diffDays * (365 / 354);
  
  let newYear = referenceHijri.year;
  let newMonth = referenceHijri.month;
  let newDay = referenceHijri.day + Math.floor(hijriDays);
  
  // Normalize days/months
  const daysInMonth = 30; // Approximate (Hijri months alternate 29/30)
  while (newDay > daysInMonth) {
    newDay -= daysInMonth;
    newMonth++;
    if (newMonth > 12) {
      newMonth = 1;
      newYear++;
    }
  }
  while (newDay < 1) {
    newMonth--;
    if (newMonth < 1) {
      newMonth = 12;
      newYear--;
    }
    newDay += daysInMonth;
  }
  
  return { year: newYear, month: newMonth, day: newDay };
}

// Get Ramadan dates for current year (dynamic or fixed)
function getRamadanDatesForYear(year: number): { ramadanStart: Date; ramadanEnd: Date; eidStart: Date; eidEnd: Date } {
  if (!RAMADAN_CONFIG.useDynamicCalc) {
    // Use fixed config dates
    return {
      ramadanStart: new Date(RAMADAN_CONFIG.ramadanStart),
      ramadanEnd: new Date(RAMADAN_CONFIG.ramadanEnd),
      eidStart: new Date(RAMADAN_CONFIG.eidStart),
      eidEnd: new Date(RAMADAN_CONFIG.eidEnd),
    };
  }
  
  // Dynamic calculation: Ramadan is month 9 in Hijri calendar
  // Find approximate Gregorian date for 1 Ramadan of given year
  // 1 Ramadan 1448 ≈ 2026-02-18 (difference of ~33 Hijri years from 2026)
  const hijriYear = 1448 + (year - 2026);
  const approxStart = new Date(year, 1, 18); // Feb 18 baseline
  
  // Adjust for year offset (354-day Hijri year drifts ~11 days earlier each Gregorian year)
  const yearDiff = year - 2026;
  const driftDays = yearDiff * 11; // ~11 days earlier per year
  approxStart.setDate(approxStart.getDate() - driftDays);
  
  // Ramadan lasts 29-30 days, Eid is 1-3 days after
  const ramadanStart = new Date(approxStart);
  const ramadanEnd = new Date(ramadanStart);
  ramadanEnd.setDate(ramadanEnd.getDate() + 29); // 30 days of Ramadan
  
  const eidStart = new Date(ramadanEnd);
  eidStart.setDate(eidStart.getDate() + 1);
  const eidEnd = new Date(eidStart);
  eidEnd.setDate(eidEnd.getDate() + 3); // 4 days of Eid
  
  return { ramadanStart, ramadanEnd, eidStart, eidEnd };
}

// --- Startup validation ---
const REQUIRED_ENV: Record<string, string> = {
  GEMINI_API_KEY: 'Lead harvesting will be disabled',
};
let startupWarnings = 0;
for (const [key, impact] of Object.entries(REQUIRED_ENV)) {
  if (!process.env[key]) {
    console.warn(`[CONFIG] Missing ${key} — ${impact}`);
    startupWarnings++;
  }
}
if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
  console.warn('[CONFIG] Missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET — Gmail integration disabled');
}

// LEADJIN_ADMIN_SECRET is required for unsubscribe token security
if (!process.env.LEADJIN_ADMIN_SECRET) {
  console.error('[CONFIG] FATAL: LEADJIN_ADMIN_SECRET is required for email unsubscribe security.');
  console.error('[CONFIG] Generate a secure random string and set it as LEADJIN_ADMIN_SECRET.');
  process.exit(1);
}

if (startupWarnings > 0) console.warn(`[CONFIG] ${startupWarnings} env var(s) missing. Check your .env file.`);

// Waterfall Enrichment Providers (optional — add API keys to enable)
// HUNTER_API_KEY - Hunter.io email finder + verifier
// APOLLO_API_KEY - Apollo.io people enrichment (email + phone)
// SNOV_API_KEY + SNOV_API_SECRET - Snov.io email finder

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- PM2/TSX Path Resolution Fix ---
// When running via tsx under PM2, __dirname may resolve incorrectly.
// Use LEADJIN_PROJECT_ROOT env var if set, otherwise fallback to __dirname.
const PROJECT_ROOT = process.env.LEADJIN_PROJECT_ROOT || __dirname;

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);

// Security middleware - relaxed for Vite dev mode
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "blob:"], // unsafe-eval for Vite HMR, blob for workers
      styleSrc: ["'self'", "'unsafe-inline'", "https:"], // allow Google Fonts and other external styles
      styleSrcElem: ["'self'", "'unsafe-inline'", "https:"],
      imgSrc: ["'self'", "data:", "blob:", "https:"],
      connectSrc: process.env.NODE_ENV === 'production' 
        ? ["'self'", process.env.APP_URL || ''].filter(Boolean) 
        : ["'self'", "ws://localhost:*", "wss://localhost:*", "http://localhost:*", "https://localhost:*"],
      fontSrc: ["'self'", "data:", "https:"], // Google Fonts
      objectSrc: ["'none'"],
      upgradeInsecureRequests: null, // Must be null to disable — Helmet enables this by default
    },
  },
  hsts: false, // No HSTS — app served over HTTP on LAN
}));
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile, curl) and any origin matching APP_URL host or localhost
    if (!origin) return callback(null, true);
    const allowed = process.env.APP_URL || 'http://localhost:3001';
    const allowedUrl = new URL(allowed);
    try {
      const requestUrl = new URL(origin);
      if (requestUrl.port === allowedUrl.port || origin === allowed) {
        return callback(null, true);
      }
    } catch {}
    return callback(null, true); // LAN deployment — reflect origin
  },
  credentials: true
}));

app.use(express.json());

// --- Rate Limiting for Auth Endpoints ---
// Strict limiter for login/register/password reset only (not for /me or /google/*)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'test' ? 10000 : 100,
  message: { error: 'Too many requests, please try again in 15 minutes.' },
  skip: (req) => {
    const email = req.body?.email;
    return isFounder(email);
  }
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth/forgot', authLimiter);
app.use('/api/auth/reset', authLimiter);

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// --- Database Setup (CRM & Email Queue) ---
let db: Database.Database;
try {
  db = new Database(process.env.DATABASE_PATH || process.env.DB_PATH || "leadjin.db");
  // Enable WAL mode for better concurrent write performance
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  console.log("Database initialized successfully (WAL mode enabled).");
} catch (error) {
  console.error("Failed to initialize database:", error);
  // In production, crash on DB failure. Only use in-memory for test environment
  if (process.env.NODE_ENV === 'production') {
    console.error('[FATAL] Database connection failed in production. Exiting.');
    process.exit(1);
  } else if (process.env.NODE_ENV === 'test') {
    db = new Database(":memory:");
    console.warn("[TEST MODE] Falling back to in-memory database.");
  } else {
    console.error('[FATAL] Database connection failed. Set NODE_ENV=test to use in-memory fallback.');
    process.exit(1);
  }
}

// Initialize tables (all columns consolidated — fresh DB has complete schema)
// Initialize Intelligence Hub schema (adds new columns to leads table)
initIntelligenceSchema(db);
setIntelligenceDatabase(db);

db.exec(`
  CREATE TABLE IF NOT EXISTS leads (
    lead_id TEXT PRIMARY KEY,
    user_id INTEGER,
    name TEXT,
    title TEXT,
    company TEXT,
    email TEXT,
    phone TEXT,
    linkedin TEXT,
    twitter TEXT,
    website TEXT,
    industry TEXT,
    status TEXT DEFAULT 'NEW',
    lead_score INTEGER,
    vision_2030_score INTEGER,
    vision_2030_program TEXT,
    vision_2030_alignment TEXT,
    email_verified INTEGER DEFAULT 0,
    email_source TEXT DEFAULT 'gemini',
    do_not_contact INTEGER DEFAULT 0,
    stage_entered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS email_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lead_id TEXT,
    user_id INTEGER,
    to_email TEXT NOT NULL,
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    status TEXT DEFAULT 'PENDING', -- PENDING, SENT, FAILED, CANCELLED
    attempt_count INTEGER DEFAULT 0,
    last_error TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    sent_at DATETIME,
    scheduled_at DATETIME,
    last_attempt_at DATETIME
  );

  CREATE TABLE IF NOT EXISTS email_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email_queue_id INTEGER NOT NULL,
    event_type TEXT NOT NULL, -- 'open', 'click'
    metadata TEXT, -- JSON: { url: '...' } for clicks
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS activity_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lead_id TEXT,
    user_id INTEGER,
    type TEXT, -- EMAIL_SENT, STATUS_CHANGE, NOTE
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS email_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    name TEXT,
    subject TEXT,
    body TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, name)
  );

  CREATE TABLE IF NOT EXISTS invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lead_id TEXT,
    user_id INTEGER,
    amount INTEGER, -- in cents
    currency TEXT DEFAULT 'SAR',
    status TEXT DEFAULT 'PENDING', -- PENDING, PAID, CANCELLED
    vat_rate REAL DEFAULT 0.15,
    vat_amount INTEGER DEFAULT 0,
    subtotal INTEGER DEFAULT 0,
    company_vat_number TEXT,
    payment_link TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lead_id TEXT,
    user_id INTEGER,
    start_time DATETIME,
    end_time DATETIME,
    summary TEXT,
    status TEXT DEFAULT 'CONFIRMED',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS proposals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    lead_id TEXT,
    title TEXT,
    content TEXT, -- JSON blob: { intro, services[], pricing, terms, footer }
    status TEXT DEFAULT 'DRAFT',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS google_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER UNIQUE,
    user_email TEXT UNIQUE,
    user_name TEXT,
    access_token TEXT,
    refresh_token TEXT,
    expiry_date INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    api_key_hash TEXT,
    password_hash TEXT,
    subscription_plan TEXT DEFAULT 'free',
    subscription_expires_at DATETIME,
    monthly_searches_used INTEGER DEFAULT 0,
    monthly_searches_limit INTEGER DEFAULT 10,
    monthly_reset_date TEXT DEFAULT (strftime('%Y-%m', 'now')),
    tier TEXT DEFAULT 'basic',
    daily_quota INTEGER DEFAULT 50,
    daily_used INTEGER DEFAULT 0,
    quota_reset_date TEXT DEFAULT (date('now')),
    upgraded_at DATETIME,
    company_name TEXT,
    company_tagline TEXT,
    company_email TEXT,
    company_phone TEXT,
    company_website TEXT,
    company_address TEXT,
    company_logo TEXT,
    preferences TEXT DEFAULT '{}',
    plan TEXT DEFAULT 'free',
    is_founder INTEGER DEFAULT 0,
    is_admin INTEGER DEFAULT 0,
    ramadan_override INTEGER DEFAULT 0,
    gemini_api_key TEXT,
    trial_ends_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token TEXT UNIQUE NOT NULL,
    user_id INTEGER NOT NULL,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Insert default template (global fallback)
  INSERT OR IGNORE INTO email_templates (user_id, name, subject, body) VALUES (
    NULL,
    'Default Outreach',
    'Partnership Opportunity: {{company}}',
    'Hi {{name}},\n\nI noticed {{company}} is doing some great work in {{industry}}.\n\nBest,\nLEADJIN'
  );

  CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token TEXT UNIQUE NOT NULL,
    expires_at DATETIME NOT NULL,
    used INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS service_catalog (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    base_price REAL DEFAULT 0,
    currency TEXT DEFAULT 'SAR',
    category TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS email_sequences (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'draft',
    steps_json TEXT NOT NULL,
    settings_json TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS sequence_enrollments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sequence_id INTEGER NOT NULL,
    lead_id TEXT NOT NULL,
    user_id INTEGER NOT NULL,
    current_step INTEGER DEFAULT 0,
    status TEXT DEFAULT 'active',
    enrolled_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    next_send_at DATETIME,
    completed_at DATETIME,
    UNIQUE(sequence_id, lead_id)
  );

  CREATE TABLE IF NOT EXISTS outreach_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lead_id TEXT NOT NULL,
    user_id INTEGER NOT NULL,
    message_type TEXT NOT NULL,
    subject TEXT,
    body TEXT NOT NULL,
    language TEXT DEFAULT 'en',
    status TEXT DEFAULT 'draft',
    sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS lead_replies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lead_id TEXT NOT NULL,
    user_id INTEGER NOT NULL,
    original_outreach_id INTEGER,
    reply_body TEXT NOT NULL,
    category TEXT NOT NULL,
    confidence REAL DEFAULT 0,
    suggested_response TEXT,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Performance indexes for analytics queries
try { db.exec("CREATE INDEX IF NOT EXISTS idx_leads_user ON leads(user_id)"); } catch(e) {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_leads_user_status ON leads(user_id, status)"); } catch(e) {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_leads_created ON leads(user_id, created_at)"); } catch(e) {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_invoices_user ON invoices(user_id, status)"); } catch(e) {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_email_queue_user ON email_queue(user_id, sent_at)"); } catch(e) {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_activity_log_user ON activity_log(user_id, created_at)"); } catch(e) {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_email_events_queue ON email_events(email_queue_id)"); } catch(e) {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token)"); } catch(e) {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at)"); } catch(e) {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_sequences_user ON email_sequences(user_id, status)"); } catch(e) {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_enrollments_sequence ON sequence_enrollments(sequence_id, status)"); } catch(e) {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_enrollments_next_send ON sequence_enrollments(status, next_send_at)"); } catch(e) {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_bookings_user ON bookings(user_id)"); } catch(e) {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_bookings_lead ON bookings(lead_id)"); } catch(e) {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_bookings_start ON bookings(start_time)"); } catch(e) {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_outreach_lead ON outreach_messages(lead_id, user_id)"); } catch(e) {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_outreach_sent ON outreach_messages(user_id, sent_at)"); } catch(e) {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_replies_lead ON lead_replies(lead_id, user_id)"); } catch(e) {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_replies_created ON lead_replies(user_id, created_at)"); } catch(e) {}

// Legacy migrations removed — all columns consolidated into CREATE TABLE above
// Foreign key enforcement (for data integrity)
db.pragma('foreign_keys = ON');

// Safe migrations for existing databases — add columns that may not exist yet
const safeMigrations = [
  // leads table columns that might be missing in old DBs
  "ALTER TABLE leads ADD COLUMN phone TEXT",
  "ALTER TABLE leads ADD COLUMN twitter TEXT",
  "ALTER TABLE leads ADD COLUMN website TEXT",
  "ALTER TABLE leads ADD COLUMN pain_signals TEXT",
  "ALTER TABLE leads ADD COLUMN outreach_sequence TEXT",
  "ALTER TABLE leads ADD COLUMN majlis_tips TEXT",
  "ALTER TABLE leads ADD COLUMN email_verified INTEGER DEFAULT 0",
  "ALTER TABLE leads ADD COLUMN email_source TEXT DEFAULT 'gemini'",
  "ALTER TABLE leads ADD COLUMN do_not_contact INTEGER DEFAULT 0",
  "ALTER TABLE leads ADD COLUMN stage_entered_at DATETIME DEFAULT CURRENT_TIMESTAMP",
  // Task 1C: Website verification columns
  "ALTER TABLE leads ADD COLUMN website_verified INTEGER DEFAULT 0",
  "ALTER TABLE leads ADD COLUMN website_status INTEGER",
  // users table columns that might be missing in old DBs
  "ALTER TABLE users ADD COLUMN company_name TEXT",
  "ALTER TABLE users ADD COLUMN company_tagline TEXT",
  "ALTER TABLE users ADD COLUMN company_email TEXT",
  "ALTER TABLE users ADD COLUMN company_phone TEXT",
  "ALTER TABLE users ADD COLUMN company_website TEXT",
  "ALTER TABLE users ADD COLUMN company_address TEXT",
  "ALTER TABLE users ADD COLUMN company_logo TEXT",
  "ALTER TABLE users ADD COLUMN tier TEXT DEFAULT 'basic'",
  "ALTER TABLE users ADD COLUMN daily_quota INTEGER DEFAULT 50",
  "ALTER TABLE users ADD COLUMN daily_used INTEGER DEFAULT 0",
  "ALTER TABLE users ADD COLUMN quota_reset_date TEXT DEFAULT (date('now'))",
  "ALTER TABLE users ADD COLUMN upgraded_at DATETIME",
  "ALTER TABLE users ADD COLUMN preferences TEXT DEFAULT '{}'",
  "ALTER TABLE users ADD COLUMN plan TEXT DEFAULT 'free'",
  "ALTER TABLE users ADD COLUMN is_founder INTEGER DEFAULT 0",
  "ALTER TABLE users ADD COLUMN is_admin INTEGER DEFAULT 0",
  "ALTER TABLE users ADD COLUMN ramadan_override INTEGER DEFAULT 0",
  "ALTER TABLE users ADD COLUMN gemini_api_key TEXT",
  "ALTER TABLE users ADD COLUMN trial_ends_at DATETIME",
  // email_queue columns that might be missing
  "ALTER TABLE email_queue ADD COLUMN attempt_count INTEGER DEFAULT 0",
  "ALTER TABLE email_queue ADD COLUMN scheduled_at DATETIME",
  "ALTER TABLE email_queue ADD COLUMN sent_at DATETIME",
  "ALTER TABLE email_queue ADD COLUMN error TEXT",
  // Enrichment credit columns
  "ALTER TABLE users ADD COLUMN enrichment_credits INTEGER DEFAULT 0",
  "ALTER TABLE users ADD COLUMN enrichment_credits_used INTEGER DEFAULT 0",
  "ALTER TABLE leads ADD COLUMN company_x_handle TEXT",
  "ALTER TABLE leads ADD COLUMN company_snapchat TEXT",
  "ALTER TABLE leads ADD COLUMN company_tiktok TEXT",
  "ALTER TABLE leads ADD COLUMN whatsapp_verified INTEGER DEFAULT 0",
  "ALTER TABLE leads ADD COLUMN phone TEXT",
  "ALTER TABLE leads ADD COLUMN email_confidence REAL DEFAULT 0",
];

for (const migration of safeMigrations) {
  try {
    db.exec(migration);
  } catch (e: any) {
    // Column already exists — ignore
    if (!e.message?.includes('duplicate column')) {
      console.warn(`[Migration] ${migration}: ${e.message}`);
    }
  }
}
console.log('[Migration] Safe column migrations complete.');

// Pre-crawl database tables
initPreCrawlTables(db);

// Enrichment cache tables
initEnrichmentTables(db);



// Wire DB into enrichment engine
setDatabase(db);

// Credit transaction log table
db.exec(`
  CREATE TABLE IF NOT EXISTS credit_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    amount INTEGER NOT NULL,
    balance_after INTEGER NOT NULL,
    type TEXT NOT NULL,
    description TEXT,
    reference_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);
try { db.exec("CREATE INDEX IF NOT EXISTS idx_credit_txn_user ON credit_transactions(user_id, created_at)"); } catch(e) {}

// Intent signals table
db.exec(`
  CREATE TABLE IF NOT EXISTS intent_signals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lead_id TEXT,
    company TEXT NOT NULL,
    signal_type TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    source TEXT,
    url TEXT,
    confidence INTEGER DEFAULT 50,
    detected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    dismissed INTEGER DEFAULT 0,
    user_id INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_signals_lead ON intent_signals(lead_id);
  CREATE INDEX IF NOT EXISTS idx_signals_company ON intent_signals(company);
`);

// Backfill trial_ends_at for existing free users who don't have it set
try {
  db.prepare(`
    UPDATE users
    SET trial_ends_at = datetime(created_at, '+14 days'),
        subscription_plan = 'trial',
        monthly_searches_limit = -1
    WHERE subscription_plan = 'free'
      AND is_founder = 0
      AND trial_ends_at IS NULL
  `).run();
} catch (e) { /* already backfilled */ }

// WhatsApp Messages table
db.exec(`
  CREATE TABLE IF NOT EXISTS whatsapp_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    lead_id TEXT,
    wa_message_id TEXT UNIQUE,
    direction TEXT NOT NULL,
    phone TEXT NOT NULL,
    message_type TEXT,
    content TEXT,
    status TEXT DEFAULT 'sent',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);
try { db.exec("CREATE INDEX IF NOT EXISTS idx_wa_messages_lead ON whatsapp_messages(lead_id, user_id)"); } catch(e) {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_wa_messages_wa_id ON whatsapp_messages(wa_message_id)"); } catch(e) {}
console.log('[Migration] WhatsApp messages table ready.');

// WhatsApp Sequence tables
db.exec(`
  CREATE TABLE IF NOT EXISTS wa_sequences (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'draft',
    steps_json TEXT NOT NULL,
    settings_json TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS wa_enrollments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sequence_id INTEGER NOT NULL,
    lead_id TEXT NOT NULL,
    user_id INTEGER NOT NULL,
    current_step INTEGER DEFAULT 0,
    status TEXT DEFAULT 'active',
    enrolled_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    next_send_at DATETIME,
    completed_at DATETIME,
    UNIQUE(sequence_id, lead_id)
  );
`);
try { db.exec("CREATE INDEX IF NOT EXISTS idx_wa_sequences_user ON wa_sequences(user_id, status)"); } catch(e) {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_wa_enrollments_seq ON wa_enrollments(sequence_id, status)"); } catch(e) {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_wa_enrollments_next ON wa_enrollments(status, next_send_at)"); } catch(e) {}
console.log('[Migration] WhatsApp sequence tables ready.');

// AI Price Suggestion cache (in-memory only, cleared on restart)
const priceSuggestionCache = new Map<string, { result: any; timestamp: number }>();
const PRICE_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

// Hijri Date Conversion Helper
function gregorianToHijri(date: Date): { year: number; month: number; day: number; formatted: string } {
  // Approximate conversion formula (good enough for most use cases)
  const gregYear = date.getFullYear();
  const gregMonth = date.getMonth() + 1;
  const gregDay = date.getDate();
  
  // Julian day number
  let jd = Math.floor((1461 * (gregYear + 4800 + Math.floor((gregMonth - 14) / 12))) / 4) +
           Math.floor((367 * (gregMonth - 2 - 12 * Math.floor((gregMonth - 14) / 12))) / 12) -
           Math.floor((3 * Math.floor((gregYear + 4900 + Math.floor((gregMonth - 14) / 12)) / 100)) / 4) +
           gregDay - 32075;
  
  // Approximate Hijri date
  let l = jd - 1948440 + 10632;
  let n = Math.floor((l - 1) / 10631);
  l = l - 10631 * n + 354;
  let j = (Math.floor((10985 - l) / 5316)) * (Math.floor((50 * l) / 17719)) + (Math.floor(l / 5670)) * (Math.floor((43 * l) / 15238));
  l = l - (Math.floor((30 - j) / 15)) * (Math.floor((17719 * j) / 50)) - (Math.floor(j / 16)) * (Math.floor((15238 * j) / 43)) + 29;
  
  const hijriMonth = Math.floor((24 * l) / 709);
  const hijriDay = l - Math.floor((709 * hijriMonth) / 24);
  const hijriYear = 30 * n + j - 30;
  
  // Arabic numerals
  const arabicDigits = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  const toArabic = (n: number) => n.toString().split('').map(d => arabicDigits[parseInt(d)]).join('');
  
  return {
    year: hijriYear,
    month: hijriMonth,
    day: hijriDay,
    formatted: `${toArabic(hijriYear)}/${toArabic(hijriMonth).padStart(2, '٠')}/${toArabic(hijriDay).padStart(2, '٠')}`
  };
}

// --- Helpers ---
const hashPassword = async (pw: string) => bcrypt.hash(pw, 10);
const verifyPassword = async (pw: string, hash: string) => bcrypt.compare(pw, hash);

const getUserFromToken = (req: express.Request): any | null => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return null;
  const session = db.prepare("SELECT * FROM sessions WHERE token = ? AND expires_at > datetime('now')").get(token) as any;
  if (!session) return null;
  return db.prepare("SELECT * FROM users WHERE id = ?").get(session.user_id);
};

const requireAuth = (req: express.Request, res: express.Response): any | null => {
  const user = getUserFromTokenCached(req);
  if (!user) {
    res.status(401).json({ error: "authentication required" });
    return null;
  }
  return user;
};

const resetMonthlyIfNeeded = (userId: number) => {
  const thisMonth = new Date().toISOString().slice(0, 7);
  db.prepare("UPDATE users SET monthly_searches_used = 0, monthly_reset_date = ? WHERE id = ? AND monthly_reset_date != ?")
    .run(thisMonth, userId, thisMonth);
};

// --- Enrichment Credit Helpers ---
function checkEnrichmentCredits(userId: number, needed: number): { hasCredits: boolean; balance: number; needed: number } {
  const row = db.prepare("SELECT enrichment_credits, enrichment_credits_used FROM users WHERE id = ?").get(userId) as any;
  const balance = (row?.enrichment_credits ?? 0) - (row?.enrichment_credits_used ?? 0);
  return { hasCredits: balance >= needed, balance, needed };
}

function debitEnrichmentCredits(userId: number, amount: number, type: string, description: string, referenceId?: string): void {
  db.prepare("UPDATE users SET enrichment_credits_used = enrichment_credits_used + ? WHERE id = ?").run(amount, userId);
  const row = db.prepare("SELECT enrichment_credits, enrichment_credits_used FROM users WHERE id = ?").get(userId) as any;
  const balanceAfter = (row?.enrichment_credits ?? 0) - (row?.enrichment_credits_used ?? 0);
  db.prepare("INSERT INTO credit_transactions (user_id, amount, balance_after, type, description, reference_id) VALUES (?, ?, ?, ?, ?, ?)")
    .run(userId, -amount, balanceAfter, type, description, referenceId ?? null);
}

function grantEnrichmentCredits(userId: number, amount: number, type: string, description: string): void {
  db.prepare("UPDATE users SET enrichment_credits = enrichment_credits + ? WHERE id = ?").run(amount, userId);
  const row = db.prepare("SELECT enrichment_credits, enrichment_credits_used FROM users WHERE id = ?").get(userId) as any;
  const balanceAfter = (row?.enrichment_credits ?? 0) - (row?.enrichment_credits_used ?? 0);
  db.prepare("INSERT INTO credit_transactions (user_id, amount, balance_after, type, description) VALUES (?, ?, ?, ?, ?)")
    .run(userId, amount, balanceAfter, type, description);
}

// --- Session Cleanup Job ---
setInterval(() => {
  try {
    const result = db.prepare("DELETE FROM sessions WHERE expires_at < datetime('now')").run();
    if (result.changes > 0) {
      console.log(`[SessionCleanup] Removed ${result.changes} expired sessions`);
    }
  } catch (e: any) {
    console.error('[SessionCleanup] Error:', e.message);
  }
}, 60 * 60 * 1000); // Run every hour

// --- API Key Encryption ---
import { createCipheriv, createDecipheriv, scryptSync } from 'crypto';

const ENCRYPTION_KEY = process.env.LEADJIN_ADMIN_SECRET 
  ? scryptSync(process.env.LEADJIN_ADMIN_SECRET, 'salt', 32) 
  : null;

function encryptApiKey(key: string): string {
  if (!ENCRYPTION_KEY) return key; // Fallback if no secret set
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(key, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

function decryptApiKey(encryptedKey: string): string {
  if (!ENCRYPTION_KEY || !encryptedKey.includes(':')) return encryptedKey; // Fallback
  const [ivHex, authTagHex, encrypted] = encryptedKey.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const decipher = createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// --- Email HTML Sanitization ---
const ALLOWED_TAGS = ['p', 'br', 'b', 'i', 'strong', 'em', 'a', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'span', 'div'];
const ALLOWED_ATTRS = ['href', 'target', 'style', 'class'];

function sanitizeHtml(html: string): string {
  // Simple HTML sanitization - remove all tags not in allowlist
  return html.replace(/<\/?([a-zA-Z0-9]+)([^>]*)>/g, (match, tagName, attrs) => {
    const lowerTag = tagName.toLowerCase();
    if (!ALLOWED_TAGS.includes(lowerTag)) {
      return ''; // Remove disallowed tags
    }
    
    // Parse and filter attributes
    const allowedAttrs: string[] = [];
    const attrRegex = /([a-zA-Z-]+)=["']([^"']*)["']/g;
    let attrMatch;
    while ((attrMatch = attrRegex.exec(attrs)) !== null) {
      const attrName = attrMatch[1].toLowerCase();
      const attrValue = attrMatch[2];
      if (ALLOWED_ATTRS.includes(attrName)) {
        if (attrName === 'href') {
          // Only allow http/https links
          if (attrValue.startsWith('http://') || attrValue.startsWith('https://') || attrValue.startsWith('mailto:')) {
            allowedAttrs.push(`${attrName}="${attrValue}"`);
          }
        } else {
          allowedAttrs.push(`${attrName}="${attrValue}"`);
        }
      }
    }
    
    const attrStr = allowedAttrs.length > 0 ? ' ' + allowedAttrs.join(' ') : '';
    return `<${match.startsWith('</') ? '/' : ''}${lowerTag}${attrStr}>`;
  });
}

// --- User Auth Routes ---

// Register new user with email + password
app.post("/api/auth/register", async (req, res) => {
  const { email: rawEmail, password } = req.body;
  const email = rawEmail?.toLowerCase().trim();
  if (!email || !password) return res.status(400).json({ error: "email and password required" });
  if (password.length < 8) return res.status(400).json({ error: "password must be at least 8 characters" });
  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
  if (existing) return res.status(409).json({ error: "email already registered" });
  
  const password_hash = await hashPassword(password);
  const founder = isFounder(email);
  
  // Founder gets instant elevation
  if (founder) {
    db.prepare("INSERT INTO users (email, password_hash, subscription_plan, monthly_searches_limit, plan, is_founder, is_admin, ramadan_override) VALUES (?, ?, 'founder', -1, 'founder', 1, 1, 1)").run(email, password_hash);
    console.log(`[FOUNDER MODE] Account auto-created for ${email} with full privileges`);
  } else {
    const trialEnds = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().replace('T', ' ').split('.')[0];
    db.prepare("INSERT INTO users (email, password_hash, subscription_plan, monthly_searches_limit, plan, trial_ends_at) VALUES (?, ?, 'trial', -1, 'trial', ?)").run(email, password_hash, trialEnds);
  }
  
  const user = db.prepare("SELECT id, email, subscription_plan, monthly_searches_used, monthly_searches_limit, subscription_expires_at, trial_ends_at, plan, is_founder, is_admin, ramadan_override FROM users WHERE email = ?").get(email) as any;

  // Grant 50 trial enrichment credits to new non-founder users
  if (!founder) {
    grantEnrichmentCredits(user.id, 50, 'trial_grant', '50 free enrichment credits on trial signup');
  }

  const token = randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().replace('T', ' ').split('.')[0];
  db.prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)").run(token, user.id, expires);
  const subStatus = getSubscriptionStatus(user);
  res.json({ status: "registered", token, user: { ...user, founder: !!user.is_founder, subscription_status: subStatus.status, subscription_days_left: subStatus.daysLeft, subscription_active: subStatus.isActive } });
});

// Login with email + password
app.post("/api/auth/login", async (req, res) => {
  const { email: rawEmail, password } = req.body;
  const email = rawEmail?.toLowerCase().trim();
  if (!email || !password) return res.status(400).json({ error: "email and password required" });
  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email) as any;
  if (!user || !user.password_hash) return res.status(401).json({ error: "invalid credentials" });
  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: "invalid credentials" });
  resetMonthlyIfNeeded(user.id);
  const fresh = db.prepare("SELECT id, email, subscription_plan, monthly_searches_used, monthly_searches_limit, subscription_expires_at, trial_ends_at, plan, is_founder, is_admin, ramadan_override FROM users WHERE id = ?").get(user.id) as any;
  const token = randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().replace('T', ' ').split('.')[0];
  db.prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)").run(token, user.id, expires);
  const subStatus = getSubscriptionStatus(fresh);
  res.json({ status: "ok", token, user: { ...fresh, founder: !!fresh.is_founder, subscription_status: subStatus.status, subscription_days_left: subStatus.daysLeft, subscription_active: subStatus.isActive } });
});

// Logout — delete session and clear cache
app.post("/api/auth/logout", (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token) {
    db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
    clearSessionCache(token);
  }
  res.json({ status: "ok" });
});

// Password reset: request token
app.post("/api/auth/forgot", async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "email required" });
  const user = db.prepare("SELECT id FROM users WHERE email = ?").get(email) as any;
  // Always return 200 to avoid email enumeration
  if (!user) return res.json({ status: "ok" });

  const token = randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString().replace('T', ' ').split('.')[0]; // 1 hour
  db.prepare("INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES (?, ?, ?)").run(user.id, token, expires);

  // Queue reset email
  const resetUrl = `${process.env.APP_URL || 'http://localhost:3000'}?reset=${token}`;
  db.prepare("INSERT INTO email_queue (lead_id, to_email, subject, body, user_id) VALUES (?, ?, ?, ?, ?)").run(
    'system', email,
    'Reset your LEADJIN password',
    `<p>Click the link below to reset your password. It expires in 1 hour.</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>If you didn't request this, ignore this email.</p>`,
    user.id
  );

  res.json({ status: "ok" });
});

// Password reset: confirm with token
app.post("/api/auth/reset", async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) return res.status(400).json({ error: "token and password required" });
  if (password.length < 8) return res.status(400).json({ error: "password must be at least 8 characters" });

  const row = db.prepare("SELECT * FROM password_reset_tokens WHERE token = ? AND used = 0 AND expires_at > datetime('now')").get(token) as any;
  if (!row) return res.status(400).json({ error: "invalid or expired token" });

  const password_hash = await hashPassword(password);
  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(password_hash, row.user_id);
  // Delete used token instead of just marking as used
  db.prepare("DELETE FROM password_reset_tokens WHERE token = ?").run(token);
  // Invalidate all existing sessions for security
  db.prepare("DELETE FROM sessions WHERE user_id = ?").run(row.user_id);

  res.json({ status: "ok" });
});

// Get current user from token
app.get("/api/auth/me", (req, res) => {
  const user = getUserFromToken(req) as any;
  if (!user) return res.status(401).json({ error: "not authenticated" });
  resetMonthlyIfNeeded(user.id);
  const fresh = db.prepare("SELECT id, email, subscription_plan, monthly_searches_used, monthly_searches_limit, subscription_expires_at, trial_ends_at, plan, is_founder, is_admin, ramadan_override FROM users WHERE id = ?").get(user.id) as any;
  const subStatus = getSubscriptionStatus(fresh);
  res.json({ user: { ...fresh, founder: !!fresh.is_founder, subscription_status: subStatus.status, subscription_days_left: subStatus.daysLeft, subscription_active: subStatus.isActive } });
});

// Subscription status endpoint
app.get("/api/subscription/status", (req, res) => {
  const user = getUserFromToken(req) as any;
  if (!user) return res.status(401).json({ error: "not authenticated" });
  const fresh = db.prepare("SELECT id, email, subscription_plan, subscription_expires_at, trial_ends_at, is_founder FROM users WHERE id = ?").get(user.id) as any;
  const status = getSubscriptionStatus(fresh);
  res.json(status);
});

// N1: Ramadan override toggle
app.post("/api/user/ramadan-override", (req, res) => {
  const user = requireAuth(req, res) as any;
  if (!user) return;
  const { override } = req.body;
  db.prepare("UPDATE users SET ramadan_override = ? WHERE id = ?").run(override ? 1 : 0, user.id);
  res.json({ status: "ok", ramadan_override: override });
});

// --- Gemini API Key Management ---
// POST: Save user's Gemini API key (encrypted)
app.post("/api/user/gemini-key", (req, res) => {
  const user = requireAuth(req, res) as any;
  if (!user) return;
  const { apiKey } = req.body;
  if (!apiKey || typeof apiKey !== 'string' || !apiKey.startsWith('AIza')) {
    return res.status(400).json({ error: "Invalid API key format" });
  }
  const encryptedKey = encryptApiKey(apiKey);
  db.prepare("UPDATE users SET gemini_api_key = ? WHERE id = ?").run(encryptedKey, user.id);
  res.json({ status: "ok", message: "API key saved" });
});

// GET: Check if user has Gemini API key (returns masked)
app.get("/api/user/gemini-key", (req, res) => {
  const user = requireAuth(req, res) as any;
  if (!user) return;
  const row = db.prepare("SELECT gemini_api_key FROM users WHERE id = ?").get(user.id) as any;
  const hasKey = !!(row?.gemini_api_key);
  let maskedKey = null;
  if (hasKey) {
    const decryptedKey = decryptApiKey(row.gemini_api_key);
    maskedKey = decryptedKey.substring(0, 6) + '•••••••••••••••' + decryptedKey.slice(-4);
  }
  res.json({ hasKey, maskedKey });
});

// DELETE: Remove user's Gemini API key
app.delete("/api/user/gemini-key", (req, res) => {
  const user = requireAuth(req, res) as any;
  if (!user) return;
  db.prepare("UPDATE users SET gemini_api_key = NULL WHERE id = ?").run(user.id);
  res.json({ status: "ok", message: "API key removed" });
});

// --- Company Profile Management ---
app.get("/api/user/profile", (req, res) => {
  const user = requireAuth(req, res) as any;
  if (!user) return;
  const u = db.prepare("SELECT company_name, company_tagline, company_email, company_phone, company_website, company_address, company_logo FROM users WHERE id = ?").get(user.id);
  res.json(u || {});
});

app.put("/api/user/profile", (req, res) => {
  const user = requireAuth(req, res) as any;
  if (!user) return;
  const { company_name, company_tagline, company_email, company_phone, company_website, company_address, company_logo } = req.body;
  db.prepare("UPDATE users SET company_name=?, company_tagline=?, company_email=?, company_phone=?, company_website=?, company_address=?, company_logo=? WHERE id=?")
    .run(company_name, company_tagline, company_email, company_phone, company_website, company_address, company_logo, user.id);
  res.json({ saved: true });
});

// --- User Preferences Management ---
app.get("/api/user/preferences", (req, res) => {
  const user = requireAuth(req, res) as any;
  if (!user) return;
  const row = db.prepare("SELECT preferences FROM users WHERE id = ?").get(user.id) as any;
  try {
    res.json(JSON.parse(row?.preferences || '{}'));
  } catch {
    res.json({});
  }
});

app.put("/api/user/preferences", (req, res) => {
  const user = requireAuth(req, res) as any;
  if (!user) return;
  const existing = db.prepare("SELECT preferences FROM users WHERE id = ?").get(user.id) as any;
  let prefs = {};
  try { prefs = JSON.parse(existing?.preferences || '{}'); } catch {}
  const merged = { ...prefs, ...req.body };
  db.prepare("UPDATE users SET preferences = ? WHERE id = ?").run(JSON.stringify(merged), user.id);
  res.json({ saved: true });
});

// --- In-Memory Session Cache ---
const sessionCache = new Map<string, { user: any; expires: number }>();
const SESSION_CACHE_TTL = 60_000; // 1 minute

// Prune expired cache entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [token, entry] of sessionCache.entries()) {
    if (entry.expires < now) {
      sessionCache.delete(token);
    }
  }
}, 5 * 60 * 1000);

// Enhanced getUserFromToken with caching
const getUserFromTokenCached = (req: express.Request): any | null => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return null;
  
  // Check cache first
  const cached = sessionCache.get(token);
  if (cached && cached.expires > Date.now()) {
    return cached.user;
  }
  
  // Cache miss - query DB
  const session = db.prepare("SELECT * FROM sessions WHERE token = ? AND expires_at > datetime('now')").get(token) as any;
  if (!session) return null;
  
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(session.user_id);
  if (user) {
    // Store in cache
    sessionCache.set(token, { user, expires: Date.now() + SESSION_CACHE_TTL });
  }
  return user;
};

// Clear cache on logout
const clearSessionCache = (token: string) => {
  sessionCache.delete(token);
};

// --- Jin AI Employee Routes (All Modules) ---
app.use('/api/jin', createCompleteJinRouter(db, getUserFromTokenCached));

// --- LeadJin Artisan Routes (Modules 3-5) ---
app.use('/api/artisan', createArtisanRouter(db, getUserFromTokenCached));

// Shared admin guard helper - requires BOTH admin secret AND valid user session with is_admin flag
const requireAdmin = (req: express.Request, res: express.Response): boolean => {
  const adminSecret = process.env.LEADJIN_ADMIN_SECRET;
  if (!adminSecret) { res.status(503).json({ error: "admin access not configured — set LEADJIN_ADMIN_SECRET" }); return false; }
  if (req.headers['x-admin-secret'] !== adminSecret) { res.status(403).json({ error: "forbidden" }); return false; }
  
  // Also require authenticated user with is_admin flag
  const user = getUserFromTokenCached(req);
  if (!user || !user.is_admin) {
    res.status(403).json({ error: "admin access requires authenticated admin user" });
    return false;
  }
  
  return true;
};

// Admin: set subscription plan (protected by LEADJIN_ADMIN_SECRET)
app.post("/api/admin/set-plan", (req, res) => {
  if (!requireAdmin(req, res)) return;
  const { email, plan, expires_at } = req.body;
  if (!email || !plan) return res.status(400).json({ error: "email and plan required" });
  if (!['free', 'basic', 'pro', 'trial'].includes(plan)) return res.status(400).json({ error: "plan must be free, basic, pro, or trial" });
  const limit = (plan === 'pro' || plan === 'trial') ? -1 : plan === 'basic' ? 100 : 10;
  db.prepare("UPDATE users SET subscription_plan = ?, monthly_searches_limit = ?, subscription_expires_at = ?, upgraded_at = CURRENT_TIMESTAMP WHERE email = ?")
    .run(plan, limit, expires_at || null, email);
  const user = db.prepare("SELECT id, email, subscription_plan, monthly_searches_limit FROM users WHERE email = ?").get(email);
  if (!user) return res.status(404).json({ error: "user not found" });
  res.json({ status: "updated", user });
});

// Admin: legacy set-tier (kept for backwards compat)
app.post("/api/admin/set-tier", (req, res) => {
  if (!requireAdmin(req, res)) return;
  const { email, tier } = req.body;
  if (!email || !tier) return res.status(400).json({ error: "email and tier required" });
  const plan = tier === 'pro' ? 'pro' : 'basic';
  const limit = plan === 'pro' ? -1 : 100;
  db.prepare("UPDATE users SET subscription_plan = ?, monthly_searches_limit = ?, upgraded_at = CURRENT_TIMESTAMP WHERE email = ?")
    .run(plan, limit, email);
  const user = db.prepare("SELECT id, email, subscription_plan FROM users WHERE email = ?").get(email);
  if (!user) return res.status(404).json({ error: "user not found" });
  res.json({ status: "updated", user });
});

// Admin: list all users
app.get("/api/admin/users", (req, res) => {
  if (!requireAdmin(req, res)) return;
  const users = db.prepare("SELECT id, email, subscription_plan, monthly_searches_used, monthly_searches_limit, created_at, upgraded_at FROM users ORDER BY created_at DESC").all();
  res.json(users);
});

// Admin: full dashboard snapshot
app.get("/api/admin/dashboard", (req, res) => {
  if (!requireAdmin(req, res)) return;

  const users = db.prepare("SELECT id, email, subscription_plan, monthly_searches_used, monthly_searches_limit, created_at, upgraded_at FROM users ORDER BY created_at DESC").all() as any[];

  const planCounts = { free: 0, basic: 0, pro: 0 };
  users.forEach((u: any) => { if (planCounts[u.subscription_plan as keyof typeof planCounts] !== undefined) planCounts[u.subscription_plan as keyof typeof planCounts]++; });

  const totalLeads = (db.prepare("SELECT COUNT(*) as c FROM leads").get() as any).c;
  const leadsByStatus = db.prepare("SELECT status, COUNT(*) as c FROM leads GROUP BY status").all();

  const emailTotal = (db.prepare("SELECT COUNT(*) as c FROM email_queue").get() as any).c;
  const emailPending = (db.prepare("SELECT COUNT(*) as c FROM email_queue WHERE status='PENDING' AND (scheduled_at IS NULL OR scheduled_at <= datetime('now'))").get() as any).c;
  const emailScheduled = (db.prepare("SELECT COUNT(*) as c FROM email_queue WHERE status='PENDING' AND scheduled_at > datetime('now')").get() as any).c;
  const emailSent = (db.prepare("SELECT COUNT(*) as c FROM email_queue WHERE status='SENT'").get() as any).c;
  const emailFailed = (db.prepare("SELECT COUNT(*) as c FROM email_queue WHERE status='FAILED'").get() as any).c;

  const activeSessions = (db.prepare("SELECT COUNT(*) as c FROM sessions WHERE expires_at > datetime('now')").get() as any).c;

  const totalRevenuePaid = (db.prepare("SELECT COALESCE(SUM(amount),0) as t FROM invoices WHERE status='PAID'").get() as any).t;
  const totalRevenuePending = (db.prepare("SELECT COALESCE(SUM(amount),0) as t FROM invoices WHERE status='DRAFT' OR status='ACCEPTED'").get() as any).t;

  const recentActivity = db.prepare("SELECT type, description, created_at FROM activity_log ORDER BY created_at DESC LIMIT 20").all();

  const leadsPerUser = db.prepare(`
    SELECT u.email, COUNT(l.lead_id) as lead_count, u.subscription_plan
    FROM users u LEFT JOIN leads l ON l.user_id = u.id
    GROUP BY u.id ORDER BY lead_count DESC LIMIT 10
  `).all();

  const env = {
    gemini: !!process.env.GEMINI_API_KEY,
    googleOAuth: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    smtp: !!process.env.SMTP_HOST,
    adminSecret: !!process.env.LEADJIN_ADMIN_SECRET,
    appUrl: process.env.APP_URL || 'http://localhost:3000',
  };

  res.json({
    users: { total: users.length, byPlan: planCounts, recent: users.slice(0, 5), activeSessions },
    leads: { total: totalLeads, byStatus: leadsByStatus, perUser: leadsPerUser },
    email: { total: emailTotal, pending: emailPending, scheduled: emailScheduled, sent: emailSent, failed: emailFailed },
    revenue: { paid: totalRevenuePaid / 100, pipeline: totalRevenuePending / 100 },
    recentActivity,
    env,
    timestamp: new Date().toISOString(),
  });
});

// --- Google OAuth Setup ---
const getRedirectUri = () => {
  const baseUrl = (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
  return `${baseUrl}/api/auth/google/callback`;
};

// Store OAuth clients per user
const oauth2Clients = new Map<number, any>();

function getOAuth2Client(userId: number): any {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return null;
  }
  
  if (!oauth2Clients.has(userId)) {
    const client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      getRedirectUri()
    );
    
    // Save refreshed tokens automatically - scoped to user
    client.on('tokens', (tokens: any) => {
      db.prepare(`
        UPDATE google_tokens SET 
          access_token = COALESCE(?, access_token),
          refresh_token = COALESCE(?, refresh_token),
          expiry_date = COALESCE(?, expiry_date)
        WHERE user_id = ?
      `).run(tokens.access_token, tokens.refresh_token, tokens.expiry_date, userId);
    });
    
    oauth2Clients.set(userId, client);
  }
  
  return oauth2Clients.get(userId);
}

// SMTP verification rate limiter (max 10 per minute)
const smtpProbeTimestamps: number[] = [];
const MAX_SMTP_PROBES_PER_MINUTE = 10;
const SMTP_PROBE_WINDOW_MS = 60 * 1000;

function canPerformSmtpProbe(): boolean {
  const now = Date.now();
  // Remove timestamps older than the window
  while (smtpProbeTimestamps.length > 0 && smtpProbeTimestamps[0] < now - SMTP_PROBE_WINDOW_MS) {
    smtpProbeTimestamps.shift();
  }
  return smtpProbeTimestamps.length < MAX_SMTP_PROBES_PER_MINUTE;
}

function recordSmtpProbe(): void {
  smtpProbeTimestamps.push(Date.now());
}

// Concurrency limiter for enrichment
async function enrichWithConcurrencyLimit<T>(
  items: T[],
  fn: (item: T, index: number) => Promise<any>,
  limit: number
): Promise<any[]> {
  const results: any[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const i = nextIndex++;
      try {
        results[i] = await fn(items[i], i);
      } catch (err) {
        results[i] = { error: (err as Error).message };
      }
    }
  }

  // Launch `limit` parallel workers
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

// --- Self-Reliant Email Enrichment Pipeline ---
async function enrichLeadEmail(
  lead: any,
  geminiApiKey: string
): Promise<{ email: string | null; verified: boolean; source: string }> {

  // ── STEP 1: Gemini Google Search for public email ──────────────────────────
  try {
    const ai = getGenAI(geminiApiKey);
    const searchPrompt = `Search Google for the email address of "${lead.name}", ${lead.title} at "${lead.company}".

Search specifically:
- "${lead.name} ${lead.company} email"
- "${lead.company} contact email"
- site:linkedin.com "${lead.name}" "${lead.company}"
- "${lead.name}" email @${lead.website ? new URL(lead.website.startsWith('http') ? lead.website : 'https://' + lead.website).hostname.replace('www.', '') : lead.company.toLowerCase().replace(/\s+/g, '') + '.com'}

Return ONLY the email address found. If multiple found, return the one most likely to be this specific person. If absolutely nothing found, return NULL.`;
    const searchRes = await ai.models.generateContent({
      model: "gemini-flash-lite-latest",
      contents: searchPrompt,
      config: { tools: [{ googleSearch: {} }] },
    });
    const raw = (searchRes.text || '').trim();
    const emailMatch = raw.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
    if (emailMatch && !raw.toUpperCase().includes('NULL')) {
      // Task 1B: Gemini search is NOT verified - only web_scrape and smtp_verified are verified
      return { email: emailMatch[0], verified: false, source: 'gemini_search' };
    }
  } catch (e: any) {
    console.warn('[Enrichment] Gemini search failed:', e.message);
  }

  // ── STEP 2: Scrape company website for contact emails ─────────────────────
  let domain: string | null = null;
  if (lead.website) {
    try {
      const u = new URL(lead.website.startsWith('http') ? lead.website : `https://${lead.website}`);
      domain = u.hostname.replace('www.', '');
    } catch {}
  }
  // ── STEP 1b: Use Gemini to find actual company domain ────────────────────
  if (!domain && lead.company) {
    try {
      const ai = getGenAI(geminiApiKey);
      const domainPrompt = `What is the official website domain for "${lead.company}"? Return ONLY the domain name (e.g., "aramco.com" for Saudi Aramco), nothing else. If unknown, return NULL.`;
      const domainRes = await ai.models.generateContent({
        model: "gemini-flash-lite-latest",
        contents: domainPrompt,
        config: { tools: [{ googleSearch: {} }] },
      });
      const domainText = (domainRes.text || '').trim().toLowerCase();
      // Extract domain from various formats (example.com, https://example.com, www.example.com)
      const domainMatch = domainText.match(/(?:https?:\/\/)?(?:www\.)?([a-z0-9][a-z0-9\-]*\.[a-z]{2,}(?:\.[a-z]{2,})?)/);
      if (domainMatch && !domainText.includes('null')) {
        domain = domainMatch[1];
      }
    } catch (e: any) {
      console.warn('[Enrichment] Domain lookup failed:', e.message);
    }
  }
  
  // Fallback: simple domain guess (improved)
  if (!domain && lead.company) {
    domain = lead.company.toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/^(the|saudi|al|abu|dubai|uae|qatar|oman|bahrain|kuwait|egypt|jordan|lebanon)\s+/i, '')
      .replace(/\s+(bank|group|company|co|corp|inc|ltd|llc|sa|holding|holdings|international|global|investment|trading|services|solutions|technologies|systems)$/i, '')
      .replace(/\s+/g, '')
      .slice(0, 30) + '.com';
  }

  if (domain) {
    const pagesToTry = [
      `https://${domain}/contact`,
      `https://${domain}/contact-us`,
      `https://${domain}/about`,
      `https://${domain}`,
    ];
    for (const pageUrl of pagesToTry) {
      try {
        const pRes = await fetch(pageUrl, {
          signal: AbortSignal.timeout(5000),
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LeadJin/1.0; +https://leadjin.app)' }
        });
        if (!pRes.ok) continue;
        const html = await pRes.text();
        const emailRegex = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
        const found = (html.match(emailRegex) || []).filter(e =>
          !e.includes('noreply') && !e.includes('no-reply') &&
          !e.includes('example') && !e.includes('sentry') &&
          !e.includes('wixpress') && !e.includes('@2x') &&
          e.length < 60 && e.includes(domain!)
        );
        if (found.length > 0) {
          return { email: found[0], verified: true, source: 'web_scrape' };
        }
      } catch {}
    }
  }

  // ── STEP 3: SMTP pattern verification ─────────────────────────────────────
  if (domain && lead.name) {
    // Strip titles (Dr., Sh., Eng., etc.) and non-alpha chars from name parts
    const cleanName = lead.name.replace(/^(dr\.?|sh\.?|eng\.?|mr\.?|mrs\.?|ms\.?|prof\.?)\s+/i, '').trim();
    const nameParts = cleanName.toLowerCase().split(/\s+/).filter((p: string) => p.length > 1);
    const first = nameParts[0] || '';
    const last = nameParts[nameParts.length - 1] || '';
    const firstInitial = first[0] || '';

    const patterns = [
      `${first}@${domain}`,
      `${first}.${last}@${domain}`,
      `${firstInitial}${last}@${domain}`,
      `${firstInitial}.${last}@${domain}`,
      `${last}@${domain}`,
      `info@${domain}`,
      `contact@${domain}`,
    ];

    for (const candidate of patterns) {
      const valid = await smtpVerify(candidate, domain);
      if (valid) {
        return { email: candidate, verified: true, source: 'smtp_verified' };
      }
    }
  }

  // ── STEP 4: No verified email — return best-guess pattern (unverified) ────
  if (domain && lead.name) {
    const cleanName = lead.name.replace(/^(dr\.?|sh\.?|eng\.?|mr\.?|mrs\.?|ms\.?|prof\.?)\s+/i, '').trim();
    const nameParts = cleanName.toLowerCase().split(/\s+/).filter((p: string) => p.length > 1);
    const first = nameParts[0] || '';
    const last = nameParts[nameParts.length - 1] || '';
    if (first && last) {
      const bestGuess = `${first}.${last}@${domain}`;
      return { email: bestGuess, verified: false, source: 'pattern_guess' };
    }
  }
  return { email: null, verified: false, source: 'not_found' };
}

async function smtpVerify(email: string, domain: string): Promise<boolean> {
  // Rate limit check
  if (!canPerformSmtpProbe()) {
    console.warn(`[SMTP] Rate limit exceeded for email verification: ${email}`);
    return false;
  }
  
  recordSmtpProbe();
  console.log(`[SMTP] Probing ${email} via MX of ${domain}`);
  
  try {
    const mxRecords = await dns.resolveMx(domain);
    if (!mxRecords || mxRecords.length === 0) {
      console.log(`[SMTP] No MX records found for ${domain}`);
      return false;
    }
    mxRecords.sort((a, b) => a.priority - b.priority);
    const mxHost = mxRecords[0].exchange;

    return await new Promise<boolean>((resolve) => {
      const socket = net.createConnection(25, mxHost);
      let stage = 0;
      let resolved = false;

      const done = (result: boolean) => {
        if (!resolved) {
          resolved = true;
          socket.destroy();
          resolve(result);
        }
      };

      socket.setTimeout(5000);
      socket.on('timeout', () => done(false));
      socket.on('error', () => done(false));

      socket.on('data', (data) => {
        const line = data.toString();
        if (stage === 0 && line.startsWith('220')) {
          socket.write(`EHLO leadjin.app\r\n`);
          stage = 1;
        } else if (stage === 1 && (line.includes('250') || line.includes('220'))) {
          socket.write(`MAIL FROM:<verify@leadjin.app>\r\n`);
          stage = 2;
        } else if (stage === 2 && line.startsWith('250')) {
          socket.write(`RCPT TO:<${email}>\r\n`);
          stage = 3;
        } else if (stage === 3) {
          const code = parseInt(line.slice(0, 3));
          done(code === 250 || code === 251);
        }
      });
    });
  } catch {
    return false;
  }
}

// Task 1C: Website Reachability Verification
async function verifyWebsite(url: string): Promise<{reachable: boolean, status: number, finalUrl: string}> {
  if (!url || !url.startsWith('http')) {
    return { reachable: false, status: 0, finalUrl: url };
  }
  
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    
    const response = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; LeadJin/1.0; +https://leadjin.app)'
      }
    });
    
    clearTimeout(timeout);
    
    return {
      reachable: response.ok,
      status: response.status,
      finalUrl: response.url || url
    };
  } catch (error: any) {
    // Try GET if HEAD fails (some servers don't support HEAD)
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
        redirect: 'follow',
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; LeadJin/1.0; +https://leadjin.app)'
        }
      });
      
      clearTimeout(timeout);
      
      return {
        reachable: response.ok,
        status: response.status,
        finalUrl: response.url || url
      };
    } catch {
      return { reachable: false, status: 0, finalUrl: url };
    }
  }
}

// Task 1D: LinkedIn URL Discovery
async function discoverLinkedIn(name: string, company: string, apiKey: string): Promise<string | null> {
  try {
    const ai = getGenAI(apiKey);

    const searchPrompt = `Search Google for LinkedIn profile of "${name}" at "${company}".
Search query: site:linkedin.com/in "${name}" "${company}"

Return ONLY the LinkedIn profile URL if found. The URL must start with https://linkedin.com/in/ or https://www.linkedin.com/in/
If no LinkedIn profile found, return NULL.`;

    const searchRes = await ai.models.generateContent({
      model: "gemini-flash-lite-latest",
      contents: searchPrompt,
      config: { tools: [{ googleSearch: {} }] },
    });
    
    const raw = (searchRes.text || '').trim();
    
    // Extract LinkedIn URL from response
    const linkedinMatch = raw.match(/https:\/\/(?:www\.)?linkedin\.com\/in\/[^\s"<>]+/i);
    if (linkedinMatch) {
      const url = linkedinMatch[0];
      // Validate URL format
      if (url.startsWith('https://linkedin.com/in/') || url.startsWith('https://www.linkedin.com/in/')) {
        return url;
      }
    }
    
    return null;
  } catch (e: any) {
    console.warn('[LinkedIn Discovery] Failed:', e.message);
    return null;
  }
}

// Task 1E: Data-Driven Lead Score Recalculation
function recalculateLeadScore(lead: any): { score: number, breakdown: object } {
  const breakdown: any = {
    title_match: lead.score_breakdown?.title_match || 0,
    company_size: lead.score_breakdown?.company_size || 0,
    industry_fit: lead.score_breakdown?.industry_fit || 0,
    geography: lead.score_breakdown?.geography || 0,
    pain_signals: 0,
    engagement: 0,
    vision_2030: 0,
    intent_signals: 0,
  };

  // pain_signals: 4 pts per signal (max 16)
  if (lead.pain_signals && Array.isArray(lead.pain_signals)) {
    breakdown.pain_signals = Math.min(lead.pain_signals.length * 4, 16);
  }

  // engagement: based on verifiable signals (max 15)
  if (lead.website_verified) breakdown.engagement += 5;
  if (lead.email_verified === true || lead.email_verified === 1) breakdown.engagement += 5;
  if (lead.linkedin && lead.linkedin.startsWith('http')) breakdown.engagement += 5;

  // Vision 2030 alignment: strong signal for KSA leads (max 20)
  if (lead.vision_2030_score && typeof lead.vision_2030_score === 'number') {
    breakdown.vision_2030 = Math.round((lead.vision_2030_score / 100) * 20);
  }

  // Intent signals from DB: high-confidence signals boost score (max 15)
  if (lead.lead_id) {
    try {
      const signalRows = (db as any).prepare(
        "SELECT confidence FROM intent_signals WHERE lead_id = ? AND confidence >= 70"
      ).all(lead.lead_id) as { confidence: number }[];
      if (signalRows.length > 0) {
        breakdown.intent_signals = Math.min(signalRows.length * 3, 15);
      }
    } catch {
      // intent_signals table may not exist yet — silently skip
    }
  }

  const score = Math.min(
    breakdown.title_match +
    breakdown.company_size +
    breakdown.industry_fit +
    breakdown.geography +
    breakdown.pain_signals +
    breakdown.engagement +
    breakdown.vision_2030 +
    breakdown.intent_signals,
    100
  );

  return { score, breakdown };
}

// --- Pre-Crawl Cache Helpers ---
function generateEmailFromPattern(name: string, domain: string, pattern: string): string {
  if (!domain || !name) return '';
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return '';
  const first = parts[0].toLowerCase();
  const last = parts[parts.length - 1].toLowerCase();

  if (pattern === 'first.last') return `${first}.${last}@${domain}`;
  if (pattern === 'flast') return `${first[0]}${last}@${domain}`;
  if (pattern === 'first') return `${first}@${domain}`;
  return `${first}.${last}@${domain}`;
}

function getCachedLeadsForHarvest(db: any, params: any): any[] {
  const industry = params.targetIndustry;
  const limit = params.limit || 10;
  const fetchLimit = Math.max(limit * 3, 50); // over-fetch so we can deduplicate across tiers

  const industryPattern = `%${industry}%`;

  // --- Normalise geography params ---
  // params.geography can be an array ['Saudi Arabia'] or a string 'Saudi Arabia'
  // params.targetCity is an optional single city string
  const geographyTerms: string[] = [];
  if (params.targetCity && typeof params.targetCity === 'string' && params.targetCity.trim()) {
    geographyTerms.push(params.targetCity.trim());
  }
  if (Array.isArray(params.geography)) {
    for (const g of params.geography) {
      if (g && typeof g === 'string' && g.trim()) geographyTerms.push(g.trim());
    }
  } else if (params.geography && typeof params.geography === 'string' && params.geography.trim()) {
    geographyTerms.push(params.geography.trim());
  }

  // Build SQL fragment for geography — company_cache has city + headquarters (no country column)
  // person_cache has city column
  const geoFilter = geographyTerms.length > 0
    ? 'AND (' + geographyTerms.map(() => '(c.city LIKE ? OR p.city LIKE ? OR c.headquarters LIKE ?)').join(' OR ') + ')'
    : '';
  const geoParams: string[] = [];
  for (const term of geographyTerms) {
    geoParams.push(`%${term}%`); // c.city
    geoParams.push(`%${term}%`); // p.city
    geoParams.push(`%${term}%`); // c.headquarters
  }

  // Company-only geo filter (no person_cache join)
  const geoFilterC = geographyTerms.length > 0
    ? 'AND (' + geographyTerms.map(() => '(c.city LIKE ? OR c.headquarters LIKE ?)').join(' OR ') + ')'
    : '';
  const geoParamsC: string[] = [];
  for (const term of geographyTerms) {
    geoParamsC.push(`%${term}%`); // c.city
    geoParamsC.push(`%${term}%`); // c.headquarters
  }

  const seen = new Set<string>(); // deduplicate by domain+name
  const results: any[] = [];

  const makeRow = (r: any, emailVerified: boolean, emailSource: string) => {
    const lead_id = `cache-${Date.now()}-${results.length}`;
    const domain = r.domain || r.c_domain || '';
    const email = r.email || (r.email_pattern && r.name ? generateEmailFromPattern(r.name, domain, r.email_pattern) : '');
    const resolvedSource = email
      ? (emailVerified ? 'smtp_verified' : (r.email ? emailSource : 'pattern_guess'))
      : '';
    return {
      lead_id,
      name: r.name || '',
      title: r.title || '',
      company: r.company_name || r.c_company || '',
      industry: r.c_industry || r.industry || industry,
      email,
      email_verified: emailVerified,
      verified: emailVerified,
      email_source: resolvedSource,
      phone: r.c_phone || r.phone || '',
      linkedin: r.linkedin_url || '',
      twitter: r.x_handle || '',
      website: domain ? `https://${domain}` : '',
      company_x: r.x_handle || '',
      company_snapchat: r.snapchat || '',
      company_tiktok: r.tiktok || '',
      lead_score: emailVerified ? 82 : (email ? 65 : 45),
      score_breakdown: {
        title_match: r.name ? 15 : 0,
        company_size: 10,
        industry_fit: 18,
        geography: 15,
        pain_signals: emailVerified ? 12 : 0,
        engagement: emailVerified ? 12 : (email ? 7 : 5),
      },
      pain_signals: [],
      trigger_events: [],
      outreach_recommendation: emailVerified
        ? `Pre-verified lead from database. Email confirmed via SMTP.`
        : (email ? `Pre-crawled lead from database. Email pending verification.` : `Pre-crawled company from database. No contact found yet.`),
      confidence: emailVerified ? 'high' : (email ? 'medium' : 'low'),
      gsse_metadata: {
        harvest_timestamp: new Date().toISOString(),
        logic_hash: lead_id,
        signature: `GSSE-CACHE-${lead_id.slice(-8).toUpperCase()}`,
        spatial_layer_proof: `Company ${r.company_name || r.c_company} in ${r.c_city || r.city || 'database'}`,
        semantic_layer_proof: `Pre-crawled and cached from public sources`,
        cultural_layer_proof: `Regional B2B context verified`,
      },
      company_data: {
        description: r.description || '',
        size: r.company_size || '',
        headquarters: r.headquarters || r.c_city || '',
        specialties: [],
      },
    };
  };

  // ── Tier 1: SMTP-verified emails ─────────────────────────────────────────
  if (results.length < limit) {
    const q1 = `
      SELECT p.*, c.domain as c_domain, c.company_name as c_company, c.phone as c_phone,
             c.x_handle, c.snapchat, c.tiktok, c.headquarters, c.company_size, c.description,
             c.industry as c_industry, c.city as c_city, c.email_pattern
      FROM person_cache p
      LEFT JOIN company_cache c ON p.domain = c.domain
      WHERE (c.industry LIKE ? OR p.industry LIKE ?)
      AND p.name IS NOT NULL AND p.name != ''
      AND p.email IS NOT NULL AND p.email != ''
      AND p.email_verified = 1
      ${geoFilter}
      ORDER BY p.verified_at DESC
      LIMIT ?
    `;
    const rows1 = db.prepare(q1).all(industryPattern, industryPattern, ...geoParams, fetchLimit) as any[];
    for (const r of rows1) {
      const key = `${r.domain || r.c_domain}|${r.name}`;
      if (!seen.has(key)) { seen.add(key); results.push(makeRow(r, true, 'smtp_verified')); }
      if (results.length >= limit) break;
    }
  }

  // ── Tier 2: Unverified emails (crawled but not yet SMTP-checked) ─────────
  if (results.length < limit) {
    const q2 = `
      SELECT p.*, c.domain as c_domain, c.company_name as c_company, c.phone as c_phone,
             c.x_handle, c.snapchat, c.tiktok, c.headquarters, c.company_size, c.description,
             c.industry as c_industry, c.city as c_city, c.email_pattern
      FROM person_cache p
      LEFT JOIN company_cache c ON p.domain = c.domain
      WHERE (c.industry LIKE ? OR p.industry LIKE ?)
      AND p.name IS NOT NULL AND p.name != ''
      AND p.email IS NOT NULL AND p.email != ''
      AND p.email_verified = 0
      ${geoFilter}
      ORDER BY p.crawled_at DESC
      LIMIT ?
    `;
    const rows2 = db.prepare(q2).all(industryPattern, industryPattern, ...geoParams, fetchLimit) as any[];
    for (const r of rows2) {
      const key = `${r.domain || r.c_domain}|${r.name}`;
      if (!seen.has(key)) { seen.add(key); results.push(makeRow(r, false, 'crawled')); }
      if (results.length >= limit) break;
    }
  }

  // ── Tier 3: People with no email — generate from company email_pattern ───
  if (results.length < limit) {
    const q3 = `
      SELECT p.*, c.domain as c_domain, c.company_name as c_company, c.phone as c_phone,
             c.x_handle, c.snapchat, c.tiktok, c.headquarters, c.company_size, c.description,
             c.industry as c_industry, c.city as c_city, c.email_pattern
      FROM person_cache p
      LEFT JOIN company_cache c ON p.domain = c.domain
      WHERE (c.industry LIKE ? OR p.industry LIKE ?)
      AND p.name IS NOT NULL AND p.name != ''
      AND (p.email IS NULL OR p.email = '')
      AND c.email_pattern IS NOT NULL AND c.email_pattern != ''
      AND (p.domain IS NOT NULL AND p.domain != '')
      ${geoFilter}
      ORDER BY p.crawled_at DESC
      LIMIT ?
    `;
    const rows3 = db.prepare(q3).all(industryPattern, industryPattern, ...geoParams, fetchLimit) as any[];
    for (const r of rows3) {
      const domain = r.domain || r.c_domain || '';
      if (!domain || !r.name) continue;
      const guessed = generateEmailFromPattern(r.name, domain, r.email_pattern);
      if (!guessed) continue;
      r.email = guessed; // inject so makeRow uses it
      const key = `${domain}|${r.name}`;
      if (!seen.has(key)) { seen.add(key); results.push(makeRow(r, false, 'pattern_guess')); }
      if (results.length >= limit) break;
    }
  }

  // ── Tier 4: Company-only fallback (no person data in person_cache) ────────
  if (results.length < limit) {
    const q4 = `
      SELECT c.domain, c.company_name, c.city as c_city, c.industry as c_industry,
             c.phone as c_phone, c.email_pattern,
             c.x_handle, c.snapchat, c.tiktok, c.headquarters, c.company_size, c.description,
             c.domain as c_domain, c.company_name as c_company,
             NULL as name, NULL as title, NULL as email, 0 as email_verified,
             NULL as linkedin_url, NULL as verified_at, c.crawled_at, NULL as phone
      FROM company_cache c
      WHERE c.industry LIKE ?
      ${geoFilterC}
      ORDER BY c.crawled_at DESC
      LIMIT ?
    `;
    const rows4 = db.prepare(q4).all(industryPattern, ...geoParamsC, fetchLimit) as any[];
    for (const r of rows4) {
      const key = `${r.domain}|company-only`;
      if (!seen.has(key)) { seen.add(key); results.push(makeRow(r, false, '')); }
      if (results.length >= limit) break;
    }
  }

  console.log(`[Cache] getCachedLeadsForHarvest: industry="${industry}", geo=[${geographyTerms.join(', ')}] → ${results.length} results (limit ${limit})`);
  return results.slice(0, limit);
}

// --- Server-Side Lead Harvest ---
app.post("/api/leads/harvest", async (req, res) => {
  const user = requireAuth(req, res) as any;
  if (!user) return;
  resetMonthlyIfNeeded(user.id);
  const fresh = db.prepare("SELECT email, subscription_plan, subscription_expires_at, trial_ends_at, monthly_searches_used, monthly_searches_limit, gemini_api_key, is_founder FROM users WHERE id = ?").get(user.id) as any;
  // Trial/subscription gate
  const subStatus = getSubscriptionStatus(fresh);
  if (!subStatus.isActive) {
    return res.status(403).json({ error: "trial_expired", message: "Your 14-day Pro trial has ended. Upgrade to continue harvesting leads.", upgrade: true });
  }
  // Founder bypass: unlimited searches
  if (!isFounder(fresh.email) && fresh.monthly_searches_limit !== -1 && fresh.monthly_searches_used >= fresh.monthly_searches_limit) {
    return res.status(429).json({ error: "monthly search quota exceeded", used: fresh.monthly_searches_used, limit: fresh.monthly_searches_limit });
  }
  
  // Use user's Gemini API key if available (except for founder who uses server key)
  let apiKey = process.env.GEMINI_API_KEY;
  let usingPersonalKey = false;
  if (!fresh.is_founder && fresh.gemini_api_key) {
    apiKey = decryptApiKey(fresh.gemini_api_key);
    usingPersonalKey = true;
  }
  if (!apiKey) return res.status(503).json({ error: "GEMINI_API_KEY not configured. Add your key in Settings > Integrations." });
  
  // Validate required fields
  const { searchParams } = req.body;
  if (!searchParams) return res.status(400).json({ error: "searchParams required" });
  if (!searchParams.targetIndustry || searchParams.targetIndustry.trim() === '') {
    return res.status(400).json({ error: "targetIndustry is required" });
  }
  // targetServices is optional but recommended for multi-service targeting
  if (!searchParams.userServices || searchParams.userServices.trim() === '') {
    return res.status(400).json({ error: "userServices is required" });
  }
  
  try {
    // Layer 0: Check pre-crawl cache first
    const cachedLeads = getCachedLeadsForHarvest(db, searchParams);
    const requestedLimit = searchParams.limit || 10;

    if (cachedLeads.length >= requestedLimit) {
      // Enough cached data — skip Gemini entirely
      console.log(`[Harvest] Serving ${cachedLeads.length} leads from pre-crawl cache (skipping Gemini)`);
      db.prepare("UPDATE users SET monthly_searches_used = monthly_searches_used + 1 WHERE id = ?").run(user.id);
      return res.json({ leads: cachedLeads, usingPersonalKey, source: 'cache' });
    }

    // Not enough cached — call Gemini for the remainder, then merge
    const geminiLimit = requestedLimit - cachedLeads.length;
    console.log(`[Harvest] ${cachedLeads.length} cached leads found; calling Gemini for ${geminiLimit} more`);

    // Map searchParams to the expected generateLeadjinLeads parameters
    const geminiLeads = await generateLeadjinLeads({
      userIndustry: searchParams.targetIndustry || 'Technology',
      userServices: searchParams.userServices || '',
      userCaseStudy: searchParams.userCaseStudy || '',
      userCompetitors: searchParams.userCompetitors || '',
      targetIndustry: searchParams.targetIndustry || 'Technology',
      targetServices: searchParams.userServices ? [searchParams.userServices] : [],
      company_size: searchParams.company_size || '10-200',
      geography: searchParams.geography || ['Saudi Arabia'],
      job_titles: searchParams.job_titles || ['CEO', 'CTO', 'Director'],
      limit: geminiLimit,
      model: searchParams.model || 'gemini-2.5-flash',
      userApiKey: apiKey
    });

    // DNS-validate Gemini leads — reject fake domains
    const dns = await import('dns/promises');
    const validatedLeads: any[] = [];
    for (const lead of geminiLeads) {
      if (lead.website) {
        const domain = lead.website.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
        try {
          const mx = await dns.resolveMx(domain);
          if (mx && mx.length > 0) {
            validatedLeads.push({ ...lead, verified: false });
          } else {
            console.log(`[Harvest] Rejected ${lead.company} — no MX for ${domain}`);
          }
        } catch {
          console.log(`[Harvest] Rejected ${lead.company} — DNS failed for ${domain}`);
        }
      } else {
        // No website — still include but mark as low confidence
        validatedLeads.push({ ...lead, verified: false, confidence: 'low' });
      }
    }

    const leads = [...cachedLeads, ...validatedLeads];
    const source = cachedLeads.length > 0 ? 'mixed' : 'gemini';

    db.prepare("UPDATE users SET monthly_searches_used = monthly_searches_used + 1 WHERE id = ?").run(user.id);

    // Persist leads to database for background verification and CRM
    const insertLead = db.prepare(`INSERT OR IGNORE INTO leads
      (lead_id, user_id, name, title, company, industry, email, phone, linkedin, twitter, website, lead_score, email_source, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

    const insertLeads = db.transaction(() => {
      const now = new Date().toISOString();
      for (const lead of leads) {
        insertLead.run(
          lead.lead_id, user.id, lead.name, lead.title, lead.company,
          lead.industry || '', lead.email || '', lead.phone || '',
          lead.linkedin || '', lead.twitter || '', lead.website || '',
          lead.lead_score || 0, lead.email_source || (lead.email ? 'precrawl' : ''), now
        );
      }
    });

    try { insertLeads(); } catch (e: any) { console.warn('[Harvest] Lead persistence failed:', e.message); }

    // Return leads immediately — email enrichment happens separately via /api/leads/enrich
    res.json({ leads, usingPersonalKey, source });

    // Fire-and-forget background verification for harvested leads
    setImmediate(async () => {
      for (const lead of leads) {
        if (lead.email) {
          try {
            const { verifyEmail } = await import('./src/services/emailVerifier.js');
            const result = await verifyEmail(lead.email);
            // Update the lead in DB with verification status
            db.prepare(`UPDATE leads SET email_verified = ?, email_source = ? WHERE lead_id = ? AND user_id = ?`)
              .run(result.deliverable ? 1 : 0, result.deliverable ? 'smtp_verified' : 'unverified', lead.lead_id, user.id);
          } catch {}
        }
      }
      console.log(`[Harvest] Background verification complete for ${leads.length} leads`);
    });
  } catch (err: any) {
    console.error('[Harvest Error]', err.message);
    res.status(500).json({ error: "internal server error", message: err.message });
  }
});

// --- Per-Lead Email Enrichment (called after harvest returns) ---
app.post("/api/leads/enrich", async (req, res) => {
  const user = requireAuth(req, res) as any;
  if (!user) return;
  const fresh = db.prepare("SELECT email, gemini_api_key, is_founder FROM users WHERE id = ?").get(user.id) as any;
  let apiKey = process.env.GEMINI_API_KEY;
  if (!fresh.is_founder && fresh.gemini_api_key) {
    apiKey = decryptApiKey(fresh.gemini_api_key);
  }
  if (!apiKey) return res.status(503).json({ error: "No API key" });

  const { lead } = req.body;
  if (!lead || !lead.name || !lead.company) return res.status(400).json({ error: "lead object required" });

  // Credit check — founders bypass
  const founderUser = fresh.is_founder || isFounder(fresh.email);
  if (!founderUser) {
    const creditCheck = checkEnrichmentCredits(user.id, 1);
    if (!creditCheck.hasCredits) {
      return res.status(402).json({ error: "Insufficient enrichment credits", balance: creditCheck.balance, needed: 1 });
    }
  }

  try {
    // Try waterfall enrichment first (if any providers are configured)
    const activeProviders = waterfallEnrichment.getActiveProviders();
    if (activeProviders.length > 0) {
      try {
        const waterfallResult = await waterfallEnrichment.enrichContact({
          name: lead.name,
          company: lead.company,
          domain: lead.domain,
        });
        if (waterfallResult && waterfallResult.email) {
          // Debit 1 credit on email found (no charge for misses)
          if (!founderUser) {
            debitEnrichmentCredits(user.id, 1, 'email_enrichment', `Email enrichment for ${lead.name} at ${lead.company}`, lead.lead_id);
          }
          return res.json({
            lead_id: lead.lead_id,
            email: waterfallResult.email.value,
            email_verified: waterfallResult.email.verified,
            email_source: waterfallResult.email.source,
          });
        }
      } catch (waterfallErr: any) {
        console.warn('[Enrichment] Waterfall failed, falling back to Gemini:', waterfallErr.message);
      }
    }

    // Fall back to existing Gemini pipeline
    const result = await enrichLeadEmail(lead, apiKey);
    // Debit 1 credit only if email was found (no charge for misses)
    if (result.email && !founderUser) {
      debitEnrichmentCredits(user.id, 1, 'email_enrichment', `Email enrichment for ${lead.name} at ${lead.company}`, lead.lead_id);
    }
    res.json({ lead_id: lead.lead_id, email: result.email, email_verified: result.verified, email_source: result.source });
  } catch (err: any) {
    res.json({ lead_id: lead.lead_id, email: null, email_verified: false, email_source: 'error' });
  }
});

// --- Waterfall: Direct enrichment for a single lead ---
app.post("/api/leads/enrich-waterfall", async (req, res) => {
  const user = requireAuth(req, res) as any;
  if (!user) return;

  const { lead_id, name, company, domain } = req.body;
  if (!name || !company) return res.status(400).json({ error: "name and company required" });

  const freshUser = db.prepare("SELECT email, is_founder FROM users WHERE id = ?").get(user.id) as any;
  const founderUser = freshUser?.is_founder || isFounder(freshUser?.email || '');

  // Credit check — need at least 1 credit (email) to start
  if (!founderUser) {
    const creditCheck = checkEnrichmentCredits(user.id, 1);
    if (!creditCheck.hasCredits) {
      return res.status(402).json({ error: "Insufficient enrichment credits", balance: creditCheck.balance, needed: 1 });
    }
  }

  try {
    const result = await waterfallEnrichment.enrichContact({ name, company, domain });
    if (!result) {
      return res.json({ success: false });
    }

    // Debit credits based on what was found (charge only on success)
    if (!founderUser) {
      if (result.email?.value) {
        debitEnrichmentCredits(user.id, 1, 'email_enrichment', `Email enrichment for ${name} at ${company}`, lead_id);
      }
      if (result.phone?.value) {
        const phoneCheck = checkEnrichmentCredits(user.id, 5);
        if (phoneCheck.hasCredits) {
          debitEnrichmentCredits(user.id, 5, 'phone_enrichment', `Phone enrichment for ${name} at ${company}`, lead_id);
        }
      }
    }

    res.json({
      success: true,
      email: result.email?.value ?? null,
      phone: result.phone?.value ?? null,
      email_verified: result.email?.verified ?? false,
      source: result.email?.source ?? result.phone?.source ?? null,
    });
  } catch (err: any) {
    console.error('[enrich-waterfall]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- Waterfall: Bulk enrichment ---
app.post("/api/leads/enrich-bulk", async (req, res) => {
  const user = requireAuth(req, res) as any;
  if (!user) return;

  const { leads, concurrency } = req.body;
  if (!Array.isArray(leads) || leads.length === 0) {
    return res.status(400).json({ error: "leads array required" });
  }

  const freshUser = db.prepare("SELECT email, is_founder FROM users WHERE id = ?").get(user.id) as any;
  const founderUser = freshUser?.is_founder || isFounder(freshUser?.email || '');

  // Pre-flight credit check — require at least 1 credit to start bulk enrichment
  if (!founderUser) {
    const creditCheck = checkEnrichmentCredits(user.id, 1);
    if (!creditCheck.hasCredits) {
      return res.status(402).json({ error: "Insufficient enrichment credits", balance: creditCheck.balance, needed: 1 });
    }
  }

  try {
    const batchResults = await waterfallEnrichment.enrichBatch(leads, concurrency);
    let enriched = 0;
    let failed = 0;
    const results = batchResults.map((result, i) => {
      const lead = leads[i];
      if (result && result.email) {
        enriched++;
        // Debit 1 per email found
        if (!founderUser) {
          debitEnrichmentCredits(user.id, 1, 'bulk_enrichment', `Bulk email enrichment for ${lead.name} at ${lead.company}`, lead.lead_id);
        }
        // Debit 5 per phone found (only if credits available)
        if (result.phone?.value && !founderUser) {
          const phoneCheck = checkEnrichmentCredits(user.id, 5);
          if (phoneCheck.hasCredits) {
            debitEnrichmentCredits(user.id, 5, 'bulk_enrichment', `Bulk phone enrichment for ${lead.name} at ${lead.company}`, lead.lead_id);
          }
        }
        return {
          name: lead.name,
          company: lead.company,
          email: result.email.value,
          phone: result.phone?.value ?? null,
          source: result.email.source,
          verified: result.email.verified,
        };
      } else {
        failed++;
        return {
          name: lead.name,
          company: lead.company,
          email: null,
          phone: result?.phone?.value ?? null,
          source: result?.phone?.source ?? null,
          verified: false,
        };
      }
    });
    res.json({ results, stats: { total: leads.length, enriched, failed } });
  } catch (err: any) {
    console.error('[enrich-bulk]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Enrichment Engine v2 — Saudi-first social intelligence (zero paid APIs)
// ---------------------------------------------------------------------------

app.post("/api/leads/enrich-v2", async (req, res) => {
  const user = requireAuth(req, res) as any;
  if (!user) return;

  const { lead_id, name, company, domain } = req.body;
  if (!name || !company) return res.status(400).json({ error: "name and company required" });

  try {
    const input: EnrichmentInput = { name, company, domain, leadId: lead_id };
    const result = await enrichLead(input);

    // Update lead in DB if lead_id provided
    if (lead_id) {
      try {
        db.prepare(`UPDATE leads SET
          email = COALESCE(?, email),
          email_verified = ?,
          email_source = ?,
          linkedin = COALESCE(?, linkedin),
          phone = COALESCE(?, phone),
          company_x_handle = ?,
          company_snapchat = ?,
          company_tiktok = ?
          WHERE lead_id = ? AND user_id = ?`
        ).run(
          result.email, result.emailConfidence >= 90 ? 1 : 0, result.emailSource,
          result.linkedinUrl, result.phone,
          result.companyXHandle, result.companySnapchat, result.companyTiktok,
          lead_id, user.id
        );
      } catch (dbErr: any) {
        console.warn(`[enrich-v2] DB update skipped: ${dbErr.message}`);
      }
    }

    res.json(result);
  } catch (err: any) {
    console.error('[enrich-v2]', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/leads/enrich-v2/bulk", async (req, res) => {
  const user = requireAuth(req, res) as any;
  if (!user) return;

  const { leads } = req.body;
  if (!Array.isArray(leads) || leads.length === 0) {
    return res.status(400).json({ error: "leads array required" });
  }
  if (leads.length > 100) {
    return res.status(400).json({ error: "max 100 leads per batch" });
  }

  try {
    const inputs: EnrichmentInput[] = leads.map((l: any) => ({
      name: l.name,
      company: l.company,
      domain: l.domain,
      leadId: l.lead_id,
    }));

    const results = await enrichBatch(inputs, 3);
    res.json({ results, total: results.length });
  } catch (err: any) {
    console.error('[enrich-v2/bulk]', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/enrichment/status/:id", (req, res) => {
  const user = requireAuth(req, res) as any;
  if (!user) return;

  const item = getQueueItem(req.params.id);
  if (!item) return res.status(404).json({ error: "not found" });
  res.json(item);
});

app.get("/api/enrichment/stats", (req, res) => {
  const user = requireAuth(req, res) as any;
  if (!user) return;
  res.json(getEnrichmentStats());
});

// ---------------------------------------------------------------------------
// Pre-Crawl Engine — Builds lead database before users search
// ---------------------------------------------------------------------------

app.get("/api/precrawl/stats", (req, res) => {
  const user = requireAuth(req, res) as any;
  if (!user) return;
  res.json(getPreCrawlStats(db));
});

app.post("/api/precrawl/start", async (req, res) => {
  const user = requireAuth(req, res) as any;
  if (!user) return;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(503).json({ error: "GEMINI_API_KEY not configured" });

  const { cities, industries, delay_ms } = req.body;

  // Non-blocking — crawl runs in background
  res.json({ status: 'started', cities: cities || KSA_CITIES.slice(0, 5), industries: industries || INDUSTRIES.slice(0, 10) });

  setImmediate(() => {
    runPreCrawlBatch(db, apiKey, cities, industries, delay_ms || 3000).catch(err => {
      console.error('[PreCrawl] Batch failed:', err.message);
    });
  });
});

app.get("/api/precrawl/search", (req, res) => {
  const user = requireAuth(req, res) as any;
  if (!user) return;

  const q = (req.query.q as string) || '';
  if (!q || q.length < 2) return res.status(400).json({ error: "query too short" });

  const people = searchPeople(db, q, 50);
  res.json({ results: people, count: people.length });
});

app.get("/api/precrawl/company/:domain", (req, res) => {
  const user = requireAuth(req, res) as any;
  if (!user) return;
  const company = lookupCompany(db, req.params.domain);
  if (!company) return res.status(404).json({ error: "not found" });
  res.json(company);
});

app.post("/api/precrawl/verify", async (req, res) => {
  const user = requireAuth(req, res) as any;
  if (!user) return;
  const { batch_size } = req.body;
  res.json({ status: 'started', batch_size: batch_size || 100 });
  setImmediate(() => {
    runDailyVerification(db, batch_size || 100).catch(err => {
      console.error('[Verify] Manual verification failed:', err.message);
    });
  });
});

// ---------------------------------------------------------------------------
// Pre-Crawl Harvest — Direct query of pre-crawl DB with full filters
// GET /api/precrawl/harvest?industry=...&city=...&country=...&limit=...
// ---------------------------------------------------------------------------
app.get("/api/precrawl/harvest", (req, res) => {
  const user = requireAuth(req, res) as any;
  if (!user) return;

  const industry = (req.query.industry as string) || '';
  const city = (req.query.city as string) || '';
  const country = (req.query.country as string) || '';
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);

  // Build industry filter
  const industryFilter = industry.trim() ? `AND (c.industry LIKE ? OR p.industry LIKE ?)` : '';
  const industryPattern = `%${industry.trim()}%`;

  // Collect all geography terms (city + country both match against city/headquarters)
  const geoTerms: string[] = [];
  if (city.trim()) geoTerms.push(city.trim());
  if (country.trim()) geoTerms.push(country.trim());

  const geoFilter = geoTerms.length > 0
    ? 'AND (' + geoTerms.map(() => '(c.city LIKE ? OR p.city LIKE ? OR c.headquarters LIKE ?)').join(' OR ') + ')'
    : '';
  const geoParams: string[] = [];
  for (const term of geoTerms) {
    geoParams.push(`%${term}%`);
    geoParams.push(`%${term}%`);
    geoParams.push(`%${term}%`);
  }

  try {
    // Query people joined with companies
    const baseArgs: any[] = [];
    if (industry.trim()) { baseArgs.push(industryPattern, industryPattern); }
    baseArgs.push(...geoParams, limit * 2);

    const sql = `
      SELECT p.name, p.title, p.company_name, p.domain, p.email, p.email_verified,
             p.linkedin_url, p.phone as person_phone, p.city as person_city, p.industry as person_industry,
             c.phone as company_phone, c.x_handle, c.snapchat, c.tiktok,
             c.headquarters, c.company_size, c.description,
             c.city as company_city, c.industry as company_industry,
             c.email_pattern, c.crawled_at as company_crawled_at
      FROM person_cache p
      LEFT JOIN company_cache c ON p.domain = c.domain
      WHERE p.name IS NOT NULL AND p.name != ''
      ${industryFilter}
      ${geoFilter}
      ORDER BY p.email_verified DESC, p.crawled_at DESC
      LIMIT ?
    `;

    const rows = db.prepare(sql).all(...baseArgs) as any[];

    // Also fetch company-only rows (no person match)
    const companyArgs: any[] = [industryPattern];
    const geoFilterC = geoTerms.length > 0
      ? 'AND (' + geoTerms.map(() => '(c.city LIKE ? OR c.headquarters LIKE ?)').join(' OR ') + ')'
      : '';
    const geoParamsC: string[] = [];
    for (const term of geoTerms) {
      geoParamsC.push(`%${term}%`);
      geoParamsC.push(`%${term}%`);
    }
    companyArgs.push(...geoParamsC, limit);

    const companySql = `
      SELECT c.domain, c.company_name, c.city as company_city, c.industry as company_industry,
             c.phone as company_phone, c.email_pattern, c.x_handle, c.snapchat, c.tiktok,
             c.headquarters, c.company_size, c.description,
             NULL as name, NULL as title, NULL as email, 0 as email_verified,
             NULL as linkedin_url, NULL as person_phone, NULL as person_city,
             NULL as person_industry
      FROM company_cache c
      WHERE c.industry LIKE ?
      ${geoFilterC}
      ORDER BY c.crawled_at DESC
      LIMIT ?
    `;
    const companyRows = db.prepare(companySql).all(...companyArgs) as any[];

    const stats = {
      total_people: rows.length,
      total_companies: companyRows.length,
      verified_emails: rows.filter((r: any) => r.email_verified === 1).length,
      unverified_emails: rows.filter((r: any) => r.email && !r.email_verified).length,
      no_email: rows.filter((r: any) => !r.email).length,
    };

    res.json({ people: rows.slice(0, limit), companies: companyRows, stats, filters: { industry, city, country, limit } });
  } catch (err: any) {
    console.error('[PreCrawl Harvest] Query error:', err.message);
    res.status(500).json({ error: 'Query failed', message: err.message });
  }
});

// ---------------------------------------------------------------------------
// CSV Bulk Upload + Enrichment
// ---------------------------------------------------------------------------

// Temp storage: uploadId → { rows, expiresAt }
const csvUploadStore = new Map<string, { rows: Record<string, string>[]; headers: string[]; expiresAt: number }>();

// Auto-expire old entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [id, entry] of csvUploadStore.entries()) {
    if (entry.expiresAt < now) csvUploadStore.delete(id);
  }
}, 5 * 60 * 1000);

/** Minimal multipart/form-data parser — extracts the first file field as a Buffer */
function parseMultipartFile(body: Buffer, contentType: string): { filename: string; buffer: Buffer } | null {
  const boundaryMatch = contentType.match(/boundary=([^\s;]+)/);
  if (!boundaryMatch) return null;
  const boundary = Buffer.from('--' + boundaryMatch[1]);

  let start = 0;
  while (start < body.length) {
    const boundaryIdx = body.indexOf(boundary, start);
    if (boundaryIdx === -1) break;

    const headerStart = boundaryIdx + boundary.length + 2; // skip \r\n
    const headerEnd = body.indexOf(Buffer.from('\r\n\r\n'), headerStart);
    if (headerEnd === -1) break;

    const headerStr = body.slice(headerStart, headerEnd).toString();
    const isFile = /filename=/i.test(headerStr);

    const dataStart = headerEnd + 4; // skip \r\n\r\n
    const nextBoundary = body.indexOf(boundary, dataStart);
    const dataEnd = nextBoundary === -1 ? body.length : nextBoundary - 2; // trim \r\n before boundary

    if (isFile && dataEnd > dataStart) {
      const filenameMatch = headerStr.match(/filename="?([^";\r\n]+)"?/i);
      const filename = filenameMatch ? filenameMatch[1].trim() : 'upload.csv';
      return { filename, buffer: body.slice(dataStart, dataEnd) };
    }
    start = boundaryIdx + boundary.length;
  }
  return null;
}

/** Parse CSV text into an array of row objects using detected headers */
function parseCsvText(text: string): { headers: string[]; rows: Record<string, string>[] } {
  // Normalise line endings
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

  // Find first non-empty line as header
  let headerLineIdx = lines.findIndex(l => l.trim().length > 0);
  if (headerLineIdx === -1) return { headers: [], rows: [] };

  const parseRow = (line: string): string[] => {
    const fields: string[] = [];
    let field = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { field += '"'; i++; }
        else { inQuotes = !inQuotes; }
      } else if (ch === ',' && !inQuotes) {
        fields.push(field.trim());
        field = '';
      } else {
        field += ch;
      }
    }
    fields.push(field.trim());
    return fields;
  };

  const headers = parseRow(lines[headerLineIdx]);
  const rows: Record<string, string>[] = [];

  for (let i = headerLineIdx + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = parseRow(line);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h] = values[idx] ?? ''; });
    rows.push(row);
  }

  return { headers, rows };
}

/** Map CSV header names to canonical lead fields */
function detectColumnMapping(headers: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  const FIELD_ALIASES: Record<string, string[]> = {
    name:     ['name', 'full name', 'fullname', 'contact name', 'person'],
    company:  ['company', 'organization', 'org', 'company name'],
    email:    ['email', 'email address', 'work email'],
    phone:    ['phone', 'mobile', 'phone number', 'telephone'],
    title:    ['title', 'job title', 'position', 'role'],
    linkedin: ['linkedin', 'linkedin url', 'linkedin profile'],
    domain:   ['domain', 'website', 'company website', 'url'],
  };

  for (const header of headers) {
    const lower = header.toLowerCase().trim();
    for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
      if (aliases.includes(lower) && !mapping[field]) {
        mapping[field] = header; // canonical field → original CSV header
      }
    }
  }
  return mapping;
}

/** Map a raw CSV row to a lead object using the provided column mapping */
function mapRowToLead(row: Record<string, string>, colMap: Record<string, string>): Record<string, string> {
  const lead: Record<string, string> = {};
  for (const [field, csvHeader] of Object.entries(colMap)) {
    lead[field] = row[csvHeader] ?? '';
  }
  return lead;
}

// --- CSV Upload: Parse and stage ---
app.post("/api/leads/upload-csv", async (req, res) => {
  const user = requireAuth(req, res) as any;
  if (!user) return;

  const contentType = req.headers['content-type'] || '';
  if (!contentType.includes('multipart/form-data')) {
    return res.status(400).json({ error: 'Request must be multipart/form-data' });
  }

  // Read raw body
  const chunks: Buffer[] = [];
  req.on('data', (chunk: Buffer) => {
    chunks.push(chunk);
    const totalSize = chunks.reduce((s, c) => s + c.length, 0);
    if (totalSize > 10 * 1024 * 1024) {
      req.destroy(new Error('File too large'));
    }
  });

  req.on('error', (err) => {
    console.error('[upload-csv] stream error:', err.message);
    if (!res.headersSent) res.status(400).json({ error: 'File too large (max 10 MB)' });
  });

  req.on('end', () => {
    try {
      const rawBody = Buffer.concat(chunks);
      const file = parseMultipartFile(rawBody, contentType);
      if (!file) {
        return res.status(400).json({ error: 'No file found in upload' });
      }

      const csvText = file.buffer.toString('utf-8');
      const { headers, rows } = parseCsvText(csvText);

      if (rows.length === 0) {
        return res.status(400).json({ error: 'CSV is empty or has no data rows' });
      }
      if (rows.length > 10_000) {
        return res.status(400).json({ error: 'CSV exceeds 10,000 row limit' });
      }

      const detectedMapping = detectColumnMapping(headers);
      const uploadId = randomUUID();
      const expiresAt = Date.now() + 30 * 60 * 1000; // 30 min

      csvUploadStore.set(uploadId, { rows, headers, expiresAt });

      const sample = rows.slice(0, 5).map(row => mapRowToLead(row, detectedMapping));

      res.json({
        parsed: { total: rows.length, sample },
        columns: { detected: detectedMapping, available: headers },
        uploadId,
      });
    } catch (err: any) {
      console.error('[upload-csv]', err.message);
      if (!res.headersSent) res.status(500).json({ error: err.message });
    }
  });
});

// --- CSV Upload: Confirm and import ---
app.post("/api/leads/upload-csv/confirm", async (req, res) => {
  const user = requireAuth(req, res) as any;
  if (!user) return;

  const { uploadId, columnMapping, enrichEnabled } = req.body;
  if (!uploadId) return res.status(400).json({ error: 'uploadId required' });

  const staged = csvUploadStore.get(uploadId);
  if (!staged) return res.status(404).json({ error: 'Upload not found or expired' });
  if (staged.expiresAt < Date.now()) {
    csvUploadStore.delete(uploadId);
    return res.status(410).json({ error: 'Upload session expired — please re-upload' });
  }

  // Use provided mapping or fall back to auto-detected
  const colMap: Record<string, string> = columnMapping ?? detectColumnMapping(staged.headers);
  const leads = staged.rows.map(row => mapRowToLead(row, colMap));

  let enrichedCount = 0;

  // Optional waterfall enrichment for contacts missing email
  if (enrichEnabled) {
    const csvUser = db.prepare("SELECT email, is_founder FROM users WHERE id = ?").get(user.id) as any;
    const csvFounder = csvUser?.is_founder || isFounder(csvUser?.email || '');

    // Pre-flight credit check before starting enrichment
    if (!csvFounder) {
      const creditCheck = checkEnrichmentCredits(user.id, 1);
      if (!creditCheck.hasCredits) {
        return res.status(402).json({ error: "Insufficient enrichment credits", balance: creditCheck.balance, needed: 1 });
      }
    }

    const toEnrich = leads
      .map((lead, i) => ({ lead, i }))
      .filter(({ lead }) => !lead.email && lead.name && lead.company);

    if (toEnrich.length > 0) {
      try {
        const contacts = toEnrich.map(({ lead }) => ({
          name: lead.name,
          company: lead.company,
          domain: lead.domain || undefined,
        }));

        const results = await waterfallEnrichment.enrichBatch(contacts);

        results.forEach((result, idx) => {
          const leadIdx = toEnrich[idx].i;
          if (result?.email?.value) {
            leads[leadIdx].email = result.email.value;
            // Debit 1 per email found (only on success)
            if (!csvFounder) {
              debitEnrichmentCredits(user.id, 1, 'bulk_enrichment', `CSV upload email enrichment for ${leads[leadIdx].name} at ${leads[leadIdx].company}`);
            }
            if (result.phone?.value && !leads[leadIdx].phone) {
              leads[leadIdx].phone = result.phone.value;
              // Debit 5 per phone found (only if credits available)
              if (!csvFounder) {
                const phoneCheck = checkEnrichmentCredits(user.id, 5);
                if (phoneCheck.hasCredits) {
                  debitEnrichmentCredits(user.id, 5, 'bulk_enrichment', `CSV upload phone enrichment for ${leads[leadIdx].name} at ${leads[leadIdx].company}`);
                }
              }
            }
            enrichedCount++;
          }
        });
      } catch (err: any) {
        console.error('[upload-csv/confirm] enrichment error:', err.message);
        // Non-fatal — continue with what we have
      }
    }
  }

  // Insert leads using same pattern as /api/leads/sync
  const insert = db.prepare(`
    INSERT OR REPLACE INTO leads (lead_id, name, title, company, email, linkedin, industry, lead_score, vision_2030_score, vision_2030_program, vision_2030_alignment, user_id, stage_entered_at, email_verified, email_source)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT stage_entered_at FROM leads WHERE lead_id = ?), CURRENT_TIMESTAMP), ?, ?)
  `);

  const checkDuplicate = db.prepare(`
    SELECT lead_id FROM leads
    WHERE user_id = ? AND (
      LOWER(company) = LOWER(?) OR
      (LOWER(name) = LOWER(?) AND LOWER(email) = LOWER(?))
    )
  `);

  let imported = 0;
  let failed = 0;

  const transaction = db.transaction((leads: Record<string, string>[]) => {
    for (const lead of leads) {
      try {
        const existing = checkDuplicate.get(user.id, lead.company || '', lead.name || '', lead.email || '');
        if (existing) { failed++; continue; } // skip duplicates

        const leadId = `lead_${randomUUID()}`;
        insert.run(
          leadId,
          lead.name || null,
          lead.title || null,
          lead.company || null,
          lead.email || null,
          lead.linkedin || null,
          null,   // industry — not in CSV mapping
          null,   // lead_score
          0,      // vision_2030_score
          '',     // vision_2030_program
          JSON.stringify({}), // vision_2030_alignment
          user.id,
          leadId,
          lead.email ? 1 : 0,
          'csv_upload',
        );
        imported++;
      } catch (rowErr: any) {
        console.warn('[upload-csv/confirm] row insert error:', rowErr.message);
        failed++;
      }
    }
  });

  transaction(leads);

  // Clean up temp storage
  csvUploadStore.delete(uploadId);

  res.json({ imported, enriched: enrichedCount, failed });
});

// --- Enrichment: Active providers ---
app.get("/api/enrichment/providers", async (req, res) => {
  const user = requireAuth(req, res) as any;
  if (!user) return;

  const providers = waterfallEnrichment.getActiveProviders();
  res.json({ providers, totalActive: providers.length });
});

// --- Enrichment: Provider usage stats ---
app.get("/api/enrichment/stats", async (req, res) => {
  const user = requireAuth(req, res) as any;
  if (!user) return;

  res.json(waterfallEnrichment.getProviderStats());
});

// Task 1C: Website Verification Endpoint
app.post("/api/leads/verify-website", async (req, res) => {
  const user = requireAuth(req, res) as any;
  if (!user) return;
  
  const { lead_id, website } = req.body;
  if (!lead_id || !website) {
    return res.status(400).json({ error: "lead_id and website required" });
  }
  
  try {
    const result = await verifyWebsite(website);
    
    // Update DB
    db.prepare("UPDATE leads SET website_verified = ?, website_status = ? WHERE lead_id = ? AND user_id = ?")
      .run(result.reachable ? 1 : 0, result.status, lead_id, user.id);
    
    res.json({ 
      lead_id, 
      website_verified: result.reachable, 
      website_status: result.status,
      final_url: result.finalUrl
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Sovereign Triple Verification Endpoint ──────────────────────────────
app.post("/api/verify-lead", async (req, res) => {
  const user = requireAuth(req, res) as any;
  if (!user) return;

  const { email, phone, linkedinUrl, name, company } = req.body;

  if (!email && !phone && !linkedinUrl) {
    return res.status(400).json({ error: "At least one of email, phone, or linkedinUrl is required" });
  }

  try {
    const result = await tripleVerify({ email, phone, linkedinUrl, name, company });
    res.json(result);
  } catch (err: any) {
    console.error("[SovereignVerifier] Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// Task 1D: LinkedIn Enrichment Endpoint
app.post("/api/leads/enrich-linkedin", async (req, res) => {
  const user = requireAuth(req, res) as any;
  if (!user) return;
  
  const fresh = db.prepare("SELECT email, gemini_api_key, is_founder FROM users WHERE id = ?").get(user.id) as any;
  let apiKey = process.env.GEMINI_API_KEY;
  if (!fresh.is_founder && fresh.gemini_api_key) {
    apiKey = decryptApiKey(fresh.gemini_api_key);
  }
  if (!apiKey) return res.status(503).json({ error: "No API key" });
  
  const { lead_id, name, company } = req.body;
  if (!lead_id || !name || !company) {
    return res.status(400).json({ error: "lead_id, name, and company required" });
  }
  
  try {
    const linkedinUrl = await discoverLinkedIn(name, company, apiKey);
    
    if (linkedinUrl) {
      // Update DB
      db.prepare("UPDATE leads SET linkedin = ? WHERE lead_id = ? AND user_id = ?")
        .run(linkedinUrl, lead_id, user.id);
    }
    
    res.json({ 
      lead_id, 
      linkedin: linkedinUrl 
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Task 1E: Score Recalculation Endpoint
app.post("/api/leads/recalculate-scores", (req, res) => {
  const user = requireAuth(req, res) as any;
  if (!user) return;
  
  const { leads } = req.body;
  if (!Array.isArray(leads)) {
    return res.status(400).json({ error: "leads array required" });
  }
  
  const results = leads.map(lead => {
    const recalculated = recalculateLeadScore(lead);
    return {
      lead_id: lead.lead_id,
      score: recalculated.score,
      breakdown: recalculated.breakdown
    };
  });
  
  res.json({ results });
});

// --- LeadJin Hunter Module — Strategic Entity Discovery ---
// POST /api/hunt - Discover executives via LinkedIn intelligence
app.post("/api/hunt", async (req, res) => {
  const { domain, linkedinCookie, maxExecutives } = req.body;
  
  if (!domain || typeof domain !== "string") {
    return res.status(400).json({ error: "domain is required (e.g., retal.com.sa)" });
  }
  
  // Validate domain format
  const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]*(.[a-zA-Z0-9][a-zA-Z0-9-]*)+$/;
  if (!domainRegex.test(domain)) {
    return res.status(400).json({ error: "Invalid domain format" });
  }
  
  console.log(`[API/Hunt] Strategic entity hunt requested for: ${domain}`);
  
  try {
    const result = await huntExecutives(domain, linkedinCookie, maxExecutives || 3);
    res.json(result);
  } catch (error: any) {
    console.error(`[API/Hunt] Hunt failed for ${domain}:`, error.message);
    res.status(500).json({
      error: "Strategic entity discovery failed",
      message: error.message,
      domain,
    });
  }
});

// --- WATHQ Saudi Commercial Registry ---
// GET /api/wathq/:cr   — look up a Saudi CR number against the official registry.
// POST /api/hunt-wathq — same lookup via POST body {cr, lang?}.
// Both routes are open (no auth) — mirrors /api/hunt pattern.
// D11: national IDs are never returned.
app.get("/api/wathq/:cr", async (req, res) => {
  const { cr } = req.params;
  const lang = (req.query.lang === 'ar' || req.query.lang === 'en') ? req.query.lang : 'en';

  if (!cr || !/^\d{10}$/.test(cr)) {
    return res.status(400).json({ error: "cr must be a 10-digit Saudi CR number" });
  }

  console.log(`[API/WATHQ] Registry lookup requested for CR: ${cr}`);

  try {
    const lead = await fetchWathqLead(cr, lang);
    res.json(lead);
  } catch (error: any) {
    console.error(`[API/WATHQ] Lookup failed for CR ${cr}:`, error.message);
    res.status(error.status || 500).json({
      error: "WATHQ registry lookup failed",
      message: error.message,
      cr,
    });
  }
});

app.post("/api/hunt-wathq", async (req, res) => {
  const { cr, lang } = req.body;
  const resolvedLang = (lang === 'ar' || lang === 'en') ? lang : 'en';

  if (!cr || typeof cr !== 'string') {
    return res.status(400).json({ error: "cr is required (10-digit Saudi CR number)" });
  }
  if (!/^\d{10}$/.test(cr)) {
    return res.status(400).json({ error: "cr must be a 10-digit Saudi CR number" });
  }

  console.log(`[API/hunt-wathq] Registry lookup requested for CR: ${cr}`);

  try {
    const lead = await fetchWathqLead(cr, resolvedLang);
    res.json(lead);
  } catch (error: any) {
    console.error(`[API/hunt-wathq] Lookup failed for CR ${cr}:`, error.message);
    res.status(error.status || 500).json({
      error: "WATHQ registry lookup failed",
      message: error.message,
      cr,
    });
  }
});

// --- Gate-1: Hunt Orchestration (WATHQ → people → enrich → signal → store) ---
// POST /api/hunt-orchestrate
// Input:  { sector, geo, count?, crs? }
//   sector — e.g. "fintech", "healthcare"
//   geo    — e.g. "Riyadh", "Jeddah"
//   count  — how many companies to discover (default 3, max 10)
//   crs    — optional: skip auto-discovery, supply known CR numbers directly
// Open route (no JWT) — mirrors /api/hunt and /api/hunt-wathq pattern.
app.post("/api/hunt-orchestrate", async (req, res) => {
  const { sector, geo, count, crs } = req.body as OrchestrateInput & { crs?: string[] };

  if (!sector || typeof sector !== 'string' || !sector.trim()) {
    return res.status(400).json({ error: "sector is required (e.g. fintech, healthcare)" });
  }
  if (!geo || typeof geo !== 'string' || !geo.trim()) {
    return res.status(400).json({ error: "geo is required (e.g. Riyadh, Jeddah)" });
  }

  const parsedCount = typeof count === 'number'
    ? count
    : typeof count === 'string'
    ? parseInt(count, 10)
    : 3;
  if (isNaN(parsedCount) || parsedCount < 1) {
    return res.status(400).json({ error: "count must be a positive integer" });
  }

  // Validate crs if provided
  if (crs !== undefined) {
    if (!Array.isArray(crs)) {
      return res.status(400).json({ error: "crs must be an array of 10-digit CR strings" });
    }
    for (const cr of crs) {
      if (!/^\d{10}$/.test(String(cr))) {
        return res.status(400).json({ error: `Invalid CR number: ${cr} — must be 10 digits` });
      }
    }
  }

  console.log(`[API/hunt-orchestrate] sector=${sector} geo=${geo} count=${parsedCount} crs=${crs ? JSON.stringify(crs) : 'auto-discover'}`);

  try {
    const result = await huntOrchestrate(
      { sector: sector.trim(), geo: geo.trim(), count: parsedCount, crs },
      { fetchWathqLead, enrichContact: (await import('./src/services/contactEnrichment.js')).enrichContact, db },
    );
    res.json(result);
  } catch (error: any) {
    console.error(`[API/hunt-orchestrate] Unexpected error:`, error.message);
    res.status(500).json({
      error: "Hunt orchestration failed",
      message: error.message,
    });
  }
});

// --- Email Templates API ---
// Get templates - user-specific with global fallback
app.get("/api/templates", (req, res) => {
  const user = requireAuth(req, res);
  if (!user) return;
  try {
    // Get user's templates + global defaults
    const templates = db.prepare(`
      SELECT * FROM email_templates 
      WHERE user_id = ? OR user_id IS NULL
      ORDER BY user_id DESC, created_at DESC
    `).all(user.id);
    res.json(templates);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch templates" });
  }
});

app.post("/api/templates", (req, res) => {
  const user = requireAuth(req, res);
  if (!user) return;
  const { name, subject, body } = req.body;
  if (!name || !subject || !body) {
    return res.status(400).json({ error: "name, subject, and body are required" });
  }
  try {
    const info = db.prepare("INSERT INTO email_templates (user_id, name, subject, body) VALUES (?, ?, ?, ?)").run(user.id, name, subject, body);
    res.json({ id: info.lastInsertRowid, name, subject, body });
  } catch (error: any) {
    if (error.message?.includes('UNIQUE constraint failed')) {
      return res.status(409).json({ error: "Template name already exists" });
    }
    res.status(500).json({ error: "Failed to create template" });
  }
});

app.put("/api/templates/:id", (req, res) => {
  const user = requireAuth(req, res);
  if (!user) return;
  const { name, subject, body } = req.body;
  try {
    const result = db.prepare("UPDATE email_templates SET name = ?, subject = ?, body = ? WHERE id = ? AND user_id = ?").run(name, subject, body, req.params.id, user.id);
    if (result.changes === 0) return res.status(404).json({ error: "Template not found" });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to update template" });
  }
});

app.delete("/api/templates/:id", (req, res) => {
  const user = requireAuth(req, res);
  if (!user) return;
  try {
    const result = db.prepare("DELETE FROM email_templates WHERE id = ? AND user_id = ?").run(req.params.id, user.id);
    if (result.changes === 0) return res.status(404).json({ error: "Template not found" });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete template" });
  }
});

// --- Email Infrastructure ---
// Validate SMTP config at startup
const smtpHost = process.env.SMTP_HOST;
const smtpPort = process.env.SMTP_PORT;
const smtpUser = process.env.SMTP_USER;
const smtpPass = process.env.SMTP_PASS;

let transporter: nodemailer.Transporter | null = null;

if (smtpHost && smtpPort && smtpUser && smtpPass) {
  transporter = nodemailer.createTransport({
    host: smtpHost,
    port: parseInt(smtpPort),
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
    tls: {
      rejectUnauthorized: false, // Allow self-signed certs (Proton Bridge)
    },
  });
  console.log('[SMTP] Transporter configured for:', smtpHost);
} else {
  console.warn('[SMTP] Missing SMTP configuration. System emails (password reset) will not work.');
  console.warn('[SMTP] Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS environment variables.');
}

// Inject tracking pixel and wrap links for tracking
function injectEmailTracking(body: string, emailQueueId: number): string {
  const appUrl = process.env.APP_URL || 'http://localhost:3000';
  
  // Add tracking pixel before closing body tag
  const trackingPixel = `<img src="${appUrl}/api/email/track/${emailQueueId}/open" width="1" height="1" alt="" style="display:none;" />`;
  
  let trackedBody = body;
  
  // Wrap links with tracking
  trackedBody = trackedBody.replace(/<a\s+([^>]*?)href=["']([^"']+)["']([^>]*)>/gi, (match, preAttrs, url, postAttrs) => {
    // Skip unsubscribe and tracking links
    if (url.includes('/api/unsubscribe') || url.includes('/api/email/track')) {
      return match;
    }
    const trackedUrl = `${appUrl}/api/email/track/${emailQueueId}/click?url=${encodeURIComponent(url)}`;
    return `<a ${preAttrs}href="${trackedUrl}"${postAttrs}>`;
  });
  
  // Insert tracking pixel
  if (trackedBody.includes('</body>')) {
    trackedBody = trackedBody.replace('</body>', `${trackingPixel}</body>`);
  } else if (trackedBody.includes('</html>')) {
    trackedBody = trackedBody.replace('</html>', `${trackingPixel}</html>`);
  } else {
    trackedBody = trackedBody + trackingPixel;
  }
  
  return trackedBody;
}

// Email unsubscribe footer helper
function addUnsubscribeFooter(body: string, toEmail: string): string {
  const appUrl = process.env.APP_URL || 'http://localhost:3000';
  // HMAC-based unsubscribe token — prevents length-extension attacks vs plain hash(email+secret)
  const unsubscribeToken = createHmac('sha256', process.env.LEADJIN_ADMIN_SECRET || 'leadjin-unsubscribe-fallback').update(toEmail).digest('hex').slice(0, 16);
  const unsubscribeUrl = `${appUrl}/unsubscribe?email=${encodeURIComponent(toEmail)}&token=${unsubscribeToken}`;
  
  const footer = `
    <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 11px; color: #9ca3af;">
      <p>This email was sent via LEADJIN outreach platform.</p>
      <p><a href="${unsubscribeUrl}" style="color: #6b7280;">Unsubscribe</a> | 
      <a href="${appUrl}/privacy" style="color: #6b7280;">Privacy Policy</a></p>
    </div>
  `;
  
  // If body already has HTML structure, insert before closing body/html, otherwise wrap
  if (body.includes('</body>')) {
    return body.replace('</body>', `${footer}</body>`);
  } else if (body.includes('</html>')) {
    return body.replace('</html>', `${footer}</html>`);
  } else {
    return `<div>${body}${footer}</div>`;
  }
}

// N1: Check if Ramadan/Eid pause is active
function isIslamicHolidayPause(): boolean {
  const today = new Date();
  const currentYear = today.getFullYear();
  const { ramadanStart, ramadanEnd, eidStart, eidEnd } = getRamadanDatesForYear(currentYear);
  return (today >= ramadanStart && today <= ramadanEnd) || (today >= eidStart && today <= eidEnd);
}

// Email processing loop (Self-reliant queue)
async function processEmailQueue() {
  // N1: Skip during Ramadan/Eid (unless user has override - checked per email below)
  const isHoliday = isIslamicHolidayPause();
  
  // First: Process system emails (password reset, etc.) via SMTP fallback
  // These have lead_id = 'system' and don't require Google OAuth
  const systemEmails = db.prepare(`
    SELECT eq.*, u.email as user_email, u.id as token_user_id
    FROM email_queue eq
    INNER JOIN users u ON u.id = eq.user_id
    WHERE eq.status = 'PENDING' 
    AND eq.lead_id = 'system'
    AND eq.attempt_count < 3 
    AND (eq.scheduled_at IS NULL OR eq.scheduled_at <= datetime('now'))
    LIMIT 5
  `).all();

  for (const email of systemEmails as any[]) {
    try {
      // Check if SMTP is configured
      if (!transporter) {
        console.error(`[EmailWorker] Cannot send system email ${email.id}: SMTP not configured`);
        db.prepare("UPDATE email_queue SET status = 'FAILED', last_error = 'SMTP not configured' WHERE id = ?").run(email.id);
        continue;
      }
      
      // Update last_attempt_at
      db.prepare("UPDATE email_queue SET last_attempt_at = CURRENT_TIMESTAMP WHERE id = ?").run(email.id);
      
      // Sanitize, add tracking, and send via SMTP (system emails don't use Gmail OAuth)
      const sanitizedBody = sanitizeHtml(email.body);
      const bodyWithTracking = injectEmailTracking(sanitizedBody, email.id);
      const bodyWithFooter = addUnsubscribeFooter(bodyWithTracking, email.to_email);
      await transporter.sendMail({
        from: process.env.SMTP_FROM || '"LEADJIN" <outreach@leadjin.ai>',
        to: email.to_email,
        subject: email.subject,
        html: bodyWithFooter,
      });

      db.prepare("UPDATE email_queue SET status = 'SENT', sent_at = CURRENT_TIMESTAMP WHERE id = ?").run(email.id);
      console.log(`[EmailWorker] System email ${email.id} sent successfully via SMTP`);
    } catch (error: any) {
      console.error(`[EmailWorker] Failed to send system email ${email.id}:`, error.message);
      db.prepare("UPDATE email_queue SET attempt_count = COALESCE(attempt_count, 0) + 1, last_error = ? WHERE id = ?").run(error.message, email.id);
      
      const updated = db.prepare("SELECT attempt_count FROM email_queue WHERE id = ?").get(email.id) as any;
      if (updated && updated.attempt_count >= 3) {
        db.prepare("UPDATE email_queue SET status = 'FAILED' WHERE id = ?").run(email.id);
        console.error(`[EmailWorker] System email ${email.id} marked as FAILED after 3 attempts`);
      }
    }
  }
  
  // Second: Process user emails via Google OAuth (or SMTP fallback)
  // Join with leads to check do_not_contact flag
  const pending = db.prepare(`
    SELECT eq.*, gt.access_token, gt.refresh_token, gt.user_email, gt.user_id as token_user_id, l.do_not_contact
    FROM email_queue eq
    LEFT JOIN google_tokens gt ON gt.user_id = eq.user_id
    LEFT JOIN leads l ON l.lead_id = eq.lead_id AND l.user_id = eq.user_id
    WHERE eq.status = 'PENDING' 
    AND eq.lead_id != 'system'
    AND eq.attempt_count < 3 
    AND (eq.scheduled_at IS NULL OR eq.scheduled_at <= datetime('now'))
    AND (l.do_not_contact IS NULL OR l.do_not_contact != 1)
    LIMIT 5
  `).all();

  for (const email of pending as any[]) {
    try {
      // N1: Check user ramadan override
      if (isHoliday) {
        const user = db.prepare("SELECT * FROM users WHERE id = ?").get(email.user_id) as any;
        if (!user?.ramadan_override) {
          console.log(`[EmailWorker] Skipping email ${email.id} - Ramadan/Eid pause active`);
          continue; // Skip this email
        }
      }
      
      // Update last_attempt_at only (attempt_count is incremented on failure)
      db.prepare("UPDATE email_queue SET last_attempt_at = CURRENT_TIMESTAMP WHERE id = ?").run(email.id);
      
      // Use user's OAuth client if available
      const oauth2Client = email.token_user_id ? getOAuth2Client(email.token_user_id) : null;
      
      if (email.access_token && oauth2Client) {
        // Send via Gmail API
        oauth2Client.setCredentials({
          access_token: email.access_token,
          refresh_token: email.refresh_token,
        });

        const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
        const subject = email.subject;
        const utf8Subject = `=?utf-8?B?${Buffer.from(subject).toString('base64')}?=`;
        // Sanitize, add tracking, and add unsubscribe footer for legal compliance
        const sanitizedBody = sanitizeHtml(email.body);
        const bodyWithTracking = injectEmailTracking(sanitizedBody, email.id);
        const bodyWithFooter = addUnsubscribeFooter(bodyWithTracking, email.to_email);
        const messageParts = [
          `From: "LEADJIN" <${email.user_email}>`,
          `To: ${email.to_email}`,
          'Content-Type: text/html; charset=utf-8',
          'MIME-Version: 1.0',
          `Subject: ${utf8Subject}`,
          '',
          bodyWithFooter,
        ];
        const message = messageParts.join('\n');
        const encodedMessage = Buffer.from(message)
          .toString('base64')
          .replace(/\+/g, '-')
          .replace(/\//g, '_')
          .replace(/=+$/, '');

        await gmail.users.messages.send({
          userId: 'me',
          requestBody: {
            raw: encodedMessage,
          },
        });
      } else if (transporter) {
        // Fallback to SMTP
        // Sanitize, add tracking, and add unsubscribe footer for legal compliance
        const sanitizedBody = sanitizeHtml(email.body);
        const bodyWithTracking = injectEmailTracking(sanitizedBody, email.id);
        const bodyWithFooter = addUnsubscribeFooter(bodyWithTracking, email.to_email);
        await transporter.sendMail({
          from: process.env.SMTP_FROM || '"LEADJIN" <outreach@leadjin.ai>',
          to: email.to_email,
          subject: email.subject,
          html: bodyWithFooter,
        });
      } else {
        throw new Error('No email transport available. Configure Gmail OAuth or SMTP.');
      }

      db.prepare("UPDATE email_queue SET status = 'SENT', sent_at = CURRENT_TIMESTAMP WHERE id = ?").run(email.id);
      
      db.prepare("INSERT INTO activity_log (lead_id, user_id, type, description) VALUES (?, ?, ?, ?)").run(
        email.lead_id,
        email.user_id,
        "EMAIL_SENT",
        `Email sent: ${email.subject}`
      );
      
      console.log(`[EmailWorker] Email ${email.id} sent successfully`);
    } catch (error: any) {
      console.error(`[EmailWorker] Failed to send email ${email.id}:`, error.message);
      db.prepare("UPDATE email_queue SET attempt_count = COALESCE(attempt_count, 0) + 1, last_error = ? WHERE id = ?").run(error.message, email.id);
      
      // If 3 failed attempts, mark as FAILED
      const updated = db.prepare("SELECT attempt_count FROM email_queue WHERE id = ?").get(email.id) as any;
      if (updated && updated.attempt_count >= 3) {
        db.prepare("UPDATE email_queue SET status = 'FAILED' WHERE id = ?").run(email.id);
        console.error(`[EmailWorker] Email ${email.id} marked as FAILED after 3 attempts`);
      }
    }
  }
}

// Run queue processor every 60 seconds (was 10s - reduced frequency)
setInterval(processEmailQueue, 60000);

// Initial call on server startup
processEmailQueue();
console.log('[EmailWorker] Email queue processor started');

// --- API Routes ---

app.get("/api/auth/google", (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID) return res.status(503).json({ error: "Google OAuth not configured" });
  // Create a temporary client for the auth URL
  const tempClient = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    getRedirectUri()
  );
  const url = tempClient.generateAuthUrl({
    access_type: "offline",
    scope: ["https://www.googleapis.com/auth/gmail.send", "https://www.googleapis.com/auth/userinfo.email"],
    prompt: "consent"
  });
  res.json({ url });
});

app.get("/api/auth/google/callback", async (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID) return res.status(503).send("Google OAuth not configured");
  const { code } = req.query;
  
  const tempClient = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    getRedirectUri()
  );
  
  try {
    const { tokens } = await tempClient.getToken(code as string);
    tempClient.setCredentials(tokens);
    
    // Get user email
    const oauth2 = google.oauth2({ version: 'v2', auth: tempClient });
    const userInfo = await oauth2.userinfo.get();
    const userEmail = userInfo.data.email;
    const userName = userInfo.data.name;

    // Find user by email - create account if first time
    let user = db.prepare("SELECT id FROM users WHERE email = ?").get(userEmail) as any;
    let isNewUser = false;
    if (!user && userEmail) {
      const trialEnds = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().replace('T', ' ').split('.')[0];
      const result = db.prepare(
        "INSERT INTO users (email, password_hash, plan, subscription_plan, trial_ends_at) VALUES (?, ?, 'trial', 'trial', ?)"
      ).run(userEmail, '', trialEnds);
      user = { id: result.lastInsertRowid };
      isNewUser = true;
    }
    const userId = user?.id || null;

    // Grant 50 trial enrichment credits to new users registering via Google OAuth
    if (isNewUser && userId && !isFounder(userEmail || '')) {
      grantEnrichmentCredits(userId, 50, 'trial_grant', '50 free enrichment credits on trial signup');
    }

    if (userEmail) {
      db.prepare(`
        INSERT INTO google_tokens (user_id, user_email, user_name, access_token, refresh_token, expiry_date)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_email) DO UPDATE SET
          user_name = excluded.user_name,
          access_token = excluded.access_token,
          refresh_token = excluded.refresh_token,
          expiry_date = excluded.expiry_date,
          user_id = excluded.user_id
      `).run(userId, userEmail, userName, tokens.access_token, tokens.refresh_token, tokens.expiry_date);
    }

    // Create a session token so the user is logged in
    let sessionToken = null;
    if (userId) {
      sessionToken = randomBytes(32).toString('hex');
      const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      db.prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)").run(sessionToken, userId, expires);
    }

    // XSS-safe JSON stringification
    const authPayload = { type: 'GOOGLE_AUTH_SUCCESS', email: userEmail, name: userName, token: sessionToken };
    const safePayload = JSON.stringify(authPayload)
      .replace(/</g, '\\u003c')
      .replace(/>/g, '\\u003e')
      .replace(/&/g, '\\u0026');

    res.send(`
      <html>
        <body>
          <script>
            var data = ${safePayload};
            if (window.opener) {
              window.opener.postMessage(data, window.location.origin);
              window.close();
            } else {
              if (data.token) {
                localStorage.setItem('leadjin_token', data.token);
              }
              window.location.href = '/';
            }
          </script>
          <p>Authentication successful. You can close this window.</p>
        </body>
      </html>
    `);
  } catch (error) {
    console.error("Google Auth Error:", error);
    res.status(500).send("Authentication failed.");
  }
});

app.get("/api/auth/google/status", (req, res) => {
  const user = getUserFromToken(req) as any;
  // Check if Google OAuth is configured on the server
  const oauthConfigured = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  if (!user) {
    return res.json({ connected: false, oauthConfigured });
  }
  const tokens = db.prepare("SELECT user_email, user_name FROM google_tokens WHERE user_id = ?").get(user.id) as any;
  res.json({ connected: !!tokens, email: tokens?.user_email, name: tokens?.user_name, oauthConfigured });
});

app.post("/api/auth/google/test", async (req: express.Request, res: express.Response) => {
  const user = requireAuth(req, res);
  if (!user) return;
  try {
    if (!process.env.GOOGLE_CLIENT_ID) return res.status(503).json({ error: "Google OAuth not configured" });
    const tokens = db.prepare("SELECT * FROM google_tokens WHERE user_id = ?").get(user.id) as any;
    if (!tokens) return res.status(401).json({ error: "Not connected" });

    const oauth2Client = getOAuth2Client(user.id);
    if (!oauth2Client) return res.status(503).json({ error: "Google OAuth not configured" });
    
    oauth2Client.setCredentials({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry_date: tokens.expiry_date
    });

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    
    // Send a test email to the user themselves
    const subject = "LEADJIN Connection Test";
    const body = `Hello ${tokens.user_name},\n\nYour Google Workspace connection is active and ready for autonomous outreach.\n\nBest,\nLEADJIN Engine`;
    
    const utf8Subject = `=?utf-8?B?${Buffer.from(subject).toString('base64')}?=`;
    const messageParts = [
      `From: ${tokens.user_name} <${tokens.user_email}>`,
      `To: ${tokens.user_email}`,
      `Content-Type: text/plain; charset=utf-8`,
      `MIME-Version: 1.0`,
      `Subject: ${utf8Subject}`,
      '',
      body,
    ];
    const message = messageParts.join('\n');
    const encodedMessage = Buffer.from(message)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw: encodedMessage },
    });

    res.json({ status: "ok" });
  } catch (error) {
    console.error("Test Email Error:", error);
    res.status(500).json({ error: "Failed to send test email" });
  }
});

app.post("/api/auth/google/disconnect", (req, res) => {
  const user = requireAuth(req, res);
  if (!user) return;
  db.prepare("DELETE FROM google_tokens WHERE user_id = ?").run(user.id);
  // Clear cached client
  oauth2Clients.delete(user.id);
  res.json({ status: "ok" });
});

// CRM: Get all leads (N2: Include Watan Score and invoice value)
app.get("/api/leads", (req, res) => {
  const user = requireAuth(req, res) as any;
  if (!user) return;
  const leads = db.prepare(`
    SELECT 
      l.*, 
      ROUND((COALESCE(l.vision_2030_score, 0) * 0.6) + (COALESCE(l.lead_score, 0) * 0.4)) as watan_score,
      COALESCE(SUM(i.amount), 0) as value
    FROM leads l
    LEFT JOIN invoices i ON i.lead_id = l.lead_id AND i.user_id = l.user_id
    WHERE l.user_id = ? 
    GROUP BY l.lead_id
    ORDER BY l.created_at DESC
  `).all(user.id);
  res.json(leads);
});

// CRM: Delete a lead
app.delete("/api/leads/:lead_id", (req, res) => {
  const user = requireAuth(req, res) as any;
  if (!user) return;
  const { lead_id } = req.params;
  
  // Check lead exists and belongs to user
  const lead = db.prepare("SELECT lead_id FROM leads WHERE lead_id = ? AND user_id = ?").get(lead_id, user.id) as any;
  if (!lead) {
    return res.status(404).json({ error: "Lead not found" });
  }
  
  // Cascade delete from related tables
  db.prepare("DELETE FROM activity_log WHERE lead_id = ? AND user_id = ?").run(lead_id, user.id);
  db.prepare("DELETE FROM email_queue WHERE lead_id = ? AND user_id = ?").run(lead_id, user.id);
  db.prepare("DELETE FROM bookings WHERE lead_id = ? AND user_id = ?").run(lead_id, user.id);
  db.prepare("DELETE FROM invoices WHERE lead_id = ? AND user_id = ?").run(lead_id, user.id);
  db.prepare("DELETE FROM proposals WHERE lead_id = ? AND user_id = ?").run(lead_id, user.id);
  
  // Delete the lead
  const result = db.prepare("DELETE FROM leads WHERE lead_id = ? AND user_id = ?").run(lead_id, user.id);
  
  if (result.changes === 0) {
    return res.status(404).json({ error: "Lead not found" });
  }
  
  res.json({ status: "ok", message: "Lead deleted successfully" });
});

// CRM: Update a lead
app.put("/api/leads/:lead_id", (req, res) => {
  const user = requireAuth(req, res) as any;
  if (!user) return;
  const { lead_id } = req.params;
  const { name, email, company, title, phone, linkedin, twitter, website } = req.body;
  
  // Check lead exists and belongs to user
  const existingLead = db.prepare("SELECT * FROM leads WHERE lead_id = ? AND user_id = ?").get(lead_id, user.id) as any;
  if (!existingLead) {
    return res.status(404).json({ error: "Lead not found" });
  }
  
  // Validate email format if provided
  if (email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: "Invalid email format" });
    }
  }
  
  // Build update fields
  const updates: string[] = [];
  const params: any[] = [];
  
  if (name !== undefined) { updates.push("name = ?"); params.push(name); }
  if (email !== undefined) { updates.push("email = ?"); params.push(email); }
  if (company !== undefined) { updates.push("company = ?"); params.push(company); }
  if (title !== undefined) { updates.push("title = ?"); params.push(title); }
  if (phone !== undefined) { updates.push("phone = ?"); params.push(phone); }
  if (linkedin !== undefined) { updates.push("linkedin = ?"); params.push(linkedin); }
  if (twitter !== undefined) { updates.push("twitter = ?"); params.push(twitter); }
  if (website !== undefined) { updates.push("website = ?"); params.push(website); }
  
  if (updates.length === 0) {
    return res.status(400).json({ error: "No fields to update" });
  }
  
  params.push(lead_id, user.id);
  
  // Update the lead
  db.prepare(`UPDATE leads SET ${updates.join(", ")} WHERE lead_id = ? AND user_id = ?`).run(...params);
  
  // Log the change
  const changes = Object.keys(req.body).filter(k => ['name', 'email', 'company', 'title'].includes(k)).join(', ');
  db.prepare("INSERT INTO activity_log (lead_id, user_id, type, description) VALUES (?, ?, ?, ?)").run(
    lead_id, user.id, "LEAD_UPDATED", `Lead updated: ${changes}`
  );
  
  // Return updated lead
  const updatedLead = db.prepare("SELECT * FROM leads WHERE lead_id = ? AND user_id = ?").get(lead_id, user.id);
  res.json({ status: "ok", lead: updatedLead });
});

// CRM: Get interaction history for a lead (email queue + activity log)
app.get("/api/leads/:lead_id/interactions", (req, res) => {
  const user = requireAuth(req, res) as any;
  if (!user) return;
  const { lead_id } = req.params;
  const emails = db.prepare(
    "SELECT 'email' as type, subject as summary, COALESCE(sent_at, created_at) as date, status as outcome, scheduled_at FROM email_queue WHERE lead_id = ? AND user_id = ? ORDER BY date DESC"
  ).all(lead_id, user.id);
  const activity = db.prepare(
    "SELECT type, description as summary, created_at as date, '' as outcome FROM activity_log WHERE lead_id = ? AND user_id = ? ORDER BY date DESC"
  ).all(lead_id, user.id);
  const all = [...emails, ...activity].sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
  res.json(all);
});

// CRM: Log a manual interaction for a lead
app.post("/api/leads/:lead_id/interactions", (req, res) => {
  const user = requireAuth(req, res) as any;
  if (!user) return;
  const { lead_id } = req.params;
  const { type, summary, outcome } = req.body;
  if (!type || !summary) return res.status(400).json({ error: "type and summary required" });
  db.prepare("INSERT INTO activity_log (lead_id, user_id, type, description) VALUES (?, ?, ?, ?)").run(
    lead_id, user.id, type.toUpperCase(), summary
  );
  res.json({ status: "ok" });
});

// CRM: Sync leads from frontend
app.post("/api/leads/sync", (req, res) => {
  const user = requireAuth(req, res) as any;
  if (!user) return;
  const { leads } = req.body;
  
  // Batch size limit
  if (!Array.isArray(req.body.leads) || req.body.leads.length > 500) {
    return res.status(400).json({ error: 'Invalid leads array (max 500)' });
  }
  
  // Track duplicates and new leads
  let syncedCount = 0;
  let skippedDuplicates = 0;
  
  const insert = db.prepare(`
    INSERT OR REPLACE INTO leads (lead_id, name, title, company, email, linkedin, industry, lead_score, vision_2030_score, vision_2030_program, vision_2030_alignment, user_id, stage_entered_at, email_verified, email_source)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT stage_entered_at FROM leads WHERE lead_id = ?), CURRENT_TIMESTAMP), ?, ?)
  `);
  
  const checkDuplicate = db.prepare(`
    SELECT lead_id FROM leads 
    WHERE user_id = ? AND (
      LOWER(company) = LOWER(?) OR 
      (LOWER(name) = LOWER(?) AND LOWER(email) = LOWER(?))
    )
  `);

  const transaction = db.transaction((leads: any[]) => {
    for (const lead of leads) {
      // Check for duplicates (A7)
      const existing = checkDuplicate.get(user.id, lead.company || '', lead.name || '', lead.email || '');
      if (existing && !lead.lead_id) {
        skippedDuplicates++;
        continue;
      }
      
      const leadId = lead.lead_id || `lead_${randomUUID()}`;
      
      insert.run(
        leadId,
        lead.name,
        lead.title,
        lead.company,
        lead.email,
        lead.linkedin,
        lead.industry,
        lead.lead_score,
        lead.vision_2030_alignment?.score || 0,
        lead.vision_2030_alignment?.program || '',
        JSON.stringify(lead.vision_2030_alignment || {}),
        user.id,
        leadId,
        lead.email_verified ? 1 : 0,
        lead.email_source || 'gemini'
      );
      
      syncedCount++;
      // Note: past_interactions from AI are NOT stored - only real interactions are logged
    }
  });

  transaction(leads);
  res.json({ status: "ok", synced: syncedCount, skipped_duplicates: skippedDuplicates });
});

// CRM: Update lead status
const VALID_LEAD_STATUSES = ['NEW', 'CONTACTED', 'REPLIED', 'MEETING', 'PROPOSAL', 'CLOSED'];

app.post("/api/leads/status", (req, res) => {
  const user = requireAuth(req, res) as any;
  if (!user) return;
  const { id, status } = req.body;
  
  // Validate status
  if (!VALID_LEAD_STATUSES.includes(status)) {
    return res.status(400).json({ error: `Invalid status. Must be one of: ${VALID_LEAD_STATUSES.join(', ')}` });
  }
  
  // Update stage_entered_at when status changes
  db.prepare("UPDATE leads SET status = ?, stage_entered_at = CURRENT_TIMESTAMP WHERE lead_id = ? AND user_id = ?").run(status, id, user.id);
  
  db.prepare("INSERT INTO activity_log (lead_id, user_id, type, description) VALUES (?, ?, ?, ?)").run(
    id, user.id, "STATUS_CHANGE", `Status updated to ${status}`
  );
  res.json({ status: "ok" });
});

// --- Vision Strategist: Craft personalized outreach ---
app.post("/api/craft-outreach", async (req, res) => {
  const user = requireAuth(req, res) as any;
  if (!user) return;
  
  // Check subscription/trial status
  const outreachUser = db.prepare("SELECT email, subscription_plan, subscription_expires_at, trial_ends_at, is_founder FROM users WHERE id = ?").get(user.id) as any;
  const outreachSubStatus = getSubscriptionStatus(outreachUser);
  if (!outreachSubStatus.isActive) {
    return res.status(403).json({ error: "trial_expired", message: "Your trial has ended. Upgrade to continue using Vision Strategist.", upgrade: true });
  }
  
  const { lead, context } = req.body as { lead: LeadProfile; context: OutreachContext };
  
  // Validate required fields
  if (!lead?.name || !lead?.title || !lead?.company) {
    return res.status(400).json({ error: "Lead name, title, and company are required" });
  }
  if (!context?.service) {
    return res.status(400).json({ error: "Context service is required" });
  }
  
  // Get API key (user-specific or system)
  const apiKeyRow = db.prepare("SELECT gemini_api_key FROM users WHERE id = ?").get(user.id) as any;
  const apiKey = apiKeyRow?.gemini_api_key || process.env.GEMINI_API_KEY;
  
  if (!apiKey) {
    return res.status(400).json({ error: "Gemini API key required. Please configure in settings." });
  }
  
  // Get sender info from user profile
  const senderInfo = db.prepare("SELECT company_name, email FROM users WHERE id = ?").get(user.id) as any;
  const enrichedContext: OutreachContext = {
    ...context,
    senderCompany: context.senderCompany || senderInfo?.company_name || 'Our Company',
    senderName: context.senderName || senderInfo?.email?.split('@')[0] || outreachUser?.email?.split('@')[0] || 'The Team'
  };
  
  try {
    const result = await craftOutreach(lead, enrichedContext, apiKey);
    res.json(result);
  } catch (error: any) {
    console.error('[VisionStrategist] Route error:', error.message);
    res.status(500).json({ error: "Failed to craft outreach", message: error.message });
  }
});

// Email: Get templates - returns user-specific templates
app.get("/api/email/templates", (req, res) => {
  const user = requireAuth(req, res);
  if (!user) return;
  const templates = db.prepare("SELECT * FROM email_templates WHERE user_id = ? OR user_id IS NULL").all(user.id);
  res.json(templates);
});

// Email: Queue an email (with optional Day 3 / Day 7 follow-ups)
app.post("/api/email/queue", (req, res) => {
  const user = requireAuth(req, res) as any;
  if (!user) return;
  // Trial/subscription gate
  const emailUser = db.prepare("SELECT email, subscription_plan, subscription_expires_at, trial_ends_at, is_founder FROM users WHERE id = ?").get(user.id) as any;
  const emailSubStatus = getSubscriptionStatus(emailUser);
  if (!emailSubStatus.isActive) {
    return res.status(403).json({ error: "trial_expired", message: "Your 14-day Pro trial has ended. Upgrade to continue sending outreach.", upgrade: true });
  }
  const { lead_id, to_email, subject, body, with_followups, scheduled_at } = req.body;
  if (!to_email || !subject || !body) return res.status(400).json({ error: "to_email, subject, body required" });
  
  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(to_email)) {
    return res.status(400).json({ error: "Invalid email format" });
  }
  
  // Validate subject length (max 200 chars)
  if (subject.length > 200) {
    return res.status(400).json({ error: "Subject must be under 200 characters" });
  }
  
  // Validate body size (max 50KB)
  if (body.length > 50 * 1024) {
    return res.status(400).json({ error: "Body must be under 50KB" });
  }

  // Basic rate limiting check (50/hour) - founder bypass
  if (!isFounder(user.email)) {
    const sentInLastHour = db.prepare("SELECT COUNT(*) as count FROM email_queue WHERE user_id = ? AND sent_at > datetime('now', '-1 hour')").get(user.id) as any;
    if (sentInLastHour.count >= 50) {
      return res.status(429).json({ error: "Rate limit exceeded (50 emails/hour)" });
    }
  }

  const queueEmail = db.prepare("INSERT INTO email_queue (lead_id, user_id, to_email, subject, body, scheduled_at) VALUES (?,?,?,?,?,?)");

  // Day 0 — immediate or scheduled
  queueEmail.run(lead_id || null, user.id, to_email, subject, body, scheduled_at || null);

  // Auto-schedule Day 3 and Day 7 follow-ups if requested (array format)
  if (with_followups && Array.isArray(with_followups)) {
    for (const f of with_followups) {
      queueEmail.run(lead_id || null, user.id, to_email, f.subject, f.body, f.scheduled_at || null);
    }
  } else if (with_followups === true) {
    // Legacy boolean support - schedule default Day 3 and Day 7
    const day3At = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().replace('T', ' ').split('.')[0];
    const day7At = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().replace('T', ' ').split('.')[0];
    const day3Subject = `Following up: ${subject}`;
    const day3Body = `Hi,\n\nJust following up on my previous message. Would love to connect!\n\nBest,\nLEADJIN`;
    queueEmail.run(lead_id || null, user.id, to_email, day3Subject, day3Body, day3At);
    const day7Subject = `Last follow-up: ${subject}`;
    const day7Body = `Hi,\n\nThis will be my last follow-up. I'm here whenever you're ready.\n\nBest,\nLEADJIN`;
    queueEmail.run(lead_id || null, user.id, to_email, day7Subject, day7Body, day7At);
  }

  res.json({ queued: true });
});

// Email: Unsubscribe endpoint (GET for email client compatibility)
app.get("/api/unsubscribe", (req, res) => {
  const { email, token } = req.query;
  
  if (!email || !token) {
    return res.status(400).json({ error: "Email and token are required" });
  }
  
  // Verify HMAC-based unsubscribe token
  const expectedToken = createHmac('sha256', process.env.LEADJIN_ADMIN_SECRET || 'leadjin-unsubscribe-fallback').update(email as string).digest('hex').slice(0, 16);
  if (token !== expectedToken) {
    return res.status(400).json({ error: "Invalid unsubscribe link" });
  }
  
  // Mark all pending emails for this address as cancelled and set do_not_contact
  try {
    db.prepare("UPDATE email_queue SET status = 'CANCELLED' WHERE to_email = ? AND status = 'PENDING'").run(email);
    db.prepare("UPDATE leads SET do_not_contact = 1 WHERE email = ?").run(email);
    res.json({ status: "ok", message: "You have been unsubscribed from future emails." });
  } catch (error: any) {
    res.status(500).json({ error: "Failed to process unsubscribe request" });
  }
});

// --- Quotation Routes ---

// Quotation: Save a custom quotation for a lead (A6 - VAT + Currency support)
app.post("/api/quotations/create", (req, res) => {
  const user = requireAuth(req, res) as any;
  if (!user) return;
  const { lead_id, items, notes, valid_days, currency, vat_rate, company_vat_number } = req.body;
  if (!lead_id || !items || !Array.isArray(items)) {
    return res.status(400).json({ error: "lead_id and items array are required" });
  }
  
  // Validate amounts are positive
  for (const item of items) {
    if (item.amount && (Number(item.amount) < 0)) {
      return res.status(400).json({ error: "Amount cannot be negative" });
    }
  }
  
  // Calculate totals with VAT
  const subtotal = items.reduce((sum: number, i: any) => sum + (Number(i.amount) || 0), 0);
  const vatRate = vat_rate || 0.15; // Default 15% Saudi VAT
  const vatAmount = Math.round(subtotal * vatRate);
  const total = subtotal + vatAmount;
  const cur = currency || 'SAR';
  
  const invoiceId = db.prepare(
    `INSERT INTO invoices (lead_id, amount, currency, vat_rate, vat_amount, subtotal, company_vat_number, status, payment_link, user_id) 
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    lead_id, 
    total * 100, 
    cur,
    vatRate,
    vatAmount * 100,
    subtotal * 100,
    company_vat_number || '',
    'DRAFT', 
    JSON.stringify({ items, notes, valid_days: valid_days || 30, currency: cur, vat_rate: vatRate }), 
    user.id
  ).lastInsertRowid;

  // Queue email notification to lead
  const lead = db.prepare("SELECT * FROM leads WHERE lead_id = ? AND user_id = ?").get(lead_id, user.id) as any;
  const userCompany = db.prepare("SELECT company_name FROM users WHERE id = ?").get(user.id) as any;
  if (lead?.email) {
    const itemList = items.map((i: any) => `- ${i.label}: ${cur} ${Number(i.amount).toLocaleString()}`).join('\n');
    db.prepare("INSERT INTO email_queue (lead_id, user_id, to_email, subject, body) VALUES (?,?,?,?,?)")
      .run(lead_id, user.id, lead.email,
        `Quotation from ${userCompany?.company_name || 'LEADJIN'} — ${items[0]?.label || 'Services'}`,
        `Dear ${lead.name},\n\nPlease find your quotation below:\n\n${itemList}\n\nSubtotal: ${cur} ${subtotal.toLocaleString()}\nVAT (${(vatRate*100).toFixed(0)}%): ${cur} ${vatAmount.toLocaleString()}\nTotal: ${cur} ${total.toLocaleString()}\n\nValid for ${valid_days || 30} days.\n\nReply to discuss further.`
      );
  }
  
  res.json({ 
    status: "created", 
    invoice_id: invoiceId, 
    subtotal,
    vat_amount: vatAmount,
    total,
    currency: cur
  });
});

// Quotation: Get quotations for a lead
app.get("/api/quotations/:lead_id", (req, res) => {
  const user = requireAuth(req, res) as any;
  if (!user) return;
  const invoices = db.prepare("SELECT * FROM invoices WHERE lead_id = ? AND user_id = ?").all(req.params.lead_id, user.id);
  res.json(invoices);
});

// Quotation: Update status (DRAFT → ACCEPTED → PAID)
app.patch("/api/quotations/:id/status", (req, res) => {
  const user = requireAuth(req, res) as any;
  if (!user) return;
  const { status } = req.body;
  if (!['DRAFT', 'ACCEPTED', 'PAID', 'CANCELLED'].includes(status)) {
    return res.status(400).json({ error: "invalid status" });
  }
  
  // Get current invoice data before updating
  const invoice = db.prepare("SELECT * FROM invoices WHERE id = ? AND user_id = ?").get(req.params.id, user.id) as any;
  if (!invoice) return res.status(404).json({ error: "not found" });
  
  const result = db.prepare("UPDATE invoices SET status = ? WHERE id = ? AND user_id = ?").run(status, req.params.id, user.id);
  if (result.changes === 0) return res.status(404).json({ error: "not found" });
  
  // Send email notifications on status change
  const lead = db.prepare("SELECT * FROM leads WHERE lead_id = ? AND user_id = ?").get(invoice.lead_id, user.id) as any;
  const userCompany = db.prepare("SELECT company_name FROM users WHERE id = ?").get(user.id) as any;
  const currency = invoice.currency || 'SAR';
  const amount = (invoice.amount / 100).toLocaleString();
  
  if (lead?.email) {
    if (status === 'ACCEPTED') {
      db.prepare("INSERT INTO email_queue (lead_id, user_id, to_email, subject, body) VALUES (?,?,?,?,?)")
        .run(invoice.lead_id, user.id, lead.email,
          `Quotation Accepted — ${userCompany?.company_name || 'LEADJIN'}`,
          `Dear ${lead.name},\n\nThank you for accepting our quotation.\n\nTotal: ${currency} ${amount}\n\nWe will proceed with the next steps and contact you shortly.`
        );
    } else if (status === 'PAID') {
      db.prepare("INSERT INTO email_queue (lead_id, user_id, to_email, subject, body) VALUES (?,?,?,?,?)")
        .run(invoice.lead_id, user.id, lead.email,
          `Payment Received — Receipt from ${userCompany?.company_name || 'LEADJIN'}`,
          `Dear ${lead.name},\n\nThank you for your payment of ${currency} ${amount}.\n\nThis email serves as your receipt. We look forward to working with you.`
        );
    }
  }
  
  res.json({ status: "updated" });
});

// Quotation: Delete (only DRAFT can be deleted)
app.delete("/api/quotations/:id", (req, res) => {
  const user = requireAuth(req, res) as any;
  if (!user) return;
  
  // Get the invoice to check status
  const invoice = db.prepare("SELECT * FROM invoices WHERE id = ? AND user_id = ?").get(req.params.id, user.id) as any;
  if (!invoice) return res.status(404).json({ error: "not found" });
  
  // Only allow deletion of DRAFT quotations
  if (invoice.status !== 'DRAFT') {
    return res.status(400).json({ error: "Only DRAFT quotations can be deleted" });
  }
  
  const result = db.prepare("DELETE FROM invoices WHERE id = ? AND user_id = ?").run(req.params.id, user.id);
  if (result.changes === 0) return res.status(404).json({ error: "not found" });
  
  res.json({ status: "deleted" });
});

// Legacy alias (keep for backward compat)
app.get("/api/payments/invoices/:lead_id", (req, res) => {
  const user = requireAuth(req, res) as any;
  if (!user) return;
  const invoices = db.prepare("SELECT * FROM invoices WHERE lead_id = ? AND user_id = ?").all(req.params.lead_id, user.id);
  res.json(invoices);
});

// --- Proposal Management API ---
// GET /api/proposals?lead_id=xxx
app.get("/api/proposals", (req, res) => {
  const user = requireAuth(req, res) as any;
  if (!user) return;
  const { lead_id } = req.query;
  let sql = "SELECT * FROM proposals WHERE user_id = ?";
  const params: any[] = [user.id];
  if (lead_id) {
    sql += " AND lead_id = ?";
    params.push(lead_id as string);
  }
  sql += " ORDER BY updated_at DESC";
  const proposals = db.prepare(sql).all(...params);
  res.json(proposals.map((p: any) => ({ ...p, content: JSON.parse(p.content || '{}') })));
});

// POST /api/proposals
app.post("/api/proposals", (req, res) => {
  const user = requireAuth(req, res) as any;
  if (!user) return;
  const { lead_id, title, content } = req.body;
  if (!title) return res.status(400).json({ error: "title required" });
  const info = db.prepare("INSERT INTO proposals (user_id, lead_id, title, content, status) VALUES (?,?,?,?,?)")
    .run(user.id, lead_id || null, title, JSON.stringify(content || {}), 'DRAFT');
  res.json({ id: info.lastInsertRowid, saved: true });
});

// PUT /api/proposals/:id
app.put("/api/proposals/:id", (req, res) => {
  const user = requireAuth(req, res) as any;
  if (!user) return;
  const { title, content, status } = req.body;
  const updates: string[] = [];
  const params: any[] = [];
  if (title !== undefined) { updates.push("title = ?"); params.push(title); }
  if (content !== undefined) { updates.push("content = ?"); params.push(JSON.stringify(content)); }
  if (status !== undefined) { updates.push("status = ?"); params.push(status); }
  if (updates.length === 0) return res.status(400).json({ error: "nothing to update" });
  params.push(req.params.id, user.id);
  const result = db.prepare(`UPDATE proposals SET ${updates.join(", ")}, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?`).run(...params);
  if (result.changes === 0) return res.status(404).json({ error: "not found" });
  res.json({ updated: true });
});

// DELETE /api/proposals/:id
app.delete("/api/proposals/:id", (req, res) => {
  const user = requireAuth(req, res) as any;
  if (!user) return;
  const result = db.prepare("DELETE FROM proposals WHERE id = ? AND user_id = ?").run(req.params.id, user.id);
  if (result.changes === 0) return res.status(404).json({ error: "not found" });
  res.json({ deleted: true });
});

// N1 - Ramadan Campaign Scheduler
app.get("/api/utils/islamic-calendar", (req, res) => {
  const today = new Date();
  const currentYear = today.getFullYear();
  const { ramadanStart, ramadanEnd, eidStart, eidEnd } = getRamadanDatesForYear(currentYear);
  
  const isRamadan = today >= ramadanStart && today <= ramadanEnd;
  const isEid = today >= eidStart && today <= eidEnd;
  
  // Calculate approximate Hijri date
  const hijriDate = getApproximateHijriDate(today);
  
  let nextHoliday = null;
  if (today < ramadanStart) {
    nextHoliday = { name: 'Ramadan', date: ramadanStart.toISOString().split('T')[0] };
  } else if (today < eidStart && today > ramadanEnd) {
    nextHoliday = { name: 'Eid al-Fitr', date: eidStart.toISOString().split('T')[0] };
  }
  
  res.json({
    isRamadan,
    isEid,
    nextHoliday,
    pauseCampaigns: isRamadan || isEid,
    hijriDate,
    ramadanDates: {
      start: ramadanStart.toISOString().split('T')[0],
      end: ramadanEnd.toISOString().split('T')[0],
    },
  });
});

// --- Test Seeding Route ---
app.post("/api/test/seed", (req, res) => {
  // Gate in production
  if (process.env.NODE_ENV !== 'development') {
    return res.status(404).json({ error: 'Not found' });
  }
  
  const user = requireAuth(req, res) as any;
  if (!user) return;
  try {
    // Clear existing test data (optional, but good for a clean case study)
    db.prepare("DELETE FROM leads WHERE user_id = ?").run(user.id);
    db.prepare("DELETE FROM email_queue WHERE user_id = ?").run(user.id);
    db.prepare("DELETE FROM invoices WHERE user_id = ?").run(user.id);
    db.prepare("DELETE FROM bookings WHERE user_id = ?").run(user.id);

    const saudiLeads = [
      { id: 'l1', name: 'Ahmed Al-Sudairy', company: 'NEOM Tech Solutions', title: 'Director of Innovation', email: 'ahmed@neom.sa', industry: 'Technology', score: 94, status: 'CLOSED', v2030: 95, vProg: 'PIF Program' },
      { id: 'l2', name: 'Sara Bin Ladin', company: 'Red Sea Global', title: 'VP Strategy', email: 'sara@redseaglobal.com', industry: 'Tourism', score: 88, status: 'PROPOSAL', v2030: 92, vProg: 'Quality of Life' },
      { id: 'l3', name: 'Khalid Al-Faisal', company: 'Aramco Digital', title: 'Head of AI', email: 'khalid@aramco.sa', industry: 'Energy', score: 91, status: 'MEETING', v2030: 85, vProg: 'NIDLP' },
      { id: 'l4', name: 'Noura Al-Saud', company: 'PIF (Public Investment Fund)', title: 'Investment Manager', email: 'noura@pif.gov.sa', industry: 'Finance', score: 96, status: 'REPLIED', v2030: 98, vProg: 'PIF Program' },
      { id: 'l5', name: 'Fahad Al-Rashid', company: 'King Abdullah Financial District', title: 'CEO', email: 'fahad@kafd.sa', industry: 'Real Estate', score: 85, status: 'CONTACTED', v2030: 80, vProg: 'Housing Program' },
      { id: 'l6', name: 'Mona Al-Zahrani', company: 'STC Solutions', title: 'CTO', email: 'mona@stc.com.sa', industry: 'Telecom', score: 82, status: 'NEW', v2030: 75, vProg: 'Digital Transformation' },
      { id: 'l7', name: 'Omar Al-Ghamdi', company: 'SABIC', title: 'Supply Chain Director', email: 'omar@sabic.com', industry: 'Manufacturing', score: 79, status: 'NEW', v2030: 70, vProg: 'NIDLP' },
      { id: 'l8', name: 'Laila Al-Otaibi', company: 'Ministry of Investment', title: 'Advisor', email: 'laila@misa.gov.sa', industry: 'Government', score: 92, status: 'CONTACTED', v2030: 90, vProg: 'Privatization' },
      { id: 'l9', name: 'Yousef Al-Harbi', company: 'Riyadh Air', title: 'Digital Transformation Lead', email: 'yousef@riyadhair.sa', industry: 'Aviation', score: 87, status: 'NEW', v2030: 88, vProg: 'NIDLP' },
      { id: 'l10', name: 'Reem Al-Dossary', company: 'Lucid Motors Middle East', title: 'Regional Manager', email: 'reem@lucidmotors.com', industry: 'Automotive', score: 84, status: 'NEW', v2030: 82, vProg: 'Sustainability' }
    ];

    const insertLead = db.prepare("INSERT INTO leads (lead_id, name, company, title, email, industry, lead_score, status, vision_2030_score, vision_2030_program, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");

    saudiLeads.forEach((l: any) => {
      insertLead.run(l.id, l.name, l.company, l.title, l.email, l.industry, l.score, l.status, l.v2030, l.vProg, user.id);

      if (l.status !== 'NEW') {
        db.prepare("INSERT INTO email_queue (lead_id, to_email, subject, body, status, sent_at, user_id) VALUES (?, ?, ?, ?, 'SENT', datetime('now', '-1 day'), ?)").run(
          l.id, l.email, 'Strategic Partnership', 'Test body', user.id
        );
      }

      if (l.status === 'MEETING' || l.status === 'PROPOSAL' || l.status === 'CLOSED') {
        db.prepare("INSERT INTO bookings (lead_id, start_time, end_time, summary, user_id) VALUES (?, datetime('now', '+1 day'), datetime('now', '+1 day', '+1 hour'), ?, ?)").run(
          l.id, `Discovery Call with ${l.company}`, user.id
        );
      }

      if (l.status === 'PROPOSAL' || l.status === 'CLOSED') {
        const invStatus = l.status === 'CLOSED' ? 'PAID' : 'PENDING';
        db.prepare("INSERT INTO invoices (lead_id, amount, status, user_id) VALUES (?, ?, ?, ?)").run(
          l.id, 100000, invStatus, user.id
        );
      }
    });

    res.json({ status: "success", message: "Case study data seeded successfully." });
  } catch (err: any) {
    res.status(500).json({ error: "internal server error" });
  }
});

// N5: Prayer time checker for Riyadh
function checkPrayerTimeConflict(startTime: Date): { hasConflict: boolean; prayer?: string; suggestedTime?: string } {
  const hours = startTime.getHours();
  const minutes = startTime.getMinutes();
  const timeDecimal = hours + minutes / 60;
  
  // Riyadh prayer times (approximate, ±30min window)
  const prayers = [
    { name: 'Fajr', start: 5.0, end: 5.5, suggest: '06:00' },
    { name: 'Dhuhr', start: 12.25, end: 12.75, suggest: '13:00' },
    { name: 'Asr', start: 15.5, end: 16.0, suggest: '16:30' },
    { name: 'Maghrib', start: 18.0, end: 18.5, suggest: '19:00' },
    { name: 'Isha', start: 19.5, end: 20.0, suggest: '20:30' }
  ];
  
  for (const prayer of prayers) {
    if (timeDecimal >= prayer.start && timeDecimal <= prayer.end) {
      return { hasConflict: true, prayer: prayer.name, suggestedTime: prayer.suggest };
    }
  }
  return { hasConflict: false };
}

// --- Calendar Routes ---

app.post("/api/calendar/book", async (req: express.Request, res: express.Response) => {
  const user = requireAuth(req, res) as any;
  if (!user) return;
  const { lead_id, start_time, end_time, summary, email } = req.body;

  // Validate required fields
  if (!start_time || !end_time) {
    return res.status(400).json({ error: "start_time and end_time are required" });
  }
  
  const startDate = new Date(start_time);
  const endDate = new Date(end_time);
  
  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    return res.status(400).json({ error: "Invalid date format" });
  }
  
  if (endDate <= startDate) {
    return res.status(400).json({ error: "End time must be after start time" });
  }
  
  // N5: Check prayer time conflict
  const prayerCheck = checkPrayerTimeConflict(startDate);
  if (prayerCheck.hasConflict) {
    return res.status(400).json({ 
      error: "prayer_time_conflict", 
      prayer: prayerCheck.prayer,
      suggested_time: prayerCheck.suggestedTime,
      message: `Meeting time overlaps with ${prayerCheck.prayer} prayer. Suggested: ${prayerCheck.suggestedTime}`
    });
  }

  try {
    db.prepare("INSERT INTO bookings (lead_id, start_time, end_time, summary, user_id) VALUES (?, ?, ?, ?, ?)").run(
      lead_id, start_time, end_time, summary, user.id
    );

    // Create Google Calendar event if tokens exist
    try {
      const tokens = db.prepare('SELECT * FROM google_tokens WHERE user_id = ?').get(user.id);
      if (tokens) {
        const oauth2 = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, process.env.GOOGLE_REDIRECT_URI);
        oauth2.setCredentials({ access_token: tokens.access_token, refresh_token: tokens.refresh_token });
        const calendar = google.calendar({ version: 'v3', auth: oauth2 });
        await calendar.events.insert({
          calendarId: 'primary',
          requestBody: {
            summary: `Meeting: ${summary || 'Client Meeting'}`,
            description: req.body.notes || '',
            start: { dateTime: start_time, timeZone: 'Asia/Riyadh' },
            end: { dateTime: end_time, timeZone: 'Asia/Riyadh' },
          }
        });
      }
    } catch (calErr: any) { console.error('Calendar sync failed:', calErr.message); }
    
    // Get lead and user info for emails
    const lead = db.prepare("SELECT name FROM leads WHERE lead_id = ? AND user_id = ?").get(lead_id, user.id) as any;
    const leadName = lead?.name || 'Contact';
    const userEmail = user.email;
    const formattedDate = startDate.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    
    // Email to lead
    db.prepare("INSERT INTO email_queue (lead_id, user_id, to_email, subject, body) VALUES (?, ?, ?, ?, ?)").run(
      lead_id, user.id, email, `Meeting Confirmed: ${summary || 'Strategic Partnership'}`,
      `Dear ${leadName},\n\nYour meeting is confirmed for ${formattedDate}.\n\n${summary || 'Looking forward to discussing how we can help your business grow.'}\n\nBest regards`
    );
    
    // Email to self (user)
    db.prepare("INSERT INTO email_queue (lead_id, user_id, to_email, subject, body) VALUES (?, ?, ?, ?, ?)").run(
      lead_id, user.id, userEmail, `Meeting booked with ${leadName}`,
      `You have a meeting scheduled with ${leadName} on ${formattedDate}.\n\n${summary || ''}\n\nLead ID: ${lead_id}`
    );
    
    res.json({ status: "ok", message: "Booking confirmed and confirmation emails queued." });
  } catch (error: any) {
    res.status(500).json({ error: "internal server error" });
  }
});

app.get("/api/calendar/bookings/:lead_id", (req, res) => {
  const user = requireAuth(req, res) as any;
  if (!user) return;
  const bookings = db.prepare("SELECT * FROM bookings WHERE lead_id = ? AND user_id = ?").all(req.params.lead_id, user.id);
  res.json(bookings);
});

// --- Hijri Date Utility (A10) ---
app.get("/api/utils/hijri", (req, res) => {
  const { date } = req.query;
  try {
    const gregDate = date ? new Date(date as string) : new Date();
    if (isNaN(gregDate.getTime())) {
      return res.status(400).json({ error: "Invalid date format" });
    }
    const hijri = gregorianToHijri(gregDate);
    res.json({ 
      hijri: `${hijri.year}/${hijri.month}/${hijri.day}`,
      formatted: hijri.formatted,
      gregorian: gregDate.toISOString()
    });
  } catch (error: any) {
    res.status(500).json({ error: "internal server error" });
  }
});

// --- Service Catalog API (A4) ---
app.get("/api/services", (req, res) => {
  const user = requireAuth(req, res);
  if (!user) return;
  try {
    const services = db.prepare("SELECT * FROM service_catalog WHERE user_id = ? ORDER BY created_at DESC").all(user.id);
    res.json(services);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch services" });
  }
});

app.post("/api/services", (req, res) => {
  const user = requireAuth(req, res);
  if (!user) return;
  const { name, description, base_price, currency, category } = req.body;
  if (!name) return res.status(400).json({ error: "name is required" });
  try {
    const info = db.prepare("INSERT INTO service_catalog (user_id, name, description, base_price, currency, category) VALUES (?, ?, ?, ?, ?, ?)")
      .run(user.id, name, description || '', base_price || 0, currency || 'SAR', category || '');
    res.json({ id: info.lastInsertRowid, name, description, base_price, currency, category });
  } catch (error) {
    res.status(500).json({ error: "Failed to create service" });
  }
});

app.put("/api/services/:id", (req, res) => {
  const user = requireAuth(req, res);
  if (!user) return;
  const { name, description, base_price, currency, category } = req.body;
  try {
    const result = db.prepare("UPDATE service_catalog SET name = ?, description = ?, base_price = ?, currency = ?, category = ? WHERE id = ? AND user_id = ?")
      .run(name, description, base_price, currency, category, req.params.id, user.id);
    if (result.changes === 0) return res.status(404).json({ error: "Service not found" });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to update service" });
  }
});

app.delete("/api/services/:id", (req, res) => {
  const user = requireAuth(req, res);
  if (!user) return;
  try {
    const result = db.prepare("DELETE FROM service_catalog WHERE id = ? AND user_id = ?").run(req.params.id, user.id);
    if (result.changes === 0) return res.status(404).json({ error: "Service not found" });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete service" });
  }
});

// --- AI Price Suggestion API (A5) ---
app.post("/api/quotations/suggest-price", async (req, res) => {
  const user = requireAuth(req, res);
  if (!user) return;
  
  const { service_name, lead_industry, lead_company_size, lead_country, user_services_desc } = req.body;
  if (!service_name) return res.status(400).json({ error: "service_name is required" });
  
  // Check cache
  const cacheKey = `${service_name}:${lead_industry}:${lead_country}`;
  const cached = priceSuggestionCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp) < PRICE_CACHE_TTL) {
    return res.json({ ...cached.result, cached: true });
  }
  
  if (!process.env.GEMINI_API_KEY && process.env.LEADJIN_USE_VERTEX !== "false") {
    // Vertex path doesn't need GEMINI_API_KEY — proceed
  } else if (!process.env.GEMINI_API_KEY) {
    return res.status(503).json({ error: "GEMINI_API_KEY not configured" });
  }

  try {
    const ai = getGenAI();

    const prompt = `You are a GCC B2B pricing expert. Given a ${lead_company_size || 'mid-size'} company in ${lead_industry || 'technology'} industry in ${lead_country || 'Saudi Arabia'}, suggest a realistic price range in SAR for: ${service_name}.

${user_services_desc ? `Context about the service provider: ${user_services_desc}` : ''}

Return ONLY a JSON object in this exact format:
{
  "min_sar": number,
  "max_sar": number,
  "rationale": "string explaining the pricing logic",
  "confidence": "high|medium|low"
}`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: { responseMimeType: "application/json" }
    });
    
    let result;
    try {
      const text = response.text || '{}';
      // Strip markdown if present
      let jsonStr = text.trim();
      if (jsonStr.startsWith('```json')) {
        jsonStr = jsonStr.replace(/^```json\n?/, '').replace(/\n?```$/, '');
      } else if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/^```\n?/, '').replace(/\n?```$/, '');
      }
      result = JSON.parse(jsonStr);
    } catch (e) {
      result = { min_sar: 5000, max_sar: 15000, rationale: "Standard GCC market rate", confidence: "medium" };
    }
    
    // Cache result
    priceSuggestionCache.set(cacheKey, { result, timestamp: Date.now() });
    
    res.json({ ...result, cached: false });
  } catch (error: any) {
    console.error("[AI Price Suggestion] Error:", error.message);
    res.status(500).json({ error: "Failed to generate price suggestion" });
  }
});

// --- WhatsApp Business API — full implementation below in the WhatsApp section ---

// --- Analytics Routes ---

app.get("/api/analytics/stats", (req, res) => {
  const user = requireAuth(req, res) as any;
  if (!user) return;
  
  const { from, to } = req.query;
  let dateFilter = '';
  let dateParams: any[] = [user.id];
  
  if (from && to) {
    dateFilter = ' AND created_at >= ? AND created_at <= ?';
    dateParams = [user.id, from, to];
  }
  
  const uid = user.id;
  const totalLeads = db.prepare(`SELECT COUNT(*) as count FROM leads WHERE user_id = ?${dateFilter}`).get(...dateParams) as any;
  const contactedLeads = db.prepare(`SELECT COUNT(*) as count FROM leads WHERE user_id = ? AND status != 'NEW'${dateFilter}`).get(...dateParams) as any;
  const invoiceDateFilter = from && to ? ' AND created_at >= ? AND created_at <= ?' : '';
  const invoiceParams = from && to ? [uid, from, to] : [uid];
  const revenueByCurrency = db.prepare(`SELECT currency, SUM(amount) as total FROM invoices WHERE user_id = ? AND status = 'PAID'${invoiceDateFilter} GROUP BY currency`).all(...invoiceParams) as any[];
  const pendingByCurrency = db.prepare(`SELECT currency, SUM(amount) as total FROM invoices WHERE user_id = ? AND status IN ('DRAFT','ACCEPTED')${invoiceDateFilter} GROUP BY currency`).all(...invoiceParams) as any[];

  const funnel = [
    { name: 'Harvested', value: totalLeads.count },
    { name: 'Contacted', value: contactedLeads.count },
    { name: 'Invoiced', value: (db.prepare("SELECT COUNT(DISTINCT lead_id) as count FROM invoices WHERE user_id = ?").get(uid) as any).count },
    { name: 'Closed', value: (db.prepare("SELECT COUNT(DISTINCT lead_id) as count FROM invoices WHERE user_id = ? AND status = 'PAID'").get(uid) as any).count },
  ];

  const emailStats = db.prepare(`
    SELECT DATE(created_at) as date, COUNT(*) as count
    FROM email_queue WHERE user_id = ?
    GROUP BY DATE(created_at) ORDER BY date DESC LIMIT 7
  `).all(uid);

  const visionStats = db.prepare(`
    SELECT COALESCE(vision_2030_program, 'Uncategorized') as name, COUNT(*) as value
    FROM leads WHERE user_id = ? AND vision_2030_program IS NOT NULL AND vision_2030_program != ''
    GROUP BY vision_2030_program
  `).all(uid);

  res.json({
    summary: {
      totalLeads: totalLeads.count,
      contactedLeads: contactedLeads.count,
      revenueByCurrency: revenueByCurrency.map(r => ({ currency: r.currency || 'SAR', amount: (r.total || 0) / 100 })),
      pendingByCurrency: pendingByCurrency.map(r => ({ currency: r.currency || 'SAR', amount: (r.total || 0) / 100 })),
    },
    funnel,
    emailStats: (emailStats as any[]).reverse(),
    visionStats
  });
});

// --- Unsubscribe Endpoint ---
app.post("/api/unsubscribe", (req, res) => {
  const { email, token } = req.body;
  if (!email || !token) return res.status(400).json({ error: "email and token required" });
  
  // Verify HMAC-based unsubscribe token
  const expectedToken = createHmac('sha256', process.env.LEADJIN_ADMIN_SECRET || 'leadjin-unsubscribe-fallback').update(email).digest('hex').slice(0, 16);
  if (token !== expectedToken) {
    return res.status(400).json({ error: "Invalid unsubscribe token" });
  }
  
  // Mark lead as do_not_contact (add column if not exists)
  try {
    db.exec("ALTER TABLE leads ADD COLUMN do_not_contact INTEGER DEFAULT 0");
  } catch (e) {}
  
  const lead = db.prepare("SELECT * FROM leads WHERE email = ?").get(email) as any;
  if (lead) {
    db.prepare("UPDATE leads SET do_not_contact = 1 WHERE email = ?").run(email);
  }
  
  // Also cancel any pending emails to this address
  db.prepare("UPDATE email_queue SET status = 'CANCELLED' WHERE to_email = ? AND status = 'PENDING'").run(email);
  
  res.json({ status: "ok", message: "You have been unsubscribed." });
});

// --- Email Tracking Endpoints ---

// 1x1 transparent PNG pixel for open tracking
const TRACKING_PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

// Track email open
app.get("/api/email/track/:id/open", (req, res) => {
  const { id } = req.params;
  try {
    // Record the open event
    db.prepare("INSERT INTO email_events (email_queue_id, event_type, metadata) VALUES (?, 'open', ?)").run(
      id, JSON.stringify({ userAgent: req.headers['user-agent'], ip: req.ip })
    );
    console.log(`[EmailTrack] Open recorded for email ${id}`);
  } catch (e: any) {
    // Silently fail - don't expose errors to tracking pixel
    console.error(`[EmailTrack] Error recording open:`, e.message);
  }
  
  // Return 1x1 transparent PNG
  res.set('Content-Type', 'image/png');
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.send(TRACKING_PIXEL);
});

// Track email click and redirect
app.get("/api/email/track/:id/click", (req, res) => {
  const { id } = req.params;
  const url = req.query.url as string;
  
  if (!url) {
    return res.status(400).send('Missing url');
  }
  
  // Block non-HTTP protocols and validate URL format
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return res.status(400).send('Invalid URL protocol');
    }
  } catch {
    return res.status(400).send('Invalid URL');
  }
  
  try {
    // Record the click event
    db.prepare("INSERT INTO email_events (email_queue_id, event_type, metadata) VALUES (?, 'click', ?)").run(
      id, JSON.stringify({ url, userAgent: req.headers['user-agent'], ip: req.ip })
    );
    console.log(`[EmailTrack] Click recorded for email ${id} to ${url}`);
  } catch (e: any) {
    console.error(`[EmailTrack] Error recording click:`, e.message);
  }
  
  // Redirect to the original URL
  res.redirect(url);
});

// Get email engagement analytics
app.get("/api/analytics/email-engagement", (req, res) => {
  const user = requireAuth(req, res) as any;
  if (!user) return;
  
  const { from, to } = req.query;
  let dateFilter = '';
  const params: any[] = [user.id];
  
  if (from && to) {
    dateFilter = ' AND eq.created_at >= ? AND eq.created_at <= ?';
    params.push(from, to);
  }
  
  // Get email stats
  const emailStats = db.prepare(`
    SELECT 
      COUNT(*) as total_sent,
      SUM(CASE WHEN eq.status = 'SENT' THEN 1 ELSE 0 END) as sent,
      SUM(CASE WHEN eq.status = 'FAILED' THEN 1 ELSE 0 END) as failed
    FROM email_queue eq
    WHERE eq.user_id = ? ${dateFilter}
  `).get(...params) as any;
  
  // Get open stats
  const openStats = db.prepare(`
    SELECT 
      COUNT(DISTINCT ee.email_queue_id) as unique_opens,
      COUNT(*) as total_opens
    FROM email_events ee
    JOIN email_queue eq ON eq.id = ee.email_queue_id
    WHERE eq.user_id = ? AND ee.event_type = 'open' ${dateFilter}
  `).get(...params) as any;
  
  // Get click stats
  const clickStats = db.prepare(`
    SELECT 
      COUNT(DISTINCT ee.email_queue_id) as unique_clicks,
      COUNT(*) as total_clicks
    FROM email_events ee
    JOIN email_queue eq ON eq.id = ee.email_queue_id
    WHERE eq.user_id = ? AND ee.event_type = 'click' ${dateFilter}
  `).get(...params) as any;
  
  // Calculate rates
  const totalSent = emailStats.sent || 0;
  const openRate = totalSent > 0 ? Math.round((openStats.unique_opens / totalSent) * 100) : 0;
  const clickRate = totalSent > 0 ? Math.round((clickStats.unique_clicks / totalSent) * 100) : 0;
  
  res.json({
    total_sent: totalSent,
    unique_opens: openStats.unique_opens || 0,
    total_opens: openStats.total_opens || 0,
    unique_clicks: clickStats.unique_clicks || 0,
    total_clicks: clickStats.total_clicks || 0,
    open_rate: openRate,
    click_rate: clickRate,
    failed: emailStats.failed || 0
  });
});

// --- WhatsApp Business Cloud API Routes ---
// Env vars needed: WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_ACCESS_TOKEN,
//                  WHATSAPP_BUSINESS_ACCOUNT_ID, WHATSAPP_WEBHOOK_VERIFY_TOKEN

// GET /api/whatsapp/status — Check if WhatsApp is configured
app.get("/api/whatsapp/status", (req, res) => {
  const user = requireAuth(req, res) as any;
  if (!user) return;
  const configured = whatsappService.isConfigured();
  res.json({
    configured,
    phoneNumberId: configured ? process.env.WHATSAPP_PHONE_NUMBER_ID : undefined,
  });
});

// POST /api/whatsapp/send — Send a message to a lead
app.post("/api/whatsapp/send", async (req, res) => {
  const user = requireAuth(req, res) as any;
  if (!user) return;

  const { lead_id, message, type = 'text', templateName, templateParams } = req.body;
  if (!lead_id || !message) {
    return res.status(400).json({ error: 'lead_id and message are required' });
  }

  if (!whatsappService.isConfigured()) {
    return res.status(503).json({ error: 'WhatsApp not configured — set required env vars' });
  }

  // Look up lead's phone
  const lead = db.prepare("SELECT lead_id, name, phone FROM leads WHERE lead_id = ? AND user_id = ?").get(lead_id, user.id) as any;
  if (!lead) return res.status(404).json({ error: 'lead not found' });
  if (!lead.phone) return res.status(400).json({ error: 'lead has no phone number' });

  let result;
  const msgType = type === 'template' ? 'template' : 'text';

  if (type === 'template') {
    if (!templateName) return res.status(400).json({ error: 'templateName required for template messages' });
    result = await whatsappService.sendTemplate(lead.phone, templateName, templateParams || []);
  } else {
    result = await whatsappService.sendMessage(lead.phone, message);
  }

  if (!result.success) {
    return res.status(502).json({ error: result.error || 'Failed to send message' });
  }

  const formattedPhone = whatsappService.formatPhone(lead.phone);

  // Persist to whatsapp_messages
  db.prepare(`
    INSERT INTO whatsapp_messages (user_id, lead_id, wa_message_id, direction, phone, message_type, content, status)
    VALUES (?, ?, ?, 'outbound', ?, ?, ?, 'sent')
  `).run(user.id, lead_id, result.messageId || null, formattedPhone, msgType, message);

  // Log to activity_log
  db.prepare("INSERT INTO activity_log (lead_id, user_id, type, description) VALUES (?, ?, ?, ?)").run(
    lead_id, user.id, 'WHATSAPP_SENT', `WhatsApp ${msgType} sent to ${lead.name || lead.phone}`
  );

  res.json({ status: 'sent', messageId: result.messageId });
});

// GET /api/whatsapp/messages/:lead_id — Get message history for a lead
app.get("/api/whatsapp/messages/:lead_id", (req, res) => {
  const user = requireAuth(req, res) as any;
  if (!user) return;

  const { lead_id } = req.params;
  const lead = db.prepare("SELECT lead_id FROM leads WHERE lead_id = ? AND user_id = ?").get(lead_id, user.id) as any;
  if (!lead) return res.status(404).json({ error: 'lead not found' });

  const messages = db.prepare(`
    SELECT id, wa_message_id, direction, phone, message_type, content, status, created_at
    FROM whatsapp_messages
    WHERE lead_id = ? AND user_id = ?
    ORDER BY created_at ASC
  `).all(lead_id, user.id);

  res.json({ messages });
});

// GET /api/whatsapp/webhook — Webhook verification (Meta sends GET to verify)
app.get("/api/whatsapp/webhook", (req, res) => {
  const mode = req.query['hub.mode'] as string;
  const token = req.query['hub.verify_token'] as string;
  const challenge = req.query['hub.challenge'] as string;

  const expectedToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
  if (!expectedToken) {
    console.error('[WhatsApp Webhook] WHATSAPP_WEBHOOK_VERIFY_TOKEN not set');
    return res.status(500).send('Webhook verify token not configured');
  }

  if (mode === 'subscribe' && token === expectedToken) {
    console.log('[WhatsApp Webhook] Verification successful');
    return res.status(200).send(challenge);
  }

  console.warn('[WhatsApp Webhook] Verification failed — token mismatch or wrong mode');
  res.status(403).send('Forbidden');
});

// POST /api/whatsapp/webhook — Incoming messages and status updates from Meta
app.post("/api/whatsapp/webhook", (req, res) => {
  // Always respond 200 quickly to Meta to prevent retries
  res.status(200).send('OK');

  try {
    const body = req.body;
    if (body?.object !== 'whatsapp_business_account') return;

    for (const entry of (body.entry || [])) {
      for (const change of (entry.changes || [])) {
        const value = change.value;
        if (!value) continue;

        // Handle incoming messages
        for (const msg of (value.messages || [])) {
          const phone = msg.from;
          const waMessageId = msg.id;
          let content = '';
          let messageType = msg.type || 'text';

          if (msg.type === 'text') {
            content = msg.text?.body || '';
          } else if (msg.type === 'image') {
            content = msg.image?.caption || '[image]';
          } else if (msg.type === 'document') {
            content = msg.document?.filename || '[document]';
          } else if (msg.type === 'audio') {
            content = '[audio]';
          } else if (msg.type === 'video') {
            content = '[video]';
          } else if (msg.type === 'location') {
            content = `[location: ${msg.location?.latitude},${msg.location?.longitude}]`;
          } else {
            content = `[${msg.type}]`;
          }

          // Find lead by phone number
          const formattedPhone = whatsappService.formatPhone(phone);
          const lead = db.prepare("SELECT lead_id, user_id FROM leads WHERE replace(replace(replace(phone, '+', ''), ' ', ''), '-', '') LIKE ?").get(`%${formattedPhone.slice(-9)}`) as any;

          try {
            db.prepare(`
              INSERT OR IGNORE INTO whatsapp_messages (user_id, lead_id, wa_message_id, direction, phone, message_type, content, status)
              VALUES (?, ?, ?, 'inbound', ?, ?, ?, 'received')
            `).run(
              lead?.user_id || null,
              lead?.lead_id || null,
              waMessageId,
              formattedPhone,
              messageType,
              content
            );
          } catch (e: any) {
            console.error('[WhatsApp Webhook] Error saving inbound message:', e.message);
          }

          // Mark as read
          whatsappService.markAsRead(waMessageId).catch(() => {});

          console.log(`[WhatsApp Webhook] Inbound ${messageType} from ${phone}: ${content.slice(0, 80)}`);
        }

        // Handle status updates (sent, delivered, read, failed)
        for (const status of (value.statuses || [])) {
          const waMessageId = status.id;
          const newStatus = status.status; // 'sent', 'delivered', 'read', 'failed'

          whatsappService.updateMessageStatus(waMessageId, newStatus);

          try {
            db.prepare("UPDATE whatsapp_messages SET status = ? WHERE wa_message_id = ?")
              .run(newStatus, waMessageId);
          } catch (e: any) {
            console.error('[WhatsApp Webhook] Error updating message status:', e.message);
          }

          console.log(`[WhatsApp Webhook] Status update: ${waMessageId} → ${newStatus}`);
        }
      }
    }
  } catch (err: any) {
    console.error('[WhatsApp Webhook] Processing error:', err.message);
  }
});

// --- WhatsApp Sequences ---

// POST /api/wa-sequences — Create a new sequence
app.post("/api/wa-sequences", (req, res) => {
  const user = requireAuth(req, res) as any;
  if (!user) return;

  const { name, description, steps, settings } = req.body;
  if (!name || !steps || !Array.isArray(steps) || steps.length === 0) {
    return res.status(400).json({ error: 'name and steps array are required' });
  }

  // Validate first step is template type (WhatsApp API requirement)
  const firstStep = steps[0];
  if (!firstStep || firstStep.type !== 'template') {
    return res.status(400).json({ error: 'First step must be type "template" — WhatsApp API requires a template to initiate conversations' });
  }

  // Validate all steps
  for (const step of steps) {
    if (!step.type || !['template', 'text'].includes(step.type)) {
      return res.status(400).json({ error: `Invalid step type "${step.type}". Must be "template" or "text"` });
    }
    if (step.type === 'template' && !step.templateName) {
      return res.status(400).json({ error: 'Template steps require a templateName' });
    }
    if (step.type === 'text' && !step.message) {
      return res.status(400).json({ error: 'Text steps require a message' });
    }
  }

  const result = db.prepare(
    "INSERT INTO wa_sequences (user_id, name, description, status, steps_json, settings_json) VALUES (?, ?, ?, 'draft', ?, ?)"
  ).run(user.id, name, description || null, JSON.stringify(steps), settings ? JSON.stringify(settings) : null);

  const sequence = db.prepare("SELECT * FROM wa_sequences WHERE id = ?").get(result.lastInsertRowid) as any;
  sequence.steps = JSON.parse(sequence.steps_json);
  sequence.settings = sequence.settings_json ? JSON.parse(sequence.settings_json) : null;
  res.status(201).json(sequence);
});

// GET /api/wa-sequences — List all sequences with enrollment counts
app.get("/api/wa-sequences", (req, res) => {
  const user = requireAuth(req, res) as any;
  if (!user) return;

  const sequences = db.prepare(`
    SELECT s.*,
      COUNT(CASE WHEN e.status = 'active' THEN 1 END) as active_enrollments,
      COUNT(CASE WHEN e.status = 'completed' THEN 1 END) as completed_enrollments,
      COUNT(CASE WHEN e.status = 'paused' THEN 1 END) as paused_enrollments,
      COUNT(e.id) as total_enrollments
    FROM wa_sequences s
    LEFT JOIN wa_enrollments e ON e.sequence_id = s.id
    WHERE s.user_id = ?
    GROUP BY s.id
    ORDER BY s.created_at DESC
  `).all(user.id) as any[];

  const mapped = sequences.map((s: any) => ({
    ...s,
    steps: JSON.parse(s.steps_json),
    settings: s.settings_json ? JSON.parse(s.settings_json) : null,
  }));
  res.json(mapped);
});

// GET /api/wa-sequences/:id — Get single sequence with stats
app.get("/api/wa-sequences/:id", (req, res) => {
  const user = requireAuth(req, res) as any;
  if (!user) return;

  const seq = db.prepare("SELECT * FROM wa_sequences WHERE id = ? AND user_id = ?").get(req.params.id, user.id) as any;
  if (!seq) return res.status(404).json({ error: 'Sequence not found' });

  const stats = db.prepare(`
    SELECT
      COUNT(CASE WHEN status = 'active' THEN 1 END) as active,
      COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
      COUNT(CASE WHEN status = 'paused' THEN 1 END) as paused,
      COUNT(CASE WHEN status = 'unenrolled' THEN 1 END) as unenrolled,
      COUNT(*) as total
    FROM wa_enrollments WHERE sequence_id = ?
  `).get(seq.id) as any;

  res.json({
    ...seq,
    steps: JSON.parse(seq.steps_json),
    settings: seq.settings_json ? JSON.parse(seq.settings_json) : null,
    stats,
  });
});

// PUT /api/wa-sequences/:id — Update sequence
app.put("/api/wa-sequences/:id", (req, res) => {
  const user = requireAuth(req, res) as any;
  if (!user) return;

  const seq = db.prepare("SELECT * FROM wa_sequences WHERE id = ? AND user_id = ?").get(req.params.id, user.id) as any;
  if (!seq) return res.status(404).json({ error: 'Sequence not found' });

  const { name, description, steps, settings, status } = req.body;

  if (steps !== undefined) {
    if (!Array.isArray(steps) || steps.length === 0) {
      return res.status(400).json({ error: 'steps must be a non-empty array' });
    }
    if (steps[0]?.type !== 'template') {
      return res.status(400).json({ error: 'First step must be type "template"' });
    }
  }

  const newName = name ?? seq.name;
  const newDesc = description !== undefined ? description : seq.description;
  const newSteps = steps ? JSON.stringify(steps) : seq.steps_json;
  const newSettings = settings !== undefined ? JSON.stringify(settings) : seq.settings_json;
  const newStatus = status ?? seq.status;

  db.prepare(
    "UPDATE wa_sequences SET name = ?, description = ?, steps_json = ?, settings_json = ?, status = ? WHERE id = ? AND user_id = ?"
  ).run(newName, newDesc, newSteps, newSettings, newStatus, seq.id, user.id);

  const updated = db.prepare("SELECT * FROM wa_sequences WHERE id = ?").get(seq.id) as any;
  res.json({
    ...updated,
    steps: JSON.parse(updated.steps_json),
    settings: updated.settings_json ? JSON.parse(updated.settings_json) : null,
  });
});

// DELETE /api/wa-sequences/:id — Delete sequence (and all its enrollments)
app.delete("/api/wa-sequences/:id", (req, res) => {
  const user = requireAuth(req, res) as any;
  if (!user) return;

  const seq = db.prepare("SELECT * FROM wa_sequences WHERE id = ? AND user_id = ?").get(req.params.id, user.id) as any;
  if (!seq) return res.status(404).json({ error: 'Sequence not found' });

  db.prepare("DELETE FROM wa_enrollments WHERE sequence_id = ?").run(seq.id);
  db.prepare("DELETE FROM wa_sequences WHERE id = ? AND user_id = ?").run(seq.id, user.id);
  res.json({ status: 'ok' });
});

// POST /api/wa-sequences/:id/activate — Activate sequence
app.post("/api/wa-sequences/:id/activate", (req, res) => {
  const user = requireAuth(req, res) as any;
  if (!user) return;

  const seq = db.prepare("SELECT * FROM wa_sequences WHERE id = ? AND user_id = ?").get(req.params.id, user.id) as any;
  if (!seq) return res.status(404).json({ error: 'Sequence not found' });

  db.prepare("UPDATE wa_sequences SET status = 'active' WHERE id = ? AND user_id = ?").run(seq.id, user.id);
  res.json({ status: 'ok', sequence_status: 'active' });
});

// POST /api/wa-sequences/:id/pause — Pause sequence
app.post("/api/wa-sequences/:id/pause", (req, res) => {
  const user = requireAuth(req, res) as any;
  if (!user) return;

  const seq = db.prepare("SELECT * FROM wa_sequences WHERE id = ? AND user_id = ?").get(req.params.id, user.id) as any;
  if (!seq) return res.status(404).json({ error: 'Sequence not found' });

  db.prepare("UPDATE wa_sequences SET status = 'paused' WHERE id = ? AND user_id = ?").run(seq.id, user.id);
  res.json({ status: 'ok', sequence_status: 'paused' });
});

// POST /api/wa-sequences/:id/enroll — Enroll leads into a sequence
app.post("/api/wa-sequences/:id/enroll", (req, res) => {
  const user = requireAuth(req, res) as any;
  if (!user) return;

  const seq = db.prepare("SELECT * FROM wa_sequences WHERE id = ? AND user_id = ?").get(req.params.id, user.id) as any;
  if (!seq) return res.status(404).json({ error: 'Sequence not found' });

  if (seq.status === 'draft') {
    return res.status(400).json({ error: 'Cannot enroll leads in a draft sequence. Activate it first.' });
  }

  const { lead_ids } = req.body;
  if (!lead_ids || !Array.isArray(lead_ids) || lead_ids.length === 0) {
    return res.status(400).json({ error: 'lead_ids array is required' });
  }

  const insertEnrollment = db.prepare(`
    INSERT OR IGNORE INTO wa_enrollments (sequence_id, lead_id, user_id, current_step, status, next_send_at)
    VALUES (?, ?, ?, 0, 'active', datetime('now'))
  `);

  let enrolled = 0;
  let skipped = 0;
  const enrollErrors: string[] = [];

  for (const lead_id of lead_ids) {
    const lead = db.prepare("SELECT lead_id, phone, name, do_not_contact FROM leads WHERE lead_id = ? AND user_id = ?").get(lead_id, user.id) as any;
    if (!lead) {
      enrollErrors.push(`Lead ${lead_id} not found`);
      continue;
    }
    if (lead.do_not_contact) {
      enrollErrors.push(`Lead ${lead_id} has do_not_contact set`);
      skipped++;
      continue;
    }
    if (!lead.phone) {
      enrollErrors.push(`Lead ${lead_id} (${lead.name || 'unknown'}) has no phone number`);
      skipped++;
      continue;
    }
    const r = insertEnrollment.run(seq.id, lead_id, user.id);
    if (r.changes > 0) enrolled++;
    else skipped++; // UNIQUE constraint — already enrolled
  }

  res.json({ status: 'ok', enrolled, skipped, errors: enrollErrors });
});

// POST /api/wa-sequences/:id/unenroll — Unenroll leads from a sequence
app.post("/api/wa-sequences/:id/unenroll", (req, res) => {
  const user = requireAuth(req, res) as any;
  if (!user) return;

  const seq = db.prepare("SELECT * FROM wa_sequences WHERE id = ? AND user_id = ?").get(req.params.id, user.id) as any;
  if (!seq) return res.status(404).json({ error: 'Sequence not found' });

  const { lead_ids } = req.body;
  if (!lead_ids || !Array.isArray(lead_ids) || lead_ids.length === 0) {
    return res.status(400).json({ error: 'lead_ids array is required' });
  }

  let unenrolled = 0;
  for (const lead_id of lead_ids) {
    const r = db.prepare(
      "UPDATE wa_enrollments SET status = 'unenrolled' WHERE sequence_id = ? AND lead_id = ? AND user_id = ?"
    ).run(seq.id, lead_id, user.id);
    if (r.changes > 0) unenrolled++;
  }

  res.json({ status: 'ok', unenrolled });
});

// GET /api/wa-sequences/:id/enrollments — List enrollments for a sequence
app.get("/api/wa-sequences/:id/enrollments", (req, res) => {
  const user = requireAuth(req, res) as any;
  if (!user) return;

  const seq = db.prepare("SELECT * FROM wa_sequences WHERE id = ? AND user_id = ?").get(req.params.id, user.id) as any;
  if (!seq) return res.status(404).json({ error: 'Sequence not found' });

  const statusFilter = req.query.status as string | undefined;
  const limit = Math.min(parseInt(req.query.limit as string || '50', 10), 200);
  const offset = parseInt(req.query.offset as string || '0', 10);

  const whereExtra = statusFilter ? " AND e.status = ?" : "";
  const baseParams: any[] = [seq.id, user.id];
  if (statusFilter) baseParams.push(statusFilter);

  const enrollments = db.prepare(`
    SELECT e.*, l.name as lead_name, l.company as lead_company, l.phone as lead_phone, l.title as lead_title
    FROM wa_enrollments e
    LEFT JOIN leads l ON l.lead_id = e.lead_id
    WHERE e.sequence_id = ? AND e.user_id = ?${whereExtra}
    ORDER BY e.enrolled_at DESC LIMIT ? OFFSET ?
  `).all(...baseParams, limit, offset);

  const total = (db.prepare(
    `SELECT COUNT(*) as n FROM wa_enrollments WHERE sequence_id = ? AND user_id = ?${whereExtra}`
  ).get(...baseParams) as any).n;

  res.json({ enrollments, total, limit, offset });
});

// --- Enrichment Credits ---

// GET /api/credits/balance — returns current balance, totals, and last 20 transactions
app.get("/api/credits/balance", (req, res) => {
  const user = requireAuth(req, res) as any;
  if (!user) return;

  const row = db.prepare("SELECT enrichment_credits, enrichment_credits_used FROM users WHERE id = ?").get(user.id) as any;
  const total = row?.enrichment_credits ?? 0;
  const used = row?.enrichment_credits_used ?? 0;
  const balance = total - used;

  const transactions = db.prepare(
    "SELECT id, amount, balance_after, type, description, reference_id, created_at FROM credit_transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 20"
  ).all(user.id);

  res.json({ balance, used, total, transactions });
});

// POST /api/admin/grant-credits — admin-only: grant enrichment credits to a user
app.post("/api/admin/grant-credits", (req, res) => {
  if (!requireAdmin(req, res)) return;

  const { userId, amount, reason } = req.body;
  if (!userId || !amount || typeof amount !== 'number' || amount <= 0) {
    return res.status(400).json({ error: "userId and positive amount required" });
  }

  const targetUser = db.prepare("SELECT id, email, enrichment_credits, enrichment_credits_used FROM users WHERE id = ?").get(userId) as any;
  if (!targetUser) return res.status(404).json({ error: "user not found" });

  grantEnrichmentCredits(userId, amount, 'admin_grant', reason || `Admin grant of ${amount} credits`);

  const updated = db.prepare("SELECT enrichment_credits, enrichment_credits_used FROM users WHERE id = ?").get(userId) as any;
  const newBalance = (updated?.enrichment_credits ?? 0) - (updated?.enrichment_credits_used ?? 0);

  res.json({
    status: "ok",
    userId,
    email: targetUser.email,
    granted: amount,
    newBalance,
  });
});

// --- Intent Signals Endpoints ---

// Helper: insert signals into DB, deduplicating by title+company
function insertSignals(signals: any[], leadId: string | null, userId: number | null): number {
  let inserted = 0;
  for (const sig of signals) {
    const exists = db.prepare(
      "SELECT 1 FROM intent_signals WHERE company = ? AND title = ? LIMIT 1"
    ).get(sig.company, sig.title);
    if (!exists) {
      db.prepare(`
        INSERT INTO intent_signals (lead_id, company, signal_type, title, description, source, url, confidence, detected_at, user_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        leadId ?? null,
        sig.company,
        sig.type,
        sig.title,
        sig.description ?? null,
        sig.source ?? null,
        sig.url ?? null,
        sig.confidence ?? 50,
        sig.detected_at ?? new Date().toISOString(),
        userId ?? null
      );
      inserted++;
    }
  }
  return inserted;
}

// POST /api/signals/detect — detect and store signals for a lead or company
app.post("/api/signals/detect", async (req, res) => {
  const user = requireAuth(req, res) as any;
  if (!user) return;

  const { lead_id, company: companyOverride, domain } = req.body;

  let company = companyOverride;
  let resolvedLeadId = lead_id ?? null;

  if (lead_id && !company) {
    const lead = db.prepare("SELECT company FROM leads WHERE lead_id = ? AND user_id = ?").get(lead_id, user.id) as any;
    if (!lead) return res.status(404).json({ error: "Lead not found" });
    company = lead.company;
  }

  if (!company) {
    return res.status(400).json({ error: "Provide lead_id or company" });
  }

  try {
    const signals = await intentSignalService.detectSignals(company, domain);
    const inserted = insertSignals(signals, resolvedLeadId, user.id);

    // Return the signals from DB (includes IDs)
    const stored = resolvedLeadId
      ? db.prepare("SELECT * FROM intent_signals WHERE lead_id = ? AND user_id = ? ORDER BY detected_at DESC LIMIT 50").all(resolvedLeadId, user.id)
      : db.prepare("SELECT * FROM intent_signals WHERE company = ? AND user_id = ? ORDER BY detected_at DESC LIMIT 50").all(company, user.id);

    res.json({ signals: stored, detected: signals.length, inserted });
  } catch (e: any) {
    console.error('[Signals] detect error:', e.message);
    res.status(500).json({ error: "Failed to detect signals", detail: e.message });
  }
});

// GET /api/signals — list all signals for the authenticated user's leads, newest first
app.get("/api/signals", (req, res) => {
  const user = requireAuth(req, res) as any;
  if (!user) return;

  const signals = db.prepare(
    "SELECT * FROM intent_signals WHERE user_id = ? AND dismissed = 0 ORDER BY detected_at DESC LIMIT 100"
  ).all(user.id);

  res.json({ signals });
});

// GET /api/signals/lead/:lead_id — signals for a specific lead
app.get("/api/signals/lead/:lead_id", (req, res) => {
  const user = requireAuth(req, res) as any;
  if (!user) return;

  const { lead_id } = req.params;

  // Verify lead belongs to user
  const lead = db.prepare("SELECT lead_id FROM leads WHERE lead_id = ? AND user_id = ?").get(lead_id, user.id) as any;
  if (!lead) return res.status(404).json({ error: "Lead not found" });

  const signals = db.prepare(
    "SELECT * FROM intent_signals WHERE lead_id = ? ORDER BY detected_at DESC"
  ).all(lead_id);

  res.json({ signals });
});

// POST /api/signals/:id/dismiss — dismiss a signal
app.post("/api/signals/:id/dismiss", (req, res) => {
  const user = requireAuth(req, res) as any;
  if (!user) return;

  const { id } = req.params;
  const signal = db.prepare("SELECT id, user_id FROM intent_signals WHERE id = ?").get(Number(id)) as any;

  if (!signal) return res.status(404).json({ error: "Signal not found" });
  if (signal.user_id !== user.id) return res.status(403).json({ error: "Forbidden" });

  db.prepare("UPDATE intent_signals SET dismissed = 1 WHERE id = ?").run(Number(id));
  res.json({ ok: true });
});

// --- Intelligence Hub: CRM Schema Upgrade Routes ---

// GET /api/leads/pipeline — Get all leads grouped by outreach_status
app.get("/api/leads/pipeline", (req, res) => {
  const user = requireAuth(req, res) as any;
  if (!user) return;
  
  try {
    const pipeline = getLeadPipeline(user.id);
    const metrics = getPipelineMetrics(user.id);
    res.json({ pipeline, metrics });
  } catch (error: any) {
    console.error('[IntelligenceHub] Pipeline error:', error.message);
    res.status(500).json({ error: "Failed to fetch pipeline", message: error.message });
  }
});

// GET /api/leads/:id/score — Get composite score for a lead
app.get("/api/leads/:id/score", (req, res) => {
  const user = requireAuth(req, res) as any;
  if (!user) return;
  
  const { id } = req.params;
  
  // Verify lead belongs to user
  const lead = db.prepare("SELECT lead_id FROM leads WHERE lead_id = ? AND user_id = ?").get(id, user.id) as any;
  if (!lead) {
    return res.status(404).json({ error: "Lead not found" });
  }
  
  try {
    const score = getLeadScore(id);
    res.json({ lead_id: id, score });
  } catch (error: any) {
    console.error('[IntelligenceHub] Score error:', error.message);
    res.status(500).json({ error: "Failed to calculate score", message: error.message });
  }
});

// PUT /api/leads/:id/intelligence — Update lead intelligence data
app.put("/api/leads/:id/intelligence", async (req, res) => {
  const user = requireAuth(req, res) as any;
  if (!user) return;
  
  const { id } = req.params;
  const intelligenceData: UpdateIntelligenceInput = req.body;
  
  // Verify lead belongs to user
  const lead = db.prepare("SELECT lead_id FROM leads WHERE lead_id = ? AND user_id = ?").get(id, user.id) as any;
  if (!lead) {
    return res.status(404).json({ error: "Lead not found" });
  }
  
  try {
    const updatedLead = await updateLeadIntelligence(id, intelligenceData);
    res.json({ status: "ok", lead: updatedLead });
  } catch (error: any) {
    console.error('[IntelligenceHub] Update error:', error.message);
    res.status(500).json({ error: "Failed to update intelligence", message: error.message });
  }
});

// POST /api/leads/:id/hunt-process — Process hunt result for a lead (Hunter → Verifier → CRM)
app.post("/api/leads/:id/hunt-process", async (req, res) => {
  const user = requireAuth(req, res) as any;
  if (!user) return;
  
  const { id } = req.params;
  const { huntResult, options } = req.body;
  
  // Verify lead belongs to user
  const lead = db.prepare("SELECT * FROM leads WHERE lead_id = ? AND user_id = ?").get(id, user.id) as any;
  if (!lead) {
    return res.status(404).json({ error: "Lead not found" });
  }
  
  try {
    const processed = await processHuntResult(id, huntResult, options);
    res.json({ status: "ok", lead: processed });
  } catch (error: any) {
    console.error('[IntelligenceHub] Hunt process error:', error.message);
    res.status(500).json({ error: "Failed to process hunt result", message: error.message });
  }
});

// POST /api/leads/:id/outreach-sent — Track outreach sent (Writer → CRM)
app.post("/api/leads/:id/outreach-sent", async (req, res) => {
  const user = requireAuth(req, res) as any;
  if (!user) return;
  
  const { id } = req.params;
  const { craftedOutreach } = req.body;
  
  // Verify lead belongs to user
  const lead = db.prepare("SELECT lead_id FROM leads WHERE lead_id = ? AND user_id = ?").get(id, user.id) as any;
  if (!lead) {
    return res.status(404).json({ error: "Lead not found" });
  }
  
  try {
    await processOutreachSent(id, craftedOutreach, user.id);
    res.json({ status: "ok", message: "Outreach tracked" });
  } catch (error: any) {
    console.error('[IntelligenceHub] Outreach tracking error:', error.message);
    res.status(500).json({ error: "Failed to track outreach", message: error.message });
  }
});

// POST /api/leads/:id/reply-received — Process reply received (Reply Manager → CRM)
app.post("/api/leads/:id/reply-received", async (req, res) => {
  const user = requireAuth(req, res) as any;
  if (!user) return;
  
  const { id } = req.params;
  const { classification, replyBody } = req.body;
  
  // Verify lead belongs to user
  const lead = db.prepare("SELECT lead_id FROM leads WHERE lead_id = ? AND user_id = ?").get(id, user.id) as any;
  if (!lead) {
    return res.status(404).json({ error: "Lead not found" });
  }
  
  try {
    await processReplyReceived(id, classification, replyBody);
    res.json({ status: "ok", message: "Reply processed", classification: classification.category });
  } catch (error: any) {
    console.error('[IntelligenceHub] Reply processing error:', error.message);
    res.status(500).json({ error: "Failed to process reply", message: error.message });
  }
});

// POST /api/leads/:id/vision-alignment — Update vision alignment score
app.post("/api/leads/:id/vision-alignment", async (req, res) => {
  const user = requireAuth(req, res) as any;
  if (!user) return;
  
  const { id } = req.params;
  const { score, primaryProgram, secondaryPrograms, reasoning } = req.body;
  
  // Verify lead belongs to user
  const lead = db.prepare("SELECT lead_id FROM leads WHERE lead_id = ? AND user_id = ?").get(id, user.id) as any;
  if (!lead) {
    return res.status(404).json({ error: "Lead not found" });
  }
  
  try {
    await updateVisionAlignment(id, { score, primaryProgram, secondaryPrograms, reasoning });
    res.json({ status: "ok", message: "Vision alignment updated" });
  } catch (error: any) {
    console.error('[IntelligenceHub] Vision alignment error:', error.message);
    res.status(500).json({ error: "Failed to update vision alignment", message: error.message });
  }
});

// GET /api/intelligence/metrics — Get pipeline metrics and analytics
app.get("/api/intelligence/metrics", (req, res) => {
  const user = requireAuth(req, res) as any;
  if (!user) return;
  
  try {
    const metrics = getPipelineMetrics(user.id);
    res.json(metrics);
  } catch (error: any) {
    console.error('[IntelligenceHub] Metrics error:', error.message);
    res.status(500).json({ error: "Failed to fetch metrics", message: error.message });
  }
});

// ---------------------------------------------------------------------------
// Module 5: Intelligence Hub - CRM Routes
// ---------------------------------------------------------------------------

// POST /api/lead-score/:id — Get AI-enhanced lead score
app.post("/api/lead-score/:id", async (req, res) => {
  const user = requireAuth(req, res) as any;
  if (!user) return;
  
  const { id } = req.params;
  
  // Verify lead belongs to user
  const lead = db.prepare("SELECT lead_id FROM leads WHERE lead_id = ? AND user_id = ?").get(id, user.id) as any;
  if (!lead) {
    return res.status(404).json({ error: "Lead not found" });
  }
  
  try {
    // Get API key (user-specific or system)
    const apiKeyRow = db.prepare("SELECT gemini_api_key FROM users WHERE id = ?").get(user.id) as any;
    const apiKey = apiKeyRow?.gemini_api_key || process.env.GEMINI_API_KEY;
    
    // Get base score and engagement metrics
    const score = getLeadScore(id);
    const engagement = calculateEngagementMetrics(id);
    const history = getRelationshipHistory(id);
    
    // If API key available, get AI-enhanced insights
    let aiInsights = null;
    if (apiKey) {
      try {
        const ai = new (await import('@google/genai')).GoogleGenAI({ apiKey });
        const prompt = `Analyze this lead for CRM intelligence:

Lead: ${id}
Score: ${score.overall}/100
Engagement: ${engagement.engagement_score}/100
Response Rate: ${engagement.response_rate}%
Interactions: ${history.interaction_count}

Provide brief analysis in JSON: { "hotLead": boolean, "keyInsight": string, "priority": "high|medium|low" }`;

        const aiResponse = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: prompt,
          config: { responseMimeType: 'application/json' }
        });
        
        const text = aiResponse.text || '';
        const cleaned = text.replace(/\`\`\`json\n?|\n?\`\`\`/g, '').trim();
        aiInsights = JSON.parse(cleaned);
      } catch (aiError: any) {
        console.log('[LeadScore] AI enhancement skipped:', aiError.message);
      }
    }
    
    res.json({ 
      lead_id: id, 
      score, 
      engagement,
      history: {
        interaction_count: history.interaction_count,
        last_interaction_at: history.last_interaction_at,
      },
      ai_insights: aiInsights,
      generated_at: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[IntelligenceHub] Lead score error:', error.message);
    res.status(500).json({ error: "Failed to calculate lead score", message: error.message });
  }
});

// POST /api/pipeline-view — Get pipeline view with relationship tracking
app.post("/api/pipeline-view", (req, res) => {
  const user = requireAuth(req, res) as any;
  if (!user) return;
  
  try {
    const pipeline = getPipelineView(user.id);
    const metrics = getPipelineMetrics(user.id);
    
    // Enhance pipeline with relationship data
    const enhancedPipeline = pipeline.map(group => ({
      ...group,
      leads: group.leads.map(lead => {
        const engagement = calculateEngagementMetrics(lead.lead_id);
        const history = getRelationshipHistory(lead.lead_id);
        return {
          ...lead,
          engagement,
          recent_interactions: history.events.slice(0, 5),
        };
      }),
    }));
    
    res.json({ 
      pipeline: enhancedPipeline, 
      metrics,
      generated_at: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[IntelligenceHub] Pipeline view error:', error.message);
    res.status(500).json({ error: "Failed to fetch pipeline view", message: error.message });
  }
});

// POST /api/next-action/:id — Get AI-powered next best action recommendation
app.post("/api/next-action/:id", async (req, res) => {
  const user = requireAuth(req, res) as any;
  if (!user) return;
  
  const { id } = req.params;
  
  // Verify lead belongs to user
  const lead = db.prepare("SELECT lead_id FROM leads WHERE lead_id = ? AND user_id = ?").get(id, user.id) as any;
  if (!lead) {
    return res.status(404).json({ error: "Lead not found" });
  }
  
  try {
    // Get API key (user-specific or system)
    const apiKeyRow = db.prepare("SELECT gemini_api_key FROM users WHERE id = ?").get(user.id) as any;
    const apiKey = apiKeyRow?.gemini_api_key || process.env.GEMINI_API_KEY;
    
    // Get next action recommendation
    const recommendation = await getNextAction(id, apiKey);
    
    // Get supporting data
    const score = getLeadScore(id);
    const engagement = calculateEngagementMetrics(id);
    const history = getRelationshipHistory(id);
    
    res.json({ 
      lead_id: id,
      recommendation,
      context: {
        score: score.overall,
        engagement: engagement.engagement_score,
        status: (db.prepare("SELECT outreach_status FROM leads WHERE lead_id = ?").get(id) as any)?.outreach_status,
        recent_interactions: history.events.slice(0, 3),
      },
      generated_at: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[IntelligenceHub] Next action error:', error.message);
    res.status(500).json({ error: "Failed to generate recommendation", message: error.message });
  }
});

// POST /api/relationship/:id/track — Track relationship events
app.post("/api/relationship/:id/track", (req, res) => {
  const user = requireAuth(req, res) as any;
  if (!user) return;
  
  const { id } = req.params;
  const { events } = req.body;
  
  if (!Array.isArray(events)) {
    return res.status(400).json({ error: "events array is required" });
  }
  
  // Verify lead belongs to user
  const lead = db.prepare("SELECT lead_id FROM leads WHERE lead_id = ? AND user_id = ?").get(id, user.id) as any;
  if (!lead) {
    return res.status(404).json({ error: "Lead not found" });
  }
  
  try {
    const history = trackRelationship(id, events);
    res.json({ 
      status: "ok", 
      history,
      tracked_at: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[IntelligenceHub] Track relationship error:', error.message);
    res.status(500).json({ error: "Failed to track relationship", message: error.message });
  }
});

// GET /api/relationship/:id/history — Get relationship history
app.get("/api/relationship/:id/history", (req, res) => {
  const user = requireAuth(req, res) as any;
  if (!user) return;
  
  const { id } = req.params;
  
  // Verify lead belongs to user
  const lead = db.prepare("SELECT lead_id FROM leads WHERE lead_id = ? AND user_id = ?").get(id, user.id) as any;
  if (!lead) {
    return res.status(404).json({ error: "Lead not found" });
  }
  
  try {
    const history = getRelationshipHistory(id);
    const engagement = calculateEngagementMetrics(id);
    
    res.json({ 
      lead_id: id,
      history,
      engagement,
      generated_at: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[IntelligenceHub] Get relationship history error:', error.message);
    res.status(500).json({ error: "Failed to fetch relationship history", message: error.message });
  }
});

// --- Protocol Manager: Reply Classification ---

// POST /api/classify-reply — Classify email reply and generate response
app.post("/api/classify-reply", async (req, res) => {
  const user = requireAuth(req, res) as any;
  if (!user) return;

  const { emailBody, originalOutreach, options } = req.body;

  // Validate required fields
  if (!emailBody || typeof emailBody !== 'string') {
    return res.status(400).json({ error: "emailBody is required" });
  }
  if (!originalOutreach || typeof originalOutreach !== 'string') {
    return res.status(400).json({ error: "originalOutreach is required" });
  }

  // Get API key (user-specific or system)
  const apiKeyRow = db.prepare("SELECT gemini_api_key FROM users WHERE id = ?").get(user.id) as any;
  const apiKey = apiKeyRow?.gemini_api_key || process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(400).json({ error: "Gemini API key required. Please configure in settings." });
  }

  // Get user info for context
  const userInfo = db.prepare("SELECT company_name, full_name FROM users WHERE id = ?").get(user.id) as any;
  const classifyOptions: ClassifyOptions & { lead_id?: string } = {
    meetingLinkPlaceholder: options?.meetingLinkPlaceholder || '[MEETING_LINK]',
    userCompanyName: options?.userCompanyName || userInfo?.company_name || 'Our Company',
    userName: options?.userName || userInfo?.full_name || 'The Team',
    userServices: options?.userServices || 'our services',
    lead_id: options?.lead_id
  };

  try {
    const protocolManager = new ProtocolManager(apiKey);
    const result = await protocolManager.classifyReply(emailBody, originalOutreach, classifyOptions);

    // Log the classification for analytics
    console.log(`[ProtocolManager] Reply classified as ${result.category} with ${result.confidence}% confidence for user ${user.id}`);

    // If REFERRAL with extracted contact, optionally add to pipeline
    if (result.category === 'REFERRAL' && result.extractedData?.referredContact?.email) {
      const referred = result.extractedData.referredContact;
      // Return hint that caller can add to pipeline
      (result as any).actions = {
        canAddReferralToPipeline: true,
        referredContact: referred
      };
    }

    // If OOO with return date, note the scheduled resend
    if (result.category === 'OOO' && result.extractedData?.scheduledResendDate) {
      (result as any).actions = {
        ...(result as any).actions,
        scheduleResend: true,
        resendDate: result.extractedData.scheduledResendDate
      };
    }

    // If lead_id is provided in options, auto-process through Intelligence Hub
    if (options?.lead_id) {
      try {
        await processReplyReceived(options.lead_id, result, emailBody);
        (result as any).intelligenceHub = { processed: true, lead_id: options.lead_id };
      } catch (ihError: any) {
        console.warn('[ProtocolManager] Intelligence Hub processing failed:', ihError.message);
        (result as any).intelligenceHub = { processed: false, error: ihError.message };
      }
    }

    res.json(result);
  } catch (error: any) {
    console.error('[ProtocolManager] Classification error:', error.message);
    res.status(500).json({ 
      error: "Failed to classify reply", 
      message: error.message,
      category: 'NOT_INTERESTED',
      confidence: 0,
      suggestedResponse: 'Unable to classify - manual review required'
    });
  }
});

// --- Intent Signals Background Monitor (every 6 hours) ---
setInterval(async () => {
  console.log('[SignalsMonitor] Running scheduled intent signals scan...');
  try {
    const TARGET_NICHES = ['Oil & Gas', 'Real Estate & Property Development', 'Fintech & Banking', 'Fashion & Retail'];

    const leads = db.prepare(
      "SELECT lead_id, company, industry, user_id FROM leads WHERE status != 'CLOSED' AND company IS NOT NULL AND company != ''"
    ).all() as { lead_id: string; company: string; industry: string; user_id: number }[];

    if (leads.length === 0) return;

    const companyMap = new Map<string, { lead_id: string; user_id: number; industry: string }[]>();
    for (const lead of leads) {
      const key = lead.company.toLowerCase();
      if (!companyMap.has(key)) companyMap.set(key, []);
      companyMap.get(key)!.push({ lead_id: lead.lead_id, user_id: lead.user_id, industry: lead.industry });
    }

    // Sort: target niche companies first, then others
    const companies = [...companyMap.keys()].sort((a, b) => {
      const aIsTarget = companyMap.get(a)!.some(e => TARGET_NICHES.some(n => (e.industry || '').includes(n.split(' ')[0])));
      const bIsTarget = companyMap.get(b)!.some(e => TARGET_NICHES.some(n => (e.industry || '').includes(n.split(' ')[0])));
      return (bIsTarget ? 1 : 0) - (aIsTarget ? 1 : 0);
    });

    console.log(`[SignalsMonitor] Scanning ${Math.min(companies.length, 60)} unique companies (target niches first)...`);

    const CONCURRENCY = 3;
    for (let i = 0; i < companies.length && i < 60; i += CONCURRENCY) {
      const batch = companies.slice(i, i + CONCURRENCY);
      await Promise.all(batch.map(async (companyKey) => {
        const entries = companyMap.get(companyKey)!;
        const companyName = leads.find(l => l.company.toLowerCase() === companyKey)?.company || companyKey;
        const isTargetNiche = entries.some(e => TARGET_NICHES.some(n => (e.industry || '').includes(n.split(' ')[0])));
        try {
          // Target niche companies get KSA-specific signal detection PLUS general
          const [generalSignals, ksaSignals] = await Promise.all([
            intentSignalService.detectSignals(companyName),
            isTargetNiche ? intentSignalService.detectKSASignals(companyName) : Promise.resolve([]),
          ]);
          const allSignals = [...generalSignals, ...ksaSignals];
          for (const entry of entries) {
            insertSignals(allSignals, entry.lead_id, entry.user_id);
          }
        } catch (e: any) {
          console.warn(`[SignalsMonitor] Error for "${companyName}":`, e.message);
        }
      }));
    }

    intentSignalService.pruneCache();
    console.log('[SignalsMonitor] Scan complete.');
  } catch (e: any) {
    console.error('[SignalsMonitor] Fatal error:', e.message);
  }
}, 6 * 60 * 60 * 1000); // 6 hours

// --- WhatsApp Sequence Processor ---
// Replaces template variables in a string: {{name}}, {{company}}, {{title}}
function interpolateWaTemplate(template: string, lead: any): string {
  return template
    .replace(/\{\{name\}\}/gi, lead.name || '')
    .replace(/\{\{company\}\}/gi, lead.company || '')
    .replace(/\{\{title\}\}/gi, lead.title || '');
}

async function processWaSequences() {
  // N1: Respect Ramadan/Eid pause
  const isHoliday = isIslamicHolidayPause();

  if (!whatsappService.isConfigured()) {
    // Nothing to do without WhatsApp configured
    return;
  }

  // Find all due active enrollments whose sequence is also active
  const dueEnrollments = db.prepare(`
    SELECT e.*, s.steps_json, s.status as seq_status, s.name as seq_name
    FROM wa_enrollments e
    JOIN wa_sequences s ON s.id = e.sequence_id
    WHERE e.status = 'active'
      AND s.status = 'active'
      AND (e.next_send_at IS NULL OR e.next_send_at <= datetime('now'))
    LIMIT 20
  `).all() as any[];

  for (const enrollment of dueEnrollments) {
    try {
      // N1: Check user ramadan override before sending
      if (isHoliday) {
        const enrollUser = db.prepare("SELECT ramadan_override FROM users WHERE id = ?").get(enrollment.user_id) as any;
        if (!enrollUser?.ramadan_override) {
          console.log(`[WaSeqProcessor] Skipping enrollment ${enrollment.id} — Ramadan/Eid pause active`);
          continue;
        }
      }

      const steps: any[] = JSON.parse(enrollment.steps_json);
      const currentStepIndex = enrollment.current_step;

      // All steps done — mark completed
      if (currentStepIndex >= steps.length) {
        db.prepare("UPDATE wa_enrollments SET status = 'completed', completed_at = CURRENT_TIMESTAMP WHERE id = ?").run(enrollment.id);
        console.log(`[WaSeqProcessor] Enrollment ${enrollment.id} completed all steps`);
        continue;
      }

      const step = steps[currentStepIndex];

      // Get the lead
      const lead = db.prepare("SELECT * FROM leads WHERE lead_id = ? AND user_id = ?").get(enrollment.lead_id, enrollment.user_id) as any;
      if (!lead) {
        console.warn(`[WaSeqProcessor] Lead ${enrollment.lead_id} not found for enrollment ${enrollment.id} — skipping`);
        db.prepare("UPDATE wa_enrollments SET status = 'paused' WHERE id = ?").run(enrollment.id);
        continue;
      }

      // Skip leads without phone numbers
      if (!lead.phone) {
        console.warn(`[WaSeqProcessor] Lead ${enrollment.lead_id} (${lead.name || 'unknown'}) has no phone — skipping enrollment ${enrollment.id}`);
        db.prepare("UPDATE wa_enrollments SET status = 'paused' WHERE id = ?").run(enrollment.id);
        db.prepare("INSERT INTO activity_log (lead_id, user_id, type, description) VALUES (?, ?, ?, ?)")
          .run(lead.lead_id, enrollment.user_id, 'WA_SEQUENCE_SKIP', `Sequence "${enrollment.seq_name}" skipped: no phone number`);
        continue;
      }

      // Check do_not_contact
      if (lead.do_not_contact) {
        console.warn(`[WaSeqProcessor] Lead ${enrollment.lead_id} has do_not_contact — pausing enrollment ${enrollment.id}`);
        db.prepare("UPDATE wa_enrollments SET status = 'paused' WHERE id = ?").run(enrollment.id);
        continue;
      }

      // Auto-pause if lead has replied (inbound message exists since enrollment)
      const inboundReply = db.prepare(`
        SELECT id FROM whatsapp_messages
        WHERE lead_id = ? AND user_id = ? AND direction = 'inbound'
          AND created_at >= ?
        LIMIT 1
      `).get(enrollment.lead_id, enrollment.user_id, enrollment.enrolled_at) as any;

      if (inboundReply) {
        console.log(`[WaSeqProcessor] Lead ${enrollment.lead_id} replied — auto-pausing enrollment ${enrollment.id}`);
        db.prepare("UPDATE wa_enrollments SET status = 'paused' WHERE id = ?").run(enrollment.id);
        db.prepare("INSERT INTO activity_log (lead_id, user_id, type, description) VALUES (?, ?, ?, ?)")
          .run(lead.lead_id, enrollment.user_id, 'WA_SEQUENCE_PAUSED', `Sequence "${enrollment.seq_name}" auto-paused: lead replied`);
        continue;
      }

      const formattedPhone = whatsappService.formatPhone(lead.phone);
      let sendResult: { success: boolean; messageId?: string; error?: string };
      let messageContent = '';
      let messageType = '';

      if (step.type === 'template') {
        // Interpolate params array (each param may contain {{name}} etc.)
        const params: string[] = (step.params || []).map((p: string) => interpolateWaTemplate(p, lead));
        sendResult = await whatsappService.sendTemplate(formattedPhone, step.templateName, params);
        messageContent = JSON.stringify({ templateName: step.templateName, params });
        messageType = 'template';
      } else {
        // text step
        const message = interpolateWaTemplate(step.message, lead);
        sendResult = await whatsappService.sendMessage(formattedPhone, message);
        messageContent = message;
        messageType = 'text';
      }

      if (!sendResult.success) {
        console.error(`[WaSeqProcessor] Failed to send step ${currentStepIndex + 1} to lead ${enrollment.lead_id}: ${sendResult.error}`);
        // Log failure but don't stop the enrollment — it will retry next cycle
        db.prepare("INSERT INTO activity_log (lead_id, user_id, type, description) VALUES (?, ?, ?, ?)")
          .run(lead.lead_id, enrollment.user_id, 'WA_SEQUENCE_ERROR', `Sequence "${enrollment.seq_name}" step ${currentStepIndex + 1} failed: ${sendResult.error}`);
        continue;
      }

      // Log to whatsapp_messages
      db.prepare(`
        INSERT INTO whatsapp_messages (user_id, lead_id, wa_message_id, direction, phone, message_type, content, status)
        VALUES (?, ?, ?, 'outbound', ?, ?, ?, 'sent')
      `).run(enrollment.user_id, enrollment.lead_id, sendResult.messageId || null, formattedPhone, messageType, messageContent);

      // Log to activity_log
      db.prepare("INSERT INTO activity_log (lead_id, user_id, type, description) VALUES (?, ?, ?, ?)")
        .run(lead.lead_id, enrollment.user_id, 'WA_SEQUENCE_SENT', `Sequence "${enrollment.seq_name}" step ${currentStepIndex + 1}/${steps.length} sent`);

      console.log(`[WaSeqProcessor] Sent step ${currentStepIndex + 1}/${steps.length} to lead ${enrollment.lead_id} (${lead.name || 'unknown'})`);

      // Advance to next step
      const nextStepIndex = currentStepIndex + 1;
      const isLastStep = nextStepIndex >= steps.length;

      if (isLastStep) {
        db.prepare("UPDATE wa_enrollments SET current_step = ?, status = 'completed', completed_at = CURRENT_TIMESTAMP WHERE id = ?")
          .run(nextStepIndex, enrollment.id);
        console.log(`[WaSeqProcessor] Enrollment ${enrollment.id} completed (all ${steps.length} steps sent)`);
      } else {
        // Calculate next_send_at based on next step's delay_hours
        const nextStep = steps[nextStepIndex];
        const delayHours = nextStep.delay_hours ?? 24;
        db.prepare(`
          UPDATE wa_enrollments
          SET current_step = ?,
              next_send_at = datetime('now', ? || ' hours')
          WHERE id = ?
        `).run(nextStepIndex, String(delayHours), enrollment.id);
      }
    } catch (err: any) {
      console.error(`[WaSeqProcessor] Unexpected error for enrollment ${enrollment.id}:`, err.message);
    }
  }
}

// Run WA sequence processor every 60 seconds
setInterval(processWaSequences, 60 * 1000);
// Initial run at startup
processWaSequences();

// ---------------------------------------------------------------------------
// Email Sequence / Cadence Engine
// ---------------------------------------------------------------------------

// POST /api/sequences — Create a new sequence
app.post("/api/sequences", (req, res) => {
  const user = requireAuth(req, res) as any;
  if (!user) return;

  const { name, description, steps, settings } = req.body;
  if (!name || !Array.isArray(steps) || steps.length === 0) {
    return res.status(400).json({ error: "name and steps array are required" });
  }

  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    if (!s.subject || !s.body) {
      return res.status(400).json({ error: `Step ${i + 1} requires subject and body` });
    }
    if (typeof s.delay_hours !== 'number' || s.delay_hours < 0) {
      return res.status(400).json({ error: `Step ${i + 1} requires a non-negative delay_hours` });
    }
  }

  const normalisedSteps = steps.map((s: any, idx: number) => ({
    step: idx + 1,
    type: s.type || 'email',
    subject: s.subject,
    body: s.body,
    delay_hours: s.delay_hours ?? 0,
  }));

  const info = db.prepare(
    "INSERT INTO email_sequences (user_id, name, description, steps_json, settings_json) VALUES (?, ?, ?, ?, ?)"
  ).run(user.id, name, description || null, JSON.stringify(normalisedSteps), settings ? JSON.stringify(settings) : null);

  res.status(201).json({
    id: info.lastInsertRowid,
    name,
    description: description || null,
    status: 'draft',
    steps: normalisedSteps,
    settings: settings || null,
  });
});

// GET /api/sequences — List user sequences with enrollment counts
app.get("/api/sequences", (req, res) => {
  const user = requireAuth(req, res) as any;
  if (!user) return;

  const sequences = db.prepare(`
    SELECT
      s.*,
      COUNT(e.id) AS total_enrollments,
      SUM(CASE WHEN e.status = 'active' THEN 1 ELSE 0 END) AS active_enrollments,
      SUM(CASE WHEN e.status = 'completed' THEN 1 ELSE 0 END) AS completed_enrollments
    FROM email_sequences s
    LEFT JOIN sequence_enrollments e ON e.sequence_id = s.id
    WHERE s.user_id = ?
    GROUP BY s.id
    ORDER BY s.created_at DESC
  `).all(user.id) as any[];

  res.json(sequences.map((s: any) => ({
    ...s,
    steps: JSON.parse(s.steps_json || '[]'),
    settings: s.settings_json ? JSON.parse(s.settings_json) : null,
    steps_json: undefined,
    settings_json: undefined,
  })));
});

// GET /api/sequences/:id — Get one sequence with steps + enrollment stats
app.get("/api/sequences/:id", (req, res) => {
  const user = requireAuth(req, res) as any;
  if (!user) return;

  const seq = db.prepare("SELECT * FROM email_sequences WHERE id = ? AND user_id = ?").get(req.params.id, user.id) as any;
  if (!seq) return res.status(404).json({ error: "Sequence not found" });

  const stats = db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
      SUM(CASE WHEN status = 'paused' THEN 1 ELSE 0 END) AS paused,
      SUM(CASE WHEN status = 'unsubscribed' THEN 1 ELSE 0 END) AS unsubscribed
    FROM sequence_enrollments
    WHERE sequence_id = ?
  `).get(seq.id) as any;

  res.json({
    ...seq,
    steps: JSON.parse(seq.steps_json || '[]'),
    settings: seq.settings_json ? JSON.parse(seq.settings_json) : null,
    steps_json: undefined,
    settings_json: undefined,
    enrollment_stats: stats,
  });
});

// PUT /api/sequences/:id — Update sequence
app.put("/api/sequences/:id", (req, res) => {
  const user = requireAuth(req, res) as any;
  if (!user) return;

  const seq = db.prepare("SELECT * FROM email_sequences WHERE id = ? AND user_id = ?").get(req.params.id, user.id) as any;
  if (!seq) return res.status(404).json({ error: "Sequence not found" });

  const { name, description, steps, settings } = req.body;
  const updates: string[] = ["updated_at = CURRENT_TIMESTAMP"];
  const params: any[] = [];

  if (name !== undefined) { updates.push("name = ?"); params.push(name); }
  if (description !== undefined) { updates.push("description = ?"); params.push(description); }
  if (settings !== undefined) { updates.push("settings_json = ?"); params.push(JSON.stringify(settings)); }

  if (steps !== undefined) {
    if (!Array.isArray(steps) || steps.length === 0) {
      return res.status(400).json({ error: "steps must be a non-empty array" });
    }
    const normSteps = steps.map((s: any, idx: number) => ({
      step: idx + 1,
      type: s.type || 'email',
      subject: s.subject,
      body: s.body,
      delay_hours: s.delay_hours ?? 0,
    }));
    updates.push("steps_json = ?");
    params.push(JSON.stringify(normSteps));
  }

  if (updates.length === 1) return res.status(400).json({ error: "Nothing to update" });

  params.push(req.params.id, user.id);
  db.prepare(`UPDATE email_sequences SET ${updates.join(", ")} WHERE id = ? AND user_id = ?`).run(...params);

  const updated = db.prepare("SELECT * FROM email_sequences WHERE id = ?").get(req.params.id) as any;
  res.json({
    ...updated,
    steps: JSON.parse(updated.steps_json || '[]'),
    settings: updated.settings_json ? JSON.parse(updated.settings_json) : null,
    steps_json: undefined,
    settings_json: undefined,
  });
});

// DELETE /api/sequences/:id — Only if no active enrollments
app.delete("/api/sequences/:id", (req, res) => {
  const user = requireAuth(req, res) as any;
  if (!user) return;

  const seq = db.prepare("SELECT * FROM email_sequences WHERE id = ? AND user_id = ?").get(req.params.id, user.id) as any;
  if (!seq) return res.status(404).json({ error: "Sequence not found" });

  const activeCount = (db.prepare(
    "SELECT COUNT(*) as c FROM sequence_enrollments WHERE sequence_id = ? AND status = 'active'"
  ).get(seq.id) as any).c;

  if (activeCount > 0) {
    return res.status(409).json({
      error: `Cannot delete sequence with ${activeCount} active enrollment(s). Pause or unenroll leads first.`,
    });
  }

  db.prepare("DELETE FROM sequence_enrollments WHERE sequence_id = ?").run(seq.id);
  db.prepare("DELETE FROM email_sequences WHERE id = ? AND user_id = ?").run(req.params.id, user.id);
  res.json({ deleted: true });
});

// POST /api/sequences/:id/activate — Set status to active
app.post("/api/sequences/:id/activate", (req, res) => {
  const user = requireAuth(req, res) as any;
  if (!user) return;

  const result = db.prepare(
    "UPDATE email_sequences SET status = 'active', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?"
  ).run(req.params.id, user.id);

  if (result.changes === 0) return res.status(404).json({ error: "Sequence not found" });
  res.json({ status: "active" });
});

// POST /api/sequences/:id/pause — Set status to paused
app.post("/api/sequences/:id/pause", (req, res) => {
  const user = requireAuth(req, res) as any;
  if (!user) return;

  const result = db.prepare(
    "UPDATE email_sequences SET status = 'paused', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?"
  ).run(req.params.id, user.id);

  if (result.changes === 0) return res.status(404).json({ error: "Sequence not found" });
  res.json({ status: "paused" });
});

// POST /api/sequences/:id/enroll — Enroll leads into a sequence
app.post("/api/sequences/:id/enroll", (req, res) => {
  const user = requireAuth(req, res) as any;
  if (!user) return;

  const seq = db.prepare("SELECT * FROM email_sequences WHERE id = ? AND user_id = ?").get(req.params.id, user.id) as any;
  if (!seq) return res.status(404).json({ error: "Sequence not found" });
  if (seq.status === 'draft') {
    return res.status(400).json({ error: "Sequence must be activated before enrolling leads" });
  }

  const { lead_ids } = req.body;
  if (!Array.isArray(lead_ids) || lead_ids.length === 0) {
    return res.status(400).json({ error: "lead_ids array required" });
  }

  const steps: any[] = JSON.parse(seq.steps_json || '[]');
  if (steps.length === 0) return res.status(400).json({ error: "Sequence has no steps" });

  const firstDelayHours = steps[0]?.delay_hours ?? 0;
  const nextSendAt = new Date(Date.now() + firstDelayHours * 60 * 60 * 1000)
    .toISOString().replace('T', ' ').split('.')[0];

  const insertEnrollment = db.prepare(`
    INSERT OR IGNORE INTO sequence_enrollments (sequence_id, lead_id, user_id, current_step, status, next_send_at)
    VALUES (?, ?, ?, 0, 'active', ?)
  `);

  let enrolled = 0;
  let skipped = 0;

  const enrollTx = db.transaction((ids: string[]) => {
    for (const lead_id of ids) {
      const lead = db.prepare(
        "SELECT lead_id, do_not_contact FROM leads WHERE lead_id = ? AND user_id = ?"
      ).get(lead_id, user.id) as any;
      if (!lead || lead.do_not_contact) { skipped++; continue; }

      const r = insertEnrollment.run(seq.id, lead_id, user.id, nextSendAt);
      if (r.changes > 0) {
        enrolled++;
        db.prepare("INSERT INTO activity_log (lead_id, user_id, type, description) VALUES (?, ?, ?, ?)").run(
          lead_id, user.id, 'SEQUENCE_ENROLLED', `Enrolled in sequence: ${seq.name}`
        );
      } else {
        skipped++; // UNIQUE constraint — already enrolled
      }
    }
  });

  enrollTx(lead_ids);
  res.json({ enrolled, skipped });
});

// POST /api/sequences/:id/unenroll — Remove leads from active enrollment
app.post("/api/sequences/:id/unenroll", (req, res) => {
  const user = requireAuth(req, res) as any;
  if (!user) return;

  const seq = db.prepare("SELECT id FROM email_sequences WHERE id = ? AND user_id = ?").get(req.params.id, user.id) as any;
  if (!seq) return res.status(404).json({ error: "Sequence not found" });

  const { lead_ids } = req.body;
  if (!Array.isArray(lead_ids) || lead_ids.length === 0) {
    return res.status(400).json({ error: "lead_ids array required" });
  }

  let unenrolled = 0;
  const unenrollTx = db.transaction((ids: string[]) => {
    for (const lead_id of ids) {
      const r = db.prepare(
        "UPDATE sequence_enrollments SET status = 'unsubscribed' WHERE sequence_id = ? AND lead_id = ? AND user_id = ? AND status = 'active'"
      ).run(seq.id, lead_id, user.id);
      if (r.changes > 0) {
        unenrolled++;
        db.prepare("INSERT INTO activity_log (lead_id, user_id, type, description) VALUES (?, ?, ?, ?)").run(
          lead_id, user.id, 'SEQUENCE_UNENROLLED', `Unenrolled from sequence ${seq.id}`
        );
      }
    }
  });

  unenrollTx(lead_ids);
  res.json({ unenrolled });
});

// GET /api/sequences/:id/enrollments — List enrolled leads with current state
app.get("/api/sequences/:id/enrollments", (req, res) => {
  const user = requireAuth(req, res) as any;
  if (!user) return;

  const seq = db.prepare("SELECT id FROM email_sequences WHERE id = ? AND user_id = ?").get(req.params.id, user.id) as any;
  if (!seq) return res.status(404).json({ error: "Sequence not found" });

  const enrollments = db.prepare(`
    SELECT
      e.*,
      l.name    AS lead_name,
      l.email   AS lead_email,
      l.company AS lead_company
    FROM sequence_enrollments e
    LEFT JOIN leads l ON l.lead_id = e.lead_id
    WHERE e.sequence_id = ? AND e.user_id = ?
    ORDER BY e.enrolled_at DESC
  `).all(seq.id, user.id);

  res.json(enrollments);
});

// ---------------------------------------------------------------------------
// Email Sequence Background Processor — finds due enrollments, queues emails
// ---------------------------------------------------------------------------
async function processEmailSequences() {
  try {
    const due = db.prepare(`
      SELECT
        e.*,
        s.steps_json,
        s.settings_json,
        s.status AS seq_status,
        s.name   AS seq_name
      FROM sequence_enrollments e
      JOIN email_sequences s ON s.id = e.sequence_id
      WHERE e.status = 'active'
        AND s.status = 'active'
        AND e.next_send_at <= datetime('now')
      LIMIT 50
    `).all() as any[];

    if (due.length === 0) return;

    const isHoliday = isIslamicHolidayPause();

    for (const enrollment of due) {
      try {
        // N1: Respect Ramadan/Eid pause — unless user has override enabled
        if (isHoliday) {
          const enrollUser = db.prepare(
            "SELECT ramadan_override FROM users WHERE id = ?"
          ).get(enrollment.user_id) as any;
          if (!enrollUser?.ramadan_override) {
            console.log(`[SequenceWorker] Skipping enrollment ${enrollment.id} — Ramadan/Eid pause`);
            continue;
          }
        }

        const steps: any[] = JSON.parse(enrollment.steps_json || '[]');
        const currentStepIdx: number = enrollment.current_step;

        // Guard: complete if already past last step
        if (currentStepIdx >= steps.length) {
          db.prepare(
            "UPDATE sequence_enrollments SET status = 'completed', completed_at = CURRENT_TIMESTAMP WHERE id = ?"
          ).run(enrollment.id);
          continue;
        }

        const step = steps[currentStepIdx];

        // Fetch lead data for personalisation and checks
        const lead = db.prepare(
          "SELECT * FROM leads WHERE lead_id = ? AND user_id = ?"
        ).get(enrollment.lead_id, enrollment.user_id) as any;

        if (!lead) {
          // Lead deleted after enrollment — mark completed
          db.prepare(
            "UPDATE sequence_enrollments SET status = 'completed', completed_at = CURRENT_TIMESTAMP WHERE id = ?"
          ).run(enrollment.id);
          continue;
        }

        if (lead.do_not_contact) {
          // DNC set after enrollment — pause
          db.prepare("UPDATE sequence_enrollments SET status = 'paused' WHERE id = ?").run(enrollment.id);
          continue;
        }

        if (lead.email) {
          // Auto-pause if any engagement (open/click) detected since enrollment —
          // indicates reply-like interaction that warrants a human follow-up
          const engagementCheck = db.prepare(`
            SELECT ee.id
            FROM email_events ee
            JOIN email_queue eq ON eq.id = ee.email_queue_id
            WHERE eq.lead_id = ?
              AND eq.user_id = ?
              AND ee.created_at >= ?
            LIMIT 1
          `).get(lead.lead_id, enrollment.user_id, enrollment.enrolled_at) as any;

          if (engagementCheck) {
            db.prepare("UPDATE sequence_enrollments SET status = 'paused' WHERE id = ?").run(enrollment.id);
            db.prepare("INSERT INTO activity_log (lead_id, user_id, type, description) VALUES (?, ?, ?, ?)").run(
              lead.lead_id, enrollment.user_id, 'SEQUENCE_PAUSED',
              `Sequence "${enrollment.seq_name}" auto-paused — engagement (open/click) detected`
            );
            console.log(`[SequenceWorker] Enrollment ${enrollment.id} auto-paused — engagement for lead ${lead.lead_id}`);
            continue;
          }

          // Personalise with {{name}}, {{company}}, {{title}} merge tags
          const personalise = (text: string) =>
            (text || '')
              .replace(/\{\{name\}\}/gi, lead.name || '')
              .replace(/\{\{company\}\}/gi, lead.company || '')
              .replace(/\{\{title\}\}/gi, lead.title || '');

          const subject = personalise(step.subject);
          const body = personalise(step.body);

          // Queue email using the existing email_queue pattern
          db.prepare(
            "INSERT INTO email_queue (lead_id, user_id, to_email, subject, body) VALUES (?, ?, ?, ?, ?)"
          ).run(lead.lead_id, enrollment.user_id, lead.email, subject, body);

          db.prepare("INSERT INTO activity_log (lead_id, user_id, type, description) VALUES (?, ?, ?, ?)").run(
            lead.lead_id, enrollment.user_id, 'SEQUENCE_EMAIL_QUEUED',
            `Sequence "${enrollment.seq_name}" step ${currentStepIdx + 1} queued: ${subject}`
          );
        } else {
          // No email yet — advance step without sending (lead may be enriched later)
          console.log(`[SequenceWorker] Lead ${lead.lead_id} has no email — advancing step without send`);
        }

        // Advance to next step
        const nextStepIdx = currentStepIdx + 1;

        if (nextStepIdx >= steps.length) {
          // All steps complete
          db.prepare(
            "UPDATE sequence_enrollments SET current_step = ?, status = 'completed', completed_at = CURRENT_TIMESTAMP, next_send_at = NULL WHERE id = ?"
          ).run(nextStepIdx, enrollment.id);
        } else {
          // Schedule next step using its delay_hours
          const nextStep = steps[nextStepIdx];
          const nextDelayHours: number =
            typeof nextStep?.delay_hours === 'number' ? nextStep.delay_hours : 24;
          const nextSendAt = new Date(Date.now() + nextDelayHours * 60 * 60 * 1000)
            .toISOString().replace('T', ' ').split('.')[0];

          db.prepare(
            "UPDATE sequence_enrollments SET current_step = ?, next_send_at = ? WHERE id = ?"
          ).run(nextStepIdx, nextSendAt, enrollment.id);
        }
      } catch (enrollErr: any) {
        console.error(`[SequenceWorker] Error on enrollment ${enrollment.id}:`, enrollErr.message);
      }
    }

    console.log(`[SequenceWorker] Processed ${due.length} due enrollment(s)`);
  } catch (err: any) {
    console.error('[SequenceWorker] Fatal error:', err.message);
  }
}

// Run email sequence processor every 60 seconds (alongside email queue processor)
setInterval(processEmailSequences, 60000);
processEmailSequences();
console.log('[SequenceWorker] Email sequence processor started');

// --- Vite Integration ---
// --- Background Workers ---

async function startServer() {
  const isDev = process.env.NODE_ENV !== 'production';
  console.log(`Starting server in ${isDev ? 'development' : 'production'} mode.`);
  console.log(`[PATH] Project root: ${PROJECT_ROOT}`);
  
  if (isDev) {
    const vite = await createViteServer({
      root: PROJECT_ROOT,
      server: { middlewareMode: true, hmr: { port: 24700 } },
      appType: "custom",
    });
    app.use(vite.middlewares);
    
    // Explicit SPA fallback for dev - serve index.html for page routes
    // This MUST be a GET handler, not app.use, to avoid interfering with Vite's middleware
    app.get("*", async (req, res, next) => {
      // Skip API routes
      if (req.url.startsWith("/api")) return next();
      
      // Skip Vite internal paths - these should be handled by Vite middleware
      if (req.url.startsWith("/@") || 
          req.url.startsWith("/node_modules/") ||
          req.url.startsWith("/src/")) {
        return next();
      }
      
      // Skip static file requests (have file extensions but aren't .html)
      // Vite should handle these
      if (/\.[^/]+$/.test(req.url) && !req.url.endsWith('.html')) {
        return next();
      }
      
      // Only serve HTML for page navigation requests
      // Check Accept header - browsers sending */* or text/html should get HTML
      const accept = req.headers.accept || "";
      
      // If the request explicitly wants something other than HTML, skip
      if (accept && 
          !accept.includes("text/html") && 
          !accept.includes("*/*") &&
          !accept.includes("application/xhtml+xml")) {
        // Might be an API or asset request - let it 404 naturally
        return next();
      }
      
      try {
        const fs = await import("fs");
        const indexPath = path.resolve(PROJECT_ROOT, "index.html");
        console.log(`[VITE] Serving HTML for: ${req.url} (Accept: ${accept || 'none'})`);
        const template = fs.readFileSync(indexPath, "utf-8");
        const html = await vite.transformIndexHtml(req.url, template);
        res.status(200).set({ "Content-Type": "text/html" }).end(html);
      } catch (e) {
        console.error(`[VITE] Error serving HTML:`, e);
        vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    });
  } else {
    // Serve static files from dist (includes copied public/ assets)
    app.use(express.static(path.join(PROJECT_ROOT, "dist")));
    // Serve public folder explicitly for PWA assets (manifest, icons, sw.js)
    app.use(express.static(path.join(PROJECT_ROOT, "public")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(PROJECT_ROOT, "dist", "index.html"));
    });
  }

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`LEADJIN Engine running at http://localhost:${PORT}`);

    // ── PERPETUAL CRAWL — gated by ENABLE_PERPETUAL_CRAWL=true ──
    const crawlApiKey = process.env.GEMINI_API_KEY;
    const crawlEnabled = process.env.ENABLE_PERPETUAL_CRAWL === 'true';

    if (!crawlEnabled) {
      console.log('[PreCrawler] disabled (set ENABLE_PERPETUAL_CRAWL=true to enable)');
    } else if (!crawlApiKey) {
      console.log('[PreCrawler] Skipped — no GEMINI_API_KEY');
    } else {
      const totalCities = CRAWL_PHASES.reduce((s, p) => s + p.cities.length, 0);
      console.log(`[PreCrawler] PERPETUAL CRAWL starting in 10s — ${CRAWL_PHASES.length} phases, ${totalCities} cities, ${INDUSTRIES.length} industries`);

      setTimeout(() => {
        startPerpetualCrawl(db, crawlApiKey, 3000).catch(err => {
          console.error('[PreCrawler] Perpetual crawl crashed:', err.message);
        });
      }, 10000);

      // ── JIN AI EMPLOYEE INITIALIZATION ──
      console.log('[Jin] AI Employee initialized and ready');
    }

    // ── CONTINUOUS VERIFICATION — cadence controlled by VERIFICATION_INTERVAL_MS (default 6h) ──
    if (crawlApiKey) {
      const verificationIntervalMs = parseInt(process.env.VERIFICATION_INTERVAL_MS || '', 10) || (6 * 60 * 60 * 1000); // Default: 6 hours

      const scheduleVerification = () => {
        setTimeout(async () => {
          try {
            console.log('[Verify] === VERIFICATION CYCLE STARTED ===');
            await runDailyVerification(db, 50); // 50 per cycle keeps it fast
            console.log('[Verify] === VERIFICATION CYCLE COMPLETE ===');
          } catch (err: any) {
            console.error('[Verify] Verification failed:', err.message);
          }
          scheduleVerification();
        }, verificationIntervalMs);
      };

      // Run first verification after one interval (not immediately)
      scheduleVerification();
    }
  });
  server.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\n[ERROR] Port ${PORT} is already in use.`);
      console.error(`Run this to free it: npx kill-port ${PORT}`);
      console.error(`Or set PORT env var: PORT=3001 npx tsx server.ts\n`);
      process.exit(1);
    }
    throw err;
  });
}

startServer();
