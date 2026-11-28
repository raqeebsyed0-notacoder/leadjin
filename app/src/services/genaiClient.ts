/**
 * Provider-agnostic AI layer for LeadJin.
 *
 * Contract (unchanged from the GoogleGenAI layer):
 *   getGenAI(userApiKey?).models.generateContent({ model, contents, config })
 *
 * Backing providers (chosen by LEADJIN_PROVIDER, default 'ollama'):
 *   - 'ollama'     → local Ollama http://localhost:11434, model gemma4:e4b
 *   - 'gateway'    → Hermes API gateway http://127.0.0.1:8645/v1
 *                    (OpenAI-compatible). Cloud model comes from the provider
 *                    configuration; priced 0.10/0.40 USD per 1M tokens.
 *                    Monthly cap enforced via ledger.
 *   - 'openrouter' → OpenRouter free tier https://openrouter.ai/api/v1
 *                    Default model: openrouter/auto (free router). Zero-cost.
 *   - 'together'   → Together AI free tier https://api.together.xyz/v1
 *                    Default model: Qwen/Qwen3-8B. Zero-cost for selected models.
 *   - 'nvidia'     → NVIDIA Build free tier https://integrate.api.nvidia.com/v1
 *                    Default model: meta/llama-3.1-8b-instruct. Dev/prototype only.
 *   - 'nous'       → Nous Portal free tier https://inference-api.nousresearch.com/v1
 *                    Default model: stepfun/step-3.7-flash:free. $0 plan, no card.
 *
 * Cloud routing: the gateway leg reads its API key from
 * /home/euphoria/euphoria-v2/.hermes/.env (scope: the agent wiring below the
 * app, not the app .env). The app .env is NEVER written to or printed.
 * Free serverless keys are read from the app .env.
 *
 * Model choke point: every legacy model literal carried by src/services/**
 * is handed through and remapped here to the active provider's model id before
 * dispatch. All services route through this single function.
 *
 * Per-call router: callers pass a TIER ('fast' | 'pro' | 'preview') instead of
 * a vendor model name. With no tier overrides configured all tiers collapse to
 * the provider default; set LEADJIN_MODEL_FAST / LEADJIN_MODEL_PRO /
 * LEADJIN_MODEL_PREVIEW to let the tiers dispatch different models.
 *
 * Free providers: zero-cost, no billing cap enforced. Token usage is tracked
 * in the same ledger for observability. Paid keys (gateway) are kept separate
 * and only used for production traffic.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
// Autopilot v1: brain-slot descriptions are owned by the F3 module.
import { describeBrainSlot } from './brainSlot.js';

// ---------------------------------------------------------------------------
// Provider configuration
// ---------------------------------------------------------------------------

const OLLAMA_BASE = 'http://localhost:11434';
/** Local default — the primary provider, no key, no billing. */
const OLLAMA_MODEL = (process.env.LEADJIN_MODEL || 'gemma4:e4b').trim();  // Configured primary model deployment: explicit default = local Ollama gemma4:e4b (no key, no billing). Override at runtime with LEADJIN_MODEL.

/** Per-call tiers. Unset tiers fall back to the active provider's default. */
export type ModelTier = 'fast' | 'pro' | 'preview';
const TIER_MODEL_OVERRIDES: Record<ModelTier, string | undefined> = {
  fast: (process.env.LEADJIN_MODEL_FAST || '').trim() || undefined,
  pro: (process.env.LEADJIN_MODEL_PRO || '').trim() || undefined,
  preview: (process.env.LEADJIN_MODEL_PREVIEW || '').trim() || undefined,
};

