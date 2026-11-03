# LeadJin Enrichment Engine v2 — Design Spec

> Zero paid APIs. Saudi-first social intelligence. Built for the Kingdom.

**Date:** 2026-04-03
**Author:** Claude (architecture) + Raqeeb (product direction)
**Reviewed by:** Gemini CLI, Kimi CLI, OpenCode CLI (all 3 provided critiques)

---

## Problem

LeadJin needs to enrich leads with email, phone, WhatsApp, LinkedIn URL, and company social presence — without paying for Hunter.io ($30/1K), Apollo.io ($50/1K), or Snov.io.

## Core Insight

Hunter/Apollo/Snov are built for the American market (LinkedIn-centric, email-first). In Saudi Arabia, the contact hierarchy is:

1. WhatsApp (deals happen here)
2. X/Twitter (professional networking — replaces LinkedIn in KSA)
3. Snapchat (90% penetration, business + personal)
4. Phone call (company number)
5. Email (formal follow-up)
6. LinkedIn (distant last)

**Our edge:** Social intelligence mining from platforms where Saudi professionals actually are.

## Privacy Rules

### Displayed on lead card:
- Email (verified)
- Phone number
- WhatsApp status (verified via wa.me probe)
- LinkedIn URL (individual — professional network, expected)
- Company X handle (public business account)
- Company Snapchat handle (public business account)
- Company TikTok handle (public business account)

### NEVER displayed:
- Personal X/Twitter handle
- Personal Snapchat handle
- Personal TikTok handle

### Mining rule:
Social platforms are **intelligence sources** for extracting email/phone/WhatsApp. Personal handles are used during mining but discarded after extraction. Only professional contact info and company handles are stored.

---

## Architecture

```
Lead Input (name, company, domain)
│
├─ Layer 0: CACHE + PATTERN CHECK
│   ├─ Already enriched this person? → return cached result
│   ├─ Known email pattern for this domain? → generate + verify → skip to Layer 2
│   └─ DB tables: enrichment_cache, domain_patterns
│
├─ Layer 1: SOCIAL INTELLIGENCE (primary discovery — replaces LinkedIn)
│   ├─ 1a. X/Twitter Mining
│   │   ├─ Search via Gemini grounding: site:x.com "Company" "Person"
│   │   ├─ Fallback: DuckDuckGo site:twitter.com search
│   │   ├─ Parse bio → extract email, phone, wa.me, snap handle, LinkedIn URL
│   │   ├─ Find company X handle → store as company social
│   │   └─ Personal handle: use for mining, do NOT store
│   │
│   ├─ 1b. TikTok Bio Mining
│   │   ├─ Search via Gemini: site:tiktok.com "@companyname"
│   │   ├─ Scrape bio link (linktree/bio.link) → extract ALL contact methods
│   │   ├─ Store company TikTok handle
│   │   └─ One bio link page can resolve email + phone + WhatsApp + all socials
│   │
│   ├─ 1c. Snapchat Cross-Reference
│   │   ├─ Extract Snapchat handle from X bio, TikTok bio, company website
│   │   ├─ Google: site:snapchat.com/add "company name"
│   │   ├─ Store company Snapchat handle
│   │   └─ Personal handle: use for mining context, do NOT store
│   │
│   └─ 1d. LinkedIn (fallback, not primary)
│       ├─ DuckDuckGo: site:linkedin.com/in "Name" "Company"
│       ├─ Google Custom Search (100/day budget — only for misses)
│       ├─ Dual-language: search English AND Arabic name variants
│       └─ Multi-signal disambiguation: require company + location + title match
│
├─ Layer 2: EMAIL VERIFICATION
│   ├─ If email found in Layer 1 → single SMTP verify (fast, 2-5s)
│   ├─ If no email found:
│   │   ├─ MX record lookup → identify provider
│   │   ├─ M365/Google domains → skip SMTP, use pattern learning
│   │   ├─ Other domains → transliteration normalizer (top 5 variants, not 30+)
│   │   ├─ Arabic-aware: handle Al-/Abu/Bin prefix variations
│   │   └─ Parallel SMTP verify with early exit on first hit
│   ├─ Catch-all detection: probe gibberish@domain first
│   ├─ Store winning pattern in domain_patterns table
│   └─ Confidence scoring: SMTP verified=95%, pattern=85%, AI=70%, catch-all=50%
│
├─ Layer 3: PHONE + WHATSAPP
│   ├─ Cross-reference phone from Layer 1 social bio findings
│   ├─ Company website scrape: /contact, /about, footer
│   ├─ Schema.org / JSON-LD structured data extraction
│   ├─ WHOIS lookup on domain
│   ├─ Saudi format validation: +966 5XX (mobile), +966 1X (landline)
│   ├─ wa.me/{number} HTTP probe → verify WhatsApp Business presence
│   └─ Label: "Company" vs "Direct" phone
│
├─ Layer 4: AI RESEARCH (only for missing fields after Layers 1-3)
│   ├─ Gemini 2.5 Flash with Google Search grounding
│   ├─ Dual-language query (Arabic + English name)
│   ├─ Structured JSON output with source URLs
│   ├─ Require grounding (no training data answers)
│   ├─ Temperature: 0 for determinism
│   ├─ Cross-verify against Layers 1-3 findings
│   └─ Cost: ~$0.0002/lead
│
└─ Layer 5: SAUDI GOVERNMENT DATA (company verification)
    ├─ Sijil Tijari (Commercial Registry) — verify company, get CR number
    └─ ZATCA VAT registry — confirm company existence
```

