/**
 * LeadJin Artisan Module 4 — Reply Manager
 *
 * Tracks sent messages, categorizes replies, and suggests follow-ups.
 * Integrates with ProtocolManager for AI-powered classification.
 *
 * Categories:
 *   - interested
 *   - not_interested
 *   - follow_up_needed
 */

import {
  ProtocolManager,
  ClassifyResult,
  ClassifyOptions,
  ReplyCategory,
  getProtocolManager,
  initProtocolManager,
} from './protocolManager.js';
import { getGenAI } from './genaiClient.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ArtisanReplyCategory = 'interested' | 'not_interested' | 'follow_up_needed';

export interface TrackedMessage {
  id?: number;
  leadId: string;
  userId: number;
  messageType: 'outreach' | 'reply';
  body: string;
  category?: ArtisanReplyCategory;
  confidence?: number;
  suggestedResponse?: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

export interface FollowUpSuggestion {
  suggestion: string;
  category: ArtisanReplyCategory;
  language: 'en' | 'ar';
  tone: 'formal' | 'warm';
}

export interface ReplyTimelineEvent {
  id: string | number;
  eventType: 'outreach_sent' | 'reply_received' | 'follow_up_suggested' | string;
  body: string;
  timestamp: string;
  category?: string;
  confidence?: number;
  metadata?: Record<string, any>;
}

// ---------------------------------------------------------------------------
// Category Mapping: ProtocolManager → Artisan
// ---------------------------------------------------------------------------

export const CATEGORY_MAP: Record<ReplyCategory, ArtisanReplyCategory> = {
  INTERESTED: 'interested',
  NOT_INTERESTED: 'not_interested',
  OOO: 'follow_up_needed',
  QUESTION: 'follow_up_needed',
  REFERRAL: 'interested',
};

export const REVERSE_CATEGORY_MAP: Record<ArtisanReplyCategory, ReplyCategory[]> = {
  interested: ['INTERESTED', 'REFERRAL'],
  not_interested: ['NOT_INTERESTED'],
  follow_up_needed: ['OOO', 'QUESTION'],
};

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

export async function classifyReply(
  emailBody: string,
  originalOutreach: string,
  options: ClassifyOptions = {},
  apiKey?: string
): Promise<ClassifyResult & { artisanCategory: ArtisanReplyCategory }> {
  const manager = apiKey ? new ProtocolManager(apiKey) : getProtocolManager();
  const result = await manager.classifyReply(emailBody, originalOutreach, options);

  return {
    ...result,
    artisanCategory: CATEGORY_MAP[result.category] || 'follow_up_needed',
  };
}

export async function classifyReplyBatch(
  items: Array<{ id: string; emailBody: string; originalOutreach: string }>,
  options: ClassifyOptions = {},
  apiKey?: string
): Promise<Array<{ id: string; result: ClassifyResult & { artisanCategory: ArtisanReplyCategory } }>> {
  const manager = apiKey ? new ProtocolManager(apiKey) : getProtocolManager();
  const raw = await manager.classifyBatch(
    items.map((i) => ({ id: i.id, emailBody: i.emailBody, originalOutreach: i.originalOutreach })),
    options
  );

  return raw.map((r) => ({
    id: r.id,
    result: {
      ...r.result,
      artisanCategory: CATEGORY_MAP[r.result.category] || 'follow_up_needed',
    },
  }));
}

// ---------------------------------------------------------------------------
// Follow-Up Suggestions
// ---------------------------------------------------------------------------

export function suggestFollowUp(
  category: ArtisanReplyCategory,
  leadName: string = '',
  companyName: string = '',
  language: 'en' | 'ar' = 'en',
  senderName: string = 'The Team',
  senderCompany: string = 'Our Company'
): FollowUpSuggestion {
  let suggestion = '';

  if (category === 'interested') {
    suggestion =
      language === 'ar'
        ? `شكراً لك ${leadName} على اهتمامكم. نرغب بتحديد موعد محادثة هذا الأسبوع لمناقشة التفاصيل. هل يمكننا اقتراح بعض الأوقات المناسبة لكم؟\n\nمع خالص التقدير،\n${senderName}\n${senderCompany}`
        : `Thank you for your interest, ${leadName || 'there'}. I'd be happy to schedule a brief call this week to discuss details. Can we propose a few time slots that work for you?\n\nBest,\n${senderName}\n${senderCompany}`;
  } else if (category === 'not_interested') {
    suggestion =
      language === 'ar'
        ? `شكراً لك ${leadName} على الرد. نفهم تماماً أن الوقت الحالي قد لا يكون مناسباً. سنبقى على تواصل ونتطلع للتعاون مستقبلاً إن شاء الله.\n\nمع خالص التقدير،\n${senderName}\n${senderCompany}`
        : `Thank you for your response, ${leadName || 'there'}. I completely understand that now may not be the right time. I'll keep you updated on relevant developments and reach out in the future if appropriate.\n\nBest,\n${senderName}\n${senderCompany}`;
  } else {
    // follow_up_needed
    suggestion =
      language === 'ar'
        ? `شكراً لك ${leadName} على الرد. سأعاود التواصل معكم خلال يومين عمل لمتابعة استفساراتكم.\n\nمع خالص التقدير،\n${senderName}\n${senderCompany}`
        : `Thank you for your reply, ${leadName || 'there'}. I'll follow up within 2 business days to address your questions and keep the conversation moving forward.\n\nBest,\n${senderName}\n${senderCompany}`;
  }

  return {
    suggestion,
    category,
    language,
    tone: category === 'interested' ? 'warm' : 'formal',
  };
}

export async function enhanceFollowUpWithAI(
  category: ArtisanReplyCategory,
  leadName: string,
  companyName: string,
  originalOutreachBody: string,
  language: 'en' | 'ar',
  senderName: string,
  senderCompany: string,
  apiKey?: string
): Promise<string> {
  if (!apiKey) {
    return suggestFollowUp(category, leadName, companyName, language, senderName, senderCompany).suggestion;
  }

  try {
    const ai = getGenAI(apiKey);
    const prompt = `Draft a professional follow-up email in ${language === 'ar' ? 'Arabic' : 'English'}.

Reply category: ${category}
Lead: ${leadName || 'Unknown'} at ${companyName || 'Unknown'}
Original outreach:\n${originalOutreachBody}\n
Requirements:
1. Professional tone appropriate for Saudi business culture
2. Keep under 120 words
3. End with sender name: ${senderName}, company: ${senderCompany}

Email body:`;

    const aiResponse = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });
    const aiText = (aiResponse.text || '').trim();
    if (aiText.length > 20) {
      return aiText;
    }
  } catch (aiErr: any) {
    console.log('[ReplyManager] AI follow-up enhancement skipped:', aiErr.message);
  }

  return suggestFollowUp(category, leadName, companyName, language, senderName, senderCompany).suggestion;
}

