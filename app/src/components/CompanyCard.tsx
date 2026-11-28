/** CompanyCard.tsx -- F2 presentational card.

 * Props-driven component for the company interview (src/services/
 * companyInterview.ts). Displays a completed CompanyCard, one source
 * badge per field, and an edit affordance. No data fetching, no network
 * calls -- pure UI.
 *
 * RTL-safe: layout relies on `dir` inherited from the nearest ancestor,
 * no hardcoded left/right, no colour literals -- every colour is a CSS
 * class.
 */

import React from 'react';
import type {
  CompanyCard as InterviewCard,
  FieldKey,
  SourceTag,
} from '../services/companyInterview.js';
import { i18n } from '../services/i18n';

/** Ordered metadata describing each field rendered on the card. */
interface FieldDef {
  key: FieldKey;
  label: string;
}

const FIELD_DEFS: readonly FieldDef[] = [
  { key: 'company', label: 'company' },
  { key: 'cr', label: 'companyCrNumber' },
  { key: 'website', label: 'website' },
  { key: 'sector', label: 'companySector' },
  { key: 'city', label: 'companyCity' },
  { key: 'size', label: 'companySizeLabel' },
  { key: 'sells', label: 'companySells' },
  { key: 'sells_to', label: 'companySellsTo' },
];

interface CompanyCardProps {
  /** The completed card built by companyInterview.ts. */
  card: InterviewCard;
  /** Called when the user edits a field: (field, newValue). */
  onEdit: (field: FieldKey, value: string) => void;
  /** Whether the edit affordance is shown on each field. */
  editable?: boolean;
}

/** CSS classes for the source badge of each tag. Colours live in classes. */
function badgeClasses(tag: SourceTag): string {
  switch (tag) {
    case 'stated':
      return 'bg-emerald-50 text-emerald-700';
    case 'website':
      return 'bg-blue-50 text-blue-700';
    case 'cr':
      return 'bg-violet-50 text-violet-700';
    case 'inferred':
      return 'bg-amber-50 text-amber-700';
    default:
      return 'bg-zinc-100 text-zinc-600';
  }
}

const SOURCE_KEYS: Record<SourceTag, string> = {
  stated: 'sourceStated',
  website: 'sourceWebsite',
  cr: 'sourceCr',
  inferred: 'sourceInferred',
};

/** Small inline badge describing where a field's value came from. */
function SourceBadge({ tag }: { tag: SourceTag }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${badgeClasses(tag)}`}
    >
      {i18n.t(SOURCE_KEYS[tag])}
    </span>
  );
}

/** Editable company card, driven entirely by props. */
export const CompanyCard: React.FC<CompanyCardProps> = ({
  card,
  onEdit,
  editable = true,
}) => {
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-5">
      <header className="mb-4">
        <h2 className="text-lg font-semibold text-zinc-900">{i18n.t('companyCardTitle')}</h2>
        <p className="text-sm text-zinc-500">
          {i18n.t('companyCardHelp')}
        </p>
      </header>

      <dl className="space-y-4">
        {FIELD_DEFS.map((def) => (
          <div key={def.key} className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <dt className="text-sm font-medium text-zinc-900">{i18n.t(def.label)}</dt>
              <dd className="mt-0.5 text-sm text-zinc-600">
                {card[def.key] ?? '—'}
              </dd>
            </div>

            {editable && (
              <button
                type="button"
                onClick={() => onEdit(def.key, card[def.key] ?? '')}
                className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
                aria-label={`${i18n.t('edit')} ${i18n.t(def.label)}`}
              >
                <svg
                  className="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M11 5h6a2 2 0 012 2v6m-6-2l6 6m0-6l-6 6"
                  />
                </svg>
              </button>
            )}

            <div className="mt-1.5 flex flex-wrap justify-start gap-1.5">
              <SourceBadge tag={card.field_sources[def.key]} />
            </div>
          </div>
        ))}
      </dl>
    </section>
  );
};

export default CompanyCard;
