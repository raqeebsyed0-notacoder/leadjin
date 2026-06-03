/**
 * LeadJin Pre-Crawler — Global Lead Intelligence Engine
 *
 * NEVER STOPS. Crawls the world phase by phase:
 *   Phase 1: Saudi Arabia (20 cities)
 *   Phase 2: GCC + Middle East (14 cities)
 *   Phase 3: Asia (19 cities)
 *   Phase 4: Africa (8 cities)
 *   Phase 5: Europe (13 cities)
 *   Phase 6: Americas (10 cities)
 *   Phase 7: Oceania (3 cities)
 *
 * After completing all phases, starts over — refreshing stale data.
 * Daily cron: triple-verifies all cached leads (SMTP + wa.me + LinkedIn HEAD).
 * All data is 100% from public sources. Legitimate. No scraping private data.
 */

import { GoogleGenAI } from '@google/genai';
import dns from 'dns/promises';
import { getGenAI } from './genaiClient.js';
import net from 'net';

// ---------------------------------------------------------------------------
// Saudi Arabia Geography
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Global Geography — Phase-based expansion
// ---------------------------------------------------------------------------

export const CRAWL_PHASES: { name: string; cities: string[] }[] = [
  // Phase 1: Saudi Arabia (priority)
  { name: 'KSA-Major', cities: ['Riyadh', 'Jeddah', 'Dammam', 'Khobar', 'Dhahran', 'Makkah', 'Madinah'] },
  { name: 'KSA-Secondary', cities: ['Tabuk', 'Abha', 'Hail', 'Jazan', 'Najran', 'Jubail', 'Yanbu', 'Taif', 'Buraidah', 'Khamis Mushait', 'Al Ahsa', 'NEOM', 'KAEC'] },

  // Phase 2: GCC / Middle East
  { name: 'UAE', cities: ['Dubai', 'Abu Dhabi', 'Sharjah', 'Ajman', 'Ras Al Khaimah'] },
  { name: 'Gulf', cities: ['Doha Qatar', 'Manama Bahrain', 'Kuwait City', 'Muscat Oman'] },
  { name: 'Levant', cities: ['Amman Jordan', 'Beirut Lebanon', 'Baghdad Iraq', 'Cairo Egypt', 'Alexandria Egypt'] },

  // Phase 3: Asia
  { name: 'South-Asia', cities: ['Mumbai India', 'Delhi India', 'Bangalore India', 'Hyderabad India', 'Karachi Pakistan', 'Lahore Pakistan', 'Dhaka Bangladesh', 'Colombo Sri Lanka'] },
  { name: 'Southeast-Asia', cities: ['Singapore', 'Kuala Lumpur Malaysia', 'Jakarta Indonesia', 'Bangkok Thailand', 'Manila Philippines', 'Ho Chi Minh City Vietnam'] },
  { name: 'East-Asia', cities: ['Tokyo Japan', 'Seoul South Korea', 'Hong Kong', 'Shanghai China', 'Taipei Taiwan'] },

  // Phase 4: Africa
  { name: 'North-Africa', cities: ['Casablanca Morocco', 'Tunis Tunisia', 'Algiers Algeria'] },
  { name: 'Sub-Saharan', cities: ['Lagos Nigeria', 'Nairobi Kenya', 'Johannesburg South Africa', 'Accra Ghana', 'Addis Ababa Ethiopia'] },

  // Phase 5: Europe
  { name: 'West-Europe', cities: ['London UK', 'Paris France', 'Berlin Germany', 'Amsterdam Netherlands', 'Zurich Switzerland'] },
  { name: 'South-Europe', cities: ['Istanbul Turkey', 'Milan Italy', 'Madrid Spain', 'Barcelona Spain', 'Lisbon Portugal'] },
  { name: 'North-Europe', cities: ['Stockholm Sweden', 'Oslo Norway', 'Copenhagen Denmark', 'Helsinki Finland', 'Dublin Ireland'] },

  // Phase 6: Americas
  { name: 'North-America', cities: ['New York USA', 'San Francisco USA', 'Los Angeles USA', 'Toronto Canada', 'Mexico City Mexico'] },
  { name: 'South-America', cities: ['Sao Paulo Brazil', 'Buenos Aires Argentina', 'Bogota Colombia', 'Santiago Chile', 'Lima Peru'] },

  // Phase 7: Oceania
  { name: 'Oceania', cities: ['Sydney Australia', 'Melbourne Australia', 'Auckland New Zealand'] },
];

