import Database from "better-sqlite3";

const dbPath = process.env.DATABASE_PATH || "/home/euphoria/euphoria-v2/work/leadjin/app/leadjin.db";
const db = new Database(dbPath, { readonly: true });
const lead = db
  .prepare(
    "SELECT * FROM leads WHERE company <> '' AND website <> '' AND company IS NOT NULL ORDER BY created_at DESC LIMIT 1",
  )
  .get() as any;

if (!lead) {
  console.log(JSON.stringify({ ok: false, error: "no lead with company+website in runtime DB" }));
  process.exit(1);
}

const { buildProposalContent, writeProposalFiles } = await import("../src/services/proposalRenderer.js");
const { agentReachLeg } = await import("../src/services/agentReachLeg.js");

const leadShape = {
  lead_id: lead.lead_id,
  name: lead.name,
  title: lead.title,
  company: lead.company,
  industry: lead.industry,
  website: lead.website,
  email: lead.email,
  phone: lead.phone,
  city: "",
};

const out: any = { lead: { company: lead.company, website: lead.website, industry: lead.industry } };

const en = buildProposalContent({ lead: leadShape, operator: { name: "Euphoria Experiences" }, locale: "en" });
const ar = buildProposalContent({ lead: leadShape, operator: { name: "Euphoria Experiences" }, locale: "ar" });

const dir = "/home/euphoria/euphoria-v2/work/leadjin/proposals";
out.en = await writeProposalFiles(en, leadShape, { dir, stem: "sample-en" });
out.ar = await writeProposalFiles(ar, leadShape, { dir, stem: "sample-ar" });

const domain = (lead.website || "").replace(/^https?:\/\//, "").replace(/\/.*$/, "");
const arLeg = await agentReachLeg(lead.company || "company", domain, "");
out.agent_reach = {
  domain,
  contacts: arLeg.contacts.length,
  rows: arLeg.contacts.slice(0, 4).map((c) => ({
    name: c.name, email: c.email, phone: c.phone, source: c.source, evidence: c.evidence_url,
  })),
  errors: arLeg.errors.slice(0, 5),
};

console.log(JSON.stringify(out, null, 2));
process.exit(0);
