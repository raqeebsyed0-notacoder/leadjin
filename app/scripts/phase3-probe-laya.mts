/**
 * Phase 3 — application-level Laya probe.
 * Imports the app's own contract (src/services/layaDecision.ts) and prints real decisions.
 * Run: npx tsx scripts/phase3-probe-laya.mts
 */
import { decide, LayaUnavailableError } from '../src/services/layaDecision.js';

const cases = [
  { kind: 'choice' as const, context: 'Thanks for reaching out. Can you send pricing and a demo slot next week?', options: ['interested', 'not_now', 'unsubscribe', 'out_of_office'] },
  { kind: 'noul' as const, context: 'Please remove me from your list and stop contacting me.', options: [] },
  { kind: 'score' as const, context: 'Opened 3 emails, clicked pricing twice, asked for a demo.', options: ['0: cold', '1: lukewarm', '2: warm', '3: hot'] },
];

async function main() {
  const out: any = { cases: [] };
  for (const c of cases) {
    try {
      const r = await decide(c);
      out.cases.push({ kind: c.kind, ...r, raw_seconds: (r.raw as any)?.seconds, calibrated: (r.raw as any)?.calibrated });
    } catch (err: any) {
      out.cases.push({
        kind: c.kind,
        error: err instanceof LayaUnavailableError ? `${err.name}[${err.cause}]: ${err.message}` : String(err),
      });
    }
  }
  console.log(JSON.stringify(out, null, 2));
  const ok = out.cases.filter((c: any) => !c.error).length;
  process.exit(ok === cases.length ? 0 : 1);
}

main();
