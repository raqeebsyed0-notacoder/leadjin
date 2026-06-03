/**
 * Module 5: Intelligence Hub (CRM Intelligence Hub - Final Artisan Module)
 *
 * Central intelligence coordinator that wires all modules together:
 * - Hunter (Module 1) → Verifier (Module 2) → Writer (Module 3) → Reply Manager (Module 4) → CRM
 *
 * Provides unified lead scoring, pipeline management, relationship tracking,
 * and AI-powered next best action recommendations using Gemini 2.5 Flash.
 */

import type { Database } from 'better-sqlite3';
import { GoogleGenAI } from '@google/genai';
import { getGenAI } from './genaiClient.js';
import type { HuntResult, ExecutiveProfile } from './linkedinHunter.js';
import type { SovereignVerificationResult, LeadIdentity } from './sovereignVerifier.js';
import type { CraftedOutreach, LeadProfile, OutreachContext } from './visionStrategist.js';
import type { ClassifyResult, ReplyCategory } from './protocolManager.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OutreachStatus = 'new' | 'contacted' | 'replied' | 'interested' | 'meeting_booked' | 'closed';

export interface LeadIntelligence {
  confidence_score: number;
  source_url?: string;
  verification_log: string[];
  intent_signals: IntentSignal[];
  outreach_status: OutreachStatus;
  last_contacted_at?: string;
  reply_category?: ReplyCategory;
  vision_alignment_score: number;
}

export interface IntentSignal {
  type: string;
  title: string;
  description?: string;
  confidence: number;
  detected_at: string;
  source?: string;
}

export interface UpdateIntelligenceInput {
  hunterData?: HuntResult;
  verificationData?: SovereignVerificationResult;
  outreachData?: {
    craftedOutreach?: CraftedOutreach;
    sentAt?: string;
    senderUserId?: number;
  };
  replyData?: {
    classification: ClassifyResult;
    replyBody: string;
    receivedAt: string;
  };
  visionAlignment?: {
    score: number;
    primaryProgram: string;
    reasoning: string;
  };
  intentSignals?: IntentSignal[];
}

export interface PipelineGroup {
  status: OutreachStatus;
  leads: LeadWithIntelligence[];
  count: number;
  avgScore: number;
}

export interface LeadWithIntelligence {
  lead_id: string;
  user_id: number;
  name: string;
  title?: string;
  company?: string;
  email?: string;
  phone?: string;
  linkedin?: string;
  industry?: string;
  status: string;
  lead_score?: number;
  confidence_score?: number;
  source_url?: string;
  verification_log?: string[];
  intent_signals?: IntentSignal[];
  outreach_status: OutreachStatus;
  last_contacted_at?: string;
  reply_category?: ReplyCategory;
  vision_alignment_score?: number;
  created_at: string;
  updated_at: string;
}

export interface CompositeScore {
  overall: number;
  confidence: number;
  verification: number;
  intent: number;
  visionAlignment: number;
  engagement: number;
  breakdown: {
    confidence: { raw: number; weighted: number; weight: number };
    verification: { raw: number; weighted: number; weight: number };
    intent: { raw: number; weighted: number; weight: number };
    vision: { raw: number; weighted: number; weight: number };
    engagement: { raw: number; weighted: number; weight: number };
  };
}

export interface InteractionEvent {
  type: 'email_sent' | 'email_reply' | 'email_open' | 'email_click' | 'meeting' | 'call' | 'note' | 'status_change';
  timestamp: string;
  details?: string;
  metadata?: Record<string, any>;
}

export interface RelationshipHistory {
  lead_id: string;
  events: InteractionEvent[];
  last_interaction_at?: string;
  interaction_count: number;
}

export interface NextActionRecommendation {
  action: string;
  priority: 'high' | 'medium' | 'low';
  reasoning: string;
  suggested_timing?: string;
  expected_outcome?: string;
  confidence: number;
}

export interface EngagementMetrics {
  emails_sent: number;
  emails_replied: number;
  emails_opened: number;
  emails_clicked: number;
  meetings_booked: number;
  response_rate: number;
  engagement_score: number;
}

// ---------------------------------------------------------------------------
// Database Schema Helpers
// ---------------------------------------------------------------------------

const INTELLIGENCE_COLUMNS = [
  'confidence_score REAL DEFAULT 0',
  'source_url TEXT',
  'verification_log TEXT DEFAULT "[]"',
  'intent_signals TEXT DEFAULT "[]"',
  'outreach_status TEXT DEFAULT "new"',
  'last_contacted_at DATETIME',
  'reply_category TEXT',
  'vision_alignment_score REAL DEFAULT 0',
  'interaction_history TEXT DEFAULT "[]"',
  'last_interaction_at DATETIME',
];

/**
 * Initialize intelligence columns in leads table
 * Safe to call multiple times - ignores duplicate column errors
 */
export function initIntelligenceSchema(db: Database): void {
  for (const columnDef of INTELLIGENCE_COLUMNS) {
    const columnName = columnDef.split(' ')[0];
    try {
      db.exec(`ALTER TABLE leads ADD COLUMN ${columnDef}`);
      console.log(`[IntelligenceHub] Added column: ${columnName}`);
    } catch (e: any) {
      if (!e.message?.includes('duplicate column')) {
        console.warn(`[IntelligenceHub] Migration warning for ${columnName}:`, e.message);
      }
    }
  }

  // Create index for pipeline queries
  try {
    db.exec('CREATE INDEX IF NOT EXISTS idx_leads_outreach_status ON leads(user_id, outreach_status)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_leads_intelligence ON leads(lead_id, confidence_score, vision_alignment_score)');
  } catch (e: any) {
    console.warn('[IntelligenceHub] Index creation warning:', e.message);
  }

  console.log('[IntelligenceHub] Schema initialization complete');
}

