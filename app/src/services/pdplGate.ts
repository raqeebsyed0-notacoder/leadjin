/**
 * PDPL gate — the customer-is-controller boundary in front of every send path
 * (owner ruling D3). F7 of the autopilot-v1 lane spec.
 *
 * Contract discipline (omh-backend):
 *  - Surface: this module is the auth boundary. Every outreach send must call
 *    assertSendAllowed(db, contactId, channel) and stop on allowed:false.
 *    Callers are internal send paths only; they pass the app's better-sqlite3
 *    handle, so this module never opens a connection, reads .env, or sends.
 *  - Response shape: success/error envelopes are uniform ({ok, ...} /
 *    {allowed, ...}) with a named reason on every refusal. Fails closed.
 *  - Storage: two NEW tables created with CREATE TABLE IF NOT EXISTS inside an
 *    idempotent ensureConsentSchema() called on first use of every entry point.
 *    No existing table is altered. The audit table is append-only by contract
 *    (this module only ever INSERTs into it).
 *  - Degrade, never invent: missing/withdrawn basis refuses; no contact is
 *    fabricated and no metric is inferred.
 */

import type Database from 'better-sqlite3';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

export type Basis = 'given' | 'found';
export type SendChannel = string;

export interface RecordBasisInput {
  contact_id: string;
  basis: Basis;
  evidence_ref: string;
  sender_identity: string;
  arabic_notice: string;
  consent_at?: string | null;
}

export interface BasisRow {
  contact_id: string;
  basis: string;
  consent_at: string | null;
  evidence_ref: string;
  sender_identity: string;
  arabic_notice: string;
  withdrawn_at: string | null;
  withdrawn_action: string | null;
  created_at: string;
}

export type RecordBasisReason =
  | 'missing_contact_id'
  | 'invalid_basis'
  | 'empty_evidence_ref'
  | 'missing_sender_identity'
  | 'missing_arabic_notice'
  | 'consent_withdrawn';

export type SendBlockReason =
  | 'no_basis'
  | 'empty_evidence_ref'
  | 'consent_withdrawn'
  | 'channel_not_permitted'
  | 'missing_sender_identity'
  | 'missing_arabic_notice';

export type RecordBasisResult =
  | { ok: true; contact_id: string }
  | { ok: false; reason: RecordBasisReason };

export type SendAllowedResult = { allowed: true } | { allowed: false; reason: SendBlockReason };

export type WithdrawResult =
  | { ok: true; deleted_fields: number }
  | { ok: false; reason: 'no_basis' };

export interface SendSite {
  file: string;
  line: number;
  text: string;
}

const nowIso = (): string => new Date().toISOString();
const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

/**
 * Idempotent schema for the consent basis and its append-only audit trail.
 * The audit table carries the same columns as the basis table plus
 * `event` and `at`; rows are only ever inserted, never updated or deleted.
 */
export function ensureConsentSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS outreach_basis (
      contact_id TEXT PRIMARY KEY,
      basis TEXT NOT NULL,
      consent_at TEXT,
      evidence_ref TEXT NOT NULL,
      sender_identity TEXT NOT NULL,
      arabic_notice TEXT NOT NULL,
      withdrawn_at TEXT,
      withdrawn_action TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS outreach_basis_audit (
      contact_id TEXT NOT NULL,
      basis TEXT NOT NULL,
      consent_at TEXT,
      evidence_ref TEXT NOT NULL,
      sender_identity TEXT NOT NULL,
      arabic_notice TEXT NOT NULL,
      withdrawn_at TEXT,
      withdrawn_action TEXT,
      created_at TEXT NOT NULL,
      event TEXT NOT NULL,
      at TEXT NOT NULL
    );
  `);
}

function auditRow(
  db: Database.Database,
  row: Pick<
    BasisRow,
    | 'contact_id'
    | 'basis'
    | 'consent_at'
    | 'evidence_ref'
    | 'sender_identity'
    | 'arabic_notice'
    | 'withdrawn_at'
    | 'withdrawn_action'
    | 'created_at'
  >,
  event: 'record' | 'withdraw',
  at: string,
): void {
  db.prepare(
    `INSERT INTO outreach_basis_audit
       (contact_id, basis, consent_at, evidence_ref, sender_identity, arabic_notice,
        withdrawn_at, withdrawn_action, created_at, event, at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    row.contact_id,
    row.basis,
    row.consent_at,
    row.evidence_ref,
    row.sender_identity,
    row.arabic_notice,
    row.withdrawn_at,
    row.withdrawn_action,
    row.created_at,
    event,
    at,
  );
}

