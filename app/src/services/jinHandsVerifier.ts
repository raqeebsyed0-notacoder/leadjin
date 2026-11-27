/**
 * Module 3: The Employee's Hands (Triple-Check Verification)
 * 
 * Jin's verification engine - performs sovereign-grade verification:
 * 1. SMTP Handshake - Verify email deliverability
 * 2. HLR-style Phone Check - Verify mobile number validity
 * 3. Regional HQ Cross-reference - Verify company location
 * 
 * Jin only "signs off" on data when all three checks pass.
 */

import { randomUUID } from 'crypto';
import { addVerificationProof, type VerificationProof } from './jinLedger.js';
import Database from 'better-sqlite3';
import {
  overallStatus as computeOverallStatus,
  recordVerification,
  type StageVerdict,
  type VerificationStatus,
} from './verificationRecord.js';

// Verification result types
export interface SMTPVerificationResult {
  email: string;
  deliverable: boolean;
  mailboxExists: boolean;
  catchAll: boolean;
  mxRecords: string[];
  smtpResponse: string;
  verifiedAt: string;
  confidence: number; // 0-100
  status: VerificationStatus;
  reason: string;
}

export interface PhoneVerificationResult {
  phone: string;
  valid: boolean;
  countryCode: string;
  carrier?: string;
  lineType?: 'mobile' | 'landline' | 'voip' | 'unknown';
  reachable: boolean;
  verifiedAt: string;
  confidence: number;
  status: VerificationStatus;
  reason: string;
}

export interface LocationVerificationResult {
  domain: string;
  companyName: string;
  headquarters: string;
  coordinates?: { lat: number; lng: number };
  verifiedAddress: boolean;
  regionalMatch: boolean; // Matches claimed Saudi/regional location
  nearbyLandmarks?: string[];
  verifiedAt: string;
  confidence: number;
  status: VerificationStatus;
  reason: string;
}

export interface TripleCheckResult {
  stakeholderId: string;
  email: SMTPVerificationResult | null;
  phone: PhoneVerificationResult | null;
  location: LocationVerificationResult | null;
  overallStatus: VerificationStatus;
  verificationScore: number; // 0-100
  signedOffBy: 'jin_automated' | 'jin_assisted';
  signedOffAt: string;
  stageResults: StageVerdict[];
}

// In-memory cache for verification results (1 hour TTL)
const verificationCache = new Map<string, { result: any; expires: number }>();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

/**
 * Clean up expired cache entries
 */
function getCachedVerification<T>(key: string): T | null {
  const cached = verificationCache.get(key);
  if (cached && cached.expires > Date.now()) {
    return cached.result as T;
  }
  if (cached) verificationCache.delete(key);
  return null;
}

function setCachedVerification(key: string, result: any): void {
  verificationCache.set(key, { result, expires: Date.now() + CACHE_TTL });
}

/**
 * SMTP Verification with detailed logging
 * Performs actual SMTP handshake to verify email deliverability
 */
