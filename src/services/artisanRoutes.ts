/**
 * LeadJin Artisan Modules 3-5 Routes
 *
 * Module 3: Outreach Writer
 * Module 4: Reply Manager
 * Module 5: CRM Intelligence Hub
 */

import { Router, Request, Response } from 'express';
import Database from 'better-sqlite3';
import {
  generateOutreach,
  OutreachLead,
  OutreachContext,
  getTemplate,
  DEFAULT_TEMPLATES,
} from './outreach-writer.js';
import {
  classifyReply,
  suggestFollowUp,
  enhanceFollowUpWithAI,
  buildReplyTimeline,
  ArtisanReplyCategory,
} from './reply-manager.js';
import {
  getDashboardData,
  getFunnelData,
  exportLeadsToCSV,
} from './crm-hub.js';
import {
  getRelationshipHistory,
  processOutreachSent,
  processReplyReceived,
  trackRelationship,
} from './intelligenceHub.js';

export interface OutreachTemplate {
  id: string;
  name: string;
  message_type: 'cold_email' | 'linkedin' | 'whatsapp';
  language: 'en' | 'ar';
  subject?: string;
  body: string;
}

// Legacy full templates kept for response compatibility
const LEGACY_TEMPLATES: OutreachTemplate[] = [
  {
    id: 'tpl-cold-en',
    name: 'Cold Email (English)',
    message_type: 'cold_email',
    language: 'en',
    subject: 'Partnership Opportunity — {{company}}',
    body: `As-salamu alaykum {{name}},\n\nI hope this message finds you well.\n\nI am reaching out regarding a potential collaboration between {{senderCompany}} and {{company}}.\n\nGiven {{company}}'s position in {{industry}}, I believe there is a strong opportunity to align with Saudi Vision 2030 initiatives.\n\nWould you be open to a brief conversation to explore how we might work together?\n\nWa assalamu alaykum,\n{{senderName}}`,
  },
  {
    id: 'tpl-cold-ar',
    name: 'Cold Email (Arabic)',
    message_type: 'cold_email',
    language: 'ar',
    subject: 'فرصة تعاون — {{company}}',
    body: `السلام عليكم {{name}}،\n\nتحية طيبة وبعد،\n\nنكتب إليكم بخصوص فرصة تعاون محتملة بين {{senderCompany}} و{{company}}.\n\nنظراً لمكانة {{company}} في قطاع {{industry}}، نرى إمكانية كبيرة للتكامل مع رؤية المملكة 2030.\n\nهل لديكم الاستعداد لمحادثة موجزة لاستكشاف سبل العمل المشترك؟\n\nوتفضلوا بقبول فائق الاحترام،\n{{senderName}}`,
  },
  {
    id: 'tpl-li-en',
    name: 'LinkedIn Message (English)',
    message_type: 'linkedin',
    language: 'en',
    body: `Hi {{name}},\n\nI came across your profile and {{company}}'s work in {{industry}}. I'd love to connect and explore how {{senderCompany}} might support your Vision 2030 goals.\n\nBest,\n{{senderName}}`,
  },
  {
    id: 'tpl-li-ar',
    name: 'LinkedIn Message (Arabic)',
    message_type: 'linkedin',
    language: 'ar',
    body: `مرحباً {{name}}،\n\nاطلعت على ملفك الشخصي وعمل {{company}} في {{industry}}. أرغب بالتواصل واستكشاف كيف يمكن لـ{{senderCompany}} دعم أهداف رؤية 2030 لديكم.\n\nمع خالص التقدير،\n{{senderName}}`,
  },
  {
    id: 'tpl-wa-en',
    name: 'WhatsApp Intro (English)',
    message_type: 'whatsapp',
    language: 'en',
    body: `As-salamu alaykum {{name}} 👋\n\nThis is {{senderName}} from {{senderCompany}}. We admire {{company}}'s impact in {{industry}} and would love to explore a collaboration aligned with Saudi Vision 2030.\n\nMay we schedule a brief call?`,
  },
  {
    id: 'tpl-wa-ar',
    name: 'WhatsApp Intro (Arabic)',
    message_type: 'whatsapp',
    language: 'ar',
    body: `السلام عليكم {{name}} 👋\n\n{{senderName}} من {{senderCompany}}. نقدر تأثير {{company}} في {{industry}} ونرغب باستكشاف تعاون يتوافق مع رؤية المملكة 2030.\n\nهل يمكننا تحديد موعد محادثة قصيرة؟`,
  },
];

