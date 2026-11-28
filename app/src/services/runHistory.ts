/**
 * runHistory.ts — F5: autopilot loop run history and decision inbox.
 *
 * Two small, self-contained tables owned by this module:
 *
 *  - `autopilot_runs` — one product-visible row per delegated autopilot job.
 *    The autopilot tick never executes a job (see
 *    autopilotLoop.tickScheduler / recordDelegatedRun); it only plans it,
 *    and the producer records the delegation here.
 *  - `decision_inbox` — irreversible decisions the loop surfaces to the
 *    operator. Decisions are admitted by the producer; this module only
 *    stores, lists and resolves them. Nothing in this module fabricates a
 *    decision, a contact or a metric.
 *
 * Schema is created idempotently (CREATE TABLE IF NOT EXISTS) on first use,
 * as required by the lane rules. The module never opens its own connection
 * and never alters an existing table — the caller passes the better-sqlite3
 * handle it already owns (see the wiring line in the F5 handoff).
 *
 * Schema (per the lane spec):
 *  autopilot_runs(id TEXT PRIMARY KEY, goal_id TEXT, started_at TEXT,
 *                 finished_at TEXT, status TEXT, produced INTEGER,
 *                 engines_used TEXT, errors TEXT, cost_usd REAL,
 *                 latency_ms INTEGER)
 */

import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

export const AUTOPILOT_RUNS_TABLE = 'autopilot_runs';
export const DECISION_INBOX_TABLE = 'decision_inbox';

export interface AutopilotRunRow {
  id: string;
  goal_id: string;
  user_id: string | null;
  started_at: string;
  finished_at: string | null;
  status: 'running' | 'finished' | 'failed';
  produced: number;
  engines_used: string;
  errors: string;
  cost_usd: number;
  latency_ms: number;
}

export interface DecisionInboxRow {
  id: string;
  goal_id: string;
  user_id: string | null;
  decision: string;
  choice: string | null;
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
}

/** Add a column to an existing table only when it is missing (legacy DBs). */
function addColumnIfMissing(db: Database.Database, table: string, column: string, type: string): void {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!columns.some((entry) => entry.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
}

/** Idempotent schema for the run history table. Safe to call on every entry point. */
export function ensureAutopilotRunsSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS autopilot_runs (
      id TEXT PRIMARY KEY,
      goal_id TEXT,
      user_id TEXT,
      started_at TEXT,
      finished_at TEXT,
      status TEXT,
      produced INTEGER,
      engines_used TEXT,
      errors TEXT,
      cost_usd REAL,
      latency_ms INTEGER
    );
  `);
  addColumnIfMissing(db, AUTOPILOT_RUNS_TABLE, 'user_id', 'TEXT');
}

/** Idempotent schema for the irreversible-decision inbox. */
export function ensureDecisionInboxSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS decision_inbox (
      id TEXT PRIMARY KEY,
      goal_id TEXT,
      user_id TEXT,
      decision TEXT,
      choice TEXT,
      created_at TEXT,
      resolved_at TEXT,
      resolved_by TEXT
    );
  `);
  addColumnIfMissing(db, DECISION_INBOX_TABLE, 'user_id', 'TEXT');
}

/** Admit an irreversible decision into the inbox; the row leaves it
 * pending. The producer owns admission — only irreversible decisions land
 * here, and this module never fabricates a decision.
 *
 * @example
 *   const row = insertDecision(db, 'g-1', 'appoint a named owner for the
 *   weekly autopilot report');
 */
