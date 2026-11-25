/**
 * Jin — floating chat box (chat only).
 *
 * The six-tab employee dashboard is gone. What remains is one floating,
 * chat-only surface with four explicit states: idle (launcher), empty
 * (no messages yet), working (live progress) and error (retryable).
 *
 * Live progress consumes the stream.ts event vocabulary. In the browser the
 * bus is reached through the SSE endpoint; every `event:` name is one of
 * STREAM_KINDS and every `data:` payload is a StreamEvent. When that endpoint
 * is absent the chat round trip still drives the same working indicator.
 *
 * Palette: only --app-bg / --app-text / --app-accent / --app-surface /
 * --app-border and opacity of those tokens. No new hue, no logo changes.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, Bot, Loader2, RotateCcw, Send, X } from 'lucide-react';
import { STREAM_KINDS, type StreamEvent } from '../services/stream';
import { renderJinContent } from './JinMessageRenderer';

type Language = 'en' | 'ar';

interface JinDashboardProps {
  authToken: string;
  isOpen: boolean;
  onToggle: () => void;
  t?: any;
  language?: Language;
  companyProfile?: { name?: string; tagline?: string };
  targetIndustry?: string;
  majlisModeEnabled?: boolean;
}

type Message = {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  tone?: 'error';
};

type StreamState =
  | { kind: 'idle' }
  | { kind: 'working'; label: string; progress: number | null }
  | { kind: 'error'; message: string };

const COPY = {
  en: {
    open: 'Open Jin chat',
    close: 'Close chat',
    title: 'Jin',
    subtitle: 'Lead intelligence assistant',
    available: 'Available',
    working: 'Working',
    label: 'Message Jin',
    placeholder: 'Ask about your leads, outreach or pipeline…',
    send: 'Send',
    empty: 'Ask Jin a question to get started.',
    suggestion: 'Show me today’s highest-value leads',
    workingNow: 'Jin is working…',
    errorTitle: 'That request did not complete.',
    errorHint: 'Your message is still here. Try again.',
    retry: 'Retry',
    detailsSaved: 'Jin saved the structured details to your workspace.',
  },
  ar: {
    open: 'فتح محادثة جين',
    close: 'إغلاق المحادثة',
    title: 'جين',
    subtitle: 'مساعد ذكاء العملاء المحتملين',
    available: 'متاح',
    working: 'يعمل الآن',
    label: 'رسالة إلى جين',
    placeholder: 'اسأل عن العملاء أو التواصل أو خط الأنابيب…',
    send: 'إرسال',
    empty: 'اسأل جين سؤالاً للبدء.',
    suggestion: 'أرني أهم العملاء اليوم',
    workingNow: 'جين يعمل الآن…',
    errorTitle: 'لم يكتمل هذا الطلب.',
    errorHint: 'رسالتك ما زالت هنا. حاول مرة أخرى.',
    retry: 'إعادة المحاولة',
    detailsSaved: 'حفظ جين التفاصيل المنظمة في مساحة العمل.',
  },
} as const;

/** A fenced block or a bare JSON payload must never reach the transcript. */
function isStructured(text: string): boolean {
  const value = text.trim();
  if (!value) return false;
  if (/^```/.test(value)) return true;
  const wrapped =
    (value.startsWith('{') && value.endsWith('}')) ||
    (value.startsWith('[') && value.endsWith(']'));
  if (!wrapped) return false;
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
}

/** Renderable prose only: strip fences, inline code ticks and raw JSON. */
function cleanProse(raw: unknown, lang: Language): string {
  const fallback = COPY[lang].detailsSaved;
  const text = String(raw ?? '').replace(/\r/g, '');
  const withoutFences = text.replace(
    /```[a-z0-9_-]*\n?([\s\S]*?)```/gi,
    (_whole, body: string) => {
      const inner = String(body ?? '').trim();
      if (!inner) return '';
      return isStructured(inner) ? fallback : inner;
    }
  );
  return withoutFences
    .split('\n')
    .map((line) => (isStructured(line) ? fallback : line))
    .join('\n')
    .replace(/`+/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const JinEmployeeDashboard: React.FC<JinDashboardProps> = ({
  authToken,
  isOpen,
  onToggle,
  language = 'en',
}) => {
  const lang: Language = language === 'ar' ? 'ar' : 'en';
  const copy = COPY[lang];
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [stream, setStream] = useState<StreamState>({ kind: 'idle' });
  const [lastSent, setLastSent] = useState<string | null>(null);
  const nextId = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);

  const working = sending || stream.kind === 'working';
  const streamError = stream.kind === 'error' ? stream.message : null;
  const workingLabel =
    stream.kind === 'working' ? stream.label || copy.workingNow : copy.workingNow;
  const workingProgress = stream.kind === 'working' ? stream.progress : null;

  const append = useCallback((message: Omit<Message, 'id'>) => {
    nextId.current += 1;
    setMessages((prev) => [...prev, { ...message, id: nextId.current }]);
  }, []);

  const sendMessage = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || sending) return; // one submit in flight, guarded in the handler
      setSending(true);
      setLastSent(text);
      setDraft('');
      setStream({ kind: 'idle' });
      append({ role: 'user', content: cleanProse(text, lang) });

      try {
        const response = await fetch('/api/jin/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({ message: text }),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json().catch(() => ({}));
        append({
          role: 'assistant',
          content: cleanProse(data?.reply ?? copy.errorTitle, lang),
        });
      } catch {
        append({ role: 'assistant', content: copy.errorTitle, tone: 'error' });
      } finally {
        setSending(false);
        inputRef.current?.focus();
      }
    },
    [append, authToken, copy.errorTitle, lang, sending]
  );

  const retry = useCallback(() => {
    setStream({ kind: 'idle' });
    if (lastSent) void sendMessage(lastSent);
  }, [lastSent, sendMessage]);

  // stream.ts events arrive as SSE blocks named after STREAM_KINDS.
  const applyStreamEvent = useCallback(
    (event: StreamEvent) => {
      switch (event.kind) {
        case 'start':
          setStream({ kind: 'working', label: event.name || copy.workingNow, progress: 0 });
          break;
        case 'step': {
          const count = event.total ? `${event.step}/${event.total}` : `${event.step}`;
          setStream({
            kind: 'working',
            label: event.label ? `${event.label} · ${count}` : count,
            progress: null,
          });
          break;
        }
        case 'progress':
          setStream((prev) => ({
            kind: 'working',
            label: event.detail || (prev.kind === 'working' ? prev.label : copy.workingNow),
            progress: Math.max(0, Math.min(100, Math.round(event.progress))),
          }));
          break;
        case 'done':
          setStream({ kind: 'idle' });
          if (typeof event.result === 'string' && event.result.trim()) {
            append({ role: 'assistant', content: cleanProse(event.result, lang) });
          } else if (!event.ok) {
            append({ role: 'assistant', content: copy.errorTitle, tone: 'error' });
          }
          break;
        case 'error':
          setStream({ kind: 'error', message: cleanProse(event.message || event.error, lang) });
          break;
      }
    },
    [append, copy.errorTitle, copy.workingNow, lang]
  );

  useEffect(() => {
    if (!isOpen || !authToken || typeof EventSource === 'undefined') return;
    let source: EventSource;
    try {
      source = new EventSource(`/api/jin/stream?token=${encodeURIComponent(authToken)}`);
    } catch {
      return; // no stream endpoint — the chat round trip still shows working state
    }

    const onEvent = (event: MessageEvent<string>) => {
      try {
        applyStreamEvent(JSON.parse(event.data) as StreamEvent);
      } catch {
        // malformed SSE payload — ignore, never leak raw JSON into the transcript
      }
    };
    const onError = () => {
      // Endpoint absent or connection dropped: fall back to chat-only signalling.
      source.close();
    };

    STREAM_KINDS.forEach((kind) => source.addEventListener(kind, onEvent));
    source.addEventListener('error', onError);
    return () => {
      STREAM_KINDS.forEach((kind) => source.removeEventListener(kind, onEvent));
      source.removeEventListener('error', onError);
      source.close();
    };
  }, [applyStreamEvent, authToken, isOpen]);

  // Focus lands in the composer when the panel opens, back on the launcher when it closes.
  useEffect(() => {
    if (isOpen && !wasOpen.current) inputRef.current?.focus();
    if (!isOpen && wasOpen.current) launcherRef.current?.focus();
    wasOpen.current = isOpen;
  }, [isOpen]);

  if (!isOpen) {
    return (
      <button
        ref={launcherRef}
        type="button"
        onClick={onToggle}
        aria-label={copy.open}
        aria-expanded={false}
        className="jin-launcher"
      >
        <Bot size={18} aria-hidden="true" />
        <span>{copy.title}</span>
        {working && <span className="jin-launcher-dot" aria-hidden="true" />}
      </button>
    );
  }

  return (
    <section className="jin-panel glass" aria-label={copy.title}>
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
            {working ? copy.working : copy.available}
          </span>
          <button type="button" onClick={onToggle} aria-label={copy.close} className="jin-close">
            <X size={15} aria-hidden="true" />
          </button>
        </div>
      </header>

      {working && (
        <div className="jin-working" role="status" aria-live="polite">
          <Loader2 size={13} className="jin-spin" aria-hidden="true" />
          <span>{workingLabel}</span>
          {workingProgress !== null && (
            <span
              className="jin-progress"
              role="progressbar"
              aria-valuenow={workingProgress}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={workingLabel}
            >
              <span style={{ width: `${workingProgress}%` }} />
            </span>
          )}
        </div>
      )}

      {streamError && (
        <div className="jin-error" role="alert">
          <AlertCircle size={14} aria-hidden="true" />
          <span>{streamError}</span>
          <button type="button" onClick={retry} className="jin-retry">
            <RotateCcw size={12} aria-hidden="true" />
            {copy.retry}
          </button>
        </div>
      )}

      <div className="jin-transcript custom-scrollbar" role="log" aria-live="polite" aria-relevant="additions">
        {messages.length === 0 ? (
          <div className="jin-empty">
            <p>{copy.empty}</p>
            <button type="button" className="jin-suggestion" onClick={() => void sendMessage(copy.suggestion)}>
              {copy.suggestion}
            </button>
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={message.role === 'user' ? 'jin-row is-user' : 'jin-row is-assistant'}
            >
              <div className={message.tone === 'error' ? 'jin-bubble is-error' : 'jin-bubble'}>
                <div className="jin-prose">{renderJinContent(message.content)}</div>
              </div>
            </div>
          ))
        )}
      </div>

      <form
        className="jin-composer"
        onSubmit={(event) => {
          event.preventDefault(); // native form submit waits for IME composition
          void sendMessage(draft);
        }}
      >
        <label htmlFor="jin-input" className="sr-only">{copy.label}</label>
        <input
          id="jin-input"
          ref={inputRef}
          type="text"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={copy.placeholder}
          autoComplete="off"
          maxLength={2000}
        />
        <button type="submit" aria-disabled={!draft.trim() || sending} aria-label={copy.send}>
          {sending ? <Loader2 size={15} className="jin-spin" aria-hidden="true" /> : <Send size={15} aria-hidden="true" />}
        </button>
      </form>
    </section>
  );
};

export { JinEmployeeDashboard };
export default JinEmployeeDashboard;