// ---------------------------------------------------------------------------
// Intelligence Update Functions
// ---------------------------------------------------------------------------

let dbInstance: Database | null = null;

export function setIntelligenceDatabase(db: Database): void {
  dbInstance = db;
}

function getDb(): Database {
  if (!dbInstance) {
    throw new Error('IntelligenceHub: Database not initialized. Call setIntelligenceDatabase first.');
  }
  return dbInstance;
}

/**
 * Update lead intelligence with data from any module
 */
export async function updateLeadIntelligence(
  leadId: string,
  data: UpdateIntelligenceInput
): Promise<LeadWithIntelligence | null> {
  const db = getDb();
  const updates: string[] = [];
  const values: any[] = [];

  // Hunter data: source URL and initial confidence
  if (data.hunterData) {
    updates.push('source_url = ?');
    values.push(data.hunterData.domain);
    
    if (data.hunterData.executives.length > 0) {
      const avgConfidence = data.hunterData.executives.reduce((sum, e) => sum + e.confidence, 0) / data.hunterData.executives.length;
      updates.push('confidence_score = MAX(confidence_score, ?)');
      values.push(avgConfidence);
    }
  }

  // Verification data: verification log and confidence boost
  if (data.verificationData) {
    updates.push('verification_log = ?');
    values.push(JSON.stringify(data.verificationData.verificationLog));
    
    // Update confidence based on verification result
    updates.push('confidence_score = MAX(confidence_score, ?)');
    values.push(data.verificationData.confidenceScore);
    // NOTE: email_verified is NOT set here — it must come from a real ladder result
    // (verifyEmailLadder), never from a composite confidence score.
    // A high overall lead score (phone/social) does not make an email verified.
  }

  // Outreach data: track sending
  if (data.outreachData) {
    if (data.outreachData.sentAt) {
      updates.push('last_contacted_at = ?');
      values.push(data.outreachData.sentAt);
    }
    
    // Only update status if currently 'new' (don't overwrite replies)
    updates.push("outreach_status = CASE WHEN outreach_status = 'new' THEN 'contacted' ELSE outreach_status END");
  }

  // Reply data: classification and status update
  if (data.replyData) {
    updates.push('reply_category = ?');
    values.push(data.replyData.classification.category);
    
    // Update outreach status based on classification
    const statusMap: Record<ReplyCategory, OutreachStatus> = {
      'INTERESTED': 'interested',
      'NOT_INTERESTED': 'closed',
      'OOO': 'contacted',
      'QUESTION': 'replied',
      'REFERRAL': 'replied',
    };
    
    updates.push('outreach_status = ?');
    values.push(statusMap[data.replyData.classification.category] || 'replied');
  }

  // Vision alignment data
  if (data.visionAlignment) {
    updates.push('vision_alignment_score = ?');
    values.push(data.visionAlignment.score);
  }

  // Intent signals
  if (data.intentSignals && data.intentSignals.length > 0) {
    updates.push('intent_signals = ?');
    values.push(JSON.stringify(data.intentSignals));
  }

  if (updates.length === 0) {
    return null;
  }

  const query = `UPDATE leads SET ${updates.join(', ')} WHERE lead_id = ?`;
  values.push(leadId);

  try {
    db.prepare(query).run(...values);
    
    // Fetch and return updated lead
    const lead = db.prepare('SELECT * FROM leads WHERE lead_id = ?').get(leadId) as any;
    return lead ? parseLeadIntelligence(lead) : null;
  } catch (error: any) {
    console.error('[IntelligenceHub] Update failed:', error.message);
    throw error;
  }
}

/**
 * Parse database row into LeadWithIntelligence
 */
function parseLeadIntelligence(row: any): LeadWithIntelligence {
  return {
    lead_id: row.lead_id,
    user_id: row.user_id,
    name: row.name,
    title: row.title,
    company: row.company,
    email: row.email,
    phone: row.phone,
    linkedin: row.linkedin,
    industry: row.industry,
    status: row.status,
    lead_score: row.lead_score,
    confidence_score: row.confidence_score || 0,
    source_url: row.source_url,
    verification_log: safeJsonParse(row.verification_log, []),
    intent_signals: safeJsonParse(row.intent_signals, []),
    outreach_status: (row.outreach_status as OutreachStatus) || 'new',
    last_contacted_at: row.last_contacted_at,
    reply_category: row.reply_category as ReplyCategory,
    vision_alignment_score: row.vision_alignment_score || 0,
    created_at: row.created_at,
    updated_at: row.stage_entered_at || row.created_at,
  };
}

function safeJsonParse<T>(json: string | null | undefined, defaultValue: T): T {
  if (!json) return defaultValue;
  try {
    return JSON.parse(json) as T;
  } catch {
    return defaultValue;
  }
}

// ---------------------------------------------------------------------------
// Relationship Tracking (Module 5 Core Feature)
// ---------------------------------------------------------------------------

