/**
 * Complete Jin API Routes
 * 
 * Combines all Jin modules:
 * - Module 2: Stealth Extraction (from jinRoutes.ts)
 * - Module 3: Triple-Check Verification
 * - Module 4: Strategic Outreach
 * - Module 5: Enhanced Ledger & KPI
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
import { getGenAI } from './genaiClient.js';
import { dispatchJinCommand } from './jinTools.js';
import {
  verifyEmailSMTP,
  verifyPhoneHLR,
  verifyRegionalHQ,
  performTripleCheck,
  batchVerifyStakeholders,
  getVerificationStats
} from './jinHandsVerifier.js';
import {
  generateStrategicOutreach,
  analyzeReply,
  generateFollowUp,
  getStrategicHooks
} from './jinVoiceOutreach.js';
import {
  initEnhancedJinTables,
  recordDailyMetrics,
  getKPIMetrics,
  getEnhancedJinStatus,
  generatePerformanceReport,
  getEnrichedStakeholder,
  addOutreachHistory,
  addStakeholderNote
} from './jinLedgerEnhanced.js';

// ---------------------------------------------------------------------------
// Jin chat endpoint
// ---------------------------------------------------------------------------

/** Clean raw model prose for human-facing display (strip code fences, trim). */
function cleanModelText(text: string): string {
  let t = text.trim();
  t = t.replace(/^```[a-zA-Z0-9_-]*\n?/gm, '').trim();
  t = t.replace(/\n?```$/gm, '').trim();
  return t;
}

