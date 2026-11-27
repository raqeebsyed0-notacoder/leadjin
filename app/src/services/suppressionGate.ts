/**
 * Hard email-keyed suppression gate for every LEADJIN outbound send path.
 *
 * The suppression list is keyed on the address alone, so an address with no
 * `leads` row is still blocked. This restores the protection that existed in
 * the original module and that the live app lost (it had only the
 * `leads.do_not_contact` LEFT-JOIN filter, which lets lead-less addresses
 * through).
 *
 * This module never sends email and never opens a database connection of its
 * own; callers pass the app's better-sqlite3 handle.
 */

import type Database from 'better-sqlite3';

export interface SuppressionCheck {
  suppressed: boolean;
  reason?: string;
}

export type SendBlockReason = 'suppressed' | 'do_not_contact' | 'invalid_email';

export interface SendableCheck {
  ok: boolean;
  reason?: SendBlockReason;
}

/** Create the suppression table and its lookup index on a fresh or existing DB. */
export function ensureSuppressionSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS suppression_list (
      email TEXT PRIMARY KEY COLLATE NOCASE,
      reason TEXT,
      source TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_suppression_list_email ON suppression_list(email);
  `);
}

function normalizeEmail(email: unknown): string {
  return typeof email === 'string' ? email.trim() : '';
}

/**
 * Case-insensitive exact-match lookup on the address, independent of any lead
 * row. Returns the stored reason so callers can record why a send was skipped.
 */
export function isSuppressed(db: Database.Database, email: unknown): SuppressionCheck {
  const address = normalizeEmail(email);
  if (!address) return { suppressed: false };
  const row = db
    .prepare('SELECT reason FROM suppression_list WHERE email = ? COLLATE NOCASE LIMIT 1')
    .get(address) as { reason: string | null } | undefined;
  return row ? { suppressed: true, reason: row.reason ?? undefined } : { suppressed: false };
}

/**
 * Single gate for a send: format check -> hard suppression list -> lead's
 * do_not_contact flag (only when a matching lead row exists). Fails closed on
 * suppression; a lead-less address is still governed by the suppression list.
 */
export function assertSendable(db: Database.Database, email: unknown): SendableCheck {
  const address = normalizeEmail(email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
    return { ok: false, reason: 'invalid_email' };
  }
  if (isSuppressed(db, address).suppressed) {
    return { ok: false, reason: 'suppressed' };
  }
  let lead: { do_not_contact: number | null } | undefined;
  try {
    lead = db
      .prepare('SELECT do_not_contact FROM leads WHERE email = ? COLLATE NOCASE LIMIT 1')
      .get(address) as { do_not_contact: number | null } | undefined;
  } catch (error: any) {
    // A missing leads table means there is no lead to carry do_not_contact;
    // the suppression-list check above has already run. Any other DB fault is
    // rethrown rather than silently treated as "sendable".
    if (!String(error?.message || error).includes('no such table: leads')) throw error;
  }
  if (lead && Number(lead.do_not_contact) === 1) {
    return { ok: false, reason: 'do_not_contact' };
  }
  return { ok: true };
}

/** Admin-only: add an address to the suppression list (no public route). */
export function suppress(db: Database.Database, email: unknown, reason: string, source: string): void {
  const address = normalizeEmail(email);
  if (!address) return;
  db.prepare(
    'INSERT OR IGNORE INTO suppression_list (email, reason, source) VALUES (?, ?, ?)'
  ).run(address, reason, source);
}

/** Admin-only: lift a suppression. Always scoped by an email predicate. */
export function unsuppress(db: Database.Database, email: unknown): void {
  const address = normalizeEmail(email);
  if (!address) return;
  db.prepare('DELETE FROM suppression_list WHERE email = ? COLLATE NOCASE').run(address);
}
