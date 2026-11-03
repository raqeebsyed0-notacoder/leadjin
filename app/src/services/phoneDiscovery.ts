/**
 * Phone Discovery Service — Layer 3
 *
 * Discovers phone numbers from company websites and verifies WhatsApp
 * availability.  Designed for Saudi B2B leads.
 *
 * Pipeline:
 *   1. Scrape /contact and /about pages for phone numbers
 *   2. Parse Schema.org / JSON-LD structured data
 *   3. Regex-extract Saudi phone patterns from raw HTML
 *   4. Optionally verify WhatsApp availability via wa.me heuristic
 *
 * Zero external dependencies — uses only built-in Node.js fetch().
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PhoneDiscoveryResult {
  phone?: string;
  phoneType: 'direct' | 'company';
  phoneSource: string;
  whatsappVerified: boolean;
  confidence: number; // 0-100
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CONTACT_PATHS = ['/contact', '/contact-us', '/about', '/about-us', '/'];

const FETCH_TIMEOUT_MS = 5_000;
const WHATSAPP_TIMEOUT_MS = 3_000;

/**
 * Saudi mobile:  +966 5X XXX XXXX   (05X locally)
 * Saudi landline: +966 1X XXX XXXX  (01X locally)  — Riyadh / other cities
 *
 * Separators: space, dash, dot, or nothing.
 */
const SAUDI_PHONE_PATTERNS: RegExp[] = [
  // International format — +966 followed by 5 (mobile) or 1 (landline) then 8 digits
  /\+966[\s.-]?([5][0-9][\s.-]?[0-9]{3}[\s.-]?[0-9]{4})/g,
  /\+966[\s.-]?([1][0-9][\s.-]?[0-9]{3}[\s.-]?[0-9]{4})/g,
  // Without plus — 966 prefix
  /(?<!\d)966[\s.-]?([5][0-9][\s.-]?[0-9]{3}[\s.-]?[0-9]{4})/g,
  /(?<!\d)966[\s.-]?([1][0-9][\s.-]?[0-9]{3}[\s.-]?[0-9]{4})/g,
  // Local format — 05X or 01X
  /(?<!\d)(0[5][0-9][\s.-]?[0-9]{3}[\s.-]?[0-9]{4})(?!\d)/g,
  /(?<!\d)(0[1][0-9][\s.-]?[0-9]{3}[\s.-]?[0-9]{4})(?!\d)/g,
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Normalize any recognized Saudi phone format to +966XXXXXXXXX (12 chars).
 */
export function normalizePhoneNumber(phone: string): string {
  // Strip everything except digits and a leading +
  let cleaned = phone.replace(/[^\d+]/g, '');

  // Remove leading +
  if (cleaned.startsWith('+')) {
    cleaned = cleaned.slice(1);
  }

  // Now cleaned is pure digits
  if (cleaned.startsWith('966') && cleaned.length === 12) {
    return `+${cleaned}`;
  }

  if (cleaned.startsWith('0') && cleaned.length === 10) {
    // 05XXXXXXXX → +9665XXXXXXXX
    return `+966${cleaned.slice(1)}`;
  }

  if (cleaned.startsWith('966') && cleaned.length > 12) {
    // Trim excess digits (e.g. Google Maps returns extra chars)
    return `+${cleaned.slice(0, 12)}`;
  }

  if (cleaned.length === 9 && (cleaned.startsWith('5') || cleaned.startsWith('1'))) {
    return `+966${cleaned}`;
  }

  // Validate: Saudi numbers should be exactly 12 digits (966 + 9 digits)
  // If we can't normalize to a valid format, return cleaned with + prefix
  // but only if it's a reasonable length (10-13 digits)
  if (cleaned.length >= 10 && cleaned.length <= 13) {
    return `+${cleaned}`;
  }

  // Too short or too long — return as-is, caller should discard
  const resultFallback = phone.trim();

  // Final validation: Saudi numbers: +966 + 9 digits = 13 chars total
  // International: allow up to +XXXXXXXXXXX (max 15 digits per E.164)
  const resultDigits = resultFallback.replace(/\D/g, '');
  if (resultDigits.length > 15 || resultDigits.length < 10) {
    return ''; // Invalid, return empty — caller should treat as "not found"
  }

  return resultFallback;
}

/**
 * Extract all Saudi phone numbers from arbitrary text.
 * Returns deduplicated, normalized results.
 */
export function extractSaudiPhones(text: string): string[] {
  const found = new Set<string>();

  for (const pattern of SAUDI_PHONE_PATTERNS) {
    // Reset lastIndex for global regex reuse
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const raw = match[0];
      try {
        const normalized = normalizePhoneNumber(raw);
        // Validate length: +966 + 9 digits = 13 chars
        // Post-filter: reject if longer than 13 or shorter than 12 digits
        const digitsOnly = normalized.replace(/\D/g, '');
        if (normalized.length === 13 && normalized.startsWith('+966') && digitsOnly.length >= 12 && digitsOnly.length <= 13) {
          found.add(normalized);
        }
      } catch {
        // Skip malformed numbers
      }
    }
  }

  return [...found];
}

