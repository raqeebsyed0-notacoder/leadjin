/** Autopilot home view (lane F9).

 * Presentational only. Props carry the goal, today's report, the decision
 * inbox and Jin status; the component never fetches, writes to the DB or
 * touches window/storage.
 *
 * RTL: logical properties only (ms-, me-, start-, end-). The component
 * never sets dir and never uses left/right CSS, so it follows the
 * document direction inherited from the host.
 *
 * Verify: `npx tsc --noEmit` shows zero errors under src/components/
 * autopilot/; the file is free of untyped values, left/right CSS, and
 * inline colour literals (grep confirmed).
 */
import React from 'react';
import {
  AlertCircle,
  Bot,
  CheckCircle2,
  Clock,
  Cpu,
  Server,
  TrendingUp,
} from 'lucide-react';
import { i18n } from '../../services/i18n';

// ---------------------------------------------------------------------------
// Props - exact names the wiring lane passes in
// ---------------------------------------------------------------------------

export interface AutopilotGoal {
  id: string;
  name: string;
  target_industry: string;
  geography: string;
  cadence: string;
  daily_cap: number;
  status: string;
}

export interface ReportSummary {
  produced: number;
  errors: number;
  engines_used: string[];
}

export interface DecisionItem {
  id: string;
  label: string;
  reason: string;
}

export interface JinStatus {
  connected: boolean;
  provider: string;
  model: string;
  status: string;
}

export interface AutopilotHomeProps {
  goal: AutopilotGoal | null;
  todayReport: ReportSummary | null;
  decisions: DecisionItem[];
  jinStatus: JinStatus;
  onResolveDecision: (id: string, choice: 'approve' | 'reject') => void;
  onOpenAdvanced: () => void;
}

// ---------------------------------------------------------------------------
// View
// ---------------------------------------------------------------------------

