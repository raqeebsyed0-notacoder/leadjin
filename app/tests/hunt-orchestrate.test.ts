/**
 * hunt-orchestrate.test.ts — Gate-1 integration test
 *
 * What is stubbed:  fetchWathqLead (no WATHQ key required)
 * What runs REAL:   enrichContact (Gemini grounded search), generateBuyingSignal
 *                   (Gemini grounded), DB store + read-back (in-memory SQLite)
 *
 * This proves the full chain: stub-WATHQ → real enrich → real signal → real DB store.
 * WATHQ live path is blocked until Raqeeb mounts the key in the container.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import Database from 'better-sqlite3';
import { initIntelligenceSchema } from '../src/services/intelligenceHub.js';
import { huntOrchestrate, type OrchestratorDeps } from '../src/services/huntOrchestrator.js';
import type { WathqLead as WLead } from '../src/services/wathqService.js';

// ---------------------------------------------------------------------------
// Stub WATHQ response — SABIC (real company, real domain sabic.com)
// Using a real company means downstream Gemini enrichment genuinely runs against it.
// ---------------------------------------------------------------------------
const STUB_SABIC_CR = '1010010813';

const STUB_WATHQ_RESPONSE: WLead = {
  company: {
    name: 'Saudi Basic Industries Corporation (SABIC)',
    cr_number: STUB_SABIC_CR,
    cr_national: '7000002430',
    capital: '300000000',
    status: 'Active',
    hq_city: 'Riyadh',
    entity_type: 'Joint Stock Company',
    ecommerce: false,
  },
  decision_makers: [
    {
      name: 'Abdulrahman Al-Fageeh',
      role: 'Chief Executive Officer',
      nationality: 'Saudi',
      kind: 'management',
    },
    {
      name: 'Abdullah Al-Otaibi',
      role: 'Chief Financial Officer',
      nationality: 'Saudi',
      kind: 'management',
    },
  ],
  contact: null,
  provenance: {
    source: 'wathq',
    api: `https://api.wathq.sa/sandbox/commercial-registration/fullinfo/${STUB_SABIC_CR}`,
    retrieved_at: new Date().toISOString(),
    verified_real: false, // sandbox — correct
  },
};

// ---------------------------------------------------------------------------
// Build an in-memory SQLite DB with the full leads schema
// ---------------------------------------------------------------------------
function buildTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS leads (
      lead_id TEXT PRIMARY KEY,
      user_id INTEGER,
      name TEXT,
      title TEXT,
      company TEXT,
      email TEXT,
      phone TEXT,
      linkedin TEXT,
      twitter TEXT,
      website TEXT,
      industry TEXT,
      status TEXT DEFAULT 'NEW',
      lead_score INTEGER,
      vision_2030_score INTEGER,
      vision_2030_program TEXT,
      vision_2030_alignment TEXT,
      email_verified INTEGER DEFAULT 0,
      email_source TEXT DEFAULT 'gemini',
      do_not_contact INTEGER DEFAULT 0,
      stage_entered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  // Add intelligence hub columns
  initIntelligenceSchema(db);
  return db;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('huntOrchestrate — Gate-1 integration test', () => {
  let testDb: Database.Database;

  beforeAll(() => {
    testDb = buildTestDb();
  });

  it('assembles + stores a lead end-to-end with stubbed WATHQ', async () => {
    // Stub: WATHQ returns SABIC without needing a real key
    const stubFetchWathq = async (_cr: string): Promise<WLead> => STUB_WATHQ_RESPONSE;

    const deps: OrchestratorDeps = {
      fetchWathqLead: stubFetchWathq,
      enrichContact: (await import('../src/services/contactEnrichment.js')).enrichContact,
      db: testDb,
    };

    // Supply the CR directly to bypass the Gemini CR-discovery step
    const result = await huntOrchestrate(
      { sector: 'petrochemicals', geo: 'Riyadh', count: 1, crs: [STUB_SABIC_CR] },
      deps,
      null,
    );

    console.log('[TEST] orchestrate result:', JSON.stringify(result, null, 2));

    // ── Assert orchestration shape ─────────────────────────────────────────
    expect(result.sector).toBe('petrochemicals');
    expect(result.geo).toBe('Riyadh');
    expect(result.assembled).toBe(1);
    expect(result.leads).toHaveLength(1);

    const lead = result.leads[0];

    // Company fields from stub
    expect(lead.company_name).toBe('Saudi Basic Industries Corporation (SABIC)');
    expect(lead.cr_number).toBe(STUB_SABIC_CR);
    expect(lead.hq_city).toBe('Riyadh');
    expect(lead.verified_real).toBe(false); // sandbox stub — correct

    // Decision maker
    expect(lead.decision_maker.name).toBeTruthy();
    expect(lead.decision_maker.role).toBeTruthy();

    // Contact: enrichment ran (may be 'none' if no contact found, but rung must be valid)
    const validRungsSet = ['none', 'unverified', 'mx_ok', 'probable', 'verified', 'public'];
    expect(validRungsSet).toContain(lead.contact.email_rung);

    // Signal: may be null if Gemini found nothing, but if present must have a headline
    if (lead.signal !== null) {
      expect(lead.signal.headline).toBeTruthy();
    }

    // Provenance URL must be set from WATHQ stub
    expect(lead.provenance_url).toContain('wathq.sa');

    // ── Assert DB store ────────────────────────────────────────────────────
    expect(lead.stored).toBe(true);

    const row = testDb.prepare(
      'SELECT lead_id, name, company, industry, status, email_verified, lead_score FROM leads WHERE lead_id = ?',
    ).get(lead.lead_id) as Record<string, unknown> | undefined;

    console.log('[TEST] DB row:', row);
    expect(row).toBeDefined();
    expect(row?.lead_id).toBe(lead.lead_id);
    expect(row?.company).toBe('Saudi Basic Industries Corporation (SABIC)');
    expect(row?.industry).toBe('petrochemicals');
    expect(row?.status).toBe('NEW');
    // email_rung lives on the in-memory AssembledLead, not in the DB row;
    // already asserted above via validRungsSet check.

  }, 120_000); // allow time for real Gemini calls (domain lookup + scrape + pattern + signal)

  it('degrades gracefully when WATHQ_CONSUMER_KEY is not set (no crs bypass)', async () => {
    // Remove the key for this test
    const savedKey = process.env.WATHQ_CONSUMER_KEY;
    delete process.env.WATHQ_CONSUMER_KEY;

    try {
      const deps: OrchestratorDeps = {
        fetchWathqLead, // real function — will throw "WATHQ_CONSUMER_KEY not set"
        enrichContact: (await import('../src/services/contactEnrichment.js')).enrichContact,
        db: testDb,
      };

      // No crs supplied → triggers CR discovery → hits WATHQ_CONSUMER_KEY check
      const result = await huntOrchestrate(
        { sector: 'fintech', geo: 'Riyadh', count: 2 },
        deps,
        null,
      );

      console.log('[TEST] graceful-degrade result:', JSON.stringify(result, null, 2));

      // Must not crash; must return 0 assembled leads and a clear error
      expect(result.assembled).toBe(0);
      expect(result.wathq_path).toBe('blocked');
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toMatch(/WATHQ_CONSUMER_KEY/);
    } finally {
      // Restore
      if (savedKey !== undefined) process.env.WATHQ_CONSUMER_KEY = savedKey;
    }
  }, 15_000);
});

// Re-export fetchWathqLead for the graceful-degrade test without triggering the real call
import { fetchWathqLead } from '../src/services/wathqService.js';
