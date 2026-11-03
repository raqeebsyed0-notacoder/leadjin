/**
 * LeadJin Artisan Module 3 — Outreach Writer
 *
 * Generates personalized outreach per lead across three channels:
 *   - Cold Email
 *   - LinkedIn Message
 *   - WhatsApp
 *
 * Supports Arabic + English with auto-detection and Saudi business etiquette.
 * Builds on VisionStrategist intelligence for hyper-personalization.
 */

import {
  craftOutreach,
  LeadProfile,
  OutreachContext,
  CraftedOutreach,
  VisionStrategist,
  getVisionStrategist,
} from './visionStrategist.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MessageType = 'cold_email' | 'linkedin' | 'whatsapp';

export interface OutreachLead extends LeadProfile {
  leadId?: string;
  email?: string;
  phone?: string;
  linkedinUrl?: string;
}

export interface OutreachWriterResult extends CraftedOutreach {
  messageType: MessageType;
  templateUsed?: string;
  lead: OutreachLead;
}

export interface OutreachTemplate {
  id: string;
  name: string;
  messageType: MessageType;
  language: 'en' | 'ar';
  subject?: string;
  body: string;
}

// ---------------------------------------------------------------------------
// Default Templates
// ---------------------------------------------------------------------------

export const DEFAULT_TEMPLATES: OutreachTemplate[] = [
  {
    id: 'tpl-cold-en',
    name: 'Cold Email (English)',
    messageType: 'cold_email',
    language: 'en',
    subject: 'Partnership Opportunity — {{company}}',
    body: `As-salamu alaykum {{name}},\n\nI hope this message finds you well.\n\nI am reaching out regarding a potential collaboration between {{senderCompany}} and {{company}}.\n\nGiven {{company}}'s position in {{industry}}, I believe there is a strong opportunity to align with Saudi Vision 2030 initiatives.\n\nWould you be open to a brief conversation to explore how we might work together?\n\nWa assalamu alaykum,\n{{senderName}}`,
  },
  {
    id: 'tpl-cold-ar',
    name: 'Cold Email (Arabic)',
    messageType: 'cold_email',
    language: 'ar',
    subject: 'فرصة تعاون — {{company}}',
    body: `السلام عليكم {{name}}،\n\nتحية طيبة وبعد،\n\nنكتب إليكم بخصوص فرصة تعاون محتملة بين {{senderCompany}} و{{company}}.\n\nنظراً لمكانة {{company}} في قطاع {{industry}}، نرى إمكانية كبيرة للتكامل مع رؤية المملكة 2030.\n\nهل لديكم الاستعداد لمحادثة موجزة لاستكشاف سبل العمل المشترك؟\n\nوتفضلوا بقبول فائق الاحترام،\n{{senderName}}`,
  },
  {
    id: 'tpl-li-en',
    name: 'LinkedIn Message (English)',
    messageType: 'linkedin',
    language: 'en',
    body: `Hi {{name}},\n\nI came across your profile and {{company}}'s work in {{industry}}. I'd love to connect and explore how {{senderCompany}} might support your Vision 2030 goals.\n\nBest,\n{{senderName}}`,
  },
  {
    id: 'tpl-li-ar',
    name: 'LinkedIn Message (Arabic)',
    messageType: 'linkedin',
    language: 'ar',
    body: `مرحباً {{name}}،\n\nاطلعت على ملفك الشخصي وعمل {{company}} في {{industry}}. أرغب بالتواصل واستكشاف كيف يمكن لـ{{senderCompany}} دعم أهداف رؤية 2030 لديكم.\n\nمع خالص التقدير،\n{{senderName}}`,
  },
  {
    id: 'tpl-wa-en',
    name: 'WhatsApp Intro (English)',
    messageType: 'whatsapp',
    language: 'en',
    body: `As-salamu alaykum {{name}} 👋\n\nThis is {{senderName}} from {{senderCompany}}. We admire {{company}}'s impact in {{industry}} and would love to explore a collaboration aligned with Saudi Vision 2030.\n\nMay we schedule a brief call?`,
  },
  {
    id: 'tpl-wa-ar',
    name: 'WhatsApp Intro (Arabic)',
    messageType: 'whatsapp',
    language: 'ar',
    body: `السلام عليكم {{name}} 👋\n\n{{senderName}} من {{senderCompany}}. نقدر تأثير {{company}} في {{industry}} ونرغب باستكشاف تعاون يتوافق مع رؤية المملكة 2030.\n\nهل يمكننا تحديد موعد محادثة قصيرة؟`,
  },
];

// ---------------------------------------------------------------------------
// Template Engine
// ---------------------------------------------------------------------------

function renderTemplate(
  template: OutreachTemplate,
  lead: OutreachLead,
  context: OutreachContext
): { subject?: string; body: string } {
  const replacements: Record<string, string> = {
    '{{name}}': lead.name || '',
    '{{company}}': lead.company || '',
    '{{title}}': lead.title || '',
    '{{industry}}': lead.industry || '',
    '{{senderCompany}}': context.senderCompany || 'Our Company',
    '{{senderName}}': context.senderName || 'The Team',
  };

  let subject = template.subject;
  let body = template.body;

  for (const [key, value] of Object.entries(replacements)) {
    if (subject) subject = subject.split(key).join(value);
    body = body.split(key).join(value);
  }

  return { subject, body };
}

