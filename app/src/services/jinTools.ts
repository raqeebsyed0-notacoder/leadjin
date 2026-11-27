/**
 * jinTools.ts — deterministic command router for the embedded LeadJin agent.
 *
 * Jin is the embedded agent of LeadJin: the same product identity, not a
 * separate product and not a second lead-gen module. Today Jin is wired as
 *   - src/services/jinCompleteRoutes.ts  (POST /chat, /extract, /verify/*,
 *     /outreach/*, /status, /worklog, /kpi/*, /stakeholders/*, /analyze/*)
 *   - src/services/jinBrain.ts           (writer, gemma4:e4b over local Ollama)
 *
 * This module adds one entry point, dispatchJinCommand(text, ctx), that
 * deterministically routes plain-language commands to the app's *real*
 * services — no mocks, no parallel implementations.
 *
 *   tool            | service function
 *   --------------- | ----------------------------------------
 *   discover_leads  | runLeadDiscovery (./leadDiscoveryPipeline.js)
 *   verify          | performTripleCheck (./jinHandsVerifier.js)
 *   save_crm        | INSERT OR IGNORE INTO leads ... (the harvest route's insert)
 *   draft_outreach  | craftOutreach (./visionStrategist.js)
 *
 * The optional dataset tool (./companyDataset.js) is deliberately omitted:
 * it does not exist on this host yet (a later lane), so a command about
 * "our data" / "companies" is answered by the model rather than hijacked by
 * a non-existent tool.
 *
 * dispatchJinCommand(text, ctx) returns:
 *   null   -> ordinary conversation; the model answers unchanged.
 *   JinToolResult -> a real tool ran; the chat route reports it via tool_calls.
 */
import { runLeadDiscovery, type LeadDiscoveryInput } from './leadDiscoveryPipeline.js';
import { performTripleCheck } from './jinHandsVerifier.js';
import { craftOutreach, type LeadProfile, type OutreachContext } from './visionStrategist.js';

/** Result shape returned to the chat route when a tool runs. */
export interface JinToolResult {
  tool: string;
  ok: boolean;
  summary: string;
  data?: unknown;
  error?: string;
}

/** Router context: the app DB handle and the authenticated user id. */
export interface JinCtx {
  db: unknown;
  userId?: number | null;
}

// ---------------------------------------------------------------------------
// Command detection (deterministic, keyword-based, ordered)
// ---------------------------------------------------------------------------

const DISCOVER_RE = /find|hunt|discover|search for/i;
const VERIFY_RE = /verify|triple-check/i;
const SAVE_RE = /save|add to|crm|record/i;
const OUTREACH_RE = /outreach|draft|proposal|linkedin|whatsapp|cold email/i;

// ---------------------------------------------------------------------------
// Command parsers -> parameters handed to the real services
// ---------------------------------------------------------------------------

interface DiscoverParams {
  targetIndustry: string;
  limit: number;
  geography: string[];
}

function parseDiscoverCommand(text: string): DiscoverParams {
  let t = text.trim();
  let limit = 10;
  const countMatch = t.match(/^(?:find|hunt|discover)\b[^0-9]*?(\d+)/i);
  if (countMatch) {
    limit = Math.max(1, parseInt(countMatch[1], 10));
    t = t.replace(countMatch[0], '').trim();
  }
  // Geography: a *known* Saudi city at the end, optionally after 'in/for/at/to'.
  const KNOWN_CITIES = new Set([
    'riyadh', 'dammam', 'khobar', 'jeddah', 'medina', 'mecca', 'taif',
    'qassim', 'jizan', 'nabatiyeh', 'buraydah', 'khamis mushait', 'kharj',
    'tabuk', 'qatif', 'al ahsa', 'asir', 'ha il', 'medina', 'mecca',
  ]);
  const geoMatch = t.match(/\s+(?:in|for|at|to)\s+([a-z][a-z0-9\s\-]+)$/i);
  const geography: string[] = [];
  if (geoMatch) {
    const cityPhrase = geoMatch[1].trim().toLowerCase().split(/\s+/).join(' ');
    if (KNOWN_CITIES.has(cityPhrase)) {
      geography.push(cityPhrase);
      t = t.slice(0, geoMatch.index).trim();
    }
  } else {
    geography.push('riyadh');
  }
  // Industry: strip any trailing 'leads'/'results' (they belong to the query,
  // not the sector name), e.g. "find 2 real estate leads in Riyadh" -> "real estate".
  const industry = t.replace(/\s+(?:leads?|results?)\s*$/i, '').trim();
  return {
    targetIndustry: industry || 'Technology',
    limit: Math.max(1, Math.min(limit, 50)),
    geography,
  };
}