export function createCompleteJinRouter(
  db: Database.Database,
  getUserFromToken: (req: Request) => any | null
): Router {
  const router = Router();

  // Initialize all tables
  initJinTables(db);
  initEnhancedJinTables(db);

  // Middleware to require auth
  const requireAuth = (req: Request, res: Response): any | null => {
    const user = getUserFromToken(req);
    if (!user) {
      res.status(401).json({ error: 'Authentication required' });
      return null;
    }
    return user;
  };

  // Get Gemini API key helper
  const getGeminiKey = (req: Request, user: any): string | null => {
    let apiKey = process.env.GEMINI_API_KEY;
    const userRecord = db.prepare('SELECT gemini_api_key FROM users WHERE id = ?').get(user.id) as any;
    if (userRecord?.gemini_api_key) {
      apiKey = userRecord.gemini_api_key;
    }
    return apiKey ?? null;
  };

  // ============================================================================
  // MODULE 2: STEALTH EXTRACTION (from jinRoutes.ts)
  // ============================================================================

  router.post('/extract', async (req: Request, res: Response) => {
    const user = requireAuth(req, res);
    if (!user) return;

    const { domain, companyName, verifyEmails = true } = req.body;
    if (!domain) return res.status(400).json({ error: 'Domain is required' });

    const apiKey = getGeminiKey(req, user);

    const config: JinExtractionConfig = {
      geminiApiKey: apiKey ?? '',
      headless: true,
      maxStakeholders: 3,
      verifyEmails,
      linkedinSessionCookie: process.env.LINKEDIN_SESSION_COOKIE
    };

    try {
      const jobId = queueExtractionJob(domain, config, companyName);

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

  router.get('/jobs/:jobId', (req: Request, res: Response) => {
    const user = requireAuth(req, res);
    if (!user) return;

    const job = getJob(req.params.jobId);
    if (!job) {
      const dbLog = getWorkLogByJob(db, req.params.jobId);
      if (dbLog.length > 0) {
        return res.json({
          jobId: req.params.jobId,
          status: 'completed',
          workLog: dbLog,
          stakeholders: getStakeholdersByDomain(db, dbLog[0].entity_domain)
        });
      }
      return res.status(404).json({ error: 'Job not found' });
    }

    res.json(job);
  });

  router.get('/jobs', (req: Request, res: Response) => {
    const user = requireAuth(req, res);
    if (!user) return;
    res.json({ jobs: getAllJobs(), total: getAllJobs().length });
  });

  // ============================================================================
  // MODULE 3: TRIPLE-CHECK VERIFICATION
  // ============================================================================

  router.post('/verify/email', async (req: Request, res: Response) => {
    const user = requireAuth(req, res);
    if (!user) return;

    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    try {
      const result = await verifyEmailSMTP(email, db);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/verify/phone', async (req: Request, res: Response) => {
    const user = requireAuth(req, res);
    if (!user) return;

    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: 'Phone is required' });

    try {
      const result = await verifyPhoneHLR(phone, db);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/verify/location', async (req: Request, res: Response) => {
    const user = requireAuth(req, res);
    if (!user) return;

    const { domain, companyName, claimedLocation } = req.body;
    if (!domain || !claimedLocation) {
      return res.status(400).json({ error: 'Domain and claimedLocation are required' });
    }

    try {
      const result = await verifyRegionalHQ(domain, companyName || domain, claimedLocation);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/verify/triple-check', async (req: Request, res: Response) => {
    const user = requireAuth(req, res);
    if (!user) return;

    const { stakeholderId, email, phone, domain, companyName, claimedLocation } = req.body;
    if (!stakeholderId) {
      return res.status(400).json({ error: 'stakeholderId is required' });
    }

    try {
      const result = await performTripleCheck(
        stakeholderId,
        email,
        phone,
        domain,
        companyName,
        claimedLocation || '',
        db
      );

      // Update stakeholder verification status
      if (result.overallStatus === 'verified') {
        db.prepare(`
          UPDATE jin_stakeholder_cache 
          SET verified = 1, last_verified_at = CURRENT_TIMESTAMP
          WHERE stakeholder_id = ?
        `).run(stakeholderId);
      }

      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/verify/batch', async (req: Request, res: Response) => {
    const user = requireAuth(req, res);
    if (!user) return;

    const { stakeholders } = req.body;
    if (!Array.isArray(stakeholders) || stakeholders.length === 0) {
      return res.status(400).json({ error: 'stakeholders array is required' });
    }

    try {
      const results = await batchVerifyStakeholders(stakeholders, db, 3);
      res.json({ results, total: results.length });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/verify/stats', (req: Request, res: Response) => {
    const user = requireAuth(req, res);
    if (!user) return;

    const stats = getVerificationStats(db);
    res.json(stats);
  });

  // ============================================================================
  // MODULE 4: STRATEGIC OUTREACH
  // ============================================================================

  router.post('/outreach/generate', async (req: Request, res: Response) => {
    const user = requireAuth(req, res);
    if (!user) return;

    const apiKey = getGeminiKey(req, user);

    const { stakeholder, sender, context } = req.body;
    if (!stakeholder || !sender) {
      return res.status(400).json({ error: 'stakeholder and sender are required' });
    }

    try {
      const outreach = await generateStrategicOutreach(
        stakeholder,
        sender,
        context || {},
        apiKey ?? ''
      );

      // Save to outreach history
      addOutreachHistory(db, {
        stakeholderId: stakeholder.id,
        outreachType: 'email',
        subject: outreach.subject,
        content: outreach.body,
        status: 'draft'
      });

      res.json(outreach);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/outreach/analyze-reply', async (req: Request, res: Response) => {
    const user = requireAuth(req, res);
    if (!user) return;

    const apiKey = getGeminiKey(req, user);
    const { emailContent, subject, originalContext } = req.body;

    if (!emailContent) {
      return res.status(400).json({ error: 'emailContent is required' });
    }

    try {
      const analysis = await analyzeReply(emailContent, subject || '', originalContext, apiKey || undefined);
      res.json(analysis);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/outreach/follow-up', async (req: Request, res: Response) => {
    const user = requireAuth(req, res);
    if (!user) return;

    const apiKey = getGeminiKey(req, user);
    const { originalOutreach, replyAnalysis, sender } = req.body;

    if (!originalOutreach || !replyAnalysis) {
      return res.status(400).json({ error: 'originalOutreach and replyAnalysis are required' });
    }

    try {
      const followUp = await generateFollowUp(originalOutreach, replyAnalysis, sender, apiKey || undefined);
      res.json({ followUp });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/outreach/hooks', (req: Request, res: Response) => {
    const user = requireAuth(req, res);
    if (!user) return;

    const { industry, companyName, vision2030Relevance } = req.body;
    if (!industry) return res.status(400).json({ error: 'industry is required' });

    const hooks = getStrategicHooks(industry, companyName || '', vision2030Relevance);
    res.json({ hooks });
  });

  // ============================================================================
  // MODULE 5: ENHANCED LEDGER & KPI
  // ============================================================================

  router.get('/status', (req: Request, res: Response) => {
    const user = requireAuth(req, res);
    if (!user) return;

    const status = getEnhancedJinStatus(db);
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
      metrics: status.allTime,
      kpi: {
        today: status.today,
        thisWeek: status.thisWeek.slice(-7),
        thisMonth: status.thisMonth
      },
      workLog: status.recentWorkLog.slice(0, 10)
    });
  });

  router.get('/worklog', (req: Request, res: Response) => {
    const user = requireAuth(req, res);
    if (!user) return;

    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const workLog = getRecentWorkLog(db, limit);
    res.json({ workLog });
  });

  router.get('/kpi/metrics', (req: Request, res: Response) => {
    const user = requireAuth(req, res);
    if (!user) return;

    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate and endDate are required' });
    }

    const metrics = getKPIMetrics(db, startDate as string, endDate as string);
    res.json({ metrics });
  });

  router.get('/kpi/report', (req: Request, res: Response) => {
    const user = requireAuth(req, res);
    if (!user) return;

    const { period, startDate, endDate } = req.query;
    const validPeriods = ['daily', 'weekly', 'monthly'];
    const p = (period as string) || 'weekly';

    if (!validPeriods.includes(p)) {
      return res.status(400).json({ error: 'period must be daily, weekly, or monthly' });
    }

    const report = generatePerformanceReport(
      db,
      p as 'daily' | 'weekly' | 'monthly',
      startDate as string | undefined,
      endDate as string | undefined
    );

    res.json(report);
  });

  router.get('/stakeholders/:stakeholderId', (req: Request, res: Response) => {
    const user = requireAuth(req, res);
    if (!user) return;

    const stakeholder = getEnrichedStakeholder(db, req.params.stakeholderId);
    if (!stakeholder) {
      return res.status(404).json({ error: 'Stakeholder not found' });
    }

    res.json(stakeholder);
  });

  router.get('/stakeholders', (req: Request, res: Response) => {
    const user = requireAuth(req, res);
    if (!user) return;

    const { domain, verified, limit = 50 } = req.query;

    let sql = 'SELECT * FROM jin_stakeholder_cache WHERE 1=1';
    const params: any[] = [];

    if (domain) {
      sql += ' AND domain = ?';
      params.push(domain);
    }

    if (verified === 'true') {
      sql += ' AND verified = 1';
    }

    sql += ' ORDER BY confidence_score DESC LIMIT ?';
    params.push(parseInt(limit as string));

    const stakeholders = db.prepare(sql).all(...params);
    res.json({ stakeholders, count: stakeholders.length });
  });

  router.post('/stakeholders/:stakeholderId/notes', (req: Request, res: Response) => {
    const user = requireAuth(req, res);
    if (!user) return;

    const { content, noteType } = req.body;
    if (!content) return res.status(400).json({ error: 'content is required' });

    try {
      addStakeholderNote(db, req.params.stakeholderId, content, noteType || 'general', `user:${user.id}`);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================================================
  // MODULE 1: BRAIN (Decision Making)
  // ============================================================================

  router.post('/analyze/intent', async (req: Request, res: Response) => {
    const user = requireAuth(req, res);
    if (!user) return;

    const apiKey = getGeminiKey(req, user);

    const brain = new JinBrain(apiKey ?? '');
    const { lead } = req.body;

    if (!lead) return res.status(400).json({ error: 'lead data required' });

    try {
      const decision = await brain.analyzeLeadIntent(lead);

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

  router.post('/analyze/timing', async (req: Request, res: Response) => {
    const user = requireAuth(req, res);
    if (!user) return;

    const apiKey = getGeminiKey(req, user);

    const brain = new JinBrain(apiKey ?? '');
    const { lead, context } = req.body;

    try {
      const decision = await brain.determineOutreachTiming(lead, context || {});
      res.json(decision);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/analyze/vision2030', async (req: Request, res: Response) => {
    const user = requireAuth(req, res);
    if (!user) return;

    const apiKey = getGeminiKey(req, user);

    const brain = new JinBrain(apiKey ?? '');
    const { entityName, industry } = req.body;

    if (!entityName) return res.status(400).json({ error: 'Entity name required' });

    try {
      const analysis = await brain.analyzeVision2030Alignment(entityName, industry || 'Technology');
      res.json(analysis);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================================================
  // Jin Chat Endpoint
  //
  // Local models only. No Gemini / Vertex / WATHQ keys are consulted here.
  // If a local model path/environment is not configured, the endpoint
  // transparently falls back to a data-driven stub built from existing Jin
  // verify / status data, and labels the response clearly as "stubbed".
  // ============================================================================

  router.post('/chat', async (req: Request, res: Response) => {
    const user = requireAuth(req, res);
    if (!user) return;

    const { message, history } = req.body;
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'message is required' });
    }

    // --- Local model gate (NO Gemini / Vertex / WATHQ) ---
    // LOCAL mode is the default: LEADJIN_PROVIDER=ollama drives the
    // provider-agnostic genaiClient at src/services/genaiClient.ts, which
    // dispatches to local Ollama gemma4:e4b. An explicit local path
    // (LOCAL_MODEL_PATH / OLLAMA_MODEL) takes precedence over the env default.
    const localModelPath = process.env.LOCAL_MODEL_PATH || process.env.OLLAMA_MODEL || null;
    const isLocal = localModelPath !== null || process.env.LEADJIN_PROVIDER === 'ollama';

    // --- Run the deterministic tool router FIRST ---
    // When a tool runs we report tool_calls: [result] and let the model
    // summarise the real result (the tool result is fed into the prompt).
    const toolResult = await dispatchJinCommand(message, { db, userId: user.id });
    if (toolResult) {
      const isLocal = localModelPath !== null || process.env.LEADJIN_PROVIDER === 'ollama';
      const localModel = localModelPath;
      let reply: string;
      let source: string;

      if (isLocal) {
        // Local model — feed the real tool result into the prompt so the model
        // summarises the real result rather than answering from memory.
        const ai = getGenAI();
        const aiResponse = await ai.models.generateContent({
          model: localModel || undefined,
          contents: `${message}\n\n--- TOOL RESULT (${toolResult.tool}) ---\n${JSON.stringify(toolResult, null, 2)}`,
          config: { temperature: 0.2, maxTokens: 1024 },
        });
        reply = cleanModelText(aiResponse.text || '[Jin] (no reply from local model)');
        source = 'tool_calls';
      } else {
        // No local model — the stub path stays; just report the tool call.
        const jinStatus = getEnhancedJinStatus(db);
        const metrics = (jinStatus.allTime || {}) as any;
        reply =
          `[STUBBED — no local model configured] ` +
          `Jin's tool ran: ${toolResult.tool}. ${toolResult.summary} ` +
          `Current state: ${metrics.totalStakeholders || 0} stakeholders found, ` +
          `${metrics.totalVerified || 0} verified, ` +
          `${metrics.totalOutreachSent || 0} outreach sent. ` +
          `Local LLM chat is offline — data-driven stub.`;
        source = 'stubbed_no_local_model';
      }

      // Persist a lightweight chat log entry into the existing work log.
      addWorkLogEntry(db, {
        job_id: `chat-${Date.now()}`,
        action_type: 'chat' as any,
        entity_domain: user.email || 'unknown',
        entity_name: user.email || 'unknown',
        description: `Jin tool: ${toolResult.tool}`,
        status: 'completed',
        metadata: { user_id: user.id, source, tool: toolResult.tool, tool_result: toolResult }
      });

      res.json({
        reply,
        source,
        localModel,
        isStubbed: !isLocal,
        timestamp: new Date().toISOString(),
        tool_calls: [toolResult]
      });
      return;
    }

    // --- No tool ran: existing model path (unchanged) ---
    let reply: string;
    let source: string;

    if (isLocal) {
      // A local model is configured — invoke it through the provider-agnostic
      // genaiClient (LOCAL mode → Ollama gemma4:e4b). No Gemini / Vertex /
      // WATHQ keys are consulted here.
      const ai = getGenAI();
      const aiResponse = await ai.models.generateContent({
        model: localModelPath || undefined,
        contents: message,
        config: { temperature: 0.2, maxTokens: 1024 },
      });
      reply = cleanModelText(aiResponse.text || '[Jin] (no reply from local model)');
      source = 'local';
    } else {
      // No local model available — stub using existing Jin verify/status data.
      const jinStatus = getEnhancedJinStatus(db);
      const metrics = (jinStatus.allTime || {}) as any;
      reply =
        `[STUBBED — no local model configured] ` +
        `Jin is available. Current state: ` +
        `${metrics.totalStakeholders || 0} stakeholders found, ` +
        `${metrics.totalVerified || 0} verified, ` +
        `${metrics.totalOutreachSent || 0} outreach sent. ` +
        `You said: "${message}". Local LLM chat is offline — this is a data-driven stub from Jin's verify/status tables.`;
      source = 'stubbed_no_local_model';
    }

    // Persist a lightweight chat log entry into the existing work log.
    addWorkLogEntry(db, {
      job_id: `chat-${Date.now()}`,
      action_type: 'chat' as any,
      entity_domain: user.email || 'unknown',
      entity_name: user.email || 'unknown',
      description: `Jin chat: "${message.slice(0, 200)}"`,
      status: 'completed',
      metadata: { user_id: user.id, source, local_model: localModelPath }
    });

    res.json({
      reply,
      source,
      localModel: localModelPath,
      isStubbed: !isLocal,
      timestamp: new Date().toISOString()
    });
  });

  return router;
}
