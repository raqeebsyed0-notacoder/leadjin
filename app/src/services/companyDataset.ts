/**
 * companyDataset.ts — CC0-only, auth-gated retrieval contract over the
 * LeadJin 6,701-company intelligence set.
 *
 * Default behaviour returns ONLY the 6,520 CC0-clean records. The 133
 * research-only records (directory sources with no reuse grant) and the
 * 48 DBpedia CC-BY-SA attribution-bound records are excluded by default;
 * they are only reachable through `includeRestricted:true` and then carry
 * their licence label so they are never presented as cleared intelligence
 * and never exposed as training material.
 *
 * Lazy, cached loader: a module-level singleton that loads on first use and
 * blocks nothing at import or boot time. When the dataset directory or any
 * file is missing every call returns an empty result with a typed `reason`
 * and never throws at import time.
 */

import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The licence / clearance tier of a company record. */
export type Licence = 'cc0' | 'research-only' | 'dbpedia-cc-by-sa';

export interface CompanyHit {
  /** Canonical record id (`company_id`). */
  cr: string;
  /** Company trading or legal name. */
  name: string;
  /** Taxonomy level 2. */
  sector: string;
  /** Primary city of the registered address. */
  city: string;
  /** Licence / clearance tier of this record. */
  licence: Licence;
  /** Flat text fed to the retrieval index (name, categories, city, website). */
  retrieval_text?: string;
  /** Simple relevance score (0 = no match, higher = better). */
  score?: number;
}

export interface DatasetStats {
  /** Total canonical company records loaded. */
  canonical_records: number;
  /** Records returned by default (CC0-clean + DBpedia attribution-bound). */
  cleared: number;
  /** Records excluded by default (research-only). */
  restricted: number;
  /** Rows in the Jin retrieval export. */
  retrieval_rows: number;
  /** Rows in the Laya decision export. */
  decisions: number;
  /** Training split row counts, measured from files. */
  training: { train: number; dev: number; test: number };
}

export interface SearchParams {
  /** Free-text match against retrieval_text (substring, case-insensitive). */
  query?: string;
  /** Exact taxonomy-level-2 sector filter. */
  sector?: string;
  /** Exact city filter. */
  city?: string;
  /** Maximum number of hits to return. Default 10. */
  limit?: number;
  /** If true, also return research-only and DBpedia records (with their licence). */
  includeRestricted?: boolean;
}

export interface SearchResult {
  hits: CompanyHit[];
  reason: string | null;
}

export interface GetCompanyOptions {
  /** If true, return research-only / DBpedia records too (they carry a licence). */
  includeRestricted?: boolean;
}

export interface GetResult {
  record: CompanyHit | null;
  reason: string | null;
}

export interface DatasetStatsResult {
  stats: DatasetStats;
  reason: string | null;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export const DEFAULT_DATASET_DIR =
  '/home/euphoria/euphoria-v2/work/leadjin/intelligence';

export function resolveDatasetDir(configDir?: string): string {
  return configDir || process.env.LEADJIN_DATASET_DIR || DEFAULT_DATASET_DIR;
}

// ---------------------------------------------------------------------------
// Loader (lazy, cached singleton)
// ---------------------------------------------------------------------------

interface RawJinRow {
  company_id: string;
  name: string;
  industry: string;
  sector: string;
  subsector: string;
  niche: string;
  city: string;
  products_services: string[] | null;
  activities: string[];
  website: string;
  domain: string;
  sources: string[];
  reuse_cleared: boolean;
}

interface LoadedDataset {
  records: CompanyHit[];
  stats: DatasetStats;
  reason: string | null;
}

let cached: LoadedDataset | null = null;

function readJsonl<T>(filePath: string): T[] {
  const raw = fs.readFileSync(filePath, 'utf8');
  const lines = raw.split(/\r?\n/);
  return lines
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as T);
}

function classifyLicence(sources: string[], reuseCleared: boolean): Licence {
  // DBpedia rows are attribution-bound (CC-BY-SA) and are never cleared by
  // default, even though `reuse_cleared` flags them true.
  if (Array.isArray(sources) && sources.some((s) => s === 'dbpedia')) {
    return 'dbpedia-cc-by-sa';
  }
  if (reuseCleared === false) {
    return 'research-only';
  }
  return 'cc0';
}

function buildRetrievalText(row: RawJinRow): string {
  const parts = [
    row.name,
    row.industry,
    row.sector,
    row.subsector,
    row.niche,
    row.city,
    row.website,
    ...(row.activities || []),
    ...(row.products_services || []),
  ];
  return parts.filter((p): p is string => typeof p === 'string').join(' | ');
}