// Flat list for backward compatibility
export const KSA_CITIES = [
  'Riyadh',
  'Jeddah',
  'Dammam',
  'Khobar',
  'Dhahran',
  'Makkah',
  'Madinah',
  'Tabuk',
  'Abha',
  'Hail',
  'Jazan',
  'Najran',
  'Jubail',
  'Yanbu',
  'Taif',
  'Buraidah',
  'Khamis Mushait',
  'Al Ahsa',
  'NEOM',
  'KAEC',
];

// ---------------------------------------------------------------------------
// Industries (universal — not limited to 4 niches)
// ---------------------------------------------------------------------------

export const INDUSTRIES = [
  'Oil & Gas',
  'Real Estate & Property Development',
  'Fintech & Banking',
  'Fashion & Retail',
  'Healthcare & Pharma',
  'Education & EdTech',
  'Logistics & Supply Chain',
  'Construction & Engineering',
  'Food & Beverage',
  'IT & Software',
  'Manufacturing',
  'Tourism & Hospitality',
  'Agriculture & AgriTech',
  'Legal Services',
  'Management Consulting',
  'Telecommunications',
  'Automotive',
  'E-commerce',
  'Media & Advertising',
  'Renewable Energy',
  'Mining & Metals',
  'Insurance',
  'Defense & Aerospace',
  'Sports & Entertainment',
  'Environmental Services',
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PreCrawlCompany {
  company_name: string;
  domain: string;
  city: string;
  industry: string;
  phone: string | null;
  email_pattern: string | null;
  x_handle: string | null;
  snapchat: string | null;
  tiktok: string | null;
  linkedin_url: string | null;
  headquarters: string | null;
  company_size: string | null;
  description: string | null;
}

export interface PreCrawlPerson {
  name: string;
  title: string;
  company_name: string;
  domain: string;
  email: string | null;
  email_verified: boolean;
  linkedin_url: string | null;
  phone: string | null;
  city: string;
  industry: string;
}

export interface CrawlJobResult {
  city: string;
  industry: string;
  companies: PreCrawlCompany[];
  people: PreCrawlPerson[];
  duration_ms: number;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Database Schema
// ---------------------------------------------------------------------------

export function initPreCrawlTables(db: any): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS company_cache (
      domain TEXT PRIMARY KEY,
      company_name TEXT NOT NULL,
      city TEXT,
      industry TEXT,
      phone TEXT,
      email_pattern TEXT,
      mx_provider TEXT,
      is_catchall INTEGER DEFAULT 0,
      x_handle TEXT,
      snapchat TEXT,
      tiktok TEXT,
      linkedin_url TEXT,
      headquarters TEXT,
      company_size TEXT,
      description TEXT,
      crawled_at TEXT,
      verified_at TEXT
    );

    CREATE TABLE IF NOT EXISTS person_cache (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      title TEXT,
      company_name TEXT,
      domain TEXT,
      email TEXT,
      email_verified INTEGER DEFAULT 0,
      email_source TEXT,
      linkedin_url TEXT,
      phone TEXT,
      city TEXT,
      industry TEXT,
      crawled_at TEXT,
      verified_at TEXT,
      UNIQUE(name, domain)
    );

    CREATE TABLE IF NOT EXISTS crawl_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      city TEXT NOT NULL,
      industry TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      companies_found INTEGER DEFAULT 0,
      people_found INTEGER DEFAULT 0,
      error TEXT,
      started_at TEXT,
      completed_at TEXT,
      UNIQUE(city, industry)
    );

    CREATE INDEX IF NOT EXISTS idx_person_domain ON person_cache(domain);
    CREATE INDEX IF NOT EXISTS idx_person_company ON person_cache(company_name);
    CREATE INDEX IF NOT EXISTS idx_company_city ON company_cache(city);
    CREATE INDEX IF NOT EXISTS idx_company_industry ON company_cache(industry);
  `);

  // Migration: add verified_at column if missing
  try {
    db.exec(`ALTER TABLE person_cache ADD COLUMN verified_at TEXT`);
  } catch (e: any) {
    // Column already exists — ignore
  }

  console.log('[PreCrawler] Tables initialized');
}

// ---------------------------------------------------------------------------
// KSA Niche-Specific Search Templates
// ---------------------------------------------------------------------------

const KSA_NICHE_PROMPTS: Record<string, string> = {
  'Oil & Gas': `Search for real companies in Saudi Arabia's Oil & Gas sector in ${'city'}. Focus on:
- Saudi Aramco suppliers and contractors (Tier 1 and Tier 2 vendors)
- Oilfield services companies (drilling, well services, maintenance)
- Engineering & EPC contractors licensed by Saudi Aramco or SABIC
- Downstream petrochemicals and refining companies
- Energy technology providers with KSA offices
Search both English and Arabic: شركات النفط والغاز, موردي أرامكو, خدمات الحقول النفطية
Find senior decision-makers: VP Procurement, Head of Contracts, Operations Director, Technical Director`,

  'Real Estate & Property Development': `Search for real estate developers and property companies in ${'city'}, Saudi Arabia. Focus on:
- Vision 2030 giga-project contractors (NEOM, Red Sea Project, Qiddiya, Diriyah Gate)
- Licensed real estate developers (REGA-registered companies)
- Luxury residential and commercial developers
- PropTech companies operating in KSA
- Real estate investment funds (REITs) and management companies
Arabic: شركات التطوير العقاري, المطورون العقاريون, الاستثمار العقاري
Find: CEO, Managing Director, Head of Development, Chief Investment Officer`,

  'Fintech & Banking': `Search for fintech companies and financial services firms in ${'city'}, Saudi Arabia. Focus on:
- SAMA-licensed fintechs (payment, lending, BNPL, WealthTech)
- Digital banking and neobanks operating in KSA
- Islamic finance technology companies
- Fintech companies backed by Saudi Venture Capital or PIF
- Payment gateway and POS solution providers
Arabic: شركات التقنية المالية, الفنتك, الدفع الإلكتروني, التمويل الإسلامي
Find: CEO, CTO, Head of Business Development, Chief Product Officer`,

  'Fashion & Retail': `Search for fashion brands and luxury retail companies in ${'city'}, Saudi Arabia. Focus on:
- Saudi-owned fashion and apparel brands
- Luxury fashion retailers operating in KSA malls (not just franchises — find the local operators)
- E-commerce fashion platforms targeting MENA
- Modest fashion and abaya designers with commercial operations
- Retail holding groups managing fashion brands in KSA
Arabic: شركات الأزياء, العلامات التجارية للأزياء, الأزياء السعودية, تجزئة الفاشن
Find: CEO, Brand Manager, Head of Retail Operations, Chief Commercial Officer`,
};

function buildCrawlPrompt(industry: string, city: string): string {
  const nicheTemplate = KSA_NICHE_PROMPTS[industry];
  const searchText = nicheTemplate
    ? nicheTemplate.replace(/\$\{'city'\}/g, city)
    : `Search Google for real companies in the ${industry} sector located in ${city}, Saudi Arabia. Search both English and Arabic. Find 10-15 verified companies.`;

  return `${searchText}

For each company found, provide:
1. Company name (real, verified — no made-up names)
2. Website domain (e.g. aramco.com)
3. A senior decision-maker (CEO, CTO, VP, Director, Manager) — full name and title
4. That person's work email (personal: firstname.lastname@domain, NOT info@ or contact@)
5. That person's LinkedIn profile URL
6. Company phone number (Saudi +966 format preferred)
7. Company's X/Twitter handle
8. Company's Snapchat handle (if any — very common in KSA B2B)
9. Company's TikTok handle (if any)
10. Company HQ area/district
11. Company size (employee estimate)
12. One-line description

Only include REAL, ACTIVE companies verifiable via Google Search. Return ONLY valid JSON array (no markdown):
[{
  "company": "string",
  "domain": "string",
  "person_name": "string",
  "person_title": "string",
  "person_email": "personal email or null",
  "person_linkedin": "URL or null",
  "company_phone": "+966... or null",
  "company_x": "@handle or null",
  "company_snapchat": "@handle or null",
  "company_tiktok": "@handle or null",
  "headquarters": "area/district or null",
  "company_size": "estimate or null",
  "description": "one line or null"
}]`;
}

// ---------------------------------------------------------------------------
// Crawl a single city + industry combination
// ---------------------------------------------------------------------------

export async function crawlCityIndustry(
  db: any,
  city: string,
  industry: string,
  apiKey: string,
): Promise<CrawlJobResult> {
  const startTime = Date.now();
  const ai = getGenAI(apiKey);

  console.log(`[PreCrawler] Crawling: ${city} × ${industry}`);

  // Mark job as running
  db.prepare(`INSERT OR REPLACE INTO crawl_jobs (city, industry, status, started_at) VALUES (?, ?, 'running', ?)`)
    .run(city, industry, new Date().toISOString());

  const prompt = buildCrawlPrompt(industry, city);

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        temperature: 0,
      },
    });

    const text = response.text || '';
    let jsonStr = text.trim();
    if (jsonStr.startsWith('```json')) jsonStr = jsonStr.replace(/^```json\n?/, '').replace(/\n?```$/, '');
    if (jsonStr.startsWith('```')) jsonStr = jsonStr.replace(/^```\n?/, '').replace(/\n?```$/, '');

    const entries = JSON.parse(jsonStr);
    if (!Array.isArray(entries)) throw new Error('Not an array');

    const companies: PreCrawlCompany[] = [];
    const people: PreCrawlPerson[] = [];

    for (const entry of entries) {
      if (!entry.company || !entry.domain) continue;

      const domain = entry.domain.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '').toLowerCase();

      // Validate domain has MX records — reject if no mail server
      try {
        const mxRecords = await dns.resolveMx(domain);
        if (!mxRecords || mxRecords.length === 0) {
          console.log(`[PreCrawler] Rejected ${entry.company} — no MX records for ${domain}`);
          continue; // Skip this company entirely
        }
      } catch {
        console.log(`[PreCrawler] Rejected ${entry.company} — DNS lookup failed for ${domain}`);
        continue; // Skip this company entirely
      }

      // Store company
      const company: PreCrawlCompany = {
        company_name: entry.company,
        domain,
        city,
        industry,
        phone: entry.company_phone || null,
        email_pattern: null, // Will be detected from person email
        x_handle: entry.company_x || null,
        snapchat: entry.company_snapchat || null,
        tiktok: entry.company_tiktok || null,
        linkedin_url: null,
        headquarters: entry.headquarters || null,
        company_size: entry.company_size || null,
        description: entry.description || null,
      };

      // Detect email pattern from person's email
      if (entry.person_email && entry.person_email.includes('@')) {
        const localPart = entry.person_email.split('@')[0].toLowerCase();
        if (localPart.includes('.')) company.email_pattern = 'first.last';
        else if (localPart.length <= 2) company.email_pattern = 'first';
        else company.email_pattern = 'flast';
      }

      companies.push(company);

      // Store person
      if (entry.person_name && entry.person_name.length > 2) {
        const person: PreCrawlPerson = {
          name: entry.person_name,
          title: entry.person_title || '',
          company_name: entry.company,
          domain,
          email: entry.person_email || null,
          email_verified: false,
          linkedin_url: entry.person_linkedin || null,
          phone: null,
          city,
          industry,
        };
        people.push(person);
      }
    }

    // Insert into database
    const companyStmt = db.prepare(`INSERT OR REPLACE INTO company_cache
      (domain, company_name, city, industry, phone, email_pattern, x_handle, snapchat, tiktok, headquarters, company_size, description, crawled_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

    const personStmt = db.prepare(`INSERT OR REPLACE INTO person_cache
      (name, title, company_name, domain, email, email_verified, linkedin_url, city, industry, crawled_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

    const now = new Date().toISOString();

    const insertCompanies = db.transaction(() => {
      for (const c of companies) {
        companyStmt.run(c.domain, c.company_name, c.city, c.industry, c.phone, c.email_pattern, c.x_handle, c.snapchat, c.tiktok, c.headquarters, c.company_size, c.description, now);
      }
    });

    const insertPeople = db.transaction(() => {
      for (const p of people) {
        personStmt.run(p.name, p.title, p.company_name, p.domain, p.email, 0, p.linkedin_url, p.city, p.industry, now);
      }
    });

    insertCompanies();
    insertPeople();

    // Inline verification — verify emails immediately after crawl
    const verifyStmt = db.prepare(`UPDATE person_cache SET email_verified = ?, verified_at = ? WHERE name = ? AND domain = ?`);
    for (const p of people) {
      if (p.email) {
        try {
          const verified = await smtpVerifyQuick(p.email);
          verifyStmt.run(verified ? 1 : 0, now, p.name, p.domain);
          if (verified) {
            console.log(`[PreCrawler] ✓ Email verified: ${p.email}`);
          }
        } catch {
          // Verification failed — will be retried by daily cron
        }
      }
    }

    // Mark job complete
    db.prepare(`UPDATE crawl_jobs SET status='done', companies_found=?, people_found=?, completed_at=? WHERE city=? AND industry=?`)
      .run(companies.length, people.length, now, city, industry);

    const result: CrawlJobResult = {
      city,
      industry,
      companies,
      people,
      duration_ms: Date.now() - startTime,
      timestamp: now,
    };

    console.log(`[PreCrawler] ${city} × ${industry}: ${companies.length} companies, ${people.length} people (${result.duration_ms}ms)`);
    return result;

  } catch (err: any) {
    const now = new Date().toISOString();
    db.prepare(`UPDATE crawl_jobs SET status='failed', error=?, completed_at=? WHERE city=? AND industry=?`)
      .run(err.message, now, city, industry);

    console.error(`[PreCrawler] Failed ${city} × ${industry}: ${err.message}`);
    return { city, industry, companies: [], people: [], duration_ms: Date.now() - startTime, timestamp: now };
  }
}

