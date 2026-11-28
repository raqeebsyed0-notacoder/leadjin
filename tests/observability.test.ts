import { describe, it, expect } from 'vitest';
import {
  beginRunReport,
  recordStage,
  finishRunReport,
  summarise,
  MissingFailureReasonError,
} from '../src/services/observability';

/** Deterministic clock so latency assertions are exact, not timing-dependent. */
function clock(start = 1_700_000_000_000) {
  let t = start;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

describe('observability — run reports', () => {
  it('records each stage with its fields and aggregates cost', () => {
    const c = clock();
    const handle = beginRunReport('discovery', c.now);
    recordStage(handle, { stage: 'search', ok: true, engine: 'laya', ms: 120, cost_usd: 0.01 });

    const report = finishRunReport(handle);
    expect(report.kind).toBe('discovery');
    expect(report.stages).toHaveLength(1);
    expect(report.stages[0]).toMatchObject({
      stage: 'search',
      ok: true,
      engine: 'laya',
      ms: 120,
      cost_usd: 0.01,
    });
    expect(report.cost_usd).toBeCloseTo(0.01);
    expect(report.failure_reasons).toEqual([]);
    expect(report.engines_used).toEqual(['laya']);
  });

  it('computes latency from begin to finish', () => {
    const c = clock();
    const handle = beginRunReport('harvest', c.now);
    c.advance(345);

    const report = finishRunReport(handle);
    expect(report.latency_ms).toBe(345);
    expect(new Date(report.finished_at).getTime() - new Date(report.started_at).getTime()).toBe(345);
  });

  it('deduplicates engines, preserving first-seen order', () => {
    const c = clock();
    const handle = beginRunReport('mixed', c.now);
    recordStage(handle, { stage: 'a', ok: true, engine: 'laya' });
    recordStage(handle, { stage: 'b', ok: true, engine: 'hunter' });
    recordStage(handle, { stage: 'c', ok: true, engine: 'laya' });
    recordStage(handle, { stage: 'd', ok: true, engine: '' });

    const report = finishRunReport(handle);
    expect(report.engines_used).toEqual(['laya', 'hunter']);
    expect(report.stages[3].engine).toBeNull();
  });

  it('refuses to close a failed stage with no reason (typed error)', () => {
    const c = clock();
    const handle = beginRunReport('verify', c.now);
    recordStage(handle, { stage: 'dedupe', ok: false, engine: 'laya' });

    expect(() => finishRunReport(handle)).toThrow(MissingFailureReasonError);
    expect(() => finishRunReport(handle)).toThrow(/reason/);
  });

  it('treats a whitespace-only failure reason as missing', () => {
    const c = clock();
    const handle = beginRunReport('verify', c.now);
    recordStage(handle, { stage: 'dedupe', ok: false, reason: '   ' });

    try {
      finishRunReport(handle);
      throw new Error('expected finishRunReport to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(MissingFailureReasonError);
      expect((err as MissingFailureReasonError).stage).toBe('dedupe');
    }
  });

  it('accepts a failure that carries a non-empty reason', () => {
    const c = clock();
    const handle = beginRunReport('verify', c.now);
    recordStage(handle, {
      stage: 'dedupe',
      ok: false,
      engine: 'laya',
      reason: 'upstream timeout',
    });

    const report = finishRunReport(handle);
    expect(report.failure_reasons).toEqual(['upstream timeout']);
    expect(report.engines_used).toEqual(['laya']);
  });

  it('summarises totals by engine and by failure reason', () => {
    const c = clock();
    const h1 = beginRunReport('r1', c.now);
    recordStage(h1, { stage: 'a', ok: true, engine: 'laya', ms: 100, cost_usd: 0.2 });
    recordStage(h1, {
      stage: 'b', ok: false, engine: 'hunter', ms: 50, cost_usd: 0.1, reason: 'rate_limit',
    });
    const r1 = finishRunReport(h1);

    const h2 = beginRunReport('r2', c.now);
    recordStage(h2, { stage: 'c', ok: true, engine: 'laya', ms: 200, cost_usd: 0.05 });
    recordStage(h2, { stage: 'd', ok: false, engine: 'laya', ms: 30, cost_usd: 0, reason: 'rate_limit' });
    const r2 = finishRunReport(h2);

    const summary = summarise([r1, r2]);
    expect(summary.report_count).toBe(2);
    expect(summary.total_cost_usd).toBeCloseTo(0.35);
    expect(summary.total_latency_ms).toBe(0);

    expect(summary.by_engine['laya'].stages).toBe(3);
    expect(summary.by_engine['laya'].ms).toBe(330);
    expect(summary.by_engine['laya'].cost_usd).toBeCloseTo(0.25);
    expect(summary.by_engine['laya'].failures).toBe(1);

    expect(summary.by_engine['hunter'].stages).toBe(1);
    expect(summary.by_engine['hunter'].ms).toBe(50);
    expect(summary.by_engine['hunter'].cost_usd).toBeCloseTo(0.1);
    expect(summary.by_engine['hunter'].failures).toBe(1);

    expect(summary.by_failure_reason).toEqual({ rate_limit: 2 });
  });

  it('returns zeroed totals for an empty report set', () => {
    expect(summarise([])).toEqual({
      report_count: 0,
      total_cost_usd: 0,
      total_latency_ms: 0,
      by_engine: {},
      by_failure_reason: {},
    });
  });
});