interface VerifyParams {
  email: string;
  phone: string;
  domain: string;
}

function parseVerifyCommand(text: string): VerifyParams {
  return {
    email: (text.match(/[\w.%-]+@[\w.-]+\.[\w]{2,}/) || [])[0] || '',
    phone: (text.match(/(\+\d{1,2}\s?)?(\d{3}[\s-]?){2,3}\d{3,4}/) || [])[0] || '',
    domain: (text.match(/[a-z0-9][a-z0-9.-]*\.[a-z]{2,}/i) || [])[0] || '',
  };
}

interface SaveParams {
  name: string;
  title: string;
  company: string;
  industry: string;
  email: string;
  phone: string;
  website: string;
}

function parseSaveCommand(text: string): SaveParams {
  const company = (text.match(/\b(the )?([A-Z][\w&'\- ]+?(?=\s+(?:is|leads?|of|at|\.))\.?)/i) || [])[0] || '';
  return {
    name: '',
    title: '',
    company: company || 'Unknown',
    industry: '',
    email: '',
    phone: '',
    website: '',
  };
}

function parseOutreachCommand(text: string): { lead: LeadProfile; context: OutreachContext } {
  let t = text.trim();
  let company = '';
  const companyMatch = t.match(/\b(the )?([A-Z][\w&'\- ]{2,40}(?=\s+(?:is|leads?|of|at|for|\.))\.?)/i);
  if (companyMatch) {
    company = companyMatch[2];
    t = t.replace(companyMatch[0], '').trim();
  }
  return {
    lead: {
      name: '',
      title: '',
      company,
    },
    context: {
      service: 'email',
      senderCompany: 'LeadJin',
      senderName: 'Jin',
    },
  };
}

// ---------------------------------------------------------------------------
// dispatchJinCommand — the deterministic router
// ---------------------------------------------------------------------------

export async function dispatchJinCommand(
  text: string,
  ctx: JinCtx
): Promise<JinToolResult | null> {
  const trimmed = text.trim();
  if (!trimmed) return null;

  // 1. discover/find/hunt leads -> real pipeline
  if (DISCOVER_RE.test(trimmed)) {
    const params = parseDiscoverCommand(trimmed);
    try {
      const result = await runLeadDiscovery({
        targetIndustry: params.targetIndustry,
        userServices: '',
        userCaseStudy: '',
        userCompetitors: '',
        geography: params.geography,
        job_titles: ['CEO', 'CTO', 'Director'],
        company_size: '10-200',
        limit: params.limit,
        userApiKey: '',
        majlisMode: false,
        vision2030: false,
        sector: params.targetIndustry,
        geo: params.geography[0],
        crs: [],
        engine: 'ollama',
      });
      return {
        tool: 'discover_leads',
        ok: true,
        summary: `Jin found ${result.leads.length} lead(s) (engines: ${result.engines_used.join(', ') || 'none'})$.`,
        data: { leads: result.leads, engines_used: result.engines_used, errors: result.errors },
      };
    } catch (error: any) {
      return {
        tool: 'discover_leads',
        ok: false,
        summary: 'Jin could not run lead discovery.',
        error: error?.message ?? String(error),
      };
    }
  }

  // 2. verify email/lead -> real verifier
  if (VERIFY_RE.test(trimmed)) {
    const params = parseVerifyCommand(trimmed);
    try {
      // stakeholderId optional — performTripleCheck tolerates missing ids.
      const result = await performTripleCheck(
        '', // no stakeholder id supplied in chat context
        params.email || undefined,
        params.phone || undefined,
        params.domain,
        params.domain || 'unknown',
        '',
        ctx.db as any
      );
      const checksPassed = [result.email?.deliverable, result.phone?.reachable, result.location?.regionalMatch]
        .filter(Boolean).length;
      const totalChecks = [params.email, params.phone, params.domain].filter(Boolean).length;
      return {
        tool: 'verify',
        ok: result.overallStatus === 'verified',
        summary: `Jin triple-check: ${result.overallStatus} (score ${result.verificationScore}; ${checksPassed}/${totalChecks} checks passed).`,
        data: { result },
      };
    } catch (error: any) {
      return {
        tool: 'verify',
        ok: false,
        summary: 'Jin could not run verification.',
        error: error?.message ?? String(error),
      };
    }
  }

  // 3. save / add to CRM -> same insert path the harvest route uses
  if (SAVE_RE.test(trimmed)) {
    const params = parseSaveCommand(trimmed);
    try {
      const db = ctx.db as any;
      const insertLead = db.prepare(`INSERT OR IGNORE INTO leads (
        lead_id, user_id, name, title, company, industry, email, phone, linkedin, twitter, website,
        lead_score, email_source, created_at, provenance_url
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      const now = new Date().toISOString();
      const info = params.company || 'Unknown';
      const infoParts = info.split(' ');
      const leadId = `jin_tool_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const infoName = infoParts.length >= 3 ? infoParts.slice(0, 3).join(' ') : info;
      const infoCompany = infoParts.length >= 3 ? infoParts.slice(2).join(' ') : info;
      const infoEmail = params.email || `${info.toLowerCase().replace(/\s+/g, '.').replace(/[^a-z0-9]/g, '')}@example.com`;
      const infoPhone = params.phone || '';
      const infoWebsite = params.website || `https://${info.toLowerCase().replace(/\s+/g, '.').replace(/[^a-z0-9]/g, '')}.com`;
      const infoIndustry = params.industry || 'Technology';
      const infoTitle = params.title || 'Decision Maker';
      const infoLeadScore = 60;
      insertLead.run(
        leadId,
        ctx.userId ?? 0,
        infoName,
        infoTitle,
        infoCompany,
        infoIndustry,
        infoEmail,
        infoPhone,
        '',
        '',
        infoWebsite,
        infoLeadScore,
        'jin_tool',
        now,
        null
      );
      return {
        tool: 'save_crm',
        ok: true,
        summary: `Jin saved 1 lead to the CRM (lead_id ${leadId}).`,
        data: { leadId, email: infoEmail },
      };
    } catch (error: any) {
      return {
        tool: 'save_crm',
        ok: false,
        summary: 'Jin could not save the lead to the CRM.',
        error: error?.message ?? String(error),
      };
    }
  }

  // 4. draft outreach / proposal -> real service
  if (OUTREACH_RE.test(trimmed)) {
    const params = parseOutreachCommand(trimmed);
    try {
      const outreach = await craftOutreach(
        params.lead,
        params.context,
        '' // no API key needed for the local gemma4:e4b path
      );
      return {
        tool: 'draft_outreach',
        ok: true,
        summary: `Jin drafted outreach (subject: ${outreach.subject}).`,
        data: { outreach },
      };
    } catch (error: any) {
      return {
        tool: 'draft_outreach',
        ok: false,
        summary: 'Jin could not draft the outreach.',
        error: error?.message ?? String(error),
      };
    }
  }

  // 5. anything else -> ordinary conversation; the model answers unchanged.
  return null;
}
