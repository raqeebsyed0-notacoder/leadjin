# KIMI TASK SHEET — LeadJin Enrichment Engine v3: Speed + Frontend

**Date:** 2026-04-03
**Priority:** CRITICAL — Make enrichment instant + show it in the UI
**Assigned to:** Kimi
**Reviewed by:** Claude (Master Planner)

---

## CONTEXT

The enrichment engine v2 is deployed and working. A perpetual crawl is running 24/7 building a database of companies + contacts across 89 cities × 25 industries worldwide. Daily verification cron runs at 4 AM Riyadh.

**Current state:**
- `company_cache` table: growing (companies with phone, email pattern, social handles)
- `person_cache` table: growing (people with email, LinkedIn, title)
- `enrichment_cache.ts`: SQLite persistence layer (you built this — Task 6 from V2)
- Enrichment takes 30-60s because it always calls Gemini. Target: 3-7 seconds.

**The goal:** Wire the pre-built database into the enrichment flow so lookups are instant, and build the frontend UI to show enriched data.

---

## RULES — READ BEFORE TOUCHING ANY CODE

1. **DO NOT modify the Gemini prompts** in `socialIntelligence.ts` or `enrichmentEngine.ts`.
2. **DO NOT modify `preCrawler.ts`** — the perpetual crawl is running. Don't break it.
3. **DO NOT add new npm dependencies.**
4. **DO NOT change API endpoint signatures** — only add new behavior to existing endpoints.
5. **Test every change** with: `docker compose down && docker compose up -d --build && sleep 3 && docker logs leadjin --tail 10`
6. **Commit after each task:** `fix(enrichment): TASK-X description`

---

## FILES YOU WILL WORK ON

```
src/services/enrichmentEngine.ts      — Wire pre-built DB lookups (TASK 1)
src/services/enrichmentCache.ts       — You built this. Wire into enrichmentEngine (TASK 2)
src/services/geminiService.ts         — Add enrichment fields to harvest JSON (TASK 3)
server.ts                             — Add post-harvest verification step (TASK 4)
src/App.tsx                           — Frontend enrichment card UI (TASK 5, 6, 7)
```

**DO NOT TOUCH:**
```
src/services/preCrawler.ts            — Running perpetual crawl. Hands off.
src/services/socialIntelligence.ts    — Prompt is tuned. Don't change.
src/services/transliterationEngine.ts — Working fine.
```

---

## TASK 1: Wire Pre-Built Database Into Enrichment Engine (SPEED)

**File:** `src/services/enrichmentEngine.ts`

**Problem:** `enrichLead()` always calls Gemini (30-60s). The pre-crawl database (`company_cache` + `person_cache`) has data that should be checked FIRST.

**What to do:**

The enrichment engine needs access to the database. Currently it's a standalone module. You need to:

1. Add a `setDatabase(db: any)` function that stores a reference to the SQLite db:
```typescript
let _db: any = null;
export function setDatabase(db: any) { _db = db; }
```

2. In `enrichLead()`, add Layer 0 BEFORE everything else:
```typescript
// ── Layer 0: Pre-built database lookup ──
if (_db) {
  const { lookupCompany, lookupPerson } = await import('./preCrawler.js');
  
  // Check person cache (exact match = instant)
  const cachedPerson = lookupPerson(_db, input.name, domain);
  if (cachedPerson?.email) {
    // We have this exact person. Return instantly.
    return {
      leadId: input.leadId,
      email: cachedPerson.email,
      emailConfidence: cachedPerson.email_verified ? 95 : 75,
      emailSource: cachedPerson.email_verified ? 'cache_verified' : 'cache',
      phone: cachedPerson.phone || null,
      phoneType: cachedPerson.phone ? 'direct' : null,
      phoneSource: cachedPerson.phone ? 'cache' : null,
      whatsappVerified: false,
      linkedinUrl: cachedPerson.linkedin_url || null,
      companyXHandle: null, // filled from company cache below
      companySnapchat: null,
      companyTiktok: null,
      confidenceLabel: cachedPerson.email_verified ? '✓✓✓ Verified' : '✓✓ Confident',
      layersUsed: ['precrawl_cache'],
      durationMs: Date.now() - startTime,
      enrichedAt: new Date().toISOString(),
    };
  }
  
  // Check company cache (get phone, socials, email pattern)
  const cachedCompany = lookupCompany(_db, domain);
  if (cachedCompany) {
    layersUsed.push('company_cache');
    if (cachedCompany.phone && !phone) {
      phone = cachedCompany.phone;
      phoneType = 'company';
      phoneSource = 'company_cache';
    }
    if (cachedCompany.x_handle) companyXHandle = cachedCompany.x_handle;
    if (cachedCompany.snapchat) companySnapchat = cachedCompany.snapchat;
    if (cachedCompany.tiktok) companyTiktok = cachedCompany.tiktok;
    
    // Use known email pattern to generate email instantly
    if (cachedCompany.email_pattern && !email) {
      const { normalizeArabicName } = await import('./transliterationEngine.js');
      const { firstName, lastName } = normalizeArabicName(input.name);
      const generated = applyPattern(cachedCompany.email_pattern, firstName, lastName, domain);
      if (generated) {
        email = generated;
        emailConfidence = 80;
        emailSource = 'pattern_cache';
      }
    }
  }
}
```