// ---------------------------------------------------------------------------
// Batch crawl — runs multiple city×industry combos with rate limiting
// ---------------------------------------------------------------------------

export async function runPreCrawlBatch(
  db: any,
  apiKey: string,
  cities?: string[],
  industries?: string[],
  delayBetweenMs: number = 3000,
  onProgress?: (completed: number, total: number, current: string) => void,
): Promise<{ total_companies: number; total_people: number; duration_ms: number }> {
  const targetCities = cities || KSA_CITIES.slice(0, 5); // Default: top 5 cities
  const targetIndustries = industries || INDUSTRIES.slice(0, 10); // Default: top 10 industries

  const jobs: { city: string; industry: string }[] = [];

  // Skip already-completed jobs
  for (const city of targetCities) {
    for (const industry of targetIndustries) {
      const existing = db.prepare(`SELECT status FROM crawl_jobs WHERE city=? AND industry=?`).get(city, industry) as any;
      if (existing?.status === 'done') {
        console.log(`[PreCrawler] Skipping ${city} × ${industry} (already done)`);
        continue;
      }
      jobs.push({ city, industry });
    }
  }

  console.log(`[PreCrawler] Starting batch: ${jobs.length} crawl jobs (${targetCities.length} cities × ${targetIndustries.length} industries)`);

  const startTime = Date.now();
  let totalCompanies = 0;
  let totalPeople = 0;

  for (let i = 0; i < jobs.length; i++) {
    const { city, industry } = jobs[i];

    onProgress?.(i, jobs.length, `${city} × ${industry}`);

    const result = await crawlCityIndustry(db, city, industry, apiKey);
    totalCompanies += result.companies.length;
    totalPeople += result.people.length;

    // Rate limit between Gemini calls
    if (i < jobs.length - 1) {
      await new Promise(r => setTimeout(r, delayBetweenMs));
    }
  }

  console.log(`[PreCrawler] Batch complete: ${totalCompanies} companies, ${totalPeople} people in ${((Date.now() - startTime) / 1000).toFixed(0)}s`);

  return {
    total_companies: totalCompanies,
    total_people: totalPeople,
    duration_ms: Date.now() - startTime,
  };
}

