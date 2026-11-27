/**
 * autopilotLoop.ts — F5: autopilot loop.
 *
 * Goal object, scheduler tick and delegated-run recording for the autopilot.
 *
 *   - `validateGoal()` refuses a malformed goal with a named reason. It never
 *     invents default values.
 *   - `tickScheduler(goal, now)` is a pure function: the same
 *     (goal.id, tick_bucket) always yields the same due/not-due list, so a
 *     tick is repeatable and re-runs are identical. Nothing executes inside
 *     the tick — long jobs are planned only.
 *   - `recordDelegatedRun()` writes a long job as a delegated job with a
 *     product-visible row in run history (see runHistory.ts) and never
 *     executes the job itself.
 */

import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import {
  ensureAutopilotRunsSchema,
  startRun,
  finishRun,
  type AutopilotRunRow,
} from './runHistory.js';

export type Cadence = 'hourly' | 'daily' | 'weekly';

export type GoalStatus = 'active' | 'paused' | 'draft' | 'completed';

/** Shape of a validated goal object (all fields required, no undefined). */
export type GoalShape = {
  id: string;
  name: string;
  target_industry: string;
  geography: string;
  cadence: string;
  daily_cap: number;
  status: string;
};

/** The goal the autopilot works for: industry, geography, cadence, daily cap. */
export interface Goal {
  id: string;
  name: string;
  target_industry: string;
  geography: string;
  cadence: Cadence;
  daily_cap: number;
  status: GoalStatus;
}

export type JobId = 'discovery' | 'harvest' | 'verify' | 'outreach-prep' | 'report';

export const JOB_IDS: readonly JobId[] = [
  'discovery',
  'harvest',
  'verify',
  'outreach-prep',
  'report',
];

export interface ScheduledJob {
  /** The job name (discovery, harvest, verify, outreach-prep, report). */
  job: JobId;
  /** True when the job is due for this tick. */
  due: boolean;
  /**
   * Named skip reason for jobs not due. The reason names the job so the
   * producer and the wiring lane can log exactly which leg was skipped and
   * why, without guessing.
   */
  reason?: string;
}

export interface TickResult {
  goal_id: string;
  tick_bucket: string;
  jobs: ScheduledJob[];
}

/**
 * Deterministic scheduling bucket for a goal at a point in time, in local
 * time. Two different `now` values that fall in the same bucket produce the
 * same tick result (idempotence per goal.id + tick_bucket).
 */