/**
 * Extract structured data (JSON-LD, meta tags) from HTML.
 */
export function extractStructuredData(html: string): { phones: string[]; emails: string[] } {
  const phones: string[] = [];
  const emails: string[] = [];

  // --- JSON-LD blocks ---
  const jsonLdRegex = /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let jsonMatch: RegExpExecArray | null;

  while ((jsonMatch = jsonLdRegex.exec(html)) !== null) {
    try {
      const data = JSON.parse(jsonMatch[1]);
      const objects = Array.isArray(data) ? data : [data];

      for (const obj of objects) {
        if (obj.telephone) {
          const tel = Array.isArray(obj.telephone) ? obj.telephone : [obj.telephone];
          phones.push(...tel.map(String));
        }
        if (obj.email) {
          const em = Array.isArray(obj.email) ? obj.email : [obj.email];
          emails.push(...em.map(String));
        }
        // Check contactPoint
        if (obj.contactPoint) {
          const points = Array.isArray(obj.contactPoint) ? obj.contactPoint : [obj.contactPoint];
          for (const cp of points) {
            if (cp.telephone) phones.push(String(cp.telephone));
            if (cp.email) emails.push(String(cp.email));
          }
        }
      }
    } catch {
      // Malformed JSON-LD — skip
    }
  }

  // --- Meta tags ---
  const metaPhoneRegex = /<meta[^>]*(?:property|name)\s*=\s*["'](?:og:phone_number|contact:phone_number)["'][^>]*content\s*=\s*["']([^"']+)["'][^>]*\/?>/gi;
  let metaMatch: RegExpExecArray | null;
  while ((metaMatch = metaPhoneRegex.exec(html)) !== null) {
    phones.push(metaMatch[1]);
  }

  // Also handle reversed attribute order (content before property)
  const metaPhoneReversed = /<meta[^>]*content\s*=\s*["']([^"']+)["'][^>]*(?:property|name)\s*=\s*["'](?:og:phone_number|contact:phone_number)["'][^>]*\/?>/gi;
  while ((metaMatch = metaPhoneReversed.exec(html)) !== null) {
    phones.push(metaMatch[1]);
  }

  return { phones, emails };
}

// ---------------------------------------------------------------------------
// Network helpers
// ---------------------------------------------------------------------------

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; LeadJin/1.0)',
        Accept: 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
    });

    clearTimeout(timer);

    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  }
}

async function fetchPage(domain: string, path: string): Promise<string | null> {
  // Try HTTPS first, then HTTP
  const httpsUrl = `https://${domain}${path}`;
  const html = await fetchWithTimeout(httpsUrl, FETCH_TIMEOUT_MS);
  if (html) return html;

  const httpUrl = `http://${domain}${path}`;
  return fetchWithTimeout(httpUrl, FETCH_TIMEOUT_MS);
}

// ---------------------------------------------------------------------------
// WhatsApp verification (heuristic)
// ---------------------------------------------------------------------------

/**
 * Check if a phone number likely has WhatsApp by probing wa.me.
 * Returns true if the number appears to be registered, false otherwise.
 * This is a heuristic — not guaranteed to be accurate.
 */
export async function verifyWhatsApp(phone: string): Promise<boolean> {
  try {
    const normalized = normalizePhoneNumber(phone);
    if (!normalized) return false;

    // Strip the + for wa.me URL
    const digits = normalized.replace('+', '');

    const urlsToTry = [
      `https://wa.me/${digits}`,
      `https://wa.me/+${digits}`,
      `https://api.whatsapp.com/send?phone=${digits}`,
    ];

    for (const url of urlsToTry) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), WHATSAPP_TIMEOUT_MS);

        const response = await fetch(url, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; LeadJin/1.0)',
          },
          redirect: 'manual',
        });

        clearTimeout(timer);

        // 302 redirect means WhatsApp exists
        if (response.status === 302) return true;

        // wa.me returns 200 with content for valid numbers, 404 for invalid
        if (response.status === 404) continue;

        if (response.ok) {
          const body = await response.text();
          // If the page contains the send-message action, the number is likely active
          if (body.includes('send') || body.includes('chat') || body.includes('action')) {
            return true;
          }
        }
      } catch {
        // Try next URL
        continue;
      }
    }

    return false;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Main discovery function