// Cloud leg (Finder override): Hermes API gateway, OpenAI-compatible.
const GATEWAY_BASE = 'http://127.0.0.1:8645/v1';
// API key is read from /home/euphoria/euphoria-v2/.hermes/.env by the caller
// wiring; never read from the app .env and never printed.
// Cloud API key: resolved LAZILY (at call time), so it works whether the
// process env was populated before or after this module loaded. The key lives
// in the Hermes env (the agent wiring below the app) — never in the app .env,
// never copied into another file, and never printed.
let _gatewayKey: string | undefined;
function getGatewayApiKey(): string {
  if (_gatewayKey !== undefined) return _gatewayKey;
  let k = (process.env.API_SERVER_KEY || '').trim();
  if (!k) {
    try {
      const txt = readFileSync('/home/euphoria/euphoria-v2/.hermes/.env', 'utf8');
      const m = txt.match(/^\s*API_SERVER_KEY\s*=\s*(.+)$/m);
      if (m) k = m[1].trim().replace(/^["']|["']$/g, '');
    } catch { /* leave unset */ }
  }
  _gatewayKey = k || '';
  return _gatewayKey;
}
const CLOUD_MODEL = 'google/flash-2.5-flash-lite';
// Verified pricing from GET /v1/models (gateway): 0.10 USD / 1M input, 0.40 USD / 1M output
const CLOUD_PROMPT_RATE = 0.10;
const CLOUD_COMPLETION_RATE = 0.40;

// ---------------------------------------------------------------------------
// Free serverless provider configuration (eval/prototype only — no billing)
// All use OpenAI-compatible /v1/chat/completions.
// API keys are read from app .env; never printed.
// ---------------------------------------------------------------------------

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';
// Best free model: OpenRouter Free Router picks the best available :free model.
// Use `:free` suffix models directly, or `openrouter/auto` for router selection.
const OPENROUTER_MODEL = (process.env.LEADJIN_OPENROUTER_MODEL || 'openrouter/auto').trim();
const OPENROUTER_REFERRER = process.env.LEADJIN_OPENROUTER_SITE_URL || 'https://leadjin.app';

const TOGETHER_BASE = 'https://api.together.xyz/v1';
// Free on Together: Qwen/Qwen3-8B, togethercomputer/llama-2-7b-chat-free, and others.
const TOGETHER_MODEL = (process.env.LEADJIN_TOGETHER_MODEL || 'Qwen/Qwen3-8B').trim();

const NVIDIA_BASE = 'https://integrate.api.nvidia.com/v1';
// Free on NVIDIA Build: meta/llama-3.1-8b-instruct, qwen/qwen3-8b, and others.
// No credit card required for dev/prototype usage.
const NVIDIA_MODEL = (process.env.LEADJIN_NVIDIA_MODEL || 'meta/llama-3.1-8b-instruct').trim();

const NOUS_BASE = 'https://inference-api.nousresearch.com/v1';
// Free on Nous Portal ($0 plan): stepfun/step-3.7-flash:free, upstage/solar-mini4:free, etc.
const NOUS_MODEL = (process.env.LEADJIN_NOUS_MODEL || 'stepfun/step-3.7-flash:free').trim();

// Lazy key getters (app .env — never printed)
function getOpenRouterKey(): string {
  return (process.env.OPENROUTER_API_KEY || '').trim();
}
function getTogetherKey(): string {
  return (process.env.TOGETHER_API_KEY || '').trim();
}
function getNvidiaKey(): string {
  return (process.env.NVIDIA_API_KEY || '').trim();
}
function getNousKey(): string {
  return (process.env.NOUS_API_KEY || '').trim();
}

/**
 * Generic OpenAI-compatible chat completions call for free serverless providers.
 * Returns { text, model?, usage? }.
 */
async function callFreeProvider(params: {
  base: string;
  model: string;
  apiKey: string;
  messages: Array<{ role: string; content: string }>;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  referer?: string;
}): Promise<{ text: string; model?: string; usage?: { promptTokens: number; completionTokens: number } }> {
  const body: Record<string, unknown> = {
    model: params.model,
    messages: params.messages,
    stream: false,
    temperature: params.temperature ?? 0.7,
  };
  if (typeof params.maxTokens === 'number') body.max_tokens = params.maxTokens;
  if (typeof params.topP === 'number') body.top_p = params.topP;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${params.apiKey}`,
  };
  // OpenRouter requires an HTTP-Referer for free-tier attribution
  if (params.referer) headers['HTTP-Referer'] = params.referer;
  // Together requires 'together' header for some models
  if (params.base === TOGETHER_BASE) headers['X-Title'] = 'LeadJin';

  const res = await fetch(`${params.base}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(300_000),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Free provider ${params.base} failed (${res.status}): ${txt.slice(0, 300)}`);
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    model?: string;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const text = data.choices?.[0]?.message?.content || '';
  return {
    text,
    model: data.model,
    usage: data.usage && ((data.usage.prompt_tokens ?? 0) > 0 || (data.usage.completion_tokens ?? 0) > 0)
      ? { promptTokens: data.usage.prompt_tokens ?? 0, completionTokens: data.usage.completion_tokens ?? 0 }
      : undefined,
  };
}

// Ledger note for free providers: $0 spend, so we do NOT enforce a cap,
// but we still track token usage for observability.
function recordFreeSpend(ledger: Ledger, inputTokens: number, outputTokens: number, provider: string, model: string): Ledger {
  return {
    ...ledger,
    totalInputTokens: ledger.totalInputTokens + inputTokens,
    totalOutputTokens: ledger.totalOutputTokens + outputTokens,
    // costUsd stays 0 — free providers cost nothing
    entries: [...ledger.entries, { provider, model, inputTokens, outputTokens, costUsd: 0, at: nowIso() }],
    updatedAt: nowIso(),
  };
}

const PROVIDER_OLLAMA = 'ollama';
const PROVIDER_GATEWAY = 'gateway';
// Free serverless providers (zero-cost, eval/prototype only — see FREE_SERVERLESS_ROUTING.md)
const PROVIDER_OPENROUTER = 'openrouter';
const PROVIDER_TOGETHER = 'together';
const PROVIDER_NVIDIA = 'nvidia';
const PROVIDER_NOUS = 'nous';
const PROVIDER_DEFAULT = PROVIDER_OLLAMA;
// Exported so call sites (e.g. server.ts enrichment helpers) can resolve a
// concrete model id through resolveModel instead of hard-coding a dead vendor
// literal such as "flash-lite".
export const LEADJIN_PROVIDER = (process.env.LEADJIN_PROVIDER || PROVIDER_DEFAULT).toLowerCase();

// ---------------------------------------------------------------------------
// Monthly cap
// ---------------------------------------------------------------------------

// 0 < cap. Default 5 USD per the brief. A ledger file tracks spend; once the
// month's tracked spend would exceed this, cloud calls are refused and local
// Gemma is used instead.
const MONTHLY_CAP_USD = parseFloat(process.env.LEADJIN_MONTHLY_CAP_USD || '5');
const MONTHLY_CAP_MIN = 0.01;

// Ledger lives at the project root so every service shares one month.
const PROJECT_ROOT = resolve(fileURLToPath(import.meta.url), '..', '..', '..');
const LEDGER_DIR = join(PROJECT_ROOT, '.leadjin');
const LEDGER_PATH = join(LEDGER_DIR, 'provider-ledger.json');

// ---------------------------------------------------------------------------
// Model choke point — remap every hardcoded cloud model literal to the provider id.
// ---------------------------------------------------------------------------

/** Legacy cloud model literals seen in src/services/** (all route through here). */
const CLOUD_MODEL_LITERALS = new Set<string>([
  // Bare flash-family literals used by ~35 call sites (src/services/** and
  // server.ts): without these, 'flash' / 'flash-lite' / 'flash-preview' pass
  // through verbatim and Ollama 404s (model 'flash' not found), silently
  // disabling every non-scoring AI call in LOCAL mode (EUP-538).
  'flash',
  'flash-lite',
  'flash-preview',
  'flash-2.5-flash',
  'flash-2.5-flash-lite',
  'flash-1.5-flash',
  'flash-1.5-flash-lite',
  'flash-3.1-pro',
  'flash-3.1-pro-preview',
  'flash-3.1-pro-exp',
  'flash-2.5-pro',
  'flash-2.5-pro-preview',
  'flash-flash-lite-latest',
  'flash-2.0-flash',
  'flash-2.0-flash-lite',
  'flash-2.0-pro-exp',
  'models/flash-2.5-flash',
  'models/flash-1.5-flash',
  'flash-flash-lite',
  // Neutral per-call tiers (no vendor label) — see routeModel below.
  'fast',
  'pro',
  'preview',
]);

/**
 * resolveModel(provider, model?) → provider model id.
 *
 * - provider: PROVIDER_OLLAMA | PROVIDER_GATEWAY | PROVIDER_OPENROUTER |
 *             PROVIDER_TOGETHER | PROVIDER_NVIDIA | PROVIDER_NOUS
 * - model:    the caller's model literal (e.g. 'flash-2.5-flash')
 *
 * Default/empty → the active provider's default model. Legacy cloud literals
 * (see CLOUD_MODEL_LITERALS) collapse to the provider default. A per-call tier
 * ('fast' | 'pro' | 'preview') uses its configured model when
 * LEADJIN_MODEL_<TIER> is set, otherwise it collapses to the same default.
 */
function modelTierOf(key: string): ModelTier | undefined {
  if (key === 'fast' || key === 'flash' || key === 'flash-lite' ||
      key === 'flash-2.5-flash' || key === 'flash-2.5-flash-lite' ||
      key === 'flash-1.5-flash' || key === 'flash-1.5-flash-lite' ||
      key === 'flash-2.0-flash' || key === 'flash-2.0-flash-lite' ||
      key === 'flash-flash-lite' || key === 'flash-flash-lite-latest') return 'fast';
  if (key === 'pro' || key === 'flash-3.1-pro' || key === 'flash-2.5-pro' ||
      key === 'flash-2.0-pro-exp' || key === 'flash-3.1-pro-exp') return 'pro';
  if (key === 'preview' || key === 'flash-preview' ||
      key === 'flash-3.1-pro-preview' || key === 'flash-2.5-pro-preview') return 'preview';
  return undefined;
}

/** Per-call router: choose a model tier, then map it onto the active provider.
 *  Different call sites (utility vs strategic drafting vs experimental) can
 *  therefore run different models without embedding a vendor name in source. */
export function routeModel(tier: ModelTier = 'fast', provider: string = LEADJIN_PROVIDER): string {
  return resolveModel(provider, tier);
}

export function resolveModel(provider: string, model?: string): string {
  let key = (model || '').toLowerCase();
  // Normalize a legacy vendor-prefixed literal to its bare flash-family form
  // so a stale client id collapses to the provider default instead of passing
  // through verbatim to Ollama (404).
  if (key.startsWith('models/')) key = key.slice('models/'.length);
  if (!CLOUD_MODEL_LITERALS.has(key)) {
    const aliased = key.replace(/^[a-z][a-z0-9]*-/, 'flash-');
    if (CLOUD_MODEL_LITERALS.has(aliased)) key = aliased;
  }
  if (!key) {
    switch (provider) {
      case PROVIDER_OLLAMA:     return OLLAMA_MODEL;
      case PROVIDER_GATEWAY:    return CLOUD_MODEL;
      case PROVIDER_OPENROUTER: return OPENROUTER_MODEL;
      case PROVIDER_TOGETHER:   return TOGETHER_MODEL;
      case PROVIDER_NVIDIA:     return NVIDIA_MODEL;
      case PROVIDER_NOUS:       return NOUS_MODEL;
      default:                  return model || OLLAMA_MODEL;
    }
  }
  // Per-call tier override: fast/pro/preview may differ when configured.
  const tier = modelTierOf(key);
  if (tier && TIER_MODEL_OVERRIDES[tier]) return TIER_MODEL_OVERRIDES[tier]!;

  if (CLOUD_MODEL_LITERALS.has(key)) {
    switch (provider) {
      case PROVIDER_OLLAMA:     return OLLAMA_MODEL;
      case PROVIDER_GATEWAY:    return CLOUD_MODEL;
      case PROVIDER_OPENROUTER: return OPENROUTER_MODEL;
      case PROVIDER_TOGETHER:   return TOGETHER_MODEL;
      case PROVIDER_NVIDIA:     return NVIDIA_MODEL;
      case PROVIDER_NOUS:       return NOUS_MODEL;
      default:                  return model ?? OLLAMA_MODEL;
    }
  }
  // Pass-through: provider model ids (e.g. 'gemma4:e4b', 'google/flash-2.5-flash-lite')
  // that are NOT legacy cloud literals are used verbatim instead of being collapsed.
  if (model && !CLOUD_MODEL_LITERALS.has(model.toLowerCase())) {
    return model;
  }
  // Pass-through unknown literals (e.g. a caller that already uses the provider id).
  return model ?? OLLAMA_MODEL;
}

// ---------------------------------------------------------------------------
// Ledger (monthly cap)
// ---------------------------------------------------------------------------

export interface LedgerEntry {
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  at: string;
}

export interface Ledger {
  version: 1;
  month: string; // YYYY-MM
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
  entries: LedgerEntry[];
  updatedAt: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function currentMonthKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export function loadLedger(): Ledger | null {
  try {
    if (!existsSync(LEDGER_PATH)) return null;
    const raw = readFileSync(LEDGER_PATH, 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      const o = parsed as Ledger;
      return (o.version === 1 || typeof o.version === 'number') && Array.isArray(o.entries)
        ? o
        : null;
    }
    return null;
  } catch (err) {
    console.warn(`[genaiClient] ledger unreadable, starting fresh: ${(err as Error).message}`);
    return null;
  }
}

export function saveLedger(ledger: Ledger): void {
  try {
    mkdirSync(LEDGER_DIR, { recursive: true });
    writeFileSync(LEDGER_PATH, JSON.stringify(ledger, null, 2) + '\n', 'utf8');
  } catch (err) {
    console.error(`[genaiClient] failed to write ledger: ${(err as Error).message}`);
  }
}

export function rotateIfNeeded(ledger: Ledger | null): Ledger {
  const month = currentMonthKey();
  if (!ledger || ledger.month !== month) {
    return {
      version: 1,
      month,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCostUsd: 0,
      entries: [],
      updatedAt: nowIso(),
    };
  }
  return ledger;
}

export function canAffordCloud(ledger: Ledger, estimatedCostUsd: number): boolean {
  const cap = Math.max(MONTHLY_CAP_MIN, MONTHLY_CAP_USD);
  return ledger.totalCostUsd + estimatedCostUsd <= cap;
}

export function addCloudSpend(
  ledger: Ledger,
  inputTokens: number,
  outputTokens: number,
  costUsd: number,
): Ledger {
  return {
    ...ledger,
    totalInputTokens: ledger.totalInputTokens + inputTokens,
    totalOutputTokens: ledger.totalOutputTokens + outputTokens,
    totalCostUsd: ledger.totalCostUsd + costUsd,
    entries: [...ledger.entries, { provider: PROVIDER_GATEWAY, model: CLOUD_MODEL, inputTokens, outputTokens, costUsd, at: nowIso() }],
    updatedAt: nowIso(),
  };
}

// ---------------------------------------------------------------------------
// Provider dispatch
// ---------------------------------------------------------------------------

interface ChatParams {
  model: string;
  contents: unknown;
  config?: Record<string, unknown>;
  context?: Record<string, unknown>;
}

interface UsageTokens {
  promptTokens: number;
  completionTokens: number;
}

function partsToText(parts: unknown): string {
  let out = '';
  for (const part of Array.isArray(parts) ? parts : []) {
    if (typeof part === 'string') out += part;
    else if (part && typeof part === 'object') {
      const o = part as Record<string, unknown>;
      if (typeof o.text === 'string') out += o.text;
      else if (o.inlineData) out += '[image]';
      else if (o.fileData) out += '[file]';
      else if (typeof o.thought === 'string') out += o.thought;
    }
  }
  return out;
}

/** Normalize GoogleGenAI-style contents -> provider messages. */
function buildMessages(contents: unknown): Array<{ role: string; content: string }> {
  if (typeof contents === 'string') {
    return [{ role: 'user', content: contents }];
  }
  if (Array.isArray(contents)) {
    return contents.map((c) => {
      if (typeof c !== 'object') return { role: 'user', content: String(c) };
      const o = c as Record<string, unknown>;
      const role =
        o.role === 'model' ? 'assistant' : o.role === 'function' ? 'user' : (o.role || 'user') as string;
      const parts = o.parts;
      return { role, content: partsToText(parts) };
    });
  }
  return [{ role: 'user', content: String(contents) }];
}

/** Append generation context (majlisMode, vision2030, geography, industry,
 *  jobTitles, limits, templates) into the prompt text before dispatch. */
function serializeContents(contents: unknown, context?: Record<string, unknown>): string {
  const base = typeof contents === 'string' ? contents : JSON.stringify(contents ?? '');
  if (!context || Object.keys(context).length === 0) return base;
  return `${base}\n\n[CONTEXT]\n${JSON.stringify(context, null, 2)}\n[/CONTEXT]\n`;
}

/** Rough token estimate for the cap pre-check. */
function estimateCost(params: ChatParams): number {
  const contents = params.contents as string | unknown[];
  const promptTokens = Math.ceil(
    typeof contents === 'string' ? contents.length / 4 : 0,
  );
  const outputTokens =
    typeof params.config?.maxTokens === 'number' ? params.config.maxTokens : 1000;
  return promptTokens * CLOUD_PROMPT_RATE / 1e6 + outputTokens * CLOUD_COMPLETION_RATE / 1e6;
}

async function callOllama(params: ChatParams): Promise<{ text: string; model?: string }> {
  const url = `${OLLAMA_BASE}/api/chat`;
  // F-28: local Ollama /api/chat has no Google Search grounding. config.tools
  // is deliberately NOT serialised into the request body below — any
  // { googleSearch: {} } tool a caller passes is unsupported on this path, not
  // honoured. Callers must label such results ungrounded / best-effort.
  const body: Record<string, unknown> = {
    model: resolveModel(PROVIDER_OLLAMA, params.model),
    messages: buildMessages(params.contents),
    stream: false,
    options: {
      temperature: typeof params.config?.temperature === 'number' ? params.config.temperature : 0.2,
      top_p: typeof params.config?.topP === 'number' ? params.config.topP : 0.9,
      top_k: typeof params.config?.topK === 'number' ? params.config.topK : 40,
      num_predict: typeof params.config?.maxTokens === 'number' ? params.config.maxTokens : 1024,
    },
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(300_000),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Ollama /api/chat failed (${res.status}): ${txt.slice(0, 300)}`);
  }
  const data = (await res.json()) as { message?: { content?: string }; model?: string };
  return { text: data.message?.content || '', model: data.model };
}