export function tickBucket(goal: Goal, now: Date): string {
  switch (goal.cadence) {
    case 'hourly':
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}T${String(now.getHours()).padStart(2, '0')}`;
    case 'daily':
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    case 'weekly': {
      const date = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
      const day = date.getUTCDay() || 7;
      date.setUTCDate(date.getUTCDate() - day + 1);
      const week1 = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
      const week =
        1 + Math.round(
          ((date.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getUTCDay() || 7)) / 7,
        );
      return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
    }
  }
}

/**
 * Decide which jobs are due for this tick and which to skip, with a named
 * reason per skipped job. Pure: same (goal, now) → same result, and the same
 * (goal.id, tick_bucket) is idempotent.
 */
export function tickScheduler(goal: Goal, now: Date): TickResult {
  const bucket = tickBucket(goal, now);
  const jobs: ScheduledJob[] = JOB_IDS.map((job) => {
    const due = scheduleLegDue(job, bucket);
    return {
      job,
      due,
      reason: due ? undefined : `${job}:schedule_not_due (goal cadence: ${goal.cadence})`,
    };
  });
  return { goal_id: goal.id, tick_bucket: bucket, jobs };
}

const JOB_CADENCE: Record<JobId, Cadence> = {
  discovery: 'hourly',
  harvest: 'daily',
  verify: 'weekly',
  'outreach-prep': 'daily',
  report: 'hourly', // report is due every tick
};

/** Granularity of a bucket: 'hourly', 'daily' or 'weekly'. */
function bucketGranularity(bucket: string): Cadence {
  if (bucket.includes('T')) return 'hourly';
  if (bucket.includes('W')) return 'weekly';
  return 'daily';
}

/** Pure due/not-due rule for the scheduled legs of a goal tick. */
function scheduleLegDue(job: JobId, bucket: string): boolean {
  if (job === 'report') return true;
  return bucketGranularity(bucket) === JOB_CADENCE[job];
}

/**
 * Goal validation. Refuses anything incomplete or malformed with a named
 * reason; it never fabricates values or runs network calls.
 */
export interface ValidGoal {
  ok: true;
  goal: Goal;
}

export interface InvalidGoal {
  ok: false;
  reason: string;
}

export type ValidateGoalResult = ValidGoal | InvalidGoal;

function isGoalLike(value: unknown): value is {
  id: string;
  name: string;
  target_industry: string;
  geography: string;
  cadence: string;
  daily_cap: number;
  status: string;
} {
  if (value === null || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    typeof candidate.target_industry === 'string' &&
    typeof candidate.geography === 'string' &&
    typeof candidate.cadence === 'string' &&
    typeof candidate.daily_cap === 'number' &&
    typeof candidate.status === 'string'
  );
}

export function validateGoal(goal: unknown): ValidateGoalResult {
  if (!isGoalLike(goal)) {
    return { ok: false, reason: 'goal_missing' };
  }
  const candidate = goal as GoalShape;
  if (candidate.id.trim().length === 0) return { ok: false, reason: 'missing_id' };
  if (candidate.name.trim().length === 0) return { ok: false, reason: 'missing_name' };
  if (candidate.target_industry.trim().length === 0) {
    return { ok: false, reason: 'missing_target_industry' };
  }
  if (candidate.geography.trim().length === 0) return { ok: false, reason: 'missing_geography' };
  if (candidate.cadence !== 'hourly' && candidate.cadence !== 'daily' && candidate.cadence !== 'weekly') {
    return { ok: false, reason: 'invalid_cadence' };
  }
  if (typeof candidate.daily_cap !== 'number' || candidate.daily_cap <= 0) {
    return { ok: false, reason: 'daily_cap_must_be_positive' };
  }
  if (
    candidate.status !== 'active' &&
    candidate.status !== 'paused' &&
    candidate.status !== 'draft' &&
    candidate.status !== 'completed'
  ) {
    return { ok: false, reason: 'invalid_status' };
  }
  return { ok: true, goal: { ...candidate } as Goal };
}

/**
 * Records a long job as a delegated job with a product-visible row in run
 * history. The row is started and closed here; the job itself is never
 * executed inside the tick — that stays delegated to the producer.
 */
export function recordDelegatedRun(
  db: Database.Database,
  goalId: string,
  job: JobId,
): AutopilotRunRow {
  ensureAutopilotRunsSchema(db);
  const startedAt = new Date().toISOString();
  const id = randomUUID();
  db.prepare(
    `INSERT INTO autopilot_runs (id, goal_id, started_at, status, produced, engines_used, errors, cost_usd, latency_ms)
     VALUES (?, ?, ?, 'delegated', 0, ?, '', 0, 0)`,
  ).run(id, goalId, startedAt, `delegated:${job}`);
  const finishedAt = new Date().toISOString();
  db.prepare(
    `UPDATE autopilot_runs
     SET finished_at = ?, status = 'finished', produced = 0, engines_used = ?, errors = ?, cost_usd = 0, latency_ms = 0
     WHERE id = ?`,
  ).run(finishedAt, `delegated:${job}`, 'recorded; job not executed inside the tick', id);
  return getRun(db, id)!;
}

function getRun(db: Database.Database, id: string): AutopilotRunRow | undefined {
  return db.prepare('SELECT * FROM autopilot_runs WHERE id = ?').get(id) as
    | AutopilotRunRow
    | undefined;
}