// ---------------------------------------------------------------------------
// Fast lookup functions (used by enrichment engine)
// ---------------------------------------------------------------------------

export function lookupCompany(db: any, domain: string): PreCrawlCompany | null {
  const row = db.prepare(`SELECT * FROM company_cache WHERE domain = ?`).get(domain) as any;
  if (!row) return null;
  return {
    company_name: row.company_name,
    domain: row.domain,
    city: row.city,
    industry: row.industry,
    phone: row.phone,
    email_pattern: row.email_pattern,
    x_handle: row.x_handle,
    snapchat: row.snapchat,
    tiktok: row.tiktok,
    linkedin_url: row.linkedin_url,
    headquarters: row.headquarters,
    company_size: row.company_size,
    description: row.description,
  };
}

export function lookupPerson(db: any, name: string, domain: string): PreCrawlPerson | null {
  const row = db.prepare(`SELECT * FROM person_cache WHERE name = ? AND domain = ?`).get(name, domain) as any;
  if (!row) return null;
  return {
    name: row.name,
    title: row.title,
    company_name: row.company_name,
    domain: row.domain,
    email: row.email,
    email_verified: !!row.email_verified,
    linkedin_url: row.linkedin_url,
    phone: row.phone,
    city: row.city,
    industry: row.industry,
  };
}

