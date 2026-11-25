/**
 * Jin chat message renderer
 *
 * Renders raw Jin chat content as clean prose (FE-5):
 *  - escapes HTML first so embedded markup is never displayed as markup
 *  - maps common Markdown into tokens: paragraphs, bullet lists, bold, inline code
 *  - preserves line breaks
 *
 * Safe by construction: no dangerouslySetInnerHTML; escaped content is rendered
 * as React nodes only.
 */
import type { ReactNode } from 'react';

export function renderJinContent(content: string): ReactNode {
  // Escape HTML before any rendering (prevents embedded markup from leaking through)
  const escaped = content
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Split into blocks on blank lines
  const blocks = escaped.split(/\n\s*\n/);

  return blocks.map((block, bi) => {
    const lines = block.split('\n');
    const nonEmpty = lines.filter((l) => l.trim().length > 0);

    // Unordered list: every non-empty line starts with '- '
    const isList = nonEmpty.length > 0 && nonEmpty.every((l) => l.trim().startsWith('- '));
    if (isList) {
      return (
        <ul key={bi} className="space-y-1 list-disc list-inside">
          {nonEmpty.map((l, i) => (
            <li key={i} className="text-sm leading-relaxed">
              {l.replace(/^- /, '').trim()}
            </li>
          ))}
        </ul>
      );
    }

    // Multi-line block -> one <p> per line (clean prose, not raw text)
    if (nonEmpty.length > 1) {
      return (
        <div key={bi} className="space-y-1">
          {nonEmpty.map((l, i) => (
            <p key={i} className="text-sm leading-relaxed">
              {l}
            </p>
          ))}
        </div>
      );
    }

    // Single line -> inline token processing (**bold**, `code`)
    return (
      <div key={bi} className="text-sm leading-relaxed">
        {parseInline(nonEmpty[0] || '')}
      </div>
    );
  });
}

function parseInline(text: string): ReactNode[] {
  // Keep **bold** and `inline code` tokens as separate elements
  const parts = text.split(/(\*\*[^*]+\*\*|\`(?:[^`]|\`)+\`)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return (
        <code key={i} className="rounded bg-app-border/60 px-1 py-0.5 font-mono text-[90%] leading-none">
          {part.slice(1, -1)}
        </code>
      );
    }
    return part;
  });
}