/**
 * Record the lawful basis for contacting a person. The customer is the
 * controller: a basis needs an evidence reference, a sender identity and an
 * Arabic notice. A withdrawn contact is a tombstone — it cannot be re-added.
 */
export function recordBasis(db: Database.Database, input: RecordBasisInput): RecordBasisResult {
  ensureConsentSchema(db);
  const contactId = text(input?.contact_id);
  if (!contactId) return { ok: false, reason: 'missing_contact_id' };
  const basis = text(input?.basis);
  if (basis !== 'given' && basis !== 'found') return { ok: false, reason: 'invalid_basis' };

  const evidenceRef = text(input?.evidence_ref);
  if (!evidenceRef) return { ok: false, reason: 'empty_evidence_ref' };
  const senderIdentity = text(input?.sender_identity);
  if (!senderIdentity) return { ok: false, reason: 'missing_sender_identity' };
  const arabicNotice = text(input?.arabic_notice);
  if (!arabicNotice) return { ok: false, reason: 'missing_arabic_notice' };

  const existing = db
    .prepare('SELECT withdrawn_at FROM outreach_basis WHERE contact_id = ?')
    .get(contactId) as { withdrawn_at: string | null } | undefined;
  if (existing?.withdrawn_at) return { ok: false, reason: 'consent_withdrawn' };

  const at = nowIso();
  const consentAt = input?.consent_at ? text(input.consent_at) || null : null;
  const row: BasisRow = {
    contact_id: contactId,
    basis,
    consent_at: consentAt,
    evidence_ref: evidenceRef,
    sender_identity: senderIdentity,
    arabic_notice: arabicNotice,
    withdrawn_at: null,
    withdrawn_action: null,
    created_at: existing ? (db.prepare('SELECT created_at FROM outreach_basis WHERE contact_id = ?').get(contactId) as { created_at: string }).created_at : at,
  };

  db.prepare(
    `INSERT INTO outreach_basis
       (contact_id, basis, consent_at, evidence_ref, sender_identity, arabic_notice,
        withdrawn_at, withdrawn_action, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(contact_id) DO UPDATE SET
       basis = excluded.basis,
       consent_at = excluded.consent_at,
       evidence_ref = excluded.evidence_ref,
       sender_identity = excluded.sender_identity,
       arabic_notice = excluded.arabic_notice`,
  ).run(
    row.contact_id,
    row.basis,
    row.consent_at,
    row.evidence_ref,
    row.sender_identity,
    row.arabic_notice,
    row.withdrawn_at,
    row.withdrawn_action,
    row.created_at,
  );
  auditRow(db, row, 'record', at);
  return { ok: true, contact_id: contactId };
}

/**
 * The send-path auth boundary. Fails closed unless a basis row exists, has a
 * non-empty evidence_ref, is not withdrawn, permits this channel (`given`
 * permits email only; `found` permits no send until the person says yes), and
 * carries both sender identity and Arabic notice.
 */
export function assertSendAllowed(
  db: Database.Database,
  contactId: string,
  channel: SendChannel,
): SendAllowedResult {
  ensureConsentSchema(db);
  const id = text(contactId);
  const row = db
    .prepare('SELECT * FROM outreach_basis WHERE contact_id = ?')
    .get(id) as BasisRow | undefined;
  if (!row) return { allowed: false, reason: 'no_basis' };
  if (!text(row.evidence_ref)) return { allowed: false, reason: 'empty_evidence_ref' };
  if (text(row.withdrawn_at)) return { allowed: false, reason: 'consent_withdrawn' };

  const ch = text(channel).toLowerCase();
  const permitted = row.basis === 'given' && ch === 'email';
  if (!permitted) return { allowed: false, reason: 'channel_not_permitted' };
  if (!text(row.sender_identity)) return { allowed: false, reason: 'missing_sender_identity' };
  if (!text(row.arabic_notice)) return { allowed: false, reason: 'missing_arabic_notice' };
  return { allowed: true };
}

