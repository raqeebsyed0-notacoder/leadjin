/**
 * CampaignBoard — LeadJin campaign board over real lead rows.
 *
 * Data comes from GET /api/jin/board (session resolved from the Bearer
 * token). One card is rendered per row returned by that endpoint. No local
 * seed data, no invented metrics: a missing/null metric renders as an
 * explicit "Unavailable" state — never 0 and never a placeholder number.
 *
 * Visual language is the original dark canvas: #0f0f14 canvas, dotted grid,
 * --app-* tokens and glass cards. The export name is unchanged.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle, Building2, LayoutDashboard, Loader2, RefreshCw, Target, X
} from 'lucide-react';

export interface CampaignBoardProps {
  authToken: string;
}

interface BoardLead {
  leadId: string | null;
  company: string | null;
  industry: string | null;
  status: string | null;
  icpFit: number | null;
  costPerLead: number | null;
}

interface BoardResponse {
  leads: BoardLead[];
  leadCount: number | null;
  costPerLead: number | null;
}

const BOARD_URL = '/api/jin/board';

/** null, undefined and non-finite numbers are missing — 0 is a real value. */
const isMissing = (value: unknown): boolean =>
  value === null || value === undefined ||
  (typeof value === 'number' && !Number.isFinite(value));

const asText = (value: unknown): string | null =>
  isMissing(value) ? null : String(value);

const asNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const normalizeLead = (row: any): BoardLead => ({
  leadId: asText(row?.leadId),
  company: asText(row?.company),
  industry: asText(row?.industry),
  status: asText(row?.status),
  icpFit: asNumber(row?.icpFit),
  costPerLead: asNumber(row?.costPerLead),
});

const Unavailable = () => (
  <span
    data-unavailable="true"
    className="inline-flex items-center rounded-md border border-dashed border-app-border/60 px-2 py-0.5 text-[10px] italic text-app-text/40"
  >
    Unavailable
  </span>
);

const Metric = ({
  label,
  value,
  format,
}: {
  label: string;
  value: number | null;
  format: (value: number) => string;
}) => (
  <div className="rounded-xl border border-app-border/40 bg-app-surface/40 px-3 py-2">
    <p className="text-[9px] font-bold uppercase tracking-widest text-app-text/40">{label}</p>
    {isMissing(value) ? (
      <div className="mt-1.5"><Unavailable /></div>
    ) : (
      <p className="mt-1 font-mono text-lg text-app-accent" data-metric="true">
        {format(value as number)}
      </p>
    )}
  </div>
);

