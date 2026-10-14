/**
 * LeadJin Artisan Module 5 — CRM Hub
 *
 * Dashboard data endpoints, funnel metrics, CSV export.
 * Wires Modules 1-4 together into a unified CRM intelligence layer.
 */

import Database from 'better-sqlite3';
import { huntExecutives, HuntResult } from './linkedinHunter.js';
import { tripleVerify, SovereignVerificationResult, LeadIdentity } from './sovereignVerifier.js';
import { generateOutreach, OutreachWriterResult, OutreachLead, OutreachContext } from './outreach-writer.js';
import { classifyReply, ArtisanReplyCategory, FollowUpSuggestion, suggestFollowUp } from './reply-manager.js';
import {
  getLeadPipeline,
  getPipelineMetrics,
  getRelationshipHistory,
  calculateEngagementMetrics,
  getLeadScore,
  getNextAction,
  processHuntResult,
  processOutreachSent,
  processReplyReceived,
  updateVisionAlignment,
} from './intelligenceHub.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DashboardMetrics {
  total_leads: number;
  total_outreaches: number;
  total_replies: number;
  recent_outreaches_7d: number;
  recent_replies_7d: number;
  pipeline_summary: Array<{
    status: string;
    count: number;
    avg_score: number;
  }>;
  metrics: ReturnType<typeof getPipelineMetrics>;
  generated_at: string;
}

export interface FunnelStage {
  stage: string;
  count: number;
  avg_score: number;
  conversion_rate: number;
}

export interface FunnelData {
  funnel: FunnelStage[];
  conversion_summary: {
    lead_to_interest: number;
    lead_to_meeting: number;
    lead_to_closed: number;
    total_leads: number;
  };
  generated_at: string;
}

export interface CSVExportOptions {
  userId?: number;
  includeFields?: string[];
}