async function callGateway(params: ChatParams): Promise<{ text: string; model?: string; usage?: UsageTokens }> {
  const url = `${GATEWAY_BASE}/chat/completions`;
  const body: Record<string, unknown> = {
    model: resolveModel(PROVIDER_GATEWAY, params.model),
    messages: buildMessages(params.contents),
    stream: false,
    temperature: typeof params.config?.temperature === 'number' ? params.config.temperature : 0.7,
  };
  if (typeof params.config?.topP === 'number') body.top_p = params.config.topP;
  if (typeof params.config?.maxTokens === 'number') body.max_tokens = params.config.maxTokens;
  if (typeof params.config?.responseMimeType === 'string') {
    const mime = params.config.responseMimeType as string;
    if (mime === 'application/json' || mime === 'application/json; encoding=UTF-8') {
      body.response_format = { type: 'json_object' };
    }
  }
  if (params.config?.tools && Array.isArray(params.config.tools) && params.config.tools.length > 0) {
    body.tools = params.config.tools;
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getGatewayApiKey()}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(300_000),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Gateway chat failed (${res.status}): ${txt.slice(0, 300)}`);
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    model?: string;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const text = data.choices?.[0]?.message?.content || '';
  const usage: UsageTokens | undefined =
    data.usage != null
      ? (data.usage!.prompt_tokens ?? 0) > 0 || (data.usage!.completion_tokens ?? 0) > 0
        ? { promptTokens: data.usage!.prompt_tokens ?? 0, completionTokens: data.usage!.completion_tokens ?? 0 }
        : undefined
      : undefined;
  return { text, model: data.model, usage };
}

function localFallbackResponse(params: ChatParams, error?: unknown): { text: string } {
  return {
    text: `[genaiClient] cloud call refused (monthly cap ${MONTHLY_CAP_USD} USD exceeded; falling back to local Gemma). ` +
      `Error: ${error ? String(error) : 'no error'}`,
  };
}

/** Result of a generateContent call.
 *
 *  `fallbackFrom` / `fallbackReason` are a caller-visible signal: they are set
 *  when the configured provider leg was skipped (e.g. gateway key absent) and
 *  a lower-priority leg served the request. Callers can surface or log this
 *  instead of assuming the intended provider answered. */
export interface GenAIResult {
  text: string;
  model?: string;
  usage?: { promptTokens: number; completionTokens: number };
  fallbackFrom?: string;
  fallbackReason?: string;
}

// ---------------------------------------------------------------------------
// Public API — keeps the GoogleGenAI-shaped caller contract.
// ---------------------------------------------------------------------------

export interface GenAIClient {
  models: {
    generateContent(params: { model?: string; contents: unknown; config?: Record<string, unknown> }): Promise<GenAIResult>;
    generateContentStream(params: { model?: string; contents: unknown; config?: Record<string, unknown> }): Promise<AsyncIterable<{ text: string; model?: string }>>;
  };
}

// ---------------------------------------------------------------------------
// Streaming primitive — yields text chunks incrementally (Ollama NDJSON +
// OpenAI-compatible SSE). Used by the UI / SSE proxy for progressive output.
// ---------------------------------------------------------------------------

async function* streamOllamaNdnjs(res: Response): AsyncIterable<{ text: string; model?: string }> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() || '';
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          if (data === '[DONE]') return;
          try {
            const parsed = JSON.parse(data) as { message?: { content?: string } };
            if (parsed.message?.content) yield { text: parsed.message.content };
          } catch { /* skip malformed chunk */ }
        }
      }
    }
    if (buf.trim()) {
      const parsed = JSON.parse(buf.trim()) as { message?: { content?: string } };
      if (parsed.message?.content) yield { text: parsed.message.content };
    }
  } finally {
    reader.releaseLock();
  }
}

async function* streamOpenAiSse(res: Response): AsyncIterable<{ text: string; model?: string }> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() || '';
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          if (data === '[DONE]') return;
          try {
            const parsed = JSON.parse(data) as { choices?: Array<{ delta?: { content?: string } }> };
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) yield { text: content };
          } catch { /* skip malformed chunk */ }
        }
      }
    }
    if (buf.trim()) {
      const parsed = JSON.parse(buf.trim()) as { choices?: Array<{ delta?: { content?: string } }> };
      const content = parsed.choices?.[0]?.delta?.content;
      if (content) yield { text: content };
    }
  } finally {
    reader.releaseLock();
  }
}

/** Streaming primitive: yields text chunks from a provider as an async iterable. */
export async function* generateContentStream(params: {
  base: string;
  chatPath: string;
  model: string;
  apiKey: string | null;
  messages: Array<{ role: string; content: string }>;
  config?: Record<string, unknown>;
}): AsyncIterable<{ text: string; model?: string }> {
  const url = `${params.base}${params.chatPath}`;
  const body: Record<string, unknown> = {
    model: params.model,
    messages: params.messages,
    stream: true,
  };
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (params.config?.responseMimeType) headers['Accept'] = 'text/event-stream';
  if (params.config?.maxTokens) body.max_tokens = params.config.maxTokens;
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(300_000),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Streaming ${params.base}${params.chatPath} failed (${res.status}): ${txt.slice(0, 300)}`);
  }
  if (params.base === OLLAMA_BASE) {
    yield* streamOllamaNdnjs(res);
  } else {
    yield* streamOpenAiSse(res);
  }
}

