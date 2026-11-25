/**
 * JinWorkingPane — live "Jin is working" pane.
 *
 * Subscribes with EventSource to the hunt progress feed at
 * /api/jin/hunt/stream and renders the stream.ts event vocabulary as a
 * compact progress pane, mounted beside the chat-only JinEmployeeDashboard.
 *
 * Event vocabulary (src/services/stream.ts), one SSE listener per STREAM_KINDS:
 *   start  -> reset the run and set the label
 *   step   -> append a completed phase to the log
 *   progress -> update the clamped percentage and detail label
 *   done   -> finish (100% on ok), error -> retryable alert
 *
 * Palette: only --app-* tokens and their opacities. No new hue, no logo
 * change. A missing/absent endpoint degrades quietly to an offline state;
 * it never throws and never renders raw JSON into the pane.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, Bot, Loader2, RotateCcw, X } from 'lucide-react';
import { STREAM_KINDS, type StreamEvent } from '../services/stream';

type Language = 'en' | 'ar';

export interface JinWorkingPaneProps {
  authToken: string;
  language?: Language;
}

type Connection = 'connecting' | 'live' | 'offline';
type Status = 'idle' | 'working' | 'done' | 'failed' | 'error';

type Step = { id: number; step: number; total?: number; label: string };

type HuntView = {
  status: Status;
  runId: string | null;
  name: string;
  label: string;
  progress: number | null;
  steps: Step[];
  message: string | null;
};

const EMPTY_VIEW: HuntView = {
  status: 'idle',
  runId: null,
  name: '',
  label: '',
  progress: null,
  steps: [],
  message: null,
};

const COPY = {
  en: {
    title: 'Jin is working',
    subtitle: 'Live hunt progress',
    open: 'Open Jin live progress',
    close: 'Close live progress',
    connecting: 'Connecting',
    live: 'Live',
    offline: 'Offline',
    idle: 'Waiting for the next hunt…',
    working: 'Jin is working…',
    done: 'Hunt complete',
    failed: 'Hunt finished with problems',
    errorTitle: 'Stream error',
    retry: 'Reconnect',
    step: 'Step',
    logTitle: 'Hunt log',
    emptyLog: 'Steps appear here as the hunt runs.',
  },
  ar: {
    title: 'جين يعمل الآن',
    subtitle: 'تقدم البحث المباشر',
    open: 'فتح تقدم جين المباشر',
    close: 'إغلاق التقدم المباشر',
    connecting: 'جاري الاتصال',
    live: 'مباشر',
    offline: 'غير متصل',
    idle: 'في انتظار البحث التالي…',
    working: 'جين يعمل الآن…',
    done: 'اكتمل البحث',
    failed: 'انتهى البحث مع وجود مشاكل',
    errorTitle: 'خطأ في البث',
    retry: 'إعادة الاتصال',
    step: 'خطوة',
    logTitle: 'سجل البحث',
    emptyLog: 'تظهر الخطوات هنا أثناء تشغيل البحث.',
  },
} as const;

/** Strip control characters and bound length: raw SSE/JSON never reaches the DOM. */
function safeText(raw: unknown, max = 500): string {
  return String(raw ?? '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .trim()
    .slice(0, max);
}

const JinWorkingPane: React.FC<JinWorkingPaneProps> = ({ authToken, language = 'en' }) => {
  const lang: Language = language === 'ar' ? 'ar' : 'en';
  const copy = COPY[lang];

  const [open, setOpen] = useState(true);
  const [connection, setConnection] = useState<Connection>('connecting');
  const [view, setView] = useState<HuntView>(EMPTY_VIEW);
  const [retryKey, setRetryKey] = useState(0);
  const stepId = useRef(0);

  const applyEvent = useCallback(
    (event: StreamEvent) => {
      switch (event.kind) {
        case 'start':
          stepId.current = 0;
          setView({
            status: 'working',
            runId: event.runId,
            name: safeText(event.name, 120),
            label: safeText(event.name, 120) || copy.working,
            progress: 0,
            steps: [],
            message: null,
          });
          break;
        case 'step': {
          const label = safeText(event.label, 120) || `${copy.step} ${event.step}`;
          stepId.current += 1;
          setView((prev) => ({
            ...prev,
            status: 'working',
            label,
            steps: [
              ...prev.steps,
              { id: stepId.current, step: event.step, total: event.total, label },
            ].slice(-20),
          }));
          break;
        }
        case 'progress':
          setView((prev) => ({
            ...prev,
            status: 'working',
            label: safeText(event.detail, 120) || prev.label || copy.working,
            progress: Math.max(0, Math.min(100, Math.round(event.progress))),
          }));
          break;
        case 'done':
          setView((prev) => ({
            ...prev,
            status: event.ok ? 'done' : 'failed',
            progress: event.ok ? 100 : prev.progress,
            label: safeText(event.result, 120) || (event.ok ? copy.done : copy.failed),
          }));
          break;
        case 'error':
          setView((prev) => ({
            ...prev,
            status: 'error',
            message: safeText(event.message || event.error),
          }));
          break;
      }
    },
    [copy.done, copy.failed, copy.step, copy.working]
  );

  useEffect(() => {
    if (!authToken || !open || typeof EventSource === 'undefined') {
      setConnection('offline');
      return;
    }

    let source: EventSource;
    try {
      // EventSource cannot set headers, so the scoped token travels in the
      // query string — the same pattern as the chat box. Base path is exact.
      source = new EventSource(
        `/api/jin/hunt/stream?token=${encodeURIComponent(authToken)}`
      );
    } catch {
      setConnection('offline');
      return;
    }
    setConnection('connecting');

    const onOpen = () => setConnection('live');
    const onEvent = (event: Event) => {
      try {
        applyEvent(JSON.parse((event as MessageEvent<string>).data) as StreamEvent);
      } catch {
        // malformed SSE payload — ignore; never leak raw JSON into the pane
      }
    };
    const onError = () => {
      setConnection('offline');
      source.close();
    };

    source.addEventListener('open', onOpen);
    STREAM_KINDS.forEach((kind) => source.addEventListener(kind, onEvent));
    source.addEventListener('error', onError);

    return () => {
      source.removeEventListener('open', onOpen);
      STREAM_KINDS.forEach((kind) => source.removeEventListener(kind, onEvent));
      source.removeEventListener('error', onError);
      source.close();
    };
  }, [applyEvent, authToken, open, retryKey]);

  const working = view.status === 'working';
  const statusLabel =
    connection === 'live'
      ? copy.live
      : connection === 'connecting'
        ? copy.connecting
        : copy.offline;

  // Reuse the existing Jin panel/launcher styling, flipped to the opposite
  // inline side so the pane sits beside (not on top of) the chat box.
  const sideStyle: React.CSSProperties = {
    insetInlineEnd: 'auto',
    insetInlineStart: '1rem',
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={copy.open}
        aria-expanded={false}
        className="jin-launcher"
        style={sideStyle}
      >
        <Bot size={18} aria-hidden="true" />
        <span>{copy.title}</span>
        {working && <span className="jin-launcher-dot" aria-hidden="true" />}
      </button>
    );
  }

  return (
    <section className="jin-panel glass" style={sideStyle} aria-label={copy.title}>
      <header className="jin-header">
        <div className="jin-header-id">
          <span className="jin-avatar" aria-hidden="true"><Bot size={16} /></span>
          <span className="jin-heading">
            <strong>{copy.title}</strong>
            <small>{copy.subtitle}</small>
          </span>
        </div>
        <div className="jin-header-actions">
          <span className={working ? 'jin-state is-working' : 'jin-state'}>
            <span className="jin-state-dot" aria-hidden="true" />
            {statusLabel}
          </span>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label={copy.close}
            className="jin-close"
          >
            <X size={15} aria-hidden="true" />
          </button>
        </div>
      </header>

      <div className="jin-working" role="status" aria-live="polite">
        {working && <Loader2 size={13} className="jin-spin" aria-hidden="true" />}
        <span>
          {view.status === 'idle'
            ? copy.idle
            : view.status === 'done'
              ? copy.done
              : view.status === 'failed'
                ? copy.failed
                : view.label || copy.working}
        </span>
        {view.progress !== null && working && (
          <span
            className="jin-progress"
            role="progressbar"
            aria-valuenow={view.progress}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={view.label || copy.working}
          >
            <span style={{ width: `${view.progress}%` }} />
          </span>
        )}
      </div>

      {view.status === 'error' && view.message && (
        <div className="jin-error" role="alert">
          <AlertCircle size={14} aria-hidden="true" />
          <span>{view.message}</span>
          <button
            type="button"
            onClick={() => setRetryKey((n) => n + 1)}
            className="jin-retry"
          >
            <RotateCcw size={12} aria-hidden="true" />
            {copy.retry}
          </button>
        </div>
      )}

      <div className="jin-transcript custom-scrollbar" role="log" aria-live="polite" aria-relevant="additions">
        {view.steps.length === 0 ? (
          <div className="jin-empty">
            <p>{copy.emptyLog}</p>
          </div>
        ) : (
          view.steps.map((step) => (
            <div key={step.id} className="jin-row is-assistant">
              <div className="jin-bubble">
                <span className="text-app-accent text-[9px] font-mono uppercase tracking-widest">
                  {step.total ? `${step.step}/${step.total}` : `${copy.step} ${step.step}`}
                </span>
                <div className="jin-prose">{step.label}</div>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
};

export { JinWorkingPane };
export default JinWorkingPane;
