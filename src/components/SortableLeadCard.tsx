import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Clock, Mail, Linkedin, GripVertical, Zap } from 'lucide-react';
import { toArabicNumerals } from '../utils/format';
import type { LeadjinLead } from '../services/geminiService';

interface SortableLeadCardProps {
  lead: LeadjinLead;
  language: 'en' | 'ar';
  arabicCardMode: boolean;
  setSelectedLead?: (lead: LeadjinLead) => void;
}

export const SortableLeadCard = ({ lead, arabicCardMode, setSelectedLead }: SortableLeadCardProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: lead.lead_id });
  
  const [wasDragging, setWasDragging] = useState(false);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const priority = lead.lead_score > 90 ? 'High' : lead.lead_score > 80 ? 'Medium' : 'Low';
  const priorityColor = priority === 'High' ? 'text-red-500 bg-red-500/10' : priority === 'Medium' ? 'text-orange-500 bg-orange-500/10' : 'text-blue-500 bg-blue-500/10';

  const handleClick = () => {
    if (!wasDragging && setSelectedLead) {
      setSelectedLead(lead);
    }
  };
  
  // Track drag state to prevent click after drag
  useEffect(() => {
    if (isDragging) {
      setWasDragging(true);
      const timer = setTimeout(() => setWasDragging(false), 100);
      return () => clearTimeout(timer);
    }
  }, [isDragging]);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group relative"
      dir={arabicCardMode ? 'rtl' : 'ltr'}
    >
      <div 
        {...attributes} 
        {...listeners}
        className="absolute left-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-40 cursor-grab active:cursor-grabbing p-1 z-10"
      >
        <GripVertical size={14} />
      </div>
      
      <motion.div 
        onClick={handleClick}
        className="glass p-4 rounded-2xl space-y-3 text-xs border-l-2 rtl:border-l-0 rtl:border-r-2 border-app-accent/30 hover:border-app-accent transition-all cursor-pointer active:scale-[0.98] ml-6 rtl:ml-0 rtl:mr-6"
      >
        <div className="flex justify-between items-start gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-bold truncate text-sm tracking-tight">{lead.name}</p>
              {lead.vision_2030_alignment && lead.vision_2030_alignment.score > 70 && (
                <span className="px-1 py-0.5 bg-emerald-500/10 text-emerald-500 text-[6px] font-bold uppercase tracking-widest rounded border border-emerald-500/20 shrink-0">
                  V2030
                </span>
              )}
            </div>
            <p className="opacity-60 truncate mt-0.5">{lead.company}</p>
          </div>
          <span className="text-[10px] font-mono opacity-40 shrink-0 bg-app-accent/5 px-2 py-0.5 rounded-md">
            {arabicCardMode ? toArabicNumerals(lead.lead_score) : lead.lead_score}%
          </span>
        </div>

        <div className="flex flex-wrap gap-2">
          <span className={`text-[8px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-md ${priorityColor}`}>
            {priority}
          </span>
          {/* N2: Watan Score badge - GCC national priority metric */}
          {(lead as any).watan_score > 0 && (
            <span className="text-[8px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-md bg-gradient-to-r from-amber-500/20 to-blue-500/20 text-amber-600 border border-amber-500/30" title="Watan Score: National priority alignment">
              🏛️ Watan {(lead as any).watan_score}
            </span>
          )}
          {/* Stuck lead alert: highlight if in stage > 7 days */}
          <span className={`text-[8px] font-medium uppercase tracking-widest flex items-center gap-1 px-2 py-0.5 rounded-md ${
            ((lead as any).days_in_stage || (lead as any).daysInStage) > 7 
              ? 'bg-rose-500/10 text-rose-500 border border-rose-500/20' 
              : 'opacity-40'
          }`}>
            <Clock size={8} />
            {((lead as any).days_in_stage ?? (lead as any).daysInStage) ?? '—'} {((lead as any).days_in_stage ?? (lead as any).daysInStage) ? 'd in stage' : 'in stage'}
            {((lead as any).days_in_stage || (lead as any).daysInStage) > 7 && <span className="ml-1">⚠️</span>}
          </span>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-app-border/5">
          <div className="flex gap-2">
            {lead.email && (
              <button 
                onClick={(e) => { e.stopPropagation(); window.open(`mailto:${lead.email}`, '_blank'); }}
                className="opacity-40 hover:opacity-100 transition-opacity"
              >
                <Mail size={12} />
              </button>
            )}
            {lead.linkedin && (
              <button 
                onClick={(e) => { e.stopPropagation(); window.open(lead.linkedin!, '_blank'); }}
                className="opacity-40 hover:opacity-100 transition-opacity"
              >
                <Linkedin size={12} />
              </button>
            )}
          </div>
          <div className="flex items-center gap-1 text-[9px] opacity-40 italic">
            <Zap size={10} className="text-app-accent" />
            Next: Follow up
          </div>
        </div>
      </motion.div>
    </div>
  );
};