// ---------------------------------------------------------------------------

/**
 * Discover a phone number for a company by scraping its website.
 *
 * @param company  Company name (used for logging / context, not for search)
 * @param domain   Company domain (e.g. "example.com.sa")
 * @returns        PhoneDiscoveryResult or null if nothing found
 */
export async function discoverPhone(
  company: string,
  domain?: string,
): Promise<PhoneDiscoveryResult | null> {
  if (!domain) return null;

  // Strip protocol if accidentally included
  const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/\/+$/, '');

  const allPhones = new Map<string, { source: string; confidence: number }>();
  let waLinksFromHtml: string[] = [];

  // --- Step 1 & 2 & 3: Scrape pages, extract structured data & regex phones ---
  for (const path of CONTACT_PATHS) {
    try {
      const html = await fetchPage(cleanDomain, path);
      if (!html) continue;

      // Collect WhatsApp links from HTML
      const pageWaLinks = html.match(/https?:\/\/wa\.me\/\+?\d{10,15}/gi);
      if (pageWaLinks && pageWaLinks.length > 0) {
        waLinksFromHtml.push(...pageWaLinks);
      }

      // Step 2: Structured data (highest confidence)
      const structured = extractStructuredData(html);
      for (const rawPhone of structured.phones) {
        const saudiPhones = extractSaudiPhones(rawPhone);
        for (const p of saudiPhones) {
          if (!allPhones.has(p) || allPhones.get(p)!.confidence < 85) {
            allPhones.set(p, {
              source: `structured-data:${path}`,
              confidence: 85,
            });
          }
        }
      }

      // Step 3: Regex from raw HTML
      const regexPhones = extractSaudiPhones(html);
      for (const p of regexPhones) {
        if (!p) continue; // skip invalid normalizations
        if (!allPhones.has(p)) {
          // /contact page → higher confidence than /about or /
          const confidence = path.includes('contact') ? 75 : 60;
          allPhones.set(p, { source: `html-regex:${path}`, confidence });
        }
      }
    } catch {
      // Skip failed pages
      continue;
    }
  }

  if (allPhones.size === 0) return null;

  // Filter out any invalid (empty) normalized phones
  for (const [phone, _meta] of allPhones.entries()) {
    if (!phone || phone === '') {
      allPhones.delete(phone);
    }
  }

  if (allPhones.size === 0) return null;

  // Pick the phone with highest confidence
  let bestPhone = '';
  let bestMeta = { source: '', confidence: 0 };

  for (const [phone, meta] of allPhones.entries()) {
    if (meta.confidence > bestMeta.confidence) {
      bestPhone = phone;
      bestMeta = meta;
    }
  }

  // Determine type: 5XX = mobile (more likely direct), 1XX = landline (company)
  const digits = bestPhone.replace('+966', '');
  const phoneType: 'direct' | 'company' = digits.startsWith('5') ? 'direct' : 'company';

  // WhatsApp check: if a wa.me link on the website matches this phone, it's verified
  const bestPhoneDigits = bestPhone.replace(/\D/g, '');
  let whatsappVerified = false;
  if (waLinksFromHtml.length > 0) {
    const matchedWa = waLinksFromHtml.some(link => {
      const linkDigits = link.replace(/\D/g, '');
      return linkDigits === bestPhoneDigits;
    });
    if (matchedWa) {
      whatsappVerified = true;
    }
  }

  // Also probe wa.me for mobile numbers if not already verified
  if (!whatsappVerified && phoneType === 'direct') {
    try {
      whatsappVerified = await verifyWhatsApp(bestPhone);
    } catch {
      whatsappVerified = false;
    }
  }

  // Mobile numbers get higher WhatsApp confidence boost
  const waBoost = whatsappVerified ? (phoneType === 'direct' ? 15 : 10) : 0;
  const finalConfidence = Math.min(100, bestMeta.confidence + waBoost);

  return {
    phone: bestPhone,
    phoneType,
    phoneSource: bestMeta.source,
    whatsappVerified,
    confidence: finalConfidence,
  };
}
