/**
 * layaDecision.ts — Laya decision contract for LeadJin (Convai Innovations).
 *
 * Verdict on the real model (verified against its actual repository, licence
 * and inference method):
 *
 *   - Artifac: Convai Innovations `laya` — non-autoregressive System 1 decision
 *     engine (ModernBERT-large encoder, 421M params; choice / noul / score only,
 *     never free text). Repo: https://huggingface.co/convaiinnovations/laya
 *   - Licence: Apache-2.0 (`license: apache-2.0` on HF; "Apache 2.0 · Convai
 *     Innovations" in the README; tags carry `commercial-use`). Commercial use
 *     is permitted.
 *   - Interface: typed decision primitives `choice` (pick one label),
 *     `noul` (P(true)) and `score` — the same vocabulary the config block
 *     (`laya_decision`) advertises.
 *   - Inference path: `laya-serve` (HTTP, Jev `/v1/systemone` wire protocol,
 *     OpenAI-compatible where that is what the artifact serves) or direct
 *     `laya.decide()` from the `laya` package (v0.3.26) installed in
 *     `.venv-laya`.
 *
 * RESULT: WIREABLE and WIRED (2026-11-27, Founder authorisation).
 *
 * Local state, measured on this host:
 *   - HF cache `models--convaiinnovations--laya` → all three checkpoints complete
 *     (2,329,053,944 B total: 804 MiB English, 615 MiB multilingual, 804 MiB
 *     typed-decisions). The four stale `.incomplete` blobs are leftovers of an
 *     earlier interrupted attempt, not the live snapshot.
 *   - Runtime: `laya==0.5.5` + torch 2.15 (CUDA) in `work/leadjin/.venv-laya`.
 *   - Served by `laya-decide.service` on http://127.0.0.1:8020 (GPU, model load
 *     ~3.5 s, decisions 0.02–0.6 s). Heartbeat: GET /health.
 *   - Verified decisions: reply classification (interested / unsubscribe /
 *     out_of_office), stop-contacting (noul) and lead warmth (score).
 *   - Known limitation: the published checkpoint ships invalid calibration
 *     temperatures, so the library forces 0.5 and warns that confidence is
 *     uncalibrated. Treat `confidence` as a ranking signal until the LeadJin
 *     fine-tune + temperature fit (Kaggle) replaces it.
 *
 * Contract: every call reads the `laya_decision` block and calls the served
 * endpoint. No silent fallback to Gemma: a decision must never be faked by the
 * writer model. When the endpoint is down or the config is off, the call returns
 * a typed `LayaUnavailableError` naming the missing piece.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// The `laya_decision` block lives in the harness config next to the repo root.
// The tree can be checked out flat (repo root = app) or one-repo (app/ under
// the repo root), so search the nearest candidates and let an explicit
// LEADJIN_HARNESS_CONFIG override win. Same config in every layout, no
// hard-coded absolute path.
function resolveHarnessConfigPath(): string {
  const explicit = process.env.LEADJIN_HARNESS_CONFIG;
  if (explicit && existsSync(explicit)) return explicit;
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(here, '..', '..', '.hermes', 'config.yaml'),
    resolve(here, '..', '..', '..', '.hermes', 'config.yaml'),
    resolve(here, '..', '..', '..', '..', '.hermes', 'config.yaml'),
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0];
}

const _CONFIG_PATH = resolveHarnessConfigPath();

export type LayaDecision = {
  choice: string;
  score: number;
  confidence: number;
  raw?: unknown;
};

/** Why the decision engine cannot answer a call, named by missing artifact. */
export type LayaUnavailableCause = 'config' | 'endpoint' | 'model' | 'weights';

export class LayaUnavailableError extends Error {
  constructor(
    message: string,
    public readonly cause: LayaUnavailableCause,
  ) {
    super(message);
    this.name = 'LayaUnavailableError';
  }
}

