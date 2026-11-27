/**
 * Phase 3 probe — restores the shared lead-discovery pipeline.
 *
 * Imports runLeadDiscovery directly (no HTTP, no auth), runs the pipeline
 * against the live local writer (gemma4:e4b via Ollama) and prints JSON:
 *
 *   { engines_used, errors, leads:[{ company, website, name, title, source_engine, verified_real }] }
 *
 * Run: npx tsx scripts/phase3-probe-harvest.mjs
 */
const input = {
  targetIndustry: "real estate",
  userServices: "CRM automation",
  geography: ["Riyadh"],
  job_titles: ["CEO"],
  limit: 3,
};

const main = async () => {
  // Operational env MUST be set before the dynamic import, otherwise
  // the pipeline's import of server.js boots the App on the live port 3001.
  process.env.DATABASE_PATH =
    "/home/euphoria/euphoria-v2/work/leadjin/app/leadjin.db";
  process.env.PORT = "3002";

  const { runLeadDiscovery } = await import("../src/services/leadDiscoveryPipeline.js");
  const result = await runLeadDiscovery(input);

  const out = {
    engines_used: result.engines_used,
    errors: result.errors,
    leads: result.leads.map((l) => ({
      company: l.company,
      website: l.website,
      name: l.name,
      title: l.title,
      source_engine: l.source_engine,
      verified_real: l.verified_real,
    })),
  };

  console.log(JSON.stringify(out, null, 2));
  process.exit(0);
};

main().catch((err) => {
  console.error(JSON.stringify({ error: err.message }));
  process.exit(1);
});
