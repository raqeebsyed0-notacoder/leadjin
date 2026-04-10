/**
 * Module 5: Intelligence Hub (CRM Schema Upgrade)
 *
 * Central intelligence coordinator that wires all modules together:
 * - Hunter (Module 1) → Verifier (Module 2) → Writer (Module 3) → Reply Manager (Module 4) → CRM
 *
 * Provides unified lead scoring, pipeline management, and intelligence tracking.
 */

import type { Database } from 'better-sqlite3';
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
  breakdown: {
    confidence: { raw: number; weighted: number; weight: number };
    verification: { raw: number; weighted: number; weight: number };
    intent: { raw: number; weighted: number; weight: number };
    vision: { raw: number; weighted: number; weight: number };
  };
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
    
    // Mark as verified if confidence is high
    if (data.verificationData.confidenceScore >= 80) {
      updates.push('email_verified = 1');
    }
  }

  // Outreach data: track sending
  if (data.outreachData) {
    if (data.outreachData.sentAt) {
      updates.push('last_contacted_at = ?');
      values.push(data.outreachData.sentAt);
    }
    
    // Only update status if currently 'new' (don't overwrite replies)
    updates.push('outreach_status = CASE WHEN outreach_status = "new" THEN "contacted" ELSE outreach_status END');
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
// Lead Scoring
// ---------------------------------------------------------------------------

/**
 * Calculate composite score for a lead
 * Combines: confidence + verification + intent + vision alignment
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
      breakdown: {
        confidence: { raw: 0, weighted: 0, weight: 0.25 },
        verification: { raw: 0, weighted: 0, weight: 0.25 },
        intent: { raw: 0, weighted: 0, weight: 0.25 },
        vision: { raw: 0, weighted: 0, weight: 0.25 },
      },
    };
  }

  // Weights for composite score
  const WEIGHTS = {
    confidence: 0.25,
    verification: 0.30,
    intent: 0.20,
    vision: 0.25,
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

  // Calculate weighted overall score
  const weightedConfidence = confidenceScore * WEIGHTS.confidence;
  const weightedVerification = verificationScore * WEIGHTS.verification;
  const weightedIntent = intentScore * WEIGHTS.intent;
  const weightedVision = visionScore * WEIGHTS.vision;

  const overall = Math.round(weightedConfidence + weightedVerification + weightedIntent + weightedVision);

  return {
    overall,
    confidence: confidenceScore,
    verification: verificationScore,
    intent: intentScore,
    visionAlignment: visionScore,
    breakdown: {
      confidence: { raw: confidenceScore, weighted: Math.round(weightedConfidence), weight: WEIGHTS.confidence },
      verification: { raw: verificationScore, weighted: Math.round(weightedVerification), weight: WEIGHTS.verification },
      intent: { raw: intentScore, weighted: Math.round(weightedIntent), weight: WEIGHTS.intent },
      vision: { raw: visionScore, weighted: Math.round(weightedVision), weight: WEIGHTS.vision },
    },
  };
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
  getLeadsByStatus,
  advanceLeadStage,
  getLeadScore,
  getTopScoredLeads,
  processHuntResult,
  processOutreachSent,
  processReplyReceived,
  updateVisionAlignment,
  getPipelineMetrics,
};
