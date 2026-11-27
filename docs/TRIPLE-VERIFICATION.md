# Triple Verification — what the live code actually does

Node `verify3` (2026-11-27). Scope: the two existing verifier modules, one new
evidence-record module, and this document. `server.ts` was **not** edited.

## Provenance / mapping to ORIG

Both live verifiers were byte-identical to the original module before this
change (`diff -q` against `ORIG/src/services/{jinHandsVerifier,sovereignVerifier}.ts`
returned no output). The three stages below are the ones already in that code,
not new inventions.

| Track | Stage 1 | Stage 2 | Stage 3 | Entry point |
|---|---|---|---|---|
| `jinHandsVerifier.ts` (original "Module 3: Employee's Hands") | email deliverability — real SMTP RCPT handshake against resolved MX | phone/identity — Saudi-format + prefix heuristic, **HLR stub** | regional HQ / registration presence — city-name pattern, **not geocoding or a registry lookup** | `performTripleCheck()` |
| `sovereignVerifier.ts` (original "Sovereign Verifier") | email deliverability — real SMTP RCPT handshake against resolved MX | phone/identity — Saudi-format validation, **HLR stub** | social cross-reference — real public LinkedIn page fetch + name/company match | `tripleVerify()` (imported by `server.ts:40`, `crm-hub.ts:10`, `intelligenceHub.ts:1160`) |

The brief's phrase "regional HQ / registration presence" maps to the first
track's stage 3. The second track's stage 3 is LinkedIn; both are preserved,
neither was merged into the other.

## Sources and evidence per stage

| Stage | Method | Real evidence that permits `verified` | Otherwise |
|---|---|---|---|
| Email (`email_smtp`) | `SMTP_HANDSHAKE` | MX resolution plus an SMTP `RCPT TO` **250** response. `251` (forwarded) → `catch_all`; `550/551/552` → `invalid`; `4xx` → `risky`; syntax/no MX/timeout/error/rate-limit → `unverified` with reason. No message is sent. | `unverified` + reason (`no_mx_records`, `smtp_timeout`, `smtp_rate_limited`, …) |
| Phone (`phone_hlr`) | `HLR_STYLE_LOOKUP` | A real HLR provider response. **None is configured** in this repo. | `unverified`, reason `hlr_lookup_not_configured`, `reachable=false`, `confidence=0`. Prefix/carrier values are enrichment guesses only. Invalid format → `invalid`, reason `phone_format_invalid`. |
| Regional HQ (`regional_hq`, jinHands only) | `REGIONAL_HQ_PATTERN` | A real geocoding/registry lookup. **Not implemented here.** | `unverified`, reason `regional_hq_lookup_not_configured` (or `regional_city_not_recognized`); `verifiedAddress=false` even when the city string matches. |
| Social (`linkedin_crossref`, sovereign only) | `LINKEDIN_PUBLIC_PAGE` | A real fetched public page whose extracted name/company match the expected identity. | `unverified` (`linkedin_no_expected_identity`, HTTP error, fetch error) or `invalid` (`linkedin_url_invalid`, `linkedin_identity_mismatch`). A model's own assertion is never evidence. |

## Status vocabulary (six values, never a boolean)

`verified`, `partially_verified`, `risky`, `catch_all`, `invalid`, `unverified`.
Defined once in `verificationRecord.ts` (`VERIFICATION_STATUSES`) and used by
both verifiers. The old boolean-ish `partial`/`failed`/`format_valid` values are
gone. `confidence` is 0–100 and is derived from the stage status; a stubbed
stage carries 0.

## Disagreement rule

`WEAKEST_FIRST` in `verificationRecord.ts` orders conclusive statuses from
weakest to strongest:

```
invalid < risky < catch_all < partially_verified < verified
```

`overallStatus(stages)` applies it:

1. Drop `unverified` stages (they are *no answer*, not a weak positive).
2. If nothing conclusive remains → overall `unverified`.
3. Otherwise the weakest conclusive stage wins, e.g. `verified` + `catch_all`
   → `catch_all`; `verified` + `invalid` → `invalid`.
4. If any stage is `unverified` (stub, skipped input, no provider) it caps the
   overall verdict at `partially_verified`: `verified` + `hlr_lookup_not_configured`
   → `partially_verified`. A weaker conclusive stage (`invalid`, `risky`,
   `catch_all`) still wins over the cap.

Every stage result, including skipped ones, is stored with its own `status` and
`reason`; the `overall` row stores the same list plus the chosen reason.

## Storage

`verificationRecord.ts` creates on first use (additive, `CREATE TABLE IF NOT EXISTS`):

```
verification_records(id, lead_id, email, stage, method, status, confidence,
                     evidence_json, source_url, checked_at, reason)
```

* `recordVerification(db, rec)` inserts one row; `getVerification(db, lead_id)`
  returns all rows for a lead. Neither throws — a DB failure degrades to
  `null`/`[]`, never to a false `verified`.
* `performTripleCheck(...)` already had an optional `db` as its last argument
  and now writes three stage rows + one `overall` row on **every** call.
* `tripleVerify(lead, db?, leadId?)` gained optional `db` (and `leadId`) so
  existing one-argument callers keep working. It writes the same four rows.
* When no `db` is injected, `verificationRecord.ts` uses `setVerificationDb()`
  if a boot path set it, otherwise opens `process.env.LEADJIN_DB_PATH` or
  `./leadjin.db` (app cwd for the live service). If none exists it records
  nothing and still returns an honest result. Explicit `db` always wins.
* This is separate from the older `verification_proof` ledger in
  `jinLedger.ts`; that table only receives a proof when a real SMTP response
  backs the claim.

## Honest limitations

* **Phone HLR is a stub in both tracks.** No provider key/client exists; do not
  treat `valid` or a carrier guess as verification. To make it real, integrate
  a licensed HLR API (e.g. Twilio Lookup) and only then set `verified` from its
  response, recording the provider and response in `evidence_json`.
* **Regional HQ is a city-name pattern match only.** To make it real, wire a
  Google Places / Saudi commercial-registry lookup and require a real response
  plus a `source_url` before `verified`.
* **SMTP RCPT probing is inconclusive on many providers** (554/450, greylisting,
  catch-all domains); those cases now report `risky`/`unverified`, not success.
* **The live callers (`server.ts`, `crm-hub.ts`, `intelligenceHub.ts`) still pass
  no `db`.** Persistence relies on the safe-default DB resolution above. A
  future lane may inject the request DB explicitly; no route change was needed
  in this wave, so no patch is pending for `server.ts`.
* `validateSaudiPhone()` had an off-by-one prefix check (it compared a 2-digit
  `'05'` against a list of 3-digit `'050'…'059'` values), so every Saudi mobile
  was rejected. It now compares `0` + the first two of the nine national digits.
  This is a fix to the existing format check, not a new stage; the HLR stage
  remains a stub and still returns `unverified`.
* The email ladder in `emailVerifier.ts` uses its own rung vocabulary
  (`invalid_syntax → unverified → mx_ok → probable → verified`); it is a
  separate mechanism and was not modified in this scope.
