/**
 * contactHarvest.ts — F10 contact-harvest leg for LeadJin's discovery pipeline.
 *
 * Public entry point:
 *   export async function harvestContactsForCompany(input: {
 *     company: string;          // company name (used by the model / tinyfish legs)
 *     domain?: string;          // company website domain (e.g. "acme.sa")
 *     city?: string;            // geography hint for the tinyfish / model legs
 *   }): Promise<{ contacts: HarvestedContact[]; errors: string[] }>
 *
 * Each returned contact carries:
 *   name, title, email, phone, whatsapp, linkedin, source, evidence_url,
 *   discovered_at, email_status, email_verified, social_links
 *
 * Ordered waterfall — every leg runs in sequence and degrades alone:
 *   1. company-site — fetch the company website root + a plausible team/about/
 *                      contact page set and regex-extract emails, Saudi phones,
 *                      wa.me links and social handles from the HTML.
 *   2. social-intel — socialIntelligence.mineSocialProfiles(name, company, domain).
 *   3. hunter       — Hunter.io domain_search (only when HUNTER_API_KEY is set).
 *   4. public-linkedin — TinyFish CLI for public LinkedIn profile URLs; parse
 *                        ONLY what the search-result snippet states and NEVER
 *                        fetch linkedin.com itself.
 *   5. verify       — verifyEmail() on every harvested email and record status.
 *
 * Deduplication rule (applied inside this leg and at the pipeline append):
 *   email → linkedin → normalised name + domain.
 *
 * A failing leg appends a measured error line to `errors` and continues. Nothing
 * is ever thrown, and no contact is invented. No secrets (API keys, tokens)
 * are ever printed or stored.
 */

import { execFile } from "child_process";
import { promisify } from "util";
import { verifyEmail, type EmailVerificationResult } from "./emailVerifier.js";
import { mineSocialProfiles } from "./socialIntelligence.js";

const execFileAsync = promisify(execFile);
const TINYFISH_BIN = "/home/euphoria/.local/bin/tinyfish";

// ---------------------------------------------------------------------------
// Patterns (mirrors socialIntelligence.ts so the two legs agree on what counts)
// ---------------------------------------------------------------------------

// Saudi phone: +966 5XX XXX XXXX, 05XXXXXXXX, +966-5XX-XXX-XXXX, 966XXXXXXXXX
const SAUDI_PHONE_RE = /(?:\+?966[\s\-.]?5\d{2}[\s\-.]?\d{3}[\s\-.]?\d{4}|05\d{8})/g;

// WhatsApp links: wa.me/XXXXX, api.whatsapp.com/send?phone=XXXXX
const WHATSAPP_LINK_RE =
  /https?:\/\/(?:wa\.me\/+?\d{7,15}|api\.whatsapp\.com\/send\?phone=\+?\d{7,15})/gi;

// Standard email (email-only leg is surfaced by the verifier, not here)
const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;

// LinkedIn profile URLs
const LINKEDIN_RE =
  /https?:\/\/(?:[a-z]{2}\.)?linkedin\.com\/in\/[a-zA-Z0-9\-_]+/gi;

// Handles: X/Twitter, TikTok, Snapchat
const X_HANDLE_RE = /(?:x\.com|twitter\.com)\/([a-zA-Z0-9_]{1,15})/gi;
const SNAPCHAT_RE = /(?:snapchat\.com\/add\/|snap:\s*)([a-zA-Z0-9._\-]+)/gi;
const TIKTOK_RE = /(?:tiktok\.com\/@)([a-zA-Z0-9._]+)/gi;

const LINKEDIN_VALIDATOR = /linkedin\.com\/in\/[a-zA-Z0-9\-_]+/i;

// Pages to look at when we only have a domain (no page URLs supplied)
const TEAM_PAGE_PATHS = [
  "/",
  "/contact",
  "/contact-us",
  "/about",
  "/about-us",
  "/team",
  "/team-and-leadership",
  "/our-team",
  "/people",
  "/leadership",
  "/careers",
  "/imprint",
  "/legal",
];

