/**
 * Module 1: The Employee's Brain (Autonomous Reasoning)
 * 
 * Jin's decision-making engine powered by Gemini 2.5 Flash.
 * Handles autonomous reasoning about leads, timing, and strategic decisions.
 */

import { GoogleGenAI } from '@google/genai';
import { getGenAI } from './genaiClient.js';

export interface JinDecision {
  decision: 'proceed' | 'wait' | 'escalate' | 'decline';
  confidence: number;
  reasoning: string;
  recommendedAction: string;
  timing?: 'immediate' | 'today' | 'this_week' | 'next_week';
  priority: 'critical' | 'high' | 'medium' | 'low';
}

export interface LeadAnalysis {
  leadId: string;
  name: string;
  company: string;
  title: string;
  vision2030Score: number;
  intentSignals: string[];
  engagementHistory: Array<{
    type: 'email_open' | 'email_click' | 'reply' | 'meeting';
    date: string;
    details?: string;
  }>;
}

export interface OutreachContext {
  userCompany: string;
  userServices: string;
  targetIndustry: string;
  referenceProjects?: string[];
}

export class JinBrain {
  private ai: GoogleGenAI;
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.ai = getGenAI(apiKey);
  }
  
  /**
   * Analyze a lead and decide: "Is this lead high-intent?"
   */
  async analyzeLeadIntent(lead: LeadAnalysis): Promise<JinDecision> {
    const prompt = `You are Jin, an AI Employee and Regional Intelligence Specialist for the Saudi Arabian market.

Analyze this potential stakeholder and determine if they represent a high-intent opportunity:

STAKEHOLDER PROFILE:
- Name: ${lead.name}
- Title: ${lead.title}
- Company: ${lead.company}
- Vision 2030 Alignment Score: ${lead.vision2030Score}/100

INTENT SIGNALS DETECTED:
${lead.intentSignals.map(s => `- ${s}`).join('\n') || '- No specific signals detected'}

ENGAGEMENT HISTORY:
${lead.engagementHistory.map(e => `- ${e.type} on ${e.date}${e.details ? `: ${e.details}` : ''}`).join('\n') || '- No prior engagement'}

Consider:
1. Does their role indicate budget authority?
2. Are there recent signals of active projects or needs?
3. How well do they align with Saudi Vision 2030 initiatives?
4. What's the engagement pattern suggesting?

Respond with JSON:
{
  "decision": "proceed|wait|escalate|decline",
  "confidence": 0-100,
  "reasoning": "Detailed strategic reasoning",
  "recommendedAction": "Specific next step",
  "timing": "immediate|today|this_week|next_week",
  "priority": "critical|high|medium|low"
}`;

    try {
      const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: { responseMimeType: 'application/json' }
      });
      
      const text = response.text || '';
      const cleaned = text.replace(/```json\n?|\n?```/g, '').trim();
      return JSON.parse(cleaned);
    } catch (error: any) {
      console.error('[JinBrain] Intent analysis failed:', error.message);
      return {
        decision: 'wait',
        confidence: 50,
        reasoning: 'Analysis failed, defaulting to cautious approach',
        recommendedAction: 'Manual review required',
        priority: 'medium'
      };
    }
  }
  
  /**
   * Decide: "Should I contact them now or wait for a better signal?"
   */
  async determineOutreachTiming(
    lead: LeadAnalysis,
    context: OutreachContext
  ): Promise<JinDecision> {
    const prompt = `You are Jin, an AI Employee specializing in Saudi business relations.

Determine the optimal outreach timing for this stakeholder:

STAKEHOLDER:
- ${lead.name}, ${lead.title} at ${lead.company}
- Vision 2030 Score: ${lead.vision2030Score}/100

YOUR COMPANY:
- ${context.userCompany}
- Services: ${context.userServices}
- Target Industry: ${context.targetIndustry}

CONTEXT FACTORS:
${lead.engagementHistory.length > 0 
  ? `Recent engagement: ${lead.engagementHistory[lead.engagementHistory.length - 1].type} on ${lead.engagementHistory[lead.engagementHistory.length - 1].date}`
  : 'No prior engagement - cold outreach'}

SAUDI BUSINESS CONSIDERATIONS:
- Prayer times affect availability
- Ramadan requires adjusted communication
- Weekend is Friday-Saturday
- Cultural preference for relationship-building before business

Respond with JSON:
{
  "decision": "proceed|wait|escalate|decline",
  "confidence": 0-100,
  "reasoning": "Why this timing is optimal",
  "recommendedAction": "Specific outreach approach",
  "timing": "immediate|today|this_week|next_week",
  "priority": "critical|high|medium|low"
}`;

    try {
      const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: { responseMimeType: 'application/json' }
      });
      
      const text = response.text || '';
      const cleaned = text.replace(/```json\n?|\n?```/g, '').trim();
      return JSON.parse(cleaned);
    } catch (error: any) {
      console.error('[JinBrain] Timing analysis failed:', error.message);
      return {
        decision: 'wait',
        confidence: 50,
        reasoning: 'Timing analysis failed',
        recommendedAction: 'Review manually for optimal timing',
        priority: 'medium'
      };
    }
  }
  
  /**
   * Analyze Vision 2030 alignment for a company or individual
   */
  async analyzeVision2030Alignment(entityName: string, industry: string): Promise<{
    score: number;
    programs: string[];
    reasoning: string;
    strategicValue: 'high' | 'medium' | 'low';
  }> {
    const prompt = `Analyze ${entityName}'s alignment with Saudi Vision 2030.

Industry: ${industry}

Consider:
1. Which Vision 2030 programs directly relate to this entity?
2. What is their contribution to economic diversification?
3. Are they involved in strategic sectors (tourism, tech, renewable energy, etc.)?
4. What's their potential impact on the Kingdom's goals?

Respond with JSON:
{
  "score": 0-100,
  "programs": ["Program 1", "Program 2"],
  "reasoning": "Detailed analysis of alignment",
  "strategicValue": "high|medium|low"
}`;

    try {
      const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: { 
          tools: [{ googleSearch: {} }],
          responseMimeType: 'application/json' 
        }
      });
      
      const text = response.text || '';
      const cleaned = text.replace(/```json\n?|\n?```/g, '').trim();
      return JSON.parse(cleaned);
    } catch (error: any) {
      console.error('[JinBrain] Vision 2030 analysis failed:', error.message);
      return {
        score: 50,
        programs: [],
        reasoning: 'Analysis failed',
        strategicValue: 'medium'
      };
    }
  }
  
  /**
   * Categorize email reply based on strategic intent
   */
  async categorizeReply(emailContent: string, subject: string): Promise<{
    category: 'strategic_interest' | 'request_info' | 'referral' | 'decline' | 'unsubscribe' | 'out_of_office' | 'unknown';
    sentiment: 'positive' | 'neutral' | 'negative';
    actionRequired: 'immediate_followup' | 'schedule_meeting' | 'send_info' | 'nurture' | 'archive';
    priority: number; // 1-10
    summary: string;
  }> {
    const prompt = `You are Jin, analyzing an email response for strategic intent.

EMAIL SUBJECT: ${subject}
EMAIL CONTENT:
${emailContent}

Categorize this response considering Saudi business culture:
- Direct "no" is rare; indirect language often indicates declining interest
- Requests for more information indicate genuine interest
- Referrals to colleagues are positive signals
- Out-of-office responses should note return dates

Respond with JSON:
{
  "category": "strategic_interest|request_info|referral|decline|unsubscribe|out_of_office|unknown",
  "sentiment": "positive|neutral|negative",
  "actionRequired": "immediate_followup|schedule_meeting|send_info|nurture|archive",
  "priority": 1-10,
  "summary": "Brief summary of the response and recommended action"
}`;

    try {
      const response = await this.ai.models.generateContent({
        model: 'gemini-1.5-flash',
        contents: prompt,
        config: { responseMimeType: 'application/json' }
      });
      
      const text = response.text || '';
      const cleaned = text.replace(/```json\n?|\n?```/g, '').trim();
      return JSON.parse(cleaned);
    } catch (error: any) {
      console.error('[JinBrain] Reply categorization failed:', error.message);
      return {
        category: 'unknown',
        sentiment: 'neutral',
        actionRequired: 'nurture',
        priority: 5,
        summary: 'Unable to categorize - manual review needed'
      };
    }
  }
  
  /**
   * Generate Jin's work log entry for a completed action
   */
  async generateWorkLogEntry(
    action: string,
    entity: string,
    outcome: string
  ): Promise<string> {
    const prompt = `You are Jin, an AI Employee. Generate a professional work log entry.

Action: ${action}
Entity: ${entity}
Outcome: ${outcome}

Write a concise, professional log entry (1-2 sentences) from Jin's perspective:
- Use first person ("I analyzed...", "I verified...")
- Be specific about what was accomplished
- Maintain professional tone appropriate for a Saudi business context
- Include relevant metrics when applicable

Example: "I completed the deep-dive analysis of Saudi Aramco's digital transformation unit and identified 3 key stakeholders with verified contact credentials."

Log entry:`;

    try {
      const response = await this.ai.models.generateContent({
        model: 'gemini-1.5-flash',
        contents: prompt
      });
      
      return (response.text || 'Task completed.').trim();
    } catch (error: any) {
      return `Completed ${action} for ${entity}: ${outcome}`;
    }
  }
}
