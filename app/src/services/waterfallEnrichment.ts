/**
 * Waterfall Enrichment Service
 *
 * Queries multiple data providers sequentially (by priority) until a verified
 * contact is found — email first, then phone.  If no providers are configured
 * the service returns null.
 *
 * Providers (lowest priority number = tried first):
 *   1. Gemini Grounding  (GEMINI_API_KEY) — Google Search grounded email discovery
 *   2. Apollo.io          (APOLLO_API_KEY)    [testing-only, behind LEADJIN_TESTING_MODE]
 *   3. Snov.io            (SNOV_API_KEY + SNOV_API_SECRET)  [testing-only, behind LEADJIN_TESTING_MODE]
 *   4. SMTP MX verifier   (always available, used for verification only)
 *
 * Hunter.io has been replaced by Gemini Grounding (2026-06-02). Hunter is never
 * used as a verification leg — SMTP built-in is the sole verifier.
 *
 * D3 (2026-10-20): Apollo and Snov are testing-only legs. They are instantiated
 * only when LEADJIN_TESTING_MODE is set. Each testing-provider API call is counted
 * against a per-day cap (LEADJIN_TESTING_CAP, default 20). Production runs on the
 * model key (GEMINI_API_KEY) + SMTP verify alone — no Apollo/Snov/Hunter required.
 */

import dns from 'dns/promises';
import net from 'net';
import { GoogleGenAI } from '@google/genai';
import { getGenAI } from './genaiClient.js';

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export interface EnrichmentResult {
  /** The raw value — an email address or phone number */
  value: string;
  /** Confidence score 0-100 */
  confidence: number;
  /** Name of the provider that returned this result */
  source: string;
  /** Whether the value has been independently verified */
  verified: boolean;
}

export interface VerificationResult {
  valid: boolean;
  deliverable: boolean;
  catchAll: boolean;
  source: string;
}

export interface FullEnrichmentResult {
  email: EnrichmentResult | null;
  phone: EnrichmentResult | null;
  verification: VerificationResult | null;
  providersAttempted: string[];
}

export interface ContactInput {
  name: string;
  company: string;
  domain?: string;
}

// ---------------------------------------------------------------------------
// Provider interface
// ---------------------------------------------------------------------------

interface EnrichmentProvider {
  name: string;
  /** Lower number = tried first */
  priority: number;
  isConfigured(): boolean;
  findEmail(params: ContactInput): Promise<EnrichmentResult | null>;
  findPhone(params: ContactInput): Promise<EnrichmentResult | null>;
  verifyEmail(email: string): Promise<VerificationResult>;
}

// ---------------------------------------------------------------------------
// Helper utilities
// ---------------------------------------------------------------------------

/** Split "First Last" (or "Last, First") into parts */
export function splitName(fullName: string): { firstName: string; lastName: string } {
  const cleaned = fullName
    .replace(/^(dr\.?|sh\.?|eng\.?|mr\.?|mrs\.?|ms\.?|prof\.?)\s+/i, '')
    .trim();

  // "Last, First" format
  if (cleaned.includes(',')) {
    const [last, first] = cleaned.split(',').map(s => s.trim());
    return { firstName: first || '', lastName: last || '' };
  }

  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: '', lastName: '' };
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return { firstName: parts[0], lastName: parts[parts.length - 1] };
}

/** Extract a bare domain from a URL or company name */
export function extractDomain(companyOrUrl: string): string {
  const trimmed = companyOrUrl.trim();
  try {
    // Treat it as a URL if it starts with http(s) or contains a dot
    const urlLike = trimmed.startsWith('http') ? trimmed : `https://${trimmed}`;
    const url = new URL(urlLike);
    return url.hostname.replace(/^www\./, '');
  } catch {
    // Fallback: slugify the company name into a guessed domain
    return trimmed
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      + '.com';
  }
}

/** Basic RFC-5322 syntax check */
export function syntaxCheck(email: string): boolean {
  return /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/.test(email.trim());
}

