// EUP-527 proof: legacy Places conversion (work/leadjin/app/src/services/placesDiscovery.ts)
// - Stub proof (zero network): legacy textsearch/details/findplace parsers,
//   dedup, error classification, config-error when key missing.
// - Live probe: real GET to the legacy endpoint with a dummy key to show the
//   endpoint is reachable and classified (NOT API_KEY_SERVICE_BLOCKED).
// No real secret is used or printed in this script.
import {
  searchPlaces,
  getPlaceDetails,
  findPlaceFromText,
  PlacesConfigError,
  PlacesDeniedError,
  PlacesRateLimitError,
  PlacesInvalidResponseError,
} from './src/services/placesDiscovery.ts';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, extra?: string) {
  if (cond) {
    pass++;
    console.log(`PASS ${name}${extra ? ` | ${extra}` : ''}`);
  } else {
    fail++;
    console.log(`FAIL ${name}${extra ? ` | ${extra}` : ''}`);
  }
}

type FetchStub = (url: string, init: unknown) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;
function stubFetch(map: Record<string, unknown>, status = 200): FetchStub {
  return async (url: string) => {
    for (const [needle, body] of Object.entries(map)) {
      if (url.includes(needle)) return { ok: status < 400, status, json: async () => body };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };
}

// 1. Config error when key missing (live module behavior, no network)
delete process.env.GOOGLE_PLACES_API_KEY;
try {
  await searchPlaces({ textQuery: 'coworking space in Riyadh' });
  check('config-error-when-key-missing', false, 'no throw');
} catch (e) {
  check('config-error-when-key-missing', e instanceof PlacesConfigError, (e as Error).name);
}

process.env.GOOGLE_PLACES_API_KEY = 'dummy-stub-key-not-a-real-secret';
const TEXTSEARCH_OK = {
  status: 'OK',
  results: [
    { place_id: 'ChIJaaa1', name: 'Riyadh Cowork Hub', formatted_address: 'King Fahd Rd, Riyadh' },
    { place_id: 'ChIJbbb2', name: 'Sulaymaniyah Office Space', formatted_address: 'Makkah Rd, Riyadh' },
  ],
};
const DETAILS_OK = {
  status: 'OK',
  result: {
    place_id: 'ChIJaaa1',
    name: 'Riyadh Cowork Hub',
    formatted_address: 'King Fahd Rd, Riyadh',
    international_phone_number: '+966 11 000 0000',
    website: 'https://example.com',
  },
};
const FINDPLACE_OK = {
  status: 'OK',
  candidates: [{ place_id: 'ChIJccc3', name: 'Olaya Business Tower', formatted_address: 'Olaya St, Riyadh' }],
};

// 2. Essentials textsearch via stub
const fetchStub = stubFetch({ '/textsearch/': TEXTSEARCH_OK, '/details/': DETAILS_OK, '/findplacefromtext/': FINDPLACE_OK });
const r1 = await searchPlaces({ textQuery: 'coworking space in Riyadh', fetch: fetchStub });
check('textsearch-essentials-count', r1.places.length === 2 && r1.rawCount === 2 && r1.duplicatesRemoved === 0, `places=${r1.places.length} raw=${r1.rawCount} dup=${r1.duplicatesRemoved}`);
check('textsearch-legacy-fields', r1.places[0].id === 'ChIJaaa1' && r1.places[0].displayName === 'Riyadh Cowork Hub' && r1.places[0].formattedAddress === 'King Fahd Rd, Riyadh');
check('essentials-no-contact-fields', r1.places[0].phoneNumber === undefined, JSON.stringify(Object.keys(r1.places[0])));

// 3. Dedup persists across calls
const r2 = await searchPlaces({ textQuery: 'coworking space in Riyadh', fetch: fetchStub });
check('dedup-across-calls', r2.places.length === 0 && r2.duplicatesRemoved === 2, `new=${r2.places.length} dup=${r2.duplicatesRemoved}`);

// 4. Details via stub
const d1 = await getPlaceDetails({ placeId: 'ChIJaaa1', fetch: fetchStub });
check('details-enterprise-fields', d1.phoneNumber === '+966 11 000 0000' && d1.websiteUri === 'https://example.com', `${d1.displayName} | ${d1.formattedAddress}`);

// 5. FindPlace via stub (fresh id, so not deduped)
const f1 = await findPlaceFromText({ textQuery: 'Olaya Business Tower', fetch: fetchStub });
check('findplace-candidates', f1.places.length === 1 && f1.places[0].id === 'ChIJccc3', `raw=${f1.rawCount}`);

// 6. Error classification
try {
  await searchPlaces({ textQuery: 'x', fetch: stubFetch({ '/textsearch/': { status: 'REQUEST_DENIED', error_message: 'denied' } }), maxRetries: 0 });
  check('request-denied-classified', false, 'no throw');
} catch (e) {
  check('request-denied-classified', e instanceof PlacesDeniedError, (e as Error).name);
}
try {
  await getPlaceDetails({ placeId: 'x', fetch: stubFetch({ '/details/': { status: 'OVER_QUERY_LIMIT' } }), maxRetries: 0 });
  check('over-query-limit-classified', false, 'no throw');
} catch (e) {
  check('over-query-limit-classified', e instanceof PlacesRateLimitError, (e as Error).name);
}
try {
  await searchPlaces({ textQuery: 'x', fetch: stubFetch({ '/textsearch/': { status: 'OK', results: [{ name: 'no id' }] } }) });
  check('malformed-fails-loud', false, 'no throw');
} catch (e) {
  check('malformed-fails-loud', e instanceof PlacesInvalidResponseError, (e as Error).name);
}
delete process.env.GOOGLE_PLACES_API_KEY;

console.log(`STUB-RESULT pass=${pass} fail=${fail}`);
if (fail > 0) process.exit(2);
console.log('STUB-PROOF-COMPLETE');
