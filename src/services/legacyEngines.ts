/**
 * legacyEngines.ts — optional, degrading adapters that re-wire the ORIG
 * discovery engines (jobspy / kimi / crawl4ai) to the shared pipeline.
 *
 * ORIG (read-only, never written):
 *   /home/euphoria/LEADJIN COMPLETE FOLDER/LEADJIN SEPERATE BUSINESS MODULE/leadjin/leadjin/src/services/
 *     jobspyDiscovery.ts, kimiDiscovery.ts, crawl4aiDiscovery.ts,
 *     leadRouter.ts, campaignOrchestrator.ts, gmailPoller.ts
 *   /home/euphoria/LEADJIN COMPLETE FOLDER/LEADJIN SEPERATE BUSINESS MODULE/leadjin/leadjin/src/components/ApprovalQueue.tsx
 *   /home/euphoria/LEADJIN COMPLETE FOLDER/LEADJIN SEPERATE BUSINESS MODULE/leadjin/leadjin/scripts/
 *     seed_approvals_test.cjs, shot_approvals.py, crawl-phases.sh, stress-test.sh
 *
 * Mapping (this module inlines the plain-fetch adapter logic of the three
 * ORIG discovery files; they are 60-120 line, single-purpose HTTP adapters):
 *
 *   jobspyDiscovery.ts   → JOB/roles scrape via ${LEGACY_ENGINES_SVC_URL}/jobspy
 *   kimiDiscovery.ts     → agentic browse via ${LEGACY_KIMI_SVC_URL}/discover
 *   crawl4aiDiscovery.ts → crawl4ai browse via ${LEGACY_ENGINES_SVC_URL}/crawl4ai
 *
 * The verbatim ORIG files are preserved (sha256 recorded in
 * preserved-orig-only/README.md) and are the source of truth; they must not
 * be edited. Nothing here is mocked.
 */
import { execFileSync } from "child_process";

/** The three legacy discovery engines, re-connected as optional adapters. */
export type LegacyEngine = "jobspy" | "kimi" | "crawl4ai";

/** One measured availability probe: engine + whether the real backend answered. */
export interface EngineProbe {
  engine: LegacyEngine;
  available: boolean;
  reason: string;
}

/**
 * Result of running a legacy engine. When the backend is unavailable the
 * adapter returns an empty lead list plus the measured reason — never a
 * mocked lead. When the probe passed but the backend raised, the run-time
 * error is reported instead of throwing the harvest.
 */
export interface LegacyEngineResult {
  leads: LegacyLead[];
  error?: string;
}

/** The pipeline lead shape that legacy-engine rows must normalise to. */
export interface LegacyLead {
  source_engine: string;
  lead_id: string;
  twitter: string;
  email_source: string;
  company: string;
  website: string;
  name: string;
  title: string;
  email: string;
  phone: string;
  linkedin: string;
  industry: string;
  lead_score: number;
  confidence: "high" | "medium" | "low";
  verified_real: 0 | 1;
  provenance_url: string | null;
  discovered_at: string;
  raw: unknown;
}

/** Host-side engine services that the ORIG adapters call (docker bridge). */
const LEGACY_ENGINES_SVC_URL =
  process.env.LEADJIN_ENGINES_SVC_URL || "http://host.docker.internal:3013";
const LEGACY_KIMI_SVC_URL =
  process.env.KIMI_DISCOVERY_URL || "http://host.docker.internal:3012";

/** Run a command and report the first failure line instead of throwing. */
function runCmd(cmd: string, args: string[], timeoutMs = 15000): EngineProbe {
  try {
    const out = execFileSync(cmd, args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 256 * 1024,
      timeout: timeoutMs,
    });
    return {
      engine: "jobspy",
      available: true,
      reason: `${cmd} ${args.join(" ")} → OK (${out.trim() || "no output"})`,
    };
  } catch (err: any) {
    const msg =
      [(err?.stderr ?? ""), (err?.stdout ?? ""), (err?.message ?? "")].filter(Boolean).join("\n");
    const first = msg.split("\n").map((l) => l.trim()).filter(Boolean)[0] ?? "failed";
    return {
      engine: "jobspy",
      available: false,
      reason: `exit ${err.status ?? err.code ?? "?"}: ${first.slice(0, 200)}`,
    };
  }
}

