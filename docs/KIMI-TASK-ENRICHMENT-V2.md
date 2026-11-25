# KIMI TASK SHEET — LeadJin Enrichment Engine v2 Hardening

**Date:** 2026-04-03
**Priority:** CRITICAL — Production hardening
**Assigned to:** Kimi
**Reviewed by:** Claude (Master Planner)

---

## RULES — READ BEFORE TOUCHING ANY CODE

1. **DO NOT modify `enrichmentEngine.ts`** — that's the orchestrator, Claude owns it.
2. **DO NOT change any API endpoint signatures** in `server.ts` — the frontend depends on them.
3. **DO NOT add new npm dependencies** — use only what's already in package.json + Node.js built-ins.
4. **DO NOT change the Gemini prompt** in `socialIntelligence.ts` or `enrichmentEngine.ts` — those are tuned and tested.
5. **Test every change** by running: `curl -s -X POST http://localhost:3001/api/leads/enrich-v2 -H "Content-Type: application/json" -H "Authorization: Bearer TOKEN" -d '{"name":"TEST NAME","company":"TEST COMPANY","domain":"test.com"}'`
6. **Keep all console.log prefixes** as `[ServiceName]` format — e.g. `[EmailVerifier]`, `[PhoneDiscovery]`.
7. **Every function must handle errors gracefully** — return null/empty, never throw.
8. **Commit after each task** with message: `fix(enrichment): TASK-X description`

---

## FILES YOU WILL WORK ON

```
src/services/emailVerifier.ts         — SMTP verification + pattern learning
src/services/phoneDiscovery.ts        — Website scraping + WhatsApp verification  
src/services/socialIntelligence.ts    — Response parsing only (NOT the Gemini prompt)
src/services/transliterationEngine.ts — Arabic name handling
```

**DO NOT TOUCH:**
```
src/services/enrichmentEngine.ts      — Claude owns this
src/services/geminiService.ts         — Harvest service, separate system
server.ts                             — Only Claude modifies API routes
```

---

## TASK 1: Fix LinkedIn Discovery (10% → 60%+)

**File:** `src/services/socialIntelligence.ts`

**Problem:** LinkedIn URLs are found only 10% of the time. The Gemini response often contains LinkedIn URLs but the parser misses them.

**What to do:**
1. In `parseGeminiResponse()`, improve LinkedIn extraction:
   - Search the ENTIRE response text for `linkedin.com/in/` URLs, not just the SUMMARY block
   - Handle URLs that are split across lines or have trailing punctuation
   - Handle both `www.linkedin.com` and `linkedin.com` and `sa.linkedin.com`
