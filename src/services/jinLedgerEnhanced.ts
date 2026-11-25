/**
 * Module 5: The Employee's Ledger - Enhanced
 * 
 * Complete CRM integration with KPI tracking, work logs, and performance metrics.
 * Jin's employee record system - tracks everything like a human employee.
 */

import Database from 'better-sqlite3';

// Enhanced KPI tracking interfaces
export interface JinKPIMetrics {
  date: string;
  extractionCount: number;
  stakeholderCount: number;
  verificationSuccessRate: number;
  outreachSent: number;
  outreachOpened: number;
  outreachReplied: number;
  meetingsScheduled: number;
  dealsClosed: number;
  vision2030AlignmentAvg: number;
  avgVerificationScore: number;
}

export interface JinPerformanceReport {
  period: 'daily' | 'weekly' | 'monthly';
  startDate: string;
  endDate: string;
  metrics: {
    totalStakeholdersDiscovered: number;
    fullyVerifiedContacts: number;
    verificationRate: number;
    outreachEngagementRate: number;
    responseRate: number;
    meetingsBooked: number;
    dealsInPipeline: number;
  };
  topPerformingIndustries: Array<{
    industry: string;
    stakeholderCount: number;
    avgVision2030Score: number;
  }>;
  workLogSummary: {
    totalActions: number;
    successfulActions: number;
    failedActions: number;
    avgProcessingTime: number; // in minutes
  };
}

export interface StakeholderEnrichment {
  id: string;
  name: string;
  company: string;
  domain: string;
  email?: string;
  emailVerified: boolean;
  phone?: string;
  phoneVerified: boolean;
  linkedinUrl?: string;
  vision2030Relevance: number;
  decisionAuthority: string;
  confidenceScore: number;
  extractionMethod: string;
  extractedAt: string;
  lastVerifiedAt?: string;
  verificationProof: Array<{
    type: string;
    verifiedAt: string;
    confidence: number;
  }>;
  outreachHistory: Array<{
    date: string;
    type: string;
    subject?: string;
    status: string;
  }>;
  notes?: string;
}

/**
 * Initialize enhanced Jin tables
 */