/** DNS MX check — returns true if the domain has at least one MX record */
export async function mxCheck(domain: string): Promise<boolean> {
  try {
    const records = await dns.resolveMx(domain);
    return Array.isArray(records) && records.length > 0;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Testing-only provider gate (D3 refactor)
//
// Apollo and Snov are testing-only legs — they require LEADJIN_TESTING_MODE
// to be explicitly enabled. Each testing-provider API call is counted against
// a per-day cap (LEADJIN_TESTING_CAP, default 20) to stay inside free-tier
// limits. When LEADJIN_TESTING_MODE is unset or "0", Apollo/Snov are never
// instantiated and never appear in the provider list — prod runs on the model
// key (GEMINI) + SMTP verify alone.
// ---------------------------------------------------------------------------

const TESTING_MODE = process.env.LEADJIN_TESTING_MODE === '1' || process.env.LEADJIN_TESTING_MODE === 'true';
const TESTING_DAILY_CAP = parseInt(process.env.LEADJIN_TESTING_CAP ?? '20', 10);
const TESTING_WINDOW_MS = 24 * 60 * 60 * 1000; // 24h UTC day

interface TestingLedger {
  day: string; // UTC date YYYY-MM-DD
  calls: number;
}

// Module-level burn ledger for testing-only provider calls (in-process)
let testingLedger: TestingLedger = {
  day: new Date().toISOString().slice(0, 10),
  calls: 0,
};

function _resetTestingLedgerIfRolled(): void {
  const today = new Date().toISOString().slice(0, 10);
  if (testingLedger.day !== today) {
    testingLedger = { day: today, calls: 0 };
  }
}

/** Returns true if a testing-only provider API call is allowed under today's cap */
export function testingCallAllowed(): boolean {
  _resetTestingLedgerIfRolled();
  return testingLedger.calls < TESTING_DAILY_CAP;
}

/** Record a testing-only provider API call after the cap check passes */
export function recordTestingCall(): void {
  _resetTestingLedgerIfRolled();
  testingLedger.calls += 1;
}

/** Current testing-provider burn ledger state (for admin/debugging) */
export function getTestingLedger(): { day: string; calls: number; cap: number; remaining: number } {
  _resetTestingLedgerIfRolled();
  return {
    day: testingLedger.day,
    calls: testingLedger.calls,
    cap: TESTING_DAILY_CAP,
    remaining: TESTING_DAILY_CAP - testingLedger.calls,
  };
}

// ---------------------------------------------------------------------------
// SMTP MX verifier (reused from server.ts logic)
// ---------------------------------------------------------------------------

const smtpProbeTimestamps: number[] = [];
const MAX_SMTP_PROBES_PER_MINUTE = 10;
const SMTP_PROBE_WINDOW_MS = 60_000;

function canSmtpProbe(): boolean {
  const now = Date.now();
  while (smtpProbeTimestamps.length > 0 && smtpProbeTimestamps[0] < now - SMTP_PROBE_WINDOW_MS) {
    smtpProbeTimestamps.shift();
  }
  return smtpProbeTimestamps.length < MAX_SMTP_PROBES_PER_MINUTE;
}

async function smtpProbe(email: string): Promise<boolean> {
  const domain = email.split('@')[1];
  if (!domain) return false;

  if (!canSmtpProbe()) {
    console.warn('[Waterfall][SMTP] Rate limit hit, skipping probe for', email);
    return false;
  }

  smtpProbeTimestamps.push(Date.now());
  console.log(`[Waterfall][SMTP] Probing ${email}`);

  try {
    const mxRecords = await dns.resolveMx(domain);
    if (!mxRecords || mxRecords.length === 0) return false;
    mxRecords.sort((a, b) => a.priority - b.priority);
    const mxHost = mxRecords[0].exchange;

    return await new Promise<boolean>((resolve) => {
      const socket = net.createConnection(25, mxHost);
      let stage = 0;
      let resolved = false;

      const done = (result: boolean) => {
        if (!resolved) {
          resolved = true;
          socket.destroy();
          resolve(result);
        }
      };

      socket.setTimeout(5000);
      socket.on('timeout', () => done(false));
      socket.on('error', () => done(false));

      socket.on('data', (data: Buffer) => {
        const line = data.toString();
        if (stage === 0 && line.startsWith('220')) {
          socket.write('EHLO leadjin.app\r\n');
          stage = 1;
        } else if (stage === 1 && (line.includes('250') || line.includes('220'))) {
          socket.write('MAIL FROM:<verify@leadjin.app>\r\n');
          stage = 2;
        } else if (stage === 2 && line.startsWith('250')) {
          socket.write(`RCPT TO:<${email}>\r\n`);
          stage = 3;
        } else if (stage === 3) {
          const code = parseInt(line.slice(0, 3), 10);
          done(code === 250 || code === 251);
        }
      });
    });
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Provider: SMTP Built-in
// ---------------------------------------------------------------------------

class SmtpBuiltinProvider implements EnrichmentProvider {
  name = 'smtp_builtin';
  priority = 100; // Always last — this is a verifier, not a finder

  isConfigured(): boolean {
    return true; // Always available
  }

  async findEmail(_params: ContactInput): Promise<EnrichmentResult | null> {
    // The SMTP provider cannot discover emails — it only verifies
    return null;
  }

  async findPhone(_params: ContactInput): Promise<EnrichmentResult | null> {
    return null;
  }

  async verifyEmail(email: string): Promise<VerificationResult> {
    const valid = syntaxCheck(email);
    if (!valid) {
      return { valid: false, deliverable: false, catchAll: false, source: this.name };
    }

    const domain = email.split('@')[1];
    const hasMx = await mxCheck(domain);
    if (!hasMx) {
      return { valid: true, deliverable: false, catchAll: false, source: this.name };
    }

    const deliverable = await smtpProbe(email);
    return { valid: true, deliverable, catchAll: false, source: this.name };
  }
}

// ---------------------------------------------------------------------------
// Provider: Gemini Grounding
// ---------------------------------------------------------------------------

class GeminiProvider implements EnrichmentProvider {
  name = 'gemini';
  priority = 10;

  isConfigured(): boolean {
    return !!process.env.GEMINI_API_KEY;
  }

  async findEmail(params: ContactInput): Promise<EnrichmentResult | null> {
    const domain = params.domain || extractDomain(params.company);
    try {
      console.log(`[Waterfall][Gemini] Searching email for ${params.name} at ${domain || params.company}`);

      const ai = getGenAI();
      const prompt =
        `Find the PERSONAL/DIRECT work email address for ${params.name} who works at ${params.company}${domain ? ` (${domain})` : ''}. ` +
        `I need their specific individual email (like firstname.lastname@company.com), NOT a generic address like info@, contact@, support@, sales@, or admin@.\n\n` +
        `Search Google for "${params.name}" "${params.company}" email — look for their profile page, team page, or directory listing that includes their direct email.\n` +
        `If you cannot find their exact email, search for the company's email pattern (e.g., firstname.lastname@domain) and generate the most likely address.\n\n` +
        `Return ONLY valid JSON (no markdown):\n` +
        `{"email": "personal email or empty string", "confidence": 0-100, "email_pattern_used": "pattern description or empty string", "source_urls": ["url1"]}\n\n` +
        `CRITICAL: confidence must be >= 85 if the email was found on a verified source like LinkedIn, company team page, or public directory. ` +
        `Confidence should be 50-70 if it's a generated/pattern-based guess. Return 0 confidence and empty email if you genuinely cannot find anything.`;

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
      if (!jsonMatch) {
        console.log(`[Waterfall][Gemini] No JSON in response for ${params.name}`);
        return null;
      }

      const parsed = JSON.parse(jsonMatch[0]);
      const email = parsed.email?.trim();
      const confidence = Math.min(100, Math.max(0, parsed.confidence || 0));

      if (!email || !email.includes('@') || confidence < 30) {
        console.log(`[Waterfall][Gemini] No valid email found for ${params.name}`);
        return null;
      }

      console.log(`[Waterfall][Gemini] found: ${email} (confidence ${confidence})`);
      // verified must NOT be derived from self-reported confidence score — must come from
      // the email ladder (verifyEmailLadder) downstream, never from a confidence number.
      return {
        value: email,
        confidence,
        source: this.name,
        verified: false,
      };
    } catch (e: any) {
      console.warn(`[Waterfall][Gemini] Error: ${e.message}`);
      // Fallback: try knowledge-only (no grounding) in case of rate limit
      try {
        return await this.findEmailFallbackKnowledge(params, domain);
      } catch {
        return null;
      }
    }
  }

  private async findEmailFallbackKnowledge(params: ContactInput, domain: string): Promise<EnrichmentResult | null> {
    const ai = getGenAI();
    const prompt =
      `What is a likely professional email address for ${params.name} at ${params.company} (${domain || 'unknown domain'})?\n` +
      `Based on common email patterns at this company (e.g., first.last@domain, flast@domain, first@domain), ` +
      `return ONLY valid JSON:\n{"email": "generated email or empty string", "confidence": 0-100, "pattern": "pattern name"}\n\n` +
      `Only respond if you know the company's real email pattern. Otherwise return {"email": "", "confidence": 0}.`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: { temperature: 0 },
    });

    const text = response.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);
    const email = parsed.email?.trim();
    const confidence = Math.min(100, Math.max(0, parsed.confidence || 0));

    if (!email || !email.includes('@') || confidence < 40) return null;

    return {
      value: email,
      confidence: Math.round(confidence * 0.8), // Penalize knowledge-only guesses
      source: this.name,
      verified: false,
    };
  }

  async findPhone(_params: ContactInput): Promise<EnrichmentResult | null> {
    return null;
  }

  async verifyEmail(_email: string): Promise<VerificationResult> {
    return { valid: false, deliverable: false, catchAll: false, source: this.name };
  }
}

// ---------------------------------------------------------------------------
// Provider: Apollo.io
// ---------------------------------------------------------------------------

class ApolloProvider implements EnrichmentProvider {
  name = 'apollo';
  priority = 20;

  isConfigured(): boolean {
    return !!process.env.APOLLO_API_KEY;
  }

  private get apiKey(): string {
    return process.env.APOLLO_API_KEY!;
  }

  private async matchPerson(params: ContactInput): Promise<any | null> {
    // Testing-only gate: per-day cap on Apollo API calls (D3)
    if (!testingCallAllowed()) {
      console.warn('[Waterfall][Apollo] Testing daily cap reached — skipping call');
      return null;
    }
    recordTestingCall();

    const { firstName, lastName } = splitName(params.name);

    try {
      console.log(`[Waterfall][Apollo] Matching ${params.name} at ${params.company}`);
      const res = await fetch('https://api.apollo.io/api/v1/people/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: firstName,
          last_name: lastName,
          organization_name: params.company,
          api_key: this.apiKey,
        }),
      });

      if (!res.ok) {
        console.log(`[Waterfall][Apollo] HTTP ${res.status} — not-found`);
        return null;
      }

      const json = await res.json() as any;
      return json?.person ?? null;
    } catch (e: any) {
      console.warn(`[Waterfall][Apollo] Error: ${e.message}`);
      return null;
    }
  }

  async findEmail(params: ContactInput): Promise<EnrichmentResult | null> {
    const person = await this.matchPerson(params);
    if (!person?.email) {
      console.log(`[Waterfall][Apollo] not-found email for ${params.name}`);
      return null;
    }

    console.log(`[Waterfall][Apollo] found email: ${person.email}`);
    return {
      value: person.email,
      confidence: 85,
      source: this.name,
      verified: person.email_status === 'verified',
    };
  }

  async findPhone(params: ContactInput): Promise<EnrichmentResult | null> {
    const person = await this.matchPerson(params);
    const phone =
      person?.phone_numbers?.[0]?.sanitized_number ??
      person?.mobile_phone ??
      null;

    if (!phone) {
      console.log(`[Waterfall][Apollo] not-found phone for ${params.name}`);
      return null;
    }

    console.log(`[Waterfall][Apollo] found phone: ${phone}`);
    return {
      value: phone,
      confidence: 75,
      source: this.name,
      verified: false,
    };
  }

  async verifyEmail(_email: string): Promise<VerificationResult> {
    // Apollo does not expose a standalone email verification endpoint
    return { valid: false, deliverable: false, catchAll: false, source: this.name };
  }
}

