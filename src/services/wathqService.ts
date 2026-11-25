/**
 * wathqService.ts
 * WATHQ Saudi commercial-registry integration.
 *
 * Verified API contract (2026-06-03, observed live HTTP 200):
 *   GET {BASE}/fullinfo/{cr}?language=ar|en   header: apiKey: <consumer key>
 *   Sandbox BASE = https://api.wathq.sa/sandbox/commercial-registration
 *   Production BASE = set env WATHQ_BASE (no code change required).
 *
 * D11 compliance: national IDs (identity.id) are NEVER stored or returned.
 */

export interface WathqCompany {
  name: string | null;
  cr_number: string | null;
  cr_national: string | null;
  capital: string | number | null;
  status: string | null;
  hq_city: string | null;
  entity_type: string | null;
  ecommerce: boolean | null;
}

export interface WathqDecisionMaker {
  name: string | null;
  role: string;
  nationality: string | null;
  kind: 'partner' | 'management';
}

export interface WathqProvenance {
  source: 'wathq';
  api: string;
  retrieved_at: string;
  verified_real: boolean;
}

export interface WathqLead {
  company: WathqCompany;
  decision_makers: WathqDecisionMaker[];
  contact: unknown;
  provenance: WathqProvenance;
}

export interface WathqError {
  error: string;
  cr: string;
  status?: number;
}

/**
 * Whether the given base URL is pointing at real (non-sandbox) data.
 * Purely string-based — safe to call before a fetch or after a fetch failure.
 */
export function isRealBase(base: string): boolean {
  return !base.includes('/sandbox/');
}

/**
 * For ACTIVE registrations, WATHQ /fullinfo expects the unified National Number (7xxxxxxxxx),
 * NOT the normal CR number (1010.../4030...). A normal CR number is auto-converted via
 * /crNationalNumber/{cr}. Inputs already starting with '7' are treated as National Numbers.
 * On any conversion failure the original input is returned (sandbox tolerates CR numbers).
 */
export async function resolveNationalNumber(
  idInput: string,
  key: string,
  base: string,
): Promise<string> {
  const id = String(idInput).trim();
  if (id.startsWith('7')) return id; // already a National Number
  try {
    const res = await fetch(`${base}/crNationalNumber/${encodeURIComponent(id)}`, {
      headers: { apiKey: key, Accept: 'application/json' },
    });
    if (!res.ok) return id;
    const j = (await res.json()) as Record<string, unknown>;
    const nn = j['crNationalNumber'];
    return nn != null ? String(nn) : id;
  } catch {
    return id;
  }
}

/**
 * Extract decision-makers from a raw WATHQ node (partners or management).
 * Shape-tolerant: the node may be an array, or a dict with .managers/.members/.relations.
 * National IDs (identity.id) are intentionally DROPPED — D11.
 */
function _peopleFrom(
  node: unknown,
  kind: 'partner' | 'management',
): WathqDecisionMaker[] {
  let list: unknown[] = [];

  if (Array.isArray(node)) {
    list = node;
  } else if (node && typeof node === 'object') {
    const n = node as Record<string, unknown>;
    const inner = n['managers'] ?? n['members'] ?? n['relations'];
    if (Array.isArray(inner)) list = inner;
  }

  const out: WathqDecisionMaker[] = [];
  for (const p of list) {
    if (!p || typeof p !== 'object') continue;
    const person = p as Record<string, unknown>;

    // Build role string from partnership array, or fall back to positional fields.
    let role = '';
    const partnerships = person['partnership'];
    if (Array.isArray(partnerships)) {
      role = partnerships
        .filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null)
        .map(x => String(x['name'] ?? ''))
        .filter(Boolean)
        .join('/');
    }
    if (!role) {
      role =
        String(person['positionName'] ?? '') ||
        String(person['position'] ?? '') ||
        String(person['typeName'] ?? '') ||
        kind;
    }

    // nationality — nested object
    const natObj = person['nationality'];
    const nationality =
      natObj && typeof natObj === 'object'
        ? String((natObj as Record<string, unknown>)['name'] ?? '') || null
        : null;

    // identity.id is intentionally NOT included — D11
    out.push({
      name: person['name'] != null ? String(person['name']) : null,
      role,
      nationality,
      kind,
    });
  }
  return out;
}

/**
 * Fetch and map a WATHQ commercial-registration full-info record.
 *
 * Reads WATHQ_CONSUMER_KEY and WATHQ_BASE from process.env on every call
 * so that env overrides (e.g. pointing WATHQ_BASE at production) take effect
 * without restarting the process.
 *
 * @throws {WathqError} on HTTP errors or missing credentials.
 */
export async function fetchWathqLead(
  cr: string,
  lang: 'ar' | 'en' = 'ar',
): Promise<WathqLead> {
  const key = process.env.WATHQ_CONSUMER_KEY;
  if (!key) {
    throw Object.assign(new Error('WATHQ_CONSUMER_KEY not set'), { cr, status: 503 });
  }

  const base =
    process.env.WATHQ_BASE ??
    'https://api.wathq.sa/sandbox/commercial-registration';

  // Active CRs must be queried by National Number; auto-convert a normal CR number.
  const id = await resolveNationalNumber(cr, key, base);
  const url = `${base}/fullinfo/${encodeURIComponent(id)}?language=${lang}`;

  let data: Record<string, unknown>;
  try {
    const res = await fetch(url, {
      headers: {
        apiKey: key,
        Accept: 'application/json',
      },
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      const err: WathqError = {
        error: `HTTP ${res.status}`,
        cr,
        status: res.status,
      };
      const e = Object.assign(new Error(`WATHQ HTTP ${res.status}: ${body.slice(0, 200)}`), err);
      throw e;
    }

    data = (await res.json()) as Record<string, unknown>;
  } catch (e: unknown) {
    // Re-throw structured errors directly; wrap raw errors.
    if (e instanceof Error && 'cr' in e) throw e;
    throw Object.assign(
      new Error(`WATHQ fetch failed: ${e instanceof Error ? e.message : String(e)}`),
      { cr, status: 500 },
    );
  }

  // Map status — may be an object with .name or a string.
  const rawStatus = data['status'];
  const statusName =
    rawStatus && typeof rawStatus === 'object'
      ? String((rawStatus as Record<string, unknown>)['name'] ?? '') || null
      : rawStatus != null
      ? String(rawStatus)
      : null;

  const decisionMakers: WathqDecisionMaker[] = [
    ..._peopleFrom(data['parties'], 'partner'),
    ..._peopleFrom(data['management'], 'management'),
  ];

  return {
    company: {
      name: data['name'] != null ? String(data['name']) : null,
      cr_number: data['crNumber'] != null ? String(data['crNumber']) : null,
      cr_national: data['crNationalNumber'] != null ? String(data['crNationalNumber']) : null,
      capital: (data['crCapital'] as string | number | null) ?? null,
      status: statusName,
      hq_city: data['headquarterCityName'] != null ? String(data['headquarterCityName']) : null,
      entity_type:
        data['entityType'] != null
          ? typeof data['entityType'] === 'object'
            ? String((data['entityType'] as Record<string, unknown>)['name'] ?? '') || null
            : String(data['entityType'])
          : null,
      ecommerce: data['hasEcommerce'] != null ? Boolean(data['hasEcommerce']) : null,
    },
    decision_makers: decisionMakers,
    contact: data['contactInfo'] ?? null,
    provenance: {
      source: 'wathq',
      api: url,
      retrieved_at: new Date().toISOString(),
      verified_real: isRealBase(base),
    },
  };
}
