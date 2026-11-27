/**
 * brainSlot.ts — one provider slot for Jin.
 *
 * Contract (autopilot-v1 lane F3+F4):
 *  - ollama is the default provider: http://127.0.0.1:11434/v1, model from
 *    LEADJIN_MODEL (default gemma4:e4b), no API key.
 *  - byok is selected only when LEADJIN_BYOK_BASE_URL, LEADJIN_BYOK_MODEL and
 *    LEADJIN_BYOK_API_KEY are all present. The key is presence-checked only:
 *    it is sent as a header at call time and never exposed by describeBrainSlot.
 *  - gateway is selected explicitly (LEADJIN_BRAIN_PROVIDER=gateway) against a
 *    local OpenAI-compatible gateway base.
 *  - every adapter uses the same /chat/completions call with a timeout and a
 *    typed error; a missing provider degrades with a named reason instead of
 *    inventing a completion.
 *
 * This module makes no network call at import time and stores no secret.
 */
export type BrainProvider = 'ollama' | 'byok' | 'gateway';
export type BrainProviderResolution = BrainProvider | 'unavailable';

export interface BrainMessage {
  role: 'system' | 'user' | 'assistant' | string;
  content: string;
}

export interface BrainChatOptions {
  /** Override the per-call timeout (ms). Default 20_000. */
  timeoutMs?: number;
  /** Per-call model override; falls back to the slot's configured model. */
  model?: string;
  temperature?: number;
}

export interface BrainSlot {
  id: string;
  chat(messages: BrainMessage[], opts?: BrainChatOptions): Promise<string>;
}

export interface BrainSlotResolution {
  slot: BrainSlot;
  provider: BrainProviderResolution;
  /** Named reason when provider === 'unavailable'. */
  reason?: string;
}

export interface BrainSlotDescription {
  provider: BrainProviderResolution;
  model: string;
  base_url: string;
  reason?: string;
}

/** Typed error for every failure a brain slot can produce. */
export class BrainSlotError extends Error {
  readonly provider: BrainProviderResolution;
  readonly reason: string;
  readonly status?: number;

  constructor(
    message: string,
    init: { provider: BrainProviderResolution; reason: string; status?: number },
  ) {
    super(message);
    this.name = 'BrainSlotError';
    this.provider = init.provider;
    this.reason = init.reason;
    if (init.status !== undefined) this.status = init.status;
  }
}

const DEFAULT_TIMEOUT_MS = 20_000;
const OLLAMA_BASE = 'http://127.0.0.1:11434/v1';
const OLLAMA_MODEL = 'gemma4:e4b';
const GATEWAY_BASE = 'http://127.0.0.1:8645/v1';
const GATEWAY_MODEL = 'google/flash-2.5-flash-lite';

/** Description metadata lives beside the slot, never on a public slot field. */
const descriptions = new WeakMap<BrainSlot, BrainSlotDescription>();

interface AdapterConfig {
  id: string;
  provider: BrainProvider;
  baseUrl: string;
  model: string;
  /** Presence-checked only; sent at call time, never echoed in a description. */
  apiKey?: string;
}

function makeAdapter(config: AdapterConfig): BrainSlot {
  const chat = async (messages: BrainMessage[], opts: BrainChatOptions = {}): Promise<string> => {
    if (!Array.isArray(messages) || messages.length === 0) {
      throw new BrainSlotError('chat requires at least one message', {
        provider: config.provider,
        reason: 'empty_messages',
      });
    }
    const requested = opts.timeoutMs;
    const timeoutMs =
      typeof requested === 'number' && Number.isFinite(requested) && requested > 0
        ? requested
        : DEFAULT_TIMEOUT_MS;

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;

    const body: Record<string, unknown> = {
      model: opts.model?.trim() || config.model,
      messages,
    };
    if (opts.temperature !== undefined) body.temperature = opts.temperature;

    let response: Response;
    try {
      response = await fetch(`${config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      throw new BrainSlotError(
        `brain slot ${config.id} request failed: ${error instanceof Error ? error.message : String(error)}`,
        { provider: config.provider, reason: 'request_failed' },
      );
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new BrainSlotError(
        `brain slot ${config.id} HTTP ${response.status}: ${detail.slice(0, 200)}`,
        { provider: config.provider, reason: `http_${response.status}`, status: response.status },
      );
    }

    let data: { choices?: Array<{ message?: { content?: unknown } }> };
    try {
      data = (await response.json()) as typeof data;
    } catch (error) {
      throw new BrainSlotError(
        `brain slot ${config.id} returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
        { provider: config.provider, reason: 'invalid_json' },
      );
    }
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || content.length === 0) {
      throw new BrainSlotError(`brain slot ${config.id} returned an empty completion`, {
        provider: config.provider,
        reason: 'empty_completion',
      });
    }
    return content;
  };

  const slot: BrainSlot = { id: config.id, chat };
  descriptions.set(slot, {
    provider: config.provider,
    model: config.model,
    base_url: config.baseUrl,
  });
  return slot;
}

