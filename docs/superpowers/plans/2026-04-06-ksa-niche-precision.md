# KSA Niche Precision — LeadJin Optimization Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Optimize LeadJin's crawl, enrichment, intent signals, and lead scoring for KSA B2B leads in Oil & Gas, Real Estate, Fintech, and Fashion — without Apollo/Hunter/Snov.

**Architecture:** Three focused changes: (1) replace generic Gemini crawl prompt with niche-specific KSA templates in `preCrawler.ts`, (2) add Vision 2030 + intent signal weighting to `recalculateLeadScore` and wire `detectKSASignals` into the monitor loop in `server.ts`, (3) prioritize target niches in `runDailyVerification` in `preCrawler.ts`.

**Tech Stack:** TypeScript, better-sqlite3, Gemini 2.5 Flash with googleSearch tool, Node.js SMTP verification

---

## Files to Modify

- `src/services/preCrawler.ts` — crawl prompt + `runDailyVerification` niche priority
- `server.ts` — `recalculateLeadScore` function (L1568–1610) + SignalsMonitor loop (L4993–5037)

---

### Task 1: KSA Niche-Specific Crawl Prompts

**Files:**
- Modify: `src/services/preCrawler.ts` — function `crawlCityIndustry` (around line 252)

**Context:** Current prompt is generic: `Search Google for real companies in the ${industry} sector located in ${city}, Saudi Arabia.` This returns low-precision results. We need niche-specific prompts with Saudi market terms.

- [ ] **Step 1: Add niche prompt map before `crawlCityIndustry` function**

In `src/services/preCrawler.ts`, after the `INDUSTRIES` export (around line 116), insert:

```typescript
// ---------------------------------------------------------------------------
// KSA Niche-Specific Search Templates
// ---------------------------------------------------------------------------

const KSA_NICHE_PROMPTS: Record<string, string> = {
  'Oil & Gas': `Search for real companies in Saudi Arabia's Oil & Gas sector in ${'{city}'}. Focus on:
- Saudi Aramco suppliers and contractors (Tier 1 and Tier 2 vendors)
- Oilfield services companies (drilling, well services, maintenance)
- Engineering & EPC contractors licensed by Saudi Aramco or SABIC
- Downstream petrochemicals and refining companies
- Energy technology providers with KSA offices
Search both English and Arabic: شركات النفط والغاز, موردي أرامكو, خدمات الحقول النفطية
Find senior decision-makers: VP Procurement, Head of Contracts, Operations Director, Technical Director`,

  'Real Estate & Property Development': `Search for real estate developers and property companies in ${'{city}'}, Saudi Arabia. Focus on:
- Vision 2030 giga-project contractors (NEOM, Red Sea Project, Qiddiya, Diriyah Gate)
- Licensed real estate developers (REGA-registered companies)
- Luxury residential and commercial developers
- PropTech companies operating in KSA
- Real estate investment funds (REITs) and management companies
Arabic: شركات التطوير العقاري, المطورون العقاريون, الاستثمار العقاري
Find: CEO, Managing Director, Head of Development, Chief Investment Officer`,

  'Fintech & Banking': `Search for fintech companies and financial services firms in ${'{city}'}, Saudi Arabia. Focus on:
