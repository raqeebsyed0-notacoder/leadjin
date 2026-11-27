/** Ask Jin chat dock (lane F9).

 * Presentational only. Props: open (visibility), messages (history),
 * onSend, onToggle, busy (input disabled while busy). Does not fetch.
 *
 * RTL: the dock inherits dir from the host document and uses logical
 * properties only. It never sets dir and never uses left/right CSS, so
 * it renders correctly in both directions.
 */
import React, { useState } from 'react';
import { Bot, Send } from 'lucide-react';
import { i18n } from '../../services/i18n';

export interface AskJinMessage {
  id: string;
  role: 'user' | 'jin';
  text: string;
  at?: string;
}

export interface AskJinDockProps {
  open: boolean;
  messages: AskJinMessage[];
  onSend: (text: string) => void;
  onToggle: () => void;
  busy: boolean;
}

export const AskJinDock: React.FC<AskJinDockProps> = ({
  open,
  messages,
  onSend,
  onToggle,
  busy,
}) => {
  const t = i18n.t;
  const [value, setValue] = useState('');

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = value.trim();
    if (trimmed.length === 0 || busy) return;
    onSend(trimmed);
    setValue('');
  };

  return (
    <div
      className={`fixed bottom-4 end-4 z-50 flex flex-col gap-3 ${
        open ? 'flex' : 'hidden'
      }`}
    >
      <div className="glass flex flex-col gap-2 rounded-3xl p-4 max-w-md">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 font-bold">
            <Bot size={16} />
            <span className="text-sm">{t('askjin.title')}</span>
          </div>
          <button
            type="button"
            onClick={onToggle}
            className="flex items-center gap-1 text-xs opacity-60 transition-opacity hover:opacity-100"
          >
            {t('askjin.toggle')}
          </button>
        </div>

        <div className="flex max-h-56 flex-1 flex-col gap-2 overflow-y-auto rounded-2xl p-2">
          {messages.length === 0 ? (
            <p className="text-xs opacity-40 text-center">{t('askjin.noMessages')}</p>
          ) : (
            messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${
                  message.role === 'user' ? 'justify-end' : 'justify-start'
                }`}
              >
                <div
                  className={`max-w-[80%] rounded-2xl px-3 py-2 text-xs ${
                    message.role === 'user'
                      ? 'bg-app-accent text-app-on-accent'
                      : 'bg-app-surface text-app-text'
                  }`}
                >
                  <p className="leading-relaxed">{message.text}</p>
                  {message.at ? (
                    <p className="mt-0.5 text-[10px] opacity-40">{message.at}</p>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </div>

        <form onSubmit={handleSubmit} className="flex flex-wrap gap-2">
          <input
            aria-label={t('askjin.inputLabel')}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder={t('askjin.placeholder')}
            disabled={busy}
            className="flex-1 min-w-0 glass rounded-2xl px-4 py-3 text-xs outline-none focus:border-app-accent transition-colors disabled:opacity-40"
          />
          <button
            type="submit"
            disabled={busy || value.trim().length === 0}
            className="flex items-center gap-1.5 rounded-2xl bg-app-accent px-4 py-3 text-xs font-bold text-app-on-accent transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Send size={14} />
            <span className="hidden sm:inline">{t('askjin.send')}</span>
          </button>
        </form>
      </div>
    </div>
  );
};