---

## Database Schema (new tables)

```sql
-- Enrichment results cache
CREATE TABLE IF NOT EXISTS enrichment_cache (
  lead_id TEXT PRIMARY KEY,
  email TEXT,
  email_confidence REAL,
  email_source TEXT,
  phone TEXT,
  phone_type TEXT, -- 'direct' | 'company'
  phone_source TEXT,
  whatsapp_verified INTEGER DEFAULT 0,
  linkedin_url TEXT,
  company_x_handle TEXT,
  company_snapchat TEXT,
  company_tiktok TEXT,
  enriched_at TEXT,
  enrichment_duration_ms INTEGER,
  layers_used TEXT -- JSON array of which layers contributed
);

-- Domain email pattern learning
CREATE TABLE IF NOT EXISTS domain_patterns (
  domain TEXT PRIMARY KEY,
  pattern TEXT, -- e.g. 'first.last', 'flast', 'first'
  mx_provider TEXT, -- 'microsoft365', 'google', 'other'
  is_catchall INTEGER DEFAULT 0,
  confidence REAL,
  sample_count INTEGER DEFAULT 0,
  last_verified TEXT
);

-- Arabic transliteration mappings
CREATE TABLE IF NOT EXISTS transliteration_cache (
  arabic_name TEXT,
  english_variants TEXT, -- JSON array of known romanizations
  preferred_variant TEXT,
  PRIMARY KEY (arabic_name)
);

-- Enrichment queue for background processing
CREATE TABLE IF NOT EXISTS enrichment_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id TEXT NOT NULL,
  status TEXT DEFAULT 'pending', -- pending, processing, done, failed
  priority INTEGER DEFAULT 0,
  created_at TEXT,
  started_at TEXT,
  completed_at TEXT,
  error TEXT
);
```

---

## Implementation Files

### New files to create:
```
src/services/enrichmentEngine.ts      — Main orchestrator (Layer 0-5 waterfall)
src/services/socialIntelligence.ts    — Layer 1: X/TikTok/Snapchat/LinkedIn mining
src/services/emailVerifier.ts         — Layer 2: SMTP + pattern learning + transliteration
src/services/phoneDiscovery.ts        — Layer 3: Website scrape + WhatsApp verification
src/services/aiResearch.ts            — Layer 4: Gemini Flash research agent
src/services/saudiRegistry.ts         — Layer 5: Sijil Tijari + ZATCA (future)
src/services/transliterationEngine.ts — Arabic name → English variant normalizer
```