// ---------------------------------------------------------------------------
// Public API — keeps the GoogleGenAI-shaped caller contract.
// ---------------------------------------------------------------------------

export interface GenAIClient {
  models: {
    generateContent(params: { model?: string; contents: unknown; config?: Record<string, unknown> }): Promise<GenAIResult>;
    generateContentStream(params: { model?: string; contents: unknown; config?: Record<string, unknown> }): Promise<AsyncIterable<{ text: string; model?: string }>>;
  };
}

// ---------------------------------------------------------------------------
// Per-user AI preferences (BYOK). The read site in getGenAI was added by
// be-services-2 but the helper itself went missing in a later merge — restored
// here. Shape mirrors `ModelSettings` in modelSettingsRoutes.ts, which stores
// users.preferences as JSON.
// ---------------------------------------------------------------------------

export interface UserAiPreferences {
  mode: 'local' | 'byok';   // local → Ollama; byok → user key + provider
  provider?: string;
  apiKey?: string;          // decrypted by the host before setUserAiPreferences
  updatedAt?: string;
}

let _userAiPreferences: UserAiPreferences | undefined;

/** Host request layer publishes the signed-in user's preferences here.
 *  Pass `undefined` at logout / between requests. The key is never logged. */
export function setUserAiPreferences(prefs: UserAiPreferences | undefined): void {
  _userAiPreferences = prefs;
}