function _loadDataset(dir: string): LoadedDataset {
  const reason: string | null = null;
  try {
    const canonical = readJsonl<Record<string, unknown>>(
      path.join(dir, 'canonical', 'companies.jsonl')
    );
    const jinRetrieval = readJsonl<RawJinRow>(
      path.join(dir, 'exports', 'jin-retrieval.jsonl')
    );
    const layaDecisions = readJsonl<Record<string, unknown>>(
      path.join(dir, 'exports', 'laya-decisions.jsonl')
    );

    // Index retrieval rows by company_id for an O(1) join.
    const retrievalByCr = new Map<string, RawJinRow>();
    for (const row of jinRetrieval) {
      retrievalByCr.set(row.company_id, row);
    }

    const records: CompanyHit[] = [];
    for (const raw of canonical) {
      const cr = raw['company_id'] as string | undefined;
      const jin = retrievalByCr.get(cr || '');
      if (!cr) continue;

      const sources = jin?.sources || [];
      const reuseCleared = jin?.reuse_cleared ?? false;
      const licence = classifyLicence(sources, reuseCleared);

      records.push({
        cr,
        name: jin?.name || raw['facts']?.['name'] || cr,
        sector: jin?.sector || '',
        city: jin?.city || '',
        licence,
        retrieval_text: jin ? buildRetrievalText(jin) : undefined,
      });
    }

    // Training split row counts, measured from files.
    const countTrain = () => {
      try {
        return readJsonl<Record<string, unknown>>(
          path.join(dir, 'training', 'train.jsonl')
        ).length;
      } catch {
        return 0;
      }
    };
    const countDev = () => {
      try {
        return readJsonl<Record<string, unknown>>(
          path.join(dir, 'training', 'heldout.jsonl')
        ).length;
      } catch {
        return 0;
      }
    };
    const countTest = () => {
      try {
        return readJsonl<Record<string, unknown>>(
          path.join(dir, 'training', 'classify.jsonl')
        ).length;
      } catch {
        return 0;
      }
    };

    const stats: DatasetStats = {
      canonical_records: records.length,
      cleared: records.filter((r) => r.licence !== 'research-only').length,
      restricted: records.filter((r) => r.licence === 'research-only').length,
      retrieval_rows: jinRetrieval.length,
      decisions: layaDecisions.length,
      training: {
        train: countTrain(),
        dev: countDev(),
        test: countTest(),
      },
    };

    return { records, stats, reason };
  } catch (err) {
    return {
      records: [],
      stats: {
        canonical_records: 0,
        cleared: 0,
        restricted: 0,
        retrieval_rows: 0,
        decisions: 0,
        training: { train: 0, dev: 0, test: 0 },
      },
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}

export function getDataset(config?: { dir?: string }): LoadedDataset {
  if (cached) return cached;
  cached = _loadDataset(resolveDatasetDir(config?.dir));
  return cached;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function searchCompanies(params: SearchParams): SearchResult {
  const ds = getDataset();
  if (ds.reason) return { hits: [], reason: ds.reason };

  const { query, sector, city, limit = 10, includeRestricted = false } = params;
  let rows = ds.records.filter((r) => includeRestricted || r.licence === 'cc0');

  if (sector) {
    rows = rows.filter((r) => r.sector.toLowerCase() === sector.toLowerCase());
  }
  if (city) {
    rows = rows.filter((r) => r.city.toLowerCase() === city.toLowerCase());
  }
  if (query) {
    const q = query.toLowerCase();
    rows = rows.filter((r) => (r.retrieval_text || '').toLowerCase().includes(q));
  }

  // Simple relevance scoring: weighted term matches.
  if (query) {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    for (const r of rows) {
      let score = 0;
      for (const t of terms) {
        if (r.name?.toLowerCase().includes(t)) score += 3;
        if (r.sector?.toLowerCase().includes(t)) score += 2;
        if (r.city?.toLowerCase().includes(t)) score += 2;
        if (r.retrieval_text?.toLowerCase().includes(t)) score += 1;
      }
      r.score = score;
    }
  }

  rows.sort((a, b) => (b.score || 0) - (a.score || 0));
  return { hits: rows.slice(0, limit), reason: null };
}

export function getCompany(
  idOrCr: string,
  options?: GetCompanyOptions
): GetResult {
  const ds = getDataset();
  if (ds.reason) return { record: null, reason: ds.reason };

  const row = ds.records.find((r) => r.cr === idOrCr);
  if (!row) return { record: null, reason: null };

  if (!options?.includeRestricted && row.licence !== 'cc0') {
    return { record: null, reason: 'restricted record not requested' };
  }
  return { record: row, reason: null };
}

export function datasetStats(): DatasetStatsResult {
  const ds = getDataset();
  if (ds.reason) {
    return { stats: emptyStats(), reason: ds.reason };
  }
  return { stats: ds.stats, reason: null };
}

function emptyStats(): DatasetStats {
  return {
    canonical_records: 0,
    cleared: 0,
    restricted: 0,
    retrieval_rows: 0,
    decisions: 0,
    training: { train: 0, dev: 0, test: 0 },
  };
}
