/**
 * LeadDiscoveryPipeline — the ONE shared lead-discovery pipeline for LeadJin.
 *
 * Used by:
 *   - Lead Search in the UI  (server.ts /api/leads/harvest -> generateLeadjinLeads
 *     in leadService.js delegates to runLeadDiscovery)
 *   - the Jin lane (see docs/LEAD-DISCOVERY.md for the Jin entry point)
 *
 * Ordered waterfall; every stage is skipped cleanly when its credential is
 * absent, and the model-driven stage is mandatory and always runs last:
 *
 *   a. pre-crawl cache                    -> getCachedLeadsForHarvest (server.ts)
 *   b. Places discovery                  -> discoverCompaniesViaPlaces (only when GOOGLE_PLACES_API_KEY)
 *   c. Wathq enrichment                  -> fetchWathqLead (only when WATHQ_CONSUMER_KEY + known CRs)
 *   d. model-driven discovery            -> geminiService.generateLeadjinLeads (mandatory; local ollama gemma4:e4b is the always-available path)
 *   e. assemble                          -> normalise every stage to one lead shape, dedupe,
 *                                            verify, and tag source_engine / provenance_url /
 *                                            verified_real / confidence / discovered_at
 */
import Database from "better-sqlite3";
import { resolveMx } from "dns/promises";
import { getCachedLeadsForHarvest } from "../../server.js";
import { discoverCompaniesViaPlaces } from "./huntOrchestrator.js";
import { fetchWathqLead } from "./wathqService.js";
import { generateLeadjinLeads } from "./geminiService.js";
import { engineAvailability, runLegacyEngine, type LegacyEngine } from "./legacyEngines.js";
import { harvestContactsForCompany, type HarvestedContact } from "./contactHarvest.js";

/** Stage codes (also the source_engine tag). */
export const STAGE_CACHE = "cache";
export const STAGE_PLACES = "places";
export const STAGE_WATHQ = "wathq";
export const STAGE_MODEL = "model";
export const STAGE_JOBSPY = "jobspy";
export const STAGE_KIMI = "kimi";
export const STAGE_CONTACT_HARVEST = "contact-harvest";

export interface LeadDiscoveryInput {
  /** Industry to harvest (e.g. "real estate"). */
  targetIndustry?: string;
  userServices?: string;
  userCaseStudy?: string;
  userCompetitors?: string;
  /** geography: string[] (e.g. ["Riyadh"]) or a single city string. */
  geography?: string[] | string;
  job_titles?: string[] | string;
  company_size?: string;
  limit?: number;
  userApiKey?: string;
  majlisMode?: boolean;
  vision2030?: boolean;
  /** Places discovery: sector keyword (defaults to targetIndustry). */
  sector?: string;
  /** Places discovery: city (defaults to first geography term). */
  geo?: string;
  /** Wathq: known commercial-registration numbers to enrich with. */
  crs?: string[];
  /** Ignored provider hint — the local writer (gemma4:e4b via ollama) is always used. */
  engine?: string;
}

export interface NormalizedLead {
  source_engine: string;
  lead_id: string;
  twitter: string;
  email_source: string;
  company: string;
  website: string;
  name: string;
  title: string;
  email: string;
  phone: string;
  linkedin: string;
  industry: string;
  lead_score: number;
  confidence: "high" | "medium" | "low";
  verified_real: 0 | 1;
  provenance_url: string | null;
  discovered_at: string;
  raw: unknown;
}

export interface LeadDiscoveryResult {
  engines_used: string[];
  errors: string[];
  leads: NormalizedLead[];
}