export function initEnhancedJinTables(db: Database.Database): void {
  // Enhanced KPI tracking table
  db.exec(`
    CREATE TABLE IF NOT EXISTS jin_daily_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT UNIQUE NOT NULL,
      extraction_count INTEGER DEFAULT 0,
      stakeholder_count INTEGER DEFAULT 0,
      verification_success_rate REAL DEFAULT 0,
      outreach_sent INTEGER DEFAULT 0,
      outreach_opened INTEGER DEFAULT 0,
      outreach_replied INTEGER DEFAULT 0,
      meetings_scheduled INTEGER DEFAULT 0,
      deals_closed INTEGER DEFAULT 0,
      vision_2030_alignment_avg REAL DEFAULT 0,
      avg_verification_score REAL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Stakeholder outreach history
  db.exec(`
    CREATE TABLE IF NOT EXISTS jin_outreach_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      stakeholder_id TEXT NOT NULL,
      outreach_type TEXT NOT NULL,
      subject TEXT,
      content TEXT,
      status TEXT DEFAULT 'draft',
      sent_at DATETIME,
      opened_at DATETIME,
      replied_at DATETIME,
      reply_category TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Stakeholder notes/interactions
  db.exec(`
    CREATE TABLE IF NOT EXISTS jin_stakeholder_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      stakeholder_id TEXT NOT NULL,
      note_type TEXT DEFAULT 'general',
      content TEXT NOT NULL,
      created_by TEXT DEFAULT 'jin_automated',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Jin performance snapshots
  db.exec(`
    CREATE TABLE IF NOT EXISTS jin_performance_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      snapshot_date TEXT NOT NULL,
      period_type TEXT NOT NULL,
      metrics_json TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Indexes
  db.exec(`CREATE INDEX IF NOT EXISTS idx_outreach_stakeholder ON jin_outreach_history(stakeholder_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_outreach_status ON jin_outreach_history(status)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_notes_stakeholder ON jin_stakeholder_notes(stakeholder_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_snapshots_date ON jin_performance_snapshots(snapshot_date)`);

  console.log('[JinLedgerEnhanced] Enhanced tables initialized');
}

/**
 * Record daily metrics
 */
export function recordDailyMetrics(
  db: Database.Database,
  date: string,
  updates: Partial<JinKPIMetrics>
): void {
  const stmt = db.prepare(`
    INSERT INTO jin_daily_metrics (
      date, extraction_count, stakeholder_count, verification_success_rate,
      outreach_sent, outreach_opened, outreach_replied, meetings_scheduled,
      deals_closed, vision_2030_alignment_avg, avg_verification_score
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(date) DO UPDATE SET
      extraction_count = extraction_count + COALESCE(excluded.extraction_count, 0),
      stakeholder_count = stakeholder_count + COALESCE(excluded.stakeholder_count, 0),
      verification_success_rate = (verification_success_rate + COALESCE(excluded.verification_success_rate, 0)) / 2,
      outreach_sent = outreach_sent + COALESCE(excluded.outreach_sent, 0),
      outreach_opened = outreach_opened + COALESCE(excluded.outreach_opened, 0),
      outreach_replied = outreach_replied + COALESCE(excluded.outreach_replied, 0),
      meetings_scheduled = meetings_scheduled + COALESCE(excluded.meetings_scheduled, 0),
      deals_closed = deals_closed + COALESCE(excluded.deals_closed, 0),
      vision_2030_alignment_avg = (vision_2030_alignment_avg + COALESCE(excluded.vision_2030_alignment_avg, 0)) / 2,
      avg_verification_score = (avg_verification_score + COALESCE(excluded.avg_verification_score, 0)) / 2,
      updated_at = CURRENT_TIMESTAMP
  `);

  stmt.run(
    date,
    updates.extractionCount || 0,
    updates.stakeholderCount || 0,
    updates.verificationSuccessRate || 0,
    updates.outreachSent || 0,
    updates.outreachOpened || 0,
    updates.outreachReplied || 0,
    updates.meetingsScheduled || 0,
    updates.dealsClosed || 0,
    updates.vision2030AlignmentAvg || 0,
    updates.avgVerificationScore || 0
  );
}

/**
 * Get KPI metrics for a date range
 */
export function getKPIMetrics(
  db: Database.Database,
  startDate: string,
  endDate: string
): JinKPIMetrics[] {
  const stmt = db.prepare(`
    SELECT * FROM jin_daily_metrics
    WHERE date BETWEEN ? AND ?
    ORDER BY date ASC
  `);

  return (stmt.all(startDate, endDate) as any[]).map(row => ({
    date: row.date,
    extractionCount: row.extraction_count,
    stakeholderCount: row.stakeholder_count,
    verificationSuccessRate: row.verification_success_rate,
    outreachSent: row.outreach_sent,
    outreachOpened: row.outreach_opened,
    outreachReplied: row.outreach_replied,
    meetingsScheduled: row.meetings_scheduled,
    dealsClosed: row.deals_closed,
    vision2030AlignmentAvg: row.vision_2030_alignment_avg,
    avgVerificationScore: row.avg_verification_score
  }));
}

/**
 * Get enhanced Jin status with KPIs
 */
export function getEnhancedJinStatus(db: Database.Database): {
  today: JinKPIMetrics | null;
  thisWeek: JinKPIMetrics[];
  thisMonth: JinKPIMetrics[];
  allTime: {
    totalStakeholders: number;
    totalVerified: number;
    totalOutreachSent: number;
    totalMeetingsScheduled: number;
    avgVision2030Alignment: number;
  };
  recentWorkLog: any[];
  currentJobs: any[];
} {
  const today = new Date().toISOString().split('T')[0];
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  // Today's metrics
  const todayMetrics = db.prepare('SELECT * FROM jin_daily_metrics WHERE date = ?').get(today) as any;

  // This week
  const thisWeek = getKPIMetrics(db, weekAgo, today);

  // This month
  const thisMonth = getKPIMetrics(db, monthAgo, today);

  // All time stats
  const allTimeStats = db.prepare(`
    SELECT 
      COALESCE(SUM(stakeholder_count), 0) as total_stakeholders,
      COALESCE(SUM(outreach_sent), 0) as total_outreach,
      COALESCE(SUM(meetings_scheduled), 0) as total_meetings,
      COALESCE(AVG(vision_2030_alignment_avg), 0) as avg_alignment
    FROM jin_daily_metrics
  `).get() as any;

  const verifiedCount = (db.prepare(`
    SELECT COUNT(*) as c FROM jin_stakeholder_cache WHERE verified = 1
  `).get() as any).c || 0;

  // Recent work log
  const recentWorkLog = db.prepare(`
    SELECT * FROM employee_work_log
    ORDER BY created_at DESC
    LIMIT 20
  `).all();

  // Current jobs
  const currentJobs = db.prepare(`
    SELECT job_id, entity_domain, status, created_at
    FROM employee_work_log
    WHERE status = 'in_progress'
    GROUP BY job_id
    ORDER BY created_at DESC
    LIMIT 5
  `).all();

  return {
    today: todayMetrics ? {
      date: todayMetrics.date,
      extractionCount: todayMetrics.extraction_count,
      stakeholderCount: todayMetrics.stakeholder_count,
      verificationSuccessRate: todayMetrics.verification_success_rate,
      outreachSent: todayMetrics.outreach_sent,
      outreachOpened: todayMetrics.outreach_opened,
      outreachReplied: todayMetrics.outreach_replied,
      meetingsScheduled: todayMetrics.meetings_scheduled,
      dealsClosed: todayMetrics.deals_closed,
      vision2030AlignmentAvg: todayMetrics.vision_2030_alignment_avg,
      avgVerificationScore: todayMetrics.avg_verification_score
    } : null,
    thisWeek,
    thisMonth,
    allTime: {
      totalStakeholders: allTimeStats.total_stakeholders || 0,
      totalVerified: verifiedCount,
      totalOutreachSent: allTimeStats.total_outreach || 0,
      totalMeetingsScheduled: allTimeStats.total_meetings || 0,
      avgVision2030Alignment: Math.round(allTimeStats.avg_alignment || 0)
    },
    recentWorkLog,
    currentJobs
  };
}

/**
 * Generate performance report
 */
export function generatePerformanceReport(
  db: Database.Database,
  period: 'daily' | 'weekly' | 'monthly',
  startDate?: string,
  endDate?: string
): JinPerformanceReport {
  // Calculate date range based on period
  const end = endDate || new Date().toISOString().split('T')[0];
  let start = startDate;
  
  if (!start) {
    const endDateObj = new Date(end);
    switch (period) {
      case 'daily':
        start = end;
        break;
      case 'weekly':
        endDateObj.setDate(endDateObj.getDate() - 7);
        start = endDateObj.toISOString().split('T')[0];
        break;
      case 'monthly':
        endDateObj.setMonth(endDateObj.getMonth() - 1);
        start = endDateObj.toISOString().split('T')[0];
        break;
    }
  }

  // Get metrics for period
  const metrics = getKPIMetrics(db, start, end);
  
  // Calculate aggregates
  const totals = metrics.reduce((acc, m) => ({
    stakeholderCount: acc.stakeholderCount + m.stakeholderCount,
    verifiedCount: acc.verifiedCount + (m.verificationSuccessRate > 80 ? m.stakeholderCount : 0),
    outreachSent: acc.outreachSent + m.outreachSent,
    outreachOpened: acc.outreachOpened + m.outreachOpened,
    outreachReplied: acc.outreachReplied + m.outreachReplied,
    meetingsScheduled: acc.meetingsScheduled + m.meetingsScheduled,
    vision2030Sum: acc.vision2030Sum + m.vision2030AlignmentAvg
  }), {
    stakeholderCount: 0,
    verifiedCount: 0,
    outreachSent: 0,
    outreachOpened: 0,
    outreachReplied: 0,
    meetingsScheduled: 0,
    vision2030Sum: 0
  });

  const dayCount = metrics.length || 1;

  // Get top industries
  const topIndustries = db.prepare(`
    SELECT 
      c.industry,
      COUNT(*) as stakeholder_count,
      AVG(s.vision_2030_relevance) as avg_vision_score
    FROM jin_stakeholder_cache s
    LEFT JOIN company_cache c ON s.domain = c.domain
    WHERE s.created_at >= ? AND s.created_at <= ?
    GROUP BY c.industry
    ORDER BY stakeholder_count DESC
    LIMIT 5
  `).all(start, end) as any[];

  // Get work log summary
  const workLogSummary = db.prepare(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as successful,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
    FROM employee_work_log
    WHERE created_at >= ? AND created_at <= ?
  `).get(start, end) as any;

  return {
    period,
    startDate: start,
    endDate: end,
    metrics: {
      totalStakeholdersDiscovered: totals.stakeholderCount,
      fullyVerifiedContacts: totals.verifiedCount,
      verificationRate: totals.stakeholderCount > 0 
        ? Math.round((totals.verifiedCount / totals.stakeholderCount) * 100)
        : 0,
      outreachEngagementRate: totals.outreachSent > 0
        ? Math.round(((totals.outreachOpened + totals.outreachReplied) / totals.outreachSent) * 100)
        : 0,
      responseRate: totals.outreachSent > 0
        ? Math.round((totals.outreachReplied / totals.outreachSent) * 100)
        : 0,
      meetingsBooked: totals.meetingsScheduled,
      dealsInPipeline: 0 // Would come from CRM integration
    },
    topPerformingIndustries: topIndustries.map(row => ({
      industry: row.industry || 'Unknown',
      stakeholderCount: row.stakeholder_count,
      avgVision2030Score: Math.round(row.avg_vision_score || 0)
    })),
    workLogSummary: {
      totalActions: workLogSummary?.total || 0,
      successfulActions: workLogSummary?.successful || 0,
      failedActions: workLogSummary?.failed || 0,
      avgProcessingTime: 0 // Would calculate from job start/end times
    }
  };
}

/**
 * Get stakeholder with full enrichment data
 */
export function getEnrichedStakeholder(
  db: Database.Database,
  stakeholderId: string
): StakeholderEnrichment | null {
  // Get base stakeholder data
  const stakeholder = db.prepare(`
    SELECT * FROM jin_stakeholder_cache WHERE stakeholder_id = ?
  `).get(stakeholderId) as any;

  if (!stakeholder) return null;

  // Get verification proof
  const verificationProof = db.prepare(`
    SELECT verification_type as type, created_at as verifiedAt, proof_data
    FROM verification_proof
    WHERE stakeholder_id = ?
    ORDER BY created_at DESC
  `).all(stakeholderId) as any[];

  // Get outreach history
  const outreachHistory = db.prepare(`
    SELECT 
      created_at as date,
      outreach_type as type,
      subject,
      status
    FROM jin_outreach_history
    WHERE stakeholder_id = ?
    ORDER BY created_at DESC
  `).all(stakeholderId) as any[];

  // Get notes
  const notes = db.prepare(`
    SELECT content, created_at, created_by
    FROM jin_stakeholder_notes
    WHERE stakeholder_id = ?
    ORDER BY created_at DESC
  `).all(stakeholderId) as any[];

  return {
    id: stakeholder.stakeholder_id,
    name: stakeholder.name,
    company: stakeholder.company,
    domain: stakeholder.domain,
    email: stakeholder.email,
    emailVerified: !!stakeholder.email_verified,
    phone: stakeholder.phone,
    phoneVerified: !!stakeholder.phone_verified,
    linkedinUrl: stakeholder.linkedin_url,
    vision2030Relevance: stakeholder.vision_2030_relevance,
    decisionAuthority: stakeholder.decision_authority,
    confidenceScore: stakeholder.confidence_score,
    extractionMethod: stakeholder.extraction_method,
    extractedAt: stakeholder.extracted_at,
    lastVerifiedAt: stakeholder.last_verified_at,
    verificationProof: verificationProof.map(vp => ({
      type: vp.type,
      verifiedAt: vp.verifiedAt,
      confidence: JSON.parse(vp.proof_data || '{}').confidence || 0
    })),
    outreachHistory: outreachHistory.map(oh => ({
      date: oh.date,
      type: oh.type,
      subject: oh.subject,
      status: oh.status
    })),
    notes: notes.map(n => `${n.created_by}: ${n.content}`).join('\n')
  };
}

/**
 * Add outreach to history
 */
export function addOutreachHistory(
  db: Database.Database,
  data: {
    stakeholderId: string;
    outreachType: string;
    subject?: string;
    content?: string;
    status?: string;
  }
): void {
  const stmt = db.prepare(`
    INSERT INTO jin_outreach_history
    (stakeholder_id, outreach_type, subject, content, status)
    VALUES (?, ?, ?, ?, ?)
  `);

  stmt.run(
    data.stakeholderId,
    data.outreachType,
    data.subject || null,
    data.content || null,
    data.status || 'draft'
  );
}

/**
 * Update outreach status
 */
export function updateOutreachStatus(
  db: Database.Database,
  outreachId: number,
  status: string,
  timestamp?: string
): void {
  let sql = 'UPDATE jin_outreach_history SET status = ?';
  const params: any[] = [status];

  if (status === 'sent' && timestamp) {
    sql += ', sent_at = ?';
    params.push(timestamp);
  } else if (status === 'opened' && timestamp) {
    sql += ', opened_at = ?';
    params.push(timestamp);
  } else if (status === 'replied' && timestamp) {
    sql += ', replied_at = ?';
    params.push(timestamp);
  }

  sql += ' WHERE id = ?';
  params.push(outreachId);

  db.prepare(sql).run(...params);
}

/**
 * Add stakeholder note
 */
export function addStakeholderNote(
  db: Database.Database,
  stakeholderId: string,
  content: string,
  noteType: string = 'general',
  createdBy: string = 'jin_automated'
): void {
  const stmt = db.prepare(`
    INSERT INTO jin_stakeholder_notes
    (stakeholder_id, note_type, content, created_by)
    VALUES (?, ?, ?, ?)
  `);

  stmt.run(stakeholderId, noteType, content, createdBy);
}