export async function verifyEmailSMTP(
  email: string,
  db?: Database.Database
): Promise<SMTPVerificationResult> {
  const cacheKey = `smtp:${email.toLowerCase()}`;
  const cached = getCachedVerification<SMTPVerificationResult>(cacheKey);
  if (cached) return cached;

  const dns = await import('dns/promises');
  const net = await import('net');

  const result: SMTPVerificationResult = {
    email,
    deliverable: false,
    mailboxExists: false,
    catchAll: false,
    mxRecords: [],
    smtpResponse: '',
    verifiedAt: new Date().toISOString(),
    confidence: 0,
    status: 'unverified',
    reason: 'smtp_not_attempted'
  };

  try {
    // Extract domain
    const domain = email.split('@')[1];
    if (!domain) {
      result.smtpResponse = 'Invalid email format';
      result.status = 'invalid';
      result.reason = 'invalid_email_format';
      return result;
    }

    // Get MX records
    const mxRecords = await dns.resolveMx(domain);
    if (!mxRecords || mxRecords.length === 0) {
      result.smtpResponse = 'No MX records found';
      result.status = 'unverified';
      result.reason = 'no_mx_records';
      return result;
    }

    result.mxRecords = mxRecords.map(r => r.exchange);
    mxRecords.sort((a, b) => a.priority - b.priority);

    // Attempt SMTP connection
    const mxHost = mxRecords[0].exchange;
    
    const smtpResult = await new Promise<{
      deliverable: boolean;
      catchAll: boolean;
      response: string;
    }>((resolve) => {
      const socket = net.createConnection(25, mxHost);
      let stage = 0;
      let resolved = false;
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          socket.destroy();
          resolve({ deliverable: false, catchAll: false, response: 'Connection timeout' });
        }
      }, 10000);

      const responses: string[] = [];

      socket.on('data', (data) => {
        const line = data.toString();
        responses.push(line.trim());

        if (stage === 0 && line.startsWith('220')) {
          socket.write(`EHLO verify.leadjin.ai\r\n`);
          stage = 1;
        } else if (stage === 1 && line.includes('250')) {
          socket.write(`MAIL FROM:<verify@leadjin.ai>\r\n`);
          stage = 2;
        } else if (stage === 2 && line.startsWith('250')) {
          socket.write(`RCPT TO:<${email}>\r\n`);
          stage = 3;
        } else if (stage === 3) {
          clearTimeout(timeout);
          const code = parseInt(line.slice(0, 3));
          
          // 250 = success, 251 = will forward, 550/551/552 = user unknown
          const deliverable = code === 250 || code === 251;
          const userUnknown = code === 550 || code === 551 || code === 552;
          
          if (!resolved) {
            resolved = true;
            socket.destroy();
            resolve({
              deliverable,
              catchAll: false, // Would need additional testing to detect
              response: line.trim()
            });
          }
        }
      });

      socket.on('error', (err) => {
        clearTimeout(timeout);
        if (!resolved) {
          resolved = true;
          resolve({
            deliverable: false,
            catchAll: false,
            response: `Error: ${err.message}`
          });
        }
      });

      socket.on('timeout', () => {
        clearTimeout(timeout);
        if (!resolved) {
          resolved = true;
          socket.destroy();
          resolve({
            deliverable: false,
            catchAll: false,
            response: 'Socket timeout'
          });
        }
      });
    });

    result.deliverable = smtpResult.deliverable;
    result.catchAll = smtpResult.catchAll;
    result.smtpResponse = smtpResult.response;
    result.mailboxExists = smtpResult.deliverable;

    // Only a real SMTP response can produce a conclusive status.
    const smtpCode = Number(smtpResult.response.match(/^(\d{3})/)?.[1] ?? 0);
    const verdict: { status: VerificationStatus; reason: string } =
      smtpResult.deliverable && smtpCode === 251
        ? { status: 'catch_all', reason: 'smtp_rcpt_forwarded_251' }
        : smtpResult.deliverable && smtpCode === 250
          ? { status: 'verified', reason: 'smtp_rcpt_250_accepted' }
          : [550, 551, 552].includes(smtpCode) || /user unknown/i.test(smtpResult.response)
            ? { status: 'invalid', reason: 'smtp_recipient_rejected' }
            : smtpCode >= 400 && smtpCode < 500
              ? { status: 'risky', reason: 'smtp_temporary_failure' }
              : { status: 'unverified', reason: `smtp_inconclusive: ${smtpResult.response}` };
    result.status = verdict.status;
    result.reason = verdict.reason;

    // Confidence tracks the verdict, not wishful thinking.
    const confidenceByStatus: Record<VerificationStatus, number> = {
      verified: 95,
      partially_verified: 70,
      risky: 50,
      catch_all: 40,
      invalid: 90,
      unverified: 0,
    };
    result.confidence = confidenceByStatus[result.status];

    // Log a proof only when a real provider response backs the claim.
    if (db && result.status === 'verified') {
      const proof: VerificationProof = {
        stakeholder_id: `email:${email}`,
        verification_type: 'email_smtp',
        proof_data: {
          method: 'SMTP_HANDSHAKE',
          timestamp: result.verifiedAt,
          source: mxHost,
          confidence: result.confidence,
          verification_details: {
            mx_records: result.mxRecords,
            smtp_response: result.smtpResponse,
            deliverable: result.deliverable
          }
        },
        verified_by: 'jin_automated'
      };
      addVerificationProof(db, proof);
    }

    setCachedVerification(cacheKey, result);
    return result;

  } catch (error: any) {
    result.smtpResponse = `Error: ${error.message}`;
    result.status = 'unverified';
    result.reason = `smtp_lookup_error: ${error.message}`;
    result.confidence = 0;
    return result;
  }
}

/**
 * HLR-style Phone Verification (STUB -> unverified).
 * In production, this would integrate with telecom HLR lookup APIs
 * For now, we use pattern validation and format checking
 */