// ---------------------------------------------------------------------------
// Tracking Helpers
// ---------------------------------------------------------------------------

export function buildReplyTimeline(
  outreaches: Array<{
    id: number;
    message_type: string;
    subject?: string;
    body: string;
    language: string;
    status: string;
    timestamp: string;
  }>,
  replies: Array<{
    id: number;
    body: string;
    category: string;
    confidence: number;
    suggested_response?: string;
    status: string;
    timestamp: string;
  }>,
  relationshipEvents: Array<{
    type: string;
    timestamp: string;
    details?: string;
    metadata?: Record<string, any>;
  }> = []
): ReplyTimelineEvent[] {
  const timeline: ReplyTimelineEvent[] = [
    ...outreaches.map((o) => ({
      id: o.id,
      eventType: 'outreach_sent' as const,
      body: o.body,
      timestamp: o.timestamp,
      metadata: { subject: o.subject, message_type: o.message_type, language: o.language, status: o.status },
    })),
    ...replies.map((r) => ({
      id: r.id,
      eventType: 'reply_received' as const,
      body: r.body,
      timestamp: r.timestamp,
      category: r.category,
      confidence: r.confidence,
      metadata: { suggested_response: r.suggested_response, status: r.status },
    })),
    ...relationshipEvents.map((e) => ({
      id: `rel-${e.timestamp}`,
      eventType: e.type,
      body: e.details,
      timestamp: e.timestamp,
      metadata: e.metadata,
    })),
  ];

  timeline.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  return timeline;
}

// ---------------------------------------------------------------------------
// Protocol Manager Re-exports
// ---------------------------------------------------------------------------

export { ProtocolManager, getProtocolManager, initProtocolManager };
export type { ClassifyResult, ClassifyOptions, ReplyCategory };

export default classifyReply;
