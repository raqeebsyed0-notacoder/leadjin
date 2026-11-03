/**
 * LeadJin Sovereign Verifier Module — Triple Verification Engine
 *
 * Performs cross-channel verification on three identity vectors:
 *   1. Email   — SMTP handshake with MX servers (no message sent)
 *   2. Phone   — Saudi-format validation + area-code intelligence + HLR stub
 *   3. Social  — LinkedIn public-page cross-reference for name/company match
 *
 * Returns a unified confidence score (0-100) and a full audit log.
 */

import dns from 'dns/promises';
import net from 'net';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LeadIdentity {
  email?: string;
  phone?: string;
  linkedinUrl?: string;
  name?: string;
  company?: string;
}

export interface SovereignVerificationResult {
  emailValid: boolean;
  phoneValid: boolean;
  socialMatch: boolean;
  confidenceScore: number; // 0-100
  verificationLog: string[];
}

// ---------------------------------------------------------------------------
// Rate limiters (shared with emailVerifier patterns)
// ---------------------------------------------------------------------------

const smtpProbeTimestamps: number[] = [];
const MAX_SMTP_PROBES_PER_MINUTE = 10;
const WINDOW_MS = 60_000;

function pruneTimestamps(timestamps: number[]): void {
  const cutoff = Date.now() - WINDOW_MS;
  while (timestamps.length > 0 && timestamps[0] < cutoff) {
    timestamps.shift();
  }
}

function canProbe(timestamps: number[], max: number): boolean {
  pruneTimestamps(timestamps);
  return timestamps.length < max;
}

function recordProbe(timestamps: number[]): void {
  timestamps.push(Date.now());
}

// ---------------------------------------------------------------------------
// Email Verification — SMTP Handshake (no message sent)
// ---------------------------------------------------------------------------

function isValidEmailSyntax(email: string): boolean {
  return /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/.test(email.trim());
}

