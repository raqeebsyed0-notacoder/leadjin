/**
 * Persistent evidence record for the triple-verification workflow (Phase 3 / verify3).
 *
 * One row is written per stage per attempt, plus one `overall` row carrying the
 * disagreement verdict. A stage can only claim `verified` when the caller has a
 * real response (SMTP handshake, real API, real registry lookup); a stub or a
 * skipped stage is `unverified` with a reason.
 *
 * This module owns the six-value status vocabulary and the weakest-stage rule.
 * It never throws: a DB problem degrades to "no row written", never to a false
 * `verified`.
 */

import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';

/** The status vocabulary preserved from the existing design. Never a boolean. */
export const VERIFICATION_STATUSES = [
  'verified',
  'partially_verified',
  'risky',
  'catch_all',
  'invalid',
  'unverified',
] as const;

export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

/**
 * Disagreement order, WEAKEST FIRST:
 *   invalid < risky < catch_all < partially_verified < verified
 * `unverified` is deliberately absent: it means "no conclusive answer", not a
 * weak positive. It caps the overall verdict at `partially_verified` when any
 * other stage is conclusive, and yields `unverified` when nothing answered.
 */
export const WEAKEST_FIRST: VerificationStatus[] = [
  'invalid',
  'risky',
  'catch_all',
  'partially_verified',
  'verified',
];

export interface StageVerdict {
  stage: string;
  status: VerificationStatus;
  reason: string;
  method: string;
  confidence?: number;
  evidence?: Record<string, unknown>;
  source_url?: string | null;
}

export interface VerificationRecordInput {
  lead_id: string;
  email?: string | null;
  stage: string;
  method: string;
  status: VerificationStatus;
  confidence: number;
  evidence_json: Record<string, unknown> | unknown[];
  source_url?: string | null;
  checked_at?: string;
  reason?: string;
}

export interface VerificationRecordRow {
  id: number;
  lead_id: string;
  email: string | null;
  stage: string;
  method: string;
  status: VerificationStatus;
  confidence: number;
  evidence_json: string;
  source_url: string | null;
  checked_at: string;
  reason: string | null;
}

/** Optional process-wide DB, set by the app at boot; explicit args always win. */
let defaultDb: Database.Database | null = null;

export function setVerificationDb(db: Database.Database | null): void {
  defaultDb = db;
}

function resolveDb(db?: Database.Database | null): Database.Database | null {
  if (db) return db;
  if (defaultDb) return defaultDb;
  // Safe default for the live service: cwd is the app root, where leadjin.db lives.
  const candidate = process.env.LEADJIN_DB_PATH || path.join(process.cwd(), 'leadjin.db');
  if (!fs.existsSync(candidate)) return null;
  try {
    defaultDb = new Database(candidate);
    return defaultDb;
  } catch {
    return null;
  }
}

/** CREATE TABLE IF NOT EXISTS on first use; additive, never drops or rewrites. */
export function initVerificationTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS verification_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id TEXT NOT NULL,
      email TEXT,
      stage TEXT NOT NULL,
      method TEXT NOT NULL,
      status TEXT NOT NULL,
      confidence INTEGER NOT NULL DEFAULT 0,
      evidence_json TEXT NOT NULL DEFAULT '{}',
      source_url TEXT,
      checked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      reason TEXT
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_verification_records_lead
           ON verification_records(lead_id, checked_at)`);
}

/** Returns the weakest conclusive status, or null when every status is unverified. */
export function weakestStatus(statuses: VerificationStatus[]): VerificationStatus | null {
  let weakest: VerificationStatus | null = null;
  for (const status of statuses) {
    if (status === 'unverified') continue;
    if (weakest === null || WEAKEST_FIRST.indexOf(status) < WEAKEST_FIRST.indexOf(weakest)) {
      weakest = status;
    }
  }
  return weakest;
}

/**
 * Overall verdict for a set of stages.
 * - weakest conclusive stage wins a disagreement;
 * - any unverified/stubbed stage caps the verdict at partially_verified;
 * - no conclusive stage at all -> unverified.
 */
export function overallStatus(stages: StageVerdict[]): VerificationStatus {
  const weakest = weakestStatus(stages.map(s => s.status));
  if (weakest === null) return 'unverified';
  const hasMissing = stages.some(s => s.status === 'unverified');
  if (hasMissing && WEAKEST_FIRST.indexOf(weakest) > WEAKEST_FIRST.indexOf('partially_verified')) {
    return 'partially_verified';
  }
  return weakest;
}

/** Insert one evidence row. Returns null (never throws) when no DB is reachable. */
export function recordVerification(
  db: Database.Database | null | undefined,
  rec: VerificationRecordInput
): VerificationRecordRow | null {
  try {
    const target = resolveDb(db);
    if (!target) return null;
    initVerificationTable(target);
    const info = target.prepare(`
      INSERT INTO verification_records
        (lead_id, email, stage, method, status, confidence, evidence_json, source_url, checked_at, reason)
      VALUES
        (@lead_id, @email, @stage, @method, @status, @confidence, @evidence_json, @source_url, @checked_at, @reason)
    `).run({
      lead_id: String(rec.lead_id),
      email: rec.email ?? null,
      stage: rec.stage,
      method: rec.method,
      status: rec.status,
      confidence: Number(rec.confidence) || 0,
      evidence_json: JSON.stringify(rec.evidence_json ?? {}),
      source_url: rec.source_url ?? null,
      checked_at: rec.checked_at ?? new Date().toISOString(),
      reason: rec.reason ?? null,
    });
    return target.prepare('SELECT * FROM verification_records WHERE id = ?')
      .get(info.lastInsertRowid) as VerificationRecordRow;
  } catch {
    return null;
  }
}

/** All evidence rows for one lead, oldest first. */
export function getVerification(
  db: Database.Database | null | undefined,
  lead_id: string
): VerificationRecordRow[] {
  try {
    const target = resolveDb(db);
    if (!target) return [];
    initVerificationTable(target);
    return target.prepare(
      'SELECT * FROM verification_records WHERE lead_id = ? ORDER BY checked_at ASC, id ASC'
    ).all(String(lead_id)) as VerificationRecordRow[];
  } catch {
    return [];
  }
}

export default recordVerification;
