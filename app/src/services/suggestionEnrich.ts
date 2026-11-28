import Database from 'better-sqlite3';
import { analyzeVisionAlignment } from './outreach-writer.js';
import { getGenAI } from './genaiClient.js';

export interface LeadForEnrichment {
  lead_id: string;
  company?: string;
  industry?: string;
}

export interface EnrichOptions {
  vision2030?: boolean;
  majlisMode?: boolean;
  targetIndustry?: string;
  limit?: number;
}

/**
 * Background, per-lead enrichment of freshly harvested leads with:
 *   - vision_2030_program + vision_2030_score (when opts.vision2030)
 *   - majlis_tips                            (when opts.majlisMode)
 *
 * Designed to run outside the harvest response (setImmediate). Never throws
 * out of the function: per-lead failures are captured as named reason strings.
 */
export async function enrichLeadSuggestions(
  db: Database.Database,
  userId: number,
  leads: LeadForEnrichment[],
  opts: EnrichOptions
): Promise<{ enriched: number; errors: string[] }> {
  const errors: string[] = [];
  const total = leads.length;
  const count = Math.min(opts.limit ?? 5, total);

  for (let i = 0; i < count; i++) {
    const lead = leads[i];
    if (!lead || typeof lead.lead_id !== 'string') continue;
    const company = (lead.company || 'Saudi company').trim();
    const industry =
      (lead.industry || opts.targetIndustry || 'Business Services').trim();

    if (opts.vision2030) {
      try {
        const alignment = await analyzeVisionAlignment(company, industry);
        db.prepare(
          'UPDATE leads SET vision_2030_program = ?, vision_2030_score = ? WHERE lead_id = ? AND user_id = ?'
        ).run(
          alignment.primaryProgram,
          Math.round(alignment.alignmentScore),
          lead.lead_id,
          userId
        );
      } catch (e: unknown) {
        errors.push(`${lead.lead_id}: vision failed: ${(e as Error).message}`);
      }
    }

    if (opts.majlisMode) {
      try {
        const genAI = getGenAI();
        const prompt =
          `Give exactly 3 short, practical cultural tips (one per line, max 12 words each) for a first business meeting with ${company} in Saudi Arabia. No numbering, no preamble.`;
        const result = await genAI.models.generateContent({
          model: 'flash',
          contents: prompt,
        });
        const tips = typeof result?.text === 'string'
          ? result.text
              .split(/\r?\n/)
              .map((line) => line.trim().replace(/^[-*•]\s*/, ''))
              .filter((line) => line.length > 0)
              .slice(0, 3)
          : [];
        db.prepare('UPDATE leads SET majlis_tips = ? WHERE lead_id = ? AND user_id = ?').run(
          JSON.stringify(tips),
          lead.lead_id,
          userId
        );
      } catch (e: unknown) {
        errors.push(`${lead.lead_id}: majlis failed: ${(e as Error).message}`);
      }
    }
  }

  return { enriched: count, errors };
}