/** Minimal reader for the `laya_decision:` block (no YAML dependency in app). */
function _parseLayaBlock(text: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  let inBlock = false;
  for (const rawLine of text.split('\n')) {
    const line = rawLine.replace(/\r$/, '');
    const trimmed = line.trimStart();
    if (!inBlock) {
      if (trimmed.startsWith('laya_decision:')) {
        inBlock = true;
      }
      continue;
    }
    if (trimmed.length === 0) continue;
    const indent = line.length - line.trimStart().length;
    if (indent === 0) break; // next top-level key ends the block
    const k = trimmed.split(':')[0].trim();
    const v = trimmed.slice(k.length + 1).trim();
    if (k === 'enabled') out.enabled = v === 'true' || v === 'True';
    else if (k === 'model') out.model = v.replace(/^['"]|['"]$/g, '');
    else if (k === 'endpoint') out.endpoint = v.replace(/^['"]|['"]$/g, '');
    else if (k === 'role') out.role = v.replace(/^['"]|['"]$/g, '');
    else if (k === 'note') out.note = v.replace(/^['"]|['"]$/g, '');
  }
  return out;
}

function _readConfig(): Record<string, unknown> {
  if (!existsSync(_CONFIG_PATH)) {
    throw new LayaUnavailableError(
      `laya_decision contract disabled: config not found at ${_CONFIG_PATH}`,
      'config',
    );
  }
  return _parseLayaBlock(readFileSync(_CONFIG_PATH, 'utf8'));
}

function _assertEnabled(cfg: Record<string, unknown>): void {
  const enabled = cfg.enabled;
  if (enabled === false || enabled === undefined || enabled === null) {
    const model = typeof cfg.model === 'string' ? cfg.model : '';
    const endpoint = typeof cfg.endpoint === 'string' ? cfg.endpoint : '';
    throw new LayaUnavailableError(
      `Laya decision unavailable: laya_decision.enabled is false (model="${model}" endpoint="${endpoint}"). ${cfg.note ?? ''}`,
      'config',
    );
  }
  if (typeof cfg.endpoint !== 'string' || cfg.endpoint.trim() === '') {
    throw new LayaUnavailableError(
      'Laya decision unavailable: laya_decision.endpoint is empty (model="' + (typeof cfg.model === 'string' ? cfg.model : '') + '").',
      'endpoint',
    );
  }
  if (!(typeof cfg.model === 'string' && cfg.model.trim() !== '')) {
    throw new LayaUnavailableError(
      'Laya decision unavailable: laya_decision.model is empty.',
      'model',
    );
  }
}

/**
 * decide() — the real Laya decision contract.
 *
 * While the model is available, this calls the verified Laya endpoint
 * (OpenAI-compatible where that is what the artifact serves, e.g. the
 * `laya-serve`/`laya-multilingual` Jev `/v1/systemone` surface on the port the
 * Founder provisions). Time-boxed, typed errors, no silent fallback to Gemma:
 * a decision must never be faked by the writer model.
 *
 * While the artifact is absent (this host, today), every call returns a
 * typed `LayaUnavailableError` naming the missing piece. Nothing is silently
 * substituted and no model id is invented.
 */
export async function decide(
  input: { options: string[]; context: string; kind: 'choice' | 'noul' | 'score' },
): Promise<LayaDecision> {
  const cfg = _readConfig();
  _assertEnabled(cfg);

  const endpoint = String(cfg.endpoint).replace(/\/+$/, '');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(`${endpoint}/decide`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: input.kind, context: input.context, options: input.options }),
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new LayaUnavailableError(
        `Laya HTTP ${res.status} from ${endpoint}/decide`,
        'endpoint',
      );
    }
    const json: any = await res.json();
    if (json?.error) {
      throw new LayaUnavailableError(
        `Laya refused the decision: ${json.error}`,
        json.error === 'model_unavailable' ? 'model' : 'endpoint',
      );
    }
    return {
      choice: String(json?.choice ?? ''),
      score: Number(json?.score ?? 0),
      confidence: Number(json?.confidence ?? 0),
      raw: json,
    };
  } catch (err: any) {
    if (err instanceof LayaUnavailableError) throw err;
    const reason = err?.name === 'AbortError' ? 'timed out after 15s' : (err?.message ?? String(err));
    throw new LayaUnavailableError(
      `Laya decision unavailable: endpoint ${endpoint} unreachable (${reason}).`,
      'endpoint',
    );
  } finally {
    clearTimeout(timer);
  }
}
