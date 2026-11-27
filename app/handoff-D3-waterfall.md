# D3 Waterfall Refactor — Handoff

**Task:** t_97673260  
**Date:** 2026-10-20  
**Worker:** wright (poolside/laguna-s-2.1:free, Nous free lane)  

## Summary

Apollo.io and Snov.io enrichment providers have been gated behind a testing-only
flag (`LEADJIN_TESTING_MODE`) with a per-day API call cap (`LEADJIN_TESTING_CAP`,
default 20). The dead `hunter` reference in `verifyEmail` was removed — SMTP
built-in is the sole email verifier in both prod and testing paths.

Production runs on the model key (GEMINI_API_KEY) + SMTP verify alone. No
Apollo/Snov/Hunter required.

## Files Changed

| File | Change |
|------|--------|
| `src/services/waterfallEnrichment.ts` | D3 testing-only gate + cap enforcement on Apollo/Snov + dead hunter removal |
| `.env.example` | Documented `LEADJIN_TESTING_MODE`, `LEADJIN_TESTING_CAP`, `APOLLO_API_KEY`, `SNOV_API_KEY`, `SNOV_API_SECRET` |

## Detailed Changes — waterfallEnrichment.ts

### 1. Header comment (lines ~10–30)

**Before:**
```
 * Providers:
 *   1. Gemini Grounding  (GEMINI_API_KEY)
 *   2. Apollo.io          (APOLLO_API_KEY)
 *   3. Snov.io            (SNOV_API_KEY + SNOV_API_SECRET)
 *   4. SMTP MX verifier
 * Hunter.io has been replaced by Gemini Grounding (2026-06-02).
```

**After:**
```
 * Providers:
 *   1. Gemini Grounding  (GEMINI_API_KEY)
 *   2. Apollo.io          (APOLLO_API_KEY)    [testing-only, behind LEADJIN_TESTING_MODE]
 *   3. Snov.io            (SNOV_API_KEY + SNOV_API_SECRET)  [testing-only, behind LEADJIN_TESTING_MODE]
 *   4. SMTP MX verifier
 * Hunter.io has been replaced by Gemini Grounding (2026-06-02). Hunter is never
 * used as a verification leg — SMTP built-in is the sole verifier.
 *
 * D3 (2026-10-20): Apollo and Snov are testing-only legs. They are instantiated
 * only when LEADJIN_TESTING_MODE is set. Each testing-provider API call is counted
 * against a per-day cap (LEADJIN_TESTING_CAP, default 20). Production runs on the
 * model key (GEMINI_API_KEY) + SMTP verify alone — no Apollo/Snov/Hunter required.
```

### 2. Testing-only gate section (lines ~130–190)

**Added** — module-level constants and exported functions:

```typescript
const TESTING_MODE = process.env.LEADJIN_TESTING_MODE === '1' || process.env.LEADJIN_TESTING_MODE === 'true';
const TESTING_DAILY_CAP = parseInt(process.env.LEADJIN_TESTING_CAP ?? '20', 10);
const TESTING_WINDOW_MS = 24 * 60 * 60 * 1000; // 24h UTC day

let testingLedger: TestingLedger = { day: <UTC YYYY-MM-DD>, calls: 0 };

export function testingCallAllowed(): boolean  // checks cap
export function recordTestingCall(): void       // increments counter
export function getTestingLedger(): { day, calls, cap, remaining }  // debug/admin
```

- `testingLedger` is reset at UTC day rollover via `_resetTestingLedgerIfRolled()`.
- All three functions are **exported** for admin/stats endpoint access.

### 3. Constructor (WaterfallEnrichment, ~line 631)

**Before:**
```typescript
constructor() {
  const gemini = new GeminiProvider();
  this.providers = [gemini, new SmtpBuiltinProvider()]
    .sort((a, b) => a.priority - b.priority);
}
```