// ---------------------------------------------------------------------------
// Provider: Snov.io
// ---------------------------------------------------------------------------

class SnovProvider implements EnrichmentProvider {
  name = 'snov';
  priority = 30;

  isConfigured(): boolean {
    return !!(process.env.SNOV_API_KEY && process.env.SNOV_API_SECRET);
  }

  private cachedToken: { token: string; expiresAt: number } | null = null;

  private async getAccessToken(): Promise<string | null> {
    const now = Date.now();
    if (this.cachedToken && this.cachedToken.expiresAt > now + 10_000) {
      return this.cachedToken.token;
    }

    try {
      const res = await fetch('https://api.snov.io/v1/oauth/access_token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grant_type: 'client_credentials',
          client_id: process.env.SNOV_API_KEY,
          client_secret: process.env.SNOV_API_SECRET,
        }),
      });

      if (!res.ok) {
        console.warn(`[Waterfall][Snov] Token fetch failed: HTTP ${res.status}`);
        return null;
      }

      const json = await res.json() as any;
      if (!json?.access_token) return null;

      const expiresIn = (json.expires_in ?? 3600) * 1000;
      this.cachedToken = { token: json.access_token, expiresAt: now + expiresIn };
      return json.access_token;
    } catch (e: any) {
      console.warn(`[Waterfall][Snov] Token error: ${e.message}`);
      return null;
    }
  }

  async findEmail(params: ContactInput): Promise<EnrichmentResult | null> {
    // Testing-only gate: per-day cap on Snov API calls (D3)
    if (!testingCallAllowed()) {
      console.warn('[Waterfall][Snov] Testing daily cap reached — skipping call');
      return null;
    }
    recordTestingCall();

    const token = await this.getAccessToken();
    if (!token) return null;

    const { firstName, lastName } = splitName(params.name);
    const domain = params.domain || extractDomain(params.company);

    try {
      console.log(`[Waterfall][Snov] Looking up email for ${params.name} at ${domain}`);
      const res = await fetch('https://api.snov.io/v1/get-emails-from-names', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ firstName, lastName, domain }),
      });

      if (!res.ok) {
        console.log(`[Waterfall][Snov] HTTP ${res.status} — not-found`);
        return null;
      }

      const json = await res.json() as any;
      // Snov returns an array of email objects
      const emails: any[] = json?.data ?? json?.emails ?? [];
      if (!emails.length) {
        console.log(`[Waterfall][Snov] not-found for ${params.name}`);
        return null;
      }

      // Prefer emails with status 'valid' or highest confidence
      const best = emails.sort((a, b) => {
        const scoreA = a.status === 'valid' ? 100 : (a.confidence ?? 0);
        const scoreB = b.status === 'valid' ? 100 : (b.confidence ?? 0);
        return scoreB - scoreA;
      })[0];

      const email = best.email ?? best.value;
      if (!email) return null;

      const confidence = best.confidence ?? (best.status === 'valid' ? 90 : 60);
      console.log(`[Waterfall][Snov] found: ${email} (confidence ${confidence})`);
      return {
        value: email,
        confidence,
        source: this.name,
        verified: best.status === 'valid',
      };
    } catch (e: any) {
      console.warn(`[Waterfall][Snov] Error: ${e.message}`);
      return null;
    }
  }

  async findPhone(_params: ContactInput): Promise<EnrichmentResult | null> {
    // Snov.io's free/basic plans don't expose phone enrichment
    return null;
  }

  async verifyEmail(_email: string): Promise<VerificationResult> {
    return { valid: false, deliverable: false, catchAll: false, source: this.name };
  }
}

