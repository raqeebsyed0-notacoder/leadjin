/**
 * Module 4: The Employee's Voice (Strategic Outreach)
 * 
 * Jin's communication engine - drafts hyper-personalized strategic alignment
 * emails that reference Vision 2030 goals and Saudi initiatives.
 * 
 * Also monitors inbox and handles replies autonomously.
 */

import { GoogleGenAI } from '@google/genai';
import { randomUUID } from 'crypto';
import { getGenAI } from './genaiClient.js';

export interface OutreachTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  tone: 'formal' | 'consultative' | 'strategic';
  vision2030Refs: string[];
}

export interface GeneratedOutreach {
  id: string;
  stakeholderId: string;
  subject: string;
  body: string;
  bodyHtml: string;
  personalizations: {
    name: string;
    company: string;
    title: string;
    vision2030Program?: string;
    referenceProject?: string;
    culturalReference?: string;
  };
  vision2030Alignment: number;
  strategicHooks: string[];
  generatedAt: string;
  tone: string;
}

export interface ReplyAnalysis {
  replyId: string;
  originalEmailId: string;
  category: 'strategic_interest' | 'request_info' | 'referral' | 'decline' | 'unsubscribe' | 'out_of_office' | 'unknown';
  sentiment: 'positive' | 'neutral' | 'negative';
  actionRequired: 'immediate_followup' | 'schedule_meeting' | 'send_info' | 'nurture' | 'archive';
  priority: number; // 1-10
  summary: string;
  extractedIntents: string[];
  suggestedResponse?: string;
  analyzedAt: string;
}

// Vision 2030 programs for reference
const VISION_2030_PROGRAMS = [
  {
    name: 'PIF Program',
    description: 'Public Investment Fund initiatives and giga-projects',
    keywords: ['NEOM', 'Red Sea', 'Qiddiya', 'ROSHN', 'Diriyah', 'Amaala']
  },
  {
    name: 'Quality of Life',
    description: 'Entertainment, tourism, and lifestyle improvements',
    keywords: ['entertainment', 'tourism', 'lifestyle', 'culture', 'sports']
  },
  {
    name: 'NIDLP',
    description: 'National Industrial Development and Logistics Program',
    keywords: ['manufacturing', 'logistics', 'industrial', 'supply chain']
  },
  {
    name: 'Housing Program',
    description: 'Sakani and housing initiatives',
    keywords: ['housing', 'real estate', 'Sakani', 'construction']
  },
  {
    name: 'FSDP',
    description: 'Financial Sector Development Program',
    keywords: ['finance', 'banking', 'fintech', 'investment']
  },
  {
    name: 'Digital Transformation',
    description: 'National Strategy for Data and AI',
    keywords: ['AI', 'data', 'digital', 'technology', 'innovation', 'cloud']
  },
  {
    name: 'Privatization',
    description: 'National Center for Privatization initiatives',
    keywords: ['privatization', 'PPP', 'investment', 'partnership']
  },
  {
    name: 'Sustainability',
    description: 'Saudi Green Initiative and environmental programs',
    keywords: ['green', 'sustainability', 'renewable', 'carbon', 'environment']
  }
];

// Saudi business etiquette phrases
const SAUDI_ETIQUETTE = {
  greetings: [
    'As-salamu alaykum',
    'I hope this message finds you well',
    'I trust you are in good health and spirits'
  ],
  closings: [
    'Jazak Allahu khairan',
    'With warm regards',
    'Looking forward to your guidance',
    'May our collaboration benefit the Kingdom'
  ],
  respectfulReferences: [
    'your esteemed organization',
    'your distinguished leadership',
    'your visionary approach'
  ]
};

/**
 * Generate strategic outreach email using Gemini 2.5 Flash
 */
