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
import type Database from 'better-sqlite3';
import {
  overallStatus as computeOverallStatus,
  recordVerification,
  type StageVerdict,
  type VerificationStatus,
} from './verificationRecord.js';

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
  status: VerificationStatus;
  stageResults: StageVerdict[];
}

type SmtpStageResult = {
  ok: boolean;
  status: VerificationStatus;
  reason: string;
  mxHost?: string;
};

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

async function smtpVerifyMailbox(email: string, log: string[]): Promise<SmtpStageResult> {
  const normalized = email.trim().toLowerCase();
  const domain = normalized.split('@')[1];

  if (!domain || domain.length < 4 || !domain.includes('.') || domain.endsWith('.')) {
    log.push(`[Email] Invalid domain: ${domain || 'missing'}`);
    return { ok: false, status: 'invalid', reason: 'email_domain_invalid' };
  }

  if (!isValidEmailSyntax(normalized)) {
    log.push(`[Email] Syntax check failed for ${normalized}`);
    return { ok: false, status: 'invalid', reason: 'email_syntax_invalid' };
  }

  if (!canProbe(smtpProbeTimestamps, MAX_SMTP_PROBES_PER_MINUTE)) {
    log.push(`[Email] SMTP rate limit hit — skipping probe for ${normalized}`);
    return { ok: false, status: 'unverified', reason: 'smtp_rate_limited' };
  }

  recordProbe(smtpProbeTimestamps);
  log.push(`[Email] Initiating SMTP handshake for ${normalized}`);

  try {
    const mxRecords = await dns.resolveMx(domain);
    if (!mxRecords || mxRecords.length === 0) {
      log.push(`[Email] No MX records found for ${domain}`);
      return { ok: false, status: 'unverified', reason: 'no_mx_records' };
    }
    mxRecords.sort((a, b) => a.priority - b.priority);
    const mxHost = mxRecords[0].exchange;
    log.push(`[Email] MX resolved: ${mxHost} (priority ${mxRecords[0].priority})`);

    return await new Promise<SmtpStageResult>((resolve) => {
      const socket = net.createConnection(25, mxHost);
      let stage = 0;
      let resolved = false;

      const done = (verdict: SmtpStageResult) => {
        if (!resolved) {
          resolved = true;
          socket.destroy();
          log.push(`[Email] SMTP result: ${verdict.status} — ${verdict.reason}`);
          resolve(verdict);
        }
      };

      socket.setTimeout(8000);
      socket.on('timeout', () => done({ ok: false, status: 'unverified', reason: 'smtp_timeout' }));
      socket.on('error', (err) => done({ ok: false, status: 'unverified', reason: `smtp_error: ${err.message}` }));

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
              if (code === 250) {
                done({ ok: true, status: 'verified', reason: 'smtp_rcpt_250_accepted', mxHost });
              } else if (code === 251) {
                done({ ok: false, status: 'catch_all', reason: 'smtp_rcpt_forwarded_251', mxHost });
              } else if ([550, 551, 552].includes(code)) {
                done({ ok: false, status: 'invalid', reason: 'smtp_recipient_rejected', mxHost });
              } else if (code >= 400 && code < 500) {
                done({ ok: false, status: 'risky', reason: 'smtp_temporary_failure', mxHost });
              } else {
                done({ ok: false, status: 'unverified', reason: `smtp_code_${code}`, mxHost });
              }
            }
          }
        }
      });
    });
  } catch (err: any) {
    log.push(`[Email] SMTP probe failed: ${err.message}`);
    return { ok: false, status: 'unverified', reason: `smtp_probe_failed: ${err.message}` };
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

  // Check mobile prefixes (first two digits of the 9, with the local leading 0)
  const mobilePrefix = '0' + digits.slice(0, 2);
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

type PhoneStageResult = { ok: boolean; status: VerificationStatus; reason: string };

async function hlrLookupStub(phone: string, log: string[]): Promise<PhoneStageResult> {
  // Real HLR lookup requires a paid API (Twilio Lookup / HLR Lookup API). No such
  // provider is configured, so this stage must never report a positive result.
  log.push(`[Phone] HLR lookup stub for ${phone} — status: unverified (hlr_lookup_not_configured)`);
  return { ok: false, status: 'unverified', reason: 'hlr_lookup_not_configured' };
}

// ---------------------------------------------------------------------------
// Social Cross-Reference — LinkedIn Public Page Match
// ---------------------------------------------------------------------------

type SocialStageResult = {
  ok: boolean;
  status: VerificationStatus;
  reason: string;
  source_url?: string;
};

async function crossReferenceLinkedIn(
  linkedinUrl: string,
  log: string[],
  expectedName?: string,
  expectedCompany?: string,
): Promise<SocialStageResult> {
  if (!linkedinUrl || !linkedinUrl.includes('linkedin.com')) {
    log.push(`[Social] Invalid LinkedIn URL: ${linkedinUrl}`);
    return { ok: false, status: 'invalid', reason: 'linkedin_url_invalid' };
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
      return { ok: false, status: 'unverified', reason: `linkedin_http_${response.status}`, source_url: linkedinUrl };
    }

    const html = await response.text();

    // LinkedIn public pages contain JSON-LD or og:title/meta tags
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

    if (!pageCompany) {
      const companyMatch = html.match(/"companyName"["']?\s*:\s*["']([^"']+)["']/i) ||
                           html.match(/at\s+([A-Z][A-Za-z0-9\s&]+)(?:\s*\|\s*-|\s*<|\s*$)/);
      if (companyMatch) {
        pageCompany = companyMatch[1].trim();
      }
    }

    log.push(`[Social] Extracted from page — name: "${pageName}", company: "${pageCompany}"`);

    let nameMatch = false;
    let companyMatch = false;

    if (expectedName && pageName) {
      const normExpected = expectedName.toLowerCase().replace(/[^a-z0-9\s]/g, '');
      const normPage = pageName.toLowerCase().replace(/[^a-z0-9\s]/g, '');
      nameMatch = normPage.includes(normExpected) || normExpected.includes(normPage);
    }

    if (expectedCompany && pageCompany) {
      const normExpected = expectedCompany.toLowerCase().replace(/[^a-z0-9\s]/g, '');
      const normPage = pageCompany.toLowerCase().replace(/[^a-z0-9\s]/g, '');
      companyMatch = normPage.includes(normExpected) || normExpected.includes(normPage);
    }

    const hasExpectation = !!expectedName || !!expectedCompany;
    const overallMatch = hasExpectation && nameMatch && companyMatch;

    if (overallMatch) {
      log.push(`[Social] Cross-reference result: MATCH`);
      return { ok: true, status: 'verified', reason: 'linkedin_name_company_match', source_url: linkedinUrl };
    }
    if (!hasExpectation) {
      log.push(`[Social] No expected identity to compare — cannot verify`);
      return { ok: false, status: 'unverified', reason: 'linkedin_no_expected_identity', source_url: linkedinUrl };
    }
    log.push(`[Social] Cross-reference result: MISMATCH`);
    return { ok: false, status: 'invalid', reason: 'linkedin_identity_mismatch', source_url: linkedinUrl };

  } catch (err: any) {
    log.push(`[Social] Fetch error: ${err.message}`);
    return { ok: false, status: 'unverified', reason: `linkedin_fetch_error: ${err.message}`, source_url: linkedinUrl };
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

export async function tripleVerify(
  lead: LeadIdentity,
  db?: Database.Database,
  leadId: string = lead.email || lead.phone || lead.linkedinUrl || 'unknown'
): Promise<SovereignVerificationResult> {
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
      status: 'unverified',
      stageResults: [],
    };
  }

  // 1. Email — real SMTP handshake only
  const emailStage: SmtpStageResult = lead.email
    ? await smtpVerifyMailbox(lead.email, log)
    : { ok: false, status: 'unverified', reason: 'not_provided' };
  if (!lead.email) log.push(`[Email] No email provided — skipping`);

  // 2. Phone — format check is real, HLR lookup is a stub (never a positive)
  let phoneStage: PhoneStageResult;
  if (lead.phone) {
    const phoneResult = validateSaudiPhone(lead.phone, log);
    phoneStage = phoneResult.valid
      ? await hlrLookupStub(lead.phone, log)
      : { ok: false, status: 'invalid', reason: 'phone_format_invalid' };
  } else {
    log.push(`[Phone] No phone provided — skipping`);
    phoneStage = { ok: false, status: 'unverified', reason: 'not_provided' };
  }

  // 3. Social — real public-page fetch, compared against an expected identity
  const socialStage: SocialStageResult = lead.linkedinUrl
    ? await crossReferenceLinkedIn(lead.linkedinUrl, log, lead.name, lead.company)
    : { ok: false, status: 'unverified', reason: 'not_provided' };
  if (!lead.linkedinUrl) log.push(`[Social] No LinkedIn URL provided — skipping`);

  const stages: StageVerdict[] = [
    {
      stage: 'email_smtp',
      status: emailStage.status,
      reason: emailStage.reason,
      method: 'SMTP_HANDSHAKE',
      confidence: emailStage.status === 'verified' ? 95 : 0,
      evidence: { mx_host: emailStage.mxHost ?? null },
      source_url: emailStage.mxHost ? `smtp://${emailStage.mxHost}` : null,
    },
    {
      stage: 'phone_hlr',
      status: phoneStage.status,
      reason: phoneStage.reason,
      method: 'HLR_STYLE_LOOKUP',
      confidence: 0,
      evidence: {},
    },
    {
      stage: 'linkedin_crossref',
      status: socialStage.status,
      reason: socialStage.reason,
      method: 'LINKEDIN_PUBLIC_PAGE',
      confidence: socialStage.status === 'verified' ? 90 : 0,
      evidence: {},
      source_url: socialStage.source_url ?? null,
    },
  ];

  // Weakest conclusive stage wins; an unverified stub caps overall at partially_verified.
  const verdictStatus = computeOverallStatus(stages);
  const overall: { status: VerificationStatus; reason: string } =
    verdictStatus === 'partially_verified'
      ? { status: 'partially_verified', reason: 'weakest_stage_or_missing_provider' }
      : verdictStatus === 'verified'
        ? { status: 'verified', reason: 'all_stages_conclusive' }
        : { status: verdictStatus, reason: 'weakest_conclusive_stage' };

  const emailValid = emailStage.status === 'verified';
  const phoneValid = phoneStage.status === 'verified';
  const socialMatch = socialStage.status === 'verified';
  const confidenceScore = calculateConfidence(
    emailValid, phoneValid, socialMatch, hasEmail, hasPhone, hasLinkedIn, log
  );

  // Persistent evidence on EVERY call; db is optional and never throws.
  for (const s of stages) {
    recordVerification(db, {
      lead_id: leadId,
      email: lead.email ?? null,
      stage: s.stage,
      method: s.method,
      status: s.status,
      confidence: s.confidence ?? 0,
      evidence_json: s.evidence ?? {},
      source_url: s.source_url ?? null,
      reason: s.reason,
    });
  }
  recordVerification(db, {
    lead_id: leadId,
    email: lead.email ?? null,
    stage: 'overall',
    method: 'WEAKEST_STAGE',
    status: overall.status,
    confidence: confidenceScore,
    evidence_json: {
      reason: overall.reason,
      stages: stages.map(s => ({ stage: s.stage, status: s.status, reason: s.reason })),
    },
    reason: overall.reason,
  });

  log.push(`[SovereignVerifier] Triple verification complete — status:${overall.status} email:${emailValid} phone:${phoneValid} social:${socialMatch} score:${confidenceScore}`);

  return {
    emailValid,
    phoneValid,
    socialMatch,
    confidenceScore,
    verificationLog: log,
    status: overall.status,
    stageResults: stages,
  };
}

export default tripleVerify;
