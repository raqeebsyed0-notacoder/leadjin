# Laya — decision engine (LeadJin)

**Status: LIVE (inference verified) · quality gate pending (fine-tune)**

Laya is Convai Innovations' open-source **non-autoregressive decision model** (System 1). It is not a
generative model, not Gemma, not the Hermes harness and not another agent. It answers typed questions
only — `choice`, `noul` (probability of true), `score` — and never produces free text, so there is
nothing to parse and nothing to hallucinate.

## What is verified on this host (2026-11-27)

| Item | Measured |
|---|---|
| Weights | complete in the HF cache: 2,329,053,944 B across three checkpoints (English 804 MiB, multilingual 615 MiB, typed-decisions 804 MiB). The 4 `.incomplete` blobs are stale leftovers of an earlier interrupted attempt, not the live snapshot |
| Runtime | `work/leadjin/.venv-laya` — `laya==0.5.5`, `torch==2.15.0` (CUDA), `transformers==5.24.1` |
| Service | `laya-decide.service` (systemd user unit), `127.0.0.1:8020`, GPU (RTX 3080), model load ≈3.5 s |
| Latency | 0.01–0.6 s per decision |
| Licence | Apache-2.0, commercial use permitted |
| App wiring | `src/services/layaDecision.ts` → `POST /decide`; `laya_decision` block enabled |

Probes (evidence on disk):
- `work/leadjin/laya_setup/probe_leadjin.json` — 4/4 cases directly against the library: reply category
  (interested / unsubscribe / out_of_office) all correct; warmth leaned hot for a demo request.
- `work/audit/leadjin-phase3-2026-11-27/laya-verification/app-probe.json` — 3/3 through the app's own
  `decide()` contract.

## The published checkpoint's honest limits

1. **Uncalibrated confidence.** The checkpoint ships temperatures outside the accepted range, so the
   library forces 0.5 and warns that confidence is uncalibrated. Treat `confidence` as a ranking
   signal, not a probability.
2. **Weak zero-shot `noul`.** In the app probe, "please remove me from your list and stop contacting
   me" scored `noul = 0.11` (i.e. "false"). The paper reports ≈0.36 zero-shot accuracy on typed
   decisions for the base checkpoint. Zero-shot Laya must never gate a destructive or compliance
   action (unsubscribe, suppression, send approval).
3. **Not LeadJin-tuned.** The Euphoria rung2c checkpoint is a different domain. LeadJin needs its own
   fine-tune plus a temperature fit on held-out data — that is the Kaggle job in
   `work/leadjin/laya_setup/kaggle/`.

## What Laya is allowed to do today

- Route and triage: classify an inbound reply, band lead warmth, propose a next action.
- Order candidates when paired with verifier evidence — never as the sole basis for a `verified` status.
- Advise, never authorise: unsubscribe, suppression and send gates are deterministic and never consult Laya.

## Endpoint contract

```
GET  /health  -> {"status":"ok","model":"convaiinnovations/laya/typed-decisions","device":"cuda","loaded_seconds":3.4}
POST /decide  {"kind":"choice","context":"...","options":["a","b"]}
              -> {"choice":"a","confidence":0.74,"probabilities":{...},"calibrated":false}
POST /decide  {"kind":"noul","context":"..."}      -> {"noul":0.11,"choice":"false","confidence":0.89}
POST /decide  {"kind":"score","context":"...","options":["0: cold","1: lukewarm","2: warm","3: hot"]}
              -> {"score":1.82,"confidence":0.33,"probabilities":{...}}
```

The app contract (`decide()` in `src/services/layaDecision.ts`) is time-boxed at 15 s and returns a
typed `LayaUnavailableError` (`config` | `endpoint` | `model` | `weights`) when the service is down.
No silent fallback to the writer model — a decision is never faked by Gemma.

## Operating it

```sh
systemctl --user status laya-decide.service
curl -s http://127.0.0.1:8020/health
tail -n 50 /home/euphoria/euphoria-v2/logs/leadjin/laya.out
```

Restart after a checkpoint change: `systemctl --user restart laya-decide.service`.
Model swap without a code change: set `LAYA_MODEL` / `LAYA_SUBFOLDER` in the unit.

## Provenance

- Model: HF `convaiinnovations/laya` (+ `multilingual`, `typed-decisions`); code
  `github.com/NandhaKishorM/laya`; paper "From Laya to Vega", preprint 2026110781 (2026-11-07).
- Licence: Apache-2.0 (`license: apache-2.0`, `commercial-use` tag) — commercial use permitted.

## Next step (owner)

The Kaggle fine-tune package is prepared: dataset (6,568 cleared records only), notebook, upload
helper. It is blocked solely on the Kaggle API token. When the run completes and `metrics.json` beats
the majority baseline on held-out data, point `LAYA_MODEL` at the fine-tuned artifact and refit
temperatures.