3. In `server.ts`, after `initPreCrawlTables(db)`, add:
```typescript
import { setDatabase } from './src/services/enrichmentEngine.js';
setDatabase(db);
```

**Test:** Enrich a lead that was already crawled. Should return in <1 second.

---

## TASK 2: Wire SQLite Enrichment Cache

**File:** `src/services/enrichmentEngine.ts` + `server.ts`

**Problem:** `enrichmentCache` in enrichmentEngine.ts uses in-memory Map. Your `enrichmentCache.ts` has SQLite functions but they're not wired in.

**What to do:**

1. In `server.ts`, after `initPreCrawlTables(db)`:
```typescript
import { initEnrichmentTables } from './src/services/enrichmentCache.js';
initEnrichmentTables(db);
```

2. In `enrichmentEngine.ts`, replace the in-memory cache functions:
```typescript
import { getCachedResult, setCachedResult } from './enrichmentCache.js';

// In enrichLead(), at the top (Layer 0):
if (input.leadId && _db) {
  const cached = getCachedResult(_db, input.leadId);
  if (cached) {
    console.log(`[Enrichment] SQLite cache hit for ${input.name}`);
    return cached;
  }
}

// At the end, before return:
if (input.leadId && _db) {
  setCachedResult(_db, input.leadId, result);
}
```

**Test:** Enrich same lead twice. Second call should be <100ms.

---

## TASK 3: Bake Enrichment Into Harvest Prompt

**File:** `src/services/geminiService.ts`

**Problem:** Harvest finds companies + people but NOT their contact info. Then we call enrichment separately (30-60s each). If the harvest prompt included contact fields, we'd get enrichment for free.

**What to do:**

1. In the `synthesisPrompt` string (around line 157), add these fields to the JSON schema:
```
Add to each lead object:
"email": "the person's personal work email (like firstname.lastname@domain). NOT info@ or contact@. If not findable, use empty string.",
"phone": "company phone number in +966 format or empty string",
"linkedin": "the person's LinkedIn profile URL or empty string",  
"company_x": "company X/Twitter handle like @CompanyName or empty string",
"company_snapchat": "company Snapchat handle or empty string",
"company_tiktok": "company TikTok handle or empty string"
```

2. In the `LeadjinLead` interface (line 4-60), add these optional fields if not already present:
```typescript
phone?: string;
company_x?: string;
company_snapchat?: string;
company_tiktok?: string;
```

3. In the post-processing `.map()` (around line 259), clean the new fields:
```typescript
// Clean phone — only keep valid Saudi format
if (lead.phone && !lead.phone.startsWith('+966') && !lead.phone.startsWith('05')) {
  lead.phone = '';
}
// Clean social handles
if (lead.company_x && !lead.company_x.startsWith('@')) lead.company_x = '';
```

**Test:** Harvest 5 leads. They should come back WITH email, phone, LinkedIn, social handles already populated.

---

## TASK 4: Post-Harvest Verification Step

**File:** `server.ts`

**Problem:** After harvest returns leads with contact data (from Task 3), we need to SMTP verify emails and wa.me check phones in the background. Users see leads instantly, verification updates come async.

**What to do:**

1. In the harvest endpoint (`POST /api/leads/harvest`), after leads are returned to the user, add a non-blocking verification step:
```typescript
// After res.json(leads) is sent...
// Fire-and-forget verification
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
```

2. The key insight: `res.json()` already sent the response. The verification runs AFTER the user sees their leads. They get instant results, then verification badges update on next page load.

**Test:** Harvest leads, check they arrive instantly. Then check DB after 30s — `email_verified` should be updated.

---

## TASK 5: Frontend — Enrichment Badge on Lead Cards

**File:** `src/App.tsx`

**Problem:** Lead cards in the Harvest and CRM views don't show enrichment data (email, phone, LinkedIn, social handles, confidence).

**What to do:**

Find the lead card component in App.tsx (the `SortableLeadCard` at ~line 141 and the lead cards in the harvest results). Add enrichment badges:

1. Below the lead name/company, add a contact info row:
```tsx
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
```

2. Add company social handles row (only if present):
```tsx
{(lead.company_x || lead.company_snapchat || lead.company_tiktok) && (
  <div className="flex items-center gap-2 mt-1">
    {lead.company_x && <span className="text-[9px] opacity-40">{lead.company_x}</span>}
  </div>
)}
```

**Keep it minimal.** Don't redesign the card. Just add the data below existing content.

---

