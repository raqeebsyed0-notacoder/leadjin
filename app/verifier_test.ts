/**
 * verifier_test.ts — offline verification ladder test
 *
 * Tests three cases without opening any SMTP connections:
 *   (a) syntactically-bad email       → invalid_syntax
 *   (b) guessed email on real domain  → at most mx_ok, NEVER verified/probable
 *   (c) normal email on domain w/ MX → mx_ok
 *
 * Run with:  npx tsx verifier_test.ts
 */

import { verifyEmailLadder } from './src/services/emailVerifier.js';

interface TestCase {
  label: string;
  email: string;
  isGuessed: boolean;
  doLiveSmtp: boolean;
  forbiddenStatuses?: string[];
  expectedStatus?: string;
}

const cases: TestCase[] = [
  {
    label: '(a) bad syntax',
    email: 'not-an-email',
    isGuessed: false,
    doLiveSmtp: false,
    expectedStatus: 'invalid_syntax',
  },
  {
    label: '(b) guessed email on real domain — must NOT reach verified/probable',
    email: 'john.smith@gmail.com',
    isGuessed: true,
    doLiveSmtp: false,  // doLiveSmtp is irrelevant here: isGuessed clamps the ceiling
    forbiddenStatuses: ['verified', 'probable'],
  },
  {
    label: '(c) normal email on domain with MX records',
    email: 'test@gmail.com',
    isGuessed: false,
    doLiveSmtp: false,
    expectedStatus: 'mx_ok',
  },
];

async function main(): Promise<void> {
  console.log('=== verifier_test.ts — verification ladder offline test ===\n');

  let allPassed = true;

  for (const tc of cases) {
    const result = await verifyEmailLadder(tc.email, tc.isGuessed, tc.doLiveSmtp);

    let pass = true;
    const failures: string[] = [];

    if (tc.expectedStatus && result.status !== tc.expectedStatus) {
      pass = false;
      failures.push(`expected status '${tc.expectedStatus}', got '${result.status}'`);
    }
    if (tc.forbiddenStatuses) {
      for (const forbidden of tc.forbiddenStatuses) {
        if (result.status === forbidden) {
          pass = false;
          failures.push(`status must NOT be '${forbidden}' for a guessed email`);
        }
      }
    }

    const icon = pass ? '✓ PASS' : '✗ FAIL';
    console.log(`${icon}  ${tc.label}`);
    console.log(`       email:    ${result.email}`);
    console.log(`       status:   ${result.status}`);
    console.log(`       evidence: ${result.evidence}`);
    if (!pass) {
      for (const f of failures) {
        console.log(`       !! ${f}`);
      }
      allPassed = false;
    }
    console.log();
  }

  if (allPassed) {
    console.log('ALL TESTS PASSED — guessed email cannot reach "verified" or "probable".');
    process.exit(0);
  } else {
    console.error('ONE OR MORE TESTS FAILED.');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
