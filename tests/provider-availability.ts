/**
 * Provider availability gate for AI-backed tests.
 *
 * Extends the repo's existing `const HAS_AI_KEY = !!(process.env.GEMINI_API_KEY
 * || process.env.GOOGLE_API_KEY); it.skipIf(!HAS_AI_KEY)(...)` convention into a
 * shared helper, so every AI-backed test gates on the same definition.
 *
 * Do NOT gate the artisan 3.7 / 4.4 / 4.6 / 4.7 / 4.8 / 5.2 / 5.4 / 5.6 tests
 * with this helper. They were observed failing in CI with fresh-DB schema
 * errors ("no such column: last_contacted_at / reply_category /
 * interaction_history / outreach_status / gemini_api_key"), not with a missing
 * model key. Adding all eight to skipIf(!HAS_AI_KEY) would hide a real server
 * fault. They must run in CI; server.ts fixes their root cause.
 */
export type AiProvider = 'gemini' | 'google';

const KEY_ENV: Record<AiProvider, readonly string[]> = {
  gemini: ['GEMINI_API_KEY'],
  google: ['GOOGLE_API_KEY'],
};

/** True when at least one of the named AI providers has a configured key. */
export function hasProvider(...providers: AiProvider[]): boolean {
  const requested: readonly AiProvider[] = providers.length ? providers : ['gemini', 'google'];
  return requested.some((provider) => KEY_ENV[provider].some((key) => !!process.env[key]));
}

export const HAS_AI_KEY = hasProvider();
