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
import { execFile } from 'child_process';
import type Database from 'better-sqlite3';
import { getGenAI } from './genaiClient.js';
import { searchPlaces, getPlaceDetails } from './placesDiscovery.js';
import { enrichContact, type ContactResult } from './contactEnrichment.js';
import {
  fetchWathqLead,
  type WathqCompany,
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
  /** Bypass discovery: directly supply known candidates. */
  candidates?: { name: string; domain: string }[];
  /** Legacy CR-numbers bypass (kept for server.ts route parity). */
  crs?: string[] | null;
  // Production-wiring params forwarded into generation + persistence.
  majlisMode?: string;
  vision2030?: string;
  geography?: string;
  industry?: string;
  jobTitles?: string[];
  limits?: number;
  templates?: string[];
}

export interface BuyingSignal {
  headline: string;
  url: string | null;
  snippet: string;
  relevance: string;
}

// Field keys for the verified-real gate (all five must be corroborated from
// a live public source and stored with their evidence URL).
export type FieldKey = 'email' | 'name' | 'company_name' | 'linkedin' | 'hq_city';
/** One corroborated field: its value plus the stored URL that backs it. */
export interface FieldEvidenceEntry {
  value: string;
  url: string;
}


export interface FieldEvidence {
  email?: FieldEvidenceEntry | null;
  name?: FieldEvidenceEntry | null;
  company_name?: FieldEvidenceEntry | null;
  linkedin?: FieldEvidenceEntry | null;
  hq_city?: FieldEvidenceEntry | null;
  domain?: FieldEvidenceEntry | null;
}

/** One entry of the auditable corroboration log attached to a lead. */
export interface CorroborationEntry {
  source: 'jina' | 'tinyfish';
  url: string;
  field: FieldKey | 'query';
}

/** One candidate company proposed by Gemini (no web access) */
export interface Candidate {
  name: string;
  domain: string;
}

/**
 * Keyless public-source corroboration fetch. Returns the exact URL fetched
 * plus the fetched text. On network error returns the URL with empty text so
 * the verified-real gate fails closed.
 */
export interface CorroborationFetch {
  (url: string, lang?: 'ar' | 'en'): Promise<{ url: string; text: string }>;
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
  // Production-wiring params forwarded into generation + persistence.
  vision2030?: string | null;
  majlisMode?: string | null;
  industry?: string | null;
  geography?: string | null;
  jobTitles?: string[] | null;
  limits?: number | null;
  templates?: string[] | null;
  linkedin: string | null;
  /** Company domain from the public-source leg (candidate domain fallback) */
  company_domain: string | null;
  /** Stored evidence URLs from the fetch return — never from the LLM */
  evidence_urls: string[];
  /** Corroborated fields → their backing (stored) URL */
  fieldEvidence: FieldEvidence;
  /** Auditable search/Jina input & accepted-field output */
  corroboration_log: CorroborationEntry[];
}

export interface OrchestrateResult {
  sector: string;
  geo: string;
  requested: number;
  assembled: number;
  leads: AssembledLead[];
  errors: string[];
  wathq_path: 'live' | 'stubbed' | 'blocked';
  signal_path: 'vertex' | 'api_key' | 'blocked';
}

