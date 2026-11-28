status: verified 2026-11-28

# Integrations

## Decision engine: Laya

Laya is a separate decision engine service, not a language model chat. It
answers only `choice`, `no-result` and `score`.

Endpoint: `http://127.0.0.1:8020/health` returns
`{model: convaiinnovations/laya/typed-decisions, device: cuda}`.

## Discovery legs

- Google Places: `GOOGLE_PLACES_API_KEY`, optional. Returns
  name/address/phone/website/place_id only, never email or people.
- Wathq: `WATHQ_CONSUMER_KEY` plus known CRs. Optional and
  keyless-degrading: with no key the route returns
  `provenance.verified_real=false` and no fabricated data.
- Legacy engines: optional adapters for jobspy/kimi/crawl4ai; degrade cleanly.

## Contact harvest

`src/services/contactHarvest.ts` performs public LinkedIn discovery through
indexed search only. Never a LinkedIn cookie or logged-in scrape. Every
person row carries a provenance source URL.

## Hunter.io

Hunter.io was removed completely: code, env passthrough, and docs. Contact
enrichment no longer depends on a paid enrichment key.

## WhatsApp

WhatsApp status/send runs through a local bridge. When absent the app reports
`configured:false` and `bridgeStatus disconnected`.

## Calendar

`/api/calendar/book`, `/bookings/:lead_id`, `/events`, `/feed.ics` implement
calendar booking and a feed.

## Campaigns board

`/api/jin/board` is the campaigns board.

## Sequences

`email_sequences` + `sequence_enrollments` tables back
`/api/sequences*`.

## Prospects, branding and analytics

Proposals, user branding, and analytics are first-class modules in the
application.

## Agent-side research

`TINYFISH_*` and `AGENT_REACH_*` keys enable agent-side web research and
outbound outreach tooling.

## Consent notice

Every contact carries a basis (`given` or `found`) with evidence_ref,
sender_identity, and Arabic notice; consent_at is persisted; withdraw
tombstones the basis and nulls person fields. The gate is called in front of
every send path.