## TASK 6: Frontend — Enrich Button on Lead Detail Panel

**File:** `src/App.tsx`

**Problem:** When you click a lead in CRM, the detail panel opens but there's no way to manually trigger enrichment.

**What to do:**

Find the lead detail panel (search for `selectedLead` and the detail view). Add an "Enrich" button:

```tsx
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
      if (data.email) setSelectedLead(prev => ({ ...prev, email: data.email, email_verified: data.emailConfidence >= 90 }));
      if (data.phone) setSelectedLead(prev => ({ ...prev, phone: data.phone }));
      if (data.linkedinUrl) setSelectedLead(prev => ({ ...prev, linkedin: data.linkedinUrl }));
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
```

Add the state variable near other selectedLead state:
```typescript
const [enriching, setEnriching] = useState(false);
```

---

## TASK 7: Frontend — Show Pre-Crawl Stats in Settings

**File:** `src/App.tsx`

**Problem:** Users (and Raqeeb) can't see how many companies are in the pre-crawl database.

**What to do:**

In the Settings page, under the "System & Engine" tab (`settingsTab === 'system'`), add a section:

```tsx
<section className="space-y-4">
  <div className="flex items-center gap-3">
    <Database size={20} className="text-app-accent" />
    <h3 className="text-xl font-light">Lead Intelligence Database</h3>
  </div>
  <div className="glass p-6 rounded-[24px] grid grid-cols-2 md:grid-cols-4 gap-4">
    <div className="space-y-1">
      <p className="text-2xl font-light">{dbStats?.total_companies || '—'}</p>
      <p className="text-[9px] font-bold uppercase tracking-widest opacity-40">Companies</p>
    </div>
    <div className="space-y-1">
      <p className="text-2xl font-light">{dbStats?.total_people || '—'}</p>
      <p className="text-[9px] font-bold uppercase tracking-widest opacity-40">Contacts</p>
    </div>
    <div className="space-y-1">
      <p className="text-2xl font-light">{dbStats?.verified_people || '—'}</p>
      <p className="text-[9px] font-bold uppercase tracking-widest opacity-40">Verified</p>
    </div>
    <div className="space-y-1">
      <p className="text-2xl font-light">{Object.values(dbStats?.crawl_jobs || {}).reduce((a,b) => a+b, 0) || '—'}</p>
      <p className="text-[9px] font-bold uppercase tracking-widest opacity-40">Crawl Jobs</p>
    </div>
  </div>
</section>
```

Fetch the stats on mount:
```typescript
const [dbStats, setDbStats] = useState<any>(null);
useEffect(() => {
  if (settingsTab === 'system') {
    authFetch('/api/precrawl/stats').then(r => r.json()).then(setDbStats).catch(() => {});
  }
}, [settingsTab]);
```

---

## EXECUTION ORDER

1. Task 1 (wire pre-built DB) — biggest speed impact
2. Task 2 (SQLite enrichment cache) — persistence
3. Task 3 (harvest prompt) — enrichment for free
4. Task 4 (post-harvest verify) — background verification
5. Task 5 (lead card badges) — visual feedback
6. Task 6 (enrich button) — manual trigger
7. Task 7 (stats in settings) — visibility

---

## VERIFICATION

After ALL tasks:
```bash
# 1. Check pre-crawl stats
TOKEN="9e6914ca4272454202e503463dd9d086f9acc028e548dd78784dcd5a7a0efe71"
curl -s http://localhost:3001/api/precrawl/stats -H "Authorization: Bearer $TOKEN" | python3 -m json.tool

# 2. Enrich a cached lead (should be <5 seconds)
time curl -s http://localhost:3001/api/leads/enrich-v2 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"name":"Ahmad Al-Khowaiter","company":"Saudi Aramco","domain":"aramco.com"}'

# 3. Enrich same lead again (should be <100ms from cache)
time curl -s http://localhost:3001/api/leads/enrich-v2 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"name":"Ahmad Al-Khowaiter","company":"Saudi Aramco","domain":"aramco.com","lead_id":"test-cache-1"}'

# 4. Harvest 5 leads (should include enrichment data)
curl -s http://localhost:3001/api/leads/harvest \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"searchParams":{"targetIndustry":"IT & Software","userServices":"AI automation","company_size":"50+","geography":["Saudi Arabia"],"job_titles":["CTO"],"limit":5,"model":"gemini-2.5-flash"}}' | python3 -c "
import json,sys
leads=json.load(sys.stdin)
if isinstance(leads,list):
  for l in leads[:3]:
    print(f\"{l.get('name')} | email={l.get('email','MISS')} | phone={l.get('phone','MISS')} | li={l.get('linkedin','MISS')[:30] if l.get('linkedin') else 'MISS'}\")
"
```

**Speed targets:**
- Cached lead: <100ms
- Known company, new person: <5s
- Cold lead: <30s (Gemini fallback)
- Harvest with enrichment: same time as current harvest (~25s)
