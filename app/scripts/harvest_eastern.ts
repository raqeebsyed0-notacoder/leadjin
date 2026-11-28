/**
 * One-off comparison harness: runs LeadJin's real discovery pipeline for the
 * Eastern Province and prints a JSON summary. It calls the same
 * runLeadDiscovery the UI and Jin call — no second harvesting path.
 *
 * Port is moved off 3001 because server.ts binds on import.
 */
process.env.PORT = process.env.PORT || "3999";

const { runLeadDiscovery } = await import("../src/services/leadDiscoveryPipeline.js");

const input = {
  targetIndustry: "real estate",
  userServices: "B2B lead generation software",
  userCaseStudy: "",
  userCompetitors: "",
  geography: ["Dammam", "Al Khobar", "Dhahran", "Jubail", "Al Ahsa"],
  job_titles: ["CEO", "General Manager", "Sales Director", "Marketing Manager"],
  company_size: "10-500",
  limit: 20,
  sector: "real estate",
  geo: "Dammam",
  crs: [],
  engine: "ollama",
};

const t0 = Date.now();
const res = await runLeadDiscovery(input);
const ms = Date.now() - t0;

const leads = res.leads.map((l) => ({
  source: l.source_engine,
  company: l.company,
  name: l.name,
  title: l.title,
  email: l.email,
  phone: l.phone,
  linkedin: l.linkedin,
  website: l.website,
  city_hint: "",
  score: l.lead_score,
  confidence: l.confidence,
  verified_real: l.verified_real,
  provenance: l.provenance_url,
}));

console.log(
  JSON.stringify(
    {
      ran_ms: ms,
      engines_used: res.engines_used,
      errors: res.errors,
      count: leads.length,
      with_email: leads.filter((l) => l.email).length,
      with_phone: leads.filter((l) => l.phone).length,
      with_person: leads.filter((l) => l.name && l.name !== l.company).length,
      verified: leads.filter((l) => l.verified_real === 1).length,
      leads,
    },
    null,
    2,
  ),
);
process.exit(0);
