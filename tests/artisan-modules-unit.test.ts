import { describe, it, expect, beforeAll } from 'vitest';
import {
  getTemplate,
  DEFAULT_TEMPLATES,
  generateFromTemplate,
  OutreachLead,
  OutreachContext,
} from '../src/services/outreach-writer.js';
import {
  CATEGORY_MAP,
  REVERSE_CATEGORY_MAP,
  suggestFollowUp,
  buildReplyTimeline,
  ArtisanReplyCategory,
} from '../src/services/reply-manager.js';
import {
  getDashboardData,
  getFunnelData,
  exportLeadsToCSV,
} from '../src/services/crm-hub.js';
import { initIntelligenceSchema, setIntelligenceDatabase } from '../src/services/intelligenceHub.js';

describe('Artisan Modules 3-5 Unit Tests', () => {
  // -------------------------------------------------------------------------
  // Module 3: Outreach Writer
  // -------------------------------------------------------------------------
  describe('Module 3 — Outreach Writer', () => {
    it('should have 6 default templates', () => {
      expect(DEFAULT_TEMPLATES.length).toBe(6);
    });

    it('should retrieve cold email English template', () => {
      const tpl = getTemplate('cold_email', 'en');
      expect(tpl).toBeDefined();
      expect(tpl?.id).toBe('tpl-cold-en');
      expect(tpl?.messageType).toBe('cold_email');
      expect(tpl?.language).toBe('en');
    });

    it('should retrieve WhatsApp Arabic template', () => {
      const tpl = getTemplate('whatsapp', 'ar');
      expect(tpl).toBeDefined();
      expect(tpl?.id).toBe('tpl-wa-ar');
    });

    it('should return undefined for unknown template', () => {
      const tpl = getTemplate('unknown' as any, 'en');
      expect(tpl).toBeUndefined();
    });

    it('should generate outreach from template', () => {
      const lead: OutreachLead = {
        name: 'Ahmad',
        title: 'CEO',
        company: 'Riyadh Tech',
        industry: 'Technology',
      };
      const context: OutreachContext = {
        service: 'Consulting',
        senderCompany: 'Euphoria Vision',
        senderName: 'Raqeeb',
      };
      const result = generateFromTemplate(lead, context, 'cold_email', 'en');
      expect(result.subject).toContain('Riyadh Tech');
      expect(result.body).toContain('Ahmad');
      expect(result.body).toContain('Euphoria Vision');
      expect(result.language).toBe('en');
      expect(result.messageType).toBe('cold_email');
      expect(result.personalizationScore).toBe(50);
    });

    it('should generate Arabic LinkedIn message from template', () => {
      const lead: OutreachLead = {
        name: 'فاطمة',
        title: 'مديرة',
        company: 'جدة لوجستيك',
        industry: 'Logistics',
      };
      const context: OutreachContext = {
        service: 'Partnership',
        senderCompany: 'شركتنا',
        senderName: 'فريق المبيعات',
      };
      const result = generateFromTemplate(lead, context, 'linkedin', 'ar');
      expect(result.language).toBe('ar');
      expect(result.body).toContain('فاطمة');
      expect(result.body).toContain('جدة لوجستيك');
    });
  });

  // -------------------------------------------------------------------------
  // Module 4: Reply Manager
  // -------------------------------------------------------------------------
  describe('Module 4 — Reply Manager', () => {
    it('should map ProtocolManager categories to Artisan categories', () => {
      expect(CATEGORY_MAP.INTERESTED).toBe('interested');
      expect(CATEGORY_MAP.NOT_INTERESTED).toBe('not_interested');
      expect(CATEGORY_MAP.OOO).toBe('follow_up_needed');
      expect(CATEGORY_MAP.QUESTION).toBe('follow_up_needed');
      expect(CATEGORY_MAP.REFERRAL).toBe('interested');
    });

    it('should provide reverse category mapping', () => {
      expect(REVERSE_CATEGORY_MAP.interested).toContain('INTERESTED');
      expect(REVERSE_CATEGORY_MAP.interested).toContain('REFERRAL');
      expect(REVERSE_CATEGORY_MAP.not_interested).toContain('NOT_INTERESTED');
      expect(REVERSE_CATEGORY_MAP.follow_up_needed).toContain('OOO');
      expect(REVERSE_CATEGORY_MAP.follow_up_needed).toContain('QUESTION');
    });

    it('should suggest English interested follow-up', () => {
      const result = suggestFollowUp('interested', 'Ahmad', 'Riyadh Tech', 'en', 'Raqeeb', 'Euphoria');
      expect(result.category).toBe('interested');
      expect(result.language).toBe('en');
      expect(result.suggestion).toContain('Ahmad');
      expect(result.suggestion).toContain('Euphoria');
      expect(result.tone).toBe('warm');
    });

    it('should suggest Arabic not_interested follow-up', () => {
      const result = suggestFollowUp('not_interested', 'فاطمة', 'جدة لوجستيك', 'ar', 'فريق', 'شركتنا');
      expect(result.category).toBe('not_interested');
      expect(result.language).toBe('ar');
      expect(result.suggestion).toContain('فاطمة');
      expect(result.tone).toBe('formal');
    });

    it('should build reply timeline sorted by timestamp desc', () => {
      const outreaches = [
        { id: 1, message_type: 'cold_email', subject: 'Hello', body: 'Test', language: 'en', status: 'sent', timestamp: '2024-01-02T10:00:00Z' },
      ];
      const replies = [
        { id: 2, body: 'Thanks', category: 'interested', confidence: 90, status: 'pending', timestamp: '2024-01-03T10:00:00Z' },
      ];
      const timeline = buildReplyTimeline(outreaches, replies);
      expect(timeline.length).toBe(2);
      expect(timeline[0].eventType).toBe('reply_received');
      expect(timeline[1].eventType).toBe('outreach_sent');
    });
  });

  // -------------------------------------------------------------------------
  // Module 5: CRM Hub
  // -------------------------------------------------------------------------
  describe('Module 5 — CRM Hub', () => {
    const userId = 999999;

    // Lightweight mock db for unit testing without native better-sqlite3
    function createMockDb(seedLeads: any[] = [], seedOutreaches: any[] = [], seedReplies: any[] = []) {
      const tables: Record<string, any[]> = {
        leads: [...seedLeads],
        outreach_messages: [...seedOutreaches],
        lead_replies: [...seedReplies],
      };

      return {
        prepare(sql: string) {
          const lower = sql.toLowerCase();
          if (lower.includes('count(*)')) {
            return {
              get(...params: any[]) {
                if (lower.includes('outreach_messages')) {
                  const uid = params[0];
                  const recent = lower.includes("-7 days");
                  const count = tables.outreach_messages.filter(
                    (r) => r.user_id === uid && (!recent || new Date(r.sent_at) > new Date(Date.now() - 7 * 86400000))
                  ).length;
                  return { c: count };
                }
                if (lower.includes('lead_replies')) {
                  const uid = params[0];
                  const recent = lower.includes("-7 days");
                  const count = tables.lead_replies.filter(
                    (r) => r.user_id === uid && (!recent || new Date(r.created_at) > new Date(Date.now() - 7 * 86400000))
                  ).length;
                  return { c: count };
                }
                return { c: 0 };
              },
            };
          }
          if (lower.includes('from leads')) {
            return {
              all(...params: any[]) {
                return tables.leads.filter((r) => r.user_id === params[0]).sort(
                  (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
                );
              },
            };
          }
          return { get: () => ({ c: 0 }), all: () => [] };
        },
      } as any;
    }

    beforeAll(() => {
      // Initialize intelligence hub with a mock-like in-memory approach
      // by setting a minimal db via setIntelligenceDatabase
      const mockIntelligenceDb = {
        prepare() {
          return {
            get() {
              return {
                pipeline_status: 'new',
                lead_score: 70,
                next_action: 'Send outreach',
                relationship_events: '[]',
                engagement_metrics: '{}',
                vision_alignment_score: 65,
              };
            },
            run() { return {}; },
            all() { return []; },
          };
        },
      } as any;
      initIntelligenceSchema(mockIntelligenceDb);
      setIntelligenceDatabase(mockIntelligenceDb);
    });

    it('should return dashboard metrics', () => {
      const mockDb = createMockDb(
        [
          { lead_id: 'lead-1', user_id: userId, name: 'Khalid', company: 'DIG', status: 'new', lead_score: 75, created_at: '2024-01-01' },
          { lead_id: 'lead-2', user_id: userId, name: 'Ahmad', company: 'RTV', status: 'interested', lead_score: 85, created_at: '2024-01-02' },
        ],
        [{ lead_id: 'lead-1', user_id: userId, sent_at: new Date().toISOString() }],
        [{ lead_id: 'lead-1', user_id: userId, created_at: new Date().toISOString() }]
      );
      const data = getDashboardData(mockDb, userId);
      // total_leads comes from IntelligenceHub pipeline; with mock db it is 0
      // total_outreaches / total_replies come from direct db queries
      expect(data.total_outreaches).toBe(1);
      expect(data.total_replies).toBe(1);
      expect(Array.isArray(data.pipeline_summary)).toBe(true);
      expect(data.generated_at).toBeDefined();
    });

    it('should return funnel data', () => {
      const mockDb = createMockDb(
        [
          { lead_id: 'lead-1', user_id: userId, status: 'new', lead_score: 75 },
          { lead_id: 'lead-2', user_id: userId, status: 'interested', lead_score: 85 },
        ]
      );
      const data = getFunnelData(mockDb, userId);
      expect(Array.isArray(data.funnel)).toBe(true);
      expect(data.conversion_summary).toBeDefined();
      expect(data.generated_at).toBeDefined();
    });

    it('should export leads to CSV', () => {
      const mockDb = createMockDb(
        [
          { lead_id: 'lead-1', user_id: userId, name: 'Khalid', title: 'CEO', company: 'DIG', email: 'k@dig.sa', phone: '', linkedin: '', industry: 'Manufacturing', status: 'new', outreach_status: '', lead_score: 75, vision_alignment_score: 60, last_contacted_at: '', created_at: '2024-01-01' },
        ]
      );
      const { csv, filename } = exportLeadsToCSV(mockDb, userId);
      expect(csv).toContain('lead_id');
      expect(csv).toContain('name');
      expect(csv).toContain('lead-1');
      expect(csv).toContain('Khalid');
      expect(filename).toContain('leadjin-leads');
      expect(filename).toContain('.csv');
    });

    it('should export leads with custom fields', () => {
      const mockDb = createMockDb(
        [
          { lead_id: 'lead-1', user_id: userId, name: 'Khalid', company: 'DIG' },
        ]
      );
      const { csv } = exportLeadsToCSV(mockDb, userId, { includeFields: ['lead_id', 'name', 'company'] });
      const lines = csv.split('\n');
      expect(lines[0]).toBe('lead_id,name,company');
      expect(lines[1]).toContain('lead-1');
    });
  });
});