export function createArtisanRouter(
  db: Database.Database,
  getUserFromToken: (req: Request) => any | null
): Router {
  const router = Router();

  const requireAuth = (req: Request, res: Response): any | null => {
    const user = getUserFromToken(req);
    if (!user) {
      res.status(401).json({ error: 'Authentication required' });
      return null;
    }
    return user;
  };

  const getApiKey = (userId: number): string | null => {
    const row = db.prepare('SELECT gemini_api_key FROM users WHERE id = ?').get(userId) as any;
    return row?.gemini_api_key || process.env.GEMINI_API_KEY || null;
  };

  // ---------------------------------------------------------------------------
  // MODULE 3: Outreach Writer
  // ---------------------------------------------------------------------------

  // Get outreach templates (cold email, LinkedIn, WhatsApp) in en/ar
  router.get('/outreach/templates', (req: Request, res: Response) => {
    const user = requireAuth(req, res);
    if (!user) return;

    const { type, language } = req.query;
    let templates = [...LEGACY_TEMPLATES];

    if (type) {
      templates = templates.filter((t) => t.message_type === type);
    }
    if (language) {
      templates = templates.filter((t) => t.language === language);
    }

    res.json({ templates, count: templates.length });
  });

  // Generate personalized outreach
  router.post('/outreach/generate', async (req: Request, res: Response) => {
    const user = requireAuth(req, res);
    if (!user) return;

    const apiKey = getApiKey(user.id);
    if (!apiKey) {
      return res.status(503).json({ error: 'Gemini API key not configured' });
    }

    const { lead, context, messageType, language } = req.body;
    if (!lead?.name || !lead?.title || !lead?.company) {
      return res.status(400).json({ error: 'Lead name, title, and company are required' });
    }

    const userRow = db.prepare('SELECT company_name, email FROM users WHERE id = ?').get(user.id) as any;
    const enrichedContext: OutreachContext = {
      service: context?.service || 'Strategic Partnership',
      senderCompany: context?.senderCompany || userRow?.company_name || 'Our Company',
      senderName: context?.senderName || userRow?.email?.split('@')[0] || 'The Team',
      visionAlignment: context?.visionAlignment,
      previousInteractions: context?.previousInteractions,
    };

    try {
      const leadProfile: OutreachLead = {
        ...lead,
        languagePreference: language || lead.languagePreference || 'auto',
      };

      const result = await generateOutreach(
        leadProfile,
        enrichedContext,
        messageType || 'cold_email',
        apiKey
      );

      // If a template type is specified, optionally merge template structure
      if (messageType) {
        const template = getTemplate(messageType, result.language);
        if (template) {
          (result as any).templateUsed = template.id;
        }
      }

      res.json(result);
    } catch (error: any) {
      console.error('[Artisan:Module3] Outreach generation failed:', error.message);
      res.status(500).json({ error: 'Failed to generate outreach', message: error.message });
    }
  });

  // Record sent outreach
  router.post('/outreach/send', async (req: Request, res: Response) => {
    const user = requireAuth(req, res);
    if (!user) return;

    const { lead_id, message_type, subject, body, language } = req.body;
    if (!lead_id || !message_type || !body) {
      return res.status(400).json({ error: 'lead_id, message_type, and body are required' });
    }

    const lead = db.prepare('SELECT lead_id FROM leads WHERE lead_id = ? AND user_id = ?').get(lead_id, user.id) as any;
    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    try {
      const result = db.prepare(
        `INSERT INTO outreach_messages (lead_id, user_id, message_type, subject, body, language, status, sent_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
      ).run(lead_id, user.id, message_type, subject || '', body, language || 'en', 'sent');

      // Update lead intelligence via hub
      await processOutreachSent(lead_id, {
        subject: subject || '',
        body,
        language: language || 'en',
        personalizationScore: 70,
        references: [],
        toneAnalysis: { formality: 'formal', culturalAppropriateness: 'high' },
      }, user.id);

      // Track relationship
      trackRelationship(lead_id, [
        {
          type: 'email_sent',
          timestamp: new Date().toISOString(),
          details: `Sent ${message_type} outreach`,
          metadata: { outreach_id: result.lastInsertRowid },
        },
      ]);

      res.json({ status: 'ok', outreach_id: result.lastInsertRowid });
    } catch (error: any) {
      console.error('[Artisan:Module3] Send tracking failed:', error.message);
      res.status(500).json({ error: 'Failed to track outreach', message: error.message });
    }
  });

  // ---------------------------------------------------------------------------
  // MODULE 4: Reply Manager
  // ---------------------------------------------------------------------------

  // Classify a reply
  router.post('/replies/classify', async (req: Request, res: Response) => {
    const user = requireAuth(req, res);
    if (!user) return;

    const { emailBody, originalOutreach, options } = req.body;
    if (!emailBody || !originalOutreach) {
      return res.status(400).json({ error: 'emailBody and originalOutreach are required' });
    }

    const apiKey = getApiKey(user.id);
    if (!apiKey) {
      return res.status(503).json({ error: 'Gemini API key not configured' });
    }

    const userRow = db.prepare('SELECT company_name, email FROM users WHERE id = ?').get(user.id) as any;
    const classifyOptions = {
      meetingLinkPlaceholder: options?.meetingLinkPlaceholder || '[MEETING_LINK]',
      userCompanyName: options?.userCompanyName || userRow?.company_name || 'Our Company',
      userName: options?.userName || userRow?.email?.split('@')[0] || 'The Team',
      userServices: options?.userServices || 'our services',
    };

    try {
      const result = await classifyReply(emailBody, originalOutreach, classifyOptions, apiKey);
      res.json(result);
    } catch (error: any) {
      console.error('[Artisan:Module4] Classification failed:', error.message);
      res.status(500).json({ error: 'Failed to classify reply', message: error.message });
    }
  });

  // Track a reply
  router.post('/replies/track', async (req: Request, res: Response) => {
    const user = requireAuth(req, res);
    if (!user) return;

    const { lead_id, reply_body, category, confidence, suggested_response, original_outreach_id } = req.body;
    if (!lead_id || !reply_body || !category) {
      return res.status(400).json({ error: 'lead_id, reply_body, and category are required' });
    }

    const lead = db.prepare('SELECT lead_id FROM leads WHERE lead_id = ? AND user_id = ?').get(lead_id, user.id) as any;
    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    try {
      const result = db.prepare(
        `INSERT INTO lead_replies (lead_id, user_id, original_outreach_id, reply_body, category, confidence, suggested_response, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(lead_id, user.id, original_outreach_id || null, reply_body, category, confidence || 0, suggested_response || '', 'pending');

      // Process through Intelligence Hub
      await processReplyReceived(lead_id, { category, confidence: confidence || 0, suggestedResponse: suggested_response || '' } as any, reply_body);

      // Track relationship
      trackRelationship(lead_id, [
        {
          type: 'email_reply',
          timestamp: new Date().toISOString(),
          details: `Reply received: ${category}`,
          metadata: { reply_id: result.lastInsertRowid },
        },
      ]);

      res.json({ status: 'ok', reply_id: result.lastInsertRowid });
    } catch (error: any) {
      console.error('[Artisan:Module4] Reply tracking failed:', error.message);
      res.status(500).json({ error: 'Failed to track reply', message: error.message });
    }
  });

  // Get timeline view per lead
  router.get('/replies/timeline/:leadId', (req: Request, res: Response) => {
    const user = requireAuth(req, res);
    if (!user) return;

    const { leadId } = req.params;
    const lead = db.prepare('SELECT lead_id FROM leads WHERE lead_id = ? AND user_id = ?').get(leadId, user.id) as any;
    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    try {
      const outreaches = db.prepare(
        `SELECT id, message_type, subject, body, language, status, sent_at as timestamp, 'outreach' as event_type
         FROM outreach_messages
         WHERE lead_id = ? AND user_id = ?
         ORDER BY sent_at DESC`
      ).all(leadId, user.id) as any[];

      const replies = db.prepare(
        `SELECT id, reply_body as body, category, confidence, suggested_response, status, created_at as timestamp, 'reply' as event_type
         FROM lead_replies
         WHERE lead_id = ? AND user_id = ?
         ORDER BY created_at DESC`
      ).all(leadId, user.id) as any[];

      const relationship = getRelationshipHistory(leadId);

      const timeline = buildReplyTimeline(outreaches, replies, relationship.events || []);

      res.json({ lead_id: leadId, timeline, count: timeline.length });
    } catch (error: any) {
      console.error('[Artisan:Module4] Timeline fetch failed:', error.message);
      res.status(500).json({ error: 'Failed to fetch timeline', message: error.message });
    }
  });

  // Auto-suggest follow-up
  router.post('/replies/follow-up', async (req: Request, res: Response) => {
    const user = requireAuth(req, res);
    if (!user) return;

    const { reply_category, lead_name, company_name, original_outreach_body, language } = req.body;
    if (!reply_category) {
      return res.status(400).json({ error: 'reply_category is required' });
    }

    const apiKey = getApiKey(user.id);

    const userRow = db.prepare('SELECT company_name, email FROM users WHERE id = ?').get(user.id) as any;
    const senderCompany = userRow?.company_name || 'Our Company';
    const senderName = userRow?.email?.split('@')[0] || 'The Team';

    try {
      let suggestion = '';

      if (apiKey && original_outreach_body) {
        suggestion = await enhanceFollowUpWithAI(
          reply_category as ArtisanReplyCategory,
          lead_name || '',
          company_name || '',
          original_outreach_body,
          (language as 'en' | 'ar') || 'en',
          senderName,
          senderCompany,
          apiKey
        );
      } else {
        const base = suggestFollowUp(
          reply_category as ArtisanReplyCategory,
          lead_name || '',
          company_name || '',
          (language as 'en' | 'ar') || 'en',
          senderName,
          senderCompany
        );
        suggestion = base.suggestion;
      }

      res.json({ suggestion, category: reply_category, language: language || 'en' });
    } catch (error: any) {
      console.error('[Artisan:Module4] Follow-up suggestion failed:', error.message);
      res.status(500).json({ error: 'Failed to suggest follow-up', message: error.message });
    }
  });

  // ---------------------------------------------------------------------------
  // MODULE 5: CRM Intelligence Hub
  // ---------------------------------------------------------------------------

  // Dashboard view
  router.get('/crm/dashboard', (req: Request, res: Response) => {
    const user = requireAuth(req, res);
    if (!user) return;

    try {
      const data = getDashboardData(db, user.id);
      res.json(data);
    } catch (error: any) {
      console.error('[Artisan:Module5] Dashboard error:', error.message);
      res.status(500).json({ error: 'Failed to fetch dashboard', message: error.message });
    }
  });

  // Funnel visualization data
  router.get('/crm/funnel', (req: Request, res: Response) => {
    const user = requireAuth(req, res);
    if (!user) return;

    try {
      const data = getFunnelData(db, user.id);
      res.json(data);
    } catch (error: any) {
      console.error('[Artisan:Module5] Funnel error:', error.message);
      res.status(500).json({ error: 'Failed to fetch funnel', message: error.message });
    }
  });

  // Export leads to CSV
  router.get('/crm/export-csv', (req: Request, res: Response) => {
    const user = requireAuth(req, res);
    if (!user) return;

    try {
      const { csv, filename } = exportLeadsToCSV(db, user.id);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(csv);
    } catch (error: any) {
      console.error('[Artisan:Module5] CSV export error:', error.message);
      res.status(500).json({ error: 'Failed to export CSV', message: error.message });
    }
  });

  return router;
}