export function getTemplate(
  messageType: MessageType,
  language: 'en' | 'ar'
): OutreachTemplate | undefined {
  return DEFAULT_TEMPLATES.find(
    (t) => t.messageType === messageType && t.language === language
  );
}

// ---------------------------------------------------------------------------
// Channel-Specific Generators
// ---------------------------------------------------------------------------

export async function generateColdEmail(
  lead: OutreachLead,
  context: OutreachContext,
  apiKey?: string
): Promise<OutreachWriterResult> {
  const crafted = await craftOutreach(lead, context, apiKey);
  const template = getTemplate('cold_email', crafted.language);

  return {
    ...crafted,
    messageType: 'cold_email',
    templateUsed: template?.id,
    lead,
  };
}

export async function generateLinkedInMessage(
  lead: OutreachLead,
  context: OutreachContext,
  apiKey?: string
): Promise<OutreachWriterResult> {
  const crafted = await craftOutreach(lead, context, apiKey);
  const template = getTemplate('linkedin', crafted.language);

  // LinkedIn messages should be shorter
  const compactBody = crafted.body.split('\n\n').slice(0, 3).join('\n\n');

  return {
    ...crafted,
    body: compactBody,
    messageType: 'linkedin',
    templateUsed: template?.id,
    lead,
  };
}

export async function generateWhatsAppMessage(
  lead: OutreachLead,
  context: OutreachContext,
  apiKey?: string
): Promise<OutreachWriterResult> {
  const crafted = await craftOutreach(lead, context, apiKey);
  const template = getTemplate('whatsapp', crafted.language);

  // WhatsApp should be concise and conversational
  const waBody = crafted.body
    .split('\n\n')
    .filter((p) => !p.toLowerCase().includes('wa assalamu alaykum') && !p.toLowerCase().includes('best regards'))
    .slice(0, 3)
    .join('\n\n');

  return {
    ...crafted,
    body: waBody,
    messageType: 'whatsapp',
    templateUsed: template?.id,
    lead,
  };
}

// ---------------------------------------------------------------------------
// Unified Generator
// ---------------------------------------------------------------------------

export async function generateOutreach(
  lead: OutreachLead,
  context: OutreachContext,
  messageType: MessageType = 'cold_email',
  apiKey?: string
): Promise<OutreachWriterResult> {
  switch (messageType) {
    case 'cold_email':
      return generateColdEmail(lead, context, apiKey);
    case 'linkedin':
      return generateLinkedInMessage(lead, context, apiKey);
    case 'whatsapp':
      return generateWhatsAppMessage(lead, context, apiKey);
    default:
      return generateColdEmail(lead, context, apiKey);
  }
}

// ---------------------------------------------------------------------------
// Batch Generation
// ---------------------------------------------------------------------------

export async function generateOutreachBatch(
  leads: OutreachLead[],
  context: OutreachContext,
  messageType: MessageType = 'cold_email',
  apiKey?: string
): Promise<OutreachWriterResult[]> {
  const results: OutreachWriterResult[] = [];
  for (const lead of leads) {
    try {
      const result = await generateOutreach(lead, context, messageType, apiKey);
      results.push(result);
    } catch (error: any) {
      console.error('[OutreachWriter] Batch item failed:', error.message);
      // Push fallback
      results.push({
        subject: 'Partnership Opportunity',
        body: `As-salamu alaykum ${lead.name},\n\nWe would like to explore a collaboration opportunity.\n\nBest regards`,
        personalizationScore: 30,
        references: [],
        language: 'en',
        toneAnalysis: { formality: 'formal', culturalAppropriateness: 'high' },
        messageType,
        lead,
      });
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Template-Only Fallback (No AI)
// ---------------------------------------------------------------------------

export function generateFromTemplate(
  lead: OutreachLead,
  context: OutreachContext,
  messageType: MessageType,
  language: 'en' | 'ar'
): OutreachWriterResult {
  const template = getTemplate(messageType, language);
  if (!template) {
    throw new Error(`Template not found for ${messageType}/${language}`);
  }

  const rendered = renderTemplate(template, lead, context);

  return {
    subject: rendered.subject || '',
    body: rendered.body,
    personalizationScore: 50,
    references: ['Saudi Vision 2030'],
    language,
    toneAnalysis: { formality: 'formal', culturalAppropriateness: 'high' },
    messageType,
    templateUsed: template.id,
    lead,
  };
}

// ---------------------------------------------------------------------------
// Vision Alignment Analysis
// ---------------------------------------------------------------------------

export async function analyzeVisionAlignment(
  company: string,
  industry: string,
  title?: string,
  apiKey?: string
): Promise<{
  primaryProgram: string;
  secondaryPrograms: string[];
  alignmentScore: number;
  reasoning: string;
}> {
  const strategist = getVisionStrategist(apiKey);
  return strategist.analyzeVisionAlignment(company, industry, title);
}

// ---------------------------------------------------------------------------
// Re-exports for convenience
// ---------------------------------------------------------------------------

export { craftOutreach, VisionStrategist, getVisionStrategist };
export type { LeadProfile, OutreachContext, CraftedOutreach };

export default generateOutreach;
