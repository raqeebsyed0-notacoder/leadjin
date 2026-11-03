/**
 * Module 4: Protocol Manager (Reply Management)
 * 
 * Handles email reply classification and automated response generation.
 * Powered by Gemini 1.5 Flash for fast classification and response drafting.
 */

import { GoogleGenAI } from '@google/genai';
import { getGenAI } from './genaiClient.js';

export type ReplyCategory = 'INTERESTED' | 'NOT_INTERESTED' | 'OOO' | 'QUESTION' | 'REFERRAL';

export interface ClassifyResult {
  category: ReplyCategory;
  confidence: number;
  suggestedResponse: string;
  extractedData?: {
    returnDate?: string;
    meetingLinkPlaceholder?: string;
    referredContact?: {
      name?: string;
      email?: string;
      title?: string;
    };
    questions?: string[];
    scheduledResendDate?: string;
  };
}

export interface ClassifyOptions {
  meetingLinkPlaceholder?: string;
  userCompanyName?: string;
  userName?: string;
  userServices?: string;
}

export class ProtocolManager {
  private ai: GoogleGenAI;
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.ai = getGenAI(apiKey);
  }

  /**
   * Classify an email reply and generate appropriate response
   */
  async classifyReply(
    emailBody: string,
    originalOutreach: string,
    options: ClassifyOptions = {}
  ): Promise<ClassifyResult> {
    const {
      meetingLinkPlaceholder = '[MEETING_LINK]',
      userCompanyName = 'Our Company',
      userName = 'The Team',
      userServices = 'our services'
    } = options;

    const prompt = `You are Jin, an AI Email Protocol Manager specializing in Saudi Arabian business communications.

Analyze this email reply and classify it into one of these categories:
- INTERESTED: Lead wants to proceed, requests meeting, or shows buying intent
- NOT_INTERESTED: Lead declines or shows no interest (direct or indirect)
- OOO: Out-of-office / vacation auto-reply
- QUESTION: Lead asks specific questions before proceeding
- REFERRAL: Lead refers you to someone else in their organization

ORIGINAL OUTREACH EMAIL:
${originalOutreach}

REPLY EMAIL TO CLASSIFY:
${emailBody}

CLASSIFICATION RULES (Saudi Business Context):
1. INDIRECT REFUSALS: In Saudi culture, direct "no" is rare. Phrases like "not the right time", "we're fully committed", "will consider for future" often indicate NOT_INTERESTED
2. MEETING REQUESTS: Any mention of wanting to meet, discuss, or see a demo = INTERESTED
3. OOO INDICATORS: Auto-replies mentioning vacation, out of office, unavailable until [date]
4. QUESTIONS: Asking about pricing, services, timeline, or capabilities before committing
5. REFERRALS: "Contact my colleague", "forward to [name]", "[person] handles this"

Respond with JSON:
{
  "category": "INTERESTED|NOT_INTERESTED|OOO|QUESTION|REFERRAL",
  "confidence": 0-100,
  "suggestedResponse": "Drafted response appropriate to category",
  "extractedData": {
    "returnDate": "ISO date if OOO (YYYY-MM-DD)",
    "referredContact": {
      "name": "Name of referred person if REFERRAL",
      "email": "Email if provided",
      "title": "Job title if provided"
    },
    "questions": ["Array of questions asked if QUESTION category"],
    "scheduledResendDate": "ISO date for follow-up if OOO"
  }
}

Response guidelines by category:
- INTERESTED: Propose specific meeting times, include placeholder ${meetingLinkPlaceholder}
- NOT_INTERESTED: Polite acknowledgment, keep door open for future
- OOO: Note return date, schedule polite follow-up for 2 days after return
- QUESTION: Answer each question contextually based on ${userServices}, then propose next step
- REFERRAL: Acknowledge referral, draft intro email to referred contact`;

    try {
      const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: { responseMimeType: 'application/json' }
      });
      
      const text = response.text || '';
      const cleaned = text.replace(/```json\n?|\n?```/g, '').trim();
      const parsed = JSON.parse(cleaned);

      // Ensure category is valid
      const validCategories: ReplyCategory[] = ['INTERESTED', 'NOT_INTERESTED', 'OOO', 'QUESTION', 'REFERRAL'];
      if (!validCategories.includes(parsed.category)) {
        parsed.category = 'NOT_INTERESTED';
        parsed.confidence = Math.min(parsed.confidence || 50, 60);
      }

      // Post-process based on category
      const result = this.postProcessResult(parsed, meetingLinkPlaceholder, userCompanyName, userName);
      
      return result;
    } catch (error: any) {
      console.error('[ProtocolManager] Classification failed:', error.message);
      return this.getFallbackResult(meetingLinkPlaceholder);
    }
  }

  /**
   * Post-process classification result to ensure consistency
   */
  private postProcessResult(
    parsed: any,
    meetingLinkPlaceholder: string,
    userCompanyName: string,
    userName: string
  ): ClassifyResult {
    const category: ReplyCategory = parsed.category;
    const extractedData = parsed.extractedData || {};

    // Ensure meeting link placeholder for interested leads
    if (category === 'INTERESTED' && !parsed.suggestedResponse.includes(meetingLinkPlaceholder)) {
      parsed.suggestedResponse += `\n\nYou can book a time that works for you here: ${meetingLinkPlaceholder}`;
    }

    // Calculate scheduled resend date for OOO (2 days after return)
    if (category === 'OOO' && extractedData.returnDate) {
      const returnDate = new Date(extractedData.returnDate);
      if (!isNaN(returnDate.getTime())) {
        const resendDate = new Date(returnDate);
        resendDate.setDate(resendDate.getDate() + 2);
        extractedData.scheduledResendDate = resendDate.toISOString().split('T')[0];
      }
    }

    // Ensure referred contact structure for REFERRAL
    if (category === 'REFERRAL' && !extractedData.referredContact) {
      extractedData.referredContact = {};
    }

    return {
      category,
      confidence: Math.min(100, Math.max(0, parsed.confidence || 70)),
      suggestedResponse: parsed.suggestedResponse || this.getDefaultResponse(category, userCompanyName, userName),
      extractedData: Object.keys(extractedData).length > 0 ? extractedData : undefined
    };
  }

  /**
   * Get default response for each category
   */
  private getDefaultResponse(category: ReplyCategory, companyName: string, userName: string): string {
    const responses: Record<ReplyCategory, string> = {
      INTERESTED: `Thank you for your interest. I'd be happy to schedule a brief call to discuss how ${companyName} can support your goals.`,
      NOT_INTERESTED: `Thank you for your response. I understand this may not be the right time. I'll keep you updated on relevant developments and reach out in the future if appropriate.`,
      OOO: `Thank you for the notification. I'll follow up after your return.`,
      QUESTION: `Thank you for your questions. Let me address each one and then we can discuss next steps.`,
      REFERRAL: `Thank you for referring me to your colleague. I'll reach out to them directly.`
    };
    return responses[category];
  }

  /**
   * Get fallback result when classification fails
   */
  private getFallbackResult(meetingLinkPlaceholder: string): ClassifyResult {
    return {
      category: 'NOT_INTERESTED',
      confidence: 50,
      suggestedResponse: 'Thank you for your response. I will review and follow up accordingly.',
      extractedData: undefined
    };
  }

  /**
   * Batch classify multiple replies
   */
  async classifyBatch(
    replies: Array<{ emailBody: string; originalOutreach: string; id: string }>,
    options: ClassifyOptions = {}
  ): Promise<Array<{ id: string; result: ClassifyResult }>> {
    const results: Array<{ id: string; result: ClassifyResult }> = [];
    
    // Process sequentially to avoid rate limits
    for (const reply of replies) {
      try {
        const result = await this.classifyReply(reply.emailBody, reply.originalOutreach, options);
        results.push({ id: reply.id, result });
      } catch (error) {
        console.error(`[ProtocolManager] Failed to classify reply ${reply.id}:`, error);
        results.push({
          id: reply.id,
          result: {
            category: 'NOT_INTERESTED',
            confidence: 0,
            suggestedResponse: 'Unable to classify - manual review required'
          }
        });
      }
    }
    
    return results;
  }

  /**
   * Generate follow-up email for interested leads
   */
  async generateMeetingFollowUp(
    leadName: string,
    companyName: string,
    meetingLink: string,
    context?: string
  ): Promise<string> {
    const prompt = `Draft a professional follow-up email for an interested lead in Saudi Arabia.

Lead: ${leadName}
Company: ${companyName}
Meeting Link: ${meetingLink}
${context ? `Context: ${context}` : ''}

Requirements:
1. Professional yet warm tone
2. Propose 2-3 specific time slots (morning Saudi time)
3. Include meeting link prominently
4. Keep under 150 words
5. Respect Saudi business culture (relationship-focused, not overly aggressive)

Email body:`;

    try {
      const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt
      });
      
      return (response.text || '').trim();
    } catch (error: any) {
      console.error('[ProtocolManager] Follow-up generation failed:', error.message);
      return `Dear ${leadName},\n\nThank you for your interest. I'd like to schedule a brief call to discuss how we can work together.\n\nPlease select a time that works for you: ${meetingLink}\n\nBest regards`;
    }
  }

  /**
   * Draft answer to questions
   */
  async draftQuestionAnswer(
    questions: string[],
    userServices: string,
    context: string
  ): Promise<string> {
    const prompt = `Draft a professional email answering these questions from a potential client in Saudi Arabia:

QUESTIONS:
${questions.map((q, i) => `${i + 1}. ${q}`).join('\n')}

OUR SERVICES:
${userServices}

CONTEXT:
${context}

Requirements:
1. Answer each question clearly and concisely
2. Professional tone appropriate for Saudi business culture
3. End with a soft call to action (meeting or next step)
4. Keep under 200 words

Email body:`;

    try {
      const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt
      });
      
      return (response.text || '').trim();
    } catch (error: any) {
      console.error('[ProtocolManager] Question answer drafting failed:', error.message);
      return `Thank you for your questions. I'd be happy to discuss these in detail during a brief call. Please let me know when you're available.`;
    }
  }

  /**
   * Extract referral contact information
   */
  async extractReferral(
    emailBody: string
  ): Promise<{ name?: string; email?: string; title?: string; confidence: number }> {
    const prompt = `Extract referral contact information from this email:

EMAIL:
${emailBody}

Extract:
1. Referred person's name
2. Their email address (if provided)
3. Their job title (if mentioned)

Respond with JSON:
{
  "name": "full name or null",
  "email": "email address or null",
  "title": "job title or null",
  "confidence": 0-100
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
      console.error('[ProtocolManager] Referral extraction failed:', error.message);
      return { confidence: 0 };
    }
  }
}

// Singleton instance for use throughout the application
let protocolManagerInstance: ProtocolManager | null = null;

export function getProtocolManager(apiKey?: string): ProtocolManager {
  if (!protocolManagerInstance && apiKey) {
    protocolManagerInstance = new ProtocolManager(apiKey);
  }
  if (!protocolManagerInstance) {
    throw new Error('ProtocolManager not initialized. Provide API key.');
  }
  return protocolManagerInstance;
}

export function initProtocolManager(apiKey: string): ProtocolManager {
  protocolManagerInstance = new ProtocolManager(apiKey);
  return protocolManagerInstance;
}