/**
 * Track relationship history for a lead
 * Maintains interaction history from all touchpoints
 */
export function trackRelationship(
  leadId: string,
  events: InteractionEvent[]
): RelationshipHistory {
  const db = getDb();
  
  // Get existing interaction history
  const existing = db.prepare(
    'SELECT interaction_history FROM leads WHERE lead_id = ?'
  ).get(leadId) as any;
  
  let history: InteractionEvent[] = [];
  if (existing?.interaction_history) {
    history = safeJsonParse(existing.interaction_history, []);
  }
  
  // Add new events with timestamps
  const newEvents = events.map(e => ({
    ...e,
    timestamp: e.timestamp || new Date().toISOString(),
  }));
  
  history = [...history, ...newEvents];
  
  // Update lead record
  db.prepare(
    'UPDATE leads SET interaction_history = ?, last_interaction_at = ? WHERE lead_id = ?'
  ).run(
    JSON.stringify(history),
    newEvents[newEvents.length - 1]?.timestamp || new Date().toISOString(),
    leadId
  );
  
  // Log events to activity_log for auditing
  for (const event of newEvents) {
    db.prepare(
      'INSERT INTO activity_log (lead_id, type, description, created_at) VALUES (?, ?, ?, ?)'
    ).run(
      leadId,
      event.type.toUpperCase(),
      event.details || `${event.type} event`,
      event.timestamp
    );
  }
  
  return {
    lead_id: leadId,
    events: history,
    last_interaction_at: history[history.length - 1]?.timestamp,
    interaction_count: history.length,
  };
}

/**
 * Get relationship history for a lead
 */
export function getRelationshipHistory(leadId: string): RelationshipHistory {
  const db = getDb();
  
  // Get from leads table
  const lead = db.prepare(
    'SELECT interaction_history, last_interaction_at FROM leads WHERE lead_id = ?'
  ).get(leadId) as any;
  
  let events: InteractionEvent[] = [];
  if (lead?.interaction_history) {
    events = safeJsonParse(lead.interaction_history, []);
  }
  
  // Also fetch from activity_log for complete history
  const activityEvents = db.prepare(
    `SELECT type, description as details, created_at as timestamp 
     FROM activity_log 
     WHERE lead_id = ? 
     ORDER BY created_at DESC`
  ).all(leadId) as any[];
  
  // Merge and deduplicate
  const allEvents = [...events];
  for (const activity of activityEvents) {
    const eventType = mapActivityTypeToInteraction(activity.type);
    if (!events.some(e => e.timestamp === activity.timestamp && e.type === eventType)) {
      allEvents.push({
        type: eventType,
        timestamp: activity.timestamp,
        details: activity.details,
      });
    }
  }
  
  allEvents.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  
  return {
    lead_id: leadId,
    events: allEvents,
    last_interaction_at: lead?.last_interaction_at || allEvents[0]?.timestamp,
    interaction_count: allEvents.length,
  };
}

function mapActivityTypeToInteraction(type: string): InteractionEvent['type'] {
  const mapping: Record<string, InteractionEvent['type']> = {
    'EMAIL_SENT': 'email_sent',
    'EMAIL_REPLY': 'email_reply',
    'STATUS_CHANGE': 'status_change',
    'NOTE': 'note',
    'MEETING': 'meeting',
    'CALL': 'call',
    'SEQUENCE_EMAIL_QUEUED': 'email_sent',
    'SEQUENCE_PAUSED': 'status_change',
  };
  return mapping[type] || 'note';
}

/**
 * Calculate engagement metrics for a lead
 */
export function calculateEngagementMetrics(leadId: string): EngagementMetrics {
  const db = getDb();
  
  // Count emails sent
  const emailsSent = db.prepare(
    'SELECT COUNT(*) as count FROM email_queue WHERE lead_id = ? AND status = ?'
  ).get(leadId, 'SENT') as { count: number };
  
  // Count replies (via activity_log)
  const replies = db.prepare(
    'SELECT COUNT(*) as count FROM activity_log WHERE lead_id = ? AND type = ?'
  ).get(leadId, 'EMAIL_REPLY') as { count: number };
  
  // Count email opens and clicks
  const opens = db.prepare(
    `SELECT COUNT(*) as count FROM email_events ee
     JOIN email_queue eq ON eq.id = ee.email_queue_id
     WHERE eq.lead_id = ? AND ee.event_type = 'open'`
  ).get(leadId) as { count: number };
  
  const clicks = db.prepare(
    `SELECT COUNT(*) as count FROM email_events ee
     JOIN email_queue eq ON eq.id = ee.email_queue_id
     WHERE eq.lead_id = ? AND ee.event_type = 'click'`
  ).get(leadId) as { count: number };
  
  // Count meetings from bookings table
  const meetings = db.prepare(
    'SELECT COUNT(*) as count FROM bookings WHERE lead_id = ?'
  ).get(leadId) as { count: number };
  
  const sentCount = emailsSent?.count || 0;
  const replyCount = replies?.count || 0;
  const openCount = opens?.count || 0;
  const clickCount = clicks?.count || 0;
  const meetingCount = meetings?.count || 0;
  
  // Calculate rates
  const responseRate = sentCount > 0 ? (replyCount / sentCount) * 100 : 0;
  
  // Calculate engagement score (0-100)
  // Weighted: replies (40%), opens (25%), clicks (25%), meetings (10%)
  const engagementScore = Math.min(100, Math.round(
    (responseRate * 0.4) + 
    (Math.min(100, (openCount / Math.max(1, sentCount)) * 100) * 0.25) +
    (Math.min(100, (clickCount / Math.max(1, sentCount)) * 100) * 0.25) +
    (Math.min(100, meetingCount * 20) * 0.1)
  ));
  
  return {
    emails_sent: sentCount,
    emails_replied: replyCount,
    emails_opened: openCount,
    emails_clicked: clickCount,
    meetings_booked: meetingCount,
    response_rate: Math.round(responseRate * 10) / 10,
    engagement_score: engagementScore,
  };
}

