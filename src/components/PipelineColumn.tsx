import { motion } from 'motion/react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { TrendingUp, Plus } from 'lucide-react';
import { SortableLeadCard } from './SortableLeadCard';
import type { LeadjinLead } from '../services/geminiService';

interface PipelineColumnProps {
  id: string;
  title: string;
  leads: LeadjinLead[];
  language: 'en' | 'ar';
  metrics: { value: number; probability: number };
  t: any;
  arabicCardMode: boolean;
  setSelectedLead: (lead: LeadjinLead) => void;
}

export const PipelineColumn = ({ id, title, leads, language, metrics, t, arabicCardMode, setSelectedLead }: PipelineColumnProps) => {
  const { setNodeRef } = useDroppable({ id });

  return (
    <div className="w-72 md:w-80 flex flex-col gap-6 shrink-0">
      <div className="space-y-4 px-2">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h3 className="text-[11px] font-bold uppercase tracking-[0.2em] opacity-40">{title}</h3>
            <div className="flex items-center gap-2">
              <span className="text-xl font-light">{leads.length}</span>
              <span className="text-[10px] opacity-20 uppercase tracking-widest">{t.leadsCount}</span>
            </div>
          </div>
          <div className="text-right space-y-1">
            <p className="text-[10px] font-mono text-app-accent font-bold">${metrics.value.toLocaleString()}</p>
            <div className="flex items-center gap-1 justify-end opacity-30">
              <TrendingUp size={10} />
              <span className="text-[9px] font-bold">{metrics.probability}% prob.</span>
            </div>
          </div>
        </div>
        
        <div className="h-1 w-full bg-app-accent/5 rounded-full overflow-hidden">
          <motion.div 
            initial={{ width: 0 }}
            animate={{ width: `${metrics.probability}%` }}
            className="h-full bg-app-accent"
          />
        </div>
      </div>

      <div 
        ref={setNodeRef}
        className="flex-1 space-y-4 overflow-y-auto pr-2 custom-scrollbar min-h-[200px]"
      >
        <SortableContext items={leads.map((l) => l.lead_id)} strategy={verticalListSortingStrategy}>
          {leads.map((lead) => (
            <SortableLeadCard key={lead.lead_id} lead={lead} language={language} arabicCardMode={arabicCardMode} setSelectedLead={setSelectedLead} />
          ))}
        </SortableContext>
        
        {leads.length === 0 && (
          <div className="h-32 border-2 border-dashed border-app-border/10 rounded-3xl flex flex-col items-center justify-center gap-2 opacity-20 grayscale">
            <Plus size={20} />
            <p className="text-[9px] uppercase tracking-widest font-bold">{t.empty}</p>
          </div>
        )}
      </div>
    </div>
  );
};
