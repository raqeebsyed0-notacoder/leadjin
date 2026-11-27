/**
 * sending-policy.test.ts — F6 acceptance tests (offline, pure).
 * Run: npx vitest run tests/sending-policy.test.ts
 */
import { describe, it, expect } from 'vitest';
import {
  cadence,
  nextTouch,
  renderTouch,
  deliverabilityCheck,
  withinCeilings,
  warmupState,
  SendingPolicyError,
  CLOSING_STATEMENT_AR,
  BOUNCE_RATE_CEILING,
  COMPLAINT_RATE_CEILING,
  type RenderContext,
} from '../src/services/sendingPolicy.js';

const identity = { name: 'Noura', company: 'LeadJin', cr: '1234567890' };
const OPT_OUT = 'https://example.com/optout?t=abc';
const okCtx = (over: Partial<RenderContext> = {}): RenderContext => ({
  identity,
  optOutUrl: OPT_OUT,
  consent_check: () => ({ allowed: true }),
  ...over,
});

describe('F6 cadence (D2)', () => {
  it('cadence() returns exactly three touches in order', () => {
    const touches = cadence();
    expect(touches).toHaveLength(3);
    expect(touches.map((t) => t.day)).toEqual([0, 3, 5]);
    expect(touches.map((t) => t.kind)).toEqual(['intro', 'followup', 'closing']);
  });

  it('returns the next touch for the first three attempts', () => {
    expect(nextTouch(0).touch?.kind).toBe('intro');
    expect(nextTouch(1).touch?.kind).toBe('followup');
    expect(nextTouch(2).touch?.kind).toBe('closing');
  });

  it('never returns a fourth touch, under any input', () => {
    for (const n of [3, 4, 99, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const result = nextTouch(n);
      expect(result.touch).toBeNull();
      expect(result.reason).toBe('cadence_exhausted');
    }
  });

  it('day 0 intro carries no sales pitch', () => {
    const intro = cadence()[0]!;
    expect(intro.day).toBe(0);
    expect(intro.hasPitch).toBe(false);
    expect(intro.bodyAr).not.toMatch(/عرض|سعر|خصم|اشترِ/);
    expect(intro.bodyEn).not.toMatch(/\b(buy|discount|price|offer)\b/i);
  });

  it('closing mail states we will not write again', () => {
    const closing = cadence()[2]!;
    expect(closing.isClosing).toBe(true);
    expect(closing.bodyAr).toContain(CLOSING_STATEMENT_AR);
  });
});

describe('F6 renderTouch — identity, RTL, opt-out, consent', () => {
  it('refuses to render without a consent_check callback', () => {
    const bad = { identity, optOutUrl: OPT_OUT } as RenderContext;
    expect(() => renderTouch(cadence()[0]!, bad)).toThrow(SendingPolicyError);
    try {
      renderTouch(cadence()[0]!, bad);
    } catch (error) {
      expect((error as SendingPolicyError).code).toBe('consent_check_missing');
    }
  });

  it('refuses when consent_check returns not allowed', () => {
    const denied = okCtx({ consent_check: () => ({ allowed: false, reason: 'withdrawn' }) });
    try {
      renderTouch(cadence()[0]!, denied);
      throw new Error('expected renderTouch to refuse');
    } catch (error) {
      expect((error as SendingPolicyError).code).toBe('consent_not_allowed');
    }
  });

  it('returns subject/html/text with dir="rtl" and lang="ar" on the Arabic body', () => {
    const touch = cadence()[0]!;
    const rendered = renderTouch(touch, okCtx());
    expect(Object.keys(rendered).sort()).toEqual(['html', 'subject', 'text']);
    expect(rendered.html).toContain('dir="rtl"');
    expect(rendered.html).toContain('lang="ar"');
    expect(rendered.html).toContain(touch.bodyAr);
    expect(rendered.text).toContain(touch.bodyAr);
  });

  it('carries footer identity and a working opt-out on every touch', () => {
    for (const touch of cadence()) {
      const rendered = renderTouch(touch, okCtx());
      expect(rendered.html).toContain('Noura');
      expect(rendered.html).toContain('LeadJin');
      expect(rendered.html).toContain('1234567890');
      expect(rendered.html).toContain(`href="${OPT_OUT}"`);
      expect(rendered.text).toContain(OPT_OUT);
    }
  });
});

describe('F6 deliverability (injected DNS, pure)', () => {
  it('blocks the send when DMARC is missing', () => {
    const result = deliverabilityCheck('example.com', { spf: true, dkim: true, dmarc: false });
    expect(result).toEqual({ spf: true, dkim: true, dmarc: false, blockSend: true });
  });

  it('does not block when SPF, DKIM and DMARC all pass', () => {
    expect(deliverabilityCheck('example.com', { spf: true, dkim: true, dmarc: true }).blockSend).toBe(false);
  });

  it('degrades to blockSend when no injected result exists for the domain', () => {
    const result = deliverabilityCheck('unknown.test', {
      'example.com': { spf: true, dkim: true, dmarc: true },
    });
    expect(result.blockSend).toBe(true);
  });
});

describe('F6 rate ceilings', () => {
  it('accepts rates strictly under both ceilings', () => {
    expect(withinCeilings({ bounce_rate: 0.004, complaint_rate: 0.0009 })).toEqual({
      ok: true,
      failures: [],
    });
  });

  it('rejects bounce_rate at the 0.005 ceiling', () => {
    expect(withinCeilings({ bounce_rate: BOUNCE_RATE_CEILING, complaint_rate: 0.0005 }).ok).toBe(false);
  });

  it('rejects complaint_rate at the 0.001 ceiling', () => {
    const result = withinCeilings({ bounce_rate: 0.001, complaint_rate: COMPLAINT_RATE_CEILING });
    expect(result.ok).toBe(false);
    expect(result.failures).toContain('complaint_rate');
  });
});

describe('F6 warmup state machine', () => {
  it('ramps the daily ceiling and stops at it', () => {
    expect(warmupState(0, 1)).toMatchObject({ dailyCeiling: 10, allowed: true, hardStop: false });
    expect(warmupState(9, 1).remaining).toBe(1);
    expect(warmupState(10, 1)).toMatchObject({
      dailyCeiling: 10,
      remaining: 0,
      allowed: false,
      hardStop: true,
    });
  });

  it('has a hard stop before warmup starts', () => {
    expect(warmupState(0, 0)).toMatchObject({
      allowed: false,
      hardStop: true,
      dailyCeiling: 0,
      reason: 'warmup_not_started',
    });
  });

  it('never allows a send above the hard ceiling', () => {
    expect(warmupState(50, 30).hardStop).toBe(true);
    expect(warmupState(50, 30).allowed).toBe(false);
  });
});