// ---------------------------------------------------------------------------
// Pipeline Management
// ---------------------------------------------------------------------------

/**
 * Get all leads grouped by outreach_status
 */
export function getLeadPipeline(userId?: number): PipelineGroup[] {
  const db = getDb();
  
  const statuses: OutreachStatus[] = ['new', 'contacted', 'replied', 'interested', 'meeting_booked', 'closed'];
  const pipeline: PipelineGroup[] = [];

  for (const status of statuses) {
    let query = 'SELECT * FROM leads WHERE outreach_status = ?';
    const params: any[] = [status];
    
    if (userId !== undefined) {
      query += ' AND user_id = ?';
      params.push(userId);
    }
    
    query += ' ORDER BY confidence_score DESC, created_at DESC';

    const rows = db.prepare(query).all(...params) as any[];
    const leads = rows.map(parseLeadIntelligence);
    
    const avgScore = leads.length > 0
      ? leads.reduce((sum, l) => sum + (getLeadScore(l.lead_id).overall || 0), 0) / leads.length
      : 0;

    pipeline.push({
      status,
      leads,
      count: leads.length,
      avgScore: Math.round(avgScore),
    });
  }

  return pipeline;
}

/**
 * Get pipeline view - alias for getLeadPipeline for API consistency
 */
export function getPipelineView(userId?: number): PipelineGroup[] {
  return getLeadPipeline(userId);
}

/**
 * Get leads in a specific pipeline stage
 */
export function getLeadsByStatus(status: OutreachStatus, userId?: number, limit: number = 100): LeadWithIntelligence[] {
  const db = getDb();
  
  let query = 'SELECT * FROM leads WHERE outreach_status = ?';
  const params: any[] = [status];
  
  if (userId !== undefined) {
    query += ' AND user_id = ?';
    params.push(userId);
  }
  
  query += ' ORDER BY confidence_score DESC LIMIT ?';
  params.push(limit);

  const rows = db.prepare(query).all(...params) as any[];
  return rows.map(parseLeadIntelligence);
}

/**
 * Move lead to next pipeline stage
 */
