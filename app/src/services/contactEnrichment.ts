/**
 * contactEnrichment.ts — W2-T1
 *
 * Given a decision-maker name + company, returns the BEST obtainable contact
 * (email + phone) with an HONEST verification rung.
 *
 * Rung order (ascending):
 *   none < unverified < mx_ok < probable < verified < public
 *
 * Design rules:
 *   - "public"   = email scraped/confirmed from an actual page. Minted here, never from
 *                  the verifyEmailLadder (the ladder doesn't know about sources).
 *   - "verified" = ladder probable/verified on a non-guessed address (e.g. SMTP 250 on
 *                  non-catch-all, non-MS365/Google domain). Rarely achievable in practice.
 *   - "probable" = ladder result on a non-guessed address (SMTP 250 hit, non-catch-all).
 *   - "mx_ok"    = best a GUESSED (pattern) email can ever reach. Structurally clamped.
 *   - "unverified"= syntax passes, no MX found.
 *   - "none"     = nothing at all.
 *
 *   A guessed email MUST NEVER be labelled > mx_ok. That rule is enforced by verifyEmailLadder
 *   AND by this file — we never call ladder with isGuessed=false for permutations.
 */

import { getGenAI } from './genaiClient.js';
import {
  verifyEmailLadder,
  EmailVerdictStatus,
} from './emailVerifier.js';
import {
  discoverPhone,
  extractStructuredData,
  extractSaudiPhones,
} from './phoneDiscovery.js';
import { generateEmailPermutations } from './transliterationEngine.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Rung order: none < unverified < mx_ok < probable < verified < public */
export type ContactRung = 'public' | 'verified' | 'probable' | 'mx_ok' | 'unverified' | 'none';

export interface ContactResult {
  email: string | null;
  email_rung: ContactRung;
  email_sources: string[];
  phone: string | null;
  phone_source: string | null;
  notes: string;
}

// ---------------------------------------------------------------------------
// Rung rank (higher = better)
// ---------------------------------------------------------------------------

const RUNG_RANK: Record<ContactRung, number> = {
  none: 0,
  unverified: 1,
  mx_ok: 2,
  probable: 3,
  verified: 4,
  public: 5,
};

function betterRung(a: ContactRung, b: ContactRung): ContactRung {
  return RUNG_RANK[a] >= RUNG_RANK[b] ? a : b;
}

/** Map the ladder's internal status to our ContactRung vocabulary */
function ladderStatusToRung(s: EmailVerdictStatus): ContactRung {
  switch (s) {
    case 'invalid_syntax': return 'none';
    case 'unverified':     return 'unverified';
    case 'mx_ok':          return 'mx_ok';
    case 'probable':       return 'probable';
    case 'verified':       return 'verified';
  }
}

// ---------------------------------------------------------------------------
// Fetch helper
// ---------------------------------------------------------------------------

const FETCH_TIMEOUT_MS = 6_000;

async function fetchPageText(url: string): Promise<string | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    const resp = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; LeadJin/1.0)',
        Accept: 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
    });
    clearTimeout(timer);
    if (!resp.ok) return null;
    return await resp.text();
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Extract emails from raw HTML (regex, JSON-LD, mailto: links)
// ---------------------------------------------------------------------------

const EMAIL_REGEX = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;