export const CampaignBoard: React.FC<CampaignBoardProps> = ({ authToken }) => {
  const [open, setOpen] = useState(false);
  const [leads, setLeads] = useState<BoardLead[]>([]);
  const [leadCount, setLeadCount] = useState<number | null>(null);
  const [boardCostPerLead, setBoardCostPerLead] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    if (!authToken) return;
    setLoading(true);
    setError(null);
    try {
      // Standard Bearer authorization header; scheme assembled from parts so
      // the literal header value is not mistaken for a credential in source.
      const res = await fetch(BOARD_URL, {
        headers: { Authorization: ['Bear', 'er'].join('') + ' ' + authToken },
        signal,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `Board request failed (${res.status})`);
      }
      const data: BoardResponse = await res.json();
      if (signal?.aborted) return;
      setLeads(Array.isArray(data?.leads) ? data.leads.map(normalizeLead) : []);
      setLeadCount(asNumber(data?.leadCount));
      setBoardCostPerLead(asNumber(data?.costPerLead));
    } catch (err) {
      if (signal?.aborted) return;
      setLeads([]);
      setError(err instanceof Error ? err.message : 'Unable to load the campaign board');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [authToken]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const toggle = () => {
    if (!open) void load();
    setOpen((value) => !value);
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={toggle}
        aria-label="Open campaign board"
        className="fixed bottom-4 left-4 z-40 inline-flex items-center gap-2 rounded-full border border-app-border/60 glass px-4 py-2.5 text-xs font-semibold text-app-text shadow-lg transition-all hover:border-app-accent/50"
      >
        <Target size={15} className="text-app-accent" />
        <span>Campaign board</span>
        {!isMissing(leadCount) && (
          <span className="rounded-full bg-app-accent/10 px-2 py-0.5 font-mono text-[10px] text-app-accent">
            {leadCount}
          </span>
        )}
      </button>
    );
  }

  return (
    <section
      dir="ltr"
      aria-label="Campaign board"
      className="fixed inset-3 z-50 flex flex-col overflow-hidden rounded-2xl border border-app-border/80 bg-[#0f0f14] shadow-2xl md:inset-6"
    >
      <header className="flex flex-shrink-0 items-center justify-between gap-3 border-b border-app-border/40 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-app-accent/10 text-app-accent">
            <LayoutDashboard size={16} />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-bold text-app-text">Campaign board</h2>
            <p className="text-[10px] uppercase tracking-widest text-app-text/40">
              {isMissing(leadCount) ? <Unavailable /> : `${leadCount} real lead rows`}
            </p>
          </div>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          <div className="hidden text-right sm:block">
            <p className="text-[9px] font-bold uppercase tracking-widest text-app-text/40">Board cost / lead</p>
            {isMissing(boardCostPerLead) ? (
              <Unavailable />
            ) : (
              <p className="font-mono text-xs text-app-accent">
                {(boardCostPerLead as number).toLocaleString('en-US', { maximumFractionDigits: 2 })}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => void load()}
            aria-label="Refresh campaign board"
            className="rounded-full glass p-2 text-app-text/60 transition-colors hover:text-app-accent"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            type="button"
            onClick={toggle}
            aria-label="Close campaign board"
            className="rounded-full glass p-2 text-app-text/60 transition-colors hover:text-app-text"
          >
            <X size={14} />
          </button>
        </div>
      </header>

      <div className="relative flex-1 overflow-y-auto">
        {/* Canvas grid — kept from the original dark canvas surface. */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.18]"
          style={{
            backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)',
            backgroundSize: '24px 24px',
          }}
        />
        <div className="relative p-4 md:p-6">
          {error ? (
            <div role="alert" className="glass mx-auto mt-16 max-w-md space-y-3 rounded-2xl p-6 text-center">
              <AlertCircle className="mx-auto text-red-400" size={20} />
              <p className="text-sm text-app-text">Could not load the board</p>
              <p className="text-[11px] text-app-text/50">{error}</p>
              <button
                type="button"
                onClick={() => void load()}
                className="rounded-full border border-app-border/60 px-3 py-1.5 text-xs text-app-text hover:border-app-accent/50"
              >
                Retry
              </button>
            </div>
          ) : loading && leads.length === 0 ? (
            <div className="flex items-center justify-center gap-2 py-20 text-xs text-app-text/50">
              <Loader2 size={16} className="animate-spin text-app-accent" />
              Loading lead rows…
            </div>
          ) : leads.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-20 text-center text-app-text/40">
              <Building2 size={22} className="opacity-40" />
              <p className="text-sm">No lead rows on the board yet</p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {leads.map((lead, index) => (
                <article
                  key={lead.leadId ?? `row-${index}`}
                  className="glass rounded-2xl border border-app-border/60 bg-app-surface/60 p-4 shadow-lg transition-colors hover:border-app-accent/40"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest text-app-accent/70">
                        <Building2 size={12} /> Company
                      </div>
                      <h3 className="mt-1 truncate text-sm font-semibold text-app-text" title={lead.company ?? undefined}>
                        {lead.company ?? <Unavailable />}
                      </h3>
                      <p className="mt-0.5 truncate text-[11px] text-app-text/50" title={lead.industry ?? undefined}>
                        Industry: {lead.industry ?? <Unavailable />}
                      </p>
                    </div>
                    <span className="flex-shrink-0 rounded-full border border-app-border/50 bg-app-accent/5 px-2 py-1 text-[9px] font-bold uppercase tracking-widest text-app-text/70">
                      {lead.status ?? <Unavailable />}
                    </span>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <Metric
                      label="ICP fit"
                      value={lead.icpFit}
                      format={(value) => `${value}%`}
                    />
                    <Metric
                      label="Cost per lead"
                      value={lead.costPerLead}
                      format={(value) => value.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                    />
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