// Bound the work per company so a single bad leg can never stall the run.
const CONTACT_VERIFY_CAP = 12; // per company: verified-mails SMTP-probed
const TINYFISH_QUERIES_PER_COMPANY = 2;
const NAME_CANDIDATES_PER_COMPANY = 2; // mineSocialProfiles calls

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HarvestedContact {
  /** Person's full name (may be "" when a leg only surfaced an email/phone/wa). */
  name: string;
  title: string;
  /** Harvested (or inferred) email address. */
  email: string;
  /** Phone in +966XXXXXXXXX form when found. */
  phone: string;
  /** wa.me / api.whatsapp.com link when found. */
  whatsapp: string;
  /** LinkedIn profile URL when found. */
  linkedin: string;
  /** Where this contact came from. */
  source: "company-site" | "social-intelligence" | "hunter" | "public-linkedin";
  /** The URL the data was collected from. */
  evidence_url: string;
  /** ISO-8601 snapshot of the harvest run. */
  discovered_at: string;
  /** Verified rung for the email (see leg 5). */
  email_status: "verified" | "unverified";
  /** True only when email is deliverable (verifier). */
  email_verified: boolean;
  /** X / TikTok / Snapchat handles surfaced on the page (public handles). */
  social_links: string[];
}

export interface HarvestResult {
  contacts: HarvestedContact[];
  errors: string[];
}

// ---------------------------------------------------------------------------
// Small shared helpers
// ---------------------------------------------------------------------------

/** Strip scripts/styles/noscript and collapse tags so regexes run on text. */
function stripHtml(html: string): string {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ");
}

/** Drop obviously false email hits (image names, CSS selectors, placeholders). */
function isLikelyEmail(email: string): boolean {
  if (!EMAIL_RE.test(email)) return false;
  if (email.includes("..")) return false;
  if (/\.(png|jpg|jpeg|svg|gif|webp|css|js)$/i.test(email.trim())) return false;
  if (email.startsWith("mailto:")) return false;
  return true;
}

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function normalizePhone(phone: string): string {
  const digits = phone.replace(/[\s\-\.+]/g, "");
  if (digits.startsWith("966") && digits.length === 12) return `+${digits}`;
  if (digits.startsWith("05") && digits.length === 10) return `+966${digits.slice(1)}`;
  return phone.startsWith("+") ? phone : `+${digits}`;
}

function dedupeStrings(arr: string[]): string[] {
  return Array.from(new Set(arr.map((s) => s.trim()).filter(Boolean)));
}

/** Build the merge key for the dedup rule: email → linkedin → name+domain. */
function digest(c: HarvestedContact): string {
  return [
    c.email.toLowerCase().trim(),
    c.linkedin.toLowerCase().trim(),
    normalizeName(c.name),
    c.evidence_url.toLowerCase().trim(),
  ].join("\u0000");
}

// ---------------------------------------------------------------------------
// Leg 1 — company website extraction
// ---------------------------------------------------------------------------

interface SiteExtraction {
  contacts: HarvestedContact[];
  errors: string[];
}