async function runLeadDiscoveryInner(
  input: LeadDiscoveryInput,
  injectedDb?: Database,
): Promise<LeadDiscoveryResult> {
  const db = injectedDb || openDb();
  const errors: string[] = [];
  const rows: NormalizedLead[] = [];
  const engines_used: string[] = [];

  const mapped = mapInput(input);

  // --------------------------------------------------------------------------
  // a. Pre-crawl cache — first tier of the harvest.
  // --------------------------------------------------------------------------
  try {
    const cacheRows = getCachedLeadsForHarvest(db, mapped.cacheParams);
    rows.push(...normaliseCacheRows(cacheRows, mapped.params.targetIndustry));
    engines_used.push(STAGE_CACHE);
  } catch (e: any) {
    errors.push(`cache: pre-crawl cache query failed: ${e?.message ?? String(e)}`);
  }

  // --------------------------------------------------------------------------
  // b. Places discovery (key-gated).
  // --------------------------------------------------------------------------
  if (process.env.GOOGLE_PLACES_API_KEY) {
    try {
      const count = mapped.params.limit;
      const sector = mapped.params.sector || mapped.params.targetIndustry || "";
      const geo =
        mapped.params.geo ||
        (Array.isArray(input.geography) ? input.geography[0] : input.geography) ||
        "Riyadh";
      const discovered = await discoverCompaniesViaPlaces(sector, geo, count);
      if (discovered.companies.length > 0) {
        rows.push(...normalisePlacesRows(discovered.companies));
        engines_used.push(STAGE_PLACES);
      } else {
        errors.push(`places: no companies discovered (${discovered.error ?? "unknown reason"})`);
      }
    } catch (e: any) {
      errors.push(`places: discovery failed: ${e?.message ?? String(e)}`);
    }
  } else {
    errors.push("places: skipped (GOOGLE_PLACES_API_KEY not set)");
  }

  // --------------------------------------------------------------------------
  // c. Wathq enrichment (key-gated, and only when CRs are known).
  // --------------------------------------------------------------------------
  if (mapped.params.crs.length > 0 && process.env.WATHQ_CONSUMER_KEY) {
    try {
      for (const cr of mapped.params.crs) {
        const w = await fetchWathqLead(cr);
        rows.push(normaliseWathqRow(w, mapped.params.targetIndustry));
      }
      engines_used.push(STAGE_WATHQ);
    } catch (e: any) {
      errors.push(`wathq: lookup failed for CR ${mapped.params.crs.join(", ")}: ${e?.message ?? String(e)}`);
    }
  } else if (mapped.params.crs.length === 0) {
    errors.push("wathq: skipped (no CRs supplied — the Wathq enrichment leg needs known CRs)");
  } else {
    errors.push("wathq: skipped (WATHQ_CONSUMER_KEY not set)");
  }

  // --------------------------------------------------------------------------
  // d. Legacy engine adapters (optional; degrade cleanly)
  // --------------------------------------------------------------------------
  // The ORIG discovery engines (jobspy / kimi / crawl4ai) were never committed
  // or migrated. They are preserved verbatim (sha256 in
  // preserved-orig-only/README.md) and re-connected here as optional adapters:
  // each probes its REAL backend (python package / CLI binary / HTTP service),
  // runs the real backend when the probe passes, and normalises rows to the
  // pipeline lead shape. A probe failure is available:false with the measured
  // reason — never assumed. A run-time backend error is recorded in `errors`,
  // never thrown, so the harvest keeps degrading cleanly. The waterfall order
  // stays cache → Places → Wathq → legacy engines → model discovery.
  // --------------------------------------------------------------------------
  try {
    const probes = await engineAvailability();
    for (const probe of probes) {
      if (!probe.available) continue;
      const res = await runLegacyEngine(probe.engine, mapped.params.targetIndustry || "web designer", mapped.params.limit);
      if (Array.isArray(res.leads)) {
        rows.push(...res.leads);
        engines_used.push(probe.engine);
      }
      if (res.error) errors.push(`legacy ${probe.engine}: ${res.error}`);
    }
  } catch (e: any) {
    errors.push(`legacy engines: ${e?.message ?? String(e)}`);
  }

  // --------------------------------------------------------------------------
  // e. Model-driven discovery — the mandatory last stage. Always runs, even
  //    when (a), (b), (c) and (d) are absent. The local Ollama writer
  //    (gemma4:e4b) is the always-available path (LEADJIN_PROVIDER=ollama).
  // --------------------------------------------------------------------------
  try {
    const rawLeads = await generateLeadjinLeads(mapped.modelInput);
    if (!Array.isArray(rawLeads)) {
      errors.push(`model: generateLeadjinLeads returned a non-array (${typeof rawLeads})`);
    } else {
      const normalised = normaliseModelRows(rawLeads, input);
      rows.push(...normalised);
      if (normalised.length === 0) {
        errors.push(
          `model: ${rawLeads.length} raw row(s) produced no usable lead (a lead needs at least a company name and a website)`,
        );
      } else {
        engines_used.push(STAGE_MODEL);
      }
    }
  } catch (e: any) {
    errors.push(`model: generated no leads (${e?.message ?? String(e)})`);
  }

  // --------------------------------------------------------------------------
  // e. Assemble: dedupe, then verify the model leg with the only free
  //    independent verifier available offline (live DNS/MX of each website).
  // --------------------------------------------------------------------------
  const assembled = dedupeRows(rows);
  await verifyModelRows(assembled);

  // Keep verified model rows plus every cache/places/wathq row — an unverified
  // model row is reported as an error, not shipped as a lead.
  const leadRows = assembled.filter((l) =>
    l.source_engine === STAGE_MODEL ? l.verified_real === 1 : true,
  );

  // --------------------------------------------------------------------------
  // f. Contact harvest — per-company people/emails/phones/WhatsApp/public
  //    LinkedIn harvest, appended as extra lead rows. Must never fail the run.
  // --------------------------------------------------------------------------
  const contactLimit = Math.max(Number(process.env.CONTACT_HARVEST_LIMIT || "3"), 0);
  const seenDomains = new Set<string>();
  const contactCompanies: Array<{ company: string; domain: string; industry: string; city: string }> = [];
  for (const row of leadRows) {
    if (row.source_engine === STAGE_MODEL) continue; // model stage already ships its own people
    const domain = row.website
      ? row.website.replace(/^https?:\/\//, "").replace(/\/+$/, "").toLowerCase()
      : "";
    if (!domain) continue;
    if (seenDomains.has(domain)) continue;
    seenDomains.add(domain);
    contactCompanies.push({
      company: row.company || row.name || domain,
      domain,
      industry: row.industry || "",
      city: mapped.params.geography?.[0] || "",
    });
    if (contactCompanies.length >= contactLimit) break;
  }

  function normalizeName(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, "");
  }

  function existingLeadKey(row: NormalizedLead, domain: string): string {
    const email = (row.email || "").toLowerCase().trim();
    const linkedin = (row.linkedin || "").toLowerCase().trim();
    const name = normalizeName(row.name);
    const d =
      (row.website || "").replace(/^https?:\/\//, "").replace(/\/+$/, "").toLowerCase() || domain.toLowerCase();
    if (email) return `email:${email}`;
    if (linkedin) return `linkedin:${linkedin}`;
    return `name:${name}|domain:${d}`;
  }

  const harvestedKeys = new Set<string>();
  for (const ci of contactCompanies) {
    let contactIndex = 0;
    let result: { contacts: HarvestedContact[]; errors: string[] };
    try {
      result = await harvestContactsForCompany({ company: ci.company, domain: ci.domain, city: ci.city });
    } catch (e: any) {
      errors.push(`contact harvest: ${ci.company}: ${e?.message ?? String(e)}`);
      continue;
    }
    errors.push(...result.errors);
    for (const contact of result.contacts) {
      // Recompute the key per contact.
      const cEmail = (contact.email || "").toLowerCase().trim();
      const cLinkedin = (contact.linkedin || "").toLowerCase().trim();
      const cName = normalizeName(contact.name);
      const cDomain = ci.domain.toLowerCase();
      let contactKey: string;
      if (cEmail) contactKey = `email:${cEmail}`;
      else if (cLinkedin) contactKey = `linkedin:${cLinkedin}`;
      else contactKey = `name:${cName}|domain:${cDomain}`;

      if (harvestedKeys.has(contactKey)) continue;
      harvestedKeys.add(contactKey);

      // Deduplicate against every other lead already in the run.
      let duplicate = false;
      for (const existing of leadRows) {
        if (existingLeadKey(existing, ci.domain) === contactKey) { duplicate = true; break; }
      }
      if (duplicate) continue;

      leadRows.push({
        source_engine: STAGE_CONTACT_HARVEST,
        lead_id: `person-${ci.domain}-${contactIndex++}`,
        twitter: "",
        email_source: contact.source,
        company: ci.company,
        website: `https://${ci.domain}`,
        name: contact.name,
        title: contact.title,
        email: contact.email,
        phone: contact.phone,
        linkedin: contact.linkedin,
        industry: ci.industry || input.targetIndustry || "",
        lead_score: 0,
        confidence: contact.email_verified ? "high" : (contact.name && (contact.email || contact.linkedin) ? "medium" : "low"),
        verified_real: contact.email_verified ? 1 : 0,
        provenance_url: contact.evidence_url,
        discovered_at: contact.discovered_at,
        raw: contact,
      });
    }
  }

  // Failure honesty: when the contact harvest produced candidates but none
  // survived deduplication, say so instead of returning a silent zero.
  const harvestedRows = leadRows.filter((l) => l.source_engine === STAGE_CONTACT_HARVEST);
  if (contactCompanies.length > 0 && harvestedRows.length === 0) {
    errors.push(`contact harvest: 0 people extracted across ${contactCompanies.length} company(ies)`);
  }

  // Failure honesty: when the model produced candidates but none survived
  // verification, say so with the count instead of returning a silent zero.
  const modelCandidates = assembled.filter((l) => l.source_engine === STAGE_MODEL).length;
  const modelKept = leadRows.filter((l) => l.source_engine === STAGE_MODEL).length;
  if (modelCandidates > 0 && modelKept === 0) {
    errors.push(
      `model: produced ${modelCandidates} candidate row(s); 0 passed domain verification (DNS/MX on the website), so none were shipped`,
    );
  }

  return {
    engines_used: uniqueEngines(leadRows),
    errors,
    leads: leadRows,
  };
}

/**
 * Public entry point. Discovery is best-effort by design: any failure inside a
 * stage is reported in `errors`, never thrown, so every caller (the harvest
 * route, the Jin tool router, a scheduled run) can answer with
 * `engines_used` + `errors` and an honest result instead of a 500.
 */
export async function runLeadDiscovery(
  input: LeadDiscoveryInput,
  injectedDb?: Database,
): Promise<LeadDiscoveryResult> {
  try {
    return await runLeadDiscoveryInner(input, injectedDb);
  } catch (e: any) {
    const message = e?.message ?? String(e);
    console.error('[LeadDiscoveryPipeline] failed:', message);
    return {
      engines_used: [],
      errors: [`pipeline: ${message}`],
      leads: [],
    };
  }
}

// ---------------------------------------------------------------------------
// Input mapping
// ---------------------------------------------------------------------------

interface MappedInput {
  params: {
    /** Fields shared by the cache / places / wathq legs. */
    targetIndustry: string;
    userServices: string;
    userCaseStudy: string;
    userCompetitors: string;
    geography: string[];
    job_titles: string[];
    company_size: string;
    limit: number;
    userApiKey: string | undefined;
    majlisMode: boolean;
    vision2030: boolean;
    sector: string;
    geo: string;
    crs: string[];
    engine: string;
  };
  /** Fields for the model-driven stage (geminiService.generateLeadjinLeads). */
  modelInput: {
    userIndustry: string;
    userServices: string;
    userCaseStudy: string;
    userCompetitors: string;
    targetIndustry: string;
    targetServices: string[];
    company_size: string;
    geography: string[];
    job_titles: string[];
    limit: number;
    model: "flash-lite" | "pro-preview" | "flash";
    userApiKey: string | undefined;
    majlisMode: boolean;
    vision2030: boolean;
    emailTemplate?: { subject: string; body: string };
  };
  cacheParams: {
    targetIndustry: string;
    limit: number;
    targetCity?: string;
    geography?: string[] | string;
  };
}

function asStringArray(v: unknown): string[] {
  if (typeof v === "string") return v.split(",").map((s) => s.trim()).filter(Boolean);
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string");
  return [];
}

function mapInput(input: LeadDiscoveryInput): MappedInput {
  const geography = input.geography;
  const geographyArray = Array.isArray(geography)
    ? geography.map((g) => String(g).trim()).filter(Boolean)
    : [String(geography ?? "").trim()];
  const jobTitles = asStringArray(input.job_titles);

  return {
    params: {
      targetIndustry: (input.targetIndustry || "").trim() || "Technology",
      userServices: input.userServices || "",
      userCaseStudy: input.userCaseStudy || "",
      userCompetitors: input.userCompetitors || "",
      geography: geographyArray,
      job_titles: jobTitles.length > 0 ? jobTitles : ["CEO", "CTO", "Director"],
      company_size: (input.company_size || "10-200").trim(),
      limit: Math.max(Number(input.limit) || 10, 1),
      userApiKey: input.userApiKey,
      majlisMode: Boolean(input.majlisMode),
      vision2030: Boolean(input.vision2030),
      sector: (input.sector || "").trim(),
      geo: (input.geo || "").trim(),
      crs: input.crs && Array.isArray(input.crs) ? input.crs.filter((c) => typeof c === "string") : [],
      engine: input.engine || "ollama",
    },
    modelInput: {
      userIndustry: input.targetIndustry || "Technology",
      userServices: input.userServices || "",
      userCaseStudy: input.userCaseStudy || "",
      userCompetitors: input.userCompetitors || "",
      targetIndustry: input.targetIndustry || "Technology",
      targetServices: input.userServices ? [input.userServices] : [],
      company_size: input.company_size || "10-200",
      geography: geographyArray,
      job_titles: jobTitles,
      limit: Math.max(Number(input.limit) || 10, 1),
      model: "flash",
      userApiKey: input.userApiKey,
      majlisMode: Boolean(input.majlisMode),
      vision2030: Boolean(input.vision2030),
      emailTemplate: undefined,
    },
    cacheParams: {
      targetIndustry: input.targetIndustry || "Technology",
      limit: Math.max(Number(input.limit) || 10, 1),
      targetCity: input.geo?.trim() || (Array.isArray(input.geography) ? input.geography[0] : undefined),
      geography: input.geography,
    },
  };
}

// ---------------------------------------------------------------------------
// Normalisers
// ---------------------------------------------------------------------------

function num(v: unknown): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : 0;
}

