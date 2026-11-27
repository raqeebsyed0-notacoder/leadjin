// Live probe: Places path is wired into the hunt candidate discovery.
// Prints candidate names/domains only; never prints the API key.
import * as dotenv from 'dotenv';
dotenv.config();

import { discoverCompaniesViaPlaces } from './src/services/huntOrchestrator.js';

async function main(): Promise<void> {
  const result = await discoverCompaniesViaPlaces('software', 'Riyadh', 3);
  console.log('ERROR=' + String(result.error));
  console.log('COUNT=' + result.companies.length);
  for (const c of result.companies) {
    console.log('CANDIDATE=' + c.name + '|' + c.domain);
  }
}
main().catch((e) => { console.error('PROBE_FAILED=' + String(e)); process.exitCode = 1; });