export async function verifyPhoneHLR(
  phone: string,
  db?: Database.Database
): Promise<PhoneVerificationResult> {
  const cacheKey = `phone:${phone}`;
  const cached = getCachedVerification<PhoneVerificationResult>(cacheKey);
  if (cached) return cached;

  const result: PhoneVerificationResult = {
    phone,
    valid: false,
    countryCode: '',
    reachable: false,
    verifiedAt: new Date().toISOString(),
    confidence: 0,
    status: 'unverified',
    reason: 'hlr_lookup_not_configured'
  };

  try {
    // Normalize phone number
    let normalized = phone.replace(/[\s\-\(\)\.]/g, '');
    
    // Check for Saudi numbers (+966 or 05...)
    if (normalized.startsWith('+966')) {
      result.countryCode = 'SA';
      normalized = normalized.slice(4);
    } else if (normalized.startsWith('966')) {
      result.countryCode = 'SA';
      normalized = normalized.slice(3);
    } else if (normalized.startsWith('05')) {
      result.countryCode = 'SA';
      normalized = normalized.slice(1); // Remove leading 0
    } else if (normalized.startsWith('+971')) {
      result.countryCode = 'AE'; // UAE
      normalized = normalized.slice(4);
    } else if (normalized.startsWith('+973')) {
      result.countryCode = 'BH'; // Bahrain
      normalized = normalized.slice(4);
    } else if (normalized.startsWith('+974')) {
      result.countryCode = 'QA'; // Qatar
      normalized = normalized.slice(4);
    } else if (normalized.startsWith('+965')) {
      result.countryCode = 'KW'; // Kuwait
      normalized = normalized.slice(4);
    } else if (normalized.startsWith('+968')) {
      result.countryCode = 'OM'; // Oman
      normalized = normalized.slice(4);
    }

    // Validate length based on country — this is FORMAT evidence only, never HLR.
    const validLengths: Record<string, number> = {
      'SA': 9,  // Saudi
      'AE': 9,  // UAE
      'BH': 8,  // Bahrain
      'QA': 8,  // Qatar
      'KW': 8,  // Kuwait
      'OM': 8   // Oman
    };

    const expectedLength = validLengths[result.countryCode];
    const formatValid = !!expectedLength && normalized.length === expectedLength;
    result.valid = formatValid;

    if (formatValid) {
      // Prefix heuristics retained as enrichment metadata only (carrier guess).
      if (result.countryCode === 'SA') {
        const prefix = normalized.substring(0, 2);
        const mobilePrefixes = ['50', '53', '54', '55', '56', '57', '58', '59'];
        result.lineType = mobilePrefixes.includes(prefix) ? 'mobile' : 'landline';
        if (prefix.startsWith('5')) {
          if (['50', '51', '52'].includes(prefix)) result.carrier = 'STC';
          else if (['53', '54'].includes(prefix)) result.carrier = 'Mobily';
          else if (['55', '56', '57', '58', '59'].includes(prefix)) result.carrier = 'Zain';
        }
      } else {
        result.lineType = 'unknown';
      }
    }

    // No real HLR provider is configured: no reachability claim, no proof row.
    result.reachable = false;
    result.confidence = 0;
    const verdict: { status: VerificationStatus; reason: string } = formatValid
      ? { status: 'unverified', reason: 'hlr_lookup_not_configured' }
      : { status: 'invalid', reason: 'phone_format_invalid' };
    result.status = verdict.status;
    result.reason = verdict.reason;

    setCachedVerification(cacheKey, result);
    return result;

  } catch (error: any) {
    result.valid = false;
    result.reachable = false;
    result.confidence = 0;
    result.status = 'unverified';
    result.reason = `hlr_lookup_error: ${error.message}`;
    return result;
  }
}

/**
 * Regional HQ Location Verification (STUB -> unverified by default).
 * The original module did a city-name string match; that is not geocoding and
 * not a registry lookup, so it cannot substantiate a `verified` address.
 */