function bool(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") return v.trim() !== "";
  if (typeof v === "number") return v !== 0;
  return Boolean(v);
}

function normaliseCacheRows(raw: unknown[], industry: string): NormalizedLead[] {
  const out: NormalizedLead[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const row = r as Record<string, unknown>;
    const domain = typeof row.domain === "string" ? row.domain : "";
    const website = domain ? `https://${domain}` : "";
    const email = typeof row.email === "string" ? row.email : "";
    const emailVerified = bool(row.email_verified);
    out.push({
      source_engine: STAGE_CACHE,
      lead_id: typeof row.lead_id === "string" ? row.lead_id : "",
      twitter: typeof row.twitter === "string" ? row.twitter : (typeof row.company_x === "string" ? row.company_x : ""),
      email_source: typeof row.email_source === "string" ? row.email_source : (typeof row.company_x === "string" ? "precrawl" : ""),
      company: typeof row.c_company === "string" ? row.c_company : typeof row.company_name === "string" ? row.company_name : typeof row.company === "string" ? row.company : "",
      website: website || (typeof row.website === "string" ? row.website : ""),
      name: typeof row.name === "string" ? row.name : "",
      title: typeof row.title === "string" ? row.title : "",
      email,
      phone: typeof row.c_phone === "string" ? row.c_phone : typeof row.phone === "string" ? row.phone : "",
      linkedin: typeof row.linkedin_url === "string" ? row.linkedin_url : "",
      industry: typeof row.c_industry === "string" ? row.c_industry : typeof row.industry === "string" ? row.industry : industry,
      lead_score: num(row.lead_score),
      confidence: emailVerified ? "high" : email ? "medium" : "low",
      verified_real: emailVerified ? 1 : 0,
      provenance_url: null,
      discovered_at: new Date().toISOString(),
      raw,
    });
  }
  return out;
}

