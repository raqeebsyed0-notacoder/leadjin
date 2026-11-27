/** Phase 3 — dataset lane parent verification (correct shapes). */
import { searchCompanies, getDataset, datasetStats, getCompany } from '../src/services/companyDataset.js';

function main() {
  const out: any = {};
  const ds: any = getDataset();
  out.records_loaded = Array.isArray(ds?.records) ? ds.records.length : null;
  out.load_reason = ds?.reason ?? null;
  out.stats = ds?.stats ?? datasetStats();

  const s1: any = searchCompanies({ query: '', limit: 5 });
  out.default_search = {
    hits: s1.hits?.length ?? null,
    licences: Array.from(new Set((s1.hits || []).map((h: any) => h.licence))),
    sample: (s1.hits || []).slice(0, 3).map((h: any) => ({ name: h.name, city: h.city, licence: h.licence })),
  };

  const s2: any = searchCompanies({ query: 'real estate', limit: 3 });
  out.query_search = { hits: s2.hits?.length ?? null, sample: (s2.hits || []).map((h: any) => h.name) };

  const s3: any = searchCompanies({ query: '', limit: 3, includeRestricted: true });
  out.restricted_search = {
    hits: s3.hits?.length ?? null,
    licences: Array.from(new Set((s3.hits || []).map((h: any) => h.licence))),
  };

  const one: any = getCompany(String((s1.hits?.[0] as any)?.cr || ''), {});
  out.get_company = { found: Boolean(one.record), licence: one.record?.licence ?? null, reason: one.reason };

  console.log(JSON.stringify(out, null, 2));
  process.exit(0);
}

main();
