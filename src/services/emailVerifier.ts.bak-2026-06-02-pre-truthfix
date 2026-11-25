/**
 * Email Verifier Service — Layer 2 of LeadJin's enrichment engine
 *
 * Handles email verification via SMTP probing, MX provider detection,
 * catch-all detection, and domain pattern learning.
 *
 * Reuses the same dns.resolveMx + net.createConnection approach from
 * waterfallEnrichment.ts but with richer verification logic.
 */

import dns from 'dns/promises';
import net from 'net';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EmailVerificationResult {
  email: string;
  valid: boolean;
  deliverable: boolean;
  catchAll: boolean;
  mxProvider: 'microsoft365' | 'google' | 'zoho' | 'other';
  confidence: number; // 0-100
  source: string;     // 'smtp_verified' | 'pattern_match' | 'catch_all_guess'
}

type MxProvider = 'microsoft365' | 'google' | 'zoho' | 'other';

// ---------------------------------------------------------------------------
// Rate limiters
// ---------------------------------------------------------------------------

const smtpProbeTimestamps: number[] = [];
const MAX_SMTP_PROBES_PER_MINUTE = 10;

const catchAllProbeTimestamps: number[] = [];
const MAX_CATCHALL_PROBES_PER_MINUTE = 5;

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
// Domain pattern learning (in-memory, caller persists to DB)
// ---------------------------------------------------------------------------

const domainPatternCache = new Map<string, { pattern: string; mxProvider: string }>();

export function recordDomainPattern(domain: string, pattern: string, mxProvider: string): void {
  domainPatternCache.set(domain.toLowerCase(), { pattern, mxProvider });
}

export function getDomainPattern(domain: string): { pattern: string; mxProvider: string } | null {
  return domainPatternCache.get(domain.toLowerCase()) ?? null;
}

// ---------------------------------------------------------------------------
// Catch-all detection cache (avoid re-probing same domain)
// ---------------------------------------------------------------------------

const catchAllCache = new Map<string, boolean>();

// ---------------------------------------------------------------------------
// MX Provider Detection
// ---------------------------------------------------------------------------

export async function detectMxProvider(domain: string): Promise<MxProvider> {
  try {
    const mxRecords = await dns.resolveMx(domain);
    if (!mxRecords || mxRecords.length === 0) return 'other';

    for (const record of mxRecords) {
      const exchange = record.exchange.toLowerCase();

      if (exchange.endsWith('.mail.protection.outlook.com')) {
        return 'microsoft365';
      }
      if (exchange.endsWith('.google.com') || exchange.endsWith('.googlemail.com')) {
        return 'google';
      }
      if (exchange.endsWith('.zoho.com')) {
        return 'zoho';
      }
    }

    return 'other';
  } catch {
    return 'other';
  }
}

// ---------------------------------------------------------------------------
// SMTP Probe (shared logic)
// ---------------------------------------------------------------------------