async function smtpVerifyMailbox(email: string, log: string[]): Promise<boolean> {
  const normalized = email.trim().toLowerCase();
  const domain = normalized.split('@')[1];

  if (!domain || domain.length < 4 || !domain.includes('.') || domain.endsWith('.')) {
    log.push(`[Email] Invalid domain: ${domain || 'missing'}`);
    return false;
  }

  if (!isValidEmailSyntax(normalized)) {
    log.push(`[Email] Syntax check failed for ${normalized}`);
    return false;
  }

  if (!canProbe(smtpProbeTimestamps, MAX_SMTP_PROBES_PER_MINUTE)) {
    log.push(`[Email] SMTP rate limit hit — skipping probe for ${normalized}`);
    return false;
  }

  recordProbe(smtpProbeTimestamps);
  log.push(`[Email] Initiating SMTP handshake for ${normalized}`);

  try {
    const mxRecords = await dns.resolveMx(domain);
    if (!mxRecords || mxRecords.length === 0) {
      log.push(`[Email] No MX records found for ${domain}`);
      return false;
    }
    mxRecords.sort((a, b) => a.priority - b.priority);
    const mxHost = mxRecords[0].exchange;
    log.push(`[Email] MX resolved: ${mxHost} (priority ${mxRecords[0].priority})`);

    return await new Promise<boolean>((resolve) => {
      const socket = net.createConnection(25, mxHost);
      let stage = 0;
      let resolved = false;

      const done = (result: boolean, reason: string) => {
        if (!resolved) {
          resolved = true;
          socket.destroy();
          log.push(`[Email] SMTP result: ${result ? 'ACCEPTED' : 'REJECTED'} — ${reason}`);
          resolve(result);
        }
      };

      socket.setTimeout(8000);
      socket.on('timeout', () => done(false, 'Connection timeout'));
      socket.on('error', (err) => done(false, `Connection error: ${err.message}`));

      socket.on('data', (data: Buffer) => {
        const lines = data.toString().split('\r\n').filter(l => l.trim());
        for (const line of lines) {
          if (stage === 0 && line.startsWith('220')) {
            socket.write('EHLO leadjin.app\r\n');
            stage = 1;
          } else if (stage === 1 && line.startsWith('250')) {
            socket.write('MAIL FROM:<verify@leadjin.app>\r\n');
            stage = 2;
          } else if (stage === 2 && line.startsWith('250')) {
            socket.write(`RCPT TO:<${normalized}>\r\n`);
            stage = 3;
          } else if (stage === 3) {
            const code = parseInt(line.slice(0, 3), 10);
            if (!isNaN(code)) {
              done(code === 250 || code === 251, `SMTP code ${code}`);
            }
          }
        }
      });
    });
  } catch (err: any) {
    log.push(`[Email] SMTP probe failed: ${err.message}`);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Phone Verification — Saudi-Focused
// ---------------------------------------------------------------------------

// Saudi mobile area codes
const SAUDI_MOBILE_PREFIXES = ['050', '051', '053', '054', '055', '056', '057', '058', '059'];

// Saudi landline area codes
const SAUDI_AREA_CODES: Record<string, string> = {
  '011': 'Riyadh',
  '012': 'Jeddah',
  '013': 'Dammam',
  '014': 'Madinah',
  '016': 'Qassim',
  '017': 'Tabuk',
}

function normalizeSaudiPhone(phone: string): string | null {
  // Strip all non-digits and any leading +
  let digits = phone.replace(/\D/g, '');

  // Handle international format: 9665XXXXXXXX → +9665XXXXXXXX
  if (digits.startsWith('966') && digits.length >= 12) {
    return '+' + digits;
  }

  // Handle local format starting with 0: 05XXXXXXXX → +9665XXXXXXXX
  if (digits.startsWith('0') && digits.length >= 10) {
    return '+966' + digits.slice(1);
  }

  return null;
}

function validateSaudiPhone(phone: string, log: string[]): { valid: boolean; area?: string; type: 'mobile' | 'landline' | 'unknown' } {
  const normalized = normalizeSaudiPhone(phone);

  if (!normalized) {
    log.push(`[Phone] Format invalid: ${phone} — expected +966XXXXXXXXX or 05XXXXXXXX`);
    return { valid: false, type: 'unknown' };
  }

  // Extract digits after +966
  const digits = normalized.slice(4); // remove '+966'

  if (digits.length !== 9) {
    log.push(`[Phone] Length invalid for ${normalized}: expected 9 digits after +966, got ${digits.length}`);
    return { valid: false, type: 'unknown' };
  }

  // Check mobile prefixes (first digit of the 9)
  const firstDigit = digits[0];
  const mobilePrefix = '0' + firstDigit;
  if (SAUDI_MOBILE_PREFIXES.includes(mobilePrefix)) {
    log.push(`[Phone] Valid Saudi mobile: ${normalized} (prefix ${mobilePrefix})`);
    return { valid: true, type: 'mobile' };
  }

  // Check landline area codes (first 2 digits of the 9)
  const landlinePrefix = digits.slice(0, 2);
  const city = SAUDI_AREA_CODES[landlinePrefix];
  if (city) {
    log.push(`[Phone] Valid Saudi landline: ${normalized} (area ${landlinePrefix} = ${city})`);
    return { valid: true, area: city, type: 'landline' };
  }

  // Special case: 011 (Riyadh) has 7-digit subscriber numbers
  if (digits.startsWith('11') && digits.length === 9) {
    log.push(`[Phone] Valid Saudi landline: ${normalized} (area 011 = Riyadh)`);
    return { valid: true, area: 'Riyadh', type: 'landline' };
  }

  log.push(`[Phone] Unrecognized prefix/area code for ${normalized}`);
  return { valid: false, type: 'unknown' };
}

async function hlrLookupStub(phone: string, log: string[]): Promise<{ status: string; carrier?: string }> {
  // Real HLR lookup requires a paid API (e.g., Twilio Lookup, HLR Lookup API)
  // For now we return a stub that marks the format as valid
  log.push(`[Phone] HLR lookup stub for ${phone} — status: format_valid (real HLR requires API key)`);
  return { status: 'format_valid' };
}

// ---------------------------------------------------------------------------
// Social Cross-Reference — LinkedIn Public Page Match
// ---------------------------------------------------------------------------

async function crossReferenceLinkedIn(
  linkedinUrl: string,
  log: string[],
  expectedName?: string,
  expectedCompany?: string,
): Promise<boolean> {
  if (!linkedinUrl || !linkedinUrl.includes('linkedin.com')) {
    log.push(`[Social] Invalid LinkedIn URL: ${linkedinUrl}`);
    return false;
  }

  log.push(`[Social] Fetching public LinkedIn page: ${linkedinUrl}`);

  try {
    const response = await fetch(linkedinUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.0.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.0.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      redirect: 'follow',
    });

    if (!response.ok) {
      log.push(`[Social] LinkedIn fetch failed: HTTP ${response.status}`);
      return false;
    }

    const html = await response.text();

    // LinkedIn public pages contain JSON-LD or og:title/meta tags
    // Extract name from title or JSON-LD
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const ogTitleMatch = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
    const jsonLdMatch = html.match(/<script type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i);

    let pageName = '';
    let pageCompany = '';

    if (jsonLdMatch) {
      try {
        const jsonLd = JSON.parse(jsonLdMatch[1]);
        pageName = jsonLd.name || '';
        pageCompany = jsonLd.worksFor?.name || jsonLd.jobTitle || '';
      } catch {
        // JSON parse failed, fall through
      }
    }

    if (!pageName && ogTitleMatch) {
      pageName = ogTitleMatch[1].split(' | ')[0].trim();
    }

    if (!pageName && titleMatch) {
      pageName = titleMatch[1].replace(' | LinkedIn', '').split(' - ')[0].trim();
    }

    // Try to extract company from page text
    if (!pageCompany) {
      const companyMatch = html.match(/"companyName"["']?\s*:\s*["']([^"']+)["']/i) ||
                           html.match(/at\s+([A-Z][A-Za-z0-9\s&]+)(?:\s*\||\s*-|\s*<|\s*$)/);
      if (companyMatch) {
        pageCompany = companyMatch[1].trim();
      }
    }

    log.push(`[Social] Extracted from page — name: "${pageName}", company: "${pageCompany}"`);

    // Match logic
    let nameMatch = false;
    let companyMatch = false;

    if (expectedName && pageName) {
      const normExpected = expectedName.toLowerCase().replace(/[^a-z0-9\s]/g, '');
      const normPage = pageName.toLowerCase().replace(/[^a-z0-9\s]/g, '');
      nameMatch = normPage.includes(normExpected) || normExpected.includes(normPage);
      if (nameMatch) {
        log.push(`[Social] Name match confirmed: "${expectedName}" ↔ "${pageName}"`);
      } else {
        log.push(`[Social] Name mismatch: expected "${expectedName}", found "${pageName}"`);
      }
    } else if (!expectedName) {
      log.push(`[Social] No expected name provided — skipping name match`);
      nameMatch = true; // neutral when no expectation
    }

    if (expectedCompany && pageCompany) {
      const normExpected = expectedCompany.toLowerCase().replace(/[^a-z0-9\s]/g, '');
      const normPage = pageCompany.toLowerCase().replace(/[^a-z0-9\s]/g, '');
      companyMatch = normPage.includes(normExpected) || normExpected.includes(normPage);
      if (companyMatch) {
        log.push(`[Social] Company match confirmed: "${expectedCompany}" ↔ "${pageCompany}"`);
      } else {
        log.push(`[Social] Company mismatch: expected "${expectedCompany}", found "${pageCompany}"`);
      }
    } else if (!expectedCompany) {
      log.push(`[Social] No expected company provided — skipping company match`);
      companyMatch = true; // neutral when no expectation
    }

    const overallMatch = nameMatch && companyMatch;
    log.push(`[Social] Cross-reference result: ${overallMatch ? 'MATCH' : 'MISMATCH'}`);
    return overallMatch;

  } catch (err: any) {
    log.push(`[Social] Fetch error: ${err.message}`);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Confidence Score Calculation
// ---------------------------------------------------------------------------

function calculateConfidence(
  emailValid: boolean,
  phoneValid: boolean,
  socialMatch: boolean,
  hasEmail: boolean,
  hasPhone: boolean,
  hasLinkedIn: boolean,
  log: string[]
): number {
  let score = 0;
  let vectorsChecked = 0;
  let vectorsPassed = 0;

  if (hasEmail) {
    vectorsChecked++;
    if (emailValid) vectorsPassed++;
  }

  if (hasPhone) {
    vectorsChecked++;
    if (phoneValid) vectorsPassed++;
  }

  if (hasLinkedIn) {
    vectorsChecked++;
    if (socialMatch) vectorsPassed++;
  }

  if (vectorsChecked === 0) {
    log.push(`[Confidence] No verification vectors provided — score 0`);
    return 0;
  }

  // Base score: proportion of vectors that passed (0-70 points)
  score += Math.round((vectorsPassed / vectorsChecked) * 70);

  // Bonus for comprehensive verification (all 3 vectors present and passed)
  if (vectorsChecked === 3 && vectorsPassed === 3) {
    score += 30;
    log.push(`[Confidence] Full triple-verification bonus +30`);
  } else if (vectorsChecked >= 2 && vectorsPassed === vectorsChecked) {
    score += 15;
    log.push(`[Confidence] Dual-verification bonus +15`);
  }

  // Cap at 100
  score = Math.min(100, score);
  log.push(`[Confidence] Final score: ${score} (${vectorsPassed}/${vectorsChecked} vectors passed)`);

  return score;
}

// ---------------------------------------------------------------------------
// Triple Verify — Main Entry Point
// ---------------------------------------------------------------------------

export async function tripleVerify(lead: LeadIdentity): Promise<SovereignVerificationResult> {
  const log: string[] = [];
  log.push(`[SovereignVerifier] Triple verification started at ${new Date().toISOString()}`);

  const hasEmail = !!lead.email;
  const hasPhone = !!lead.phone;
  const hasLinkedIn = !!lead.linkedinUrl;

  if (!hasEmail && !hasPhone && !hasLinkedIn) {
    log.push(`[SovereignVerifier] No identity vectors provided — aborting`);
    return {
      emailValid: false,
      phoneValid: false,
      socialMatch: false,
      confidenceScore: 0,
      verificationLog: log,
    };
  }

  // 1. Email verification
  let emailValid = false;
  if (lead.email) {
    emailValid = await smtpVerifyMailbox(lead.email, log);
  } else {
    log.push(`[Email] No email provided — skipping`);
  }

  // 2. Phone verification
  let phoneValid = false;
  if (lead.phone) {
    const phoneResult = validateSaudiPhone(lead.phone, log);
    if (phoneResult.valid) {
      await hlrLookupStub(lead.phone, log);
      phoneValid = true;
    }
  } else {
    log.push(`[Phone] No phone provided — skipping`);
  }

  // 3. Social cross-reference
  let socialMatch = false;
  if (lead.linkedinUrl) {
    socialMatch = await crossReferenceLinkedIn(lead.linkedinUrl, log, lead.name, lead.company);
  } else {
    log.push(`[Social] No LinkedIn URL provided — skipping`);
  }

  // 4. Confidence score
  const confidenceScore = calculateConfidence(
    emailValid,
    phoneValid,
    socialMatch,
    hasEmail,
    hasPhone,
    hasLinkedIn,
    log
  );

  log.push(`[SovereignVerifier] Triple verification complete — email:${emailValid} phone:${phoneValid} social:${socialMatch} score:${confidenceScore}`);

  return {
    emailValid,
    phoneValid,
    socialMatch,
    confidenceScore,
    verificationLog: log,
  };
}

export default tripleVerify;
