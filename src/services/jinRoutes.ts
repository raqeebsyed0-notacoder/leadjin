/**
 * Jin API Routes - REST endpoints for the AI Employee
 * 
 * Provides:
 * - POST /api/jin/extract - Start a new extraction job
 * - GET /api/jin/jobs/:jobId - Get job status
 * - GET /api/jin/jobs - List all jobs
 * - GET /api/jin/status - Get Jin's current status
 * - GET /api/jin/worklog - Get recent work log
 * - POST /api/jin/analyze - Analyze a lead using Jin's Brain
 * - POST /api/jin/outreach-draft - Generate strategic outreach
 */

import { Router, Request, Response } from 'express';
import Database from 'better-sqlite3';
import {
  createExtractionJob,
  getJob,
  getAllJobs,
  runStealthExtraction,
  queueExtractionJob,
  JinExtractionConfig
} from './jinStealthExtractor.js';
import { JinBrain } from './jinBrain.js';
import {
  initJinTables,
  addWorkLogEntry,
  getWorkLogByJob,
  getRecentWorkLog,
  getJinStatus,
  saveStakeholder,
  getStakeholdersByDomain
} from './jinLedger.js';

export function createJinRouter(db: Database.Database, getUserFromToken: (req: Request) => any | null): Router {
  const router = Router();
  
  // Initialize database tables
  initJinTables(db);
  
  // Middleware to require auth
  const requireAuth = (req: Request, res: Response): any | null => {
    const user = getUserFromToken(req);
    if (!user) {
      res.status(401).json({ error: 'Authentication required' });
      return null;
    }
    return user;
  };
  
  /**
   * POST /api/jin/extract
   * Start a new stakeholder extraction job
   */
  router.post('/extract', async (req: Request, res: Response) => {
    const user = requireAuth(req, res);
    if (!user) return;
    
    const { domain, companyName, verifyEmails = true } = req.body;
    
    if (!domain) {
      return res.status(400).json({ error: 'Domain is required' });
    }
    
    // Get Gemini API key (use user's key if available, otherwise server key)
    let apiKey = process.env.GEMINI_API_KEY;
    const userRecord = db.prepare('SELECT gemini_api_key FROM users WHERE id = ?').get(user.id) as any;
    if (userRecord?.gemini_api_key) {
      apiKey = userRecord.gemini_api_key;
    }
    
    if (!apiKey) {
      return res.status(503).json({ error: 'Gemini API key not configured' });
    }
    
    const config: JinExtractionConfig = {
      geminiApiKey: apiKey,
      headless: true,
      maxStakeholders: 3,
      verifyEmails,
      // LinkedIn session would be configured by user in production
      linkedinSessionCookie: process.env.LINKEDIN_SESSION_COOKIE
    };
    
    try {
      // Queue the job
      const jobId = queueExtractionJob(domain, config, companyName);
      
      // Log to database
      addWorkLogEntry(db, {
        job_id: jobId,
        action_type: 'discovery',
        entity_domain: domain,
        entity_name: companyName,
        description: `Jin started extraction for ${domain}`,
        status: 'in_progress',
        metadata: { user_id: user.id, verify_emails: verifyEmails }
      });
      
      res.json({
        success: true,
        jobId,
        message: `Jin is analyzing ${domain}. This may take 2-3 minutes.`,
        status: 'queued'
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });
  
  /**
   * POST /api/jin/extract-sync
   * Run extraction synchronously (for testing, limited to 1 stakeholder)
   */
  router.post('/extract-sync', async (req: Request, res: Response) => {
    const user = requireAuth(req, res);
    if (!user) return;
    
    const { domain, companyName } = req.body;
    
    if (!domain) {
      return res.status(400).json({ error: 'Domain is required' });
    }
    
    let apiKey = process.env.GEMINI_API_KEY;
    const userRecord = db.prepare('SELECT gemini_api_key FROM users WHERE id = ?').get(user.id) as any;
    if (userRecord?.gemini_api_key) {
      apiKey = userRecord.gemini_api_key;
    }
    
    if (!apiKey) {
      return res.status(503).json({ error: 'Gemini API key not configured' });
    }
    
    const job = createExtractionJob(domain, companyName);
    
    const config: JinExtractionConfig = {
      geminiApiKey: apiKey,
      headless: true,
      maxStakeholders: 3,
      verifyEmails: false, // Faster without verification
      linkedinSessionCookie: process.env.LINKEDIN_SESSION_COOKIE
    };
    
    try {
      // Run extraction
      const completedJob = await runStealthExtraction(job.jobId, config);
      
      // Save stakeholders to database
      for (const stakeholder of completedJob.stakeholders) {
        saveStakeholder(db, {
          stakeholder_id: stakeholder.id,
          name: stakeholder.name,
          title: stakeholder.title,
          company: stakeholder.company,
          domain: stakeholder.domain,
          email: stakeholder.email,
          email_verified: stakeholder.emailVerified,
          email_source: stakeholder.emailSource,
          phone: stakeholder.phone,
          phone_verified: stakeholder.phoneVerified,
          linkedin_url: stakeholder.linkedinUrl,
          vision_2030_relevance: stakeholder.vision2030Relevance,
          decision_authority: stakeholder.decisionMakingAuthority,
          confidence_score: stakeholder.confidenceScore,
          extraction_method: stakeholder.extractionMethod,
          extracted_at: stakeholder.extractedAt,
          verified: stakeholder.emailVerified,
          user_id: user.id
        });
      }
      
      res.json({
        success: true,
        job: completedJob,
        stakeholders: completedJob.stakeholders
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });
  
  /**
   * GET /api/jin/jobs/:jobId
   * Get status of a specific job
   */
  router.get('/jobs/:jobId', (req: Request, res: Response) => {
    const user = requireAuth(req, res);
    if (!user) return;
    
    const { jobId } = req.params;
    const job = getJob(jobId);
    
    if (!job) {
      // Check database for completed jobs
      const dbLog = getWorkLogByJob(db, jobId);
      if (dbLog.length > 0) {
        return res.json({
          jobId,
          status: 'completed',
          workLog: dbLog,
          stakeholders: getStakeholdersByDomain(db, dbLog[0].entity_domain)
        });
      }
      return res.status(404).json({ error: 'Job not found' });
    }
    
    res.json(job);
  });
  
  /**
   * GET /api/jin/jobs
   * List all active jobs
   */
  router.get('/jobs', (req: Request, res: Response) => {
    const user = requireAuth(req, res);
    if (!user) return;
    
    const jobs = getAllJobs();
    res.json({ jobs, total: jobs.length });
  });
  
  /**
   * GET /api/jin/status
   * Get Jin's current employee status
   */
  router.get('/status', (req: Request, res: Response) => {
    const user = requireAuth(req, res);
    if (!user) return;
    
    const status = getJinStatus(db);
    
    // Get current active jobs
    const activeJobs = getAllJobs().filter(j => j.status !== 'completed' && j.status !== 'failed');
    
    res.json({
      employee: {
        name: 'Jin',
        role: 'Regional Intelligence Specialist',
        status: activeJobs.length > 0 ? 'working' : 'available',
        currentTasks: activeJobs.map(j => ({
          jobId: j.jobId,
          domain: j.domain,
          status: j.status,
          progress: j.progress
        }))
      },
      metrics: {
        totalExtractions: status.totalExtractions,
        stakeholdersFound: status.stakeholdersFound,
        verifiedContacts: status.verifiedContacts
      },
      workLog: status.recentActivity.slice(0, 5)
    });
  });
  
  /**
   * GET /api/jin/worklog
   * Get Jin's recent work log
   */
  router.get('/worklog', (req: Request, res: Response) => {
    const user = requireAuth(req, res);
    if (!user) return;
    
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const workLog = getRecentWorkLog(db, limit);
    
    res.json({ workLog });
  });
  
  /**
   * POST /api/jin/analyze
   * Analyze a lead using Jin's Brain (Gemini 1.5 Pro)
   */
  router.post('/analyze', async (req: Request, res: Response) => {
    const user = requireAuth(req, res);
    if (!user) return;
    
    let apiKey = process.env.GEMINI_API_KEY;
    const userRecord = db.prepare('SELECT gemini_api_key FROM users WHERE id = ?').get(user.id) as any;
    if (userRecord?.gemini_api_key) {
      apiKey = userRecord.gemini_api_key;
    }
    
    if (!apiKey) {
      return res.status(503).json({ error: 'Gemini API key not configured' });
    }
    
    const brain = new JinBrain(apiKey);
    const { lead, context } = req.body;
    
    if (!lead) {
      return res.status(400).json({ error: 'Lead data required' });
    }
    
    try {
      const decision = await brain.analyzeLeadIntent(lead);
      
      // Log the analysis
      addWorkLogEntry(db, {
        job_id: `analysis-${Date.now()}`,
        action_type: 'analysis',
        entity_domain: lead.domain || 'unknown',
        entity_name: lead.company,
        description: `Analyzed ${lead.name} - Decision: ${decision.decision}`,
        status: 'completed',
        metadata: { decision, lead_id: lead.leadId }
      });
      
      res.json(decision);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });
  
  /**
   * POST /api/jin/timing
   * Determine optimal outreach timing
   */
  router.post('/timing', async (req: Request, res: Response) => {
    const user = requireAuth(req, res);
    if (!user) return;
    
    let apiKey = process.env.GEMINI_API_KEY;
    const userRecord = db.prepare('SELECT gemini_api_key FROM users WHERE id = ?').get(user.id) as any;
    if (userRecord?.gemini_api_key) {
      apiKey = userRecord.gemini_api_key;
    }
    
    if (!apiKey) {
      return res.status(503).json({ error: 'Gemini API key not configured' });
    }
    
    const brain = new JinBrain(apiKey);
    const { lead, context } = req.body;
    
    try {
      const decision = await brain.determineOutreachTiming(lead, context);
      res.json(decision);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });
  
  /**
   * POST /api/jin/vision2030
   * Analyze Vision 2030 alignment
   */
  router.post('/vision2030', async (req: Request, res: Response) => {
    const user = requireAuth(req, res);
    if (!user) return;
    
    let apiKey = process.env.GEMINI_API_KEY;
    const userRecord = db.prepare('SELECT gemini_api_key FROM users WHERE id = ?').get(user.id) as any;
    if (userRecord?.gemini_api_key) {
      apiKey = userRecord.gemini_api_key;
    }
    
    if (!apiKey) {
      return res.status(503).json({ error: 'Gemini API key not configured' });
    }
    
    const brain = new JinBrain(apiKey);
    const { entityName, industry } = req.body;
    
    if (!entityName) {
      return res.status(400).json({ error: 'Entity name required' });
    }
    
    try {
      const analysis = await brain.analyzeVision2030Alignment(entityName, industry || 'Technology');
      res.json(analysis);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });
  
  /**
   * POST /api/jin/categorize-reply
   * Categorize an email reply
   */
  router.post('/categorize-reply', async (req: Request, res: Response) => {
    const user = requireAuth(req, res);
    if (!user) return;
    
    let apiKey = process.env.GEMINI_API_KEY;
    const userRecord = db.prepare('SELECT gemini_api_key FROM users WHERE id = ?').get(user.id) as any;
    if (userRecord?.gemini_api_key) {
      apiKey = userRecord.gemini_api_key;
    }
    
    if (!apiKey) {
      return res.status(503).json({ error: 'Gemini API key not configured' });
    }
    
    const brain = new JinBrain(apiKey);
    const { emailContent, subject } = req.body;
    
    if (!emailContent) {
      return res.status(400).json({ error: 'Email content required' });
    }
    
    try {
      const result = await brain.categorizeReply(emailContent, subject || '');
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });
  
  /**
   * GET /api/jin/stakeholders/:domain
   * Get stakeholders for a domain
   */
  router.get('/stakeholders/:domain', (req: Request, res: Response) => {
    const user = requireAuth(req, res);
    if (!user) return;
    
    const { domain } = req.params;
    const stakeholders = getStakeholdersByDomain(db, domain);
    
    res.json({ domain, stakeholders, count: stakeholders.length });
  });
  
  return router;
}
