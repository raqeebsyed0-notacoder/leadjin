/**
 * autopilot-loop.test.ts — F5 acceptance tests.
 *
 * Coverage per the autopilot-v1 lane spec (F5):
 *  - due/not-due with named skip reasons
 *  - idempotence of tickScheduler for the same (goal.id, tick_bucket)
 *  - run history write + read (startRun / finishRun / listRuns)
 *  - decision inbox resolve
 *  - goal validation refusals
 *  - delegated-job row recording (recordDelegatedRun)
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import {
  validateGoal,
  tickBucket,
  tickScheduler,
  recordDelegatedRun,
  JOB_IDS,
  type Goal,
  type TickResult,
  type ScheduledJob,
} from '../src/services/autopilotLoop.js';
import {
  ensureAutopilotRunsSchema,
  ensureDecisionInboxSchema,
  startRun,
  finishRun,
  listRuns,
  pendingDecisions,
  resolveDecision,
  insertDecision,
  type AutopilotRunRow,
  type DecisionInboxRow,
} from '../src/services/runHistory.js';

describe('validateGoal — acceptance and refusal', () => {
  const valid: Goal = {
    id: 'g-1',
    name: 'Alpha',
    target_industry: 'fintech',
    geography: 'Riyadh',
    cadence: 'daily',
    daily_cap: 5,
    status: 'active',
  };

  it('accepts a complete goal', () => {
    expect(validateGoal(valid)).toEqual({ ok: true, goal: valid });
  });

  it('refuses a non-object goal', () => {
    expect(validateGoal(null as unknown)).toEqual({ ok: false, reason: 'goal_missing' });
    expect(validateGoal(42 as unknown)).toEqual({ ok: false, reason: 'goal_missing' });
  });

  it('refuses a goal missing required fields', () => {
    expect(validateGoal({ ...valid, id: '' })).toEqual({ ok: false, reason: 'missing_id' });
    expect(validateGoal({ ...valid, name: '   ' })).toEqual({ ok: false, reason: 'missing_name' });
    expect(validateGoal({ ...valid, target_industry: '' })).toEqual({
      ok: false,
      reason: 'missing_target_industry',
    });
    expect(validateGoal({ ...valid, geography: '  ' })).toEqual({ ok: false, reason: 'missing_geography' });
  });

  it('refuses an unknown cadence or status', () => {
    expect(validateGoal({ ...valid, cadence: 'biweekly' as Goal['cadence'] })).toEqual({
      ok: false,
      reason: 'invalid_cadence',
    });
    expect(validateGoal({ ...valid, status: 'banned' as Goal['status'] })).toEqual({
      ok: false,
      reason: 'invalid_status',
    });
  });

  it('refuses a non-positive daily cap', () => {
    expect(validateGoal({ ...valid, daily_cap: 0 })).toEqual({
      ok: false,
      reason: 'daily_cap_must_be_positive',
    });
    expect(validateGoal({ ...valid, daily_cap: -1 })).toEqual({
      ok: false,
      reason: 'daily_cap_must_be_positive',
    });
  });
});

describe('tickBucket — deterministic scheduling bucket per cadence', () => {
  const daily: Goal = {
    id: 'g-1',
    name: 'Alpha',
    target_industry: 'fintech',
    geography: 'Riyadh',
    cadence: 'daily',
    daily_cap: 5,
    status: 'active',
  };
  const hourly: Goal = { ...daily, cadence: 'hourly' };
  const weekly: Goal = { ...daily, cadence: 'weekly' };

  it('bands a daily goal to YYYY-MM-DD', () => {
    expect(tickBucket(daily, new Date(2026, 10, 27, 14, 32))).toBe('2026-11-27');
    expect(tickBucket(daily, new Date(2026, 10, 28, 0, 0))).toBe('2026-11-28');
  });

  it('bands an hourly goal to YYYY-MM-DDTHH', () => {
    expect(tickBucket(hourly, new Date(2026, 10, 27, 14, 5))).toBe('2026-11-27T14');
    expect(tickBucket(hourly, new Date(2026, 10, 27, 14, 59))).toBe('2026-11-27T14');
  });

  it('bands a weekly goal to YYYY-Www (2026-11-27 is ISO week 48; 2026-11-30 is ISO week 49)', () => {
    expect(tickBucket(weekly, new Date(2026, 10, 27))).toBe('2026-W48');
    expect(tickBucket(weekly, new Date(2026, 10, 30))).toBe('2026-W49');
  });

  it('is deterministic for two different times in the same bucket', () => {
    expect(tickBucket(daily, new Date(2026, 10, 27, 0, 0))).toBe(
      tickBucket(daily, new Date(2026, 10, 27, 23, 59)),
    );
  });
});

describe('tickScheduler — due/not-due with skip reasons and idempotence', () => {
  const daily: Goal = {
    id: 'g-1',
    name: 'Alpha',
    target_industry: 'fintech',
    geography: 'Riyadh',
    cadence: 'daily',
    daily_cap: 5,
    status: 'active',
  };

  it('includes all five jobs and marks them due at the cadence start', () => {
    // daily goal -> daily bucket: the daily legs (harvest, outreach-prep) and
    // the always-due report fire this tick; the hourly and weekly legs do not.
    const result = tickScheduler(daily, new Date(2026, 10, 27, 0, 0, 0));
    expect(result.goal_id).toBe('g-1');
    expect(result.tick_bucket).toBe('2026-11-27');
    expect(result.jobs).toHaveLength(5);
    const byJob = Object.fromEntries(result.jobs.map((job) => [job.job, job]));
    expect(byJob['discovery'].due).toBe(false);
    expect(byJob['harvest'].due).toBe(true);
    expect(byJob['verify'].due).toBe(false);
    expect(byJob['outreach-prep'].due).toBe(true);
    expect(byJob['report'].due).toBe(true);
  });

  it('returns named skip reasons for scheduled jobs not due in the current tick', () => {
    const result = tickScheduler(daily, new Date(2026, 10, 27, 14, 32, 0));
    const dueJobs = result.jobs.filter((job) => job.due).map((job) => job.job);
    // A daily goal keeps its daily legs (harvest, outreach-prep) due for the whole
    // bucket, and the report leg is always due; only the hourly and weekly legs skip.
    expect(dueJobs).toEqual(['harvest', 'outreach-prep', 'report']);
    const notDue = result.jobs.filter((job) => !job.due);
    expect(notDue).toHaveLength(2);
    for (const job of notDue) {
      expect(job.reason).toMatch(new RegExp(`^${job.job}:`));
      expect(job.reason).toContain('schedule_not_due');
      expect(job.reason).toContain(`goal cadence: ${daily.cadence}`);
    }
  });

  it('is idempotent for the same (goal.id, tick_bucket)', () => {
    const morning = tickScheduler(daily, new Date(2026, 10, 27, 0, 0, 0));
    const night = tickScheduler(daily, new Date(2026, 10, 27, 23, 59, 59));
    expect(morning).toEqual(night);
    expect(morning.tick_bucket).toBe(night.tick_bucket);
    expect(morning.tick_bucket).toBe('2026-11-27');
  });

  it('makes the report job due on every tick', () => {
    for (const now of [new Date(2026, 10, 27, 14, 32), new Date(2026, 10, 27, 23, 59)]) {
      expect(
        tickScheduler(daily, now).jobs.some((job) => job.job === 'report' && job.due),
      ).toBe(true);
    }
  });
});

describe('autopilot_runs — startRun, finishRun, listRuns', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    ensureAutopilotRunsSchema(db);
  });

  afterEach(() => {
    db.close();
  });

  it('writes a running row and reads it back', () => {
    const row = startRun(db, 'g-1');
    expect(row.id).toBeTruthy();
    expect(row.goal_id).toBe('g-1');
    expect(row.status).toBe('running');
    expect(row.produced).toBe(0);
    expect(listRuns(db, 'g-1')).toHaveLength(1);
    expect(listRuns(db, 'g-1')[0].id).toBe(row.id);
  });

  it('closes a run with the measured outcomes', () => {
    const started = startRun(db, 'g-1');
    const finished = finishRun(db, started.id, {
      status: 'finished',
      produced: 3,
      engines_used: 'gemini,nodemailer',
      errors: '',
      cost_usd: 0.42,
      latency_ms: 1250,
    });
    expect(finished).not.toBeNull();
    expect(finished!.status).toBe('finished');
    expect(finished!.produced).toBe(3);
    expect(finished!.engines_used).toBe('gemini,nodemailer');
    expect(finished!.errors).toBe('');
    expect(finished!.cost_usd).toBe(0.42);
    expect(finished!.latency_ms).toBe(1250);
    expect(finished!.finished_at).not.toBeNull();
  });

  it('bounds reads by goal and limit', () => {
    startRun(db, 'g-1');
    startRun(db, 'g-2');
    expect(listRuns(db, 'g-1')).toHaveLength(1);
    expect(listRuns(db, 'g-1', 10)).toHaveLength(1);
    expect(listRuns(db, 'g-2')).toHaveLength(1);
    expect(listRuns(db, 'g-1', 0)).toHaveLength(0);
  });
});

describe('recordDelegatedRun — product-visible row, nothing runs inside the tick', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    ensureAutopilotRunsSchema(db);
  });

  afterEach(() => {
    db.close();
  });

  it('records one row per delegated job and leaves it readable', () => {
    const row = recordDelegatedRun(db, 'g-1', 'harvest');
    expect(row.id).toBeTruthy();
    expect(row.goal_id).toBe('g-1');
    expect(row.status).toBe('finished');
    expect(row.engines_used).toBe('delegated:harvest');
    expect(row.errors).toContain('not executed inside the tick');
    expect(row.produced).toBe(0);
    expect(listRuns(db, 'g-1')).toHaveLength(1);
  });
});

describe('decision_inbox — pendingDecisions / resolveDecision', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    ensureDecisionInboxSchema(db);
  });

  afterEach(() => {
    db.close();
  });

  it('starts empty and lists only unresolved decisions', () => {
    expect(pendingDecisions(db)).toHaveLength(0);
    const stored = insertDecision(db, 'g-1', 'use the WATHQ number as the single source of truth');
    expect(stored.id).toBeTruthy();
    expect(pendingDecisions(db)).toHaveLength(1);
    expect(pendingDecisions(db, 'g-1')).toHaveLength(1);
    expect(pendingDecisions(db, 'g-2')).toHaveLength(0);
  });

  it('only resolves an existing decision', () => {
    expect(resolveDecision(db, 'nope', 'yes')).toEqual({ ok: false, reason: 'unknown_decision' });
  });

  it('refuses empty or blank choices by name', () => {
    expect(resolveDecision(db, 'd-1', '')).toEqual({ ok: false, reason: 'empty_choice' });
    expect(resolveDecision(db, 'd-1', '   ')).toEqual({ ok: false, reason: 'empty_choice' });
  });

  it('resolves a decision and removes it from the pending inbox', () => {
    const stored = insertDecision(db, 'g-1', 'appoint a named owner for the weekly report');
    expect(pendingDecisions(db)).toHaveLength(1);
    const admitted = resolveDecision(db, stored.id, 'yes');
    expect(admitted.ok).toBe(true);
    if (admitted.ok === false) throw new Error(admitted.reason);
    expect(admitted.row.choice).toBe('yes');
    expect(admitted.row.resolved_at).not.toBeNull();
    expect(pendingDecisions(db)).toHaveLength(0);
  });

  it('keeps decisions separated by goal', () => {
    const a = insertDecision(db, 'g-1', 'first decision');
    const b = insertDecision(db, 'g-2', 'second decision');
    expect(pendingDecisions(db)).toHaveLength(2);
    resolveDecision(db, a.id, 'yes');
    expect(pendingDecisions(db, 'g-1')).toHaveLength(0);
    expect(pendingDecisions(db, 'g-2')).toHaveLength(1);
    expect(pendingDecisions(db)).toHaveLength(1);
  });
});