export function searchPeople(db: any, query: string, limit: number = 20): PreCrawlPerson[] {
  const rows = db.prepare(`SELECT * FROM person_cache WHERE name LIKE ? OR company_name LIKE ? LIMIT ?`)
    .all(`%${query}%`, `%${query}%`, limit) as any[];
  return rows.map((r: any) => ({
    name: r.name,
    title: r.title,
    company_name: r.company_name,
    domain: r.domain,
    email: r.email,
    email_verified: !!r.email_verified,
    linkedin_url: r.linkedin_url,
    phone: r.phone,
    city: r.city,
    industry: r.industry,
  }));
}

export function getPreCrawlStats(db: any): any {
  const companies = db.prepare(`SELECT COUNT(*) as count FROM company_cache`).get() as any;
  const people = db.prepare(`SELECT COUNT(*) as count FROM person_cache`).get() as any;
  const verified = db.prepare(`SELECT COUNT(*) as count FROM person_cache WHERE email_verified = 1`).get() as any;
  const jobs = db.prepare(`SELECT status, COUNT(*) as count FROM crawl_jobs GROUP BY status`).all() as any[];
  const topCities = db.prepare(`SELECT city, COUNT(*) as count FROM company_cache GROUP BY city ORDER BY count DESC LIMIT 10`).all() as any[];
  const topIndustries = db.prepare(`SELECT industry, COUNT(*) as count FROM company_cache GROUP BY industry ORDER BY count DESC LIMIT 10`).all() as any[];
  const staleCount = db.prepare(`SELECT COUNT(*) as count FROM person_cache WHERE crawled_at < datetime('now', '-7 days')`).get() as any;

  return {
    total_companies: companies.count,
    total_people: people.count,
    verified_people: verified.count,
    stale_records: staleCount.count,
    crawl_jobs: Object.fromEntries(jobs.map((j: any) => [j.status, j.count])),
    top_cities: topCities,
    top_industries: topIndustries,
    phases: CRAWL_PHASES.map(p => p.name),
    total_cities_worldwide: CRAWL_PHASES.reduce((sum, p) => sum + p.cities.length, 0),
  };
}

