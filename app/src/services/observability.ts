/**
 * Observability for autopilot run reports.
 *
 * Pure, in-memory service: no network, no DB, no secrets. Every run report
 * carries cost, latency, engines used and failure reasons (lane F8).
 *
 * Contract:
 *   beginRunReport(kind) -> handle
 *   recordStage(handle, {stage, ok, engine?, ms?, cost_usd?, reason?})
 *   finishRunReport(handle) -> RunReport
 *   summarise(reports) -> totals by engine and by failure reason
 */

export interface StageInput {
  stage: string;
  ok: boolean;
  engine?: string;
  ms?: number;
  cost_usd?: number;
  reason?: string;
}

export interface StageRecord {
  stage: string;
  ok: boolean;
  engine: string | null;
  ms: number;
  cost_usd: number;
  reason: string | null;
}

export interface RunReportHandle {
  kind: string;
  started_at: string;
  /** Internal: clock origin, kept on the handle so finish needs no extra args. */
  startedAtMs: number;
  /** Internal: injectable clock (defaults to Date.now). */
  now: () => number;
  /** Internal: stages are appended here as they are recorded. */
  stages: StageRecord[];
}

export interface RunReport {
  kind: string;
  started_at: string;
  finished_at: string;
  latency_ms: number;
  cost_usd: number;
  engines_used: string[];
  failure_reasons: string[];
  stages: StageRecord[];
}

export interface EngineTotals {
  stages: number;
  ms: number;
  cost_usd: number;
  failures: number;
}

export interface ObservabilitySummary {
  report_count: number;
  total_cost_usd: number;
  total_latency_ms: number;
  by_engine: Record<string, EngineTotals>;
  by_failure_reason: Record<string, number>;
}

/** Typed error thrown when a failed stage is closed without a reason. */
export class MissingFailureReasonError extends Error {
  readonly stage: string;

  constructor(stage: string) {
    super(`Stage "${stage}" failed without a non-empty reason`);
    this.name = 'MissingFailureReasonError';
    this.stage = stage;
    // Keep instanceof working across transpilation targets.
    Object.setPrototypeOf(this, MissingFailureReasonError.prototype);
  }
}

function optionalText(value: string | undefined | null): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function nonNegativeNumber(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return 0;
  return value;
}

/** Start a run report. `now` is injectable for deterministic latency tests. */
export function beginRunReport(kind: string, now: () => number = Date.now): RunReportHandle {
  const startedAtMs = now();
  return {
    kind,
    started_at: new Date(startedAtMs).toISOString(),
    startedAtMs,
    now,
    stages: [],
  };
}

/** Append one stage. A failed stage may be recorded here, but cannot be closed without a reason. */
export function recordStage(handle: RunReportHandle, input: StageInput): void {
  const record: StageRecord = {
    stage: input.stage,
    ok: input.ok === true,
    engine: optionalText(input.engine),
    ms: nonNegativeNumber(input.ms),
    cost_usd: nonNegativeNumber(input.cost_usd),
    reason: optionalText(input.reason),
  };
  handle.stages.push(record);
}

/**
 * Close a run report into its immutable value.
 * Throws {@link MissingFailureReasonError} if any failed stage has no non-empty reason.
 */
export function finishRunReport(handle: RunReportHandle): RunReport {
  for (const stage of handle.stages) {
    if (!stage.ok && stage.reason === null) {
      throw new MissingFailureReasonError(stage.stage);
    }
  }

  const finishedAtMs = handle.now();
  const cost_usd = handle.stages.reduce((sum, stage) => sum + stage.cost_usd, 0);
  const engines_used = Array.from(
    new Set(
      handle.stages
        .map((stage) => stage.engine)
        .filter((engine): engine is string => engine !== null),
    ),
  );
  const failure_reasons = handle.stages
    .filter((stage) => !stage.ok)
    .map((stage) => stage.reason as string);

  return {
    kind: handle.kind,
    started_at: handle.started_at,
    finished_at: new Date(finishedAtMs).toISOString(),
    latency_ms: Math.max(0, finishedAtMs - handle.startedAtMs),
    cost_usd,
    engines_used,
    failure_reasons,
    stages: handle.stages.map((stage) => ({ ...stage })),
  };
}

/** Aggregate finished reports. Empty input yields zeroed totals, never invented metrics. */
export function summarise(reports: RunReport[]): ObservabilitySummary {
  const by_engine: Record<string, EngineTotals> = {};
  const by_failure_reason: Record<string, number> = {};
  let total_cost_usd = 0;
  let total_latency_ms = 0;

  for (const report of reports) {
    total_cost_usd += report.cost_usd;
    total_latency_ms += report.latency_ms;

    for (const reason of report.failure_reasons) {
      by_failure_reason[reason] = (by_failure_reason[reason] ?? 0) + 1;
    }

    for (const stage of report.stages) {
      const engine = stage.engine;
      if (engine === null) continue;
      const bucket: EngineTotals = by_engine[engine] ?? {
        stages: 0,
        ms: 0,
        cost_usd: 0,
        failures: 0,
      };
      bucket.stages += 1;
      bucket.ms += stage.ms;
      bucket.cost_usd += stage.cost_usd;
      if (!stage.ok) bucket.failures += 1;
      by_engine[engine] = bucket;
    }
  }

  return {
    report_count: reports.length,
    total_cost_usd,
    total_latency_ms,
    by_engine,
    by_failure_reason,
  };
}