/** Read the current user's AI preferences. Standalone scripts without a request
 *  context can opt into BYOK via LEADJIN_AI_MODE=byok + LEADJIN_USER_API_KEY
 *  (+ optional LEADJIN_AI_PROVIDER). Returns undefined otherwise, so getGenAI
 *  keeps its historical behaviour of using the explicit userApiKey argument. */
export function getUserAiPreferences(): UserAiPreferences | undefined {
  if (_userAiPreferences) return _userAiPreferences;
  if ((process.env.LEADJIN_AI_MODE || '').trim().toLowerCase() !== 'byok') return undefined;
  const apiKey = (process.env.LEADJIN_USER_API_KEY || '').trim();
  return {
    mode: 'byok',
    provider: (process.env.LEADJIN_AI_PROVIDER || '').trim() || undefined,
    apiKey: apiKey || undefined,
  };
}

/** Thrown when a provider returns an empty completion. */
class EmptyCompletionError extends Error {
  constructor(message: string) { super(message); this.name = 'EmptyCompletionError'; }
}

export function getGenAI(userApiKey?: string): GenAIClient {
  const provider = LEADJIN_PROVIDER;

  // Map provider → { key getter, base, model, referer }. Restored from the
  // pre-be-services state (backups-20261123-svc/genaiClient.ts:552).
  const freeProviderConfig: Record<string, { keyFn: () => string; base: string; model: string; referer?: string } | null> = {
    [PROVIDER_OPENROUTER]: { keyFn: getOpenRouterKey, base: OPENROUTER_BASE, model: OPENROUTER_MODEL, referer: OPENROUTER_REFERRER },
    [PROVIDER_TOGETHER]:   { keyFn: getTogetherKey,   base: TOGETHER_BASE,   model: TOGETHER_MODEL },
    [PROVIDER_NVIDIA]:     { keyFn: getNvidiaKey,     base: NVIDIA_BASE,     model: NVIDIA_MODEL },
    [PROVIDER_NOUS]:       { keyFn: getNousKey,       base: NOUS_BASE,       model: NOUS_MODEL },
  };

  const prefs = getUserAiPreferences();
  /** Per-user 'byok' preference: use the user's key and provider. */
  const prefsByOk = Boolean(prefs && prefs.mode === 'byok');

  // Free provider with missing key → non-silent fall back to ollama.
  if (freeProviderConfig[provider] && !freeProviderConfig[provider]!.keyFn()) {
    console.error(`[genaiClient] LEADJIN_PROVIDER=${provider} (byok) requires an API key, falling back to local ollama`);
    return {
      models: {
        async generateContent(params: { model?: string; contents: unknown; config?: Record<string, unknown> }): Promise<GenAIResult> {
          const result = await callOllama({ model: resolveModel(PROVIDER_OLLAMA, params.model), contents: params.contents, config: params.config });
          // Caller-visible signal: the configured provider leg was skipped.
          return { ...result, fallbackFrom: provider, fallbackReason: 'missing API key' };
        },
        async generateContentStream(params: { model?: string; contents: unknown; config?: Record<string, unknown> }): Promise<AsyncIterable<{ text: string; model?: string }>> {
          return generateContentStream({ base: OLLAMA_BASE, chatPath: '/api/chat', model: resolveModel(PROVIDER_OLLAMA, params.model), apiKey: null, messages: buildMessages(params.contents), config: params.config });
        },
      },
    };
  }

  // Gateway fail-safe: non-silent downgrade when the gateway key is absent.
  if (provider === PROVIDER_GATEWAY && !getGatewayApiKey()) {
    console.error(`[genaiClient] LEADJIN_PROVIDER=gateway requires API_SERVER_KEY, falling back to local ollama (brain slot: ${describeBrainSlot().provider})`);
    return {
      models: {
        async generateContent(params: { model?: string; contents: unknown; config?: Record<string, unknown> }): Promise<GenAIResult> {
          const result = await callOllama({ model: resolveModel(PROVIDER_OLLAMA, params.model), contents: params.contents, config: params.config });
          // Caller-visible signal: the gateway leg was skipped (no API_SERVER_KEY),
          // so callers must not report this as a gateway-grounded answer.
          return { ...result, fallbackFrom: PROVIDER_GATEWAY, fallbackReason: 'missing API_SERVER_KEY' };
        },
        async generateContentStream(params: { model?: string; contents: unknown; config?: Record<string, unknown> }): Promise<AsyncIterable<{ text: string; model?: string }>> {
          return generateContentStream({ base: OLLAMA_BASE, chatPath: '/api/chat', model: resolveModel(PROVIDER_OLLAMA, params.model), apiKey: null, messages: buildMessages(params.contents), config: params.config });
        },
      },
    };
  }

  return {
    models: {
      async generateContent(params: { model?: string; contents: unknown; config?: Record<string, unknown>; context?: Record<string, unknown> }): Promise<GenAIResult> {
        const resolvedModel = resolveModel(provider, params.model);
        const serialized = serializeContents(params.contents, params.context);
        const messages = buildMessages(serialized);
        const temperature = typeof params.config?.temperature === 'number' ? params.config.temperature : undefined;
        const maxTokens = typeof params.config?.maxTokens === 'number' ? params.config.maxTokens : undefined;
        const topP = typeof params.config?.topP === 'number' ? params.config.topP : undefined;

        // Ollama dispatch.
        if (provider === PROVIDER_OLLAMA) {
          const result = await callOllama({ model: resolvedModel, contents: serialized, config: params.config });
          if (!result.text) throw new EmptyCompletionError('Local model returned an empty completion');
          return result;
        }

        // Free serverless dispatch — zero cost, no cap.
        const freeCfg = freeProviderConfig[provider];
        if (freeCfg) {
          try {
            const apiKey = prefsByOk ? (prefs!.apiKey || '') : (userApiKey || '');
            const result = await callFreeProvider({
              base: freeCfg.base,
              model: resolvedModel,
              apiKey,
              messages,
              temperature,
              maxTokens,
              topP,
              referer: freeCfg.referer,
            });
            if (!result.text) throw new EmptyCompletionError('Free provider returned an empty completion');
            // Track usage in ledger for observability ($0 cost).
            if (result.usage) {
              const ledger = loadLedger();
              const rotated = rotateIfNeeded(ledger);
              const updated = recordFreeSpend(rotated, result.usage.promptTokens, result.usage.completionTokens, provider, resolvedModel);
              saveLedger(updated);
            }
            return result;
          } catch (err) {
            console.warn(`[genaiClient] free provider ${provider} failed, falling back to local: ${(err as Error).message}`);
            return callOllama({ model: resolveModel(PROVIDER_OLLAMA, params.model), contents: params.contents, config: params.config });
          }
        }

        // Paid cloud leg (gateway).
        const ledger = loadLedger();
        const rotated = rotateIfNeeded(ledger);
        const estimated = estimateCost({ model: resolvedModel, contents: params.contents, config: params.config });
        if (!canAffordCloud(rotated, estimated)) {
          console.warn(`[genaiClient] monthly cloud cap (${MONTHLY_CAP_USD} USD) exceeded → refusing cloud, falling back to local Gemma`);
          return localFallbackResponse({ model: resolvedModel, contents: params.contents, config: params.config });
        }

        let response;
        try {
          response = await callGateway({ model: resolvedModel, contents: serialized, config: params.config });
        } catch (err) {
          console.warn(`[genaiClient] cloud call failed, falling back to local: ${(err as Error).message}`);
          return localFallbackResponse({ model: resolvedModel, contents: params.contents, config: params.config }, err);
        }

        // Record spend from the gateway's returned usage object when present.
        if (response.usage) {
          const { promptTokens, completionTokens } = response.usage;
          const actualCost = promptTokens * CLOUD_PROMPT_RATE / 1e6 + completionTokens * CLOUD_COMPLETION_RATE / 1e6;
          const updated = addCloudSpend(rotated, promptTokens, completionTokens, actualCost);
          if (updated.totalCostUsd <= MONTHLY_CAP_USD) {
            saveLedger(updated);
          } else {
            saveLedger(rotated);
            console.warn(`[genaiClient] cloud spend exceeded monthly cap (${MONTHLY_CAP_USD} USD) → refusing, falling back to local Gemma`);
            return localFallbackResponse({ model: resolvedModel, contents: params.contents, config: params.config });
          }
        }
        if (!response.text) throw new EmptyCompletionError('Gateway returned an empty completion');
        return response;
      },
      async generateContentStream(params: { model?: string; contents: unknown; config?: Record<string, unknown> }): Promise<AsyncIterable<{ text: string; model?: string }>> {
        const apiKey = prefsByOk ? (prefs!.apiKey || '') : (userApiKey || '');
        return generateContentStream({ base: GATEWAY_BASE, chatPath: '/chat/completions', model: resolveModel(provider, params.model), apiKey, messages: buildMessages(serializeContents(params.contents, params.config)), config: params.config });
      },
    },
  };
}