// ---------------------------------------------------------------------------
// Perpetual Crawl — Never stops. Phase by phase. Loops forever.
// ---------------------------------------------------------------------------

export async function startPerpetualCrawl(
  db: any,
  apiKey: string,
  delayBetweenMs: number = 3000,
): Promise<void> {
  console.log(`[PreCrawler] PERPETUAL CRAWL starting — ${CRAWL_PHASES.length} phases, ${CRAWL_PHASES.reduce((s, p) => s + p.cities.length, 0)} cities worldwide`);

  let cycleCount = 0;

  while (true) {
    cycleCount++;
    console.log(`[PreCrawler] ═══ CYCLE ${cycleCount} START ═══`);

    for (const phase of CRAWL_PHASES) {
      console.log(`[PreCrawler] Phase: ${phase.name} (${phase.cities.length} cities)`);

      try {
        const TARGET_INDUSTRIES = ['Oil & Gas', 'Real Estate & Property Development', 'Fintech & Banking', 'Fashion & Retail'];
        const result = await runPreCrawlBatch(
          db, apiKey, phase.cities, TARGET_INDUSTRIES, delayBetweenMs,
          (done, total, current) => {
            if (done % 10 === 0) console.log(`[PreCrawler][${phase.name}] ${done}/${total} — ${current}`);
          },
        );

        console.log(`[PreCrawler] Phase ${phase.name} done: +${result.total_companies} companies, +${result.total_people} people`);
      } catch (err: any) {
        console.error(`[PreCrawler] Phase ${phase.name} error: ${err.message}`);
      }

      // Brief pause between phases
      await new Promise(r => setTimeout(r, 5000));
    }

    // Cycle complete — reset failed jobs so they retry next cycle
    try {
      db.prepare(`UPDATE crawl_jobs SET status='pending' WHERE status='failed'`).run();
      // Mark old "done" jobs as pending if data is older than 7 days (refresh stale data)
      db.prepare(`UPDATE crawl_jobs SET status='pending' WHERE status='done' AND completed_at < datetime('now', '-7 days')`).run();
    } catch (e: any) {
      console.warn(`[PreCrawler] Cleanup error: ${e.message}`);
    }

    const stats = getPreCrawlStats(db);
    console.log(`[PreCrawler] ═══ CYCLE ${cycleCount} COMPLETE ═══`);
    console.log(`[PreCrawler] Total: ${stats.total_companies} companies, ${stats.total_people} people, ${stats.verified_people} verified`);
    console.log(`[PreCrawler] Sleeping 30 minutes before next cycle...`);

    // Wait 30 minutes before starting next cycle
    await new Promise(r => setTimeout(r, 30 * 60 * 1000));
  }
}