export function insertDecision(
  db: Database.Database,
  goalId: string,
  decision: string,
  userId?: string | null,
): DecisionInboxRow {
  ensureDecisionInboxSchema(db);
  if (typeof goalId !== 'string' || goalId.trim().length === 0) {
    throw new TypeError('decision goal id must be a non-empty string');
  }
  if (typeof decision !== 'string' || decision.trim().length === 0) {
    throw new TypeError('decision text must be a non-empty string');
  }
  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO decision_inbox (id, goal_id, user_id, decision, choice, created_at)
     VALUES (?, ?, ?, ?, NULL, ?)`,
  ).run(id, goalId.trim(), userId == null ? null : String(userId), decision.trim(), now);
  return getDecision(db, id)!;
}

/** Look up one stored run by id; undefined when no such row exists. */
export function getRun(
  db: Database.Database,
  id: string,
  userId?: string | null,
): AutopilotRunRow | undefined {
  if (userId === undefined) {
    return db.prepare('SELECT * FROM autopilot_runs WHERE id = ?').get(id) as
      | AutopilotRunRow
      | undefined;
  }
  return db
    .prepare('SELECT * FROM autopilot_runs WHERE id = ? AND user_id = ?')
    .get(id, String(userId)) as AutopilotRunRow | undefined;
}

/** Record a new delegated job and return its product-visible row. */
export function startRun(
  db: Database.Database,
  goalId: string,
  userId?: string | null,
): AutopilotRunRow {
  ensureAutopilotRunsSchema(db);
  const now = new Date().toISOString();
  const id = randomUUID();
  db.prepare(
    `INSERT INTO autopilot_runs (id, goal_id, user_id, started_at, status, produced, engines_used, errors, cost_usd, latency_ms)
     VALUES (?, ?, ?, ?, 'running', 0, '', '', 0, 0)`,
  ).run(id, goalId, userId == null ? null : String(userId), now);
  return getRun(db, id)!;
}

export interface FinishRunInput {
  status?: AutopilotRunRow['status'];
  produced?: number;
  engines_used?: string;
  errors?: string;
  cost_usd?: number;
  latency_ms?: number;
}

/** Close a running row with the measured outcome; returns the updated row or null. */
export function finishRun(
  db: Database.Database,
  id: string,
  updates: FinishRunInput = {},
): AutopilotRunRow | null {
  const row = getRun(db, id);
  if (!row) return null;
  const now = new Date().toISOString();
  const finished = {
    status: updates.status ?? row.status,
    produced: updates.produced ?? row.produced,
    engines_used: updates.engines_used ?? row.engines_used,
    errors: updates.errors ?? row.errors,
    cost_usd: updates.cost_usd ?? row.cost_usd,
    latency_ms: updates.latency_ms ?? row.latency_ms,
  };
  db.prepare(
    `UPDATE autopilot_runs
     SET finished_at = ?, status = ?, produced = ?, engines_used = ?, errors = ?, cost_usd = ?, latency_ms = ?
     WHERE id = ?`,
  ).run(now, finished.status, finished.produced, finished.engines_used, finished.errors, finished.cost_usd, finished.latency_ms, id);
  return getRun(db, id)!;
}

/** Bounded read-back of a goal's run history, newest first. */
export function listRuns(
  db: Database.Database,
  goalId: string,
  limit: number = 50,
  userId?: string | null,
): AutopilotRunRow[] {
  ensureAutopilotRunsSchema(db);
  if (userId === undefined) {
    return db.prepare(
      `SELECT * FROM autopilot_runs WHERE goal_id = ? ORDER BY started_at DESC, id DESC LIMIT ?`,
    ).all(goalId, limit) as AutopilotRunRow[];
  }
  return db.prepare(
    `SELECT * FROM autopilot_runs WHERE goal_id = ? AND user_id = ? ORDER BY started_at DESC, id DESC LIMIT ?`,
  ).all(goalId, String(userId), limit) as AutopilotRunRow[];
}

function getDecision(db: Database.Database, id: string): DecisionInboxRow | undefined {
  return db.prepare('SELECT * FROM decision_inbox WHERE id = ?').get(id) as
    | DecisionInboxRow
    | undefined;
}

/** Unresolved decisions, oldest first. Pass goalId to filter by goal. */
export function pendingDecisions(
  db: Database.Database,
  goalId?: string,
  userId?: string | null,
): DecisionInboxRow[] {
  ensureDecisionInboxSchema(db);
  const clauses: string[] = ['resolved_at IS NULL'];
  const params: string[] = [];
  if (goalId) {
    clauses.push('goal_id = ?');
    params.push(goalId);
  }
  if (userId !== undefined) {
    clauses.push('user_id = ?');
    params.push(String(userId));
  }
  const sql = `SELECT * FROM decision_inbox WHERE ${clauses.join(' AND ')} ORDER BY created_at ASC, id ASC`;
  return db.prepare(sql).all(...params) as DecisionInboxRow[];
}

/**
 * Resolve an irreversible decision. Refuses unknown ids and empty choices by
 * name; resolved rows leave the pending inbox.
 */
export function resolveDecision(
  db: Database.Database,
  id: string,
  choice: string,
  userId?: string | null,
): { ok: true; row: DecisionInboxRow } | { ok: false; reason: string } {
  ensureDecisionInboxSchema(db);
  if (typeof choice !== 'string' || choice.trim().length === 0) {
    return { ok: false, reason: 'empty_choice' };
  }
  const info = userId === undefined
    ? db.prepare(
        `UPDATE decision_inbox SET resolved_at = ?, resolved_by = 'system', choice = ? WHERE id = ?`,
      ).run(new Date().toISOString(), choice.trim(), id)
    : db.prepare(
        `UPDATE decision_inbox SET resolved_at = ?, resolved_by = 'system', choice = ? WHERE id = ? AND user_id = ?`,
      ).run(new Date().toISOString(), choice.trim(), id, String(userId));
  if ((info as { changes: number }).changes === 0) {
    return { ok: false, reason: 'unknown_decision' };
  }
  return { ok: true, row: getDecision(db, id)! };
}