export async function verifyRegionalHQ(
  domain: string,
  companyName: string,
  claimedLocation: string,
  apiKey?: string
): Promise<LocationVerificationResult> {
  const cacheKey = `location:${domain}:${claimedLocation}`;
  const cached = getCachedVerification<LocationVerificationResult>(cacheKey);
  if (cached) return cached;

  const result: LocationVerificationResult = {
    domain,
    companyName,
    headquarters: claimedLocation,
    verifiedAddress: false,
    regionalMatch: false,
    verifiedAt: new Date().toISOString(),
    confidence: 0,
    status: 'unverified',
    reason: 'regional_hq_lookup_not_configured'
  };

  try {
    // For now, use pattern matching for Saudi/regional locations
    // In production, integrate with Google Places API or similar
    
    const saudiCities = [
      'Riyadh', 'Jeddah', 'Mecca', 'Medina', 'Dammam', 'Khobar', 'Dhahran',
      'Tabuk', 'Abha', 'Taif', 'Buraidah', 'Khamis Mushait', 'Hail', 'Najran',
      'Yanbu', 'Jubail', 'Qatif', ' Hofuf', 'Kharj'
    ];
    
    const uaeCities = ['Dubai', 'Abu Dhabi', 'Sharjah', 'Ajman', 'Ras Al Khaimah', 'Fujairah'];
    const bahrainCities = ['Manama', 'Riffa', 'Muharraq'];
    const qatarCities = ['Doha', 'Al Rayyan', 'Al Wakrah'];
    const kuwaitCities = ['Kuwait City', 'Hawalli', 'Salmiya'];
    const omanCities = ['Muscat', 'Salalah', 'Sohar'];
    
    const allRegionalCities = [...saudiCities, ...uaeCities, ...bahrainCities, ...qatarCities, ...kuwaitCities, ...omanCities];
    
    // Check if claimed location contains any regional city
    const locationLower = claimedLocation.toLowerCase();
    const matchedCity = allRegionalCities.find(city => 
      locationLower.includes(city.toLowerCase())
    );
    
    if (matchedCity) {
      // String match is a signal about the input, not external verification.
      result.regionalMatch = true;
      result.verifiedAddress = false;
      result.confidence = 0;

      // Determine nearby landmarks based on city
      if (saudiCities.includes(matchedCity)) {
        if (matchedCity === 'Riyadh') {
          result.nearbyLandmarks = ['King Abdullah Financial District', 'Riyadh Front', 'Kingdom Centre'];
        } else if (matchedCity === 'Jeddah') {
          result.nearbyLandmarks = ['Jeddah Economic City', 'King Abdullah Street', 'Al Andalus District'];
        } else if (matchedCity === 'Dammam' || matchedCity === 'Khobar' || matchedCity === 'Dhahran') {
          result.nearbyLandmarks = ['King Fahd Road', 'Dammam Corniche', 'Aramco HQ'];
        }
      }
    } else {
      result.regionalMatch = false;
      result.confidence = 0;
    }

    const verdict: { status: VerificationStatus; reason: string } = {
      status: 'unverified',
      reason: matchedCity
        ? 'regional_hq_lookup_not_configured'
        : 'regional_city_not_recognized',
    };
    result.status = verdict.status;
    result.reason = verdict.reason;

    setCachedVerification(cacheKey, result);
    return result;

  } catch (error: any) {
    result.verifiedAddress = false;
    result.confidence = 0;
    result.status = 'unverified';
    result.reason = `regional_hq_lookup_error: ${error.message}`;
    return result;
  }
}

/**
 * Perform Triple-Check Verification
 * Runs all three verification methods and returns comprehensive result
 */
