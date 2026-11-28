status: verified 2026-11-28

# Known limitations and owner approvals

## Launch-blocking approvals

- The first live campaign requires counsel sign-off (PDPL reading).
- The owner must accept that the customer is the controller of their data.
- No live send has been turned on.

## Limitations

- Wathq registry path unproven without a consumer key.
- Laya confidence is uncalibrated (needs the LeadJin fine-tune).
- WhatsApp bridge is disconnected (local bridge not configured).
- Test probe users exist in the runtime DB pending owner approval to delete.
- Hunter.io was removed completely (code, env passthrough, docs); contact
  enrichment no longer depends on a paid enrichment key.
- Laya is a decision engine (choice/no-result/score) and is not a language
  model chat.

## Consent and suppression posture

- Every outbound path is gated by `src/services/pdplGate.ts`.
- Bases are `given` (may be mailed) and `found` (research only, no send until
  the person says yes).
- Each basis requires evidence_ref, sender_identity, and an Arabic notice.
- consent_at is persisted; withdraw tombstones the basis and nulls person
  fields.
- The gate is called in front of every send path; `GET /api/pdpl/send-sites`
  lists the live inventory.
- `src/services/suppressionGate.ts` is email-keyed and blocks any address
  with no lead row too.
- Unsubscribe links carry HMAC tokens; do_not_contact is respected.

## Autopilot runway

- Autopilot is first-class and owner-authorized.
- Modules: brainSlot.ts (provider/model slot), memoryTiers.ts (T1 product_memory,
  T2 memory_audit, T3 operator notes with no customer PII), sendingPolicy.ts
  (3-touch cadence, deliverability SPF/DKIM/DMARC pre-send, bounce/complaint
  ceilings), autopilotLoop.ts (tick scheduler, goals), runHistory.ts
  (autopilot_runs + decision_inbox, every row user-scoped), observability.ts
  (cost/latency/engines/failure reasons; a failed stage with no reason is
  refused), pdplGate.ts, companyInterview.ts (5-question card).
- Routes: `POST /api/autopilot/tick`, `GET /api/autopilot/runs`,
  `GET /api/autopilot/runs/:id`, `GET/POST /api/autopilot/decisions(+resolve)`,
  `GET /api/autopilot/brain-slot`, `POST /api/company/interview/{start,answer,card}`.
- Irreversible actions (send, spend, delete) wait in decision_inbox for the
  owner.

## Discovery and contact harvest

- The discovery waterfall (`src/services/leadDiscoveryPipeline.ts`) is cache
  -> Google Places -> Wathq -> legacy engines -> local model.
- Each unavailable stage appends a named error line; a stage never invents a
  lead.
- Google Places returns name/address/phone/website/place_id only; never email
  or people.
- Wathq is optional and keyless-degrading: with no
  `WATHQ_CONSUMER_KEY` the route returns `provenance.verified_real=false` and
  no fabricated data.
- Contact harvest (`src/services/contactHarvest.ts`) is public LinkedIn
  discovery through indexed search only; never a LinkedIn cookie or logged-in
  scrape. Every person row carries a provenance source URL.

## Verification and data governance

- The `verification_records` table carries evidence plus timestamp; model
  output never marks a contact verified.
- Triple-verification logic and email verification are preserved.
- Company intelligence dataset: 6,701 companies, 6,568 commercially cleared
  (CC0/public-domain basis) and 133 research-only.
- Licensing restrictions must be enforced in retrieval, display,
  classification and any training use; research-only rows are never used for
  outreach or training.
- Two databases, never merged: runtime `app/leadjin.db` and the original
  production DB reached through `app/data/leadjin.db` symlink.
