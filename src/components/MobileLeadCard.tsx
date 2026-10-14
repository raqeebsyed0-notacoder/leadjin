import { motion } from 'motion/react';
import { CheckCircle2 } from 'lucide-react';
import type { LeadjinLead } from '../services/geminiService';

interface MobileLeadCardProps {
  lead: LeadjinLead;
  contactedLeads: Set<string>;
  toggleContacted: (e: React.MouseEvent, id: string) => void;
  setSelectedLead: (lead: LeadjinLead) => void;
  getScoreColor: (score: number) => string;
  getStatusLabel: (score: number) => { label: string; color: string };
}

export const MobileLeadCard = ({ 
  lead, 
  contactedLeads, 
  toggleContacted, 
  setSelectedLead, 
  getScoreColor, 
  getStatusLabel 
}: MobileLeadCardProps) => {
  const status = getStatusLabel(lead.lead_score);
  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.02 }}
      onClick={() => setSelectedLead(lead)}
      className={`lead-card-mobile p-6 rounded-[32px] shadow-sm hover:shadow-xl transition-all duration-300 group ${contactedLeads.has(lead.lead_id) ? 'opacity-40 grayscale-[0.5]' : ''}`}
    >
      <div className="flex justify-between items-start">
        <div className="flex items-center gap-4">
          <div className={`text-3xl font-light italic ${getScoreColor(lead.lead_score)}`}>
            {lead.lead_score}
          </div>
          <div className="overflow-hidden">
            <div className="flex items-center gap-2">
              <h4 className="text-base font-medium truncate tracking-tight">{lead.name}</h4>
              {lead.vision_2030_alignment && lead.vision_2030_alignment.score > 70 && (
                <span className="px-1.5 py-0.5 bg-emerald-500/10 text-emerald-500 text-[7px] font-bold uppercase tracking-widest rounded border border-emerald-500/20 shrink-0">
                  V2030
                </span>
              )}
            </div>
            <p className="text-[10px] opacity-50 uppercase tracking-[0.2em] truncate">{lead.title}</p>
          </div>
        </div>
        <button
          onClick={(e) => toggleContacted(e, lead.lead_id)}
          className={`w-12 h-12 rounded-full flex items-center justify-center transition-all shadow-lg ${contactedLeads.has(lead.lead_id) ? 'bg-app-accent text-app-bg' : 'glass hover:bg-app-accent/10'}`}
        >
          <CheckCircle2 size={20} />
        </button>
      </div>
      <div className="flex justify-between items-center mt-4 pt-4 border-t border-app-border/10">
        <span className="text-[11px] font-light opacity-60 truncate max-w-[60%]">{lead.company}</span>
        <span className={`text-[9px] font-bold px-4 py-1 rounded-full border tracking-widest uppercase ${status.color}`}>
          {status.label}
        </span>
      </div>
    </motion.div>
  );
};
