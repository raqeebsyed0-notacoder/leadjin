/**
 * Module 5: The Employee's Ledger (CRM & Work Logs)
 * 
 * Database schema and operations for Jin's employee records:
 * - employee_work_log: Jin's activity log
 * - verification_proof: Audit trail for verified data
 * - jin_kpi_tracking: Performance metrics
 */

import Database from 'better-sqlite3';

export interface EmployeeWorkLogEntry {
  id?: number;
  job_id: string;
  action_type: 'discovery' | 'extraction' | 'verification' | 'outreach' | 'analysis' | 'decision';
  entity_domain: string;
  entity_name?: string;
  description: string;
  status: 'in_progress' | 'completed' | 'failed';
  metadata?: Record<string, any>;
  created_at?: string;
}

export interface VerificationProof {
  id?: number;
  stakeholder_id: string;
  verification_type: 'email_smtp' | 'email_pattern' | 'phone_hlr' | 'linkedin_session' | 'corporate_registry';
  proof_data: {
    method: string;
    timestamp: string;
    source: string;
    confidence: number;
    verification_details?: Record<string, any>;
  };
  verified_by: 'jin_automated' | 'jin_assisted' | 'manual';
  created_at?: string;
}

export interface JinKPI {
  id?: number;
  date: string;
  metric_name: string;
  metric_value: number;
  unit: string;
  context?: Record<string, any>;
}

/**
 * Initialize Jin's database tables
 */