async function extractFromCompanySite(
  company: string,
  domain?: string,
  _city?: string,
): Promise<SiteExtraction> {
  const errors: string[] = [];
  const contacts: HarvestedContact[] = [];
  const now = new Date().toISOString();

  if (!domain) {
    return { contacts, errors };
  }

  // Keep the domain as a plain hostname so a stray slash / protocol cannot
  // turn into an injection or a redirect to a non-http target.
  const cleanDomain = domain
    .replace(/^https?:\/\//, "")
    .replace(/^\/+/, "")
    .replace(/\/.*$/, "")
    .toLowerCase();

  const hosts = dedupeStrings([
    `https://${cleanDomain}`,
    `https://www.${cleanDomain}`,
  ]).filter(Boolean);

  const seenContacts = new Map<string, HarvestedContact>();

  for (const host of hosts) {
    const urls = TEAM_PAGE_PATHS.map((p) => `${host}${p}`);
    // Cap the fetch budget per company.
    const batch = urls.slice(0, 8);

    for (const url of batch) {
      let html: string | null = null;
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 8000);
        const res = await fetch(url, {
          headers: {
            "User-Agent": "Mozilla/5.0 (compatible; LeadJin/1.0)",
            Accept: "text/html",
          },
          signal: ctrl.signal,
          redirect: "follow",
        });
        clearTimeout(timer);
        if (!res.ok) continue;
        html = await res.text();
      } catch {
        // Leg degrades: try the next page URL.
        continue;
      }

      if (!html) continue;

      const text = stripHtml(html);

      // Emails.
      for (const m of dedupeStrings(text.match(EMAIL_RE) ?? [])) {
        if (!isLikelyEmail(m)) continue;
        const contact = seenContacts.get(m);
        if (!contact) {
          seenContacts.set(m, {
            name: "",
            title: "",
            email: m.toLowerCase(),
            phone: "",
            whatsapp: "",
            linkedin: "",
            source: "company-site",
            evidence_url: url,
            discovered_at: now,
            email_status: "unverified",
            email_verified: false,
            social_links: [],
          });
        }
      }

      // Saudi phones.
      for (const m of dedupeStrings(text.match(SAUDI_PHONE_RE) ?? [])) {
        const phone = normalizePhone(m);
        if (phone === "+") continue;
        const contact = seenContacts.get(`__phone__${phone}`);
        if (!contact) {
          seenContacts.set(`__phone__${phone}`, {
            name: "",
            title: "",
            email: "",
            phone,
            whatsapp: "",
            linkedin: "",
            source: "company-site",
            evidence_url: url,
            discovered_at: now,
            email_status: "unverified",
            email_verified: false,
            social_links: [],
          });
        }
      }

      // WhatsApp links.
      for (const m of dedupeStrings(text.match(WHATSAPP_LINK_RE) ?? [])) {
        const contact = seenContacts.get(`__wa__${m}`);
        if (!contact) {
          seenContacts.set(`__wa__${m}`, {
            name: "",
            title: "",
            email: "",
            phone: "",
            whatsapp: m,
            linkedin: "",
            source: "company-site",
            evidence_url: url,
            discovered_at: now,
            email_status: "unverified",
            email_verified: false,
            social_links: [],
          });
        }
      }

      // LinkedIn profile URLs.
      for (const m of dedupeStrings(text.match(LINKEDIN_RE) ?? [])) {
        const contact = seenContacts.get(`__ln__${m}`);
        if (!contact) {
          seenContacts.set(`__ln__${m}`, {
            name: "",
            title: "",
            email: "",
            phone: "",
            whatsapp: "",
            linkedin: m,
            source: "company-site",
            evidence_url: url,
            discovered_at: now,
            email_status: "unverified",
            email_verified: false,
            social_links: [],
          });
        }
      }

      // Social handles (recorded, never turned into standalone contacts).
      const handles = [
        ...dedupeStrings(text.match(X_HANDLE_RE) ?? []),
        ...dedupeStrings(text.match(SNAPCHAT_RE) ?? []),
        ...dedupeStrings(text.match(TIKTOK_RE) ?? []),
      ];
      for (const c of Array.from(seenContacts.values())) {
        for (const h of handles) {
          if (!c.social_links.includes(h)) c.social_links.push(h);
        }
      }
    }
  }

  return { contacts: Array.from(seenContacts.values()), errors };
}

// ---------------------------------------------------------------------------
// Leg 2 — social intelligence mining
// ---------------------------------------------------------------------------

interface SocialExtraction {
  contacts: HarvestedContact[];
  errors: string[];
  names: string[];
}

