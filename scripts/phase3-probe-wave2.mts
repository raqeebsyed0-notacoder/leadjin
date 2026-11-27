/** Phase 3 wave-2 verification: engines availability, Jin tool router, verification table. */
import { engineAvailability } from '../src/services/legacyEngines.js';
import { dispatchJinCommand } from '../src/services/jinTools.js';

async function main() {
  const out: any = {};
  try {
    out.engines = await engineAvailability();
  } catch (e: any) {
    out.engines_error = String(e?.message ?? e);
  }

  const db: any = null;
  try {
    out.chat_plain = await dispatchJinCommand('hello, how are you?', { db });
  } catch (e: any) {
    out.chat_plain_error = String(e?.message ?? e);
  }
  try {
    const r: any = await dispatchJinCommand('find 2 real estate leads in Riyadh', { db });
    out.discover = r ? { tool: r.tool, ok: r.ok, summary: String(r.summary).slice(0, 160), count: Array.isArray(r.data?.leads) ? r.data.leads.length : null } : null;
  } catch (e: any) {
    out.discover_error = String(e?.message ?? e);
  }
  console.log(JSON.stringify(out, null, 2));
  process.exit(0);
}

main();