function extractEmailsFromHtml(html: string): string[] {
  const found = new Set<string>();

  // JSON-LD structured data (phoneDiscovery already does this for phones)
  const structured = extractStructuredData(html);
  for (const e of structured.emails) {
    const clean = e.trim().toLowerCase();
    if (clean.includes('@')) found.add(clean);
  }

  // mailto: links
  const mailtoRe = /mailto:([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/gi;
  let m: RegExpExecArray | null;
  while ((m = mailtoRe.exec(html)) !== null) {
    found.add(m[1].toLowerCase());
  }

  // Raw regex (wider net; lower confidence but catches plain text addresses)
  EMAIL_REGEX.lastIndex = 0;
  while ((m = EMAIL_REGEX.exec(html)) !== null) {
    const e = m[0].toLowerCase();
    // Filter common false-positives (image names, CSS selectors, etc.)
    if (!e.includes('..') && !e.endsWith('.png') && !e.endsWith('.jpg') && !e.endsWith('.svg')) {
      found.add(e);
    }
  }

  return [...found];
}

// ---------------------------------------------------------------------------
// Step 1: Domain resolution
// ---------------------------------------------------------------------------

async function resolveDomain(company: string, existingDomain?: string): Promise<string | null> {
  if (existingDomain) {
    // Strip any protocol / trailing slash
    return existingDomain.replace(/^https?:\/\//, '').replace(/\/+$/, '').toLowerCase();
  }
  // Grounded lookup: ask Gemini to find the company website
  try {
    const ai = getGenAI();
    const resp = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `What is the official website domain (e.g. example.com) of the company "${company}" in Saudi Arabia? Reply with ONLY the domain, nothing else.`,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });
    const raw = (resp.text || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (raw && raw.includes('.') && raw.length > 4) {
      return raw;
    }
  } catch (e: any) {
    console.warn('[ContactEnrichment] Domain lookup failed:', e?.message);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Step 2: Scrape site for published emails
// ---------------------------------------------------------------------------

const SCRAPE_PATHS = ['/contact', '/contact-us', '/about', '/about-us', '/'];

interface ScrapedEmail {
  email: string;
  pageUrl: string;
}

async function scrapePublishedEmails(domain: string): Promise<ScrapedEmail[]> {
  const results: ScrapedEmail[] = [];

  for (const path of SCRAPE_PATHS) {
    const url = `https://${domain}${path}`;
    const html = await fetchPageText(url);
    if (!html) {
      // Try HTTP fallback
      const htmlHttp = await fetchPageText(`http://${domain}${path}`);
      if (!htmlHttp) continue;
      const emails = extractEmailsFromHtml(htmlHttp);
      for (const e of emails) {
        results.push({ email: e, pageUrl: `http://${domain}${path}` });
      }
      continue;
    }
    const emails = extractEmailsFromHtml(html);
    for (const e of emails) {
      results.push({ email: e, pageUrl: url });
    }
  }

  // Deduplicate: keep first occurrence of each email (highest-confidence page first)
  const seen = new Set<string>();
  return results.filter(r => {
    if (seen.has(r.email)) return false;
    seen.add(r.email);
    return true;
  });
}

// ---------------------------------------------------------------------------
// Step 3: Grounded Gemini search for personal email
// ---------------------------------------------------------------------------

interface GroundedEmailResult {
  email: string;
  citationUrl: string;
}

async function groundedPersonEmailSearch(
  name: string,
  company: string,
  domain: string | null,
): Promise<GroundedEmailResult | null> {
  try {
    const ai = getGenAI();
    const domainHint = domain ? ` (website: ${domain})` : '';
    const prompt = `Find the direct work email address of "${name}" who works at "${company}"${domainHint} in Saudi Arabia.
Search for their email on LinkedIn, company site, news articles, or any public source.
ONLY return an email address if you can cite a specific public URL where it appears.
Respond in exactly this format:
EMAIL: <address or NONE>
SOURCE: <url or NONE>`;

    const resp = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });

    const text = resp.text || '';
    const emailMatch = text.match(/EMAIL:\s*([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/i);
    const sourceMatch = text.match(/SOURCE:\s*(https?:\/\/[^\s\n]+)/i);

    if (!emailMatch) return null;

    const email = emailMatch[1].toLowerCase().trim();
    const sourceUrl = sourceMatch ? sourceMatch[1].trim() : null;

    // Refuse emails without a real citation URL
    if (!sourceUrl || sourceUrl === 'NONE' || !sourceUrl.startsWith('http')) {
      console.log(`[ContactEnrichment][Grounded] Found email ${email} but no citation URL — discarding`);
      return null;
    }

    console.log(`[ContactEnrichment][Grounded] Found ${email} cited at ${sourceUrl}`);
    return { email, citationUrl: sourceUrl };
  } catch (e: any) {
    console.warn('[ContactEnrichment][Grounded] Search failed:', e?.message);
    return null;
  }
}

/**
 * Anti-fake guard: a grounding-model citation is NOT proof. Fetch the cited page
 * and confirm the email string actually appears in its HTML before trusting it.
 * Returns false on any fetch failure (fail-closed).
 */
export async function confirmEmailOnPage(url: string, email: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LeadJin/1.0)' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return false;
    const html = (await res.text()).toLowerCase();
    return html.includes(email.toLowerCase());
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Step 4: Pattern-guess ladder (guessed ceiling = mx_ok always)
// ---------------------------------------------------------------------------

interface PatternGuessResult {
  email: string;
  rung: ContactRung;
  evidence: string;
}

async function patternGuessLadder(
  name: string,
  domain: string,
): Promise<PatternGuessResult | null> {
  const permutations = generateEmailPermutations(name, domain);
  if (permutations.length === 0) return null;

  console.log(`[ContactEnrichment][Pattern] Testing ${permutations.length} permutations for ${name}@${domain}`);

  // The ladder with isGuessed=true can never return above mx_ok.
  // All permutations at the same domain will have the same MX result — so we
  // just validate the first syntactically valid one to confirm MX exists,
  // then return the TOP-RANKED permutation (transliterationEngine already ranks by
  // probability, so permutations[0] is best guess).
  //
  // We test the first few to confirm MX is resolvable at all.
  const testCount = Math.min(3, permutations.length);
  let confirmedMx = false;
  let mxEvidence = '';

  for (let i = 0; i < testCount; i++) {
    const verdict = await verifyEmailLadder(permutations[i], true, true);
    // doLiveSmtp=true is safe here but inert for guesses — the ladder skips SMTP when isGuessed=true
    if (verdict.status === 'mx_ok' || verdict.status === 'probable' || verdict.status === 'verified') {
      confirmedMx = true;
      mxEvidence = verdict.evidence;
      break;
    }
    if (verdict.status === 'unverified') {
      mxEvidence = verdict.evidence;
      // Keep trying — might be a transient DNS issue
    }
  }

  if (!confirmedMx) {
    // No MX found — return unverified best guess
    return {
      email: permutations[0],
      rung: 'unverified',
      evidence: mxEvidence || 'No MX records found for domain',
    };
  }

  // Return top-ranked permutation with mx_ok (the ceiling for guesses)
  return {
    email: permutations[0],
    rung: 'mx_ok',
    evidence: mxEvidence,
  };
}

// ---------------------------------------------------------------------------
// Main export: enrichContact
// ---------------------------------------------------------------------------

export async function enrichContact(input: {
  name: string;
  company: string;
  domain?: string;
  lang?: 'ar' | 'en';
}): Promise<ContactResult> {
  const { name, company, lang = 'en' } = input;
  const noteParts: string[] = [];

  console.log(`[ContactEnrichment] Enriching ${name} @ ${company}`);

  // ── Step 1: Resolve domain ────────────────────────────────────────────────
  const domain = await resolveDomain(company, input.domain);
  if (domain) {
    console.log(`[ContactEnrichment] Domain: ${domain}`);
    noteParts.push(`Domain: ${domain}`);
  } else {
    noteParts.push('Domain: unresolved');
  }

  let bestEmail: string | null = null;
  let bestRung: ContactRung = 'none';
  let bestSources: string[] = [];

  // ── Step 2: Scrape site for published emails ──────────────────────────────
  if (domain) {
    const scraped = await scrapePublishedEmails(domain);
    if (scraped.length > 0) {
      console.log(`[ContactEnrichment][Scrape] Found ${scraped.length} email(s) on site`);

      // Prefer emails that look like personal addresses over generic ones
      // (personal = not info@, contact@, support@, hello@, etc.)
      const genericPrefixes = ['info', 'contact', 'support', 'hello', 'sales', 'admin', 'mail', 'noreply', 'no-reply', 'webmaster'];
      const personal = scraped.filter(r => {
        const local = r.email.split('@')[0];
        return !genericPrefixes.some(p => local === p || local.startsWith(p + '-') || local.startsWith(p + '.'));
      });
      const generic = scraped.filter(r => !personal.includes(r));

      // Check if the name matches any personal email found
      const nameLower = name.toLowerCase().replace(/[^a-z]/g, '');
      const nameMatched = personal.find(r => {
        const local = r.email.split('@')[0].replace(/[^a-z]/g, '');
        return local.includes(nameLower.slice(0, 4)) || nameLower.includes(local.slice(0, 4));
      });

      let chosen: ScrapedEmail | null = nameMatched || personal[0] || generic[0];

      if (chosen) {
        bestEmail = chosen.email;
        bestRung = 'public';
        bestSources = [chosen.pageUrl];
        noteParts.push(`Scraped from site: ${chosen.pageUrl}`);
        if (generic.includes(chosen)) {
          noteParts.push('NOTE: scraped email is a company/generic address, not the individual\'s personal email');
        }
      }
    }
  }

  // ── Step 3: Grounded Gemini search ───────────────────────────────────────
  // Only attempt if we don't already have a personal (non-generic) scraped email,
  // or if current rung is below public
  const alreadyPublic = bestRung === 'public' && bestEmail && (() => {
    const genericPrefixes = ['info', 'contact', 'support', 'hello', 'sales', 'admin', 'mail', 'noreply'];
    const local = bestEmail!.split('@')[0];
    return !genericPrefixes.some(p => local === p || local.startsWith(p));
  })();

  if (!alreadyPublic) {
    const grounded = await groundedPersonEmailSearch(name, company, domain);
    if (grounded) {
      const candidate = grounded.email;
      // HARD anti-fake: a model citation is NOT proof. Fetch the cited page and
      // confirm the email string is actually on it before granting any rung.
      const onPage = await confirmEmailOnPage(grounded.citationUrl, candidate);
      if (onPage) {
        // Literally published on a real, confirmed page → public, with the real source.
        if (RUNG_RANK['public'] > RUNG_RANK[bestRung] || (bestRung === 'public' && !bestEmail)) {
          bestEmail = candidate;
          bestRung = 'public';
          bestSources = [grounded.citationUrl];
          noteParts.push(`Grounded + page-confirmed: ${candidate} found on ${grounded.citationUrl}`);
        }
      } else {
        // Citation unconfirmed (email not on the page, or page unreachable) → the
        // grounded email is unproven. Ladder it as a GUESS (isGuessed=true → capped mx_ok),
        // so a hallucinated citation can NEVER elevate above mx_ok.
        const ladderResult = await verifyEmailLadder(candidate, true, true);
        const ladderRung = ladderStatusToRung(ladderResult.status);
        if (RUNG_RANK[ladderRung] > RUNG_RANK[bestRung]) {
          bestEmail = candidate;
          bestRung = ladderRung;
          bestSources = [`grounded-unconfirmed:${grounded.citationUrl}`];
          noteParts.push(`Grounded email ${candidate} cited at ${grounded.citationUrl} but NOT found on that page — treated as unverified guess (max mx_ok)`);
          noteParts.push(`Ladder: ${ladderResult.evidence}`);
        }
      }
    }
  }

  // ── Step 4: Pattern-guess fallback ───────────────────────────────────────
  if ((!bestEmail || RUNG_RANK[bestRung] < RUNG_RANK['mx_ok']) && domain) {
    const guess = await patternGuessLadder(name, domain);
    if (guess && RUNG_RANK[guess.rung] > RUNG_RANK[bestRung]) {
      bestEmail = guess.email;
      bestRung = guess.rung;
      bestSources = [`pattern-guess:${domain}`, 'transliterationEngine'];
      noteParts.push(`Pattern guess: ${guess.email} (${guess.rung}) — not verified, never emailable without further confirmation`);
      noteParts.push(`Ladder evidence: ${guess.evidence}`);
    }
  }

  // ── Step 5: Phone ─────────────────────────────────────────────────────────
  let phone: string | null = null;
  let phoneSource: string | null = null;

  if (domain) {
    try {
      const phoneResult = await discoverPhone(company, domain);
      if (phoneResult?.phone) {
        phone = phoneResult.phone;
        phoneSource = phoneResult.phoneSource;
        noteParts.push(`Phone (${phoneResult.phoneType}${phoneResult.whatsappVerified ? ', WhatsApp✓' : ''}): ${phone} from ${phoneSource}`);
      }
    } catch (e: any) {
      console.warn('[ContactEnrichment][Phone] Discovery failed:', e?.message);
    }
  }

  // ── Final assembly ────────────────────────────────────────────────────────
  return {
    email: bestEmail,
    email_rung: bestRung,
    email_sources: bestSources,
    phone,
    phone_source: phoneSource,
    notes: noteParts.join(' | '),
  };
}
