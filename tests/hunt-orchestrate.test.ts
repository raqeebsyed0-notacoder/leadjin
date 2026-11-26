/**
 * hunt-orchestrate.test.ts — Gate-1 keyless verified-lead tests
 *
 * What is stubbed:  fetchWathqLead (no WATHQ key required), the corroboration
 *                   public-source fetch (jinaCorroborate), and the public
 *                   search leg (tinyfishSearch). No CLI/network call is made.
 * What runs REAL:   enrichContact, generateBuyingSignal, DB store + read-back
 *                   (in-memory SQLite), the five-field gate and corroboration
 *                   field/URL assembly.
 *
 * Keyless verified-lead path:
 *  - no googleSearch, no LLM-emitted evidence URLs; evidence URLs come only
 *    from the two injectable legs (Jina Reader + TinyFish search).
 *  - verified_real = all five fields present (email, person name, company
 *    name, linkedin, hq_city) AND evidence_urls non-empty. Each field's URL
 *    is recorded in fieldEvidence and the corroboration log.
 *  - Wathq is optional enrichment only and never blocks a standard hunt.
 *  - decision_maker.name is the PERSON corroborated from a public source,
 *    never the company name.
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import Database from 'better-sqlite3';
import { initIntelligenceSchema } from '../src/services/intelligenceHub.js';
import { huntOrchestrate, type OrchestratorDeps } from '../src/services/huntOrchestrator.js';
import type { WathqLead as WLead } from '../src/services/wathqService.js';

// ---------------------------------------------------------------------------
// Stub WATHQ response — SABIC (real company, real domain sabic.com)
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
    { name: 'Abdulrahman Al-Fageeh', role: 'Chief Executive Officer', nationality: 'Saudi', kind: 'management' },
    { name: 'Abdullah Al-Otaibi', role: 'Chief Financial Officer', nationality: 'Saudi', kind: 'management' },
  ],
  contact: null,
  provenance: {
    source: 'wathq',
    api: `https://api.wathq.sa/sandbox/commercial-registration/fullinfo/${STUB_SABIC_CR}`,
    retrieved_at: new Date().toISOString(),
    verified_real: false, // sandbox — correct
  },
};

// Public-source text stubs (evidence: the Jina Reader URL fetched for the
// candidate domain sabic.com). PERSON + COMPANY/CITY/EMAIL/LINKEDIN labels
// make the five-field gate pass honestly (IMPL-SPEC Gap 3).
const STUB_TEXT_FULL = (
  `NAME: Saudi Basic Industries Corporation (SABIC)`
  + '\n'
  + `CITY: Riyadh`
  + '\n'
  + `EMAIL: ir@sabic.com`
  + '\n'
  + `LINKEDIN: https://www.linkedin.com/company/sabic`
  + '\n'
  + `COMPANY: Saudi Basic Industries Corporation (SABIC)`
  + '\n'
  + `PERSON: Abdulrahman Al-Fageeh`
);
const STUB_TEXT_NO_LINKEDIN = (
  `NAME: Saudi Basic Industries Corporation (SABIC)`
  + '\n'
  + `CITY: Riyadh`
  + '\n'
  + `EMAIL: ir@sabic.com`
  + '\n'
  + `COMPANY: Saudi Basic Industries Corporation (SABIC)`
  + '\n'
  + `PERSON: Abdulrahman Al-Fageeh`
);
// Jina supplies company/linkedin/city but no email or person: those two must
// come from the search leg for the five-field gate to pass.
const STUB_TEXT_JINA_PARTIAL = (
  `NAME: Saudi Basic Industries Corporation (SABIC)`
  + '\n'
  + `CITY: Riyadh`
  + '\n'
  + `LINKEDIN: https://www.linkedin.com/company/sabic`
  + '\n'
  + `COMPANY: Saudi Basic Industries Corporation (SABIC)`
);

const SEARCH_URL_EMAIL = 'https://www.sabic.com/en/investors/contact';
const STUB_SEARCH_RESULTS = [
  {
    url: SEARCH_URL_EMAIL,
    snippet: 'Investor relations: ir@sabic.com. Ahmed Hassan handles enquiries.',
    title: 'SABIC Investor Contacts',
  },
  {
    url: 'https://www.sabic.com/en/about/leadership',
    snippet: 'The leadership page names Ahmed Hassan as director.',
    title: 'SABIC Leadership',
  },
];

const CANDIDATE = {
  name: 'Saudi Basic Industries Corporation (SABIC)',
  domain: 'sabic.com',
};
const JINA_URL = 'https://r.jina.ai/https://www.sabic.com';

// ---------------------------------------------------------------------------
// Build an in-memory SQLite DB with the leads schema including the
// keyless-verified columns: company_domain, city, evidence_urls.
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
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      verified_real INTEGER DEFAULT 0,
      provenance_url TEXT,
      source_url TEXT,
      majlis_tips TEXT,
      company_domain TEXT,
      city TEXT,
      evidence_urls TEXT
    );
  `);
  // Add intelligence hub columns (as in the real server.ts schema init).
  initIntelligenceSchema(db);
  return db;
}

// Both external deps are always stubbed: no TinyFish CLI, no network fetch.
const noSearch = () => vi.fn().mockResolvedValue([] as typeof STUB_SEARCH_RESULTS);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('huntOrchestrate — keyless verified-lead path', () => {
  let testDb: Database.Database;

  beforeAll(() => {
    testDb = buildTestDb();
  });

  // Test 1: keyless public-source leg with all five fields corroborated.
  it('yields a verified lead with stored evidence URL from the public-source leg', async () => {
    const corroborationFetch = vi.fn().mockImplementation(async (url: string) => ({ url, text: STUB_TEXT_FULL }));

    const deps: OrchestratorDeps = {
      fetchWathqLead: async () => STUB_WATHQ_RESPONSE,   // optional enrich only
      corroboratePublicSources: corroborationFetch,
      searchPublicSources: noSearch(),
      enrichContact: (await import('../src/services/contactEnrichment.js')).enrichContact,
      db: testDb,
    };

    const result = await huntOrchestrate(
      { sector: 'petrochemicals', geo: 'Riyadh', count: 1, candidates: [CANDIDATE] },
      deps, null,
    );

    const lead = result.leads[0];

    // No WATHQ key → never blocks.
    expect(result.wathq_path).toBe('stubbed');
    // Evidence URL comes ONLY from the fetched Jina Reader response.
    expect(lead.evidence_urls).toEqual(['https://r.jina.ai/https://www.sabic.com']);
    // Five-field gate passes honestly.
    expect(lead.verified_real).toBe(true);
    expect(lead.company_name).toBe('Saudi Basic Industries Corporation (SABIC)');
    expect(lead.hq_city).toBe('Riyadh');
    expect(lead.linkedin).toMatch(/linkedin\.com\/company\/sabic/);
    expect(lead.contact.email).toMatch(/sabic\.com/);
    // decision_maker is the PERSON, not the company.
    expect(lead.decision_maker.name).toBe('Abdulrahman Al-Fageeh');
    expect(lead.decision_maker.role).toBe('unknown');

    // DB row stores the corroboration columns.
    const row = testDb.prepare(
      'SELECT city, linkedin, evidence_urls, verified_real, company FROM leads WHERE lead_id = ?',
    ).get(lead.lead_id) as Record<string, unknown> | undefined;
    expect(row).toBeDefined();
    expect(row?.city).toBe('Riyadh');
    expect(row?.linkedin).toMatch(/linkedin/);
    expect(row?.evidence_urls).toContain('https://r.jina.ai/https://www.sabic.com');
    expect(row?.verified_real).toBe(1);
  }, 120_000);

  // Test 2: gate keeps verified_real false when a required field is missing.
  it('keeps verified_real false when any of the five fields is missing', async () => {
    const corroborationFetch = vi.fn().mockImplementation(async (url: string) => ({ url, text: STUB_TEXT_NO_LINKEDIN }));

    const deps: OrchestratorDeps = {
      fetchWathqLead: async () => STUB_WATHQ_RESPONSE,
      corroboratePublicSources: corroborationFetch,
      searchPublicSources: noSearch(),
      enrichContact: (await import('../src/services/contactEnrichment.js')).enrichContact,
      db: testDb,
    };

    const result = await huntOrchestrate(
      { sector: 'petrochemicals', geo: 'Riyadh', count: 1, candidates: [CANDIDATE] },
      deps, null,
    );

    const lead = result.leads[0];
    expect(lead.verified_real).toBe(false);
    expect(lead.linkedin).toBeNull();
    expect(lead.evidence_urls).toEqual(['https://r.jina.ai/https://www.sabic.com']);
  }, 120_000);


  // Test 3: gate keeps verified_real false when evidence_urls is empty.
  it('keeps verified_real false when evidence_urls is empty', async () => {
    const corroborationFetch = vi.fn().mockResolvedValue({ url: 'https://r.jina.ai/https://example.com/', text: '' });

    const deps: OrchestratorDeps = {
      fetchWathqLead: async () => STUB_WATHQ_RESPONSE,
      corroboratePublicSources: corroborationFetch,
      searchPublicSources: noSearch(),
      enrichContact: (await import('../src/services/contactEnrichment.js')).enrichContact,
      db: testDb,
    };

    const result = await huntOrchestrate(
      { sector: 'petrochemicals', geo: 'Riyadh', count: 1, candidates: [CANDIDATE] },
      deps, null,
    );

    const lead = result.leads[0];
    expect(lead.verified_real).toBe(false);
    expect(lead.evidence_urls).toEqual([]);
  }, 120_000);

  // Test 4: graceful degrade without WATHQ_CONSUMER_KEY.
  it('degrades gracefully when WATHQ_CONSUMER_KEY is not set', async () => {
    const corroborationFetch = vi.fn().mockImplementation(async (url: string) => ({ url, text: STUB_TEXT_FULL }));

    const deps: OrchestratorDeps = {
      fetchWathqLead: async () => STUB_WATHQ_RESPONSE,
      corroboratePublicSources: corroborationFetch,
      searchPublicSources: noSearch(),
      enrichContact: (await import('../src/services/contactEnrichment.js')).enrichContact,
      db: testDb,
    };

    const result = await huntOrchestrate(
      { sector: 'fintech', geo: 'Riyadh', count: 1, candidates: [CANDIDATE] },
      deps, null,
    );

    expect(result.assembled).toBeGreaterThan(0);
    expect(result.wathq_path).toBe('stubbed');
    expect(result.errors).toHaveLength(0);
  }, 15_000);

  // Test 5 (Case A): five fields from two sources, each backed by a URL.
  it('corroborates email + person from one search with per-field evidence URLs', async () => {
    const jinaFetch = vi.fn().mockImplementation(async (url: string) => ({ url, text: STUB_TEXT_JINA_PARTIAL }));
    const search = vi.fn().mockResolvedValue(STUB_SEARCH_RESULTS);

    const deps: OrchestratorDeps = {
      fetchWathqLead: async () => STUB_WATHQ_RESPONSE,
      corroboratePublicSources: jinaFetch,
      searchPublicSources: search,
      enrichContact: (await import('../src/services/contactEnrichment.js')).enrichContact,
      db: testDb,
    };

    const result = await huntOrchestrate(
      { sector: 'petrochemicals', geo: 'Riyadh', count: 1, candidates: [CANDIDATE] },
      deps, null,
    );
    const lead = result.leads[0];

    expect(jinaFetch).toHaveBeenCalledTimes(1);
    // Exactly ONE search per candidate, with the prescribed query shape.
    expect(search).toHaveBeenCalledTimes(1);
    expect(search).toHaveBeenCalledWith('Saudi Basic Industries Corporation (SABIC) Riyadh contact email LinkedIn');

    expect(lead.verified_real).toBe(true);
    const FIELD_KEYS = ['email', 'name', 'company_name', 'linkedin', 'hq_city'] as const;
    for (const key of FIELD_KEYS) {
      expect(lead.fieldEvidence[key], `missing fieldEvidence.${key}`).toBeTruthy();
      expect(lead.fieldEvidence[key]?.url).toMatch(/^https:\/\//);
    }
    expect(lead.fieldEvidence.email?.value).toBe('ir@sabic.com');
    expect(lead.fieldEvidence.email?.url).toBe(SEARCH_URL_EMAIL);
    expect(lead.fieldEvidence.name?.value).toBe('Ahmed Hassan');
    expect(lead.fieldEvidence.name?.url).toBe(SEARCH_URL_EMAIL);
    expect(lead.fieldEvidence.linkedin?.url).toBe(JINA_URL);
    expect(lead.contact.email).toBe('ir@sabic.com');
    expect(lead.decision_maker.name).toBe('Ahmed Hassan');

    expect(lead.evidence_urls).toContain(JINA_URL);
    expect(lead.evidence_urls).toContain(SEARCH_URL_EMAIL);

    // Audit log carries the search input and each accepted field's URL.
    expect(lead.corroboration_log).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: 'jina', url: JINA_URL, field: 'query' }),
      expect.objectContaining({ source: 'tinyfish', url: SEARCH_URL_EMAIL, field: 'email' }),
      expect.objectContaining({ source: 'tinyfish', url: SEARCH_URL_EMAIL, field: 'name' }),
    ]));

    const row = testDb.prepare('SELECT evidence_urls, verified_real FROM leads WHERE lead_id = ?').get(lead.lead_id) as Record<string, unknown> | undefined;
    expect(row?.evidence_urls).toContain(SEARCH_URL_EMAIL);
    expect(row?.verified_real).toBe(1);
  }, 120_000);

  // Test 6 (Case B): no search results → gate fails closed.
  it('keeps verified_real false when the search returns no results', async () => {
    const search = noSearch();
    const deps: OrchestratorDeps = {
      fetchWathqLead: async () => STUB_WATHQ_RESPONSE,
      corroboratePublicSources: vi.fn().mockImplementation(async (url: string) => ({ url, text: STUB_TEXT_JINA_PARTIAL })),
      searchPublicSources: search,
      enrichContact: (await import('../src/services/contactEnrichment.js')).enrichContact,
      db: testDb,
    };

    const result = await huntOrchestrate(
      { sector: 'petrochemicals', geo: 'Riyadh', count: 1, candidates: [CANDIDATE] },
      deps, null,
    );
    const lead = result.leads[0];

    expect(search).toHaveBeenCalledTimes(1);
    expect(lead.fieldEvidence.email).toBeUndefined();
    expect(lead.fieldEvidence.name).toBeUndefined();
    expect(lead.contact.email).toBeNull();
    expect(lead.verified_real).toBe(false);
    expect(lead.evidence_urls).toEqual([JINA_URL]);
  }, 120_000);

  // Test 7 (Case C): no WATHQ key and a throwing Wathq dep still assembles.
  it('assembles with wathq_path stubbed when the WATHQ key is absent', async () => {
    const prevKey = process.env.WATHQ_CONSUMER_KEY;
    delete process.env.WATHQ_CONSUMER_KEY;
    try {
      const throwingWathq = vi.fn().mockRejectedValue(new Error('WATHQ_CONSUMER_KEY not set'));
      const deps: OrchestratorDeps = {
        fetchWathqLead: throwingWathq as unknown as OrchestratorDeps['fetchWathqLead'],
        corroboratePublicSources: vi.fn().mockImplementation(async (url: string) => ({ url, text: STUB_TEXT_FULL })),
        searchPublicSources: noSearch(),
        enrichContact: (await import('../src/services/contactEnrichment.js')).enrichContact,
        db: testDb,
      };

      const result = await huntOrchestrate(
        { sector: 'petrochemicals', geo: 'Riyadh', count: 1, candidates: [CANDIDATE] },
        deps, null,
      );

      expect(throwingWathq).toHaveBeenCalledTimes(1);
      expect(result.assembled).toBeGreaterThan(0);
      expect(result.wathq_path).toBe('stubbed');
      expect(result.errors).toHaveLength(0);
      expect(result.leads[0].verified_real).toBe(true);
      expect(result.leads[0].cr_number).toBeNull();
    } finally {
      if (prevKey === undefined) delete process.env.WATHQ_CONSUMER_KEY;
      else process.env.WATHQ_CONSUMER_KEY = prevKey;
    }
  }, 120_000);
});