**After:**
```typescript
constructor() {
  const gemini = new GeminiProvider();
  const providers: EnrichmentProvider[] = [gemini];

  if (TESTING_MODE) {
    // Only when LEADJIN_TESTING_MODE=1
    const apollo = new ApolloProvider();
    const snov = new SnovProvider();
    if (apollo.isConfigured()) providers.push(apollo);
    if (snov.isConfigured()) providers.push(snov);
  }

  providers.push(new SmtpBuiltinProvider());
  this.providers = providers.sort((a, b) => a.priority - b.priority);
}
```

### 4. ApolloProvider.matchPerson() (~line 426)

**Added** at top of method:
```typescript
if (!testingCallAllowed()) return null;
recordTestingCall();
```

### 5. SnovProvider.findEmail() (~line 553)

**Added** at top of method:
```typescript
if (!testingCallAllowed()) return null;
recordTestingCall();
```

### 6. verifyEmail() (~line 744)

**Before:**
```typescript
const hunterProvider = this.providers.find(p => p.name === 'hunter' && p.isConfigured());
const smtpProvider = this.providers.find(p => p.name === 'smtp_builtin')!;
const verifier = hunterProvider ?? smtpProvider;
const result = await verifier.verifyEmail(email);
```

**After:**
```typescript
// Step 3: SMTP built-in verification (sole verifier — Hunter replaced by Gemini)
const smtpProvider = this.providers.find(p => p.name === 'smtp_builtin')!;
const result = await smtpProvider.verifyEmail(email);
console.log(`[Waterfall] verifyEmail — ${smtpProvider.name}: deliverable=${result.deliverable}`);
```

## Before / After Behavior

| Scenario | Before | After |
|----------|--------|-------|
| No testing env vars | Gemini + SMTP only (Apollo/Snov never instantiated) | Same — Gemini + SMTP only |
| `LEADJIN_TESTING_MODE=1` | Apollo/Snov not available | Apollo + Snov instantiated (if keys configured), each call capped at `LEADJIN_TESTING_CAP` (default 20) |
| `LEADJIN_TESTING_MODE=1`, cap reached | N/A | Apollo/Snov calls return `null` (skip), SMTP verify still works |
| `LEADJIN_TESTING_CAP=10` | N/A | Per-day cap overridden to 10 |
| `verifyEmail()` | Dead `hunter` reference (always fell back to SMTP) | Direct SMTP built-in call — no dead code |

## Verification Evidence

1. **TypeScript compilation:** `npx tsc --noEmit` → exit code 0 (no errors)
2. **Gate logic unit tests:** 6/6 passed
   - allows exactly 20 calls then blocks 21st
   - ledger tracks calls and remaining correctly
   - respects LEADJIN_TESTING_CAP override (cap=5)
   - TESTING_MODE falsy when env var unset (prod path)
   - TESTING_MODE true only when LEADJIN_TESTING_MODE=1
   - TESTING_MODE false when LEADJIN_TESTING_MODE=0
3. **No key literals:** grep for `sk-[a-z0-9]` in changed files → no matches
4. **No hunter refs:** grep for `hunter` in waterfallEnrichment.ts → no matches (removed)
5. **Exports verified:** `testingCallAllowed`, `recordTestingCall`, `getTestingLedger`, `WaterfallEnrichment` all exported

## Env Vars

| Variable | Default | Purpose |
|----------|---------|---------|
| `LEADJIN_TESTING_MODE` | unset (OFF) | Set to `1` or `true` to enable Apollo/Snov testing-only legs |
| `LEADJIN_TESTING_CAP` | `20` | Per-day cap on testing-only provider API calls (UTC day) |
| `APOLLO_API_KEY` | unset | Apollo.io API key (testing-only) |
| `SNOV_API_KEY` | unset | Snov.io API key (testing-only) |
| `SNOV_API_SECRET` | unset | Snov.io API secret (testing-only) |
