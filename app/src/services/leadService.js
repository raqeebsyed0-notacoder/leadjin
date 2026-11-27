/**
 * Lead Service — Lead generation and harvesting for LeadJin.
 *
 * The single shared discovery pipeline (leadDiscoveryPipeline.ts) owns the
 * waterfall: cache -> Places -> Wathq -> model-driven discovery -> assemble.
 * This service keeps the exported name/signature used by server.ts so the
 * harvest endpoint keeps working; it now delegates to the pipeline instead of
 * returning a bare empty array, and never returns an empty result without an
 * explicit errors entry explaining which stages ran and why each produced
 * nothing.
 */
import { runLeadDiscovery } from "./leadDiscoveryPipeline.js";

export async function generateLeadjinLeads(params) {
  const input = {
    targetIndustry: params.targetIndustry || params.userIndustry || "Technology",
    userServices: params.userServices || "",
    userCaseStudy: params.userCaseStudy || "",
    userCompetitors: params.userCompetitors || "",
    geography: params.geography || ["Saudi Arabia"],
    job_titles: params.job_titles || ["CEO", "CTO", "Director"],
    company_size: params.company_size || "10-200",
    limit: params.limit || 10,
    userApiKey: params.userApiKey,
    majlisMode: params.majlisMode || false,
    vision2030: params.vision2030 || false,
    sector: params.sector || params.targetIndustry,
    geo: params.geo || (Array.isArray(params.geography) ? params.geography[0] : params.geography),
    crs: params.crs || [],
    engine: params.engine || "ollama",
  };

  const result = await runLeadDiscovery(input);
  return result.leads;
}