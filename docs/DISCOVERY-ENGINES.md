# DISCOVERY-ENGINES.md

Full discovery architecture for LeadJin as it exists after Phase 3 (`lj-p3a`).
Every leg is optional; none is mandatory. The shared pipeline (`runLeadDiscovery`)
is the single entry point used by Lead Search and the Jin lane.

## 1. The shared waterfall

```
a. pre-crawl cache      (no credential) — getCachedLeadsForHarvest
b. Places discovery     (GOOGLE_PLACES_API_KEY) — discoverCompaniesViaPlaces
c. Wathq enrichment     (WATHQ_CONSUMER_KEY + known CRs) — fetchWathqLead
d. Legacy engines       (optional adapters) — jobspy/kimi/crawl4ai
e. Model discovery      (mandatory, always last) — geminiService + local Ollama
f. Assemble             dedupe → verify → tag source_engine / verified_real / ...
```

- **a. cache**: SMPT-verified, unverified-crawled, pattern-guessed, company-only rows
  from `person_cache`/`company_cache`, geo-filtered, deduped. No credential. Always
  runs; cheapest tier.
- **b. Places**: `discoverCompaniesViaPlaces(sector, geo, count)` → Google Places
  legacy text search + `getPlaceDetails` → `{name, domain}` candidates.
- **c. Wathq**: `fetchWathqLead(cr)` per known CR → company + decision makers +
  contact enrichment. Needs `WATHQ_CONSUMER_KEY` and known CRs to do anything.
- **d. Legacy engines** (this node): jobspy / kimi / crawl4ai, optional adapters,
  measured availability, degrading cleanly (see §3).
- **e. Model**: `generateLeadjinLeads(mapped)` — Phase 1 grounding attempt →
  fallback to model knowledge → structured JSON → quality filter → GSSE metadata.
  **Mandatory and always last.** With `LEADJIN_PROVIDER=ollama` (default) the local
  `gemma4:e4b` writer is the always-available path; no paid API, no hosted model.
- **f. Assemble**: dedupe by domain → email → (name+company); tag each lead with
  `source_engine`, `provenance_url`, `verified_real`, `confidence`, `discovered_at`.

## 2. Each leg — what it needs, real status today

| Leg | Needs | Real status today (measured) | Rule |
|---|---|---|---|
| cache | none | Runs; 3 rows on the live DB | never mandatory |
| Places | `GOOGLE_PLACES_API_KEY` | skipped if key absent (`places: skipped ...`) | never mandatory |
| Wathq | `WATHQ_CONSUMER_KEY` + known `crs` | skipped if no CRs (`wathq: skipped (no CRs supplied ...)`) | never mandatory |
| JobSpy | python `jobspy` + host-side engine svc (`/jobspy`) | **unavailable** (python3 jobspy import failed on this host) | degrade cleanly |
| Kimi | `kimi` CLI binary + host-side `leadjin-kimi-discovery-svc` (`/discover`) | **unavailable** (no kimi binary on PATH) | degrade cleanly |
| Crawl4AI | host-side `leadjin-engines-svc` (`/crawl4ai`) | **unavailable** (no service reachable) | degrade cleanly |
| Model | local `ollama` + `gemma4:e4b` (ORIG default) | **available** (local writer always-on) | last stage, always runs |

Status measurement: `cd app && npx tsx -e "import { engineAvailability } from .../legacyEngines.js; engineAvailability().then(p=>console.log(JSON.stringify(p)))"`.

The ORIG discovery engines that powered this before migration are preserved
byte-identically in `preserved-orig-only/` (sha256 in that README.md) and re-wired
here as optional adapters in `legacyEngines.ts` — they run only when the measured
probe says the real backend is present, and every run-time failure degrades into
`errors` instead of throwing the harvest.

## 3. Legacy engines — preserved originals, optional adapters

The ORIG discovery engines were never committed or migrated:

- ORIG wiring: `server.ts:1967-1993` (engine=all/kimi/crawl4ai/jobspy fan-out),
  `:2228-2267`, `:32-33`, `:7073`, `:7269`.

They are preserved verbatim in `preserved-orig-only/` (sha256 above) and re-wired
as optional adapters in `app/src/services/legacyEngines.ts`:

- `engineAvailability(): Promise<{engine, available, reason}[]>` — probes the REAL
  backend only: `python3 -c "import jobspy"` (jobspy), `command -v kimi` + `kimi
  --version` (kimi), HTTP GET of the crawl4ai route (crawl4ai). A probe failure
  is `available:false` with the measured reason.
- `runLegacyEngine(engine, query, limit): Promise<{leads, error}>` — when the probe
  passes, runs the real backend and normalises rows to the pipeline lead shape
  (sets `source_engine`, drops ORIG-only fields, `verified_real=0` until the
  assembler verifies). When unavailable, returns `{leads: [], error: "<engine>
  backend not available: <reason>"}` — never a mocked lead. Run-time backend
  errors are reported instead of thrown.

Registration in `leadDiscoveryPipeline.ts` (stage `d`, between Wathq and the
mandatory model stage): iterate `engineAvailability()`, run each available engine
via `runLegacyEngine`, push rows and `engines_used`; record errors. The waterfall
order stays **cache → Places → Wathq → legacy engines → model (guaranteed last)**.

## 4. campaignOrchestrator / gmailPoller / ApprovalQueue — preserved, NOT re-enabled

The ORIG `campaignOrchestrator.ts` (autonomous Jin orchestrator), `gmailPoller.ts`
(inbound reply ingestion) and `ApprovalQueue.tsx` (human approve/reject/book
surface) were wired into ORIG and never migrated. They are:

- **preserved verbatim** in `preserved-orig-only/` (sha256 in README.md);
- **not re-enabled**: they are an autonomous sender (orchestrator) and a human
  approval surface (poller + queue). Re-enabling them is an **owner decision,
  not a default** — they are gated behind env flags (`JIN_ORCHESTRATOR_ENABLED`,
  `JIN_REPLY_POLLER_ENABLED`) and never send without a human approve.
- Also in scope, also preserved: `scripts/seed_approvals_test.cjs`, `shot_approvals.py`
  (redacted token), `crawl-phases.sh`, `stress-test.sh` (redacted tokens).

## 5. Agent-side discovery (already wired, optional enrichments)

- **TinyFish** — agent-side web research; domain/date/language/purpose filters.
- **Agent-Reach** — outbound outreach tooling for the pipeline.
- **Places wiring skill** — Google Places integration for the Places leg.
- All three are enrichments; they do not gate the shared pipeline.

## 6. Verification (quote the real output)

- Preserved files byte-identical to ORIG (7 sources) + 3 scripts token-redacted:
  `diff -q <ORIG>/<file> <preserved>/<file>` → identical.
- sha256s above (fifteen files incl. README).
- `engineAvailability()` → all three legacy engines `available:false` on this host
  with measured reasons (no jobspy python pkg, no kimi binary, no crawl4ai service).
- Pipeline probe end to end: `npx tsx scripts/phase3-probe-harvest.mjs` → engines_used
  `["cache","places"]`, `errors` names skipped/unaffected legs, real leads printed.
- `tsc --noEmit` → 0 new errors in my files; pre-existing errors only in untouched
  files (`jinCompleteRoutes.ts` ×2). Service health 200 after
  `systemctl --user restart euphoria-leadjin.service`.
- `runLegacyEngine` never returns mocked leads: an unavailable probe yields
  `{leads: [], error: "<engine> backend not available: <reason>"}`.