async function smtpProbe(email: string): Promise<boolean> {
  const domain = email.split('@')[1];
  if (!domain) return false;

  if (!canProbe(smtpProbeTimestamps, MAX_SMTP_PROBES_PER_MINUTE)) {
    console.warn('[EmailVerifier][SMTP] Rate limit hit, skipping probe for', email);
    return false;
  }

  recordProbe(smtpProbeTimestamps);
  console.log(`[EmailVerifier][SMTP] Probing ${email}`);

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
// Catch-All Detection
// ---------------------------------------------------------------------------

export async function detectCatchAll(domain: string): Promise<boolean> {
  const key = domain.toLowerCase();

  // Return cached result if available
  if (catchAllCache.has(key)) {
    return catchAllCache.get(key)!;
  }

  if (!canProbe(catchAllProbeTimestamps, MAX_CATCHALL_PROBES_PER_MINUTE)) {
    console.warn('[EmailVerifier][CatchAll] Rate limit hit, skipping probe for', domain);
    return false;
  }

  recordProbe(catchAllProbeTimestamps);

  // Generate random gibberish local part
  const gibberish = 'xq7z9' + Math.random().toString(36).substring(2, 8);
  const probeEmail = `${gibberish}@${domain}`;

  console.log(`[EmailVerifier][CatchAll] Probing ${probeEmail}`);

  try {
    const mxRecords = await dns.resolveMx(domain);
    if (!mxRecords || mxRecords.length === 0) {
      catchAllCache.set(key, false);
      return false;
    }
    mxRecords.sort((a, b) => a.priority - b.priority);
    const mxHost = mxRecords[0].exchange;

    const accepted = await new Promise<boolean>((resolve) => {
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
          socket.write(`RCPT TO:<${probeEmail}>\r\n`);
          stage = 3;
        } else if (stage === 3) {
          const code = parseInt(line.slice(0, 3), 10);
          done(code === 250 || code === 251);
        }
      });
    });

    catchAllCache.set(key, accepted);
    if (accepted) {
      console.log(`[EmailVerifier][CatchAll] ${domain} is a catch-all domain`);
    }
    return accepted;
  } catch {
    catchAllCache.set(key, false);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Syntax check
// ---------------------------------------------------------------------------

function syntaxCheck(email: string): boolean {
  return /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/.test(email.trim());
}

// ---------------------------------------------------------------------------
// Single Email Verification
// ---------------------------------------------------------------------------

export async function verifyEmail(email: string): Promise<EmailVerificationResult> {
  const normalized = email.trim().toLowerCase();
  const domain = normalized.split('@')[1];

  // Step 0: Domain validation (prevent truncated domains)
  if (!domain || domain.length < 4 || !domain.includes('.') || domain.endsWith('.')) {
    return {
      email: normalized,
      valid: false,
      deliverable: false,
      catchAll: false,
      mxProvider: 'other',
      confidence: 0,
      source: 'invalid_domain',
    };
  }

  // Step 1: Syntax check
  if (!syntaxCheck(normalized)) {
    return {
      email: normalized,
      valid: false,
      deliverable: false,
      catchAll: false,
      mxProvider: 'other',
      confidence: 0,
      source: 'smtp_verified',
    };
  }

  // Step 2: MX lookup + provider detection
  let mxRecords: { exchange: string; priority: number }[];
  try {
    mxRecords = await dns.resolveMx(domain);
    if (!mxRecords || mxRecords.length === 0) {
      return {
        email: normalized,
        valid: true,
        deliverable: false,
        catchAll: false,
        mxProvider: 'other',
        confidence: 0,
        source: 'smtp_verified',
      };
    }
  } catch {
    return {
      email: normalized,
      valid: true,
      deliverable: false,
      catchAll: false,
      mxProvider: 'other',
      confidence: 0,
      source: 'smtp_verified',
    };
  }

  const mxProvider = await detectMxProvider(domain);

  // Step 3: Microsoft 365 and Google — SMTP is unreliable, use pattern-based confidence
  if (mxProvider === 'microsoft365' || mxProvider === 'google') {
    const knownPattern = getDomainPattern(domain);
    const isCatchAll = await detectCatchAll(domain);

    // Pattern match gives higher confidence; catch-all lowers it
    let confidence = knownPattern ? 75 : 50;
    if (isCatchAll) {
      confidence = Math.min(confidence, 40);
    }

    return {
      email: normalized,
      valid: true,
      deliverable: true, // Assumed deliverable since we can't SMTP-verify reliably
      catchAll: isCatchAll,
      mxProvider,
      confidence,
      source: knownPattern ? 'pattern_match' : 'catch_all_guess',
    };
  }

  // Step 4: Other providers — full SMTP probe
  const isCatchAll = await detectCatchAll(domain);
  const deliverable = await smtpProbe(normalized);

  let confidence: number;
  if (deliverable && !isCatchAll) {
    confidence = 95;
  } else if (deliverable && isCatchAll) {
    confidence = 40; // Catch-all accepts everything — low confidence
  } else {
    confidence = 10;
  }

  const source = isCatchAll ? 'catch_all_guess' : 'smtp_verified';

  return {
    email: normalized,
    valid: true,
    deliverable,
    catchAll: isCatchAll,
    mxProvider,
    confidence,
    source,
  };
}

// ---------------------------------------------------------------------------
// Permutation-based email finding
// ---------------------------------------------------------------------------

export async function findEmailByPermutation(
  permutations: string[],
  domain: string,
): Promise<EmailVerificationResult | null> {
  if (permutations.length === 0) return null;

  const MAX_CONCURRENT = 3;
  let found: EmailVerificationResult | null = null;
  let index = 0;

  const worker = async (): Promise<void> => {
    while (index < permutations.length && !found) {
      const current = index++;
      if (current >= permutations.length) break;

      // Permutations from transliterationEngine already include @domain
      const email = permutations[current].includes('@') ? permutations[current] : `${permutations[current]}@${domain}`;

      // Skip truncated TLDs (less than 2 chars after last dot)
      const emailDomain = email.split('@')[1];
      if (emailDomain) {
        const lastDotIndex = emailDomain.lastIndexOf('.');
        if (lastDotIndex === -1 || lastDotIndex === emailDomain.length - 1 || emailDomain.length - lastDotIndex - 1 < 2) {
          console.log(`[EmailVerifier][Permutation] Skipping ${email} — truncated TLD`);
          continue;
        }
      }

      console.log(`[EmailVerifier][Permutation] Trying ${email} (${current + 1}/${permutations.length})`);

      const result = await verifyEmail(email);

      // Early exit on a confident hit
      if (result.deliverable && result.confidence >= 50) {
        found = result;
        return;
      }
    }
  };

  const workerCount = Math.min(MAX_CONCURRENT, permutations.length);
  const workers = Array.from({ length: workerCount }, () => worker());
  await Promise.all(workers);

  return found;
}
