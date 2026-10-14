/**
 * email-ladder.test.ts — CI guard for the verification ladder safety rules.
 *
 * Rules under test:
 *   1. A syntactically-bad email must return status 'invalid_syntax'.
 *   2. A guessed email (isGuessed=true) MUST NEVER reach 'verified' or 'probable'.
 *
 * These are offline tests (doLiveSmtp=false) — no SMTP connections opened.
 * Timeout is generous to allow for DNS MX lookups in CI environments.
 */

import { describe, it, expect } from 'vitest';
import { verifyEmailLadder } from '../src/services/emailVerifier.js';

describe('verifyEmailLadder — safety invariants', () => {
  it('returns invalid_syntax for a syntactically-bad email', async () => {
    const result = await verifyEmailLadder('not-an-email', false, false);
    expect(result.status).toBe('invalid_syntax');
  });

  it('a guessed email (isGuessed=true) never reaches verified or probable', async () => {
    // thisdomaindoesnotexist-leadjin-test.invalid will fail DNS fast
    const result = await verifyEmailLadder(
      'first.last@thisdomaindoesnotexist-leadjin-test.invalid',
      true,
      false,
    );
    expect(result.status).not.toBe('verified');
    expect(result.status).not.toBe('probable');
  }, 15_000); // 15s to allow for DNS timeout

  it('a guessed email on a real MX domain is clamped to at most mx_ok', async () => {
    // google.com has MX — the clamp must prevent reaching 'probable' or 'verified'
    const result = await verifyEmailLadder('john.doe@google.com', true, false);
    expect(['mx_ok', 'unverified', 'invalid_syntax']).toContain(result.status);
    expect(result.status).not.toBe('verified');
    expect(result.status).not.toBe('probable');
  }, 15_000);
});
