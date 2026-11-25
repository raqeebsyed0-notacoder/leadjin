/**
 * huntOrchestrator.ts — Gate-1 (W2-T2)
 *
 * Chains: sector/geo discovery → WATHQ company lookup → people → enrichContact
 * waterfall → grounded buying-signal → assemble + store lead in leadjin.db.
 *
 * Design rules:
 *  - All external dependencies are injectable so unit tests can stub WATHQ
 *    while running the real enrich/signal/DB path.
 *  - WATHQ discovery (sector→CR numbers) is a BEST-EFFORT Gemini-grounded step;
 *    when WATHQ_CONSUMER_KEY is absent, the whole chain degrades gracefully and
 *    returns a clear "WATHQ key not set" error (never crashes).
 *  - `verified_real` on the assembled lead is sourced exclusively from WATHQ
 *    provenance — never hard-set to true.
 *  - D11: national IDs are never stored (wathqService already strips them).
 *  - user_id is optional; when absent the row is stored with null (system hunt).
 */

import { randomUUID } from 'crypto';
import type Database from 'better-sqlite3';
import { getGenAI } from './genaiClient.js';
import { enrichContact, type ContactResult } from './contactEnrichment.js';
import {
  fetchWathqLead,
  type WathqLead,
  type WathqDecisionMaker,
} from './wathqService.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface OrchestrateInput {
  /** Sector/industry keyword, e.g. "fintech", "healthcare", "real estate" */
  sector: string;
  /** Saudi city, e.g. "Riyadh", "Jeddah", "Dammam" */
  geo: string;
  /** How many companies to discover and enrich (capped at 10) */
  count?: number;
  /** Bypass discovery: directly supply known CR numbers. */
  crs?: string[];
}

export interface BuyingSignal {
  headline: string;
  url: string | null;
  snippet: string;
  relevance: string;
}

export interface AssembledLead {
  lead_id: string;
  company_name: string | null;
  cr_number: string | null;
  hq_city: string | null;
  entity_type: string | null;
  status: string | null;
  verified_real: boolean;
  decision_maker: {
    name: string | null;
    role: string;
  };
  contact: ContactResult;
  signal: BuyingSignal | null;
  provenance_url: string;
  stored: boolean;
}

export interface OrchestrateResult {
  sector: string;
  geo: string;
  requested: number;
  assembled: number;
  leads: AssembledLead[];
  errors: string[];
  wathq_path: 'live' | 'stubbed' | 'blocked';
  signal_path: 'vertex' | 'gemini_key' | 'blocked';
}

// ---------------------------------------------------------------------------
// Injectable deps interface (allows test stubbing)
// ---------------------------------------------------------------------------

export interface OrchestratorDeps {
  fetchWathqLead: (cr: string, lang?: 'ar' | 'en') => Promise<WathqLead>;
  enrichContact: typeof enrichContact;
  db: Database.Database;
}

// ---------------------------------------------------------------------------
// Step A: Discover CR numbers from sector + geo using Gemini grounded search
//
// BLOCKED when WATHQ_CONSUMER_KEY is not set (no point discovering CRs we
// cannot look up). Returns an empty list + a descriptive error when blocked.
// ---------------------------------------------------------------------------

async function discoverCRs(
  sector: string,
  geo: string,
  count: number,
): Promise<{ crs: string[]; error: string | null }> {
  const key = process.env.WATHQ_CONSUMER_KEY;
  if (!key) {
    return {
      crs: [],
      error: 'WATHQ_CONSUMER_KEY not set — company discovery blocked; supply CRs directly via the `crs` input field',
    };
  }

  try {
    const ai = getGenAI();
    const prompt = `List ${count} real Saudi Arabian companies in the "${sector}" sector located in or near ${geo}.
For each company, provide its 10-digit Saudi Commercial Registration (CR) number.
Only include companies with publicly verifiable CR numbers.
Respond ONLY in this exact format (one per line, nothing else):
CR: <10-digit CR number> | NAME: <company name>`;

    const resp = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });

    const text = resp.text || '';
    const lines = text.split('\n');
    const crs: string[] = [];

    for (const line of lines) {
      const m = line.match(/CR:\s*(\d{10})/);
      if (m) {
        crs.push(m[1]);
      }
    }

    if (crs.length === 0) {
      return {
        crs: [],
        error: `Gemini discovery returned no parseable CR numbers for "${sector}" in ${geo}. Response: ${text.slice(0, 200)}`,
      };
    }

    console.log(`[HuntOrchestrator] Discovered ${crs.length} CR(s) for ${sector}/${geo}: ${crs.join(', ')}`);
    return { crs: crs.slice(0, count), error: null };
  } catch (e: any) {
    return {
      crs: [],
      error: `CR discovery failed: ${e?.message ?? String(e)}`,
    };
  }
}

