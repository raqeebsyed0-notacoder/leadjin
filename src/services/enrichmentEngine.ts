/**
 * LeadJin Enrichment Engine v2
 *
 * Zero-API Saudi-first social intelligence enrichment.
 * Replaces Hunter.io, Apollo.io, Snov.io with 5-layer waterfall:
 *   Layer 0: Cache + domain pattern check
 *   Layer 1: Social intelligence (X, TikTok, Snapchat, LinkedIn mining)
 *   Layer 2: Email verification (SMTP + pattern learning + transliteration)
 *   Layer 3: Phone + WhatsApp discovery
 *   Layer 4: AI research fallback (Gemini Flash + Google Search grounding)
 */

import { mineSocialProfiles, extractContactsFromBioText, type SocialIntelligenceResult } from './socialIntelligence.js';
import { generateEmailPermutations, normalizeArabicName } from './transliterationEngine.js';
import { verifyEmailLadder, findEmailByPermutation, detectMxProvider, detectCatchAll, recordDomainPattern, getDomainPattern, type EmailVerificationResult, type EmailVerdictStatus } from './emailVerifier.js';

/** Map ladder status to a numeric confidence score. */
function verdictToConfidence(status: EmailVerdictStatus): number {
  switch (status) {
    case 'verified':      return 95;
    case 'probable':      return 80;
    case 'mx_ok':         return 55;
    case 'unverified':    return 25;
    case 'invalid_syntax': return 0;
    default:              return 0;
  }
}
import { discoverPhone, verifyWhatsApp, normalizePhoneNumber, type PhoneDiscoveryResult } from './phoneDiscovery.js';
import { getCachedResult, setCachedResult } from './enrichmentCache.js';
import { GoogleGenAI } from '@google/genai';
import { getGenAI } from './genaiClient.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EnrichmentInput {
  name: string;
  company: string;
  domain?: string;
  leadId?: string;
}

export interface EnrichmentOutput {
  leadId?: string;
  email: string | null;
  emailConfidence: number;
  emailSource: string;
  phone: string | null;
  phoneType: 'direct' | 'company' | null;
  phoneSource: string | null;
  whatsappVerified: boolean;
  linkedinUrl: string | null;
  companyXHandle: string | null;
  companySnapchat: string | null;
  companyTiktok: string | null;
  confidenceLabel: string; // '✓✓✓ Verified' | '✓✓ Confident' | '✓ Likely' | '? Unverified'
  layersUsed: string[];
  durationMs: number;
  enrichedAt: string;
}

type EnrichmentStatus = 'pending' | 'processing' | 'done' | 'failed';

export interface QueueItem {
  leadId: string;
  input: EnrichmentInput;
  status: EnrichmentStatus;
  result?: EnrichmentOutput;
  error?: string;
  createdAt: string;
  completedAt?: string;
}

// ---------------------------------------------------------------------------
// Database reference (injected by server.ts)
// ---------------------------------------------------------------------------

let _db: any = null;
export function setDatabase(db: any) { _db = db; }

// ---------------------------------------------------------------------------
// Queue (kept in-memory for background processing state)
// ---------------------------------------------------------------------------

const enrichmentQueue = new Map<string, QueueItem>();

export function getCachedEnrichment(leadId: string): EnrichmentOutput | null {
  if (_db) return getCachedResult(_db, leadId);
  return null;
}

export function getQueueItem(leadId: string): QueueItem | null {
  return enrichmentQueue.get(leadId) ?? null;
}

// ---------------------------------------------------------------------------
// Confidence label
// ---------------------------------------------------------------------------

function confidenceLabel(score: number): string {
  if (score >= 90) return '✓✓✓ Verified';
  if (score >= 75) return '✓✓ Confident';
  if (score >= 60) return '✓ Likely';
  return '? Unverified';
}

// ---------------------------------------------------------------------------
// Layer 4: AI Research Fallback
// ---------------------------------------------------------------------------

interface AIResearchResult {
  email?: string;
  phone?: string;
  linkedinUrl?: string;
  sources?: string[];
}