export interface OrchestratedLeadResult {
  leadId: string;
  huntResult?: HuntResult;
  verificationResult?: SovereignVerificationResult;
  outreachResult?: OutreachWriterResult;
  replyResult?: {
    category: ArtisanReplyCategory;
    confidence: number;
    suggestedResponse: string;
  };
  errors: string[];
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export function getDashboardData(db: Database.Database, userId: number): DashboardMetrics {
  const pipeline = getLeadPipeline(userId);
  const metrics = getPipelineMetrics(userId);

  const totalLeads = pipeline.reduce((sum, g) => sum + g.count, 0);

  const totalReplies =
    (db.prepare('SELECT COUNT(*) as c FROM lead_replies WHERE user_id = ?').get(userId) as any)?.c || 0;

  const totalOutreaches =
    (db.prepare('SELECT COUNT(*) as c FROM outreach_messages WHERE user_id = ?').get(userId) as any)?.c || 0;

  const recentOutreaches = db.prepare(
    `SELECT COUNT(*) as c FROM outreach_messages WHERE user_id = ? AND sent_at >= datetime('now', '-7 days')`
  ).get(userId) as any;

  const recentReplies = db.prepare(
    `SELECT COUNT(*) as c FROM lead_replies WHERE user_id = ? AND created_at >= datetime('now', '-7 days')`
  ).get(userId) as any;

  return {
    total_leads: totalLeads,
    total_outreaches: totalOutreaches,
    total_replies: totalReplies,
    recent_outreaches_7d: recentOutreaches?.c || 0,
    recent_replies_7d: recentReplies?.c || 0,
    pipeline_summary: pipeline.map((g) => ({
      status: g.status,
      count: g.count,
      avg_score: g.avgScore,
    })),
    metrics,
    generated_at: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Funnel
// ---------------------------------------------------------------------------

export function getFunnelData(db: Database.Database, userId: number): FunnelData {
  const pipeline = getLeadPipeline(userId);
  const funnel: FunnelStage[] = pipeline.map((group) => ({
    stage: group.status,
    count: group.count,
    avg_score: group.avgScore,
    conversion_rate: 0,
  }));

  for (let i = 0; i < funnel.length; i++) {
    if (i === 0) {
      funnel[i].conversion_rate = funnel[i].count > 0 ? 100 : 0;
    } else {
      const prev = funnel[i - 1].count || 1;
      funnel[i].conversion_rate = Math.round((funnel[i].count / prev) * 100);
    }
  }

  const totalLeads = funnel.reduce((sum, s) => sum + s.count, 0) || 1;
  const interestedCount = funnel.find((s) => s.stage === 'interested')?.count || 0;
  const closedCount = funnel.find((s) => s.stage === 'closed')?.count || 0;
  const meetingCount = funnel.find((s) => s.stage === 'meeting_booked')?.count || 0;

  return {
    funnel,
    conversion_summary: {
      lead_to_interest: Math.round((interestedCount / totalLeads) * 100),
      lead_to_meeting: Math.round((meetingCount / totalLeads) * 100),
      lead_to_closed: Math.round((closedCount / totalLeads) * 100),
      total_leads: totalLeads,
    },
    generated_at: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// CSV Export
// ---------------------------------------------------------------------------

export function exportLeadsToCSV(
  db: Database.Database,
  userId: number,
  options?: CSVExportOptions
): { csv: string; filename: string } {
  const defaultFields = [
    'lead_id',
    'name',
    'title',
    'company',
    'email',
    'phone',
    'linkedin',
    'industry',
    'status',
    'outreach_status',
    'lead_score',
    'vision_alignment_score',
    'last_contacted_at',
    'created_at',
  ];

  const fields = options?.includeFields || defaultFields;

  const leads = db.prepare(
    `SELECT ${fields.join(', ')} FROM leads WHERE user_id = ? ORDER BY created_at DESC`
  ).all(userId) as any[];

  const escapeCsv = (value: any) => {
    const str = value == null ? '' : String(value);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const rows = leads.map((lead) => fields.map((f) => escapeCsv(lead[f])).join(','));
  const csv = [fields.join(','), ...rows].join('\n');

  return {
    csv,
    filename: `leadjin-leads-${new Date().toISOString().split('T')[0]}.csv`,
  };
}

// ---------------------------------------------------------------------------
// Module 1-4 Orchestration
// ---------------------------------------------------------------------------

export async function orchestrateLeadJourney(
  db: Database.Database,
  userId: number,
  leadId: string,
  domain: string,
  leadIdentity: LeadIdentity,
  outreachLead: OutreachLead,
  outreachContext: OutreachContext,
  options: {
    linkedinCookie?: string;
    messageType?: 'cold_email' | 'linkedin' | 'whatsapp';
    apiKey?: string;
    skipHunt?: boolean;
    skipVerify?: boolean;
    skipOutreach?: boolean;
  } = {}
): Promise<OrchestratedLeadResult> {
  const result: OrchestratedLeadResult = { leadId, errors: [] };

  // Module 1: Hunter
  if (!options.skipHunt) {
    try {
      const hunt = await huntExecutives(domain, options.linkedinCookie, 3);
      result.huntResult = hunt;
      await processHuntResult(leadId, hunt, { verifyEmails: true, autoEnrich: false });
    } catch (error: any) {
      result.errors.push(`Hunt failed: ${error.message}`);
    }
  }

  // Module 2: Verifier
  if (!options.skipVerify) {
    try {
      const verification = await tripleVerify(leadIdentity);
      result.verificationResult = verification;
    } catch (error: any) {
      result.errors.push(`Verification failed: ${error.message}`);
    }
  }

  // Module 3: Outreach Writer
  if (!options.skipOutreach) {
    try {
      const outreach = await generateOutreach(
        outreachLead,
        outreachContext,
        options.messageType || 'cold_email',
        options.apiKey
      );
      result.outreachResult = outreach;
      await processOutreachSent(leadId, outreach, userId);
    } catch (error: any) {
      result.errors.push(`Outreach failed: ${error.message}`);
    }
  }

  return result;
}

export async function processIncomingReply(
  leadId: string,
  replyBody: string,
  originalOutreach: string,
  userId: number,
  options: {
    apiKey?: string;
    classifyOptions?: import('./protocolManager.js').ClassifyOptions;
  } = {}
): Promise<{
  category: ArtisanReplyCategory;
  confidence: number;
  suggestedResponse: string;
  followUp: FollowUpSuggestion;
}> {
  const classification = await classifyReply(
    replyBody,
    originalOutreach,
    options.classifyOptions || {},
    options.apiKey
  );

  await processReplyReceived(
    leadId,
    {
      category: classification.category,
      confidence: classification.confidence,
      suggestedResponse: classification.suggestedResponse,
    } as any,
    replyBody
  );

  const followUp = suggestFollowUp(
    classification.artisanCategory,
    '',
    '',
    'en'
  );

  return {
    category: classification.artisanCategory,
    confidence: classification.confidence,
    suggestedResponse: classification.suggestedResponse,
    followUp,
  };
}

// ---------------------------------------------------------------------------
// Lead Intelligence Wrappers
// ---------------------------------------------------------------------------

export function getLeadIntelligence(leadId: string, userId: number) {
  return {
    pipeline: getLeadPipeline(userId).find((g) => g.status), // full pipeline view
    score: getLeadScore(leadId),
    nextAction: getNextAction(leadId),
    history: getRelationshipHistory(leadId),
    engagement: calculateEngagementMetrics(leadId),
  };
}

export function getFullPipelineView(userId: number) {
  return getLeadPipeline(userId);
}

// ---------------------------------------------------------------------------
// Re-exports for downstream consumers
// ---------------------------------------------------------------------------

export {
  huntExecutives,
  tripleVerify,
  generateOutreach,
  classifyReply,
  suggestFollowUp,
  getLeadPipeline,
  getPipelineMetrics,
  getRelationshipHistory,
  calculateEngagementMetrics,
};
