# LeadJin — Regional Intelligence Platform (KSA)

B2B lead generation for the Saudi market: find a company, harvest its people, verify them, work them
through a pipeline, write to them lawfully, and report on it. **Jin** is the AI employee that runs the
lifecycle, and **Jin is the Hermes agent runtime** — skills, tools, memory, scheduling and delegated jobs —
not a chat wrapper.

Two entry points, one engine: **Lead Search** in the UI, and **Jin in natural language**. Both call the same
`runLeadDiscovery` pipeline, the same verification and the same CRM. There is no second harvesting system.

> **Status (2026-11-27): running locally, pilot.** Service `euphoria-leadjin.service` on port 3001, health
> `ok`, SQLite connected, local model `gemma4:e4b` via Ollama, Laya decision service on port 8020.
> Harvest is live and returns leads. Not yet a production deployment.

## The loop

Discover → **harvest the people** → enrich → triple-verify → score (Laya) → record (CRM, pipeline,
activity log) → prepare outreach and proposals → schedule the three-touch cadence → report → learn the ICP
from accept/reject.

## Components and their real roles

| Piece | What it is | Where |
|---|---|---|
| **Jin** | The Hermes agent runtime embedded in the product; same identity whether the owner types in the UI or talks to Jin | `.hermes/profiles/leadjin/` (`SOUL.md`, `AGENTS.md`), `src/services/jinRoutes.ts` |
| **Generative brain** | Local `gemma4:e4b` over Ollama by default; a hosted model may be supplied by the owner | `src/services/genaiClient.ts`, `LEADJIN_PROVIDER` / `LEADJIN_MODEL` |
| **Laya** | Open-source non-autoregressive decision model (Convai Innovations) for structured choices — not a chat model, not Gemma | `src/services/layaDecision.ts`, `laya-decide.service`, `docs/LAYA.md` |
| **Company dataset** | 6,701 records; 6,568 CC0-cleared, 133 research-only with licence restrictions | `src/services/companyDataset.ts`, `docs/COMPANY-DATASET.md` |
| **Two databases** | Original production history (867 leads, 8,333 signals, 922 work-log rows, 3 users) and the migrated generation (335 leads, 34 signals, mail accounts). Both retained, joined by the topology service, never merged | `src/services/dbTopology.ts`, `docs/DB-TOPOLOGY.md` |

## Discovery and contact harvest

Waterfall: cache → Google Places (key present; returns name, address, phone, website, place_id — **no
email, no people**) → Wathq (optional, needs known CRs) → preserved legacy engines (June five-engine line)
→ local model. People are found by the contact-harvest leg: site team/contact pages, social bios, Hunter
domain search, and public LinkedIn profiles through indexed search — **never a LinkedIn cookie or a
logged-in session** — then MX/SMTP verification. Every field keeps its source URL and timestamp.
See `docs/LEAD-DISCOVERY.md`, `docs/DISCOVERY-ENGINES.md`, `docs/TRIPLE-VERIFICATION.md`.

## Sending rules (launch-blocking)

- Every contact carries a `basis`: `card`, `inbound`, `event`, `opt_in`, `customer`, or `discovered`, plus
  `consent_at`. A `discovered` contact cannot enter a sequence without recorded consent.
- Cadence for a discovered contact is exactly three emails: day 0 intro with no pitch, day 3 follow-up,
  day 7 polite close. Never a fourth.
- Every message carries real sender identity (name, company, CR number) and a working opt-out; a refusal
  suppresses the address permanently. Suppression and unsubscribe are enforced at every send site.
- Sources and reasoning: `../../audit/leadjin-phase3-2026-11-27/RESEARCH-AUTOPILOT-V1.md` and
  `DECISIONS.md` in the same folder. This is a reading of the PDPL, not legal advice; counsel signs off
  before the first live campaign.

## Repository layout

```
app/                  the runnable application (Express + React 19 + Vite, single server.ts entry)
  src/services/       discovery, harvest, verification, enrichment, CRM, email, proposals, Laya, dataset
  docs/               LAYA, DB-TOPOLOGY, COMPANY-DATASET, LEAD-DISCOVERY, TRIPLE-VERIFICATION, EMAIL-SAFETY
  scripts/            build, crawl, seeding and acceptance probes
  tests/              Vitest suites (they expect the API on :3001)
laya_setup/           Laya download, service wrapper, probes, Kaggle fine-tune staging
docs/ , infra/ , mobile/ , extension/   system spec, deployment, shells
```

## Running locally

```bash
cd app
npm ci
cp .env.example .env          # fill only what you need; every key is optional except the DB path
npm run dev                   # Express on :3001
```

Gates: `npx tsc --noEmit` → 0; `curl -s http://127.0.0.1:3001/api/health` → `"status":"ok"`;
`bash ../../audit/leadjin-phase3-2026-11-27/retest_harvest_persist.sh` → `health=200` and a positive delta.

## Configuration

Environment-driven; no credentials in this repository. The ones that matter:
`PORT`, `DATABASE_PATH`, `LEADJIN_PROVIDER` (`ollama`|`byok`), `LEADJIN_MODEL`, `SMTP_*`,
`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` (Gmail + Calendar), `GOOGLE_PLACES_API_KEY` (optional enhancer),
`WATHQ_API_KEY` (optional, own-business use only), `HUNTER_API_KEY` (optional), `WHATSAPP_TOKEN`/
`WHATSAPP_PHONE_ID`, `LEADJIN_ADMIN_SECRET`. **No key is mandatory for the local-model experience.**

## What this repository is not

- It does not contain the production database, credentials or customer data.
- It is not the deployment target; deployment config lives in `infra/`.
- Internal operational notes stay out of it.

## Licence

Not yet set by the owner. Until a licence is added, all rights are reserved.