// ---------------------------------------------------------------------------
// Waterfall Engine
// ---------------------------------------------------------------------------

export class WaterfallEnrichment {
  private providers: EnrichmentProvider[];

  constructor() {
    // Gemini Grounding is the primary provider (requires GEMINI_API_KEY) —
    // this is the "model key" path. Production runs on this alone.
    const gemini = new GeminiProvider();
    const providers: EnrichmentProvider[] = [gemini];

    // Apollo and Snov are testing-only legs (D3). They are instantiated only
    // when LEADJIN_TESTING_MODE is explicitly enabled. Each testing-provider
    // call is gated by a per-day cap (see testingCallAllowed/recordTestingCall).
    // When the flag is OFF, Apollo/Snov never appear in the provider list.
    if (TESTING_MODE) {
      console.log('[Waterfall] Testing mode ON — enabling Apollo + Snov with per-day cap', TESTING_DAILY_CAP);
      const apollo = new ApolloProvider();
      const snov = new SnovProvider();
      if (apollo.isConfigured()) {
        providers.push(apollo);
        console.log('[Waterfall] Apollo enabled (testing-only leg)');
      } else {
        console.log('[Waterfall] Apollo key absent — skipping testing leg');
      }
      if (snov.isConfigured()) {
        providers.push(snov);
        console.log('[Waterfall] Snov enabled (testing-only leg)');
      } else {
        console.log('[Waterfall] Snov key absent — skipping testing leg');
      }
    } else {
      console.log('[Waterfall] Testing mode OFF — prod path: Gemini + SMTP only');
    }

    providers.push(new SmtpBuiltinProvider());
    this.providers = providers.sort((a, b) => a.priority - b.priority);
  }

