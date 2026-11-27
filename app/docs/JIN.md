# Jin — embedded LeadJin agent (tool router & profile)

Reconstructed (Phase 3): Phase 2 verified no `SOUL.md` existed for this agent.
Jin is the embedded agent of LeadJin — same product identity as the UI-facing
agent. No historical identity invented.

## Deliverables (in scope)
- `app/src/services/jinTools.ts` — deterministic command router (new).
- `app/src/services/jinCompleteRoutes.ts` — `POST /chat` wired to the router.
- `app/docs/JIN.md` — this file.
- `work/leadjin/.hermes/profiles/leadjin/` — reconstructed profile
  (`SOUL.md`, `AGENTS.md`, `profile.yaml`, `config.yaml`, `skills/`).
- Skills reduced/copied from global: `leadjin-model-routing`,
  `verified-lead-discovery`, `business/euphoria-places-lead-discovery`,
  `leadjin-places-wiring`.

## Controller notes
- `server.ts` is NOT edited (owned by other lanes this wave).
- Global `/home/euphoria/.hermes/profiles/` NOT touched (steward's domain).
- Leave changes in the working tree; do not commit.

## Tool router (`jinTools.ts`)

Deterministic dispatch on the stripped command text. All routes hit the real
LeadJin services — the shared pipeline (`runLeadDiscovery`), the existing
verification path (`performTripleCheck`), the CRM save path (`storeLead`), and
the outreach writer (`craftOutreach`). No mock, no parallel implementation.

### Commands
| Intent | Input example | Tool | Backend |
|---|---|---|---|
| Discovery | `find 2 real estate leads in Riyadh` | `discover_leads` | `runLeadDiscovery` (shared pipeline) |
| Verification | `triple check alice@example.com` | `verify_lead` | `performTripleCheck` / `tripleVerify` |
| CRM save | `save <lead fields> to CRM` | `save_to_crm` | `huntOrchestrator.storeLead` (real insert) |
| Outreach | `draft outreach for <lead>` | `draft_outreach` | `outreach-writer.craftOutreach` |

### Router contract
- Returns a `JinToolResult` with `tool`, `ok`, `summary`, `data` (or `error`).
- Returns `null` when the message is ordinary chatter (so it never hijacks the
  model answer).
- Optional dataset tool omitted by brief (dataset tooling not present in this app).

### Parser
- Known city set (`KNOWN_CITIES`, KSA); `riyadh` is matched.
- Trailing `leads/results` suffixes stripped so `real estate leads` is parsed as
  the industry, not as extra words.

## `POST /chat` wiring (`jinCompleteRoutes.ts`)
1. Run `dispatchJinCommand` first.
2. When a tool runs: add `tool_calls: [result]`, feed the tool result into the
   prompt, preserve existing response fields (`reply`/`text`/`source`/`isStubbed`).
3. Otherwise pass through to the existing model path unchanged.

## Verification (verbatim from brief)
1. `npx tsc --noEmit` — new jin files compile cleanly (0 jin errors; see run log).
2. `dispatchJinCommand('find 2 real estate leads in Riyadh', {db})` → `JinToolResult`
   with `tool: 'discover_leads'` and real data OR an honest error (the model leg
   may still be pending local model time; the cache leg returns real rows).
3. `dispatchJinCommand('hello, how are you?', {db})` → `null`.
4. Restart service + `curl -s http://127.0.0.1:3001/api/health` → `{"status":"ok",...}`.
5. `ls -la /home/euphoria/euphoria-v2/work/leadjin/.hermes/profiles/leadjin/`
   → five entries.

## Data facts
- Runtime DB: `work/leadjin/app/leadjin.db` — 335 leads.
- Service: `euphoria-leadjin.service`, port `3001`, working dir `app`.
- Providers: `LEADJIN_PROVIDER=ollama`, `LEADJIN_MODEL=gemma4:e4b`,
  `base_url http://127.0.0.1:11434/v1`.
- `laya_decision.enabled: false`; model/endpoint blocks in profile YAML carried
  unchanged (empty) per brief.
