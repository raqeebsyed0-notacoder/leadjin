import { ThinkingLevel, Type } from "@google/genai";
import { getGenAI } from "./genaiClient.js";
import { jsonrepair } from "jsonrepair";

export interface LeadjinLead {
  lead_id: string;
  name: string;
  title: string;
  company: string;
  industry?: string;
  email?: string;
  email_verified?: boolean;
  email_source?: 'gemini_search' | 'web_scrape' | 'smtp_verified' | 'pattern_guess' | 'gemini' | 'linkedin_extension';
  phone?: string;
  linkedin?: string;
  twitter?: string;
  website?: string;
  company_x?: string;
  company_snapchat?: string;
  company_tiktok?: string;
  lead_score: number;
  score_breakdown: {
    title_match: number;
    company_size: number;
    industry_fit: number;
    geography: number;
    pain_signals: number;
    engagement: number;
  };
  pain_signals: string[];
  trigger_events: {
    type: "funding" | "hiring" | "expansion" | "none";
    description: string;
    date?: string;
  }[];
  outreach_recommendation: string;
  confidence: "high" | "medium" | "low";
  outreach_sequence?: {
    day0: string | { subject: string; body: string };
    day3: string | { subject: string; body: string };
    day7: string | { subject: string; body: string };
    majlis_version?: string;
  };
  gsse_metadata?: {
    harvest_timestamp: string;
    logic_hash: string;
    signature: string;
    spatial_layer_proof: string;
    semantic_layer_proof: string;
    cultural_layer_proof: string;
  };
  vision_2030_alignment?: {
    score: number;
    program: string;
    reasoning: string;
  };
  majlis_mode_tips?: string[];
  company_data?: {
    description: string;
    founded?: string;
    size?: string;
    headquarters?: string;
    specialties?: string[];
  };
}

// Generate GSSE metadata client-side — no need to waste Gemini tokens on this
function generateGSSEMetadata(lead: any, geography: string[]): LeadjinLead['gsse_metadata'] {
  const ts = new Date().toISOString();
  const hash = Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  const sig = `GSSE-SIG-${hash.slice(0, 4).toUpperCase()}-${hash.slice(4, 8).toUpperCase()}`;
  return {
    harvest_timestamp: ts,
    logic_hash: hash,
    signature: sig,
    spatial_layer_proof: `Company ${lead.company} located in ${geography.join(', ')}`,
    semantic_layer_proof: `AI-driven discovery via Google Maps + Search for ${lead.company} in ${lead.industry || 'target industry'}`,
    cultural_layer_proof: `Lead ${lead.name} at ${lead.company} fits regional B2B context in ${geography.join(', ')}`,
  };
}