async function aiResearchFallback(name: string, company: string, domain?: string, missingFields?: string[]): Promise<AIResearchResult> {
  try {
    const ai = getGenAI();
    const missing = missingFields?.join(', ') || 'email, phone, LinkedIn URL';

    const prompt = `Find the PERSONAL/DIRECT contact details for ${name} at ${company}${domain ? ` (${domain})` : ''}. Missing: ${missing}.

SEARCH STRATEGY:
1. Search "${name}" "${company}" on Google — look for their direct work email, NOT generic info@ or contact@
2. Check ${company}'s website /team, /about, /leadership pages for ${name}'s individual contact
3. Search LinkedIn for "${name}" at "${company}" in Saudi Arabia
4. Search Google Maps for "${company}" to find the business phone number
5. Try Arabic name variants too

CRITICAL EMAIL RULE: I need ${name}'s PERSONAL work email (like firstname.lastname@${domain || 'company.com'}). Do NOT return info@, contact@, support@, media@, hr@, complaints@, admin@, or any generic address. If you can only find a generic email, return it as "company_email" not "email".

You MUST use Google Search. Do NOT answer from memory.
Include source URLs for verification.

Return ONLY valid JSON (no markdown):
{"email": "personal email or null", "company_email": "generic fallback or null", "phone": "phone or null", "linkedinUrl": "URL or null", "sources": ["url1"]}`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        temperature: 0,
      },
    });

    const text = response.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return {};

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      email: parsed.email || parsed.company_email || undefined,
      phone: parsed.phone || undefined,
      linkedinUrl: parsed.linkedinUrl || undefined,
      sources: parsed.sources || [],
    };
  } catch (e: any) {
    console.warn(`[Enrichment][AI] Research fallback failed: ${e.message}`);
    return {};
  }
}

// ---------------------------------------------------------------------------
// Main Enrichment Pipeline
// ---------------------------------------------------------------------------

