/** Reproduce the harvest 500: pipeline direct, no HTTP. */
import { runLeadDiscovery } from '../src/services/leadDiscoveryPipeline.js';

async function main() {
  const out: any = {};
  try {
    const r: any = await runLeadDiscovery({
      targetIndustry: 'logistics',
      userServices: 'fleet management software',
      geography: ['Riyadh'],
      job_titles: ['CEO'],
      limit: 2,
      sector: 'logistics',
      geo: 'Riyadh',
      crs: [],
      engine: 'ollama',
    } as any);
    out.ok = true;
    out.engines_used = r.engines_used;
    out.errors = r.errors;
    out.leads = (r.leads || []).length;
  } catch (e: any) {
    out.ok = false;
    out.thrown = String(e?.message ?? e);
    out.stack = String(e?.stack ?? '').split('\n').slice(0, 6).join(' | ');
  }
  console.log(JSON.stringify(out, null, 2));
  process.exit(0);
}

main();
