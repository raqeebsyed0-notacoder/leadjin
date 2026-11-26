/**
 * firstBootSeed.ts — first-boot Vision 2030 case-study seed.
 *
 * The app must never start empty in development. On first boot, when the
 * `leads` table has no rows, insert the 10-lead Vision 2030 case study.
 *
 * Production is deliberately NOT auto-seeded: an operator runs
 * `POST /api/test/seed` (founder-only) instead. That keeps real installs free
 * of demo data.
 */

export interface CaseStudyLead {
  id: string;
  name: string;
  company: string;
  title: string;
  email: string;
  industry: string;
  score: number;
  status: string;
  v2030: number;
  vProg: string;
}

export const CASE_STUDY_LEADS: CaseStudyLead[] = [
  { id: 'l1', name: 'Ahmed Al-Sudairy', company: 'NEOM Tech Solutions', title: 'Director of Innovation', email: 'ahmed@neom.sa', industry: 'Technology', score: 94, status: 'CLOSED', v2030: 95, vProg: 'PIF Program' },
  { id: 'l2', name: 'Sara Bin Ladin', company: 'Red Sea Global', title: 'VP Strategy', email: 'sara@redseaglobal.com', industry: 'Tourism', score: 88, status: 'PROPOSAL', v2030: 92, vProg: 'Quality of Life' },
  { id: 'l3', name: 'Khalid Al-Faisal', company: 'Aramco Digital', title: 'Head of AI', email: 'khalid@aramco.sa', industry: 'Energy', score: 91, status: 'MEETING', v2030: 85, vProg: 'NIDLP' },
  { id: 'l4', name: 'Noura Al-Saud', company: 'PIF (Public Investment Fund)', title: 'Investment Manager', email: 'noura@pif.gov.sa', industry: 'Finance', score: 96, status: 'REPLIED', v2030: 98, vProg: 'PIF Program' },
  { id: 'l5', name: 'Fahad Al-Rashid', company: 'King Abdullah Financial District', title: 'CEO', email: 'fahad@kafd.sa', industry: 'Real Estate', score: 85, status: 'CONTACTED', v2030: 80, vProg: 'Housing Program' },
  { id: 'l6', name: 'Mona Al-Zahrani', company: 'STC Solutions', title: 'CTO', email: 'mona@stc.com.sa', industry: 'Telecom', score: 82, status: 'NEW', v2030: 75, vProg: 'Digital Transformation' },
  { id: 'l7', name: 'Omar Al-Ghamdi', company: 'SABIC', title: 'Supply Chain Director', email: 'omar@sabic.com', industry: 'Manufacturing', score: 79, status: 'NEW', v2030: 70, vProg: 'NIDLP' },
  { id: 'l8', name: 'Laila Al-Otaibi', company: 'Ministry of Investment', title: 'Advisor', email: 'laila@misa.gov.sa', industry: 'Government', score: 92, status: 'CONTACTED', v2030: 90, vProg: 'Privatization' },
  { id: 'l9', name: 'Yousef Al-Harbi', company: 'Riyadh Air', title: 'Digital Transformation Lead', email: 'yousef@riyadhair.sa', industry: 'Aviation', score: 87, status: 'NEW', v2030: 88, vProg: 'NIDLP' },
  { id: 'l10', name: 'Reem Al-Dossary', company: 'Lucid Motors Middle East', title: 'Regional Manager', email: 'reem@lucidmotors.com', industry: 'Automotive', score: 84, status: 'NEW', v2030: 82, vProg: 'Sustainability' },
];

/**
 * Seed the case study leads when the database is empty.
 *
 * @returns the number of leads inserted (0 when leads already exist).
 */
export function seedCaseStudyLeads(db: any, userId: string | null = 'dev-user'): number {
  const leadCount = (db.prepare('SELECT COUNT(*) as cnt FROM leads').get() as { cnt: number }).cnt;
  if (leadCount > 0) return 0;

  const insertLead = db.prepare(
    `INSERT INTO leads
       (lead_id, name, company, title, email, industry, lead_score, status,
        vision_2030_score, vision_2030_program, user_id, meeting_ready)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  const tx = db.transaction((leads: CaseStudyLead[]) => {
    for (const lead of leads) {
      insertLead.run(
        lead.id, lead.name, lead.company, lead.title, lead.email, lead.industry,
        lead.score, lead.status, lead.v2030, lead.vProg, userId,
        lead.score >= 80 ? 1 : 0,
      );
    }
  });
  tx(CASE_STUDY_LEADS);

  return CASE_STUDY_LEADS.length;
}