export async function generateStrategicOutreach(
  stakeholder: {
    id: string;
    name: string;
    title: string;
    company: string;
    industry?: string;
    vision2030Relevance?: number;
    email?: string;
  },
  sender: {
    companyName: string;
    companyTagline?: string;
    services: string[];
    caseStudy?: string;
  },
  context: {
    targetIndustry: string;
    referenceProject?: string;
    majlisMode?: boolean;
  },
  apiKey: string
): Promise<GeneratedOutreach> {
  const ai = getGenAI(apiKey);

  // Determine relevant Vision 2030 programs
  const relevantPrograms = VISION_2030_PROGRAMS.filter(program =>
    program.keywords.some(kw => 
      context.targetIndustry.toLowerCase().includes(kw.toLowerCase()) ||
      stakeholder.company.toLowerCase().includes(kw.toLowerCase())
    )
  );

  const programRefs = relevantPrograms.map(p => p.name).join(', ') || 'Vision 2030 initiatives';
  const programDetails = relevantPrograms.map(p => `${p.name}: ${p.description}`).join('\n');

  const prompt = `You are Jin, a Regional Intelligence Specialist for Saudi Arabia. Draft a strategic outreach email to a key stakeholder.

RECIPIENT PROFILE:
- Name: ${stakeholder.name}
- Title: ${stakeholder.title}
- Company: ${stakeholder.company}
- Industry: ${stakeholder.industry || context.targetIndustry}

SENDER PROFILE:
- Company: ${sender.companyName}
- Tagline: ${sender.companyTagline || 'Strategic solutions provider'}
- Services: ${sender.services.join(', ')}
${sender.caseStudy ? `- Case Study: ${sender.caseStudy}` : ''}

VISION 2030 ALIGNMENT:
- Relevant Programs: ${programRefs}
${programDetails}

SAUDI BUSINESS ETIQUETTE:
- Use respectful, formal tone
- Reference Vision 2030 and alignment with Kingdom's goals
- Show understanding of local business culture
- Be consultative, not salesy
${context.majlisMode ? '- Include appropriate cultural references and Majlis-style approach' : ''}

REQUIREMENTS:
1. Subject line should be compelling and reference strategic alignment (max 60 chars)
2. Opening should use appropriate greeting
3. Body should reference specific Vision 2030 programs relevant to their industry
4. Show how sender's services align with recipient's Vision 2030 contribution
5. Include specific strategic value proposition
6. Closing should be respectful and professional
7. Total length: 150-200 words

RESPONSE FORMAT (JSON):
{
  "subject": "email subject line",
  "body": "email body text with proper paragraphs",
  "bodyHtml": "HTML formatted version",
  "strategicHooks": ["hook1", "hook2", "hook3"],
  "vision2030Alignment": 85,
  "culturalReference": "any cultural context used"
}`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: { responseMimeType: 'application/json' }
    });

    const text = response.text || '';
    const cleaned = text.replace(/```json\n?|\n?```/g, '').trim();
    const result = JSON.parse(cleaned);

    return {
      id: `outreach-${randomUUID()}`,
      stakeholderId: stakeholder.id,
      subject: result.subject,
      body: result.body,
      bodyHtml: result.bodyHtml || `<p>${result.body.replace(/\n\n/g, '</p><p>')}</p>`,
      personalizations: {
        name: stakeholder.name,
        company: stakeholder.company,
        title: stakeholder.title,
        vision2030Program: programRefs,
        referenceProject: context.referenceProject,
        culturalReference: result.culturalReference
      },
      vision2030Alignment: result.vision2030Alignment || stakeholder.vision2030Relevance || 70,
      strategicHooks: result.strategicHooks || [],
      generatedAt: new Date().toISOString(),
      tone: 'strategic'
    };

  } catch (error: any) {
    console.error('[Jin:Voice] Failed to generate outreach:', error.message);
    
    // Fallback template
    return generateFallbackOutreach(stakeholder, sender, programRefs);
  }
}

/**
 * Generate fallback outreach if AI fails
 */
function generateFallbackOutreach(
  stakeholder: { id: string; name: string; title: string; company: string },
  sender: { companyName: string; services: string[] },
  vision2030Program: string
): GeneratedOutreach {
  const greeting = SAUDI_ETIQUETTE.greetings[0];
  const closing = SAUDI_ETIQUETTE.closings[1];
  
  const subject = `Strategic Partnership: ${sender.companyName} & Vision 2030 Alignment`;
  
  const body = `${greeting},

I hope this message finds you well. I am reaching out regarding potential strategic alignment between ${sender.companyName} and ${stakeholder.company}.

As Saudi Arabia advances its Vision 2030 initiatives, particularly in ${vision2030Program}, I see significant opportunity for collaboration that supports the Kingdom's ambitious goals.

${sender.companyName} specializes in ${sender.services.join(', ')}, and we believe our expertise can contribute meaningfully to your organization's Vision 2030 objectives.

I would welcome the opportunity to discuss how we might collaborate for mutual benefit and the greater success of the Kingdom's transformative vision.

${closing},

Jin
Regional Intelligence Specialist
${sender.companyName}`;

  return {
    id: `outreach-${randomUUID()}`,
    stakeholderId: stakeholder.id,
    subject,
    body,
    bodyHtml: `<p>${greeting},</p><p>I hope this message finds you well...</p>`,
    personalizations: {
      name: stakeholder.name,
      company: stakeholder.company,
      title: stakeholder.title,
      vision2030Program
    },
    vision2030Alignment: 70,
    strategicHooks: ['Vision 2030 alignment', 'Strategic partnership'],
    generatedAt: new Date().toISOString(),
    tone: 'formal'
  };
}

