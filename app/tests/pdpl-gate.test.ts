/**
 * pdpl-gate.test.ts — F7 acceptance tests for the customer-is-controller gate.
 * All tests use an in-memory database; no live DB, no network, no secrets.
 */

import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertSendAllowed,
  ensureConsentSchema,
  recordBasis,
  sendSiteInventory,
  withdrawConsent,
} from '../src/services/pdplGate.js';

let db: Database.Database;

const fullBasis = {
  contact_id: 'lead-1',
  basis: 'given' as const,
  evidence_ref: 'whatsapp-optin-2026-11-27',
  sender_identity: 'LEADJIN | CR 1234567890 | Riyadh',
  arabic_notice: 'أنت تتلقى هذه الرسالة بموافقتك. يمكنك إلغاء الاشتراك في أي وقت.',
};

beforeEach(() => {
  db = new Database(':memory:');
  db.exec(`
    CREATE TABLE IF NOT EXISTS leads (
      lead_id TEXT PRIMARY KEY,
      name TEXT, title TEXT, company TEXT, email TEXT, phone TEXT,
      linkedin TEXT, twitter TEXT, website TEXT, industry TEXT,
      email_source TEXT, do_not_contact INTEGER DEFAULT 0,
      vision_2030_program TEXT, vision_2030_alignment TEXT, provenance_url TEXT
    );
  `);
  db.prepare(
    `INSERT INTO leads
       (lead_id, name, title, company, email, phone, linkedin, email_source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    'lead-1',
    'Ahmed Alpha',
    'CEO',
    'Alpha Co',
    'ahmed@example.test',
    '+966500000001',
    'linkedin.com/in/ahmed',
    'website',
  );
});

afterEach(() => {
  db.close();
});

describe('ensureConsentSchema', () => {
  it('creates the basis and append-only audit tables idempotently', () => {
    ensureConsentSchema(db);
    ensureConsentSchema(db);
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'outreach_basis%' ORDER BY name")
      .all() as Array<{ name: string }>;
    expect(tables.map((row) => row.name)).toEqual(['outreach_basis', 'outreach_basis_audit']);

    const columns = db.prepare('PRAGMA table_info(outreach_basis_audit)').all() as Array<{ name: string }>;
    const names = columns.map((column) => column.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'contact_id',
        'basis',
        'consent_at',
        'evidence_ref',
        'sender_identity',
        'arabic_notice',
        'withdrawn_at',
        'withdrawn_action',
        'created_at',
        'event',
        'at',
      ]),
    );
  });
});

describe('recordBasis', () => {
  it('refuses an empty evidence_ref, a missing sender_identity and a missing Arabic notice', () => {
    expect(recordBasis(db, { ...fullBasis, evidence_ref: '   ' })).toEqual({
      ok: false,
      reason: 'empty_evidence_ref',
    });
    expect(recordBasis(db, { ...fullBasis, sender_identity: '' })).toEqual({
      ok: false,
      reason: 'missing_sender_identity',
    });
    expect(recordBasis(db, { ...fullBasis, arabic_notice: '  ' })).toEqual({
      ok: false,
      reason: 'missing_arabic_notice',
    });
    expect(db.prepare('SELECT COUNT(*) AS n FROM outreach_basis').get()).toEqual({ n: 0 });
  });

  it('records a valid basis and returns the contact id', () => {
    expect(recordBasis(db, fullBasis)).toEqual({ ok: true, contact_id: 'lead-1' });
    const row = db.prepare('SELECT basis, evidence_ref FROM outreach_basis WHERE contact_id = ?').get('lead-1');
    expect(row).toEqual({ basis: 'given', evidence_ref: fullBasis.evidence_ref });
  });
});

describe('assertSendAllowed — the send-path auth boundary', () => {
  it('refuses a send when there is no basis row', () => {
    ensureConsentSchema(db);
    expect(assertSendAllowed(db, 'lead-1', 'email')).toEqual({ allowed: false, reason: 'no_basis' });
  });

  it('refuses a found basis: no send until the person says yes', () => {
    expect(recordBasis(db, { ...fullBasis, basis: 'found' })).toEqual({ ok: true, contact_id: 'lead-1' });
    expect(assertSendAllowed(db, 'lead-1', 'email')).toEqual({
      allowed: false,
      reason: 'channel_not_permitted',
    });
    expect(assertSendAllowed(db, 'lead-1', 'whatsapp')).toEqual({
      allowed: false,
      reason: 'channel_not_permitted',
    });
  });

  it('allows a given basis on email only', () => {
    expect(recordBasis(db, fullBasis)).toEqual({ ok: true, contact_id: 'lead-1' });
    expect(assertSendAllowed(db, 'lead-1', 'email')).toEqual({ allowed: true });
    expect(assertSendAllowed(db, 'lead-1', 'EMAIL')).toEqual({ allowed: true });
    expect(assertSendAllowed(db, 'lead-1', 'whatsapp')).toEqual({
      allowed: false,
      reason: 'channel_not_permitted',
    });
  });

  it('refuses a send once consent is withdrawn', () => {
    expect(recordBasis(db, fullBasis)).toEqual({ ok: true, contact_id: 'lead-1' });
    expect(withdrawConsent(db, 'lead-1', 'founder-request')).toEqual({
      ok: true,
      deleted_fields: expect.any(Number),
    });
    expect(assertSendAllowed(db, 'lead-1', 'email')).toEqual({
      allowed: false,
      reason: 'consent_withdrawn',
    });
  });

  it('refuses an empty evidence_ref even when the row exists', () => {
    expect(recordBasis(db, fullBasis)).toEqual({ ok: true, contact_id: 'lead-1' });
    db.prepare("UPDATE outreach_basis SET evidence_ref = '' WHERE contact_id = ?").run('lead-1');
    expect(assertSendAllowed(db, 'lead-1', 'email')).toEqual({
      allowed: false,
      reason: 'empty_evidence_ref',
    });
  });
});

describe('withdrawConsent', () => {
  it('nulls consent-processed person fields and keeps the tombstone row', () => {
    expect(recordBasis(db, fullBasis)).toEqual({ ok: true, contact_id: 'lead-1' });
    const result = withdrawConsent(db, 'lead-1', 'pdpl-erasure-request');
    expect(result.ok).toBe(true);
    if (result.ok === false) throw new Error(result.reason);
    expect(result.deleted_fields).toBeGreaterThan(0);

    const lead = db.prepare('SELECT * FROM leads WHERE lead_id = ?').get('lead-1') as Record<string, unknown>;
    expect(lead).toBeDefined();
    expect(lead.name).toBeNull();
    expect(lead.email).toBeNull();
    expect(lead.phone).toBeNull();
    expect(lead.linkedin).toBeNull();
    expect(lead.company).toBe('Alpha Co'); // company is not a person field

    const tombstone = db.prepare('SELECT withdrawn_at, withdrawn_action FROM outreach_basis WHERE contact_id = ?').get('lead-1') as {
      withdrawn_at: string | null;
      withdrawn_action: string | null;
    };
    expect(tombstone.withdrawn_at).toBeTruthy();
    expect(tombstone.withdrawn_action).toBe('pdpl-erasure-request');
    expect(recordBasis(db, fullBasis)).toEqual({ ok: false, reason: 'consent_withdrawn' });
  });

  it('appends a record and a withdraw audit row', () => {
    expect(recordBasis(db, fullBasis)).toEqual({ ok: true, contact_id: 'lead-1' });
    expect(withdrawConsent(db, 'lead-1', 'opt-out-link')).toEqual({
      ok: true,
      deleted_fields: expect.any(Number),
    });
    const events = db
      .prepare('SELECT event FROM outreach_basis_audit ORDER BY at, event')
      .all() as Array<{ event: string }>;
    expect(events.map((row) => row.event)).toEqual(['record', 'withdraw']);
  });
});

describe('sendSiteInventory', () => {
  it('lists the real outreach_messages insert and both nodemailer send sites', () => {
    const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
    const sites = sendSiteInventory(appRoot);
    const keys = sites.map((site) => `${site.file}:${site.line}`);
    expect(keys).toContain('src/services/artisanRoutes.ts:215');
    // Line numbers shift whenever server.ts above the send sites changes; the
    // inventory must still find both nodemailer send sites, so assert on the
    // file and the count rather than on a brittle absolute line.
    const serverSites = sites.filter((site) => site.file === 'server.ts');
    expect(serverSites.length).toBeGreaterThanOrEqual(2);
    for (const site of serverSites) {
      expect(site.text).toMatch(/sendMail\(/);
    }
  });
});