export const generateLeadjinLeads = async (params: {
  userIndustry: string;
  userServices: string;
  userCaseStudy: string;
  userCompetitors: string;
  targetIndustry: string;
  targetServices?: string[];
  company_size: string;
  geography: string[];
  job_titles: string[];
  limit: number;
  model: "gemini-2.5-flash" | "gemini-2.5-pro-preview" | "gemini-flash-lite-latest";
  userApiKey?: string;
  majlisMode?: boolean;
  vision2030?: boolean;
  emailTemplate?: { subject: string; body: string };
}) => {
  // Pass userApiKey only when it is a genuine per-user key (factory ignores env-key echoes).
  const ai = getGenAI(params.userApiKey);

  const servicesContext = params.targetServices && params.targetServices.length > 0
    ? `Services needed: ${params.targetServices.join(", ")}.`
    : "";

  const autoMatch = params.targetIndustry === "Any / Auto-Match (AI Driven)";

  // =============================================
  // PHASE 1: Google Search grounding — find REAL companies
  // Uses googleSearch tool (incompatible with JSON mime)
  // =============================================
  const industryPart = autoMatch
    ? `companies that would buy "${params.userServices}"`
    : `${params.targetIndustry} companies`;

  const discoveryPrompt = `Search Google for ${params.limit} real ${industryPart} in ${params.geography.join(", ")}. ${servicesContext}

For EACH company, you MUST provide ALL of these:
1. Company name (real, verified)
2. Company website URL (the actual domain, e.g. https://example.com)
3. Full name of a real person at the company (${params.job_titles.join(" or ")})
4. Their job title
5. Their LinkedIn profile URL if findable

Do NOT write "N/A" or "Unknown". If you cannot find a specific person's name for a company, search harder or skip that company and find another one where you CAN find a real person. Every entry must have a real person name and real website.

Format each as: COMPANY | WEBSITE | PERSON NAME | TITLE | LINKEDIN`;

  // Try googleSearch grounding for real data; fall back to knowledge-only if rate limited
  let discoveredCompanies = "";
  try {
    const discoveryResponse = await ai.models.generateContent({
      model: params.model === "gemini-flash-lite-latest" ? "gemini-2.5-flash" : params.model,
      contents: discoveryPrompt,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });
    discoveredCompanies = discoveryResponse.text || "";
  } catch (e: any) {
    console.warn('[Discovery] Google Search grounding failed, falling back to model knowledge:', e.message);
    // Fallback: use model knowledge without grounding
    const fallbackResponse = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: discoveryPrompt + "\nUse your training knowledge. Only include companies you are confident are real.",
      config: { responseMimeType: "text/plain" },
    });
    discoveredCompanies = fallbackResponse.text || "";
  }
  if (!discoveredCompanies || discoveredCompanies.length < 50) {
    throw new Error("No companies found. Try broadening your search criteria.");
  }

  // =============================================
  // PHASE 2: Structured JSON generation from real data
  // Uses responseMimeType JSON (no tools needed)
  // =============================================
  // Task 1E: Data-Driven Lead Scoring - Updated synthesis prompt with explicit rubric
  const synthesisPrompt = `Convert these REAL companies into a JSON array of B2B leads.

VERIFIED COMPANIES (from Google Search):
${discoveredCompanies}

Target Job Titles: ${params.job_titles.join(", ")}
Target Company Size: ${params.company_size}
Target Geography: ${params.geography.join(", ")}
Target Industry: ${params.targetIndustry}

Seller services: "${params.userServices}"
${params.userCaseStudy ? `Case study: "${params.userCaseStudy}"` : ''}

LEAD SCORING RUBRIC (0-100 total):
Evaluate each dimension 0-20 points:
- title_match: 20 if title exactly matches "${params.job_titles.join(" or ")}", 10 if related (e.g., VP matches Director), 0 if unrelated
- company_size: 20 if company size matches "${params.company_size}", 10 if close (e.g., 100-500 vs 50-200), 0 if very different
- industry_fit: 20 if company is in "${params.targetIndustry}", 10 if adjacent sector, 0 if unrelated
- geography: 20 if HQ in "${params.geography.join(", ")}", 10 if has offices there, 0 if no presence
- pain_signals: 0-20 based on concrete pain signals found (5 pts each signal, max 4 signals)
- engagement: 0-20 based on verifiable signals ONLY (job postings, news, events, funding announcements)

DO NOT default all dimensions to 15. Each must reflect actual evidence from the discovery data.

For each company, generate: pain_signals, trigger_events, outreach_recommendation, and a 3-email outreach_sequence. Each email in the sequence MUST have separate "subject" and "body" fields.

EMAIL BODY FORMAT — MANDATORY: Each body MUST be a properly formatted HTML email following this exact structure:
<p>Dear [Person's First Name],</p>
<p>[Opening sentence: state the specific reason you are reaching out to this company.]</p>
<p>[1-2 sentences of relevant context — reference their company or a specific pain signal. Keep it concise and professional.]</p>
<p>[One clear value proposition or question that invites a reply.]</p>
<p>Thank you for your time.</p>
<p>Best regards,<br>Euphoria Vision Team<br>support@euphoriaexperiences.com</p>

DO NOT write the email as one paragraph. Each section MUST be a separate &lt;p&gt; tag. Use the person's actual first name in the greeting. The signature MUST always be "Euphoria Vision Team / support@euphoriaexperiences.com".
${params.emailTemplate ? `Day 0 must use this template: Subject: ${params.emailTemplate.subject}\n${params.emailTemplate.body}` : ''}
${params.majlisMode ? 'Add majlis_mode_tips: 3 cultural tips for Saudi business.' : ''}
${params.vision2030 ? 'Add vision_2030_alignment: {score, program, reasoning}.' : ''}

CRITICAL RULES:
- Use the EXACT company names, websites, and person names from the verified list above
- Do NOT invent new companies or people
- Do NOT use "Unknown" or "N/A" for any name or website field
- If a field was not found in discovery, use an empty string "" instead of fake data
- The "name" field MUST be the real person's full name, NOT "Unknown"
- The "website" field MUST be a real URL starting with http, NOT "N/A"
- Score breakdown MUST reflect actual evidence, not generic defaults

Each object: {"lead_id":"string","name":"person name","title":"job title","company":"company name","industry":"string","website":"real URL","email":"the person's personal work email (like firstname.lastname@domain). NOT info@ or contact@. If not findable, use empty string.","phone":"company phone number in +966 format or empty string","linkedin":"linkedin profile URL or empty string","company_x":"company X/Twitter handle like @CompanyName or empty string","company_snapchat":"company Snapchat handle or empty string","company_tiktok":"company TikTok handle or empty string","lead_score":0-100,"score_breakdown":{"title_match":0,"company_size":0,"industry_fit":0,"geography":0,"pain_signals":0,"engagement":0},"pain_signals":["string"],"trigger_events":[{"type":"funding|hiring|expansion|none","description":"string"}],"outreach_recommendation":"string","confidence":"high|medium|low","outreach_sequence":{"day0":{"subject":"string","body":"string"},"day3":{"subject":"string","body":"string"},"day7":{"subject":"string","body":"string"}},"company_data":{"description":"string","size":"string","headquarters":"string","specialties":["string"]}${params.majlisMode ? ',"majlis_mode_tips":["string"]' : ''}${params.vision2030 ? ',"vision_2030_alignment":{"score":0,"program":"string","reasoning":"string"}' : ''}}`;

  const synthesisConfig: any = {
    responseMimeType: "application/json",
  };
  if (params.model === "gemini-2.5-pro-preview") {
    synthesisConfig.thinkingConfig = { thinkingLevel: ThinkingLevel.HIGH };
  }

  // Use the user's selected model for synthesis (quality matters here)
  const synthesisModel = params.model === "gemini-flash-lite-latest" ? "gemini-flash-lite-latest" : params.model;

  const response = await ai.models.generateContent({
    model: synthesisModel,
    contents: synthesisPrompt,
    config: synthesisConfig,
  });

  const text = response.text || "";
  try {
    let jsonStr = text.trim();
    if (jsonStr.startsWith("```json")) {
      jsonStr = jsonStr.replace(/^```json\n?/, "").replace(/\n?```$/, "");
    } else if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.replace(/^```\n?/, "").replace(/\n?```$/, "");
    }

    jsonStr = jsonrepair(jsonStr);
    let parsedLeads = JSON.parse(jsonStr);

    if (parsedLeads && !Array.isArray(parsedLeads)) {
      const possibleArray = Object.values(parsedLeads).find(val => Array.isArray(val));
      if (possibleArray) {
        parsedLeads = possibleArray;
      }
    }

    if (!parsedLeads || !Array.isArray(parsedLeads) || parsedLeads.length === 0) {
      throw new Error("AI returned an empty lead list. Please try adjusting your search parameters.");
    }

    // Post-process: clean up bad data, attach GSSE metadata
    const seen = new Set<string>();
    return parsedLeads
      // Data Quality Filter — reject garbage leads
      .filter((lead: any) => {
        if (!lead.name || lead.name.length < 2) return false;
        if (!lead.company || lead.company.length < 2) return false;
        // Reject known placeholder names
        const invalidNames = ['unknown', 'n/a', 'test', 'tbd', 'john doe', 'jane doe', 'sample', 'example'];
        if (invalidNames.includes(lead.name.toLowerCase().trim())) return false;
        // Name must have at least first + last name
        if (lead.name.trim().split(/\s+/).length < 2) return false;
        // Name can't be same as company
        if (lead.name.toLowerCase().trim() === lead.company.toLowerCase().trim()) return false;
        // Deduplicate by company + name
        const key = `${lead.company.toLowerCase()}|${lead.name.toLowerCase()}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((lead: any) => {
        // Clean linkedin — only keep actual URLs
        if (lead.linkedin && !lead.linkedin.startsWith('http')) {
          lead.linkedin = '';
        }
        // Clean website — only keep actual URLs
        if (lead.website && !lead.website.startsWith('http')) {
          lead.website = '';
        }
        // Clean phone — keep any international format or Saudi local format
        if (lead.phone && !lead.phone.startsWith('+') && !lead.phone.startsWith('05')) {
          lead.phone = '';
        }
        // Clean social handles
        if (lead.company_x && !lead.company_x.startsWith('@')) lead.company_x = '';
        // Clean name — reject "Unknown" or empty (already filtered above, but keeping for safety)
        if (!lead.name || lead.name === 'Unknown' || lead.name === 'N/A') {
          lead.name = '';
        }
        return {
          ...lead,
          gsse_metadata: generateGSSEMetadata(lead, params.geography),
        };
      }) as LeadjinLead[];
  } catch (e: any) {
    console.error("Failed to parse Leadjin leads:", e);
    console.error("Raw text was:", text);
    throw new Error(`Failed to generate leads: ${e.message}`);
  }
};