/**
 * Person fields on the contact row that are consent-processed data. `lead_id`
 * and the basis tombstone stay so the person cannot be silently re-added.
 */
export const CONSENT_PROCESSED_CONTACT_FIELDS: readonly string[] = [
  'name',
  'title',
  'email',
  'phone',
  'linkedin',
  'twitter',
  'website',
  'industry',
  'vision_2030_program',
  'vision_2030_alignment',
  'provenance_url',
  'email_source',
];

/** Withdraw consent: tombstone the basis, null the person fields, append audit. */
export function withdrawConsent(
  db: Database.Database,
  contactId: string,
  action: string,
): WithdrawResult {
  ensureConsentSchema(db);
  const id = text(contactId);
  const row = db
    .prepare('SELECT * FROM outreach_basis WHERE contact_id = ?')
    .get(id) as BasisRow | undefined;
  if (!row) return { ok: false, reason: 'no_basis' };

  const at = nowIso();
  const withdrawnAction = text(action) || 'unspecified';
  db.prepare(
    'UPDATE outreach_basis SET withdrawn_at = ?, withdrawn_action = ? WHERE contact_id = ?',
  ).run(at, withdrawnAction, id);

  let deletedFields = 0;
  const hasLeads = db
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'leads'")
    .get();
  if (hasLeads) {
    const existing = db
      .prepare('SELECT * FROM leads WHERE lead_id = ?')
      .get(id) as Record<string, unknown> | undefined;
    if (existing) {
      const present = CONSENT_PROCESSED_CONTACT_FIELDS.filter(
        (field) => existing[field] !== null && existing[field] !== undefined,
      );
      const columns = db
        .prepare('PRAGMA table_info(leads)')
        .all() as Array<{ name: string }>;
      const settable = present.filter((field) => columns.some((column) => column.name === field));
      if (settable.length > 0) {
        db.prepare(
          `UPDATE leads SET ${settable.map((field) => `${field} = NULL`).join(', ')}, do_not_contact = 1 WHERE lead_id = ?`,
        ).run(id);
        deletedFields = settable.length;
      }
    }
  }

  auditRow(
    db,
    { ...row, withdrawn_at: at, withdrawn_action: withdrawnAction },
    'withdraw',
    at,
  );
  return { ok: true, deleted_fields: deletedFields };
}

const SEND_SITE_PATTERNS: ReadonlyArray<{ label: string; pattern: RegExp }> = [
  { label: 'outreach_messages_insert', pattern: /\bINSERT\s+INTO\s+outreach_messages\b/i },
  { label: 'nodemailer_send', pattern: /\.sendMail\s*\(/ },
];
const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  '.git',
  '.vite',
  '.omh',
  'android',
  'backups-20261123-svc',
  '_archive',
  '_backup',
  '.claude',
  'data',
]);

/**
 * Live, read-only inventory of the send sites the wiring lane must put behind
 * assertSendAllowed. Mirrors the grep used in the F7 handoff. No DB, no network.
 */
export function sendSiteInventory(root: string = process.cwd()): SendSite[] {
  const base = resolve(root);
  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name) && !entry.name.startsWith('.bak-')) walk(join(dir, entry.name));
        continue;
      }
      if (!/\.(ts|js|mjs|cjs)$/.test(entry.name) || entry.name.includes('.bak-')) continue;
      if (entry.name.startsWith('vitest.config') || entry.name.startsWith('vite.config')) continue;
      files.push(join(dir, entry.name));
    }
  };
  walk(base);

  const sites: SendSite[] = [];
  for (const file of files) {
    const lines = readFileSync(file, 'utf8').split(/\r?\n/);
    lines.forEach((line, index) => {
      if (SEND_SITE_PATTERNS.some(({ pattern }) => pattern.test(line))) {
        sites.push({ file: relative(base, file), line: index + 1, text: line.trim() });
      }
    });
  }
  return sites.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}

/** Presence-only environment probe — never returns or prints a value. */
export function describePdplConfig(): { db_path: 'set' | 'missing' } {
  return { db_path: process.env.LEADJIN_DB_PATH ? 'set' : 'missing' };
}