/**
 * Analyze email reply using Gemini
 */
export async function analyzeReply(
  emailContent: string,
  subject: string,
  originalEmailContext?: string,
  apiKey?: string
): Promise<ReplyAnalysis> {
  // If no API key, return basic analysis
  if (!apiKey) {
    return basicReplyAnalysis(emailContent, subject);
  }

  const ai = getGenAI(apiKey);

  const prompt = `You are Jin, analyzing an email response in a Saudi business context.

ORIGINAL EMAIL CONTEXT:
${originalEmailContext || 'Strategic partnership proposal'}

REPLY RECEIVED:
Subject: ${subject}
Content: ${emailContent}

Analyze this response considering:
1. Saudi business culture - indirect "no" is common
2. Specific requests or questions asked
3. Level of interest indicated
4. Action items mentioned
5. Tone and sentiment

Respond with JSON:
{
  "category": "strategic_interest|request_info|referral|decline|unsubscribe|out_of_office|unknown",
  "sentiment": "positive|neutral|negative",
  "actionRequired": "immediate_followup|schedule_meeting|send_info|nurture|archive",
  "priority": 1-10,
  "summary": "Brief analysis of the reply",
  "extractedIntents": ["intent1", "intent2"],
  "suggestedResponse": "Recommended next action or draft reply"
}`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-1.5-flash',
      contents: prompt,
      config: { responseMimeType: 'application/json' }
    });

    const text = response.text || '';
    const cleaned = text.replace(/```json\n?|\n?```/g, '').trim();
    const result = JSON.parse(cleaned);

    return {
      replyId: `reply-${randomUUID()}`,
      originalEmailId: '', // Would be set by caller
      category: result.category || 'unknown',
      sentiment: result.sentiment || 'neutral',
      actionRequired: result.actionRequired || 'nurture',
      priority: result.priority || 5,
      summary: result.summary || 'Analysis incomplete',
      extractedIntents: result.extractedIntents || [],
      suggestedResponse: result.suggestedResponse,
      analyzedAt: new Date().toISOString()
    };

  } catch (error: any) {
    console.error('[Jin:Voice] Reply analysis failed:', error.message);
    return basicReplyAnalysis(emailContent, subject);
  }
}

/**
 * Basic rule-based reply analysis (fallback)
 */
function basicReplyAnalysis(emailContent: string, subject: string): ReplyAnalysis {
  const content = emailContent.toLowerCase();
  
  // Keywords for categorization
  const interestWords = ['interested', 'would like', 'schedule', 'meet', 'discuss', 'opportunity'];
  const infoWords = ['more information', 'details', 'pricing', 'proposal', 'send'];
  const declineWords = ['not interested', 'not now', 'busy', 'pass', 'no budget', 'not the right time'];
  const referralWords = ['contact', 'colleague', 'manager', 'director', 'reach out to'];
  const unsubscribeWords = ['unsubscribe', 'remove', 'stop', 'don\'t email'];
  const oooWords = ['out of office', 'on vacation', 'away', 'will return', 'auto-reply'];
  
  let category: ReplyAnalysis['category'] = 'unknown';
  let priority = 5;
  let actionRequired: ReplyAnalysis['actionRequired'] = 'nurture';
  let sentiment: ReplyAnalysis['sentiment'] = 'neutral';
  
  // Check for OOO first
  if (oooWords.some(w => content.includes(w))) {
    category = 'out_of_office';
    priority = 3;
    actionRequired = 'nurture';
  } else if (unsubscribeWords.some(w => content.includes(w))) {
    category = 'unsubscribe';
    priority = 10;
    actionRequired = 'archive';
    sentiment = 'negative';
  } else if (declineWords.some(w => content.includes(w))) {
    category = 'decline';
    priority = 2;
    actionRequired = 'archive';
    sentiment = 'negative';
  } else if (interestWords.some(w => content.includes(w))) {
    category = 'strategic_interest';
    priority = 9;
    actionRequired = 'immediate_followup';
    sentiment = 'positive';
  } else if (infoWords.some(w => content.includes(w))) {
    category = 'request_info';
    priority = 7;
    actionRequired = 'send_info';
    sentiment = 'positive';
  } else if (referralWords.some(w => content.includes(w))) {
    category = 'referral';
    priority = 8;
    actionRequired = 'schedule_meeting';
    sentiment = 'positive';
  }
  
  // Additional sentiment analysis
  if (content.includes('thank') || content.includes('appreciate') || content.includes('great')) {
    sentiment = 'positive';
  } else if (content.includes('unfortunately') || content.includes('sorry') || content.includes('regret')) {
    sentiment = 'negative';
  }

  return {
    replyId: `reply-${randomUUID()}`,
    originalEmailId: '',
    category,
    sentiment,
    actionRequired,
    priority,
    summary: `Detected ${category} with ${sentiment} sentiment`,
    extractedIntents: [],
    analyzedAt: new Date().toISOString()
  };
}