// ---------------------------------------------------------------------------
// Daily Verification Cron — Triple-verify all cached leads
// ---------------------------------------------------------------------------

// MX record cache — most leads share the same domains
const mxCache = new Map<string, { records: { exchange: string; priority: number }[] | null; cachedAt: number }>();
const MX_CACHE_TTL = 60 * 60 * 1000; // 1 hour

async function getCachedMX(domain: string): Promise<{ exchange: string; priority: number }[] | null> {
  const cached = mxCache.get(domain);
  if (cached && Date.now() - cached.cachedAt < MX_CACHE_TTL) {
    return cached.records;
  }
  try {
    const records = await dns.resolveMx(domain);
    if (!records?.length) {
      mxCache.set(domain, { records: null, cachedAt: Date.now() });
      return null;
    }
    records.sort((a, b) => a.priority - b.priority);
    mxCache.set(domain, { records, cachedAt: Date.now() });
    return records;
  } catch {
    mxCache.set(domain, { records: null, cachedAt: Date.now() });
    return null;
  }
}

async function smtpVerifyQuick(email: string): Promise<boolean> {
  try {
    const domain = email.split('@')[1];
    if (!domain) return false;
    const mxRecords = await getCachedMX(domain);
    if (!mxRecords?.length) return false;

    return new Promise<boolean>((resolve) => {
      const socket = net.createConnection(25, mxRecords[0].exchange);
      let stage = 0;
      let done = false;

      const finish = (result: boolean) => { if (!done) { done = true; socket.destroy(); resolve(result); } };

      socket.setTimeout(5000);
      socket.on('timeout', () => finish(false));
      socket.on('error', () => finish(false));
      socket.on('data', (data: Buffer) => {
        const line = data.toString();
        if (stage === 0 && line.startsWith('220')) { socket.write('EHLO leadjin.app\r\n'); stage = 1; }
        else if (stage === 1 && line.includes('250')) { socket.write(`MAIL FROM:<verify@leadjin.app>\r\n`); stage = 2; }
        else if (stage === 2 && line.startsWith('250')) { socket.write(`RCPT TO:<${email}>\r\n`); stage = 3; }
        else if (stage === 3) { finish(parseInt(line.slice(0, 3)) === 250); }
      });
    });
  } catch { return false; }
}

async function isCatchAll(domain: string): Promise<boolean> {
  try {
    const mx = await getCachedMX(domain);
    if (!mx) return false;
    // Test with a random address that should not exist
    const randomEmail = `verify-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@${domain}`;
    return await smtpVerifyQuick(randomEmail);
  } catch { return false; }
}

async function waVerifyQuick(phone: string): Promise<boolean> {
  try {
    const digits = phone.replace(/\D/g, '');
    const res = await fetch(`https://wa.me/${digits}`, {
      redirect: 'manual',
      signal: AbortSignal.timeout(3000),
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    return res.status === 302 || (res.ok && (await res.text()).includes('send'));
  } catch { return false; }
}

async function linkedinCheckQuick(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(3000),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LeadJin/1.0)' },
    });
    // LinkedIn returns 200 or 302 for valid profiles, 404/999 for invalid
    return res.status === 200 || res.status === 302 || res.status === 301;
  } catch { return false; }
}

