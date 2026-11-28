/**
 * agentReachLeg.ts — Agent Reach backend for the contact-harvest stage.
 *
 * Agent Reach is a router over public backends (Exa semantic search, Jina Reader
 * for any page, YouTube, RSS, and optional logged-in social channels). This leg
 * uses only its keyless public-read path — Jina Reader — so it can run today
 * with no credential, and it degrades to a named error when the backend is
 * unreachable. It never fetches a login-walled platform, never uses a cookie and
 * never reads linkedin.com.
 *
 * Rules it keeps, matching the rest of the pipeline:
 *   - one evidence URL per row, pointing at the public page the data came from;
 *   - no invented person: a name is emitted only when the same page also carries
 *     an email, a phone or a WhatsApp link;
 *   - every failure becomes an `errors` line, never a thrown error.
 */

import type { HarvestedContact } from "./contactHarvest.js";

const JINA_BASE = process.env.AGENT_REACH_JINA_BASE || "https://r.jina.ai/";
const ENABLED = (process.env.AGENT_REACH_ENABLED || "true").toLowerCase() !== "false";
const PAGES_PER_COMPANY = Math.max(Number(process.env.AGENT_REACH_PAGES || "3"), 1);
const FETCH_TIMEOUT_MS = Math.max(Number(process.env.AGENT_REACH_TIMEOUT_MS || "20000"), 3000);

const PATHS = ["/", "/contact", "/contact-us", "/about", "/about-us", "/team", "/ar/contact"];

const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
const SAUDI_PHONE_RE = /(?:\+?966[\s\-.]?5\d{2}[\s\-.]?\d{3}[\s\-.]?\d{4}|0?5\d{8})/g;
const WHATSAPP_RE = /https?:\/\/(?:wa\.me\/\d{7,15}|api\.whatsapp\.com\/send\?phone=\+?\d{7,15})/gi;
const TITLE_RE = /\b(CEO|CTO|COO|CFO|Founder|Co-?Founder|Owner|General Manager|Managing Director|Chairman|Director|Head of [A-Za-z ]{2,24}|Sales Manager|Marketing Manager|مدير|المدير التنفيذي|مؤسس|رئيس)\b/;

/** Domains that are never a company site: a Places row can carry them by mistake. */
const JUNK_DOMAINS = new Set([
  "whatsapp.com", "wa.me", "facebook.com", "instagram.com", "x.com", "twitter.com",
  "linkedin.com", "youtube.com", "tiktok.com", "google.com", "maps.google.com",
]);

function normaliseDomain(raw?: string): string {
  if (!raw) return "";
  let d = raw.trim().toLowerCase();
  d = d.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
  if (!d || !d.includes(".")) return "";
  if (JUNK_DOMAINS.has(d)) return "";
  return d;
}

function cleanEmails(text: string): string[] {
  const out = new Set<string>();
  for (const raw of text.match(EMAIL_RE) || []) {
    const e = raw.toLowerCase().replace(/\.+$/, "");
    if (e.length > 90) continue;
    if (/\.(png|jpe?g|gif|webp|svg|css|js)$/.test(e)) continue;
    if (/@(?:2x|3x)\./.test(e)) continue;
    if (/(example|sentry|wixpress|domain)\./.test(e)) continue;
    if (e.startsWith("firstname.lastname@")) continue;
    out.add(e);
  }
  return Array.from(out);
}

function cleanPhones(text: string): string[] {
  const out = new Set<string>();
  for (const raw of text.match(SAUDI_PHONE_RE) || []) {
    const digits = raw.replace(/[^\d+]/g, "");
    const local = digits.startsWith("+966")
      ? "+966" + digits.slice(4)
      : digits.startsWith("966")
        ? "+966" + digits.slice(3)
        : "+966" + digits.replace(/^0/, "");
    if (local.length >= 12 && local.length <= 14) out.add(local);
  }
  return Array.from(out);
}

/** A page-local name: a name-like line that also carries a job title. */
function findName(text: string): string {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    if (line.length < 6 || line.length > 60) continue;
    if (!TITLE_RE.test(line)) continue;
    // Strip the title to leave the possible name.
    const withoutTitle = line.replace(TITLE_RE, " ").replace(/[-–—|,·:]/g, " ").trim();
    const words = withoutTitle.split(/\s+/).filter((w) => /^[A-Za-z\u0600-\u06FF][A-Za-z\u0600-\u06FF'.-]{1,}$/.test(w));
    if (words.length >= 2 && words.length <= 4) return words.join(" ");
  }
  return "";
}

async function readPage(url: string): Promise<{ text: string; error?: string }> {
  const target = JINA_BASE.endsWith("/") ? JINA_BASE + url : JINA_BASE + "/" + url;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(target, {
      method: "GET",
      headers: { "x-respond-with": "text", "user-agent": "LeadJin/1.0 agent-reach" },
      signal: controller.signal,
    });
    if (!res.ok) return { text: "", error: `HTTP ${res.status}` };
    const text = await res.text();
    return { text };
  } catch (e: any) {
    return { text: "", error: e?.name === "AbortError" ? "timeout" : (e?.message ?? String(e)) };
  } finally {
    clearTimeout(timer);
  }
}

export async function agentReachLeg(
  company: string,
  domainRaw: string | undefined,
  _city?: string,
): Promise<{ contacts: HarvestedContact[]; errors: string[] }> {
  const errors: string[] = [];
  if (!ENABLED) return { contacts: [], errors: [] };

  const domain = normaliseDomain(domainRaw);
  if (!domain) {
    errors.push(`agent-reach: skipped (no usable domain for ${company || "row"})`);
    return { contacts: [], errors: [] };
  }

  const contacts: HarvestedContact[] = [];
  let pagesRead = 0;

  for (const path of PATHS) {
    if (pagesRead >= PAGES_PER_COMPANY) break;
    const url = `https://${domain}${path}`;
    const { text, error } = await readPage(url);
    if (error) {
      errors.push(`agent-reach: ${url} (${error})`);
      continue;
    }
    if (!text || text.length < 80) {
      errors.push(`agent-reach: ${url} (empty read)`);
      continue;
    }
    pagesRead += 1;

    const emails = cleanEmails(text);
    const phones = cleanPhones(text);
    const whatsapp = (text.match(WHATSAPP_RE) || [])[0] || "";
    if (emails.length === 0 && phones.length === 0 && !whatsapp) continue;

    const name = findName(text);
    const now = new Date().toISOString();

    // One row per email; when a page yields no email, one row carrying the phone.
    if (emails.length > 0) {
      for (const email of emails.slice(0, 3)) {
        contacts.push({
          name,
          title: name ? (text.match(TITLE_RE)?.[0] || "") : "",
          email,
          phone: phones[0] || "",
          whatsapp,
          linkedin: "",
          source: "agent-reach",
          evidence_url: url,
          discovered_at: now,
          email_status: "unverified",
          email_verified: false,
          social_links: [],
        });
      }
    } else {
      contacts.push({
        name,
        title: name ? (text.match(TITLE_RE)?.[0] || "") : "",
        email: "",
        phone: phones[0] || "",
        whatsapp,
        linkedin: "",
        source: "agent-reach",
        evidence_url: url,
        discovered_at: now,
        email_status: "unverified",
        email_verified: false,
        social_links: [],
      });
    }
  }

  if (contacts.length === 0 && errors.length === 0 && pagesRead === 0) {
    errors.push(`agent-reach: no page readable for ${domain}`);
  }

  return { contacts, errors };
}