2. Add a dedicated LinkedIn search fallback at the end of `mineSocialProfiles()`:
   - If no LinkedIn URL was found from Gemini, do a DuckDuckGo search:
   ```typescript
   const ddgUrl = `https://html.duckduckgo.com/html/?q=site:linkedin.com/in+"${name}"+"${company}"`;
   const res = await fetch(ddgUrl, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(5000) });
   const html = await res.text();
   // Extract first linkedin.com/in/ URL from HTML
   ```
3. Validate extracted LinkedIn URLs: must match pattern `linkedin.com/in/[a-zA-Z0-9-]+`

**Test:** Enrich "Hosam Arab" at "Tabby" — should find his LinkedIn profile.

---

## TASK 2: Add Retry Logic for Gemini Timeouts

**File:** `src/services/socialIntelligence.ts`

**Problem:** 4 out of 48 leads (8%) timed out with empty responses. No retry.

**What to do:**
1. In `mineSocialProfiles()`, wrap the Gemini call in a retry loop:
   - Max 2 retries (3 attempts total)
   - Wait 2 seconds between retries
   - On timeout/empty response, retry
   - On actual error (auth, quota), don't retry
2. Add a timeout to the Gemini call itself:
   ```typescript
   const controller = new AbortController();
   const timeout = setTimeout(() => controller.abort(), 60000); // 60s max
   ```
3. Log retries: `[SocialIntelligence] Retry 1/2 for ${name} at ${company}`

**Test:** Enrich "Nizar Altwaijri" at "STC Pay" — previously timed out, should succeed with retry.

---

## TASK 3: Fix Truncated Domain Validation

**File:** `src/services/emailVerifier.ts`

**Problem:** Some emails have truncated domains: `abdullah.albraikan@retal.com.s` (should be `.sa`), `firstname.lastname@levelshoes.` (incomplete).

**What to do:**
1. In `verifyEmail()`, before SMTP verification, validate the domain part:
   ```typescript
   const domain = email.split('@')[1];
   if (!domain || domain.length < 4 || !domain.includes('.') || domain.endsWith('.')) {
     return { email, valid: false, deliverable: false, catchAll: false, mxProvider: 'other', confidence: 0, source: 'invalid_domain' };
   }
   ```
2. In `findEmailByPermutation()`, skip any permutation where the email after `@` has a truncated TLD (less than 2 chars after the last dot).
3. Also add this check in `socialIntelligence.ts` `parseGeminiResponse()` — if the extracted email has a truncated domain, try to fix it:
   - `.com.s` → `.com.sa`
   - `.co.` → `.com` or discard
   - Ends with `.` → strip trailing dot

**Test:** Enrich "Abdullah AlBraikan" at "Retal" with domain "retal.com.sa" — email should not be truncated.

---

## TASK 4: Fix Phone Number Over-Length

**File:** `src/services/phoneDiscovery.ts`

**Problem:** Some phones come back too long: `+96697144540100` (15 digits instead of 12). The normalizer doesn't reject these.

**What to do:**
1. In `normalizePhoneNumber()`, after all normalization, validate final length:
   ```typescript
   // Saudi numbers: +966 + 9 digits = 13 chars total
   // International: allow up to +XXXXXXXXXXX (max 15 digits per E.164)
   const digits = result.replace(/\D/g, '');
   if (digits.length > 15 || digits.length < 10) {
     return ''; // Invalid, return empty — caller should treat as "not found"
   }
   ```
2. In `discoverPhone()`, if `normalizePhoneNumber()` returns empty string, treat it as no phone found.
3. In `extractSaudiPhones()`, add a post-filter: reject any extracted number that, after normalization, is longer than 13 digits (Saudi) or shorter than 12 digits.

**Test:** Enrich "Mudassir Sheikha" at "Careem" — phone should be valid Saudi format or empty, never 15+ digits.

---

## TASK 5: Improve WhatsApp Detection Rate (27% → 40%+)

**File:** `src/services/phoneDiscovery.ts`

**Problem:** `verifyWhatsApp()` only checks `wa.me/{number}`. Many Saudi businesses use WhatsApp but the wa.me probe returns false.

**What to do:**
1. Improve `verifyWhatsApp()`:
   - Try both formats: `wa.me/966XXXXXXXXX` AND `wa.me/+966XXXXXXXXX`
   - Check for HTTP 302 redirect (means WhatsApp exists) not just 200
   - If wa.me fails, try `api.whatsapp.com/send?phone=966XXXXXXXXX` as fallback
2. In `discoverPhone()`, also search the company website HTML for `wa.me` or `whatsapp.com` links:
   ```typescript
   const waLinks = html.match(/https?:\/\/wa\.me\/\+?\d{10,15}/gi);
   if (waLinks && waLinks.length > 0) {
     // Extract phone from wa.me link — this IS a verified WhatsApp number
     whatsappVerified = true;
   }
   ```
3. Mobile numbers (starting with +966 5X) are more likely WhatsApp than landlines (+966 1X). If phone is mobile, set `whatsappVerified` confidence higher.

**Test:** Enrich "Abdullah Al-Othman" at "Zaahib" — previously got wa=Y, should still work.

---

## TASK 6: Add Enrichment Result Caching to SQLite

**File:** NEW — `src/services/enrichmentCache.ts`

**Problem:** Currently cache is in-memory only. Server restart loses all cached results. Pattern learning is also in-memory.

**What to do:**
1. Create `src/services/enrichmentCache.ts` with:
   ```typescript
   export function initEnrichmentTables(db: any): void
   // Creates enrichment_cache and domain_patterns tables if not exist
   
   export function getCachedResult(db: any, leadId: string): EnrichmentOutput | null
   export function setCachedResult(db: any, leadId: string, result: EnrichmentOutput): void
   export function getDomainPatternFromDb(db: any, domain: string): { pattern: string, mxProvider: string } | null
   export function setDomainPatternInDb(db: any, domain: string, pattern: string, mxProvider: string): void
   ```
2. Use the schema from the design spec:
   ```sql
   CREATE TABLE IF NOT EXISTS enrichment_cache (
     lead_id TEXT PRIMARY KEY,
     email TEXT,
     email_confidence REAL,
     email_source TEXT,
     phone TEXT,
     phone_type TEXT,
     whatsapp_verified INTEGER DEFAULT 0,
     linkedin_url TEXT,
     company_x_handle TEXT,
     company_snapchat TEXT,
     company_tiktok TEXT,
     enriched_at TEXT,
     duration_ms INTEGER
   );
   
   CREATE TABLE IF NOT EXISTS domain_patterns (
     domain TEXT PRIMARY KEY,
     pattern TEXT,
     mx_provider TEXT,
     is_catchall INTEGER DEFAULT 0,
     sample_count INTEGER DEFAULT 0,
     last_verified TEXT
   );
   ```
3. **DO NOT wire this into enrichmentEngine.ts** — just create the service. Claude will wire it.

**Test:** Call `initEnrichmentTables(db)` and verify tables are created.

---

## EXECUTION ORDER

1. Task 3 (truncated domains) — quickest fix, prevents bad data
2. Task 4 (phone length) — quickest fix, prevents bad data
3. Task 1 (LinkedIn) — biggest impact on hit rate
4. Task 2 (retry logic) — reduces errors from 8% to ~2%
5. Task 5 (WhatsApp) — improves detection rate
6. Task 6 (SQLite cache) — persistence layer

---

## VERIFICATION

After ALL tasks, run this stress test:
```bash
TOKEN="9e6914ca4272454202e503463dd9d086f9acc028e548dd78784dcd5a7a0efe71"
for lead in \
  '{"name":"Hosam Arab","company":"Tabby","domain":"tabby.ai"}' \
  '{"name":"Mudassir Sheikha","company":"Careem","domain":"careem.com"}' \
  '{"name":"Abdullah AlBraikan","company":"Retal","domain":"retal.com.sa"}' \
  '{"name":"Faraz Khalid","company":"Noon","domain":"noon.com"}' \
  '{"name":"Ahmad Al-Khowaiter","company":"Saudi Aramco","domain":"aramco.com"}'; do
  echo "---"
  curl -s -X POST http://localhost:3001/api/leads/enrich-v2 \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d "$lead" | python3 -c "import json,sys; d=json.load(sys.stdin); print(f\"{d.get('email','MISS')} | phone={d.get('phone','MISS')} | linkedin={d.get('linkedinUrl','MISS')} | wa={d.get('whatsappVerified')} | {d.get('durationMs',0)}ms\")"
done
```

**Expected results after hardening:**
- All 5 should return email (currently 4/5 do)
- LinkedIn should be found for at least 3/5
- No truncated domains
- No invalid phone numbers
- 0 errors

---

## REBUILD & DEPLOY

After changes:
```bash
cd ~/leadjin/leadjin && docker compose down && docker compose up -d --build
sleep 3 && docker logs leadjin --tail 5
```