function normalisePlacesRows(raw: unknown[]): NormalizedLead[] {
  const out: NormalizedLead[] = [];
  for (const c of raw) {
    if (!c || typeof c !== "object") continue;
    const row = c as Record<string, unknown>;
    const domain = typeof row.domain === "string" ? row.domain : "";
    out.push({
      source_engine: STAGE_PLACES,
      lead_id: `places-${row.domain || row.name}`,
      twitter: "",
      email_source: "places",
      company: typeof row.name === "string" ? row.name : "",
      website: domain ? `https://${domain}` : "",
      name: typeof row.name === "string" ? row.name : "",
      title: "",
      email: "",
      phone: "",
      linkedin: "",
      industry: "",
      lead_score: 0,
      confidence: "low",
      verified_real: 0,
      provenance_url: null,
      discovered_at: new Date().toISOString(),
      raw,
    });
  }
  return out;
}

function normaliseWathqRow(raw: unknown, industry: string): NormalizedLead {
  const row = raw as Record<string, unknown>;
  const company =
    (row.company && typeof row.company === "object" ? (row.company as Record<string, unknown>).name : "") as string;
  const contact =
    row.contact && typeof row.contact === "object"
      ? (row.contact as Record<string, unknown>)
      : {};
  const decisionMakers = Array.isArray(row.decision_makers)
    ? (row.decision_makers as Array<Record<string, unknown>>)
    : [];
  const firstDecisionMaker = decisionMakers.find(
    (m) => m && typeof m === "object" && typeof (m as Record<string, unknown>).name === "string",
  );

  return {
    source_engine: STAGE_WATHQ,
    lead_id: `wathq-${company.replace(/\s+/g, "-").toLowerCase() || "unkn"}`,
    twitter: typeof contact.twitter === "string" ? contact.twitter : "",
    email_source: "wathq",
    company,
    website: "",
    name: typeof firstDecisionMaker?.name === "string" ? firstDecisionMaker.name : company,
    title: typeof firstDecisionMaker?.role === "string" ? firstDecisionMaker.role : "",
    email: typeof contact.email === "string" ? contact.email : "",
    phone: typeof contact.phone === "string" ? contact.phone : "",
    linkedin: "",
    industry: typeof row.industry === "string" ? row.industry : industry,
    lead_score: 0,
    confidence: "low",
    verified_real: 0,
    provenance_url:
      row.provenance && typeof row.provenance === "object"
        ? (row.provenance as Record<string, unknown>).api as string | undefined
        : null,
    discovered_at: new Date().toISOString(),
    raw,
  };
}

