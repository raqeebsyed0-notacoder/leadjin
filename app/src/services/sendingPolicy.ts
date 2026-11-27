/**
 * sendingPolicy.ts — F6 sending policy for LeadJin autopilot v1.
 *
 * Pure module: no network, no DNS lookup, no DB, no env reads, no secrets.
 * Every gate is either injected by the caller (DNS results, consent decision)
 * or derived from arguments. Nothing here may be used to invent a contact,
 * a consent record, or a metric.
 *
 * Loaded skill before authoring: omh-backend (backend service contract).
 */

export type TouchKind = 'intro' | 'followup' | 'closing';

/** One outbound touch. Copy is bilingual; Arabic is the primary audience. */
export interface Touch {
  index: number;
  kind: TouchKind;
  /** Day offset from the first touch. */
  day: number;
  subjectAr: string;
  subjectEn: string;
  bodyAr: string;
  bodyEn: string;
  /** Day 0 intro is introduction only — must be false. */
  hasPitch: boolean;
  /** Closing mail states we will not write again. */
  isClosing: boolean;
}

export const MAX_TOUCHES = 3;
export const CLOSING_STATEMENT_AR = 'لن نكتب لكم مرة أخرى';

/**
 * D2 cadence: exactly three touches. Day 0 intro (no pitch), day 3 follow-up,
 * day 5 closing mail that states we will not write again.
 */
export function cadence(): Touch[] {
  return [
    {
      index: 0,
      kind: 'intro',
      day: 0,
      subjectAr: 'تحية طيبة من فريقنا',
      subjectEn: 'A short introduction',
      bodyAr: 'السلام عليكم، اسمحوا لنا بتقديم أنفسنا. يسعدنا التواصل للتعارف فقط.',
      bodyEn: 'Assalamu alaikum. We are writing only to introduce ourselves and say hello.',
      hasPitch: false,
      isClosing: false,
    },
    {
      index: 1,
      kind: 'followup',
      day: 3,
      subjectAr: 'متابعة رسالتنا',
      subjectEn: 'Following up on our note',
      bodyAr: 'السلام عليكم، نتابع رسالتنا للتعارف. هل تودون الاستمرار في التواصل؟',
      bodyEn: 'Hello again. We are following up on our introduction. Would you like to continue the conversation?',
      hasPitch: true,
      isClosing: false,
    },
    {
      index: 2,
      kind: 'closing',
      day: 5,
      subjectAr: 'وداع وخلاص رسالتنا',
      subjectEn: 'Closing our correspondence',
      bodyAr: `السلام عليكم، شكراً لوقتكم. ${CLOSING_STATEMENT_AR}. نتمنى لكم كل التوفيق.`,
      bodyEn: 'Thank you for your time. We will not write to you again. We wish you well.',
      hasPitch: false,
      isClosing: true,
    },
  ];
}

export type NextTouchReason = 'cadence_exhausted';

export interface NextTouchResult {
  touch: Touch | null;
  /** Present only when the cadence is exhausted. */
  reason?: NextTouchReason;
}

/**
 * Find the next touch from the number already sent. The fourth attempt and
 * every out-of-range input return { touch: null, reason: 'cadence_exhausted' }.
 * No input can produce a fourth touch.
 */
export function nextTouch(touchesSent: number): NextTouchResult {
  const touches = cadence();
  if (!Number.isFinite(touchesSent)) {
    return { touch: null, reason: 'cadence_exhausted' };
  }
  const index = Math.floor(touchesSent);
  if (index < 0 || index >= MAX_TOUCHES) {
    return { touch: null, reason: 'cadence_exhausted' };
  }
  const touch = touches[index] ?? null;
  return touch === null ? { touch: null, reason: 'cadence_exhausted' } : { touch };
}

export interface SenderIdentity {
  name: string;
  company: string;
  /** Commercial registration number. */
  cr: string;
}

export type ConsentDecision = boolean | { allowed: boolean; reason?: string };
export type ConsentCheck = (touch: Touch, ctx: RenderContext) => ConsentDecision;

export interface RenderContext {
  /** Required. Rendering refuses unless this returns allowed. */
  consent_check?: ConsentCheck;
  identity: SenderIdentity;
  optOutUrl: string;
  recipientName?: string;
  locale?: 'ar' | 'en';
}

export interface RenderedTouch {
  subject: string;
  html: string;
  text: string;
}

export class SendingPolicyError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'SendingPolicyError';
    this.code = code;
  }
}

function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Render one touch. The Arabic body is always emitted with dir="rtl"
 * lang="ar"; the footer always carries sender identity and a working opt-out.
 * Refuses (typed error) when consent_check is absent or returns not-allowed.
 */