  /** Returns only providers that have their API keys configured */
  getActiveProviders(): EnrichmentProvider[] {
    return this.providers.filter(p => p.isConfigured());
  }

  /**
   * Returns a summary of which providers are active and their priority order.
   * Useful for admin dashboards and debugging.
   */
  getProviderStats(): { name: string; active: boolean; priority: number }[] {
    return this.providers.map(p => ({
      name: p.name,
      active: p.isConfigured(),
      priority: p.priority,
    }));
  }

  /**
   * Tries each active provider (ordered by priority) until an email is found.
   * Returns null if no configured provider can find one.
   */
  async findEmail(params: ContactInput): Promise<EnrichmentResult | null> {
    const active = this.getActiveProviders().filter(p => p.name !== 'smtp_builtin');

    if (active.length === 0) {
      console.log('[Waterfall] No email-finding providers configured — returning null');
      return null;
    }

    for (const provider of active) {
      try {
        const result = await provider.findEmail(params);
        if (result) {
          console.log(`[Waterfall] findEmail — ${provider.name}: found ${result.value}`);
          return result;
        }
        console.log(`[Waterfall] findEmail — ${provider.name}: not-found`);
      } catch (e: any) {
        console.warn(`[Waterfall] findEmail — ${provider.name} threw: ${e.message}`);
      }
    }

    console.log('[Waterfall] findEmail — all providers exhausted, returning null');
    return null;
  }