export function initJinTables(db: Database.Database): void {
  // Employee Work Log - Jin's activity tracking
  db.exec(`
    CREATE TABLE IF NOT EXISTS employee_work_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id TEXT NOT NULL,
      action_type TEXT NOT NULL,
      entity_domain TEXT NOT NULL,
      entity_name TEXT,
      description TEXT NOT NULL,
      status TEXT DEFAULT 'in_progress',
      metadata TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  
  // Indexes for work log queries
  db.exec(`CREATE INDEX IF NOT EXISTS idx_worklog_job ON employee_work_log(job_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_worklog_domain ON employee_work_log(entity_domain)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_worklog_created ON employee_work_log(created_at DESC)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_worklog_type ON employee_work_log(action_type)`);
  
  // Verification Proof - Audit trail for verified data
  db.exec(`
    CREATE TABLE IF NOT EXISTS verification_proof (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      stakeholder_id TEXT NOT NULL,
      verification_type TEXT NOT NULL,
      proof_data TEXT NOT NULL,
      verified_by TEXT DEFAULT 'jin_automated',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  
  // Indexes for verification queries
  db.exec(`CREATE INDEX IF NOT EXISTS idx_verification_stakeholder ON verification_proof(stakeholder_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_verification_type ON verification_proof(verification_type)`);
  
  // Jin KPI Tracking - Performance metrics
  db.exec(`
    CREATE TABLE IF NOT EXISTS jin_kpi_tracking (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      metric_name TEXT NOT NULL,
      metric_value REAL NOT NULL,
      unit TEXT,
      context TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  
  // Indexes for KPI queries
  db.exec(`CREATE INDEX IF NOT EXISTS idx_kpi_date ON jin_kpi_tracking(date)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_kpi_name ON jin_kpi_tracking(metric_name)`);
  
  // Jin Stakeholder Cache - Stores extracted stakeholder data
  db.exec(`
    CREATE TABLE IF NOT EXISTS jin_stakeholder_cache (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      stakeholder_id TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      title TEXT,
      company TEXT NOT NULL,
      domain TEXT NOT NULL,
      email TEXT,
      email_verified INTEGER DEFAULT 0,
      email_source TEXT,
      phone TEXT,
      phone_verified INTEGER DEFAULT 0,
      linkedin_url TEXT,
      vision_2030_relevance INTEGER DEFAULT 0,
      decision_authority TEXT,
      confidence_score INTEGER DEFAULT 0,
      extraction_method TEXT,
      extracted_at DATETIME,
      last_verified_at DATETIME,
      verified INTEGER DEFAULT 0,
      user_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  
  // Indexes for stakeholder cache
  db.exec(`CREATE INDEX IF NOT EXISTS idx_stakeholder_domain ON jin_stakeholder_cache(domain)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_stakeholder_company ON jin_stakeholder_cache(company)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_stakeholder_user ON jin_stakeholder_cache(user_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_stakeholder_verified ON jin_stakeholder_cache(verified)`);
  
  console.log('[JinLedger] Database tables initialized');
}

/**
 * Add entry to Jin's work log
 */
export function addWorkLogEntry(
  db: Database.Database,
  entry: EmployeeWorkLogEntry
): number {
  const stmt = db.prepare(`
    INSERT INTO employee_work_log 
    (job_id, action_type, entity_domain, entity_name, description, status, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  
  const result = stmt.run(
    entry.job_id,
    entry.action_type,
    entry.entity_domain,
    entry.entity_name || null,
    entry.description,
    entry.status,
    entry.metadata ? JSON.stringify(entry.metadata) : null
  );
  
  return result.lastInsertRowid as number;
}

/**
 * Get work log entries for a job
 */
export function getWorkLogByJob(
  db: Database.Database,
  jobId: string
): EmployeeWorkLogEntry[] {
  const stmt = db.prepare(`
    SELECT * FROM employee_work_log 
    WHERE job_id = ? 
    ORDER BY created_at ASC
  `);
  
  const rows = stmt.all(jobId) as any[];
  return rows.map(row => ({
    ...row,
    metadata: row.metadata ? JSON.parse(row.metadata) : undefined
  }));
}

/**
 * Get recent work log entries for Jin's dashboard
 */
export function getRecentWorkLog(
  db: Database.Database,
  limit: number = 50
): EmployeeWorkLogEntry[] {
  const stmt = db.prepare(`
    SELECT * FROM employee_work_log 
    ORDER BY created_at DESC 
    LIMIT ?
  `);
  
  const rows = stmt.all(limit) as any[];
  return rows.map(row => ({
    ...row,
    metadata: row.metadata ? JSON.parse(row.metadata) : undefined
  }));
}

/**
 * Add verification proof record
 */
export function addVerificationProof(
  db: Database.Database,
  proof: VerificationProof
): number {
  const stmt = db.prepare(`
    INSERT INTO verification_proof 
    (stakeholder_id, verification_type, proof_data, verified_by)
    VALUES (?, ?, ?, ?)
  `);
  
  const result = stmt.run(
    proof.stakeholder_id,
    proof.verification_type,
    JSON.stringify(proof.proof_data),
    proof.verified_by
  );
  
  return result.lastInsertRowid as number;
}

/**
 * Get verification proof for a stakeholder
 */
export function getVerificationProof(
  db: Database.Database,
  stakeholderId: string
): VerificationProof[] {
  const stmt = db.prepare(`
    SELECT * FROM verification_proof 
    WHERE stakeholder_id = ? 
    ORDER BY created_at DESC
  `);
  
  const rows = stmt.all(stakeholderId) as any[];
  return rows.map(row => ({
    ...row,
    proof_data: JSON.parse(row.proof_data)
  }));
}

/**
 * Save or update stakeholder in cache
 */
export function saveStakeholder(
  db: Database.Database,
  stakeholder: {
    stakeholder_id: string;
    name: string;
    title?: string;
    company: string;
    domain: string;
    email?: string;
    email_verified?: boolean;
    email_source?: string;
    phone?: string;
    phone_verified?: boolean;
    linkedin_url?: string;
    vision_2030_relevance?: number;
    decision_authority?: string;
    confidence_score?: number;
    extraction_method?: string;
    extracted_at?: string;
    verified?: boolean;
    user_id?: number;
  }
): void {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO jin_stakeholder_cache 
    (stakeholder_id, name, title, company, domain, email, email_verified, email_source,
     phone, phone_verified, linkedin_url, vision_2030_relevance, decision_authority,
     confidence_score, extraction_method, extracted_at, verified, user_id, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `);
  
  stmt.run(
    stakeholder.stakeholder_id,
    stakeholder.name,
    stakeholder.title || null,
    stakeholder.company,
    stakeholder.domain,
    stakeholder.email || null,
    stakeholder.email_verified ? 1 : 0,
    stakeholder.email_source || null,
    stakeholder.phone || null,
    stakeholder.phone_verified ? 1 : 0,
    stakeholder.linkedin_url || null,
    stakeholder.vision_2030_relevance || 0,
    stakeholder.decision_authority || null,
    stakeholder.confidence_score || 0,
    stakeholder.extraction_method || null,
    stakeholder.extracted_at || null,
    stakeholder.verified ? 1 : 0,
    stakeholder.user_id || null
  );
}

/**
 * Get stakeholders by domain
 */
export function getStakeholdersByDomain(
  db: Database.Database,
  domain: string
): any[] {
  const stmt = db.prepare(`
    SELECT * FROM jin_stakeholder_cache 
    WHERE domain = ? 
    ORDER BY confidence_score DESC
  `);
  
  return stmt.all(domain) as any[];
}

/**
 * Record KPI metric
 */
export function recordKPI(
  db: Database.Database,
  kpi: JinKPI
): void {
  const stmt = db.prepare(`
    INSERT INTO jin_kpi_tracking 
    (date, metric_name, metric_value, unit, context)
    VALUES (?, ?, ?, ?, ?)
  `);
  
  stmt.run(
    kpi.date,
    kpi.metric_name,
    kpi.metric_value,
    kpi.unit || null,
    kpi.context ? JSON.stringify(kpi.context) : null
  );
}

/**
 * Get KPI summary for a date range
 */
export function getKPISummary(
  db: Database.Database,
  startDate: string,
  endDate: string
): Record<string, { total: number; average: number; count: number }> {
  const stmt = db.prepare(`
    SELECT 
      metric_name,
      SUM(metric_value) as total,
      AVG(metric_value) as average,
      COUNT(*) as count
    FROM jin_kpi_tracking 
    WHERE date BETWEEN ? AND ?
    GROUP BY metric_name
  `);
  
  const rows = stmt.all(startDate, endDate) as any[];
  const summary: Record<string, { total: number; average: number; count: number }> = {};
  
  for (const row of rows) {
    summary[row.metric_name] = {
      total: row.total,
      average: row.average,
      count: row.count
    };
  }
  
  return summary;
}

/**
 * Get Jin's current status for dashboard
 */
export function getJinStatus(db: Database.Database): {
  totalExtractions: number;
  stakeholdersFound: number;
  verifiedContacts: number;
  recentActivity: EmployeeWorkLogEntry[];
  currentJobs: any[];
} {
  const totalExtractions = (db.prepare(`
    SELECT COUNT(DISTINCT job_id) as count FROM employee_work_log
  `).get() as any).count || 0;
  
  const stakeholdersFound = (db.prepare(`
    SELECT COUNT(*) as count FROM jin_stakeholder_cache
  `).get() as any).count || 0;
  
  const verifiedContacts = (db.prepare(`
    SELECT COUNT(*) as count FROM jin_stakeholder_cache WHERE verified = 1
  `).get() as any).count || 0;
  
  const recentActivity = getRecentWorkLog(db, 10);
  
  // Get in-progress jobs
  const currentJobs = (db.prepare(`
    SELECT 
      job_id,
      entity_domain,
      entity_name,
      status,
      MAX(created_at) as last_activity
    FROM employee_work_log
    WHERE status = 'in_progress'
    GROUP BY job_id
    ORDER BY last_activity DESC
    LIMIT 5
  `).all() as any[]) || [];
  
  return {
    totalExtractions,
    stakeholdersFound,
    verifiedContacts,
    recentActivity,
    currentJobs
  };
}
