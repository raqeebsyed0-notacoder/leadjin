#!/usr/bin/env node
/**
 * import-production-history.mjs — CLI wrapper around dbTopology.ts.
 *
 * Default and explicit:  npx tsx scripts/import-production-history.mjs --dry-run
 * To actually write:     LEADJIN_ALLOW_PROD_IMPORT=1 npx tsx scripts/import-production-history.mjs --apply
 *
 * Dry run performs every SELECT and writes nothing. Apply additionally
 * requires LEADJIN_ALLOW_PROD_IMPORT=1 (enforced inside importProductionHistory).
 */
import { importProductionHistory } from '../src/services/dbTopology.ts';

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(
    JSON.stringify(
      {
        usage: 'npx tsx scripts/import-production-history.mjs [--dry-run | --apply] [--tables suppression_list,jin_chat_messages,email_templates,leads]',
        default: 'dry-run (writes nothing)',
        applyRequiresEnv: 'LEADJIN_ALLOW_PROD_IMPORT=1',
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

const apply = args.includes('--apply');
const dryRunRequested = args.includes('--dry-run');
if (apply && dryRunRequested) {
  console.error(JSON.stringify({ error: 'Choose --dry-run or --apply, not both.' }));
  process.exit(2);
}
const unknown = args.filter(
  (a) => !['--dry-run', '--apply', '--help', '-h'].includes(a) && !a.startsWith('--tables='),
);
if (unknown.length) {
  console.error(JSON.stringify({ error: `Unknown args: ${unknown.join(', ')}` }));
  process.exit(2);
}

let tables;
const tablesArg = args.find((a) => a.startsWith('--tables='));
if (tablesArg) {
  tables = tablesArg.slice('--tables='.length).split(',').map((s) => s.trim()).filter(Boolean);
}

const dryRun = !apply;
try {
  const result = importProductionHistory({ dryRun, ...(tables ? { tables } : {}) });
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
  process.exit(1);
}