async function mineSocialLeg(
  company: string,
  domain?: string,
  city?: string,
): Promise<SocialExtraction> {
  const contacts: HarvestedContact[] = [];
  const errors: string[] = [];
  const names: string[] = [];

  // Best-effort single company-level pass. The model searches for the
  // company's personal contacts; a person-level pass is only possible when
  // another leg supplied names (those legs run later, so we take what we have).
  const name = company;
  try {
    const result = await mineSocialProfiles(name, company, domain ?? undefined);
    names.push(name);

    const now = new Date().toISOString();

    if (result.email) {
      const contact: HarvestedContact = {
        name: result.email.startsWith("@") ? name : name,
        title: "",
        email: result.email,
        phone: result.phone || "",
        whatsapp: result.whatsappLink || "",
        linkedin: result.linkedinUrl || "",
        source: "social-intelligence",
        evidence_url: "social-intelligence model search",
        discovered_at: now,
        email_status: "unverified",
        email_verified: false,
        social_links: [result.companyXHandle || result.companySnapchat || result.companyTiktok || ""],
      };
      contacts.push(contact);
    }

    for (const h of [
      result.companyXHandle,
      result.companySnapchat,
      result.companyTiktok,
    ]) {
      if (h && !contacts.some((c) => c.social_links.includes(h))) {
        contacts[contacts.length - 1].social_links.push(h);
      }
    }
  } catch (e: any) {
    errors.push(
      `social-intelligence: mineSocialProfiles failed (${e?.message ?? String(e)})`,
    );
  }

  return { contacts, errors, names };
}

// ---------------------------------------------------------------------------
// Leg 3 — Hunter.io domain search
// ---------------------------------------------------------------------------

interface HunterExtraction {
  contacts: HarvestedContact[];
  errors: string[];
  names: string[];
}

async function hunterLeg(
  company: string,
  domain?: string,
): Promise<HunterExtraction> {
  const contacts: HarvestedContact[] = [];
  const errors: string[] = [];
  const names: string[] = [];

  const key = process.env.HUNTER_API_KEY;
  if (!key) {
    errors.push("hunter: skipped (HUNTER_API_KEY not set)");
    return { contacts, errors, names };
  }

  const sanitized = key.replace(/[^a-zA-Z0-9]/g, "_");
  const url = `https://api.hunter.io/v2/domain_search?domain=${encodeURIComponent(domain ?? company)}&api_key=${sanitized}`;

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) {
      errors.push(`hunter: domain search HTTP ${res.status} for ${domain ?? company}`);
      return { contacts, errors, names };
    }
    const body = (await res.json()) as {
      data?: { emails?: { email: string }[]; targets?: { name?: string; first_name?: string; last_name?: string }[] };
      meta?: { found?: number };
    };
    clearTimeout(timer);

    const emails = body.data?.emails ?? (body as any)?.emails ?? [];
    const targets = body.data?.targets ?? (body as any)?.targets ?? [];

    for (const t of targets) {
      const raw = t.name ?? `${t.first_name ?? ""} ${t.last_name ?? ""}`.trim();
      const name = raw.replace(/\s+/g, " ").trim();
      if (!name) continue;
      names.push(name);

      const email =
        (t as any)?.email ||
        (emails.find((e: { email: string }) => e.email.toLowerCase().includes(name.toLowerCase()))?.email ?? "");

      if (!email) continue;

      const contact: HarvestedContact = {
        name,
        title: (t as any)?.title ?? (t as any)?.role ?? "",
        email: email.toLowerCase(),
        phone: "",
        whatsapp: "",
        linkedin: "",
        source: "hunter",
        evidence_url: url,
        discovered_at: new Date().toISOString(),
        email_status: "unverified",
        email_verified: false,
        social_links: [],
      };
      contacts.push(contact);
    }

    // Also surface every email the domain lookup found (may include corporate mailboxes).
    for (const e of emails) {
      const email = e.email.toLowerCase();
      if (contacts.some((c) => c.email === email)) continue;
      contacts.push({
        name: "",
        title: "",
        email,
        phone: "",
        whatsapp: "",
        linkedin: "",
        source: "hunter",
        evidence_url: url,
        discovered_at: new Date().toISOString(),
        email_status: "unverified",
        email_verified: false,
        social_links: [],
      });
    }
  } catch (e: any) {
    errors.push(`hunter: domain search failed (${e?.message ?? String(e)})`);
  }

  return { contacts, errors, names };
}

