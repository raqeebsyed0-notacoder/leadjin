/**
 * Module 3: Vision Strategist (Hyper-Personalization Writer)
 * 
 * Generates personalized outreach emails that align leads with Saudi Vision 2030.
 * Uses Gemini 2.5 Flash for fast, contextual analysis and email generation.
 */

import { GoogleGenAI } from '@google/genai';
import { getGenAI } from './genaiClient.js';

export interface LeadProfile {
  name: string;
  title: string;
  company: string;
  linkedinUrl?: string;
  recentNews?: string;
  industry?: string;
  languagePreference?: 'ar' | 'en' | 'auto';
}

export interface OutreachContext {
  service: string;
  visionAlignment?: string;
  senderCompany?: string;
  senderName?: string;
  previousInteractions?: string[];
}

export interface CraftedOutreach {
  subject: string;
  body: string;
  personalizationScore: number;
  references: string[];
  language: 'ar' | 'en';
  toneAnalysis: {
    formality: 'formal' | 'semi-formal';
    culturalAppropriateness: 'high' | 'medium' | 'low';
  };
}

// Saudi Vision 2030 programs for reference
export const VISION_2030_PROGRAMS = {
  NIDLP: 'National Industrial Development and Logistics Program',
  PIF: 'Public Investment Fund initiatives',
  QOL: 'Quality of Life Program',
  NTP: 'National Transformation Program',
  VRP: 'Vision Realization Programs',
  HHR: 'Human Capital Development Program',
  FSP: 'Fiscal Sustainability Program',
  NRP: 'National Renewable Energy Program',
  PRIVATIZATION: 'Privatization Program',
  DIGITAL: 'National Strategy for Data and AI'
};

