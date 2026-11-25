import { GoogleGenAI } from "@google/genai";
import { getGenAI } from "./genaiClient.js";
import { jsonrepair } from "jsonrepair";

export interface IntentSignal {
  type: 'job_change' | 'funding' | 'hiring' | 'news' | 'expansion' | 'tech_adoption';
  title: string;
  description: string;
  source: string;
  url?: string;
  confidence: number;
  detected_at: string;
  company?: string;
}

interface CacheEntry {
  signals: IntentSignal[];
  expires_at: number;
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

class IntentSignalService {
  private cache = new Map<string, CacheEntry>();

  private getAI(): GoogleGenAI {
    return getGenAI();
  }

  private getCached(key: string): IntentSignal[] | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expires_at) {
      this.cache.delete(key);
      return null;
    }
    return entry.signals;
  }

  private setCache(key: string, signals: IntentSignal[]): void {
    this.cache.set(key, {
      signals,
      expires_at: Date.now() + CACHE_TTL_MS,
    });
  }

  private parseSignalsFromText(text: string, company: string): IntentSignal[] {
    try {
      let jsonStr = text.trim();
      // Strip markdown code fences if present
      if (jsonStr.startsWith("```json")) {
        jsonStr = jsonStr.replace(/^```json\n?/, "").replace(/\n?```$/, "");
      } else if (jsonStr.startsWith("```")) {
        jsonStr = jsonStr.replace(/^```\n?/, "").replace(/\n?```$/, "");
      }

      // Find the JSON array in the response (Gemini sometimes adds prose before/after)
      const arrayStart = jsonStr.indexOf('[');
      const arrayEnd = jsonStr.lastIndexOf(']');
      if (arrayStart !== -1 && arrayEnd !== -1) {
        jsonStr = jsonStr.slice(arrayStart, arrayEnd + 1);
      }

      jsonStr = jsonrepair(jsonStr);
      const parsed = JSON.parse(jsonStr);

      if (!Array.isArray(parsed)) return [];

      const now = new Date().toISOString();
      return parsed
        .filter((item: any) => item && typeof item === 'object' && item.title)
        .map((item: any): IntentSignal => ({
          type: ['job_change', 'funding', 'hiring', 'news', 'expansion', 'tech_adoption'].includes(item.type)
            ? item.type
            : 'news',
          title: String(item.title || '').trim(),
          description: String(item.description || '').trim(),
          source: String(item.source || 'Gemini Search').trim(),
          url: item.url ? String(item.url).trim() : undefined,
          confidence: typeof item.confidence === 'number'
            ? Math.min(100, Math.max(0, item.confidence))
            : 50,
          detected_at: now,
          company,
        }))
        .filter(s => s.title.length > 0);
    } catch (e: any) {
      console.warn('[IntentSignals] Failed to parse Gemini response:', e.message);
      return [];
    }
  }

  async detectSignals(company: string, domain?: string): Promise<IntentSignal[]> {
    const cacheKey = `signals:${company.toLowerCase()}`;
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    const domainPart = domain ? ` (${domain})` : '';
    const prompt = `Search for recent business news and signals about "${company}"${domainPart}. Find:
1. Funding rounds or investments (last 90 days)
2. Key leadership hires or changes
3. Office expansions or new market entries
4. Major contract wins or partnerships
5. Technology adoptions
6. Saudi Arabia / GCC / Vision 2030 activity

Return as JSON array: [{"type":"funding","title":"...","description":"...","source":"...","url":"...","confidence":85}]
Valid types: funding, hiring, expansion, tech_adoption, news, job_change
Only include verified, recent signals. Return empty array if nothing found.`;

    try {
      const ai = this.getAI();
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
          tools: [{ googleSearch: {} }],
        },
      });
      const text = response.text || "";
      const signals = this.parseSignalsFromText(text, company);
      this.setCache(cacheKey, signals);
      return signals;
    } catch (e: any) {
      console.error(`[IntentSignals] detectSignals error for "${company}":`, e.message);
      return [];
    }
  }

  async detectKSASignals(company: string): Promise<IntentSignal[]> {
    const cacheKey = `ksa:${company.toLowerCase()}`;
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    const prompt = `Search for recent Saudi Arabia and GCC business activity for "${company}". Find:
1. Vision 2030 contracts or programme involvement
2. NEOM partnerships or projects
3. Saudi Aramco partnerships or contracts
4. Government tenders won in KSA or GCC
5. Giga-project involvement (NEOM, Red Sea Project, Qiddiya, Diriyah)
6. Saudi investment or expansion announcements

Return as JSON array: [{"type":"expansion","title":"...","description":"...","source":"...","url":"...","confidence":80}]
Valid types: funding, hiring, expansion, tech_adoption, news, job_change
Only include verified signals with Saudi / GCC relevance. Return empty array if nothing found.`;

    try {
      const ai = this.getAI();
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
          tools: [{ googleSearch: {} }],
        },
      });
      const text = response.text || "";
      const signals = this.parseSignalsFromText(text, company);
      this.setCache(cacheKey, signals);
      return signals;
    } catch (e: any) {
      console.error(`[IntentSignals] detectKSASignals error for "${company}":`, e.message);
      return [];
    }
  }

  async detectJobChange(name: string, company: string): Promise<IntentSignal[]> {
    const cacheKey = `jobchange:${name.toLowerCase()}:${company.toLowerCase()}`;
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    const prompt = `Search for recent job changes or career moves for "${name}" who works at or recently worked at "${company}".
Check if they have changed jobs, been promoted, left the company, or joined a new role.

Return as JSON array: [{"type":"job_change","title":"...","description":"...","source":"...","url":"...","confidence":75}]
Only return confirmed job changes in the last 90 days. Return empty array if no changes found.`;

    try {
      const ai = this.getAI();
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
          tools: [{ googleSearch: {} }],
        },
      });
      const text = response.text || "";
      const signals = this.parseSignalsFromText(text, company);
      this.setCache(cacheKey, signals);
      return signals;
    } catch (e: any) {
      console.error(`[IntentSignals] detectJobChange error for "${name}" at "${company}":`, e.message);
      return [];
    }
  }

  async batchDetect(companies: string[]): Promise<Map<string, IntentSignal[]>> {
    const results = new Map<string, IntentSignal[]>();
    const CONCURRENCY = 3;

    // Process in batches of CONCURRENCY
    for (let i = 0; i < companies.length; i += CONCURRENCY) {
      const batch = companies.slice(i, i + CONCURRENCY);
      const batchResults = await Promise.all(
        batch.map(async (company) => {
          const signals = await this.detectSignals(company);
          return { company, signals };
        })
      );
      for (const { company, signals } of batchResults) {
        results.set(company, signals);
      }
    }

    return results;
  }

  // Utility: clear expired cache entries
  pruneCache(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expires_at) {
        this.cache.delete(key);
      }
    }
  }
}

export const intentSignalService = new IntentSignalService();