export async function performTripleCheck(
  stakeholderId: string,
  email: string | undefined,
  phone: string | undefined,
  domain: string,
  companyName: string,
  claimedLocation: string,
  db?: Database.Database
): Promise<TripleCheckResult> {
  console.log(`[Jin:Hands] Starting triple-check for ${stakeholderId}`);

  const result: TripleCheckResult = {
    stakeholderId,
    email: null,
    phone: null,
    location: null,
    overallStatus: 'unverified',
    verificationScore: 0,
    signedOffBy: 'jin_automated',
    signedOffAt: new Date().toISOString(),
    stageResults: []
  };

  // Run verifications in parallel where possible
  const verifications: Promise<void>[] = [];

  if (email) {
    verifications.push(
      verifyEmailSMTP(email, db).then(emailResult => {
        result.email = emailResult;
      })
    );
  }

  if (phone) {
    verifications.push(
      verifyPhoneHLR(phone, db).then(phoneResult => {
        result.phone = phoneResult;
      })
    );
  }

  if (claimedLocation) {
    verifications.push(
      verifyRegionalHQ(domain, companyName, claimedLocation).then(locationResult => {
        result.location = locationResult;
      })
    );
  }

  await Promise.all(verifications);

  // Stage evidence — every stage, including skipped ones, gets a status + reason.
  const stages: StageVerdict[] = [];
  stages.push(result.email
    ? {
        stage: 'email_smtp',
        status: result.email.status,
        reason: result.email.reason,
        method: 'SMTP_HANDSHAKE',
        confidence: result.email.confidence,
        evidence: {
          mx_records: result.email.mxRecords,
          smtp_response: result.email.smtpResponse,
          deliverable: result.email.deliverable,
          catch_all: result.email.catchAll,
        },
      }
    : { stage: 'email_smtp', status: 'unverified', reason: 'not_provided', method: 'SMTP_HANDSHAKE', confidence: 0 });
  stages.push(result.phone
    ? {
        stage: 'phone_hlr',
        status: result.phone.status,
        reason: result.phone.reason,
        method: 'HLR_STYLE_LOOKUP',
        confidence: result.phone.confidence,
        evidence: {
          country_code: result.phone.countryCode,
          line_type: result.phone.lineType,
          carrier_guess: result.phone.carrier,
          format_valid: result.phone.valid,
        },
      }
    : { stage: 'phone_hlr', status: 'unverified', reason: 'not_provided', method: 'HLR_STYLE_LOOKUP', confidence: 0 });
  stages.push(result.location
    ? {
        stage: 'regional_hq',
        status: result.location.status,
        reason: result.location.reason,
        method: 'REGIONAL_HQ_PATTERN',
        confidence: result.location.confidence,
        evidence: {
          headquarters: result.location.headquarters,
          regional_match: result.location.regionalMatch,
          verified_address: result.location.verifiedAddress,
        },
      }
    : { stage: 'regional_hq', status: 'unverified', reason: 'not_provided', method: 'REGIONAL_HQ_PATTERN', confidence: 0 });

  // Weakest conclusive stage wins; a stubbed stage caps overall at partially_verified.
  const verdictStatus = computeOverallStatus(stages);
  const overall: { status: VerificationStatus; reason: string } =
    verdictStatus === 'partially_verified'
      ? { status: 'partially_verified', reason: 'weakest_stage_or_missing_provider' }
      : verdictStatus === 'verified'
        ? { status: 'verified', reason: 'all_stages_conclusive' }
        : { status: verdictStatus, reason: 'weakest_conclusive_stage' };
  result.overallStatus = overall.status;
  result.stageResults = stages;

  // Status-weighted score (stub stages contribute zero).
  const weightByStatus: Record<VerificationStatus, number> = {
    verified: 100,
    partially_verified: 70,
    catch_all: 50,
    risky: 40,
    invalid: 0,
    unverified: 0,
  };
  result.verificationScore = Math.round(
    stages.reduce((sum, s) => sum + weightByStatus[s.status], 0) / stages.length
  );

  // Persistent evidence on EVERY call. `db` is optional: verificationRecord
  // falls back to a configured/injected app DB and never throws if absent.
  for (const s of stages) {
    recordVerification(db, {
      lead_id: stakeholderId,
      email: email ?? null,
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
    lead_id: stakeholderId,
    email: email ?? null,
    stage: 'overall',
    method: 'WEAKEST_STAGE',
    status: overall.status,
    confidence: result.verificationScore,
    evidence_json: {
      reason: overall.reason,
      stages: stages.map(s => ({ stage: s.stage, status: s.status, reason: s.reason })),
    },
    reason: overall.reason,
  });

  console.log(`[Jin:Hands] Triple-check complete: ${result.overallStatus} (Score: ${result.verificationScore})`);

  return result;
}

/**
 * Batch verification for multiple stakeholders
 */
export async function batchVerifyStakeholders(
  stakeholders: Array<{
    id: string;
    email?: string;
    phone?: string;
    domain: string;
    companyName: string;
    location?: string;
  }>,
  db?: Database.Database,
  concurrency: number = 3
): Promise<TripleCheckResult[]> {
  const results: TripleCheckResult[] = [];
  
  for (let i = 0; i < stakeholders.length; i += concurrency) {
    const batch = stakeholders.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(s => performTripleCheck(
        s.id,
        s.email,
        s.phone,
        s.domain,
        s.companyName,
        s.location || '',
        db
      ))
    );
    results.push(...batchResults);
  }

  return results;
}

/**
 * Get verification statistics
 */
export function getVerificationStats(db: Database.Database): {
  totalVerifications: number;
  verifiedCount: number;
  partialCount: number;
  unverifiedCount: number;
  byType: Record<string, number>;
} {
  const total = (db.prepare('SELECT COUNT(*) as c FROM verification_proof').get() as any).c || 0;
  
  const byType = db.prepare(`
    SELECT verification_type, COUNT(*) as c 
    FROM verification_proof 
    GROUP BY verification_type
  `).all() as any[];

  return {
    totalVerifications: total,
    verifiedCount: 0, // Would need to join with stakeholder data
    partialCount: 0,
    unverifiedCount: 0,
    byType: byType.reduce((acc, row) => {
      acc[row.verification_type] = row.c;
      return acc;
    }, {} as Record<string, number>)
  };
}
