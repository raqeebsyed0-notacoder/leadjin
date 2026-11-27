# LEAD-DISCOVERY.md

## 1. The shared lead-discovery pipeline

Lead Search (`POST /api/leads/harvest`) used to call a stub
(`generateLeadjinLeads` in `src/services/leadService.js` returning `[]`) while
the real implementation lived in `src/services/geminiService.ts:100`. The stub
was shadowing the real implementation, so the UI harvested nothing.

One pipeline now owns the entire harvest. The entry point is
`runLeadDiscovery(input)` in `src/services/leadDiscoveryPipeline.ts`, and the
Harvest API delegates to it:

```ts
// src/services/leadService.js
export async function generateLeadjinLeads(params) {
  const input = { /* mapped from the harvest request */ };
  const result = await runLeadDiscovery(input);
  return result.leads;
}
```

### Ordered waterfall

| Stage | What it does | Credential required | What happens without it |
|---|---|---|---|
| **a. pre-crawl cache** | `getCachedLeadsForHarvest(db, params)` — SMPT-verified, unverified-crawled, pattern-guessed, company-only rows from `person_cache`/`company_cache`, geo-filtered, deduped | none | Runs and returns whatever the pre-crawl crawl stored. It is the cheapest tier and is never an error. |
| **b. Places** | `discoverCompaniesViaPlaces(sector, geo, count)` → `searchPlaces` (Google Places legacy text search) → `getPlaceDetails` → `{ name, domain }` candidates | `GOOGLE_PLACES_API_KEY` | Skipped cleanly: `places: skipped (GOOGLE_PLACES_API_KEY not set)`. |
| **c. Wathq** | `fetchWathqLead(cr)` per known CR → company + decision makers + contact enrichment | `WATHQ_CONSUMER_KEY` and known CRs | Skipped cleanly: `wathq: skipped (WATHQ_CONSUMER_KEY not set)` or `wathq: skipped (no CRs supplied ...)`. |
| **d. model-driven discovery** | `geminiService.generateLeadjinLeads(mapped)` — Phase 1 grounding attempt → fallback to model knowledge → structured JSON → quality filter → GSSE metadata | none (mandatory) | Always runs. With `LEADJIN_PROVIDER=ollama` the local `gemma4:e4b` writer is the always-available path — no paid API, no hosted model. |
| **e. assemble** | dedupe by domain → email → (name+company); tag each lead with `source_engine`, `provenance_url`, `verified_real`, `confidence`, `discovered_at` | none | Rows that carry no independent evidence get `verified_real: 0` and are surfaced as a typed `model:` error instead of being shipped as leads. |

### Assembly rules

- **One lead shape** for every stage: `{ source_engine, company, website, name, title, email, phone, linkedin, industry, lead_score, confidence, verified_real, provenance_url, discovered_at, raw }`.
- **Dedupe** by `domain → email → (name + company)`. The first stage to produce a row wins, so the cache tier is the primary key and the model leg surfaces the rest.
- **verified_real** (`0 | 1`): `1` only when an independent verifier found evidence — SMTP-verified cache rows (`email_verified=1`), or the live DNS/MX check that the pipeline runs over every model-derived website (the only free verifier available offline). Everything else is `0`.
- **confidence** (`high | medium | low`): cache rows score by email verification level; model rows use the model's own `confidence`, else `low`.
- **provenance_url**: only the Wathq leg carries one (`wathq.provenance.api`). Cache/model/Places rows get `null` until an independent verifier records a URL.

## 2. Credential matrix (what each stage needs, what falls back)

| Credential | Stage | Without it |
|---|---|---|
| (none) | cache, model, assemble | cache returns stored rows; model runs the local writer; nothing is an error |
| `GOOGLE_PLACES_API_KEY` | Places | `places: skipped (GOOGLE_PLACES_API_KEY not set)` |
| `WATHQ_CONSUMER_KEY` + known `crs` | Wathq | `wathq: skipped (...)` |
| `LEADJIN_PROVIDER=ollama` (default) | model leg | local `http://localhost:11434` writer `gemma4:e4b` |
| (paid keys) | — | deliberately not required for basic discovery |

The design rule: **basic discovery must work with no paid API and no hosted
model.** The local Ollama writer is the always-available path; the paid legs
(Google Places, Wathq, cloud Gemini) are optional enrichments that degrade
gracefully.

## 3. Why cache / Places / Wathq / model are one pipeline

- **One source of truth for the merge.** Cache, Places, Wathq and model outputs
  each use different shapes. One assembler normalises them to a single lead
  shape, so adding, removing or reordering a stage never changes the response
  contract of the Harvest endpoint.
- **One dedupe key.** `domain → email → (name + company)` is applied once, so a
  cached lead and a model lead for the same company never appear twice, and the
  quality tag (`verified_real`) follows the row instead of being recomputed per
  stage.
- **One place to report a failure.** Every stage's error (or graceful skip) lands
  in the same `errors` array with the stage name, and `leadService.js` never
  returns a bare empty array — every result carries an `errors` entry naming
  exactly which stages ran and why each produced nothing.
- **The same function serves Lead Search and Jin.** `runLeadDiscovery` is the
  single entry point; the UI and the Jin lane both import it. No second
  harvesting system is built.

## 4. Jin entry point

```ts
import { runLeadDiscovery, STAGE_CACHE, STAGE_PLACES, STAGE_WATHQ, STAGE_MODEL } from "../src/services/leadDiscoveryPipeline.js";

// runLeadDiscovery(input, injectedDb?) → Promise<{ engines_used, errors, leads }>
const result = await runLeadDiscovery({
  targetIndustry: "real estate",
  userServices: "CRM automation",
  geography: ["Riyadh"],
  job_titles: ["CEO"],
  limit: 3,
  // optional: injectedDb — omit to let the pipeline open DATABASE_PATH/DB_PATH
});
```

- `injectedDb?: Database` — pass the app's `better-sqlite3` handle when running
  inside the server; omit it for a standalone probe (the pipeline opens the DB
  from `DATABASE_PATH` / `DB_PATH` / `leadjin.db`).
- The probe under `scripts/phase3-probe-harvest.mjs` exercises exactly this
  entry with the live local writer and prints `{ engines_used, errors, leads }`.

## 5. Verification

- `npx tsc --noEmit` — no new errors (4 pre-existing `userApiKey: ***` syntax
  placeholders in `server.ts` are unchanged).
- `npx tsx scripts/phase3-probe-harvest.mjs` — the probe prints the JSON shape
  above: real leads (local-model discovery with zero paid keys) or a typed,
  honest error naming each stage's failure.
- `curl -s http://127.0.0.1:3001/api/health` → `{"status":"ok",...}` after the
  service restart.
- `curl -s -X POST http://127.0.0.1:3001/api/hunt-orchestrate -H
  'content-type: application/json' -d '{"sector":"fintech","geo":"Riyadh","count":2}'`
  — 401 without a token (record it; 401 is auth, not a feature failure).
- `grep -n "return \[\]" src/services/leadService.js` — no bare empty return:
  every path has an `errors` entry.