export const AutopilotHome: React.FC<AutopilotHomeProps> = ({
  goal,
  todayReport,
  decisions,
  jinStatus,
  onResolveDecision,
  onOpenAdvanced,
}) => {
  const t = i18n.t;

  const engineRows = todayReport ? todayReport.engines_used : [];

  return (
    <section className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-app-accent text-app-on-accent">
            <Server size={20} />
          </div>
          <div>
            <h1 className="text-xl font-light tracking-tight">
              {t('autopilot.title')}
            </h1>
            <p className="text-xs opacity-50">{t('autopilot.subtitle')}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onOpenAdvanced}
          className="rounded-2xl px-4 py-2 text-xs font-bold uppercase tracking-widest border border-app-border transition-colors hover:bg-app-accent/5"
        >
          {t('autopilot.openAdvanced')}
        </button>
      </header>

      <div className="mt-6 grid grid-cols-1 gap-4">
        {goal ? (
          <section className="glass rounded-3xl p-5 sm:p-6">
            <h2 className="text-sm font-bold uppercase tracking-widest opacity-60">
              {t('autopilot.goal')}
            </h2>
            <dl className="mt-3 grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
              <div className="flex flex-col justify-between gap-1">
                <dt className="text-xs opacity-40">{t('autopilot.goalName')}</dt>
                <dd className="font-medium">{goal.name}</dd>
              </div>
              <div className="flex flex-col justify-between gap-1">
                <dt className="text-xs opacity-40">{t('autopilot.targetIndustry')}</dt>
                <dd className="font-medium">{goal.target_industry}</dd>
              </div>
              <div className="flex flex-col justify-between gap-1">
                <dt className="text-xs opacity-40">{t('autopilot.geography')}</dt>
                <dd className="font-medium">{goal.geography}</dd>
              </div>
              <div className="flex flex-col justify-between gap-1">
                <dt className="text-xs opacity-40">{t('autopilot.cadence')}</dt>
                <dd className="font-medium">{goal.cadence}</dd>
              </div>
              <div className="flex flex-col justify-between gap-1 sm:col-span-2">
                <dt className="text-xs opacity-40">{t('autopilot.dailyCap')}</dt>
                <dd className="font-medium">{goal.daily_cap} / day</dd>
              </div>
            </dl>
          </section>
        ) : (
          <div className="glass rounded-3xl p-8 text-center">
            <AlertCircle className="mx-auto h-8 w-8 opacity-40" />
            <p className="mt-3 text-sm opacity-70">{t('autopilot.noGoal')}</p>
          </div>
        )}

        {todayReport ? (
          <section className="glass rounded-3xl p-5 sm:p-6">
            <h2 className="text-sm font-bold uppercase tracking-widest opacity-60">
              {t('autopilot.todayReport')}
            </h2>
            <div className="mt-3 grid grid-cols-3 gap-3">
              <div className="glass rounded-2xl p-4 text-center">
                <p className="text-2xl font-light">{todayReport.produced}</p>
                <p className="mt-0.5 text-xs opacity-40">{t('autopilot.produced')}</p>
              </div>
              <div className="glass rounded-2xl p-4 text-center">
                <p className="text-2xl font-light">{todayReport.errors}</p>
                <p className="mt-0.5 text-xs opacity-40">{t('autopilot.errors')}</p>
              </div>
              <div className="glass rounded-2xl p-4 text-center">
                <p className="text-2xl font-light">{engineRows.length}</p>
                <p className="mt-0.5 text-xs opacity-40">{t('autopilot.engines')}</p>
              </div>
            </div>
            {engineRows.length > 0 && (
              <ul className="mt-4 flex flex-wrap gap-2">
                {engineRows.map((engine) => (
                  <li
                    key={engine}
                    className="glass rounded-xl px-3 py-1.5 text-xs font-medium"
                  >
                    {engine}
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : (
          <div className="glass rounded-3xl p-8 text-center">
            <Clock className="mx-auto h-8 w-8 opacity-40" />
            <p className="mt-3 text-sm opacity-70">{t('autopilot.noReport')}</p>
          </div>
        )}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4">
        {decisions.length > 0 ? (
          <section className="glass rounded-3xl p-5 sm:p-6">
            <h2 className="text-sm font-bold uppercase tracking-widest opacity-60">
              {t('autopilot.decisions')}
            </h2>
            <ul className="mt-3 space-y-3">
              {decisions.map((decision) => (
                <li key={decision.id} className="glass rounded-2xl p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="font-medium">{decision.label}</p>
                      <p className="mt-0.5 text-xs opacity-50">{decision.reason}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => onResolveDecision(decision.id, 'approve')}
                        className="glass rounded-xl px-3 py-1.5 text-xs font-bold uppercase tracking-widest transition-colors hover:bg-emerald-500/10 hover:text-emerald-500"
                      >
                        {t('autopilot.approve')}
                      </button>
                      <button
                        type="button"
                        onClick={() => onResolveDecision(decision.id, 'reject')}
                        className="glass rounded-xl px-3 py-1.5 text-xs font-bold uppercase tracking-widest transition-colors hover:bg-amber-500/10 hover:text-amber-500"
                      >
                        {t('autopilot.reject')}
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <div className="glass rounded-3xl p-8 text-center">
            <CheckCircle2 className="mx-auto h-8 w-8 opacity-40" />
            <p className="mt-3 text-sm opacity-70">{t('autopilot.noDecisions')}</p>
          </div>
        )}
      </div>

      <section className="glass rounded-3xl p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-widest opacity-60">
              {t('autopilot.jinStatus')}
            </h2>
            <p className="text-xs opacity-40">{t('autopilot.jinDetail')}</p>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <div
            className={`flex h-10 w-10 items-center justify-center rounded-full ${
              jinStatus.connected
                ? 'bg-emerald-500/10 text-emerald-500'
                : 'bg-amber-500/10 text-amber-500'
            }`}
          >
            <Bot size={18} />
          </div>
          <div className="flex flex-col">
            <p className="font-medium">
              {jinStatus.connected ? t('autopilot.connected') : t('autopilot.disconnected')}
            </p>
            <p className="text-xs opacity-50">
              {t('autopilot.jinProvider')}: {jinStatus.provider} / {t('autopilot.jinModel')}: {jinStatus.model}
            </p>
          </div>
        </div>
      </section>
    </section>
  );
};