  /**
   * Tries each active provider (ordered by priority) until a phone is found.
   * Returns null if no configured provider can find one.
   */
  async findPhone(params: ContactInput): Promise<EnrichmentResult | null> {
    const active = this.getActiveProviders().filter(p => p.name !== 'smtp_builtin');

    if (active.length === 0) {
      console.log('[Waterfall] No phone-finding providers configured — returning null');
      return null;
    }

    for (const provider of active) {
      try {
        const result = await provider.findPhone(params);
        if (result) {
          console.log(`[Waterfall] findPhone — ${provider.name}: found ${result.value}`);
          return result;
        }
        console.log(`[Waterfall] findPhone — ${provider.name}: not-found`);
      } catch (e: any) {
        console.warn(`[Waterfall] findPhone — ${provider.name} threw: ${e.message}`);
      }
    }

    console.log('[Waterfall] findPhone — all providers exhausted, returning null');
    return null;
  }

  /**
   * Triple verification pipeline:
   *   1. Syntax check
   *   2. DNS MX check
   *   3. SMTP built-in verifier (Hunter was replaced by Gemini on 2026-06-02;
   *      Gemini does not perform email verification, so SMTP built-in is the
   *      sole verifier in both prod and testing paths)
   */
  async verifyEmail(email: string): Promise<VerificationResult> {
    // Step 1: syntax
    if (!syntaxCheck(email)) {
      console.log(`[Waterfall] verifyEmail — syntax fail: ${email}`);
      return { valid: false, deliverable: false, catchAll: false, source: 'syntax' };
    }

    // Step 2: MX
    const domain = email.split('@')[1];
    const hasMx = await mxCheck(domain);
    if (!hasMx) {
      console.log(`[Waterfall] verifyEmail — no MX for ${domain}`);
      return { valid: true, deliverable: false, catchAll: false, source: 'mx_check' };
    }

    // Step 3: SMTP built-in verification (sole verifier — Hunter replaced by Gemini)
    const smtpProvider = this.providers.find(p => p.name === 'smtp_builtin')!;
    const result = await smtpProvider.verifyEmail(email);
    console.log(`[Waterfall] verifyEmail — ${smtpProvider.name}: deliverable=${result.deliverable}`);
    return result;
  }