export async function runDailyVerification(
  db: any,
  batchSize: number = 100,
  onProgress?: (verified: number, total: number) => void,
): Promise<{ total: number; email_valid: number; email_invalid: number; wa_verified: number; linkedin_valid: number }> {
  console.log('[Verify] Daily triple-verification starting...');

  // Get all unverified or stale people (not verified in last 24 hours)
  const people = db.prepare(`
    SELECT id, name, email, linkedin_url, phone, industry FROM person_cache
    WHERE email IS NOT NULL
    AND (email_verified = 0 OR verified_at IS NULL OR verified_at < datetime('now', '-1 day'))
    ORDER BY
      CASE
        WHEN industry IN ('Oil & Gas', 'Real Estate & Property Development', 'Fintech & Banking', 'Fashion & Retail') THEN 0
        ELSE 1
      END ASC,
      crawled_at DESC
    LIMIT ?
  `).all(batchSize) as any[];

  console.log(`[Verify] ${people.length} leads to verify`);

  let emailValid = 0, emailInvalid = 0, waVerified = 0, linkedinValid = 0;
  const now = new Date().toISOString();

  // Process in parallel batches of 10
  const BATCH_SIZE = 10;
  const catchAllCache = new Map<string, boolean>();

  for (let i = 0; i < people.length; i += BATCH_SIZE) {
    const batch = people.slice(i, i + BATCH_SIZE);

    const results = await Promise.allSettled(batch.map(async (p: any) => {
      const domain = p.email?.split('@')[1];

      // Check catch-all status (cached per domain)
      let catchAll = false;
      if (domain && !catchAllCache.has(domain)) {
        catchAll = await isCatchAll(domain);
        catchAllCache.set(domain, catchAll);
      } else if (domain) {
        catchAll = catchAllCache.get(domain) || false;
      }

      // Triple verify in parallel
      const [emailOk, waOk, liOk] = await Promise.all([
        p.email ? smtpVerifyQuick(p.email) : Promise.resolve(false),
        p.phone ? waVerifyQuick(p.phone) : Promise.resolve(false),
        p.linkedin_url ? linkedinCheckQuick(p.linkedin_url) : Promise.resolve(false),
      ]);

      return { id: p.id, emailOk, waOk, liOk, catchAll, linkedin_url: p.linkedin_url };
    }));

    // Update database for this batch
    for (const result of results) {
      if (result.status === 'rejected') continue;
      const { id, emailOk, waOk, liOk, catchAll, linkedin_url } = result.value;

      // Only truly verified = SMTP 250 on a non-catch-all domain
      const reallyVerified = emailOk && !catchAll;

      if (reallyVerified) emailValid++; else emailInvalid++;
      if (waOk) waVerified++;
      if (liOk) linkedinValid++;

      db.prepare(`UPDATE person_cache SET email_verified = ?, verified_at = ? WHERE id = ?`)
        .run(reallyVerified ? 1 : 0, now, id);

      // Store catch-all flag on company
      if (catchAll) {
        const domain = people.find((p: any) => p.id === id)?.email?.split('@')[1];
        if (domain) {
          db.prepare(`UPDATE company_cache SET is_catchall = 1 WHERE domain = ?`).run(domain);
        }
      }

      // Remove invalid LinkedIn URLs
      if (linkedin_url && !liOk) {
        db.prepare(`UPDATE person_cache SET linkedin_url = NULL WHERE id = ?`).run(id);
      }
    }

    if ((i + BATCH_SIZE) % 50 === 0 || i + BATCH_SIZE >= people.length) {
      console.log(`[Verify] ${Math.min(i + BATCH_SIZE, people.length)}/${people.length} — valid: ${emailValid}, invalid: ${emailInvalid}, wa: ${waVerified}, catchall domains: ${[...catchAllCache.values()].filter(Boolean).length}`);
      onProgress?.(Math.min(i + BATCH_SIZE, people.length), people.length);
    }
  }

  const result = { total: people.length, email_valid: emailValid, email_invalid: emailInvalid, wa_verified: waVerified, linkedin_valid: linkedinValid };
  console.log(`[Verify] Daily verification complete:`, result);
  return result;
}