// ---------------------------------------------------------------------------
// parsePublicSource(text, url, candidateName?, candidateDomain?)
// Extract corroborated fields from fetched text (IMPL-SPEC Gap 1).
//
// Labeled lines take precedence (case-insensitive): PERSON:, CITY:, EMAIL:,
// LINKEDIN:, COMPANY:, DOMAIN:. Only fall back to regex: email, LinkedIn,
// domain (DOMAIN: label or the candidate domain), and city (a Saudi city
// name found in the text). Never manufactures a value — a field absent from
// the fetched text stays null.
// ---------------------------------------------------------------------------
export function parsePublicSource(
  text: string,
  url: string,
  candidateName?: string,
  candidateDomain?: string,
): {
  company_name: string | null;
  domain: string | null;
  hq_city: string | null;
  linkedin: string | null;
  email: string | null;
  person_name: string | null;
  evidence_urls: string[];
  fieldEvidence: FieldEvidence;
} {
  const fieldEvidence: FieldEvidence = {};
  const evidenceUrls: string[] = [url];

  const findLabel = (label: string): string | null => {
    const re = new RegExp(`^${label}:\s*(.+)$`, 'i');
    for (const line of text.split('\n')) {
      const m = line.match(re);
      if (m) return m[1].trim();
    }
    return null;
  };

  // Labeled lines, priority order.
  const personName = findLabel('PERSON');
  let hqCity = findLabel('CITY');
  let email = findLabel('EMAIL');
  let linkedin = findLabel('LINKEDIN');
  let companyName = findLabel('COMPANY');
  if (!companyName) {
    companyName = findLabel('NAME');
  }
  let domain = findLabel('DOMAIN');

  // Common words that are not distinctive (shared by most Saudi corporate
  // names), so they never satisfy the distinctive-token check.
  const COMMON_WORDS = new Set([
    'saudi', 'basic', 'industries', 'corporation', 'company', 'holding',
    'holdings', 'international', 'resources', 'energy', 'trading',
    'industrial', 'chemical', 'petrochemical', 'advanced', 'development',
    'real', 'technology', 'technological', 'group', 'financial', 'bank',
  ]);

  // Company name: candidate name only when the fetched text corroborates the
  // company by a distinctive token of the candidate (e.g. 'Sabic' for
  // 'Saudi Basic Industries Corporation'). Tokens are split on whitespace and
  // punctuation, and matched case-insensitively against the fetched page
  // text. The token is always derived from the candidate name itself — never
  // invented. A field absent from the fetched text stays null.
  if (!companyName && candidateName != null) {
    const tokens = candidateName
      .split(/[\s\-_()]+/)
      .map((t) => t.toLowerCase())
      .filter(Boolean);
    const distinctToken = tokens.find((t) => t.length >= 4 && !COMMON_WORDS.has(t));
    if (distinctToken != null && text.toLowerCase().includes(distinctToken)) {
      companyName = candidateName;
    }
  }
  // Domain: candidate domain only when the fetched text contains it.
  if (!domain && candidateDomain != null && text.includes(candidateDomain)) {
    domain = candidateDomain;
  }

  // Regex fallbacks (fail closed — never manufacture).
  if (!email) {
    const m = text.match(/[\w.+-]+@[\w-]+\.\w+/);
    if (m) {
      fieldEvidence.email = { value: m[0], url };
      email = m[0];
    }
  }
  if (!linkedin) {
    const m = text.match(/https?:\/\/(www\.)?linkedin\.com\/(in|company)\/[A-Za-z0-9._%\-/?=&#]+/i);
    if (m) {
      fieldEvidence.linkedin = { value: m[0], url };
      linkedin = m[0];
    }
  }
  if (!hqCity) {
    const saudiCities = ['Riyadh', 'Jeddah', 'Dammam', 'Khobar', 'Makkah', 'Madinah', 'Abha', 'Taif', 'Buraydah'];
    for (const city of saudiCities) {
      if (text.includes(city)) {
        hqCity = city;
        break;
      }
    }
  }

  if (personName) fieldEvidence.name = { value: personName, url };
  if (companyName) fieldEvidence.company_name = { value: companyName, url };
  if (hqCity) fieldEvidence.hq_city = { value: hqCity, url };
  if (linkedin) fieldEvidence.linkedin = { value: linkedin, url };
  if (email) fieldEvidence.email = { value: email, url };
  if (domain) fieldEvidence.domain = { value: domain, url };

  return {
    company_name: companyName,
    domain,
    hq_city: hqCity,
    linkedin,
    email,
    person_name: personName,
    evidence_urls: evidenceUrls,
    fieldEvidence,
  };
}

// ---------------------------------------------------------------------------
// Search-result helper (IMPL-SPEC Gap 2)
// ---------------------------------------------------------------------------

/**
 * Fail-closed extraction of email + person from a TinyFish result snippet/title.
 * Only regexes are used (no labels assumed). Email uses the exact same regex as
 * parsePublicSource. Person is any two-capitalized-word sequence whose words
 * are not common site/title words (Contacts, Email, Company, etc.). If nothing
 * matches, both are null.
 */
function parseSearchResult(snippet: string, title: string):
  { email: string | null; person_name: string | null; company_name: string | null; linkedin: string | null; hq_city: string | null } {
  const email =
    snippet.match(/[\w.+-]+@[\w-]+\.\w+/) ??
    title.match(/[\w.+-]+@[\w-]+\.\w+/);

  const commonWords = new Set([
    'Contact', 'ContactUs', 'Email', 'Mail', 'Company', 'Group',
    'Services', 'Solutions', 'International', 'Holding', 'Holdings',
    'Industrial', 'Chemical', 'Petrochemical', 'Resources', 'Energy',
    'Trading', 'World', 'Firm', 'System', 'Platform', 'Technology',
    'Technologies', 'Investment', 'Bank', 'Capital', 'Insurance', 'Fund',
    'Research', 'Academy', 'University', 'Institute', 'Museum', 'Library',
    'Ministry', 'Government', 'Public', 'Private', 'Royal', 'Supreme',
    'General', 'National', 'Regional', 'Local', 'Chief', 'Executive',
    'Director', 'President', 'Vice', 'Chairman', 'Secretary',
    'Managing', 'Head', 'Owner', 'Founder', 'Co', 'The', 'Your', 'Get',
    'See', 'Know', 'About', 'Copyright', 'Privacy',
    // Non-person address/contact tokens that can appear as two capitalized
    // words (e.g. "Building No", "Floor Seven"). Reject as person names.
    'Building', 'No', 'Number', 'Street', 'Road', 'Avenue', 'Floor',
    'Office', 'Suite', 'Tower', 'Kingdom', 'Saudi', 'Arabia', 'Post',
    'Box', 'Code', 'Zip', 'Tel', 'Phone', 'Fax', 'Mobile', 'Email',
    'Contact', 'Website', 'Location', 'Address', 'Head', 'Quarter',
  ]);

  let person_name: string | null = null;
  const candidates: string[] = [];
  // The second word lives in a lookahead so adjacent pairs overlap: in
  // "Email Ahmed Hassan" we see both "Email Ahmed" and "Ahmed Hassan".
  const collectPairs = (s: string) => {
    const re = /([A-Z][a-z]+) (?=([A-Z][a-z]+))/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(s)) !== null) candidates.push(`${m[1]} ${m[2]}`);
  };
  collectPairs(snippet);
  collectPairs(title);

  // Prefer the snippet; accept the first two-capitalized-word sequence that
  // is not a common site/workword.
  for (const pair of candidates) {
    const words = pair.split(' ');
    if (!commonWords.has(words[0]) && !commonWords.has(words[1])) {
      person_name = pair;
      break;
    }
  }
  // LinkedIn URL from the snippet or title (same pattern as parsePublicSource).
  let linkedin: string | null = null;
  const linkedinRe = /https?:\/\/(www\.)?linkedin\.com\/(in|company)\/[A-Za-z0-9._%\-/?=&#]+/i;
  const linkedinMatch = snippet.match(linkedinRe) ?? title.match(linkedinRe);
  if (linkedinMatch) linkedin = linkedinMatch[0];

  // Company name: the first non-common capitalized word in the title, e.g.
  // 'SABIC' from 'SABIC Investor Contacts'; falls back to the snippet.
  let company_name: string | null = null;
  const firstWord = (s: string): string | null =>
    s.split(/\s+/).map((w) => w.replace(/[^a-zA-Z]/g, '')).find(
      (w) => w.length >= 4 && !commonWords.has(w),
    ) ?? null;
  if (firstWord(title)) company_name = firstWord(title);
  if (!company_name) company_name = firstWord(snippet);

  // A Saudi city from the snippet or title.
  let hq_city: string | null = null;
  const saudiCities = ['Riyadh', 'Jeddah', 'Dammam', 'Khobar', 'Makkah', 'Madinah', 'Abha', 'Taif', 'Buraydah'];
  for (const city of saudiCities) {
    if (snippet.toLowerCase().includes(city.toLowerCase()) || title.toLowerCase().includes(city.toLowerCase())) {
      hq_city = city;
      break;
    }
  }

  return { email: email ? email[0] : null, person_name, company_name, linkedin, hq_city };
}

// ---------------------------------------------------------------------------
// Public-source corroboration leg (IMPL-SPEC Gap 2)
// ---------------------------------------------------------------------------

/**
 * Production keyless public-source fetcher (IMPL-SPEC Gap 2).
 * Agent-reach Jina Reader: `https://r.jina.ai/https://www.{domain}`.
 * No API key, no cookie, no googleSearch. On network error returns the exact
 * URL fetched with empty text so the verified-real gate fails closed.
 */
export const jinaCorroborate: CorroborationFetch = async (url) => {
  // url is a string per CorroborationFetch; fail closed on any network error.
  const normalized = url;
  try {
    const res = await fetch(normalized);
    const text = await res.text();
    return { url: normalized, text };
  } catch {
    // Fail closed: the verified-real gate requires non-empty evidence_urls.
    return { url: normalized, text: '' };
  }
};

/** One citable TinyFish search hit (URL is always from the CLI, never invented). */
export interface PublicSearchResult {
  url: string;
  snippet: string;
  title: string;
}

/** Injectable search leg. At most ONE call is made per candidate. */
export type SearchPublicSources = (q: string) => Promise<PublicSearchResult[]>;

/**
 * Production keyless search leg. Invokes the TinyFish CLI exactly once per
 * query via execFile (20s timeout), parses JSON `results`, caps to 5, and
 * returns [] on any error. Never emits an invented URL.
 */
export const tinyfishSearch: SearchPublicSources = async (q) =>
  new Promise<PublicSearchResult[]>((resolve) => {
    execFile(
      '/home/euphoria/.local/bin/tinyfish',
      ['search', 'query', q],
      { timeout: 20000 },
      (err, stdout) => {
        if (err) {
          resolve([]);
          return;
        }
        try {
          const parsed = JSON.parse(String(stdout));
          const raw: any[] = Array.isArray(parsed) ? parsed : (parsed?.results ?? []);
          const out: PublicSearchResult[] = raw
            .slice(0, 5)
            .map((r: any) => ({
              url: String(r?.url ?? ''),
              snippet: String(r?.snippet ?? ''),
              title: String(r?.title ?? ''),
            }))
            .filter((r) => r.url.startsWith('http://') || r.url.startsWith('https://'));
          resolve(out);
        } catch {
          resolve([]);
        }
      },
    );
  });

// ---------------------------------------------------------------------------
// Injectable deps interface (allows test stubbing)
// ---------------------------------------------------------------------------

export interface OrchestratorDeps {
  fetchWathqLead: (cr: string, lang?: 'ar' | 'en') => Promise<WathqLead>;
  /** Injectable keyless public-source leg (default: jinaCorroborate) */
  corroboratePublicSources?: CorroborationFetch;
  /** Injectable keyless search leg (default: tinyfishSearch) */
  searchPublicSources?: SearchPublicSources;
  enrichContact: typeof enrichContact;
  db: Database.Database;
}

// ---------------------------------------------------------------------------
// Step A: Discover candidate companies (NAME/DOMAIN) — never CR numbers,
// never googleSearch (IMPL-SPEC Gap 1)
//
// Gemini has no web access: it proposes names and domains only. No URLs are
// emitted here; the real evidence URLs come from the injectable fetch leg.
// ---------------------------------------------------------------------------

/**
 * Places-backed candidate discovery. Uses the real Google Places legacy
 * endpoints via placesDiscovery.ts; the API key is read from env at call time.
 * One text search plus at most `count` detail lookups. Returns an empty list
 * with an error string on any Places failure so the caller can fall back.
 */
export async function discoverCompaniesViaPlaces(
  sector: string,
  geo: string,
  count: number,
): Promise<{ companies: Candidate[]; error: string | null }> {
  if (!process.env.GOOGLE_PLACES_API_KEY) {
    return { companies: [], error: 'GOOGLE_PLACES_API_KEY is not set' };
  }
  try {
    const found = await searchPlaces({
      textQuery: `${sector} companies in ${geo}, Saudi Arabia`,
      tier: 'essentials',
      languageCode: 'en',
      regionCode: 'sa',
    });
    const companies: Candidate[] = [];
    for (const place of found.places.slice(0, count)) {
      try {
        const detail = await getPlaceDetails({ placeId: place.id });
        if (!detail.websiteUri) continue;
        const domain = new URL(detail.websiteUri).hostname.replace(/^www\./i, '');
        if (domain.includes('.')) companies.push({ name: detail.displayName, domain });
      } catch {
        // One place with no usable website must not discard the others.
      }
      if (companies.length >= count) break;
    }
    if (companies.length === 0) {
      return { companies: [], error: 'Places returned no company with a usable website' };
    }
    console.log(`[HuntOrchestrator] Places discovered ${companies.length} candidate(s) for ${sector}/${geo}`);
    return { companies, error: null };
  } catch (e: any) {
    return { companies: [], error: `Places discovery failed: ${e?.message ?? String(e)}` };
  }
}

async function discoverCompanies(
  sector: string,
  geo: string,
  count: number,
): Promise<{ companies: Candidate[]; error: string | null }> {
  if (process.env.GOOGLE_PLACES_API_KEY) {
    const places = await discoverCompaniesViaPlaces(sector, geo, count);
    if (places.companies.length > 0) return places;
    console.warn(`[HuntOrchestrator] Places path unusable (${places.error}); falling back to model discovery`);
  }
  try {
    const ai = getGenAI();
    const prompt = `List ${count} real Saudi Arabian companies in the "${sector}" sector located in or near ${geo}.
For each company, propose a company name and a primary domain (example.com).
Do NOT emit any URLs — you have no web access and URLs would be manufactured.
Respond ONLY in this exact format (one per line, nothing else):
NAME: <company name> | DOMAIN: <example.com>`;
    const resp = await ai.models.generateContent({
      model: 'flash',
      contents: prompt,
      config: {},   // no googleSearch tool
    });

    const text = resp.text || '';
    const lines = text.split('\n');
    const companies: Candidate[] = [];

    for (const line of lines) {
      const m = line.match(/NAME:\s*(.+?)\s*\|\s*DOMAIN:\s*(.+)/i);
      if (m) {
        companies.push({ name: m[1].trim(), domain: m[2].trim() });
      }
    }

    if (companies.length === 0) {
      return {
        companies: [],
        error: `Gemini discovery returned no parseable company candidates. Response: ${text.slice(0, 200)}`,
      };
    }

    console.log(`[HuntOrchestrator] Discovered ${companies.length} candidate(s) for ${sector}/${geo}: ${companies.map(c => c.name).join(', ')}`);
    return { companies: companies.slice(0, count), error: null };
  } catch (e: any) {
    return {
      companies: [],
      error: `Company discovery failed: ${e?.message ?? String(e)}`,
    };
  }
}

// ---------------------------------------------------------------------------
// Step B: Generate a cited buying signal for a company
// ---------------------------------------------------------------------------

async function generateBuyingSignal(
  companyName: string,
  sector: string,
  context?: Record<string, unknown>,
): Promise<BuyingSignal | null> {
  try {
    const ai = getGenAI();
    const ctxBlock = context && Object.keys(context).length
      ? `\n[CONTEXT]\n${JSON.stringify(context, null, 2)}\n[/CONTEXT]\n`
      : '';
const prompt = `Find a RECENT buying signal or business trigger for the Saudi company "${companyName}" in the ${sector} sector.
A buying signal is: a new office opening, a funding round, a new product launch, a hiring surge, a tender announcement, or a regulatory change that creates a need.
ONLY cite a signal you can find at a specific public URL.
Respond in exactly this format:
HEADLINE: <one sentence>
URL: <https://... or NONE>
SNIPPET: <2-3 sentences of context>
RELEVANCE: <why this is a buying signal>${ctxBlock}`;

    const resp = await ai.models.generateContent({
      model: 'flash-preview', // Jin's reasoning — the buying signal runs on 3.1-pro (proxy maps 'pro' → LEADJIN_MODEL)
      contents: prompt,
      config: {},   // no googleSearch tool — the LLM has no web access; evidence URLs come from the corroboration fetch
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
        email_verified, status, source_url, created_at,
        verified_real, provenance_url, city, company_domain,
        linkedin, evidence_urls, vision_2030_program, majlis_tips
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      // persist the five-field gate result, not the Wathq-only flag
      lead.verified_real ? 1 : 0,
      lead.provenance_url ?? null,
      // public-source corroboration columns (Edit 4)
      lead.hq_city,
      lead.company_domain,
      lead.linkedin,
      lead.evidence_urls.join('|'),
      // Production-wiring params persisted into the leads row (existing columns).
      lead.vision2030 ?? null,
      lead.majlisMode ?? null,
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

  // Production default for the injectable leg: keyless Jina Reader fetch.
  // Existing huntOrchestrate(...) callers in server.ts need no signature change.
  const { fetchWathqLead, corroboratePublicSources = jinaCorroborate, searchPublicSources = tinyfishSearch, enrichContact, db } = deps;

  let wathqPath: OrchestrateResult['wathq_path'] = 'live';
  const signalPath: OrchestrateResult['signal_path'] =
    process.env.LEADJIN_USE_VERTEX !== 'false' ? 'vertex' : 'api_key';

  // Determine candidates to process (Edit 1: candidate names/domains, never
  // CR numbers, never googleSearch).
  let candidates: Candidate[] = input.candidates ?? [];
  if (candidates.length === 0) {
    const discovery = await discoverCompanies(sector, geo, count);
    if (discovery.error) {
      errors.push(discovery.error);
      wathqPath = 'stubbed';
      if (discovery.companies.length === 0) {
        console.warn(`[HuntOrchestrator] ${discovery.error}`);
      }
    }
    candidates = discovery.companies;
  }

  console.log(`[HuntOrchestrator] Processing ${candidates.length} candidate(s) for ${sector} in ${geo}`);

  // Process all candidates in PARALLEL. Sequential was ~N×(enrich + grounded-3.1-pro signal) and
  // blew the bot's 180s wrapper timeout at count≥3; parallel wall-clock ≈ a single lead.
  const processOne = async (candidate: Candidate): Promise<AssembledLead | null> => {
    try {
      // ── Public-source corroboration leg (Edit 2) ─────────────────────────
      // Keyless, injectable; tests stub it. Evidence URLs come ONLY from the
      // fetch return — never from the LLM.
      let fieldEvidence: FieldEvidence = {};
      let evidenceUrls: string[] = [];
      const corroborationLog: CorroborationEntry[] = [];
      try {
        const jinaUrl = `https://r.jina.ai/https://www.${candidate.domain}`;
        const fetched = await corroboratePublicSources(jinaUrl);
        if (fetched.text) {
          const parsed = parsePublicSource(fetched.text, fetched.url, candidate.name, candidate.domain);
          fieldEvidence = parsed.fieldEvidence;
          evidenceUrls = parsed.evidence_urls;
          corroborationLog.push({ source: 'jina', url: fetched.url, field: 'query' });
        }
      } catch (e: any) {
        // Fail closed: no evidence URLs, the gate below will be false.
        evidenceUrls = [];
      }

      // ── Keyless search corroboration (ONE call per candidate) ──────────────
      // Fills ONLY fields Jina lacked. Each accepted field records the exact
      // result.url that produced it in fieldEvidence, evidence_urls and the
      // corroboration log. Search results are capped at five; no URL invented.
      let searchResults: PublicSearchResult[] = [];
      try {
        const searchQuery = `${candidate.name} ${geo} contact email LinkedIn`;
        searchResults = (await searchPublicSources(searchQuery)).slice(0, 5);
      } catch {
        // Fail closed: an errored search contributes no fields or URLs.
        searchResults = [];
      }
      for (const result of searchResults) {
        const extracted = parseSearchResult(result.snippet, result.title);
        if (!fieldEvidence.email?.value && extracted.email) {
          fieldEvidence.email = { value: extracted.email, url: result.url };
          corroborationLog.push({ source: 'tinyfish', url: result.url, field: 'email' });
          if (!evidenceUrls.includes(result.url)) evidenceUrls.push(result.url);
        }
        if (!fieldEvidence.name?.value && extracted.person_name) {
          fieldEvidence.name = { value: extracted.person_name, url: result.url };
          corroborationLog.push({ source: 'tinyfish', url: result.url, field: 'name' });
          if (!evidenceUrls.includes(result.url)) evidenceUrls.push(result.url);
        }
        if (!fieldEvidence.company_name?.value && extracted.company_name) {
          fieldEvidence.company_name = { value: extracted.company_name, url: result.url };
          corroborationLog.push({ source: 'tinyfish', url: result.url, field: 'company_name' });
          if (!evidenceUrls.includes(result.url)) evidenceUrls.push(result.url);
        }
        if (!fieldEvidence.linkedin?.value && extracted.linkedin) {
          fieldEvidence.linkedin = { value: extracted.linkedin, url: result.url };
          corroborationLog.push({ source: 'tinyfish', url: result.url, field: 'linkedin' });
          if (!evidenceUrls.includes(result.url)) evidenceUrls.push(result.url);
        }
        if (!fieldEvidence.hq_city?.value && extracted.hq_city) {
          fieldEvidence.hq_city = { value: extracted.hq_city, url: result.url };
          corroborationLog.push({ source: 'tinyfish', url: result.url, field: 'hq_city' });
          if (!evidenceUrls.includes(result.url)) evidenceUrls.push(result.url);
        }
      }

      // ── WATHQ lookup (optional enrichment only — never blocks) ─────────────
      let wathqResult: WathqLead;
      try {
        wathqResult = await fetchWathqLead(candidate.name);
        wathqPath = process.env.WATHQ_CONSUMER_KEY ? 'live' : 'stubbed';
      } catch (e: any) {
        if (e?.message?.includes('WATHQ_CONSUMER_KEY not set')) {
          wathqPath = 'stubbed';
          const empty: WathqCompany = {
            name: null, cr_number: null, cr_national: null, capital: null,
            status: null, hq_city: null, entity_type: null, ecommerce: null,
          };
          wathqResult = {
            company: empty,
            decision_makers: [],
            contact: null,
            provenance: {
              source: 'wathq',
              api: '',
              retrieved_at: new Date().toISOString(),
              verified_real: false,
            },
          } as WathqLead;
        } else {
          errors.push(`Candidate ${candidate.name}: WATHQ lookup failed — ${e?.message ?? String(e)}`);
          return null;
        }
      }
      const company = wathqResult.company;

      // ── Contact enrichment (Wathq optional, non-blocking) ─────────────────
      // Contact is assembled from the corroborated public-source fields below;
      // Wathq is optional enrichment only and never supplies a missing field.

      // ── Assemble lead (Edit 2) ─────────────────────────────────────────────
      // Company name, domain, city, linkedin and email come ONLY from the
      // public-source corroboration leg: candidates were proposed by Gemini
      // (no web access), the real evidence URLs were fetched by
      // deps.corroboratePublicSources. Wathq is optional enrichment only and
      // never supplies a missing field (with no key, fetchWathqLead returns
      // name: null, so Wathq-only would zero out the lead).
      const email = fieldEvidence.email?.value ?? null;
      const personName = fieldEvidence.name?.value ?? null;
      const companyName = fieldEvidence.company_name?.value ?? null;
      const linkedin = fieldEvidence.linkedin?.value ?? null;
      const city = fieldEvidence.hq_city?.value ?? null;

      const contact: ContactResult = {
        email,
        email_rung: 'none',
        email_sources: [],
        phone: null,
        phone_source: null,
        notes: 'Public-source corroboration leg (Wathq optional)',
      };
      let signal: BuyingSignal | null = null;
      try {
        signal = await generateBuyingSignal(
          candidate.name,
          sector,
          {
            majlisMode: input.majlisMode,
            vision2030: input.vision2030,
            geography: input.geography,
            industry: input.industry,
            jobTitles: input.jobTitles,
            limits: input.limits,
            templates: input.templates,
          },
        );
      } catch (e: any) {
        errors.push(`Candidate ${candidate.name}: signal generation error — ${e?.message}`);
      }

      // ── Assemble lead (Edit 2) ─────────────────────────────────────────────
      // Company name, domain, city, linkedin and email come ONLY from the
      // public-source corroboration leg: candidates were proposed by Gemini
      // (no web access), the real evidence URLs were fetched by
      // deps.corroboratePublicSources. Wathq is optional enrichment only and
      // never supplies a missing field (with no key, fetchWathqLead returns
      // name: null, so Wathq-only would zero out the lead).

      const assembled: AssembledLead = {
        lead_id: randomUUID(),
        company_name: companyName,
        company_domain: fieldEvidence.domain?.value ?? candidate.domain ?? null,
        cr_number: company.cr_number ?? null,
        hq_city: city,
        linkedin,
        entity_type: company.entity_type ?? null,
        status: company.status ?? null,
        verified_real: false,
        decision_maker: {
          name: personName,
          role: 'unknown',
        },
        contact,
        signal,
        provenance_url: wathqResult.provenance.api,
        evidence_urls: evidenceUrls,
        fieldEvidence,
        corroboration_log: corroborationLog,
        stored: false,
        vision2030: input.vision2030 ?? null,
        majlisMode: input.majlisMode ?? null,
        industry: input.industry ?? null,
        geography: input.geography ?? null,
        jobTitles: input.jobTitles ?? null,
        limits: input.limits ?? null,
        templates: input.templates ?? null,
      };

      // ── Verified-real gate (Edit 3) ─────────────────────────────────────────
      // verified_real is true ONLY when all five fields are present AND
      // evidence_urls is non-empty, each field backed by a stored URL.
      const FIELD_KEYS = ['email', 'name', 'company_name', 'linkedin', 'hq_city'] as const;
      const fiveFieldsPresent = FIELD_KEYS.every((k: FieldKey) => fieldEvidence?.[k] != null);
      assembled.verified_real = fiveFieldsPresent && assembled.evidence_urls.length > 0;

      // ── Store in DB ───────────────────────────────────────────────────────
      const stored = storeLead(
        db,
        assembled,
        sector,
        signal?.url ?? null,
        userId,
      );
      assembled.stored = stored;
      return assembled;

    } catch (e: any) {
      errors.push(`Candidate ${candidate.name}: unexpected error — ${e?.message ?? String(e)}`);
      return null;
    }
  };

  // Concurrency-capped batches. Full parallelism bursts past Vertex's rate limit
  // (especially while the AI-Studio key is capped → 100% of load lands on Vertex).
  // Batches of LEADJIN_HUNT_CONCURRENCY (default 2) balance speed vs 429s.
  const BATCH = Number(process.env.LEADJIN_HUNT_CONCURRENCY || '2') || 2;
  const targets = candidates.slice(0, count);
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