  /**
   * Full enrichment for a single contact:
   *   - Find email (waterfall)
   *   - Find phone (waterfall)
   *   - Verify found email
   */
  async enrichContact(params: ContactInput): Promise<FullEnrichmentResult> {
    const providersAttempted: string[] = [];

    const active = this.getActiveProviders();
    active.forEach(p => providersAttempted.push(p.name));

    const [email, phone] = await Promise.all([
      this.findEmail(params),
      this.findPhone(params),
    ]);

    let verification: VerificationResult | null = null;
    if (email) {
      verification = await this.verifyEmail(email.value);
      // Upgrade the result's verified flag based on the deep verification
      email.verified = verification.deliverable;
    }

    return { email, phone, verification, providersAttempted };
  }

  /**
   * Bulk enrichment with concurrency control.
   * @param contacts - Array of contacts to enrich
   * @param concurrency - Max simultaneous enrichment calls (default: 3)
   */
  async enrichBatch(
    contacts: ContactInput[],
    concurrency: number = 3,
  ): Promise<FullEnrichmentResult[]> {
    const results: FullEnrichmentResult[] = new Array(contacts.length);
    let index = 0;

    const worker = async () => {
      while (index < contacts.length) {
        const current = index++;
        console.log(
          `[Waterfall] enrichBatch — processing ${current + 1}/${contacts.length}: ${contacts[current].name}`,
        );
        results[current] = await this.enrichContact(contacts[current]);
      }
    };

    // Spin up `concurrency` workers
    const workers = Array.from({ length: Math.min(concurrency, contacts.length) }, () => worker());
    await Promise.all(workers);

    return results;
  }
}

// ---------------------------------------------------------------------------
// Singleton export
// ---------------------------------------------------------------------------

/** Singleton instance — import and use directly */
export const waterfallEnrichment = new WaterfallEnrichment();