export class VisionStrategist {
  private ai: GoogleGenAI;
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.ai = getGenAI(apiKey);
  }

  /**
   * Detect language preference from lead profile
   */
  private detectLanguage(lead: LeadProfile): 'ar' | 'en' {
    if (lead.languagePreference && lead.languagePreference !== 'auto') {
      return lead.languagePreference;
    }
    
    // Auto-detect based on name and company patterns
    const arabicPattern = /[\u0600-\u06FF]/;
    const textToCheck = `${lead.name} ${lead.company}`;
    
    return arabicPattern.test(textToCheck) ? 'ar' : 'en';
  }

  /**
   * Craft personalized outreach email for a lead
   */
  async craftOutreach(
    lead: LeadProfile,
    context: OutreachContext
  ): Promise<CraftedOutreach> {
    const language = this.detectLanguage(lead);
    
    const prompt = `You are a Saudi business communication specialist. Generate a personalized outreach email following Saudi business etiquette (NOT American cold email style).

SAUDI BUSINESS ETIQUETTE RULES:
- Begin with respectful Islamic greetings (As-salamu alaykum / As-salamu alaykum)
- Focus on relationship-building before business (Majlis-style approach)
- Show respect for Saudi Vision 2030 and national development
- Avoid aggressive sales language, "limited time offers", or American-style urgency
- Use formal but warm tone
- Reference mutual benefit and long-term partnership
- End with Islamic closing (Wa assalamu alaykum)
- Never use "Hey", "Hi there", or overly casual greetings

LEAD PROFILE:
- Name: ${lead.name}
- Title: ${lead.title}
- Company: ${lead.company}
- Industry: ${lead.industry || 'Not specified'}
${lead.linkedinUrl ? `- LinkedIn: ${lead.linkedinUrl}` : ''}
${lead.recentNews ? `- Recent News: ${lead.recentNews}` : ''}

YOUR SERVICE:
- Service: ${context.service}
${context.visionAlignment ? `- Vision 2030 Alignment: ${context.visionAlignment}` : ''}
${context.senderCompany ? `- Your Company: ${context.senderCompany}` : ''}
${context.senderName ? `- Sender Name: ${context.senderName}` : ''}

RELEVANT VISION 2030 PROGRAMS TO CONSIDER:
- NIDLP (National Industrial Development and Logistics Program): Manufacturing, logistics, mining
- PIF (Public Investment Fund): Major projects, giga-projects (NEOM, Red Sea, Qiddiya)
- QOL (Quality of Life Program): Entertainment, tourism, culture, sports
- NTP (National Transformation Program): Healthcare, education, digital government
- NRP (National Renewable Energy Program): Solar, wind, clean energy
- DIGITAL (National Strategy for Data and AI): Tech, AI, digital transformation

Generate content in ${language === 'ar' ? 'Arabic' : 'English'}.

TASK:
1. Analyze which Vision 2030 program(s) are most relevant to ${lead.company}'s industry (${lead.industry || 'unknown'})
2. Generate a personalized email that:
   - Opens with Islamic greeting
   - References specific Vision 2030 initiatives relevant to their industry
   - Connects your service (${context.service}) to their potential contribution to Vision 2030
   - Suggests a meeting/call in respectful, non-pushy manner
   - Uses proper Saudi business etiquette throughout

Respond with JSON:
{
  "subject": "Email subject line (appropriate for Saudi business)",
  "body": "Full email body with proper greetings and closings",
  "personalizationScore": 0-100,
  "references": ["Vision 2030 program references used"],
  "language": "${language}",
  "toneAnalysis": {
    "formality": "formal|semi-formal",
    "culturalAppropriateness": "high|medium|low"
  }
}`;

    try {
      const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: { responseMimeType: 'application/json' }
      });

      const text = response.text || '';
      const cleaned = text.replace(/\`\`\`json\n?|\n?\`\`\`/g, '').trim();
      const result = JSON.parse(cleaned);
      
      return {
        subject: result.subject,
        body: result.body,
        personalizationScore: result.personalizationScore || 75,
        references: result.references || [],
        language: result.language || language,
        toneAnalysis: result.toneAnalysis || {
          formality: 'formal',
          culturalAppropriateness: 'high'
        }
      };
    } catch (error: any) {
      console.error('[VisionStrategist] Outreach crafting failed:', error.message);
      
      // Return fallback content
      const fallbackSubject = language === 'ar' 
        ? `فرصة تعاون - ${context.service}`
        : `Partnership Opportunity - ${context.service}`;
      
      const fallbackBody = language === 'ar'
        ? `السلام عليكم ورحمة الله وبركاته\n\nتحية طيبة ${lead.name}،\n\nنأمل أن تكون بصحة وعافية. نكتب إليكم بخصوص فرصة تعاون محتملة بين ${context.senderCompany || 'شركتنا'} و${lead.company}.\n\nنحن نقدر جهود ${lead.company} في دعم رؤية المملكة 2030، ونرى فرصة للتعاون في مجال ${context.service}.\n\nنتطلع لفرصة التواصل معكم لمناقشة كيف يمكننا العمل معاً لتحقيق أهدافنا المشتركة.\n\nوتفضلوا بقبول فائق الاحترام والتقدير،\n${context.senderName || ''}\n${context.senderCompany || ''}`
        : `As-salamu alaykum,\n\nI hope this message finds you well.\n\nDear ${lead.name},\n\nI am writing to explore a potential collaboration opportunity between ${context.senderCompany || 'our company'} and ${lead.company}.\n\nWe appreciate ${lead.company}'s contributions toward Saudi Vision 2030, and we see potential for synergies in the area of ${context.service}.\n\nWe would welcome the opportunity to connect with you to discuss how we might work together toward our shared goals.\n\nWa assalamu alaykum,\n${context.senderName || ''}\n${context.senderCompany || ''}`;
      
      return {
        subject: fallbackSubject,
        body: fallbackBody,
        personalizationScore: 50,
        references: ['Saudi Vision 2030'],
        language,
        toneAnalysis: {
          formality: 'formal',
          culturalAppropriateness: 'high'
        }
      };
    }
  }

  /**
   * Batch craft outreach for multiple leads
   */
  async craftOutreachBatch(
    leads: LeadProfile[],
    context: OutreachContext
  ): Promise<Array<CraftedOutreach & { lead: LeadProfile }>> {
    const results = await Promise.all(
      leads.map(async (lead) => {
        const outreach = await this.craftOutreach(lead, context);
        return { ...outreach, lead };
      })
    );
    return results;
  }

  /**
   * Analyze which Vision 2030 programs are most relevant to a lead
   */
  async analyzeVisionAlignment(
    company: string,
    industry: string,
    title?: string
  ): Promise<{
    primaryProgram: string;
    secondaryPrograms: string[];
    alignmentScore: number;
    reasoning: string;
  }> {
    const prompt = `Analyze ${company}'s alignment with Saudi Vision 2030 programs.

Company: ${company}
Industry: ${industry}
${title ? `Lead Title: ${title}` : ''}

Consider these Vision 2030 programs:
- NIDLP: Manufacturing, logistics, mining, industrial development
- PIF: Giga-projects, major investments, economic diversification
- QOL: Entertainment, tourism, culture, quality of life improvements
- NTP: Healthcare, education, government services transformation
- NRP: Renewable energy, sustainability, clean energy
- DIGITAL: AI, data, digital transformation, technology
- HHR: Human capital, workforce development, education

Respond with JSON:
{
  "primaryProgram": "Most relevant program code",
  "secondaryPrograms": ["Other relevant programs"],
  "alignmentScore": 0-100,
  "reasoning": "Brief analysis of alignment"
}`;

    try {
      const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: { responseMimeType: 'application/json' }
      });

      const text = response.text || '';
      const cleaned = text.replace(/\`\`\`json\n?|\n?\`\`\`/g, '').trim();
      return JSON.parse(cleaned);
    } catch (error: any) {
      console.error('[VisionStrategist] Vision alignment analysis failed:', error.message);
      return {
        primaryProgram: 'VRP',
        secondaryPrograms: ['NTP'],
        alignmentScore: 60,
        reasoning: 'Default alignment assigned due to analysis failure'
      };
    }
  }
}

// Singleton instance factory
let strategistInstance: VisionStrategist | null = null;

export function getVisionStrategist(apiKey?: string): VisionStrategist {
  const key = apiKey || process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error('GEMINI_API_KEY is required for VisionStrategist');
  }
  
  if (!strategistInstance || (apiKey && apiKey !== strategistInstance['apiKey'])) {
    strategistInstance = new VisionStrategist(key);
  }
  
  return strategistInstance;
}

// Direct function export for convenience
export async function craftOutreach(
  lead: LeadProfile,
  context: OutreachContext,
  apiKey?: string
): Promise<CraftedOutreach> {
  const strategist = getVisionStrategist(apiKey);
  return strategist.craftOutreach(lead, context);
}
