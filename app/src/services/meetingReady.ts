/**
 * meetingReady.ts — the "Meeting Ready" trigger.
 *
 * Spec (LEADJIN_SYSTEM_SPEC.md, Pillar 6): a lead becomes "Meeting Ready" when
 * its lead score reaches a high threshold. The calendar booking flow in the UI
 * keys off this flag.
 *
 * Keep the threshold in one place so server routes, sync and score
 * recalculation cannot drift apart.
 */

export const MEETING_READY_THRESHOLD = 80;

/** 1 when the lead score meets the meeting-ready threshold, otherwise 0. */
export function computeMeetingReady(lead: { lead_score?: number | null } | null | undefined): 0 | 1 {
  const score = lead?.lead_score;
  return typeof score === 'number' && score >= MEETING_READY_THRESHOLD ? 1 : 0;
}

/** True when a raw score meets the meeting-ready threshold. */
export function isMeetingReadyScore(score: number | null | undefined): boolean {
  return typeof score === 'number' && score >= MEETING_READY_THRESHOLD;
}