/**
 * Generate follow-up email based on reply analysis
 */
export async function generateFollowUp(
  originalOutreach: GeneratedOutreach,
  replyAnalysis: ReplyAnalysis,
  sender: { companyName: string; services: string[] },
  apiKey?: string
): Promise<string> {
  if (!apiKey) {
    return generateBasicFollowUp(replyAnalysis, sender);
  }

  const ai = getGenAI(apiKey);

  const prompt = `Generate a follow-up email based on the prospect's reply analysis.

ORIGINAL EMAIL:
Subject: ${originalOutreach.subject}
Body: ${originalOutreach.body}

REPLY ANALYSIS:
- Category: ${replyAnalysis.category}
- Sentiment: ${replyAnalysis.sentiment}
- Action Required: ${replyAnalysis.actionRequired}
- Summary: ${replyAnalysis.summary}

SENDER:
- Company: ${sender.companyName}
- Services: ${sender.services.join(', ')}

Generate a concise, professional follow-up email (100-150 words) that:
1. Acknowledges their response appropriately
2. Addresses their specific needs/intents
3. Moves the conversation forward based on the action required

Return only the email body text.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-1.5-flash',
      contents: prompt
    });

    return response.text || generateBasicFollowUp(replyAnalysis, sender);
  } catch (error) {
    return generateBasicFollowUp(replyAnalysis, sender);
  }
}

function generateBasicFollowUp(
  replyAnalysis: ReplyAnalysis,
  sender: { companyName: string }
): string {
  const greetings = ['Thank you for your response', 'I appreciate your reply'];
  
  switch (replyAnalysis.actionRequired) {
    case 'send_info':
      return `${greetings[0]}. I will prepare detailed information about our services and send it to you shortly. Please let me know if there's anything specific you'd like to know.`;
    
    case 'schedule_meeting':
      return `${greetings[0]}. I would be happy to schedule a meeting at your convenience. Please let me know what times work best for you, and I will adjust accordingly.`;
    
    case 'immediate_followup':
      return `${greetings[0]}. I'm excited about the potential collaboration. Could we schedule a brief call this week to discuss how we can move forward?`;
    
    case 'archive':
      return `${greetings[0]}. I understand completely and appreciate your time. If anything changes in the future, please don't hesitate to reach out.`;
    
    default:
      return `${greetings[0]}. I look forward to continuing our conversation and exploring how ${sender.companyName} can support your goals.`;
  }
}

/**
 * Get strategic hooks for a given industry/company
 */
export function getStrategicHooks(
  industry: string,
  companyName: string,
  vision2030Relevance?: number
): string[] {
  const hooks: string[] = [];
  
  // Industry-specific hooks
  if (industry.toLowerCase().includes('tech') || industry.toLowerCase().includes('digital')) {
    hooks.push('Digital Transformation initiatives under Vision 2030');
    hooks.push('National Strategy for Data and AI alignment');
  }
  
  if (industry.toLowerCase().includes('tourism') || industry.toLowerCase().includes('entertainment')) {
    hooks.push('Quality of Life Program objectives');
    hooks.push('Saudi tourism sector expansion');
  }
  
  if (industry.toLowerCase().includes('finance') || industry.toLowerCase().includes('fintech')) {
    hooks.push('Financial Sector Development Program');
    hooks.push('Fintech Saudi initiatives');
  }
  
  if (industry.toLowerCase().includes('energy') || industry.toLowerCase().includes('renewable')) {
    hooks.push('Saudi Green Initiative');
    hooks.push('Energy transition goals');
  }
  
  // Generic but powerful hooks
  if (vision2030Relevance && vision2030Relevance > 70) {
    hooks.push(`Strong Vision 2030 alignment (${vision2030Relevance}% score)`);
  }
  
  hooks.push(`Strategic contribution to ${companyName}'s growth`);
  hooks.push('Mutual value creation for the Kingdom');
  
  return hooks.slice(0, 3); // Return top 3
}