- SAMA-licensed fintechs (payment, lending, BNPL, WealthTech)
- Digital banking and neobanks operating in KSA
- Islamic finance technology companies
- Fintech companies backed by Saudi Venture Capital or PIF
- Payment gateway and POS solution providers
Arabic: شركات التقنية المالية, الفنتك, الدفع الإلكتروني, التمويل الإسلامي
Find: CEO, CTO, Head of Business Development, Chief Product Officer`,

  'Fashion & Retail': `Search for fashion brands and luxury retail companies in ${'{city}'}, Saudi Arabia. Focus on:
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
    ? nicheTemplate.replace(/\$\{['"]?city['"]?\}/g, city).replace(/\$\{'city'\}/g, city)
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
```

- [ ] **Step 2: Replace the hardcoded prompt string in `crawlCityIndustry`**

In `src/services/preCrawler.ts`, find the `const prompt = `` line (around line 252) and replace the entire block:

```typescript
  const prompt = buildCrawlPrompt(industry, city);
```

- [ ] **Step 3: Verify the file compiles**

```bash
cd /home/euphoria/leadjin/leadjin && npx tsc --noEmit --project tsconfig.server.json 2>&1 | head -20
```
Expected: no errors (or only pre-existing unrelated errors)

- [ ] **Step 4: Rebuild Docker and restart**

```bash
cd /home/euphoria/leadjin/leadjin
docker compose down
docker compose up -d --build
```
Expected: Container starts, logs show `[PreCrawler] PERPETUAL CRAWL starting`

- [ ] **Step 5: Verify crawl picks up new prompts**

```bash
docker logs leadjin --tail 30 2>/dev/null | grep -E "Crawling|PreCrawler"
```
Expected: `[PreCrawler] Crawling: Riyadh × Oil & Gas` (crawl running)

---

### Task 2: Vision 2030 + Intent Signal Lead Scoring

**Files:**
- Modify: `server.ts` — `recalculateLeadScore` function at L1568–1610
- Modify: `server.ts` — SignalsMonitor `setInterval` at L4993–5037

**Context:** Current scoring ignores `vision_2030_score` and `intent_signals` count. SignalsMonitor only calls `detectSignals` (generic) and caps at 50. Need to call `detectKSASignals` for Saudi leads and weight both in scoring.

- [ ] **Step 1: Update `recalculateLeadScore` to include Vision 2030 and intent signals**

In `server.ts`, replace the entire `recalculateLeadScore` function (L1568–1610):

```typescript
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
  // vision_2030_score is stored as 0-100 on the lead
  if (lead.vision_2030_score && typeof lead.vision_2030_score === 'number') {
    // Scale: 100 v2030 score → +20 lead score points
    breakdown.vision_2030 = Math.round((lead.vision_2030_score / 100) * 20);
  }

  // Intent signals from DB: high-confidence signals boost score (max 15)
  if (lead.lead_id) {
    try {
      const signalRows = (db as any).prepare(
        "SELECT confidence FROM intent_signals WHERE lead_id = ? AND confidence >= 70"
      ).all(lead.lead_id) as { confidence: number }[];
      if (signalRows.length > 0) {
        // Each high-confidence signal adds 3 pts, max 15
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
```

- [ ] **Step 2: Wire `detectKSASignals` into the SignalsMonitor for target niches**

In `server.ts`, replace the SignalsMonitor `setInterval` block (L4993–5037):

```typescript
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
}, 6 * 60 * 60 * 1000);
```

- [ ] **Step 3: Upgrade intent signals model from `gemini-flash-lite-latest` to `gemini-2.5-flash`**

In `src/services/intentSignals.ts`, replace all 3 occurrences of:
```typescript
model: "gemini-flash-lite-latest",
```
With:
```typescript
model: "gemini-2.5-flash",
```
(There are 3 methods: `detectSignals`, `detectKSASignals`, `detectJobChange`)

- [ ] **Step 4: Rebuild Docker**

```bash
cd /home/euphoria/leadjin/leadjin && docker compose down && docker compose up -d --build
```
Expected: Container up, logs show `[SignalsMonitor]` running after 6h, `[PreCrawler] PERPETUAL CRAWL starting`

---

### Task 3: Prioritize Target Niches in Daily Verification

**Files:**
- Modify: `src/services/preCrawler.ts` — `runDailyVerification` function (find by searching `runDailyVerification`)

**Context:** Verification runs every 6 hours on 1,000 records from `person_cache` ordered by `crawled_at DESC` — newest first but no niche priority. Target niches should be verified first.

- [ ] **Step 1: Find `runDailyVerification` in `src/services/preCrawler.ts`**

```bash
grep -n "runDailyVerification" /home/euphoria/leadjin/leadjin/src/services/preCrawler.ts
```

- [ ] **Step 2: Update the SELECT query inside `runDailyVerification` to prioritize target niches**

Find the SQL query inside `runDailyVerification` that selects unverified people. It will look like:
```typescript
SELECT * FROM person_cache WHERE email_verified = 0 AND email IS NOT NULL ORDER BY crawled_at DESC LIMIT ?
```

Replace with:
```typescript
SELECT * FROM person_cache
WHERE email_verified = 0 AND email IS NOT NULL
ORDER BY
  CASE
    WHEN industry IN ('Oil & Gas', 'Real Estate & Property Development', 'Fintech & Banking', 'Fashion & Retail') THEN 0
    ELSE 1
  END ASC,
  crawled_at DESC
LIMIT ?
```

- [ ] **Step 3: Rebuild and verify**

```bash
cd /home/euphoria/leadjin/leadjin && docker compose down && docker compose up -d --build
sleep 5 && docker logs leadjin --tail 10
```
Expected: Clean startup, `[PreCrawler] PERPETUAL CRAWL starting`, `[Verify] Next verification in 6.0 hours`

---

## Verification / Report

After all 3 tasks, run this to confirm state:

```bash
docker exec leadjin node -e "
const db = require('better-sqlite3')('/app/leadjin.db');
console.log('=== CRAWL ===');
console.log(db.prepare('SELECT status, COUNT(*) n FROM crawl_jobs GROUP BY status').all());
console.log('=== PEOPLE CACHE ===');
console.log('Total:', db.prepare('SELECT COUNT(*) n FROM person_cache').get().n);
console.log('Verified:', db.prepare('SELECT COUNT(*) n FROM person_cache WHERE email_verified=1').get().n);
console.log('=== BY NICHE ===');
console.log(db.prepare(\"SELECT industry, COUNT(*) n FROM person_cache WHERE industry IN ('Oil & Gas','Real Estate & Property Development','Fintech & Banking','Fashion & Retail') GROUP BY industry\").all());
console.log('=== INTENT SIGNALS ===');
console.log(db.prepare('SELECT COUNT(*) n FROM intent_signals').get().n, 'signals stored');
"
```
