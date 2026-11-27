/**
 * brain-slot.test.ts — F3+F4 acceptance for the single Jin brain slot.
 * No network: fetch is stubbed for every chat() call.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  BrainSlotError,
  describeBrainSlot,
  resolveBrainSlot,
  type BrainSlotResolution,
} from '../src/services/brainSlot.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const completion = { choices: [{ message: { content: 'Jin says hello' } }] };

describe('resolveBrainSlot', () => {
  it('uses ollama by default, with no key material in the description', () => {
    const resolution = resolveBrainSlot({});
    expect(resolution.provider).toBe('ollama');
    expect(resolution.reason).toBeUndefined();

    const described = describeBrainSlot(resolution);
    expect(described).toEqual({
      provider: 'ollama',
      model: 'gemma4:e4b',
      base_url: 'http://127.0.0.1:11434/v1',
    });
    expect(JSON.stringify(described)).not.toMatch(/key|bearer|secret/i);
  });

  it('honours LEADJIN_MODEL for the ollama slot', () => {
    const described = describeBrainSlot(resolveBrainSlot({ LEADJIN_MODEL: 'gemma4:e4b' }));
    expect(described.model).toBe('gemma4:e4b');
  });

  it('selects byok only when its three vars are present', () => {
    const full = resolveBrainSlot({
      LEADJIN_BYOK_BASE_URL: 'https://byok.example/v1',
      LEADJIN_BYOK_MODEL: 'my-model',
      LEADJIN_BYOK_API_KEY: 'presence-only-value',
    });
    expect(full.provider).toBe('byok');
    const described = describeBrainSlot(full);
    expect(described).toEqual({
      provider: 'byok',
      model: 'my-model',
      base_url: 'https://byok.example/v1',
    });
    expect(JSON.stringify(described)).not.toContain('presence-only-value');

    const partial = resolveBrainSlot({
      LEADJIN_BYOK_BASE_URL: 'https://byok.example/v1',
      LEADJIN_BYOK_MODEL: 'my-model',
    });
    expect(partial.provider).toBe('unavailable');
    expect(partial.reason).toContain('missing_byok_configuration');
    expect(partial.reason).toContain('LEADJIN_BYOK_API_KEY');

    // Partial BYOK config must not silently fall back to ollama.
    const absent: BrainSlotResolution = resolveBrainSlot({});
    expect(absent.provider).toBe('ollama');
  });

  it('selects gateway when selected', () => {
    const gateway = resolveBrainSlot({ LEADJIN_BRAIN_PROVIDER: 'gateway' });
    expect(gateway.provider).toBe('gateway');
    expect(describeBrainSlot(gateway)).toEqual({
      provider: 'gateway',
      model: 'google/flash-2.5-flash-lite',
      base_url: 'http://127.0.0.1:8645/v1',
    });

    const custom = resolveBrainSlot({
      LEADJIN_BRAIN_PROVIDER: 'gateway',
      LEADJIN_GATEWAY_BASE_URL: 'http://127.0.0.1:9999/v1',
      LEADJIN_GATEWAY_MODEL: 'local-gateway-model',
    });
    expect(describeBrainSlot(custom).base_url).toBe('http://127.0.0.1:9999/v1');
    expect(describeBrainSlot(custom).model).toBe('local-gateway-model');
  });

  it('degrades with a named reason when the provider is missing or unknown', async () => {
    const unknown = resolveBrainSlot({ LEADJIN_BRAIN_PROVIDER: 'nowhere' });
    expect(unknown.provider).toBe('unavailable');
    expect(unknown.reason).toBe('unknown_provider:nowhere');

    await expect(unknown.slot.chat([{ role: 'user', content: 'hi' }])).rejects.toMatchObject({
      name: 'BrainSlotError',
      reason: 'unknown_provider:nowhere',
    });
    expect(describeBrainSlot(unknown).reason).toBe('unknown_provider:nowhere');
  });
});

describe('brain slot chat adapter', () => {
  it('calls /chat/completions with a timeout and returns the message content', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(completion));
    vi.stubGlobal('fetch', fetchMock);

    const { slot } = resolveBrainSlot({});
    const text = await slot.chat([{ role: 'user', content: 'hello' }]);
    expect(text).toBe('Jin says hello');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://127.0.0.1:11434/v1/chat/completions');
    expect(init.method).toBe('POST');
    expect(init.signal).toBeDefined();
    const body = JSON.parse(String(init.body)) as { model: string; messages: unknown[] };
    expect(body.model).toBe('gemma4:e4b');
    expect(body.messages).toHaveLength(1);
    expect(JSON.stringify(init.headers)).not.toContain('Authorization');
  });

  it('raises typed errors for HTTP failure, empty completion and empty input', async () => {
    const { slot } = resolveBrainSlot({});

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: 'nope' }, 503)));
    await expect(slot.chat([{ role: 'user', content: 'hi' }])).rejects.toBeInstanceOf(BrainSlotError);
    await expect(slot.chat([{ role: 'user', content: 'hi' }])).rejects.toMatchObject({
      reason: 'http_503',
      status: 503,
      provider: 'ollama',
    });

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ choices: [] })));
    await expect(slot.chat([{ role: 'user', content: 'hi' }])).rejects.toMatchObject({
      reason: 'empty_completion',
    });

    await expect(slot.chat([])).rejects.toMatchObject({ reason: 'empty_messages' });
  });

  it('sends a BYOK key only as a header, never in the description', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(completion));
    vi.stubGlobal('fetch', fetchMock);

    const resolution = resolveBrainSlot({
      LEADJIN_BYOK_BASE_URL: 'https://byok.example/v1',
      LEADJIN_BYOK_MODEL: 'my-model',
      LEADJIN_BYOK_API_KEY: 'presence-only-value',
    });
    await resolution.slot.chat([{ role: 'user', content: 'hi' }]);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.stringify(init.headers)).toContain('presence-only-value');
    expect(JSON.stringify(describeBrainSlot(resolution))).not.toContain('presence-only-value');
  });
});
