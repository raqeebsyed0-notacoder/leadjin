status: verified 2026-11-28

# LeadJin architecture

## Application shape

The product is an Express + TypeScript server with a React 19 SPA. The server
entry is `app/server.ts`; the SPA is built with Vite into `app/dist`. The app
runs with `tsx server.ts` on `PORT` (default `3001`). `GET /api/health`
returns `status` / `provider` / `db`.

The server exposes roughly 149 API routes. It is session-bearer authenticated;
admin routes require `LEADJIN_ADMIN_SECRET`; every run and decision route is
tenant-scoped.

## Provider

`LEADJIN_PROVIDER` selects `ollama` or `byok`; `LEADJIN_MODEL` picks the
model. The default local path needs no paid key: Ollama at 127.0.0.1:11434
serves `gemma4:e4b`. BYOK and hosted models are optional user enhancements.

## Decision engine

Laya is a separate decision engine service, not a chat model. It answers only
`choice`, `no-result` and `score`. It runs at
`http://127.0.0.1:8020/health` and returns
`{model: convaiinnovations/laya/typed-decisions, device: cuda}`.

## Databases

Two databases, never merged. `src/services/dbTopology.ts` reads both; each
table has one owner.

- Runtime DB: `app/leadjin.db` (read/write).
- Production DB: `app/data/leadjin.db`, a symlink to the original production
  database (read-only).

## Discovery pipeline

`src/services/leadDiscoveryPipeline.ts` is the shared entry point used by
Lead Search and the Jin lane. Cache -> Google Places -> Wathq -> legacy
engines -> local model. Each unavailable stage appends a named error line; a
stage never invents a lead. Places returns name/address/phone/website/
place_id only, never email or people. Wathq is optional and
keyless-degrading: with no `WATHQ_CONSUMER_KEY` the route returns
`provenance.verified_real=false` and no fabricated data.

## Contact harvest

`src/services/contactHarvest.ts` does public LinkedIn discovery through
indexed search only; never a LinkedIn cookie or logged-in scrape. Every person
row carries a provenance source URL.

## Verification

The `verification_records` table carries evidence plus timestamp. Model output
never marks a contact verified. Triple-verification logic and email
verification are preserved and must stay in place.

## Consent and suppression

`src/services/pdplGate.ts` gates every send path. Bases are `given` (may be
mailed) and `found` (research only, no send until the person says yes). Each
basis requires evidence_ref, sender_identity, Arabic notice; consent_at is
persisted; withdraw tombstones the basis and nulls person fields.

`src/services/suppressionGate.ts` is email-keyed suppression_list; it blocks
any address with no lead row too. Unsubscribe links carry HMAC tokens;
do_not_contact is respected.

## Autopilot

Autopilot is first-class and owner-authorized. Modules: brainSlot.ts
(provider/model slot), memoryTiers.ts (T1 product_memory, T2 memory_audit, T3
operator notes with no customer PII), sendingPolicy.ts (3-touch cadence,
deliverability SPF/DKIM/DMARC pre-send, bounce/complaint ceilings),
autopilotLoop.ts (tick scheduler, goals), runHistory.ts (autopilot_runs +
decision_inbox, every row user-scoped), observability.ts (cost/latency/
engines/failure reasons; a failed stage with no reason is refused), pdplGate.ts,
companyInterview.ts (5-question card).

Irreversible actions (send, spend, delete) wait in decision_inbox for the owner.

## Integrations surface

The app wires the following first-class integrations: sequences
(`email_sequences` + `sequence_enrollments`, `/api/sequences*`), campaigns
board (`/api/jin/board`), calendar (`/api/calendar/book`,
`/bookings/:lead_id`, `/events`, `/feed.ics`), WhatsApp status/send through a
local bridge (reports `configured:false` and `bridgeStatus disconnected` when
absent), email templates (`/api/email/templates`), proposals, user branding,
analytics.

## Company intelligence dataset

6,701 companies, 6,568 commercially cleared (CC0/public-domain basis) and 133
research-only. Licensing restrictions must be enforced in retrieval, display,
classification and any training use; research-only rows are never used for
outreach or training.

## Environments

Environment variables are referenced by name only; values are supplied at
deploy time and never committed. Names: LEADJIN_PROVIDER, LEADJIN_MODEL,
LEADJIN_ADMIN_SECRET, DATABASE_PATH, PORT, NODE_ENV, OLLAMA_BASE_URL,
WATHQ_CONSUMER_KEY, GOOGLE_PLACES_API_KEY, SMTP_*, GOOGLE_CLIENT_ID,
GOOGLE_CLIENT_SECRET, MAIL_CRED_KEY, WHATSAPP_*, TINYFISH_*, AGENT_REACH_*.

## Tests

`npm test` (live), `npm run test:isolated` (throwaway DB on port 3456),
`npx tsc --noEmit`, `npm run build`.

## Deployment

Deployed as a systemd user unit `euphoria-leadjin.service`, WorkingDirectory
`/home/euphoria/euphoria-v2/work/leadjin/app` (or the canonical checkout),
`PORT 3001`, `NODE_ENV=production`, `tsx server.ts`. Operated privately on
localhost/tailnet.
