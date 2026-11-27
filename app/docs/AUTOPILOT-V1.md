# LeadJin Autopilot v1 — wiring record

Single-owner wiring of the F2/F3/F4/F5/F6/F7/F8/F9 producer lanes into the running product.
Product root: `/home/euphoria/euphoria-v2/work/leadjin/app`.

## What is wired

### Routes (all behind the existing `requireAuth(req, res)` helper, no global guard)

| Method | Path | Producer | Behaviour |
|---|---|---|---|
| POST | `/api/pdpl/basis` | F7 | `recordBasis(db, req.body)` |
| POST | `/api/pdpl/withdraw` | F7 | `withdrawConsent(db, contact_id, action)` |
| GET | `/api/pdpl/check` | F7 | `assertSendAllowed(db, contact_id, channel)` |
| GET | `/api/pdpl/send-sites` | F7 | `sendSiteInventory(process.cwd())` |
| POST | `/api/autopilot/tick` | F5 | `validateGoal` → `tickScheduler`; each due job is a delegated `autopilot_runs` row via `recordDelegatedRun`; nothing executes in the tick |
| GET | `/api/autopilot/decisions` | F5 | `pendingDecisions(db, goalId?)` |
| POST | `/api/autopilot/decisions/resolve` | F5 | `resolveDecision(db, id, choice)` |
| GET | `/api/autopilot/runs` | F5 | `listRuns(db, goalId, limit)` |
| GET | `/api/autopilot/brain-slot` | F3/F4 | `describeBrainSlot()` — provider/model/base_url only, no key material |
| POST | `/api/company/interview/start` | F2 | `createInterview` + first `nextQuestion`, per-user in-memory state |
| POST | `/api/company/interview/answer` | F2 | `answer` + next `nextQuestion` |
| POST | `/api/company/interview/card` | F2 | `buildCard` + `validateCard` (422 on an unsourced card) |

Route block sits at module scope before `startServer()`/the SPA catch-all so `/api/*` is not swallowed by `index.html`.
Boot next to `ensureSuppressionSchema(db)`: `ensureConsentSchema`, `ensureAutopilotRunsSchema`,
`ensureDecisionInboxSchema`, `ensureMemorySchema` (all idempotent `CREATE TABLE IF NOT EXISTS`).

### Consent gate in front of every send site

F7's inventory names three live sites. Each now fails closed via `assertSendAllowed(db, contact_id, 'email')`:

- `server.ts` system-SMTP send (guard immediately above `transporter.sendMail`, line 3999/4008).
- `server.ts` user-queue send (guard above the Gmail-OAuth/SMTP branch, line 4068; covers both transports, sendMail at 4126).
- `src/services/artisanRoutes.ts` `INSERT INTO outreach_messages` (guard at line 212, insert at line 215).

On refusal: queue rows are marked `CANCELLED` with a named `pdpl:` reason plus a `pdpl_blocked` email event; the artisan route returns `403 {error:'Send not permitted', reason}`.

### Frontend

`AutopilotHome` is the default view; the existing harvest/CRM/analytics/settings views remain reachable through the
persistent sidebar and an `Advanced` entry (and `onOpenAdvanced`). `AskJinDock` is mounted as a persistent dock with
local message state; the input is disabled while busy. `src/App.tsx` growth is limited to imports, the view switch,
the Advanced entry and the dock mount — no existing view was removed.

### i18n and delegation

31 flat dotted keys (25 `autopilot.*`, 6 `askjin.*`) added in EN and AR under a `// Autopilot` comment. `t()` was given
an exact-key fast path so the addendum's flat quoted keys actually resolve (the existing nested-walk code otherwise
returned the literal key string). `genaiClient.ts` has exactly one new import (`describeBrainSlot`) and one delegation
call in the gateway-fallback log line; no key material is read or printed. Observability wraps the autopilot tick;
its response carries `report` and `totals` (`cost_usd`, `latency_ms`, `engines_used`, `failure_reasons`).

## Verification (final run)

- `npx tsc --project tsconfig.server.json --noEmit` → exit 0, no output.
- `npm run lint` → exit 2. Seven pre-existing errors in `tests/company-interview.test.ts` (lines 112, 114×2, 122, 132, 151, 167: `Property 'question'/'card' does not exist on type 'NextQuestion'`). That file is outside this wiring SCOPE. No errors remain in any wired file.
- `npm run build` → exit 0, `✓ built in 3.41s`.
- `npx vitest run` → exit 0, `Test Files  24 passed (24)` / `Tests  195 passed | 3 skipped (198)` / `Duration  46.02s`.
- `systemctl --user restart euphoria-leadjin.service` → `active`; `curl -s localhost:3001/api/health` → `{"status":"ok",...,"db":"connected"}` HTTP 200.
- Route codes without a session: `/api/autopilot/brain-slot` 401, `/api/pdpl/send-sites` 401, `/api/autopilot/decisions` 401 — mounted and auth-gated (404 would have meant unmounted).

Earlier in the run: a first route placement after the SPA catch-all returned 200/`index.html`; it was moved before
`startServer()` and re-proved as 401. One earlier full vitest run had a transient 5 s timeout in
`tests/enrichment.test.ts`; the final full run passed it.

## Not proved

- Authenticated (200) behaviour of the new routes: no session was created; only 401/no-404 was proved.
- Browser rendering of the default Autopilot view / dock (build passes, no visual check performed).
- Live send-site execution with a real consent record; no DB writes to consent tables were made by this wiring run.
- The lint gate is not green because of out-of-scope pre-existing test type errors.
