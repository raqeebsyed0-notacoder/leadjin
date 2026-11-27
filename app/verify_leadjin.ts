// LEADJIN provider-layer live verification (two modes).
const mode = process.argv[2] || 'local';
const cap = mode === 'overbudget' ? '0.02' : '5';
process.env.LEADJIN_MONTHLY_CAP_USD = cap;
process.env.LEADJIN_PROVIDER = mode === 'overbudget' ? 'gateway' : 'ollama';

import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
const { getGenAI } = await import('./src/services/genaiClient.js');

const LEDGER = '/home/euphoria/euphoria-v2/work/leadjin/app/.leadjin/provider-ledger.json';
if (mode === 'overbudget') {
  const hermesEnv = readFileSync('/home/euphoria/euphoria-v2/.hermes/.env', 'utf8');
  const m = hermesEnv.match(/^API_SERVER_KEY=(.+)$/m);
  if (m) process.env.API_SERVER_KEY = m[1];
  const ledger = {
    version: 1,
    month: new Date().toISOString().slice(0, 7),
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCostUsd: 0.0199,
    entries: [],
    updatedAt: new Date().toISOString(),
  };
  mkdirSync('/home/euphoria/euphoria-v2/work/leadjin/app/.leadjin', { recursive: true });
  writeFileSync(LEDGER, JSON.stringify(ledger, null, 2) + '\n');
  console.log('[overbudget] pre-charged ledger totalCostUsd=0.0199 (cap 0.02)');
}

const r = await getGenAI().models.generateContent({
  model: 'gemini-2.5-flash',
  contents: 'Reply with a single word: VERIFIED',
});

console.log(`=== MODE=${mode} (cap=${process.env.LEADJIN_MONTHLY_CAP_USD}, provider=${process.env.LEADJIN_PROVIDER}) ===`);
console.log('response.text:', r.text);
const ok = mode === 'overbudget'
  ? r.text.includes('cloud call refused')
  : r.text === 'VERIFIED';
console.log('verification:', ok ? 'PASS' : 'FAIL');
process.exit(ok ? 0 : 1);