/** Probe the JobSpy backend: a python3 import check of the jobspy library. */
function probeJobspy(): EngineProbe {
  return runCmd("python3", ["-c", "import jobspy"]);
}

/** Probe the Kimi backend: the `kimi` CLI binary must exist and answer. */
function probeKimiBinary(): EngineProbe {
  const which = runCmd("sh", ["-c", "command -v kimi"], 10000);
  if (!which.available) return which;
  return runCmd("kimi", ["--version"], 10000);
}

/**
 * Probe the crawl4ai backend: an HTTP GET of the engine service crawl4ai route.
 * The fetch may complete with any HTTP status — the adapter itself reports the
 * real error if the service returns a non-ok payload.
 */
async function probeCrawl4aiEndpoint(): Promise<EngineProbe> {
  const url = `${LEGACY_ENGINES_SVC_URL}/crawl4ai?query=web designer&geo=Riyadh&count=1`;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    return {
      engine: "crawl4ai",
      available: true,
      reason: `HTTP ${res.status} (${res.statusText})`,
    };
  } catch (err: any) {
    return {
      engine: "crawl4ai",
      available: false,
      reason: `HTTP probe failed: ${err?.message ?? String(err)}`,
    };
  }
}

/**
 * Measure the REAL backend of each legacy engine. A probe failure is
 * available:false with the measured reason — we never assume availability.
 */
export async function engineAvailability(): Promise<EngineProbe[]> {
  const checks: EngineProbe[] = [
    { engine: "jobspy", available: false, reason: "jobspy probe pending" },
    { engine: "kimi", available: false, reason: "kimi probe pending" },
    { engine: "crawl4ai", available: false, reason: "crawl4ai probe pending" },
  ];

  const jobspy = probeJobspy();
  setProbe(checks, "jobspy", jobspy.available, jobspy.reason);

  const kimi = probeKimiBinary();
  setProbe(checks, "kimi", kimi.available, kimi.reason);

  const crawl4ai = await probeCrawl4aiEndpoint();
  setProbe(checks, "crawl4ai", crawl4ai.available, crawl4ai.reason);

  return checks;
}

function setProbe(checks: EngineProbe[], engine: LegacyEngine, available: boolean, reason: string): void {
  const entry = checks.find((p) => p.engine === engine);
  if (entry) {
    entry.available = available;
    entry.reason = reason;
  }
}

/**
 * Run one legacy engine against the real backend and normalise its rows to the
 * pipeline lead shape. `query` is the engine's sector/role search term; `limit`
 * is the requested lead count.
 */
export async function runLegacyEngine(
  engine: LegacyEngine,
  query: string,
  limit: number,
): Promise<LegacyEngineResult> {
  const probe = (await engineAvailability()).find((p) => p.engine === engine);
  if (!probe || !probe.available) {
    return {
      leads: [],
      error: `${engine} backend not available: ${probe?.reason ?? "no probe"}`,
    };
  }

  try {
    if (engine === "jobspy") {
      return { leads: await runJobspyAdapter(query, limit) };
    }
    if (engine === "kimi") {
      return { leads: await runKimiAdapter(query, limit) };
    }
    if (engine === "crawl4ai") {
      return { leads: await runCrawl4aiAdapter(query, limit) };
    }
    return { leads: [] };
  } catch (err: any) {
    return {
      leads: [],
      error: `${engine} backend raised: ${err?.message ?? String(err)}`,
    };
  }
}

/* -------------------------------------------------------------------------- */
/* ORIG adapter re-expressions (verbatim logic preserved in preserved-orig-only) */
/* -------------------------------------------------------------------------- */

/** JobSpy's country_indeed accepts country names; map common geo strings. */
function geoToCountry(geo: string): string {
  const g = (geo || "").toLowerCase();
  if (/\b(usa|united states|us|america|new york|los angeles|san francisco|chicago)\b/.test(g)) return "usa";
  if (/\b(uk|united kingdom|england|london|manchester|britain)\b/.test(g)) return "uk";
  if (/\b(canada|toronto|vancouver|montreal)\b/.test(g)) return "canada";
  if (/\b(australia|sydney|melbourne|brisbane)\b/.test(g)) return "australia";
  if (/\b(germany|berlin|munich)\b/.test(g)) return "germany";
  if (/\b(india|mumbai|delhi|bangalore)\b/.test(g)) return "india";
  if (/\b(uae|dubai|abu dhabi|emirates)\b/.test(g)) return "united arab emirates";
  if (/\b(singapore)\b/.test(g)) return "singapore";
  return "usa"; // default — Indeed's most-populated board
}