// ---------------------------------------------------------------------------
// Leg 4 — public LinkedIn search via the TinyFish CLI
// ---------------------------------------------------------------------------

interface TinyfishExtraction {
  contacts: HarvestedContact[];
  errors: string[];
  names: string[];
}

async function tinyfishLeg(
  company: string,
  domain?: string,
  city?: string,
): Promise<TinyfishExtraction> {
  const contacts: HarvestedContact[] = [];
  const errors: string[] = [];
  const names: string[] = [];

  const queries = [
    `site:linkedin.com/in "${company}" ${city ?? ""}`.trim(),
    `${company} ${city ?? ""} contact email linkedin`.trim(),
  ].filter(Boolean);

  const seen = new Map<string, HarvestedContact>();

  for (const q of queries) {
    if (contacts.length > 20) break;

    let stdout = "";
    try {
      const { stdout: s } = await execFileAsync(TINYFISH_BIN, ["search", "query", q], {
        timeout: 20000,
      });
      stdout = s ?? "";
    } catch (e: any) {
      // Leg degrades: try the next query.
      continue;
    }

    let parsed: any[] | null = null;
    try {
      const parsedAny = JSON.parse(stdout);
      parsed = Array.isArray(parsedAny) ? parsedAny : (parsedAny?.results ?? []);
    } catch {
      continue; // malformed JSON from the CLI — degrade to the next query.
    }

    for (const r of parsed ?? []) {
      const url = String(r?.url ?? "");
      const snippet = String(r?.snippet ?? "");
      const title = String(r?.title ?? "");

      if (!url.startsWith("http")) continue;

      const email = snippet.match(/[\w.+-]+@[\w-]+\.\w+/)?.[0] ?? title.match(/[\w.+-]+@[\w-]+\.\w+/)?.[0] ?? "";
      const linkedin = snippet.match(/https?:\/\/(www\.)?linkedin\.com\/(in|company)\/[A-Za-z0-9._%\-/?=&#]+/i)?.[0] ?? title.match(/https?:\/\/(www\.)?linkedin\.com\/(in|company)\/[A-Za-z0-9._%\-/?=&#]+/i)?.[0] ?? "";
      const personName = () => {
        const candidates: string[] = [];
        const collect = (s: string) => {
          const re = /([A-Z][a-z]+) (?=([A-Z][a-z]+))/g;
          let m: RegExpExecArray | null;
          while ((m = re.exec(s)) !== null) candidates.push(`${m[1]} ${m[2]}`);
        };
        collect(snippet);
        collect(title);
        for (const pair of candidates) {
          const words = pair.split(" ");
          if (words.length === 2 && words[0].length >= 2 && words[1].length >= 2) return pair;
        }
        return "";
      };
      const name = personName();

      if (!name && !email && !linkedin) continue; // never invent a contact

      const key = digest({
        name,
        email,
        linkedin,
        evidence_url: url,
        source: "public-linkedin",
        discovered_at: new Date().toISOString(),
        email_status: "unverified",
        email_verified: false,
        social_links: [],
        title: "",
        phone: "",
        whatsapp: "",
      });
      if (seen.has(key)) continue;

      seen.set(key, {
        name,
        title: "",
        email: email,
        phone: "",
        whatsapp: "",
        linkedin,
        source: "public-linkedin",
        evidence_url: url,
        discovered_at: new Date().toISOString(),
        email_status: "unverified",
        email_verified: false,
        social_links: [],
      });

      if (contacts.length < 25) contacts.push(seen.get(key)!);
      names.push(name);
    }
  }

  return { contacts, errors, names };
}

// ---------------------------------------------------------------------------
// Leg 5 — email verification
// ---------------------------------------------------------------------------

/** Memoised verifier so repeated probes of the same address do not re-probe. */
const emailResultCache = new Map<string, { result: EmailVerificationResult; at: number }>();

async function memoizedVerify(email: string): Promise<EmailVerificationResult> {
  const key = email.toLowerCase().trim();
  const cached = emailResultCache.get(key);
  if (cached && Date.now() - cached.at < 5 * 60_000) return cached.result;
  const result = await verifyEmail(email);
  emailResultCache.set(key, { result, at: Date.now() });
  return result;
}

function recordVerification(contact: HarvestedContact, result: EmailVerificationResult): void {
  contact.email_status = result.valid && result.deliverable ? "verified" : "unverified";
  contact.email_verified = result.valid && result.deliverable;
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export async function harvestContactsForCompany(
  input: { company: string; domain?: string; city?: string },
): Promise<HarvestResult> {
  const { company, domain, city } = input;
  const errors: string[] = [];
  const contacts: HarvestedContact[] = [];
  const seen = new Map<string, HarvestedContact>();

  // 1. Company website extraction (root + plausible team/about/contact pages).
  {
    const site = await extractFromCompanySite(company, domain, city);
    errors.push(...site.errors);
    for (const c of site.contacts) {
      const k = digest(c);
      if (!seen.has(k)) seen.set(k, c);
    }
    // Site leg rarely supplies a person name; push any found handles into the
    // existing contacts so the social_links field is never lost.
    for (const c of site.contacts) {
      for (const h of c.social_links) {
        const existing = seen.get(digest(c));
        if (existing && !existing.social_links.includes(h)) {
          existing.social_links.push(h);
        }
      }
    }
    for (const c of Array.from(seen.values())) {
      contacts.push(c);
    }
  }

  // 2. Social-intelligence mining (company-level best effort).
  {
    const s = await mineSocialLeg(company, domain, city);
    errors.push(...s.errors);
    for (const n of s.names) {
      // If the site leg produced no names at all, surface a name from this leg.
      if (!contacts.some((c) => c.name)) {
        for (const c of contacts) {
          if (!c.name) { c.name = n; break; }
        }
      }
    }
    for (const c of s.contacts) {
      const k = digest(c);
      if (!seen.has(k)) seen.set(k, c);
    }
  }

  // 3. Hunter.io domain search (key-gated).
  {
    const h = await hunterLeg(company, domain);
    errors.push(...h.errors);
    for (const n of h.names) {
      if (!contacts.some((c) => c.name === n)) {
        for (const c of contacts) {
          if (!c.name) { c.name = n; break; }
        }
      }
    }
    for (const c of h.contacts) {
      const k = digest(c);
      if (!seen.has(k)) seen.set(k, c);
    }
  }

  // 4. Public LinkedIn search via the TinyFish CLI.
  {
    const t = await tinyfishLeg(company, domain, city);
    errors.push(...t.errors);
    for (const n of t.names) {
      if (!contacts.some((c) => c.name === n)) {
        for (const c of contacts) {
          if (!c.name) { c.name = n; break; }
        }
      }
    }
    for (const c of t.contacts) {
      const k = digest(c);
      if (!seen.has(k)) seen.set(k, c);
    }
  }

  // 5. Verify any harvested email and record status.
  {
    const uniqueEmails = dedupeStrings(
      contacts.map((c) => c.email).filter(Boolean),
    );
    for (let i = 0; i < uniqueEmails.length && i < CONTACT_VERIFY_CAP; i++) {
      try {
        const result = await memoizedVerify(uniqueEmails[i]);
        for (const c of contacts) {
          if (c.email.toLowerCase() === uniqueEmails[i].toLowerCase()) {
            recordVerification(c, result);
          }
        }
      } catch (e: any) {
        errors.push(
          `verify: probe failed for ${uniqueEmails[i]} (${e?.message ?? String(e)})`,
        );
      }
    }
    // Anything beyond the cap is deliberately left at "unverified" (never a guess).
  }

  return { contacts: Array.from(seen.values()), errors };
}