export function advanceLeadStage(leadId: string, newStatus: OutreachStatus): boolean {
  const db = getDb();
  
  const validTransitions: Record<OutreachStatus, OutreachStatus[]> = {
    'new': ['contacted'],
    'contacted': ['replied', 'interested', 'closed'],
    'replied': ['interested', 'meeting_booked', 'closed'],
    'interested': ['meeting_booked', 'closed'],
    'meeting_booked': ['closed'],
    'closed': [],
  };

  // Get current status
  const current = db.prepare('SELECT outreach_status FROM leads WHERE lead_id = ?').get(leadId) as any;
  if (!current) return false;

  const currentStatus = current.outreach_status as OutreachStatus;
  
  // Allow same status or valid transition
  if (currentStatus !== newStatus && !validTransitions[currentStatus]?.includes(newStatus)) {
    console.warn(`[IntelligenceHub] Invalid transition: ${currentStatus} → ${newStatus}`);
    return false;
  }

  try {
    db.prepare('UPDATE leads SET outreach_status = ?, stage_entered_at = CURRENT_TIMESTAMP WHERE lead_id = ?')
      .run(newStatus, leadId);
    return true;
  } catch (error: any) {
    console.error('[IntelligenceHub] Stage advance failed:', error.message);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Lead Scoring (Enhanced with Engagement Metrics)
// ---------------------------------------------------------------------------

/**
 * Calculate composite score for a lead
 * Combines: confidence + verification + intent + vision alignment + engagement
 */
export function getLeadScore(leadId: string): CompositeScore {
  const db = getDb();
  
  const lead = db.prepare('SELECT * FROM leads WHERE lead_id = ?').get(leadId) as any;
  if (!lead) {
    return {
      overall: 0,
      confidence: 0,
      verification: 0,
      intent: 0,
      visionAlignment: 0,
      engagement: 0,
      breakdown: {
        confidence: { raw: 0, weighted: 0, weight: 0.20 },
        verification: { raw: 0, weighted: 0, weight: 0.25 },
        intent: { raw: 0, weighted: 0, weight: 0.15 },
        vision: { raw: 0, weighted: 0, weight: 0.20 },
        engagement: { raw: 0, weighted: 0, weight: 0.20 },
      },
    };
  }

  // Weights for composite score (updated to include engagement)
  const WEIGHTS = {
    confidence: 0.20,
    verification: 0.25,
    intent: 0.15,
    vision: 0.20,
    engagement: 0.20,
  };

  // Confidence score (0-100)
  const confidenceScore = lead.confidence_score || 0;

  // Verification score (0-100) - based on email_verified and verification_log
  let verificationScore = 0;
  if (lead.email_verified) verificationScore += 50;
  const verificationLog = safeJsonParse(lead.verification_log, [] as string[]);
  if (verificationLog.some((log: string) => log.includes('ACCEPTED'))) verificationScore += 30;
  if (lead.linkedin) verificationScore += 20;
  verificationScore = Math.min(100, verificationScore);

  // Intent score (0-100) - based on intent_signals
  let intentScore = 0;
  const intentSignals = safeJsonParse(lead.intent_signals, [] as IntentSignal[]);
  if (intentSignals.length > 0) {
    const avgIntentConfidence = intentSignals.reduce((sum: number, s: IntentSignal) => sum + (s.confidence || 0), 0) / intentSignals.length;
    intentScore = Math.min(100, avgIntentConfidence * (1 + intentSignals.length * 0.1));
  }
  // Boost intent score based on reply category
  if (lead.reply_category === 'INTERESTED') intentScore = Math.max(intentScore, 90);
  if (lead.reply_category === 'QUESTION') intentScore = Math.max(intentScore, 70);

  // Vision alignment score (0-100)
  const visionScore = lead.vision_alignment_score || 0;
  
  // Engagement score (0-100) - calculated from interaction history
  const engagementMetrics = calculateEngagementMetrics(leadId);
  const engagementScore = engagementMetrics.engagement_score;

  // Calculate weighted overall score
  const weightedConfidence = confidenceScore * WEIGHTS.confidence;
  const weightedVerification = verificationScore * WEIGHTS.verification;
  const weightedIntent = intentScore * WEIGHTS.intent;
  const weightedVision = visionScore * WEIGHTS.vision;
  const weightedEngagement = engagementScore * WEIGHTS.engagement;

  const overall = Math.round(weightedConfidence + weightedVerification + weightedIntent + weightedVision + weightedEngagement);

  return {
    overall,
    confidence: confidenceScore,
    verification: verificationScore,
    intent: intentScore,
    visionAlignment: visionScore,
    engagement: engagementScore,
    breakdown: {
      confidence: { raw: confidenceScore, weighted: Math.round(weightedConfidence), weight: WEIGHTS.confidence },
      verification: { raw: verificationScore, weighted: Math.round(weightedVerification), weight: WEIGHTS.verification },
      intent: { raw: intentScore, weighted: Math.round(weightedIntent), weight: WEIGHTS.intent },
      vision: { raw: visionScore, weighted: Math.round(weightedVision), weight: WEIGHTS.vision },
      engagement: { raw: engagementScore, weighted: Math.round(weightedEngagement), weight: WEIGHTS.engagement },
    },
  };
}

/**
 * Get AI-enhanced lead score using Gemini 2.5 Flash
 * Provides intelligent scoring with reasoning
 */
export async function getLeadScoreAI(
  leadId: string,
  apiKey?: string
): Promise<CompositeScore & { aiReasoning: string; recommendations: string[] }> {
  const db = getDb();
  const baseScore = getLeadScore(leadId);
  
  const lead = db.prepare('SELECT * FROM leads WHERE lead_id = ?').get(leadId) as any;
  if (!lead || !apiKey) {
    return {
      ...baseScore,
      aiReasoning: 'AI scoring unavailable - using algorithmic score',
      recommendations: ['Add Gemini API key for AI-enhanced scoring'],
    };
  }
  
  const engagement = calculateEngagementMetrics(leadId);
  const history = getRelationshipHistory(leadId);

  const ai = getGenAI(apiKey);

  const prompt = `You are a CRM intelligence expert. Analyze this lead and provide an AI-enhanced scoring assessment.

LEAD PROFILE:
- Name: ${lead.name}
- Title: ${lead.title || 'Unknown'}
- Company: ${lead.company || 'Unknown'}
- Industry: ${lead.industry || 'Unknown'}
- Email Verified: ${lead.email_verified ? 'Yes' : 'No'}
- Outreach Status: ${lead.outreach_status || 'new'}
- Reply Category: ${lead.reply_category || 'None'}

ENGAGEMENT METRICS:
- Emails Sent: ${engagement.emails_sent}
- Emails Replied: ${engagement.emails_replied}
- Emails Opened: ${engagement.emails_opened}
- Emails Clicked: ${engagement.emails_clicked}
- Response Rate: ${engagement.response_rate}%
- Meetings Booked: ${engagement.meetings_booked}

BASE SCORES:
- Confidence: ${baseScore.confidence}/100
- Verification: ${baseScore.verification}/100
- Intent: ${baseScore.intent}/100
- Vision Alignment: ${baseScore.visionAlignment}/100
- Engagement: ${baseScore.engagement}/100
- Overall: ${baseScore.overall}/100

INTERACTION HISTORY (${history.interaction_count} events):
${history.events.slice(0, 10).map(e => `- ${e.type} at ${e.timestamp}: ${e.details || ''}`).join('\n')}

TASK:
Analyze this lead's potential value and provide:
1. AI reasoning for the score (why this lead is hot/cold)
2. Three specific recommendations to improve engagement
3. A confidence adjustment (0-100) representing your AI assessment

Respond with JSON:
{
  "aiReasoning": "Detailed explanation of lead quality assessment",
  "recommendations": ["Action 1", "Action 2", "Action 3"],
  "aiConfidence": 85,
  "hotLead": true/false
}`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: { responseMimeType: 'application/json' }
    });
    
    const text = response.text || '';
    const cleaned = text.replace(/\`\`\`json\n?|\n?\`\`\`/g, '').trim();
    const result = JSON.parse(cleaned);
    
    // Blend AI confidence with base score (70% base, 30% AI)
    const aiConfidence = result.aiConfidence || baseScore.overall;
    const blendedOverall = Math.round((baseScore.overall * 0.7) + (aiConfidence * 0.3));
    
    return {
      ...baseScore,
      overall: blendedOverall,
      aiReasoning: result.aiReasoning || 'AI analysis completed',
      recommendations: result.recommendations || [],
    };
  } catch (error: any) {
    console.error('[IntelligenceHub] AI scoring failed:', error.message);
    return {
      ...baseScore,
      aiReasoning: 'AI scoring failed - using algorithmic score',
      recommendations: ['Retry AI scoring later'],
    };
  }
}

/**
 * Get top scoring leads
 */
export function getTopScoredLeads(userId?: number, limit: number = 20): Array<LeadWithIntelligence & { compositeScore: number }> {
  const db = getDb();
  
  let query = 'SELECT * FROM leads WHERE email IS NOT NULL';
  const params: any[] = [];
  
  if (userId !== undefined) {
    query += ' AND user_id = ?';
    params.push(userId);
  }
  
  query += ' ORDER BY (confidence_score + vision_alignment_score + CASE WHEN email_verified THEN 30 ELSE 0 END) DESC LIMIT ?';
  params.push(limit);

  const rows = db.prepare(query).all(...params) as any[];
  
  return rows.map(row => {
    const lead = parseLeadIntelligence(row);
    const score = getLeadScore(lead.lead_id);
    return { ...lead, compositeScore: score.overall };
  });
}

// ---------------------------------------------------------------------------
// Next Best Action (Module 5 AI Feature)
// ---------------------------------------------------------------------------

/**
 * Get next best action recommendation using Gemini 2.5 Flash
 * Analyzes lead state, history, and engagement to suggest optimal next step
 */
export async function getNextAction(
  leadId: string,
  apiKey?: string
): Promise<NextActionRecommendation> {
  const db = getDb();
  
  const lead = db.prepare('SELECT * FROM leads WHERE lead_id = ?').get(leadId) as any;
  if (!lead) {
    return {
      action: 'Lead not found',
      priority: 'low',
      reasoning: 'The specified lead ID does not exist in the database',
      confidence: 0,
    };
  }
  
  // Gather context for AI decision
  const score = getLeadScore(leadId);
  const engagement = calculateEngagementMetrics(leadId);
  const history = getRelationshipHistory(leadId);
  
  // If no API key, return rule-based recommendation
  if (!apiKey) {
    return generateRuleBasedRecommendation(lead, score, engagement, history);
  }
  
  // Use Gemini for intelligent recommendation
  const ai = getGenAI(apiKey);

  const prompt = `You are a CRM intelligence expert. Analyze this lead and recommend the next best action.

LEAD PROFILE:
- Name: ${lead.name}
- Title: ${lead.title || 'Unknown'}
- Company: ${lead.company || 'Unknown'}
- Industry: ${lead.industry || 'Unknown'}
- Email: ${lead.email || 'Not available'}
- LinkedIn: ${lead.linkedin || 'Not available'}
- Outreach Status: ${lead.outreach_status || 'new'}
- Reply Category: ${lead.reply_category || 'None'}

COMPOSITE SCORE: ${score.overall}/100
- Confidence: ${score.confidence}/100
- Verification: ${score.verification}/100
- Intent: ${score.intent}/100
- Vision Alignment: ${score.visionAlignment}/100
- Engagement: ${score.engagement}/100

ENGAGEMENT METRICS:
- Emails Sent: ${engagement.emails_sent}
- Response Rate: ${engagement.response_rate}%
- Meetings Booked: ${engagement.meetings_booked}

RECENT INTERACTIONS (last 5):
${history.events.slice(0, 5).map(e => `- ${e.type} at ${new Date(e.timestamp).toLocaleDateString()}: ${e.details || ''}`).join('\n') || 'No interactions recorded'}

AVAILABLE ACTIONS:
1. send_email - Send personalized outreach email
2. send_followup - Send follow-up to previous email
3. schedule_meeting - Propose a meeting/call
4. connect_linkedin - Connect via LinkedIn
5. make_call - Make a phone call
6. send_proposal - Send a proposal/quotation
7. wait - Wait for lead to respond
8. disqualify - Mark as not interested/closed
9. escalate - Escalate to senior team member

TASK:
Based on the lead's status, score, and interaction history, recommend the single best next action.
Consider:
- Don't spam leads who haven't responded to multiple emails
- High-scoring leads deserve more aggressive follow-up
- Leads that replied with questions need answers before selling
- Meeting-booked leads need nurturing

Respond with JSON:
{
  "action": "One of the available actions above",
  "priority": "high|medium|low",
  "reasoning": "Brief explanation of why this action is recommended",
  "suggested_timing": "When to take this action (e.g., 'Immediately', 'Wait 2 days', 'Thursday morning')",
  "expected_outcome": "What we expect to happen from this action",
  "confidence": 85
}`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: { responseMimeType: 'application/json' }
    });
    
    const text = response.text || '';
    const cleaned = text.replace(/\`\`\`json\n?|\n?\`\`\`/g, '').trim();
    const result = JSON.parse(cleaned);
    
    return {
      action: result.action || 'send_email',
      priority: result.priority || 'medium',
      reasoning: result.reasoning || 'AI recommendation',
      suggested_timing: result.suggested_timing,
      expected_outcome: result.expected_outcome,
      confidence: result.confidence || 70,
    };
  } catch (error: any) {
    console.error('[IntelligenceHub] AI next action failed:', error.message);
    return generateRuleBasedRecommendation(lead, score, engagement, history);
  }
}

/**
 * Generate rule-based recommendation as fallback
 */
function generateRuleBasedRecommendation(
  lead: any,
  score: CompositeScore,
  engagement: EngagementMetrics,
  history: RelationshipHistory
): NextActionRecommendation {
  const status = lead.outreach_status as OutreachStatus;
  const replyCategory = lead.reply_category;
  
  // Rule-based logic for fallback
  if (status === 'new') {
    return {
      action: 'send_email',
      priority: score.overall > 70 ? 'high' : 'medium',
      reasoning: 'New lead with no outreach yet. Initial contact recommended.',
      suggested_timing: 'Within 24 hours',
      expected_outcome: 'Lead becomes aware of our services',
      confidence: 80,
    };
  }
  
  if (status === 'contacted') {
    if (engagement.emails_sent >= 3 && engagement.emails_replied === 0) {
      return {
        action: 'connect_linkedin',
        priority: 'medium',
        reasoning: 'Multiple emails sent with no response. Try alternative channel.',
        suggested_timing: 'After 1 week from last email',
        expected_outcome: 'Connection established on LinkedIn',
        confidence: 60,
      };
    }
    return {
      action: 'send_followup',
      priority: 'medium',
      reasoning: 'Previous email sent but no reply yet. Gentle follow-up recommended.',
      suggested_timing: '3-4 days after initial email',
      expected_outcome: 'Lead responds to follow-up',
      confidence: 65,
    };
  }
  
  if (status === 'replied') {
    if (replyCategory === 'QUESTION') {
      return {
        action: 'send_email',
        priority: 'high',
        reasoning: 'Lead asked questions and is waiting for answers.',
        suggested_timing: 'Within 4 hours',
        expected_outcome: 'Questions answered, relationship built',
        confidence: 85,
      };
    }
    if (replyCategory === 'INTERESTED') {
      return {
        action: 'schedule_meeting',
        priority: 'high',
        reasoning: 'Lead expressed interest. Time to propose a meeting.',
        suggested_timing: 'Within 24 hours',
        expected_outcome: 'Meeting scheduled',
        confidence: 90,
      };
    }
    return {
      action: 'send_email',
      priority: 'high',
      reasoning: 'Lead replied and needs a response.',
      suggested_timing: 'Within 24 hours',
      expected_outcome: 'Conversation continues',
      confidence: 80,
    };
  }
  
  if (status === 'interested') {
    return {
      action: 'send_proposal',
      priority: 'high',
      reasoning: 'Lead is interested. Time to send a formal proposal.',
      suggested_timing: 'Within 48 hours',
      expected_outcome: 'Proposal sent and under consideration',
      confidence: 85,
    };
  }
  
  if (status === 'meeting_booked') {
    return {
      action: 'send_email',
      priority: 'medium',
      reasoning: 'Meeting already booked. Send agenda/preparation materials.',
      suggested_timing: '1 day before meeting',
      expected_outcome: 'Lead is prepared for the meeting',
      confidence: 75,
    };
  }
  
  if (status === 'closed') {
    return {
      action: 'wait',
      priority: 'low',
      reasoning: 'Lead is closed. No further action needed unless they re-engage.',
      suggested_timing: 'Revisit in 3 months',
      expected_outcome: 'Lead may re-engage in future',
      confidence: 50,
    };
  }
  
  return {
    action: 'send_email',
    priority: 'medium',
    reasoning: 'Default action based on current state.',
    confidence: 60,
  };
}

// ---------------------------------------------------------------------------
// Module Integration Helpers
// ---------------------------------------------------------------------------

/**
 * Process a hunt result through the full pipeline
 * Hunter → Verifier → CRM Update
 */
export async function processHuntResult(
  leadId: string,
  huntResult: HuntResult,
  options?: { verifyEmails?: boolean; autoEnrich?: boolean }
): Promise<LeadWithIntelligence | null> {
  // Update with hunter data
  await updateLeadIntelligence(leadId, { hunterData: huntResult });

  // If verification is requested and we have executives with emails
  if (options?.verifyEmails && huntResult.executives.length > 0) {
    const exec = huntResult.executives[0];
    if (exec.email) {
      const { tripleVerify } = await import('./sovereignVerifier.js');
      const verification = await tripleVerify({
        email: exec.email,
        name: exec.name,
        company: exec.company || huntResult.companyName,
        linkedinUrl: exec.linkedinUrl,
      });
      await updateLeadIntelligence(leadId, { verificationData: verification });
    }
  }

  // Return updated lead
  const db = getDb();
  const lead = db.prepare('SELECT * FROM leads WHERE lead_id = ?').get(leadId) as any;
  return lead ? parseLeadIntelligence(lead) : null;
}

/**
 * Process outreach sent through the pipeline
 * Writer → CRM Update
 */
export async function processOutreachSent(
  leadId: string,
  craftedOutreach: CraftedOutreach,
  senderUserId: number
): Promise<void> {
  await updateLeadIntelligence(leadId, {
    outreachData: {
      craftedOutreach,
      sentAt: new Date().toISOString(),
      senderUserId,
    },
  });
  
  // Track in relationship history
  trackRelationship(leadId, [{
    type: 'email_sent',
    timestamp: new Date().toISOString(),
    details: `Outreach sent: ${craftedOutreach.subject}`,
    metadata: { personalizationScore: craftedOutreach.personalizationScore }
  }]);
}

/**
 * Process reply received through the pipeline
 * Reply Manager → CRM Update
 */
export async function processReplyReceived(
  leadId: string,
  classification: ClassifyResult,
  replyBody: string
): Promise<void> {
  await updateLeadIntelligence(leadId, {
    replyData: {
      classification,
      replyBody,
      receivedAt: new Date().toISOString(),
    },
  });

  // Track in relationship history
  trackRelationship(leadId, [{
    type: 'email_reply',
    timestamp: new Date().toISOString(),
    details: `Reply received: ${classification.category}`,
    metadata: { category: classification.category, confidence: classification.confidence }
  }]);

  // Auto-advance stage based on classification
  if (classification.category === 'INTERESTED') {
    advanceLeadStage(leadId, 'interested');
  } else if (classification.category === 'NOT_INTERESTED') {
    advanceLeadStage(leadId, 'closed');
  }
}

/**
 * Update vision alignment for a lead
 */
export async function updateVisionAlignment(
  leadId: string,
  visionData: {
    score: number;
    primaryProgram: string;
    secondaryPrograms: string[];
    reasoning: string;
  }
): Promise<void> {
  await updateLeadIntelligence(leadId, {
    visionAlignment: {
      score: visionData.score,
      primaryProgram: visionData.primaryProgram,
      reasoning: visionData.reasoning,
    },
  });
}

// ---------------------------------------------------------------------------
// Analytics & Reporting
// ---------------------------------------------------------------------------

export interface PipelineMetrics {
  totalLeads: number;
  byStatus: Record<OutreachStatus, number>;
  conversionRate: number; // new → contacted
  responseRate: number; // contacted → replied
  interestRate: number; // replied → interested
  avgCompositeScore: number;
  topPrograms: Array<{ program: string; count: number; avgScore: number }>;
}

/**
 * Get pipeline analytics metrics
 */
export function getPipelineMetrics(userId?: number): PipelineMetrics {
  const db = getDb();
  
  let countQuery = 'SELECT outreach_status, COUNT(*) as count FROM leads';
  const params: any[] = [];
  
  if (userId !== undefined) {
    countQuery += ' WHERE user_id = ?';
    params.push(userId);
  }
  
  countQuery += ' GROUP BY outreach_status';

  const counts = db.prepare(countQuery).all(...params) as Array<{ outreach_status: OutreachStatus; count: number }>;
  
  const byStatus: Record<OutreachStatus, number> = {
    new: 0,
    contacted: 0,
    replied: 0,
    interested: 0,
    meeting_booked: 0,
    closed: 0,
  };
  
  let totalLeads = 0;
  for (const row of counts) {
    byStatus[row.outreach_status] = row.count;
    totalLeads += row.count;
  }

  // Calculate rates
  const newLeads = byStatus.new;
  const contacted = byStatus.contacted + byStatus.replied + byStatus.interested + byStatus.meeting_booked + byStatus.closed;
  const replied = byStatus.replied + byStatus.interested + byStatus.meeting_booked + byStatus.closed;
  const interested = byStatus.interested + byStatus.meeting_booked;

  const conversionRate = newLeads + contacted > 0 ? (contacted / (newLeads + contacted)) * 100 : 0;
  const responseRate = contacted > 0 ? (replied / contacted) * 100 : 0;
  const interestRate = replied > 0 ? (interested / replied) * 100 : 0;

  // Get average scores
  let scoreQuery = 'SELECT AVG(confidence_score) as avg_confidence, AVG(vision_alignment_score) as avg_vision FROM leads';
  if (userId !== undefined) {
    scoreQuery += ' WHERE user_id = ?';
  }
  const scores = db.prepare(scoreQuery).get(...params) as any;
  const avgCompositeScore = Math.round(((scores?.avg_confidence || 0) + (scores?.avg_vision || 0)) / 2);

  return {
    totalLeads,
    byStatus,
    conversionRate: Math.round(conversionRate * 10) / 10,
    responseRate: Math.round(responseRate * 10) / 10,
    interestRate: Math.round(interestRate * 10) / 10,
    avgCompositeScore,
    topPrograms: [], // Would need to parse vision_2030_program column
  };
}

// ---------------------------------------------------------------------------
// Export default
// ---------------------------------------------------------------------------

export default {
  initIntelligenceSchema,
  setIntelligenceDatabase,
  updateLeadIntelligence,
  getLeadPipeline,
  getPipelineView,
  getLeadsByStatus,
  advanceLeadStage,
  getLeadScore,
  getLeadScoreAI,
  getTopScoredLeads,
  trackRelationship,
  getRelationshipHistory,
  getNextAction,
  calculateEngagementMetrics,
  processHuntResult,
  processOutreachSent,
  processReplyReceived,
  updateVisionAlignment,
  getPipelineMetrics,
};