/** A slot that degrades honestly: chat throws a typed, named error. */
function makeUnavailable(reason: string): BrainSlotResolution {
  const slot: BrainSlot = {
    id: 'brain-unavailable',
    chat: async () => {
      throw new BrainSlotError(`brain provider unavailable: ${reason}`, {
        provider: 'unavailable',
        reason,
      });
    },
  };
  descriptions.set(slot, {
    provider: 'unavailable',
    model: '',
    base_url: '',
    reason,
  });
  return { slot, provider: 'unavailable', reason };
}

function present(env: Record<string, string | undefined>, key: string): boolean {
  const value = env[key];
  return typeof value === 'string' && value.trim().length > 0;
}

/** Resolve the single brain slot from environment (injectable for tests). */
export function resolveBrainSlot(
  env: Record<string, string | undefined> = process.env,
): BrainSlotResolution {
  const explicit = (env.LEADJIN_BRAIN_PROVIDER || '').trim().toLowerCase();

  if (explicit && explicit !== 'ollama' && explicit !== 'byok' && explicit !== 'gateway') {
    return makeUnavailable(`unknown_provider:${explicit}`);
  }

  const byokBase = (env.LEADJIN_BYOK_BASE_URL || '').trim();
  const byokModel = (env.LEADJIN_BYOK_MODEL || '').trim();
  const byokKey = (env.LEADJIN_BYOK_API_KEY || '').trim();
  const byokReady = Boolean(byokBase && byokModel && byokKey);

  if (explicit === 'byok' || (!explicit && (byokBase || byokModel || byokKey))) {
    const missing: string[] = [];
    if (!byokBase) missing.push('LEADJIN_BYOK_BASE_URL');
    if (!byokModel) missing.push('LEADJIN_BYOK_MODEL');
    if (!byokKey) missing.push('LEADJIN_BYOK_API_KEY');
    if (missing.length > 0) return makeUnavailable(`missing_byok_configuration:${missing.join(',')}`);
    return {
      provider: 'byok',
      slot: makeAdapter({
        id: 'brain-byok',
        provider: 'byok',
        baseUrl: byokBase,
        model: byokModel,
        apiKey: byokKey,
      }),
    };
  }

  if (explicit === 'gateway') {
    const baseUrl = (env.LEADJIN_GATEWAY_BASE_URL || '').trim() || GATEWAY_BASE;
    const model = (env.LEADJIN_GATEWAY_MODEL || '').trim() || GATEWAY_MODEL;
    // Presence-checked for selection; the real value is used only as a request
    // header at call time and is never placed in a description or a log.
    const apiKey =
      present(env, 'API_SERVER_KEY') || present(env, 'LEADJIN_GATEWAY_API_KEY')
        ? ((env.API_SERVER_KEY || env.LEADJIN_GATEWAY_API_KEY || '').trim() || undefined)
        : undefined;
    return {
      provider: 'gateway',
      slot: makeAdapter({ id: 'brain-gateway', provider: 'gateway', baseUrl, model, apiKey }),
    };
  }

  // Default and explicit 'ollama' — no key, no billing.
  const model = (env.LEADJIN_MODEL || '').trim() || OLLAMA_MODEL;
  return {
    provider: 'ollama',
    slot: makeAdapter({
      id: 'brain-ollama',
      provider: 'ollama',
      baseUrl: OLLAMA_BASE,
      model,
    }),
  };
}

/**
 * Safe description of a slot: provider, model, base_url and an optional named
 * reason. Contains no key material under any provider.
 */
export function describeBrainSlot(
  from?: BrainSlot | BrainSlotResolution,
): BrainSlotDescription {
  const slot: BrainSlot =
    from === undefined ? resolveBrainSlot().slot : 'slot' in from ? from.slot : from;
  const stored = descriptions.get(slot);
  if (!stored) return { provider: 'unavailable', model: '', base_url: '', reason: 'unknown_slot' };
  return { ...stored };
}
