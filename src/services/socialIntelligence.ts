/**
 * Social Intelligence Service
 *
 * Primary discovery layer for LeadJin's enrichment engine.
 * Mines X/Twitter, TikTok, and Snapchat bios to find email, phone,
 * WhatsApp, and LinkedIn URLs for Saudi B2B leads.
 *
 * Uses Gemini 2.5 Flash with Google Search grounding to search across
 * social platforms in a single query (Arabic + English).
 *
 * PRIVACY RULE: Personal social handles are used during mining but are
 * NOT included in the return type. Only company handles are returned.
 */

import { GoogleGenAI } from "@google/genai";
import { getGenAI } from "./genaiClient.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SocialIntelligenceResult {
  email?: string;
  phone?: string;
  whatsappLink?: string;
  linkedinUrl?: string;
  companyXHandle?: string;
  companySnapchat?: string;
  companyTiktok?: string;
  sources: string[]; // which platforms contributed data
}

export interface ExtractedContacts {
  emails: string[];
  phones: string[];
  waLinks: string[];
  linkedinUrls: string[];
}

// ---------------------------------------------------------------------------
// Regex patterns
// ---------------------------------------------------------------------------

// Saudi phone: +966 5XX XXX XXXX, 05XXXXXXXX, +966-5XX-XXX-XXXX, 966XXXXXXXXX
const SAUDI_PHONE_RE =
  /(?:\+?966[\s\-.]?5\d{2}[\s\-.]?\d{3}[\s\-.]?\d{4}|05\d{8})/g;

// WhatsApp links: wa.me/XXXXX, api.whatsapp.com/send?phone=XXXXX
const WHATSAPP_LINK_RE =
  /https?:\/\/(?:wa\.me\/\+?\d{7,15}|api\.whatsapp\.com\/send\?phone=\+?\d{7,15})/gi;

// Standard email
const EMAIL_RE =
  /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;

// LinkedIn profile URLs (handles www.linkedin.com, linkedin.com, sa.linkedin.com, etc.)
const LINKEDIN_RE =
  /https?:\/\/(?:[a-z]{2}\.)?linkedin\.com\/in\/[a-zA-Z0-9\-_%]+\/?/gi;

// Strict validator for extracted LinkedIn URLs
const LINKEDIN_VALIDATOR = /linkedin\.com\/in\/[a-zA-Z0-9\-]+/i;

// Social handle patterns used during mining (not returned for personal handles)
const X_HANDLE_RE = /(?:twitter\.com|x\.com)\/([a-zA-Z0-9_]{1,15})/gi;
const SNAPCHAT_RE = /(?:snapchat\.com\/add\/|snap:\s*)([a-zA-Z0-9._\-]+)/gi;
const TIKTOK_RE = /(?:tiktok\.com\/@)([a-zA-Z0-9._]+)/gi;

// ---------------------------------------------------------------------------
// Contact extraction (regex-based, works on any bio/text)
// ---------------------------------------------------------------------------

export function extractContactsFromBioText(text: string): ExtractedContacts {
  if (!text) {
    return { emails: [], phones: [], waLinks: [], linkedinUrls: [] };
  }

  const emails = dedupe(text.match(EMAIL_RE) ?? []);
  const phones = dedupe(text.match(SAUDI_PHONE_RE) ?? []);
  const waLinks = dedupe(text.match(WHATSAPP_LINK_RE) ?? []);
  const linkedinUrls = dedupe(text.match(LINKEDIN_RE) ?? []);

  return { emails, phones, waLinks, linkedinUrls };
}

// ---------------------------------------------------------------------------
// Main mining function
// ---------------------------------------------------------------------------