### Files to modify:
```
server.ts                             — New endpoints: /api/leads/enrich-v2, /api/enrichment/status
src/services/waterfallEnrichment.ts   — Deprecate, redirect to enrichmentEngine.ts
src/App.tsx                           — Progressive enrichment card UI, company social handles
```

---

## API Endpoints

```
POST   /api/leads/enrich-v2          — Enrich single lead (background, returns job ID)
POST   /api/leads/enrich-v2/bulk     — Enrich multiple leads (queue-based)
GET    /api/enrichment/status/:id    — Check enrichment progress
GET    /api/enrichment/stats         — Accuracy metrics, cache hit rate
DELETE /api/enrichment/cache/:leadId — Force re-enrichment
```

---

## Progressive UI

Lead card shows results as they arrive via WebSocket:
```
┌─────────────────────────────────────────────┐
│ Mohammed Al-Rashid — ACME Saudi             │
│                                             │
│ ✓✓✓ Email: m.alrashid@acme.sa  (95%)      │
│ ✓✓  Phone: +966 13 XXX XXXX   (Company)   │
│ ✓   WhatsApp: Verified ✓                   │
│ ✓✓  LinkedIn: linkedin.com/in/...          │
│ ⟳   Enriching...                            │
│                                             │
│ Company Social:                             │
│ 𝕏 @acme_saudi  📸 @acme.sa  🎵 @acme.sa   │
└─────────────────────────────────────────────┘
```

---

## Confidence Scoring

| Source | Confidence | Label |
|--------|-----------|-------|
| SMTP verified email | 95% | ✓✓✓ Verified |
| Domain pattern match | 85% | ✓✓ Confident |
| Social bio extraction | 80% | ✓✓ Confident |
| AI research with source | 70% | ✓ Likely |
| Catch-all domain guess | 50% | ? Unverified |

---

## Speed Tiers

| Tier | Time | When |
|------|------|------|
| Instant | <1s | Cache hit or known domain pattern |
| Fast | 3-10s | Social bio found + single SMTP verify |
| Standard | 15-30s | Full social scan + email permutation |
| Deep | 30-60s | All layers + AI research (background) |

---

## Cost

| Volume | Cost | Comparison |
|--------|------|------------|
| 100 leads | ~$0.02 | Hunter: $3, Apollo: $5 |
| 1,000 leads | ~$0.20 | Hunter: $30, Apollo: $50 |
| 10,000 leads | ~$2.00 | Hunter: $300, Apollo: $500 |

Cost is Gemini Flash for Layer 4 fallback only. Layers 0-3 are free.

---

## Build Phases

### Phase 1: Core Engine (today)
- enrichmentEngine.ts — orchestrator + cache + queue
- emailVerifier.ts — SMTP verification + MX detection + catch-all
- transliterationEngine.ts — Arabic name normalizer
- domain_patterns table + pattern learning
- API endpoints

### Phase 2: Social Intelligence (today)
- socialIntelligence.ts — X, TikTok, Snapchat mining via Gemini grounding
- LinkedIn fallback search
- Bio text parsing (email, phone, wa.me regex extraction)

### Phase 3: Phone + WhatsApp (today)
- phoneDiscovery.ts — website scrape + Schema.org + WHOIS
- WhatsApp wa.me verification
- Saudi phone format validation

### Phase 4: AI Research (today)
- aiResearch.ts — Gemini Flash structured research
- Dual-language queries
- Cross-verification logic

### Phase 5: Frontend (tomorrow)
- Progressive enrichment card
- Company social handles display
- Confidence badges
- Background enrichment status

### Phase 6: Saudi Registry (future)
- Sijil Tijari integration
- ZATCA VAT lookup