export function renderTouch(touch: Touch, ctx: RenderContext): RenderedTouch {
  if (typeof ctx?.consent_check !== 'function') {
    throw new SendingPolicyError('consent_check_missing', 'renderTouch requires a consent_check callback');
  }

  const decision = ctx.consent_check(touch, ctx);
  const allowed = typeof decision === 'boolean' ? decision : !!decision && decision.allowed === true;
  if (!allowed) {
    const extra =
      typeof decision === 'object' && decision && decision.reason ? ` (${decision.reason})` : '';
    throw new SendingPolicyError('consent_not_allowed', `consent_check did not allow this touch${extra}`);
  }

  const identity = ctx.identity;
  if (!identity?.name || !identity.company || !identity.cr) {
    throw new SendingPolicyError(
      'identity_incomplete',
      'Sender identity (name, company, cr) is required on every touch',
    );
  }
  if (!ctx.optOutUrl) {
    throw new SendingPolicyError('optout_missing', 'A working opt-out URL is required on every touch');
  }

  const arabic = ctx.locale !== 'en';
  const subject = arabic ? touch.subjectAr : touch.subjectEn;
  const identityLine = `${identity.name} | ${identity.company} | CR ${identity.cr}`;
  const optOutLine = `To opt out, visit ${ctx.optOutUrl} or reply "stop".`;

  const html = [
    '<div class="lj-touch">',
    `<div class="lj-body lj-body-ar" dir="rtl" lang="ar">${escapeHtml(touch.bodyAr)}</div>`,
    `<div class="lj-body lj-body-en" dir="ltr" lang="en">${escapeHtml(touch.bodyEn)}</div>`,
    '<footer class="lj-footer">',
    `<div class="lj-identity">${escapeHtml(identityLine)}</div>`,
    `<div class="lj-optout"><a href="${escapeHtml(ctx.optOutUrl)}">Unsubscribe / إلغاء الاشتراك</a> — ${escapeHtml(optOutLine)}</div>`,
    '</footer>',
    '</div>',
  ].join('\n');

  const text = [subject, touch.bodyAr, touch.bodyEn, '', identityLine, optOutLine].join('\n');
  return { subject, html, text };
}

export interface DnsResults {
  spf: boolean;
  dkim: boolean;
  dmarc: boolean;
}

export interface DeliverabilityResult extends DnsResults {
  blockSend: boolean;
}

/**
 * Pure deliverability check over injected DNS results. Accepts either a single
 * DnsResults record or a map keyed by domain. Missing input degrades to
 * blockSend: true — it never assumes a passing record.
 */
export function deliverabilityCheck(
  domain: string,
  dns: DnsResults | Record<string, DnsResults>,
): DeliverabilityResult {
  let record: DnsResults | undefined;
  const candidate = dns as Partial<DnsResults> | undefined;
  if (
    candidate &&
    typeof candidate.spf === 'boolean' &&
    typeof candidate.dkim === 'boolean' &&
    typeof candidate.dmarc === 'boolean'
  ) {
    record = candidate as DnsResults;
  } else if (dns && domain) {
    record = (dns as Record<string, DnsResults>)[domain];
  }

  const spf = record?.spf === true;
  const dkim = record?.dkim === true;
  const dmarc = record?.dmarc === true;
  return { spf, dkim, dmarc, blockSend: !(spf && dkim && dmarc) };
}

export const BOUNCE_RATE_CEILING = 0.005;
export const COMPLAINT_RATE_CEILING = 0.001;

export interface SendingMetrics {
  bounce_rate: number;
  complaint_rate: number;
}

export interface CeilingsResult {
  ok: boolean;
  failures: string[];
}

/** Strict ceilings: bounce_rate < 0.005 and complaint_rate < 0.001. */
export function withinCeilings(metrics: SendingMetrics): CeilingsResult {
  const failures: string[] = [];
  const bounce = metrics?.bounce_rate;
  const complaint = metrics?.complaint_rate;
  if (!(typeof bounce === 'number' && Number.isFinite(bounce) && bounce >= 0 && bounce < BOUNCE_RATE_CEILING)) {
    failures.push('bounce_rate');
  }
  if (!(
    typeof complaint === 'number' &&
    Number.isFinite(complaint) &&
    complaint >= 0 &&
    complaint < COMPLAINT_RATE_CEILING
  )) {
    failures.push('complaint_rate');
  }
  return { ok: failures.length === 0, failures };
}

/** Daily ceilings for warmup days 1..5, then the hard ceiling applies. */
export const WARMUP_DAILY_CEILINGS: readonly number[] = [10, 20, 30, 40, 50];
export const WARMUP_HARD_CEILING = 50;

export interface WarmupState {
  day: number;
  sentToday: number;
  dailyCeiling: number;
  remaining: number;
  /** True when another send is permitted right now. */
  allowed: boolean;
  /** True when no send is permitted (ceiling reached or warmup not started). */
  hardStop: boolean;
  reason?: string;
}

/** Warmup state machine: ramped daily ceilings plus a hard stop. */
export function warmupState(sentToday: number, day: number): WarmupState {
  const safeSent = Number.isFinite(sentToday) && sentToday > 0 ? Math.floor(sentToday) : 0;
  const safeDay = Number.isFinite(day) ? Math.floor(day) : 0;

  if (safeDay < 1) {
    return {
      day: safeDay,
      sentToday: safeSent,
      dailyCeiling: 0,
      remaining: 0,
      allowed: false,
      hardStop: true,
      reason: 'warmup_not_started',
    };
  }

  const index = Math.min(safeDay, WARMUP_DAILY_CEILINGS.length) - 1;
  const dailyCeiling = WARMUP_DAILY_CEILINGS[index] ?? WARMUP_HARD_CEILING;
  const remaining = Math.max(0, dailyCeiling - safeSent);
  const hardStop = safeSent >= dailyCeiling || safeSent >= WARMUP_HARD_CEILING;

  return {
    day: safeDay,
    sentToday: safeSent,
    dailyCeiling,
    remaining,
    allowed: !hardStop,
    hardStop,
    reason: hardStop ? 'daily_ceiling_reached' : undefined,
  };
}