export async function mineSocialProfiles(
  name: string,
  company: string,
  domain?: string,
): Promise<SocialIntelligenceResult> {
  const emptyResult: SocialIntelligenceResult = { sources: [] };

  const ai = getGenAI();

  const domainHint = domain ? `Their website is ${domain}.` : "";

  // Single Gemini query that searches all platforms + company website for PERSONAL contact info
  const prompt = `Search the internet to find PERSONAL contact details for this specific person at a Saudi company.

TARGET PERSON: ${name}
COMPANY: ${company}
${domainHint}

CRITICAL: I need the PERSONAL/DIRECT email for ${name} — NOT generic emails like info@, hr@, media@, support@, complaints@. I want their individual work email (e.g. firstname.lastname@${domain || 'company.com'}).

SEARCH STRATEGY (do ALL of these):
1. Search X/Twitter for "${name}" + "${company}" — check their personal bio for email/phone/LinkedIn
2. Search the company website team/about/leadership page for ${name}'s direct contact
3. Search LinkedIn for "${name}" at "${company}" in Saudi Arabia
4. Search Google for "${name}" "${company}" email OR phone OR contact
5. Search TikTok and Snapchat for ${company}'s official business accounts
6. Try Arabic name variants too: search in Arabic for the same person/company
7. Search Google Maps for "${company}" phone number in Saudi Arabia

For emails: PRIORITIZE personal work emails (firstname.lastname@domain) over generic ones (info@, contact@).
For phones: Include Google Maps business phone if found. Also check for WhatsApp/wa.me links.

Return results in this exact format:

PLATFORM: [x/tiktok/snapchat/linkedin/website/google-maps]
TYPE: [personal/company]
HANDLE: [@handle or URL]
BIO_CONTACTS: [any emails, phones, wa.me links, linkedin URLs found]
SOURCE_URL: [direct URL to profile or page]
---

SUMMARY:
PERSONAL_EMAIL: [direct email for ${name} or NOT_FOUND]
COMPANY_EMAIL: [generic company email as fallback or NOT_FOUND]
BEST_PHONE: [phone or NOT_FOUND]
BEST_WHATSAPP: [wa.me link or NOT_FOUND]
BEST_LINKEDIN: [linkedin URL for ${name} or NOT_FOUND]
COMPANY_X: [@handle or NOT_FOUND]
COMPANY_SNAPCHAT: [@handle or NOT_FOUND]
COMPANY_TIKTOK: [@handle or NOT_FOUND]`;

  const MAX_RETRIES = 2;
  let attempt = 0;

  while (attempt <= MAX_RETRIES) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000); // 60s max

    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
          tools: [{ googleSearch: {} }],
          temperature: 0,
        } as any,
        signal: controller.signal,
      } as any);

      clearTimeout(timeout);

      const text = response.text || "";

      if (!text || text.length < 20) {
        console.warn("[SocialIntelligence] Empty response from Gemini");
        if (attempt < MAX_RETRIES) {
          attempt++;
          console.log(`[SocialIntelligence] Retry ${attempt}/${MAX_RETRIES} for ${name} at ${company}`);
          await new Promise(r => setTimeout(r, 2000));
          continue;
        }
        return emptyResult;
      }

      const parsed = parseGeminiResponse(text);

      // LinkedIn fallback via DuckDuckGo if Gemini didn't find one
      if (!parsed.linkedinUrl && name && company) {
        try {
          const ddgUrl = `https://html.duckduckgo.com/html/?q=site:linkedin.com/in+"${encodeURIComponent(name)}"+"${encodeURIComponent(company)}"`;
          const ddgRes = await fetch(ddgUrl, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(5000) });
          const ddgHtml = await ddgRes.text();
          const ddgMatch = ddgHtml.match(/https?:\/\/(?:[a-z]{2}\.)?linkedin\.com\/in\/[a-zA-Z0-9\-_%]+/i);
          if (ddgMatch && LINKEDIN_VALIDATOR.test(ddgMatch[0])) {
            parsed.linkedinUrl = ddgMatch[0].replace(/[.,;]+$/, '');
            console.log(`[SocialIntelligence] LinkedIn fallback found for ${name}: ${parsed.linkedinUrl}`);
          }
        } catch (ddgErr: any) {
          console.warn(`[SocialIntelligence] DuckDuckGo fallback failed: ${ddgErr.message}`);
        }
      }

      return parsed;
    } catch (err: any) {
      clearTimeout(timeout);

      const isTimeout = err.name === 'AbortError' || err.message?.toLowerCase().includes('timeout');
      const isRetryable = isTimeout || err.message?.toLowerCase().includes('empty');
      const isAuthError = err.message?.toLowerCase().includes('api key') || err.message?.toLowerCase().includes('auth') || err.message?.toLowerCase().includes('quota');

      if (isRetryable && attempt < MAX_RETRIES && !isAuthError) {
        attempt++;
        console.log(`[SocialIntelligence] Retry ${attempt}/${MAX_RETRIES} for ${name} at ${company}`);
        await new Promise(r => setTimeout(r, 2000));
        continue;
      }

      console.error("[SocialIntelligence] Gemini query failed:", err.message);
      return emptyResult;
    }
  }

  return emptyResult;
}