// ---------------------------------------------------------------------------
// Step B: Generate a cited buying signal for a company
// ---------------------------------------------------------------------------

async function generateBuyingSignal(
  companyName: string,
  sector: string,
): Promise<BuyingSignal | null> {
  try {
    const ai = getGenAI();
    const prompt = `Find a RECENT buying signal or business trigger for the Saudi company "${companyName}" in the ${sector} sector.
A buying signal is: a new office opening, a funding round, a new product launch, a hiring surge, a tender announcement, or a regulatory change that creates a need.
ONLY cite a signal you can find at a specific public URL.
Respond in exactly this format:
HEADLINE: <one sentence>
URL: <https://... or NONE>
SNIPPET: <2-3 sentences of context>
RELEVANCE: <why this is a buying signal>`;

    const resp = await ai.models.generateContent({
      model: 'gemini-3.1-pro-preview', // Jin's reasoning — the buying signal runs on 3.1-pro (proxy maps 'pro' → LEADJIN_MODEL)
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });

    const text = resp.text || '';
    const headlineM = text.match(/HEADLINE:\s*(.+)/i);
    const urlM = text.match(/URL:\s*(https?:\/\/\S+)/i);
    const snippetM = text.match(/SNIPPET:\s*([\s\S]+?)(?=RELEVANCE:|$)/i);
    const relevanceM = text.match(/RELEVANCE:\s*([\s\S]+?)$/i);

    if (!headlineM) return null;

    return {
      headline: headlineM[1].trim(),
      url: urlM ? urlM[1].trim() : null,
      snippet: snippetM ? snippetM[1].trim() : '',
      relevance: relevanceM ? relevanceM[1].trim() : '',
    };
  } catch (e: any) {
    console.warn(`[HuntOrchestrator] Signal generation failed for ${companyName}:`, e?.message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Step C: Store assembled lead in leads table
// ---------------------------------------------------------------------------

function storeLead(
  db: Database.Database,
  lead: AssembledLead,
  sector: string,
  signalUrl: string | null,
  userId: number | null,
): boolean {
  try {
    // Use INSERT OR IGNORE — idempotent (same lead_id won't error on re-run).
    const stmt = db.prepare(`
      INSERT OR IGNORE INTO leads (
        lead_id, user_id, name, title, company, industry,
        email, phone, website, lead_score, email_source,
        email_verified, status, source_url, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const now = new Date().toISOString();
    // Derive a company website from enrichment notes if available
    const websiteMatch = lead.contact.notes?.match(/Domain:\s*([^\s|]+)/);
    const website = websiteMatch ? `https://${websiteMatch[1]}` : null;

    // email_verified: 1 = 'public' or 'verified' rung; 0 otherwise
    const emailVerified =
      lead.contact.email_rung === 'public' || lead.contact.email_rung === 'verified' ? 1 : 0;

    stmt.run(
      lead.lead_id,
      userId,
      lead.decision_maker.name,
      lead.decision_maker.role,
      lead.company_name,
      sector,
      lead.contact.email,
      lead.contact.phone,
      website,
      // score = 80 if verified_real, 60 if mx_ok, 40 otherwise (heuristic)
      lead.verified_real ? 80 : lead.contact.email_rung !== 'none' ? 60 : 40,
      lead.contact.email_sources?.[0] || 'wathq_orchestrator',
      emailVerified,
      'NEW',
      signalUrl,
      now,
    );

    console.log(`[HuntOrchestrator] Stored lead ${lead.lead_id} for ${lead.decision_maker.name} @ ${lead.company_name}`);
    return true;
  } catch (e: any) {
    console.error(`[HuntOrchestrator] DB store failed for lead ${lead.lead_id}:`, e?.message);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Main orchestrator
// ---------------------------------------------------------------------------

export async function huntOrchestrate(
  input: OrchestrateInput,
  deps: OrchestratorDeps,
  userId: number | null = null,
): Promise<OrchestrateResult> {
  const { sector, geo } = input;
  const count = Math.min(input.count ?? 3, 10);
  const errors: string[] = [];
  const leads: AssembledLead[] = [];

  let wathqPath: OrchestrateResult['wathq_path'] = 'live';
  const signalPath: OrchestrateResult['signal_path'] =
    process.env.LEADJIN_USE_VERTEX !== 'false' ? 'vertex' : 'gemini_key';

  // Determine CR numbers to process
  let crNumbers: string[] = input.crs ?? [];
  if (crNumbers.length === 0) {
    // Auto-discover from sector/geo
    const discovery = await discoverCRs(sector, geo, count);
    if (discovery.error) {
      errors.push(discovery.error);
      if (discovery.crs.length === 0) {
        wathqPath = 'blocked';
        return {
          sector,
          geo,
          requested: count,
          assembled: 0,
          leads: [],
          errors,
          wathq_path: wathqPath,
          signal_path: signalPath,
        };
      }
    }
    crNumbers = discovery.crs;
  }

  console.log(`[HuntOrchestrator] Processing ${crNumbers.length} CR(s) for ${sector} in ${geo}`);

  // Process all CRs in PARALLEL. Sequential was ~N×(enrich + grounded-3.1-pro signal) and
  // blew the bot's 180s wrapper timeout at count≥3; parallel wall-clock ≈ a single lead.
  const processOne = async (cr: string): Promise<AssembledLead | null> => {
    try {
      // ── WATHQ lookup ──────────────────────────────────────────────────────
      let wathqResult: WathqLead;
      try {
        wathqResult = await deps.fetchWathqLead(cr);
        // Track whether this was a real WATHQ call (key present) or a stubbed call.
        // If the key is present, the call was real (sandbox or prod depending on WATHQ_BASE).
        // If the key is absent, the function throws before reaching here — so reaching here
        // means the key was present (or the call was injected as a stub in tests).
        wathqPath = process.env.WATHQ_CONSUMER_KEY ? 'live' : 'stubbed';
      } catch (e: any) {
        if (e?.message?.includes('WATHQ_CONSUMER_KEY not set')) {
          wathqPath = 'blocked';
          errors.push(`CR ${cr}: WATHQ_CONSUMER_KEY not set`);
          return null;
        }
        errors.push(`CR ${cr}: WATHQ lookup failed — ${e?.message ?? String(e)}`);
        return null;
      }

      const company = wathqResult.company;

      // ── Pick primary decision-maker ───────────────────────────────────────
      // Prefer named management members; fall back to partners; skip unnamed.
      const allPeople: WathqDecisionMaker[] = wathqResult.decision_makers.filter(
        (p): p is WathqDecisionMaker => !!p.name,
      );
      const primaryPerson: WathqDecisionMaker | undefined =
        allPeople.find(p => p.kind === 'management') ?? allPeople[0];

      if (!primaryPerson) {
        errors.push(`CR ${cr}: no named decision-makers found in WATHQ response`);
        // Still continue — store the company with no contact rather than skip
      }

      // ── Contact enrichment ────────────────────────────────────────────────
      let contact: ContactResult = {
        email: null,
        email_rung: 'none',
        email_sources: [],
        phone: null,
        phone_source: null,
        notes: 'No named decision-maker found in WATHQ data',
      };

      if (primaryPerson) {
        try {
          contact = await deps.enrichContact({
            name: primaryPerson.name!,
            company: company.name ?? `CR ${cr}`,
            lang: 'en',
          });
        } catch (e: any) {
          errors.push(`CR ${cr}: enrichment failed for ${primaryPerson.name} — ${e?.message}`);
          // Partial result: keep the WATHQ data, store with no contact
        }
      }

      // ── Buying signal ─────────────────────────────────────────────────────
      let signal: BuyingSignal | null = null;
      try {
        signal = await generateBuyingSignal(company.name ?? `CR ${cr}`, sector);
      } catch (e: any) {
        errors.push(`CR ${cr}: signal generation error — ${e?.message}`);
      }

      // ── Assemble lead ─────────────────────────────────────────────────────
      const leadId = randomUUID();
      const assembled: AssembledLead = {
        lead_id: leadId,
        company_name: company.name,
        cr_number: company.cr_number,
        hq_city: company.hq_city,
        entity_type: company.entity_type,
        status: company.status,
        verified_real: wathqResult.provenance.verified_real,
        decision_maker: {
          name: primaryPerson?.name ?? null,
          role: primaryPerson?.role ?? 'unknown',
        },
        contact,
        signal,
        provenance_url: wathqResult.provenance.api,
        stored: false,
      };

      // ── Store in DB ───────────────────────────────────────────────────────
      const stored = storeLead(
        deps.db,
        assembled,
        sector,
        signal?.url ?? null,
        userId,
      );
      assembled.stored = stored;
      return assembled;

    } catch (e: any) {
      errors.push(`CR ${cr}: unexpected error — ${e?.message ?? String(e)}`);
      return null;
    }
  };

  // Concurrency-capped batches. Full parallelism bursts past Vertex's rate limit
  // (especially while the AI-Studio key is capped → 100% of load lands on Vertex).
  // Batches of LEADJIN_HUNT_CONCURRENCY (default 2) balance speed vs 429s.
  const BATCH = Number(process.env.LEADJIN_HUNT_CONCURRENCY || '2') || 2;
  const targets = crNumbers.slice(0, count);
  for (let i = 0; i < targets.length; i += BATCH) {
    const settled = await Promise.all(targets.slice(i, i + BATCH).map(processOne));
    for (const a of settled) { if (a) leads.push(a); }
  }

  return {
    sector,
    geo,
    requested: count,
    assembled: leads.length,
    leads,
    errors,
    wathq_path: wathqPath,
    signal_path: signalPath,
  };
}
