status: verified 2026-11-28

# LeadJin

B2B lead discovery and outreach for Saudi Arabia. Jin is the in-product agent:
natural-language Jin and the Lead Search UI call the same pipeline, verification
and CRM. Laya is a separate decision engine service (choice/no-result/score
only), not a language model chat.

## Repository layout

LeadJin is a single repo with four top-level areas:

| Path | What it is |
|------|------------|
| `app/` | The product: Express + TypeScript server (`server.ts`), React 19 SPA built with Vite into `app/dist`, tests, services. |
| `docs/` | Product and engineering documentation set (architecture, database topology, operations, integrations, known limitations). |
| `extension/` | Browser extension assets. |
| `infra/` | Deployment and infrastructure material (Docker, systemd, PM2). |
| `mobile/` | Mobile shell material. |

Runtime artifacts are not tracked: `node_modules/`, `dist/`, `coverage/`,
`*.db*`, `.env` (only `.env.example` is), `*.bak*`.

## Run the app

```sh
cd app
npm ci
cp .env.example .env          # fill in the values you need
npm run dev                   # tsx server.ts, PORT default 3001
```

Health: `GET /api/health` returns `status` / `provider` / `db`.

## AI provider

Provider is selected by `LEADJIN_PROVIDER` (`ollama` | `byok`) and
`LEADJIN_MODEL`. The local experience needs no paid key: Ollama at
127.0.0.1:11434 serves `gemma4:e4b`. BYOK and hosted models are optional
user enhancements.

## Decisions

Laya runs on `http://127.0.0.1:8020/health` and answers `choice` / `no-result`
/ `score` only. It is not a chat model.

## Databases

Two databases, never merged (`src/services/dbTopology.ts` reads both; each
table has one owner):

| Database | Path / access |
|---|---|
| Runtime | `app/leadjin.db` (read/write) |
| Production | `app/data/leadjin.db` symlink to the original production DB (read-only) |

Runtime table counts: leads 396, users 332, outreach_messages 140,
activity_log 777, intent_signals 34, company_cache 199, credit_transactions
348, sessions 495, verification_records 8, email_templates 1.
Production table counts: leads 867, intent_signals 8333, email_templates 55,
employee_work_log 922, users 3.

## Discovery

Waterfall (`src/services/leadDiscoveryPipeline.ts`): cache -> Google Places
-> Wathq -> legacy engines -> local model. Each unavailable stage appends a
named error line; a stage never invents a lead. Place results are
name/address/phone/website/place_id only; never email or people. Wathq is
optional and keyless-degrading: with no `WATHQ_CONSUMER_KEY` the route returns
`provenance.verified_real=false` and no fabricated data.

Contact harvest (`src/services/contactHarvest.ts`): public LinkedIn discovery
through indexed search only; never a LinkedIn cookie or logged-in scrape. Every
person row carries a provenance source URL.

## Sending and consent

`src/services/pdplGate.ts` gates every send path. Bases are `given` (may be
mailed) and `found` (research only, no send until the person says yes). Each
basis requires evidence_ref, sender_identity, Arabic notice; consent_at is
persisted; withdraw tombstones the basis and nulls person fields.

`src/services/suppressionGate.ts` is email-keyed suppression_list; it blocks
any address with no lead row too. Unsubscribe links carry HMAC tokens;
do_not_contact is respected.

## Autopilot (owner-authorized)

Modules: brainSlot.ts (provider/model slot), memoryTiers.ts (T1 product_memory,
T2 memory_audit, T3 operator notes with no customer PII), sendingPolicy.ts
(3-touch cadence, deliverability SPF/DKIM/DMARC pre-send, bounce/complaint
ceilings), autopilotLoop.ts (tick scheduler, goals), runHistory.ts
(autopilot_runs + decision_inbox, every row user-scoped), observability.ts
(cost/latency/engines/failure reasons; a failed stage with no reason is
refused), pdplGate.ts, companyInterview.ts (5-question card).

Routes: `POST /api/autopilot/tick`, `GET /api/autopilot/runs`,
`GET /api/autopilot/runs/:id`, `GET/POST /api/autopilot/decisions(+resolve)`,
`GET /api/autopilot/brain-slot`, `POST /api/company/interview/{start,answer,card}`.
Irreversible actions (send, spend, delete) wait in decision_inbox for the owner.

## Modules present

Sequences (`email_sequences` + `sequence_enrollments`, `/api/sequences*`),
campaigns board (`/api/jin/board`), calendar (`/api/calendar/book`,
`/bookings/:lead_id`, `/events`, `/feed.ics`), WhatsApp status/send through a
local bridge (reports `configured:false` and `bridgeStatus disconnected` when
absent), email templates (`/api/email/templates`), proposals, user branding,
analytics.

## Auth and deployment

Session bearer tokens; admin routes require `LEADJIN_ADMIN_SECRET`; every
run/decision route is tenant-scoped. Deployed as a systemd user unit
`euphoria-leadjin.service` with WorkingDirectory
`/home/euphoria/euphoria-v2/work/leadjin/app` (or the canonical checkout),
`PORT 3001`, `NODE_ENV=production`, `tsx server.ts`, operated privately on
localhost/tailnet.

## Tests

`npm test` (live), `npm run test:isolated` (throwaway DB on port 3456),
`npx tsc --noEmit`, `npm run build`.