// ---------------------------------------------------------------------------
// Response parser
// ---------------------------------------------------------------------------

function parseGeminiResponse(text: string): SocialIntelligenceResult {
  const sources: string[] = [];
  const result: SocialIntelligenceResult = { sources };

  // Extract all contacts from the full response text as a fallback
  const allContacts = extractContactsFromBioText(text);

  // Parse the SUMMARY block if present
  const summaryMatch = text.match(/SUMMARY[\s\S]*/i);
  const summaryBlock = summaryMatch ? summaryMatch[0] : text;

  // Best email — prioritize personal over generic
  const GENERIC_PREFIXES = /^(info|contact|support|hr|media|complaints|sales|admin|hello|enquiry|inquiry|webmaster|office|reception)@/i;

  const personalEmailMatch = summaryBlock.match(/PERSONAL_EMAIL:\s*(.+)/i);
  const companyEmailMatch = summaryBlock.match(/COMPANY_EMAIL:\s*(.+)/i);

  // Try personal email first
  if (personalEmailMatch) {
    const extracted = personalEmailMatch[1].trim().match(EMAIL_RE);
    if (extracted?.[0] && !GENERIC_PREFIXES.test(extracted[0])) {
      result.email = fixTruncatedDomain(extracted[0]);
    }
  }
  // Fall back to company email
  if (!result.email && companyEmailMatch) {
    const extracted = companyEmailMatch[1].trim().match(EMAIL_RE);
    if (extracted?.[0]) {
      result.email = fixTruncatedDomain(extracted[0]);
    }
  }
  // Fall back to any email found in text, preferring non-generic
  if (!result.email && allContacts.emails.length > 0) {
    const personal = allContacts.emails.find(e => !GENERIC_PREFIXES.test(e));
    result.email = fixTruncatedDomain(personal || allContacts.emails[0]);
  }

  // Best phone
  const phoneMatch = summaryBlock.match(/BEST_PHONE:\s*(.+)/i);
  if (phoneMatch) {
    const extracted = phoneMatch[1].trim().match(SAUDI_PHONE_RE);
    if (extracted?.[0]) {
      result.phone = normalizePhone(extracted[0]);
    }
  }
  if (!result.phone && allContacts.phones.length > 0) {
    result.phone = normalizePhone(allContacts.phones[0]);
  }

  // Best WhatsApp
  const waMatch = summaryBlock.match(/BEST_WHATSAPP:\s*(.+)/i);
  if (waMatch) {
    const extracted = waMatch[1].trim().match(WHATSAPP_LINK_RE);
    if (extracted?.[0]) {
      result.whatsappLink = extracted[0];
    }
  }
  if (!result.whatsappLink && allContacts.waLinks.length > 0) {
    result.whatsappLink = allContacts.waLinks[0];
  }

  // Best LinkedIn — search ENTIRE text, not just summary block
  const linkedinMatch = summaryBlock.match(/BEST_LINKEDIN:\s*(.+)/i);
  if (linkedinMatch) {
    const extracted = linkedinMatch[1].trim().match(LINKEDIN_RE);
    if (extracted?.[0] && LINKEDIN_VALIDATOR.test(extracted[0])) {
      result.linkedinUrl = extracted[0].replace(/[.,;]+$/, ''); // strip trailing punctuation
    }
  }
  if (!result.linkedinUrl && allContacts.linkedinUrls.length > 0) {
    const firstValid = allContacts.linkedinUrls.find(u => LINKEDIN_VALIDATOR.test(u));
    if (firstValid) {
      result.linkedinUrl = firstValid.replace(/[.,;]+$/, '');
    }
  }
  // Fallback: scan full text for any linkedin.com/in/ URL (handles line breaks)
  if (!result.linkedinUrl) {
    const fullTextFallback = text.replace(/\s+/g, ' ').match(LINKEDIN_RE);
    if (fullTextFallback && fullTextFallback.length > 0) {
      const firstValid = fullTextFallback.find(u => LINKEDIN_VALIDATOR.test(u));
      if (firstValid) {
        result.linkedinUrl = firstValid.replace(/[.,;]+$/, '');
      }
    }
  }

  // Company X handle (only company, not personal — privacy rule)
  const companyXMatch = summaryBlock.match(/COMPANY_X:\s*(.+)/i);
  if (companyXMatch) {
    const handle = extractHandle(companyXMatch[1].trim());
    if (handle) {
      result.companyXHandle = handle;
    }
  }
  if (!result.companyXHandle) {
    // Fallback: look for company-type X handles in the body
    const companyXSection = findCompanySection(text, "x");
    if (companyXSection) {
      const xMatch = X_HANDLE_RE.exec(companyXSection);
      if (xMatch?.[1]) {
        result.companyXHandle = `@${xMatch[1]}`;
      }
      X_HANDLE_RE.lastIndex = 0;
    }
  }

  // Company Snapchat
  const companySnapMatch = summaryBlock.match(/COMPANY_SNAPCHAT:\s*(.+)/i);
  if (companySnapMatch) {
    const handle = extractHandle(companySnapMatch[1].trim());
    if (handle) {
      result.companySnapchat = handle;
    }
  }

  // Company TikTok
  const companyTiktokMatch = summaryBlock.match(/COMPANY_TIKTOK:\s*(.+)/i);
  if (companyTiktokMatch) {
    const handle = extractHandle(companyTiktokMatch[1].trim());
    if (handle) {
      result.companyTiktok = handle;
    }
  }

  // Build sources list
  if (result.email || result.phone || result.whatsappLink) {
    // Detect which platforms contributed
    const lowerText = text.toLowerCase();
    if (lowerText.includes("x.com") || lowerText.includes("twitter")) sources.push("x");
    if (lowerText.includes("tiktok")) sources.push("tiktok");
    if (lowerText.includes("snapchat")) sources.push("snapchat");
    if (lowerText.includes("linkedin")) sources.push("linkedin");
  }

  return result;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function dedupe(arr: string[]): string[] {
  return [...new Set(arr.map((s) => s.trim()))];
}

/**
 * Fix common truncated domain issues in extracted emails.
 */
function fixTruncatedDomain(email: string): string {
  if (!email || !email.includes('@')) return email;
  const [localPart, domainPart] = email.split('@');
  let domain = domainPart;

  // .com.s -> .com.sa
  if (domain.endsWith('.com.s') && !domain.endsWith('.com.sa')) {
    domain = domain + 'a';
  }
  // .co. -> discard (invalid)
  if (domain.endsWith('.co.')) {
    domain = domain.slice(0, -1) + 'm'; // heuristic: .co. -> .com
  }
  // trailing dot -> strip
  if (domain.endsWith('.')) {
    domain = domain.slice(0, -1);
  }

  return `${localPart}@${domain}`;
}

/**
 * Normalize a Saudi phone number to +966XXXXXXXXX format.
 */
function normalizePhone(phone: string): string {
  const digits = phone.replace(/[\s\-\.\+]/g, "");
  if (digits.startsWith("966") && digits.length === 12) {
    return `+${digits}`;
  }
  if (digits.startsWith("05") && digits.length === 10) {
    return `+966${digits.slice(1)}`;
  }
  // Return as-is with + prefix if it looks valid
  return phone.startsWith("+") ? phone : `+${digits}`;
}

/**
 * Extract a social handle from Gemini's response text.
 * Handles formats like: @handle, https://x.com/handle, NOT_FOUND
 */
function extractHandle(text: string): string | null {
  if (!text || text.includes("NOT_FOUND") || text.includes("not_found") || text === "N/A") {
    return null;
  }
  // Already a clean handle
  if (/^@[a-zA-Z0-9_]+$/.test(text)) {
    return text;
  }
  // Extract from URL
  const urlMatch = text.match(/(?:x\.com|twitter\.com|tiktok\.com\/@|snapchat\.com\/add\/)([a-zA-Z0-9._\-]+)/i);
  if (urlMatch?.[1]) {
    return `@${urlMatch[1]}`;
  }
  // Might just be a plain handle without @
  const plainMatch = text.match(/^([a-zA-Z0-9_]{2,30})$/);
  if (plainMatch?.[1]) {
    return `@${plainMatch[1]}`;
  }
  return null;
}

/**
 * Find a section in the response marked as TYPE: company for a given platform.
 */
function findCompanySection(text: string, platform: string): string | null {
  const sections = text.split(/^---$/m);
  for (const section of sections) {
    const lower = section.toLowerCase();
    if (lower.includes(`platform:`) && lower.includes(platform) && lower.includes("company")) {
      return section;
    }
  }
  return null;
}