function normaliseModelRows(raw: unknown[], input: LeadDiscoveryInput): NormalizedLead[] {
  const out: NormalizedLead[] = [];
  const leads = Array.isArray(raw) ? raw : [];
  for (const l of leads) {
    if (!l || typeof l !== "object") continue;
    const row = l as Record<string, unknown>;
    const website = typeof row.website === "string" ? row.website : "";
    const confidence =
      typeof row.confidence === "string" && ["high", "medium", "low"].includes(row.confidence)
        ? (row.confidence as "high" | "medium" | "low")
        : "low";
    out.push({
      source_engine: STAGE_MODEL,
      lead_id: typeof row.lead_id === "string" ? row.lead_id : `model-${typeof row.company === "string" ? row.company.replace(/\s+/g, "-").toLowerCase() : "unknown"}`,
      twitter: typeof row.company_x === "string" ? row.company_x : "",
      email_source: typeof row.email_source === "string" ? row.email_source : (typeof row.email === "string" && row.email ? "precrawl" : ""),
      company: typeof row.company === "string" ? row.company : "",
      website,
      name: typeof row.name === "string" ? row.name : "",
      title: typeof row.title === "string" ? row.title : "",
      email: typeof row.email === "string" ? row.email : "",
      phone: typeof row.phone === "string" ? row.phone : "",
      linkedin: typeof row.linkedin === "string" ? row.linkedin : "",
      industry: typeof row.industry === "string" ? row.industry : input.targetIndustry || "",
      lead_score: num(row.lead_score),
      confidence,
      verified_real: 0,
      provenance_url: null,
      discovered_at: new Date().toISOString(),
      raw,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Assemble: dedupe + independent verification of the model leg
// ---------------------------------------------------------------------------

/** Dedupe by domain → email → (name + company). First stage wins. */
function dedupeRows(rows: NormalizedLead[]): NormalizedLead[] {
  const seen = new Set<string>();
  const out: NormalizedLead[] = [];
  for (const row of rows) {
    const domain = row.website ? row.website.replace(/^https?:\/\//, "").replace(/^www\./, "") : "";
    const email = row.email || "";
    const nameCompany = `${row.name || ""}|${row.company || ""}`;
    const key = domain || email || nameCompany;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

/**
 * Independent verifier for the model leg: the local writer has no grounding,
 * so every model-derived row is checked against the live DNS/MX of its
 * website. A resolving MX record is the only free, independent evidence we
 * can collect offline — without a paid API key. Rows with no website, or a
 * non-resolving domain, stay at verified_real = 0.
 */
async function verifyModelRows(rows: NormalizedLead[]): Promise<void> {
  for (const row of rows) {
    if (row.source_engine !== STAGE_MODEL) continue;
    const website = row.website;
    if (!website) {
      row.verified_real = 0;
      continue;
    }
    const domain = website.replace(/^https?:\/\//, "").replace(/^www\./, "");
    try {
      const mx = await resolveMx(domain);
      row.verified_real = mx.length > 0 ? 1 : 0;
    } catch {
      row.verified_real = 0;
    }
  }
}

function uniqueEngines(rows: NormalizedLead[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of rows) {
    if (!seen.has(row.source_engine)) {
      seen.add(row.source_engine);
      out.push(row.source_engine);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// DB helper
// ---------------------------------------------------------------------------

function openDb(): Database {
  const dbPath = process.env.DATABASE_PATH || process.env.DB_PATH || "leadjin.db";
  return new Database(dbPath);
}