/** If the sector reads like a role list use it; else a small default role set. */
function sectorToRoles(sector: string): string {
  const s = (sector || "").trim();
  const looksLikeRoles = /design|develop|mark|social|brand|content|ux|ui|web|graphic|seo/i.test(s);
  return looksLikeRoles && s.length > 0 ? s : "web designer,graphic designer";
}

async function runJobspyAdapter(query: string, limit: number): Promise<LegacyLead[]> {
  const qs = new URLSearchParams({
    roles: sectorToRoles(query),
    country: geoToCountry("usa"),
    count: String(Math.max(1, Number(limit) || 1)),
  });
  const url = `${LEGACY_ENGINES_SVC_URL}/jobspy?${qs.toString()}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 290_000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`jobspy engine service HTTP ${res.status}`);
    const data: any = await res.json();
    if (!data || data.ok !== true || !Array.isArray(data.leads)) {
      throw new Error(`jobspy engine failed: ${data?.error ?? "no leads"}`);
    }
    return (data.leads as any[]).map((c, i) => toLegacyLead("jobspy", c, i));
  } finally {
    clearTimeout(timer);
  }
}

async function runKimiAdapter(query: string, limit: number): Promise<LegacyLead[]> {
  const titles = "CEO, Founder, Co-Founder";
  const qs = new URLSearchParams({
    sector: query || "startups",
    geo: "Riyadh",
    count: String(Math.max(1, Number(limit) || 1)),
    titles,
    max_age_years: "1",
  });
  const url = `${LEGACY_KIMI_SVC_URL}/discover?${qs.toString()}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 290_000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`kimi discovery service HTTP ${res.status}`);
    const data: any = await res.json();
    if (!data || data.ok !== true || !Array.isArray(data.companies)) {
      throw new Error(`kimi discovery failed: ${data?.error ?? "no companies"}`);
    }
    return (data.companies as any[]).map((c, i) => toLegacyLead("kimi", c, i));
  } finally {
    clearTimeout(timer);
  }
}

async function runCrawl4aiAdapter(query: string, limit: number): Promise<LegacyLead[]> {
  const qs = new URLSearchParams({
    query: query || "web designer",
    geo: "Riyadh",
    count: String(Math.max(1, Number(limit) || 1)),
  });
  const url = `${LEGACY_ENGINES_SVC_URL}/crawl4ai?${qs.toString()}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 290_000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`crawl4ai engine service HTTP ${res.status}`);
    const data: any = await res.json();
    if (!data || data.ok !== true || !Array.isArray(data.leads)) {
      throw new Error(`crawl4ai engine failed: ${data?.error ?? "no leads"}`);
    }
    return (data.leads as any[]).map((c, i) => toLegacyLead("crawl4ai", c, i));
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Map an ORIG engine-lead row onto the pipeline's lead shape, and drop the
 * ORIG-only fields (pain_signals, trigger_events, outreach_sequence) that the
 * pipeline does not carry. verified_real stays 0 until the pipeline's own
 * assembler verifies the row.
 */
function toLegacyLead(engine: LegacyEngine, c: any, i: number): LegacyLead {
  const hasEmail = !!(c.email || "").trim();
  const confidence = c.mx_valid && hasEmail ? "high" : c.mx_valid ? "medium" : "low";
  const score = c.mx_valid && hasEmail ? 80 : c.mx_valid ? 60 : 40;
  return {
    source_engine: engine,
    lead_id: c.lead_id || `${engine}_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 8)}`,
    twitter: c.twitter || "",
    email_source: hasEmail ? engine : "",
    company: (c.company || "").trim(),
    website: (c.website || (c.domain ? `https://${c.domain}` : "")).trim(),
    name: c.name || "",
    title: c.title || "",
    email: (c.email || "").trim(),
    phone: c.phone || "",
    linkedin: c.linkedin || "",
    industry: (c.industry || "").trim(),
    lead_score: Math.max(0, Math.min(Number(score), 100)),
    confidence,
    verified_real: 0,
    provenance_url: null,
    discovered_at: new Date().toISOString(),
    raw: c,
  };
}