export async function enrichLead(input: EnrichmentInput): Promise<EnrichmentOutput> {
  const startTime = Date.now();
  const layersUsed: string[] = [];
  const domain = input.domain || guessDomain(input.company);

  let email: string | null = null;
  let emailConfidence = 0;
  let emailSource = '';
  let phone: string | null = null;
  let phoneType: 'direct' | 'company' | null = null;
  let phoneSource: string | null = null;
  let whatsappVerified = false;
  let linkedinUrl: string | null = null;
  let companyXHandle: string | null = null;
  let companySnapchat: string | null = null;
  let companyTiktok: string | null = null;

  // ── Layer 0: SQLite enrichment cache ──
  if (input.leadId && _db) {
    const cached = getCachedResult(_db, input.leadId);
    if (cached) {
      console.log(`[Enrichment] SQLite cache hit for ${input.name}`);
      return cached;
    }
  }

  // ── Layer 0b: Pre-built database lookup ──
  if (_db) {
    const { lookupCompany, lookupPerson } = await import('./preCrawler.js');

    // Check person cache (exact match = instant)
    const cachedPerson = lookupPerson(_db, input.name, domain);
    if (cachedPerson?.email) {
      // We have this exact person. Return instantly.
      const result: EnrichmentOutput = {
        leadId: input.leadId,
        email: cachedPerson.email,
        emailConfidence: cachedPerson.email_verified ? 95 : 75,
        emailSource: cachedPerson.email_verified ? 'cache_verified' : 'cache',
        phone: cachedPerson.phone || null,
        phoneType: cachedPerson.phone ? 'direct' : null,
        phoneSource: cachedPerson.phone ? 'cache' : null,
        whatsappVerified: false,
        linkedinUrl: cachedPerson.linkedin_url || null,
        companyXHandle: null, // filled from company cache below if needed
        companySnapchat: null,
        companyTiktok: null,
        confidenceLabel: cachedPerson.email_verified ? '✓✓✓ Verified' : '✓✓ Confident',
        layersUsed: ['precrawl_cache'],
        durationMs: Date.now() - startTime,
        enrichedAt: new Date().toISOString(),
      };

      // Also grab company socials
      const cachedCompany = lookupCompany(_db, domain);
      if (cachedCompany) {
        result.companyXHandle = cachedCompany.x_handle || null;
        result.companySnapchat = cachedCompany.snapchat || null;
        result.companyTiktok = cachedCompany.tiktok || null;
        if (cachedCompany.phone && !result.phone) {
          result.phone = cachedCompany.phone;
          result.phoneType = 'company';
          result.phoneSource = 'company_cache';
        }
      }

      // Cache the instant result
      if (input.leadId && _db) {
        setCachedResult(_db, input.leadId, result);
      }
      return result;
    }

    // Check company cache (get phone, socials, email pattern)
    const cachedCompany = lookupCompany(_db, domain);
    if (cachedCompany) {
      layersUsed.push('company_cache');
      if (cachedCompany.phone && !phone) {
        phone = cachedCompany.phone;
        phoneType = 'company';
        phoneSource = 'company_cache';
      }
      if (cachedCompany.x_handle) companyXHandle = cachedCompany.x_handle;
      if (cachedCompany.snapchat) companySnapchat = cachedCompany.snapchat;
      if (cachedCompany.tiktok) companyTiktok = cachedCompany.tiktok;

      // Use known email pattern to generate email instantly
      if (cachedCompany.email_pattern && !email) {
        const { normalizeArabicName } = await import('./transliterationEngine.js');
        const { firstName, lastName } = normalizeArabicName(input.name);
        const generated = applyPattern(cachedCompany.email_pattern, firstName, lastName, domain);
        if (generated) {
          email = generated;
          emailConfidence = 80;
          emailSource = 'pattern_cache';
        }
      }
    }
  }

  const knownPattern = getDomainPattern(domain);
  if (knownPattern) {
    layersUsed.push('pattern_cache');
    const { firstName, lastName } = normalizeArabicName(input.name);
    const guessedEmail = applyPattern(knownPattern.pattern, firstName, lastName, domain);
    if (guessedEmail) {
      // isGuessed=true: email was produced by pattern-inference, clamps to mx_ok max
      const verdict = await verifyEmailLadder(guessedEmail, true, false);
      if (verdict.status !== 'invalid_syntax' && verdict.status !== 'unverified') {
        email = guessedEmail;
        emailConfidence = verdictToConfidence(verdict.status);
        emailSource = 'pattern_match';
        console.log(`[Enrichment] Pattern match hit: ${email} (${verdict.status})`);
      }
    }
  }

  // ── Layer 1: Social Intelligence ──
  try {
    console.log(`[Enrichment] Layer 1: Social intelligence for ${input.name} at ${input.company}`);
    const social = await mineSocialProfiles(input.name, input.company, domain);
    layersUsed.push('social_intelligence');

    if (social.email && !email) {
      email = social.email;
      emailConfidence = 80;
      emailSource = 'social_bio';
    }
    if (social.linkedinUrl) linkedinUrl = social.linkedinUrl;
    if (social.companyXHandle) companyXHandle = social.companyXHandle;
    if (social.companySnapchat) companySnapchat = social.companySnapchat;
    if (social.companyTiktok) companyTiktok = social.companyTiktok;

    // Extract phone from social findings
    if (social.phone || social.whatsappLink) {
      const socialPhone = social.phone || social.whatsappLink?.replace(/.*wa\.me\//, '+');
      if (socialPhone) {
        phone = normalizePhoneNumber(socialPhone);
        phoneType = 'direct';
        phoneSource = 'social_bio';
      }
    }
  } catch (e: any) {
    console.warn(`[Enrichment] Layer 1 failed: ${e.message}`);
  }

  // ── Layer 2: Email Verification / Discovery ──
  if (email) {
    // Verify email found in Layer 1 — not guessed, allow live SMTP
    try {
      const verdict = await verifyEmailLadder(email, false, true);
      emailConfidence = verdictToConfidence(verdict.status);
      emailSource = verdict.status === 'verified' || verdict.status === 'probable'
        ? 'smtp_verified'
        : (verdict.status === 'mx_ok' ? 'mx_ok' : 'unverified');
      // Learn the domain pattern when we get a useful result
      if (verdict.status === 'probable' || verdict.status === 'verified') {
        const pattern = detectPattern(email, domain);
        // detectMxProvider needed to record pattern — get it from the domain
        detectMxProvider(domain).then(mx => {
          if (pattern) recordDomainPattern(domain, pattern, mx);
        }).catch(() => {});
      }
      layersUsed.push('email_verification');
    } catch (e: any) {
      console.warn(`[Enrichment] Layer 2 verification failed: ${e.message}`);
    }
  } else {
    // No email yet — try permutation + SMTP
    try {
      console.log(`[Enrichment] Layer 2: Email permutation for ${input.name} at ${domain}`);
      const permutations = generateEmailPermutations(input.name, domain);
      const found = await findEmailByPermutation(permutations, domain);
      layersUsed.push('email_permutation');

      if (found && found.deliverable) {
        email = found.email;
        emailConfidence = found.confidence;
        emailSource = 'smtp_verified';
        const pattern = detectPattern(found.email, domain);
        if (pattern) recordDomainPattern(domain, pattern, found.mxProvider);
      }
    } catch (e: any) {
      console.warn(`[Enrichment] Layer 2 permutation failed: ${e.message}`);
    }
  }

  // ── Layer 3: Phone + WhatsApp ──
  if (!phone) {
    try {
      console.log(`[Enrichment] Layer 3: Phone discovery for ${input.company}`);
      const phoneResult = await discoverPhone(input.company, domain);
      layersUsed.push('phone_discovery');

      if (phoneResult) {
        phone = phoneResult.phone || null;
        phoneType = phoneResult.phoneType;
        phoneSource = phoneResult.phoneSource;
      }
    } catch (e: any) {
      console.warn(`[Enrichment] Layer 3 failed: ${e.message}`);
    }
  }

  // WhatsApp verification for any phone found
  if (phone && !whatsappVerified) {
    try {
      whatsappVerified = await verifyWhatsApp(phone);
    } catch {
      // silent — heuristic check
    }
  }

  // ── Layer 4: AI Research Fallback ──
  const missingFields: string[] = [];
  if (!email) missingFields.push('email');
  if (!phone) missingFields.push('phone');
  if (!linkedinUrl) missingFields.push('LinkedIn URL');

  if (missingFields.length > 0) {
    try {
      console.log(`[Enrichment] Layer 4: AI research for missing: ${missingFields.join(', ')}`);
      const aiResult = await aiResearchFallback(input.name, input.company, domain, missingFields);
      layersUsed.push('ai_research');

      if (!email && aiResult.email) {
        // Verify AI-found email — not guessed (AI found it on a source page), allow SMTP
        const verdict = await verifyEmailLadder(aiResult.email, false, true);
        if (verdict.status !== 'invalid_syntax') {
          email = aiResult.email;
          emailConfidence = verdictToConfidence(verdict.status);
          emailSource = 'ai_research';
        }
      }
      if (!phone && aiResult.phone) {
        phone = normalizePhoneNumber(aiResult.phone);
        phoneType = 'company';
        phoneSource = 'ai_research';
      }
      if (!linkedinUrl && aiResult.linkedinUrl) {
        linkedinUrl = aiResult.linkedinUrl;
      }
    } catch (e: any) {
      console.warn(`[Enrichment] Layer 4 failed: ${e.message}`);
    }
  }

  // ── Build Result ──
  const result: EnrichmentOutput = {
    leadId: input.leadId,
    email,
    emailConfidence,
    emailSource,
    phone,
    phoneType,
    phoneSource,
    whatsappVerified,
    linkedinUrl,
    companyXHandle,
    companySnapchat,
    companyTiktok,
    confidenceLabel: confidenceLabel(emailConfidence),
    layersUsed,
    durationMs: Date.now() - startTime,
    enrichedAt: new Date().toISOString(),
  };

  // Cache the result in SQLite
  if (input.leadId && _db) {
    setCachedResult(_db, input.leadId, result);
  }

  console.log(`[Enrichment] Complete for ${input.name}: email=${email ? 'found' : 'miss'}, phone=${phone ? 'found' : 'miss'}, linkedin=${linkedinUrl ? 'found' : 'miss'} (${result.durationMs}ms)`);
  return result;
}

// ---------------------------------------------------------------------------
// Queue-based enrichment (for background processing)
// ---------------------------------------------------------------------------

export async function enqueueEnrichment(input: EnrichmentInput): Promise<string> {
  const leadId = input.leadId || `enrich_${Date.now()}`;

  const item: QueueItem = {
    leadId,
    input: { ...input, leadId },
    status: 'pending',
    createdAt: new Date().toISOString(),
  };

  enrichmentQueue.set(leadId, item);

  // Process in background
  setImmediate(async () => {
    item.status = 'processing';
    try {
      item.result = await enrichLead(item.input);
      item.status = 'done';
      item.completedAt = new Date().toISOString();
    } catch (e: any) {
      item.status = 'failed';
      item.error = e.message;
      item.completedAt = new Date().toISOString();
    }
  });

  return leadId;
}

export async function enrichBatch(
  contacts: EnrichmentInput[],
  concurrency: number = 3,
  onProgress?: (completed: number, total: number) => void,
): Promise<EnrichmentOutput[]> {
  const results: EnrichmentOutput[] = new Array(contacts.length);
  let index = 0;
  let completed = 0;

  const worker = async () => {
    while (index < contacts.length) {
      const current = index++;
      console.log(`[Enrichment] Batch ${current + 1}/${contacts.length}: ${contacts[current].name}`);
      try {
        results[current] = await enrichLead(contacts[current]);
      } catch (e: any) {
        results[current] = {
          leadId: contacts[current].leadId,
          email: null,
          emailConfidence: 0,
          emailSource: 'error',
          phone: null,
          phoneType: null,
          phoneSource: null,
          whatsappVerified: false,
          linkedinUrl: null,
          companyXHandle: null,
          companySnapchat: null,
          companyTiktok: null,
          confidenceLabel: '? Unverified',
          layersUsed: ['error'],
          durationMs: 0,
          enrichedAt: new Date().toISOString(),
        };
      }
      completed++;
      onProgress?.(completed, contacts.length);
    }
  };

  const workers = Array.from(
    { length: Math.min(concurrency, contacts.length) },
    () => worker(),
  );
  await Promise.all(workers);

  return results;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function guessDomain(company: string): string {
  return company
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    + '.com';
}

function applyPattern(pattern: string, firstName: string, lastName: string, domain: string): string | null {
  if (!firstName || !lastName) return null;
  const f = firstName.toLowerCase();
  const l = lastName.toLowerCase();

  switch (pattern) {
    case 'first.last': return `${f}.${l}@${domain}`;
    case 'flast': return `${f[0]}${l}@${domain}`;
    case 'first': return `${f}@${domain}`;
    case 'firstl': return `${f}${l[0]}@${domain}`;
    case 'first_last': return `${f}_${l}@${domain}`;
    case 'f.last': return `${f[0]}.${l}@${domain}`;
    case 'last.first': return `${l}.${f}@${domain}`;
    default: return null;
  }
}

function detectPattern(email: string, domain: string): string | null {
  const local = email.split('@')[0]?.toLowerCase();
  if (!local) return null;

  // Try to match against common patterns
  // This is a heuristic — works for most cases
  if (local.includes('.')) {
    const parts = local.split('.');
    if (parts.length === 2) {
      if (parts[0].length > 1 && parts[1].length > 1) return 'first.last';
      if (parts[0].length === 1) return 'f.last';
    }
  }
  if (local.includes('_')) return 'first_last';
  if (local.length <= 2) return 'first';

  return null;
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

export function getEnrichmentStats() {
  const queueItems = Array.from(enrichmentQueue.values());
  let cacheSize = 0;
  if (_db) {
    try {
      const row = _db.prepare('SELECT COUNT(*) as count FROM enrichment_cache').get();
      cacheSize = row?.count || 0;
    } catch {}
  }
  return {
    cacheSize,
    queueTotal: queueItems.length,
    queuePending: queueItems.filter(i => i.status === 'pending').length,
    queueProcessing: queueItems.filter(i => i.status === 'processing').length,
    queueDone: queueItems.filter(i => i.status === 'done').length,
    queueFailed: queueItems.filter(i => i.status === 'failed').length,
    domainPatternsLearned: 0, // TODO: wire to emailVerifier's getDomainPattern count
  };
}
