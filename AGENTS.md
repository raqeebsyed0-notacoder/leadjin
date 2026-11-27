# LeadJin — agent contract (verified 2026-11-27)

## What this product is

LeadJin finds and works B2B leads in Saudi Arabia. **Jin is the Hermes agent runtime inside the product**;
Lead Search in the UI and Jin in natural language must call the SAME pipeline, verification and CRM. Never
build a second harvesting path.

## Database facts (re-derive before changing; do not trust older notes)

- Runtime DB: `app/leadjin.db` — 36 tables, `leads` ~335 rows, `intent_signals` 34, `company_cache` 199,
  `users` ~257, `credit_transactions` 272. `sessions`, `verification_records`, `outreach_messages`,
  `lead_replies`, `email_templates` present.
- Original production DB: `/home/euphoria/LEADJIN COMPLETE FOLDER/LEADJIN SEPERATE BUSINESS MODULE/leadjin/leadjin/data/leadjin.db`
  — 37 tables, `leads` 867, `intent_signals` 8,333, `employee_work_log` 922, `users` 3. Reached through
  `app/data/leadjin.db` (symlink, repaired). `src/services/dbTopology.ts` reads both; they are never merged.
- `crm_pipeline`, `companies`, `contacts` tables do NOT exist; pipeline state lives in existing tables.
- `app/data/test-gate1.db` is a test fixture (all zero rows). Never treat it as production.

## API conventions

- Express on `PORT` (default 3001). 149 routes in `server.ts`.
- Harvest: `POST /api/leads/harvest` with `{searchParams:{targetIndustry,userServices,geography[],job_titles[],limit}}`
  → `{leads[], usingPersonalKey, source, engines_used[], errors[], job_id}`; `GET /api/leads/harvest/:job_id`
  returns `{status,produced,engines_used,errors,leads_count}`.
- Discovery waterfall lives in `src/services/leadDiscoveryPipeline.ts`: cache → Places → Wathq → legacy
  engines → local model. A stage that cannot run appends a named line to `errors`; it never returns a silent
  empty array and never invents a lead.
- Places returns name, address, phone, website, place_id only — **no email, no people**.
- Contact harvest (`src/services/contactHarvest.ts`, wired into the pipeline) produces the people rows.
  Public LinkedIn discovery is through indexed search only; **a LinkedIn cookie or logged-in scrape is a
  failure condition, not an option**.

## Agent directives

- Write leads through the API or the DB; always set `company`, `website`, `name`, `title`, `email`, `phone`,
  `linkedin`, `lead_score`, `confidence`, `provenance_url`, and the contact `basis`.
- Never mark a contact verified on one source or on model output alone; verification goes through
  `verification_records` with evidence and timestamp.
- Never send to a `discovered` contact without recorded consent; suppression and unsubscribe are checked on
  every send.
- Do not print, log or commit secrets. `.env` holds keys; report presence only.
