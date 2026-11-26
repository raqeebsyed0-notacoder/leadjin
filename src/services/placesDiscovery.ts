/**
 * placesDiscovery.ts — Google Places discovery client (legacy endpoints)
 *
 * EUP-527: converted from Places API v1 (places.googleapis.com/v1/places:searchText),
 * which returns API_KEY_SERVICE_BLOCKED on the LeadJin key, to the legacy
 * Places endpoints that work on the same key:
 *   - search: GET https://maps.googleapis.com/maps/api/place/textsearch/json?query=
 *   - details: GET https://maps.googleapis.com/maps/api/place/details/json?place_id=&fields=
 *   - findplace (optional): GET https://maps.googleapis.com/maps/api/place/findplacefromtext/json
 *
 * Two-tier strategy preserved from the v1 module:
 *   - essentials (default): place_id, name, formatted_address (one textsearch call)
 *   - enterprise (opt-in): essentials + phone/website via one details call per place
 *
 * Design rules carried over unchanged:
 *   - GOOGLE_PLACES_API_KEY is read from env ONLY, at call time, and is never
 *     logged or surfaced in error messages.
 *   - Response payloads are validated and fail loud: malformed shapes throw
 *     PlacesInvalidResponseError, never silently coerced.
 *   - Errors are classified: timeout / denied / rate-limit / invalid-request
 *     (+ network / invalid-response / config / cap).
 *     ONLY OVER_QUERY_LIMIT and timeout are retried, with exponential backoff.
 *   - A module-level Place-ID dedup set persists across calls: places whose
 *     Id was already returned are filtered out and counted.
 *   - A module-level call counter honors LEADJIN_PLACES_TEST_CAP
 *     (default 200); it counts HTTP attempts, so enterprise details calls
 *     count against the cap as well.
 *   - fetch is injectable for stub-based tests (zero network).
 *
 * Legacy response shape (HTTP 200 + status field):
 *   textsearch: { status: "OK", results: [{ place_id, name, formatted_address }] }
 *   details:    { status: "OK", result: { place_id, name, formatted_address,
 *                 international_phone_number?, website? } }
 *   statuses: OK | ZERO_RESULTS | OVER_QUERY_LIMIT | REQUEST_DENIED |
 *             INVALID_REQUEST | UNKNOWN_ERROR | (http 429/403/400 mapped too)
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** A single discovered Place. phoneNumber/websiteUri are enterprise-tier only. */
export interface PlacesDiscoveryPlace {
  id: string;
  displayName: string;
  formattedAddress: string;
  /** Enterprise tier only — present only when the API returned it. */
  phoneNumber?: string;
  /** Enterprise tier only — present only when the API returned it. */
  websiteUri?: string;
}

export interface PlacesSearchResult {
  /** New places after dedup against the module-level seen-Id set. */
  places: PlacesDiscoveryPlace[];
  /** Number of places in the raw API response, before dedup. */
  rawCount: number;
  /** Places dropped because their Id was already seen by this module. */
  duplicatesRemoved: number;
}

export type PlacesTier = 'essentials' | 'enterprise';

/** Minimal fetch shape this module depends on — easy to stub in tests. */
export interface PlacesFetchResponse {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}

export type PlacesFetch = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body: string;
    signal?: AbortSignal;
  },
) => Promise<PlacesFetchResponse>;

export interface PlacesSearchOptions {
  /** Required. Free-text Places query, e.g. "coworking space in Riyadh". */
  textQuery: string;
  /** 'essentials' (default) requests id/displayName/formattedAddress;
   *  'enterprise' additionally requests phoneNumber + websiteUri (via details). */
  tier?: PlacesTier;
  languageCode?: string;
  regionCode?: string;
  /** Injectable fetch for tests. Defaults to global fetch. */
  fetch?: PlacesFetch;
  /** Abort timeout per HTTP attempt. Default 5000ms. */
  timeoutMs?: number;
  /** Retries for OVER_QUERY_LIMIT + timeout only. Default 2. */
  maxRetries?: number;
  /** Base backoff in ms (doubles per attempt). Default 250. */
  backoffMs?: number;
}

export interface PlacesDetailsOptions {
  /** Required. Legacy place_id from a prior textsearch/findplace result. */
  placeId: string;
  languageCode?: string;
  /** Injectable fetch for tests. Defaults to global fetch. */
  fetch?: PlacesFetch;
  /** Abort timeout per HTTP attempt. Default 5000ms. */
  timeoutMs?: number;
  /** Retries for OVER_QUERY_LIMIT + timeout only. Default 2. */
  maxRetries?: number;
  /** Base backoff in ms (doubles per attempt). Default 250. */
  backoffMs?: number;
}

// ---------------------------------------------------------------------------
// Error classes (classified)
// ---------------------------------------------------------------------------

/** Base class for every error thrown by this module. */
export class PlacesError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = new.target.name;
    if (status !== undefined) this.status = status;
  }
}

/** GOOGLE_PLACES_API_KEY missing from the environment. */
export class PlacesConfigError extends PlacesError {}

/** HTTP attempt exceeded the timeout budget (or fetch aborted). */
export class PlacesTimeoutError extends PlacesError {}

/** Fetch-level failure that was not an HTTP response (DNS, socket, ...). */
export class PlacesNetworkError extends PlacesError {}

/** HTTP 403 / status REQUEST_DENIED — Places request denied (key/restriction/billing). */
export class PlacesDeniedError extends PlacesError {}

/** HTTP 429 / status OVER_QUERY_LIMIT — rate limited. Retryable with backoff. */
export class PlacesRateLimitError extends PlacesError {}

/** HTTP 400 / status INVALID_REQUEST — invalid request (bad textQuery, malformed options, ...). */
export class PlacesInvalidRequestError extends PlacesError {}

/** 200 response whose body failed validation — fails loud. */
export class PlacesInvalidResponseError extends PlacesError {}

/** Module-level call counter reached LEADJIN_PLACES_TEST_CAP. */
export class PlacesCallCapExceededError extends PlacesError {}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LEGACY_BASE_URL = 'https://maps.googleapis.com/maps/api/place';
const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_BACKOFF_MS = 250;
const DEFAULT_CALL_CAP = 200;

const ESSENTIALS_FIELDS = 'place_id,name,formatted_address';
const ENTERPRISE_FIELDS = `${ESSENTIALS_FIELDS},international_phone_number,website`;

// ---------------------------------------------------------------------------
// Module state (persists across calls within this module instance)
// ---------------------------------------------------------------------------

/** Place Ids already returned to callers — dedup persists across calls. */
const seenPlaceIds = new Set<string>();

/** Total HTTP attempts made by this module instance (cap enforcement). */
let callCount = 0;

/** Test helper: current HTTP-attempt count. */
export function getPlacesCallCount(): number {
  return callCount;
}

// ---------------------------------------------------------------------------
// Environment (env-only, never logged)
// ---------------------------------------------------------------------------

function getApiKey(): string {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key || key.trim() === '') {
    throw new PlacesConfigError(
      'GOOGLE_PLACES_API_KEY is not set — Places discovery is unavailable',
    );
  }
  return key;
}

function getCallCap(): number {
  const raw = process.env.LEADJIN_PLACES_TEST_CAP;
  if (raw === undefined || raw.trim() === '') return DEFAULT_CALL_CAP;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return DEFAULT_CALL_CAP;
  return n;
}

// ---------------------------------------------------------------------------
// Default fetch adapter (global fetch shaped to PlacesFetch)
// ---------------------------------------------------------------------------

const defaultFetch: PlacesFetch = (url, init) =>
  fetch(url, {
    method: init.method,
    headers: init.headers,
    signal: init.signal,
  }) as Promise<PlacesFetchResponse>;

// ---------------------------------------------------------------------------
// Validation — parse and fail loud
// ---------------------------------------------------------------------------

function readDisplayName(value: unknown): string {
  if (typeof value === 'string' && value.trim() !== '') return value;
  if (
    value !== null &&
    typeof value === 'object' &&
    'text' in value &&
    typeof (value as { text: unknown }).text === 'string'
  ) {
    return (value as { text: string }).text;
  }
  return '';
}

/** Map a legacy status body to a classified error, or null when it is OK. */
function legacyStatusError(raw: unknown, what: string): PlacesError | null {
  if (raw === null || typeof raw !== 'object') {
    return new PlacesInvalidResponseError(`${what}: response body is not an object`);
  }
  const status = (raw as { status?: unknown }).status;
  if (status === 'OK' || status === 'ZERO_RESULTS') return null;
  if (status === 'OVER_QUERY_LIMIT') {
    return new PlacesRateLimitError(`${what}: over query limit (OVER_QUERY_LIMIT)`);
  }
  if (status === 'REQUEST_DENIED') {
    return new PlacesDeniedError(`${what}: request denied (REQUEST_DENIED)`);
  }
  if (status === 'INVALID_REQUEST') {
    return new PlacesInvalidRequestError(`${what}: invalid request (INVALID_REQUEST)`, 400);
  }
  if (status === 'UNKNOWN_ERROR') {
    return new PlacesError(`${what}: unknown error (UNKNOWN_ERROR)`);
  }
  return new PlacesInvalidResponseError(
    `${what}: response status is missing or unrecognized`,
  );
}

function parseLegacySearchResults(raw: unknown): PlacesDiscoveryPlace[] {
  if (raw === null || typeof raw !== 'object') {
    throw new PlacesInvalidResponseError(
      'Places legacy Text Search: response body is not an object',
    );
  }
  const err = legacyStatusError(raw, 'Places legacy Text Search');
  if (err) throw err;
  const results = (raw as { results?: unknown }).results;
  if (results === undefined || results === null) return [];
  if (!Array.isArray(results)) {
    throw new PlacesInvalidResponseError(
      'Places legacy Text Search: "results" is not an array',
    );
  }

  const parsed: PlacesDiscoveryPlace[] = [];
  for (let i = 0; i < results.length; i++) {
    const entry = results[i];
    if (entry === null || typeof entry !== 'object') {
      throw new PlacesInvalidResponseError(
        `Places legacy Text Search: results[${i}] is not an object`,
      );
    }
    const rec = entry as Record<string, unknown>;

    if (typeof rec.place_id !== 'string' || rec.place_id.trim() === '') {
      throw new PlacesInvalidResponseError(
        `Places legacy Text Search: results[${i}].place_id is missing or not a non-empty string`,
      );
    }
    const displayName =
      typeof rec.name === 'string' ? rec.name : readDisplayName(rec.displayName);
    if (displayName.trim() === '') {
      throw new PlacesInvalidResponseError(
        `Places legacy Text Search: results[${i}].name is missing or empty`,
      );
    }
    if (
      typeof rec.formatted_address !== 'string' ||
      rec.formatted_address.trim() === ''
    ) {
      throw new PlacesInvalidResponseError(
        `Places legacy Text Search: results[${i}].formatted_address is missing or empty`,
      );
    }

    const place: PlacesDiscoveryPlace = {
      id: rec.place_id,
      displayName,
      formattedAddress: rec.formatted_address,
    };

    // textsearch results may carry contact fields in some tiers; keep them
    // only on enterprise. Details calls are the authoritative source.
    if (rec.international_phone_number !== undefined && rec.international_phone_number !== null) {
      if (typeof rec.international_phone_number !== 'string') {
        throw new PlacesInvalidResponseError(
          `Places legacy Text Search: results[${i}].international_phone_number is not a string`,
        );
      }
      place.phoneNumber = rec.international_phone_number;
    }
    if (rec.website !== undefined && rec.website !== null) {
      if (typeof rec.website !== 'string') {
        throw new PlacesInvalidResponseError(
          `Places legacy Text Search: results[${i}].website is not a string`,
        );
      }
      place.websiteUri = rec.website;
    }

    parsed.push(place);
  }
  return parsed;
}

function parseLegacyDetails(raw: unknown): PlacesDiscoveryPlace {
  if (raw === null || typeof raw !== 'object') {
    throw new PlacesInvalidResponseError(
      'Places legacy Details: response body is not an object',
    );
  }
  const err = legacyStatusError(raw, 'Places legacy Details');
  if (err) throw err;
  const result = (raw as { result?: unknown }).result;
  if (result === undefined || result === null || typeof result !== 'object') {
    throw new PlacesInvalidResponseError(
      'Places legacy Details: "result" is missing or not an object',
    );
  }
  const rec = result as Record<string, unknown>;

  if (typeof rec.place_id !== 'string' || rec.place_id.trim() === '') {
    throw new PlacesInvalidResponseError(
      'Places legacy Details: result.place_id is missing or not a non-empty string',
    );
  }
  const displayName =
    typeof rec.name === 'string' ? rec.name : readDisplayName(rec.displayName);
  if (displayName.trim() === '') {
    throw new PlacesInvalidResponseError(
      'Places legacy Details: result.name is missing or empty',
    );
  }
  if (
    typeof rec.formatted_address !== 'string' ||
    rec.formatted_address.trim() === ''
  ) {
    throw new PlacesInvalidResponseError(
      'Places legacy Details: result.formatted_address is missing or empty',
    );
  }

  const place: PlacesDiscoveryPlace = {
    id: rec.place_id,
    displayName,
    formattedAddress: rec.formatted_address,
  };
  if (rec.international_phone_number !== undefined && rec.international_phone_number !== null) {
    if (typeof rec.international_phone_number !== 'string') {
      throw new PlacesInvalidResponseError(
        'Places legacy Details: result.international_phone_number is not a string',
      );
    }
    place.phoneNumber = rec.international_phone_number;
  }
  if (rec.website !== undefined && rec.website !== null) {
    if (typeof rec.website !== 'string') {
      throw new PlacesInvalidResponseError(
        'Places legacy Details: result.website is not a string',
      );
    }
    place.websiteUri = rec.website;
  }
  return place;
}

// ---------------------------------------------------------------------------
// HTTP layer
// ---------------------------------------------------------------------------

function classifyHttpFailure(status: number, what: string): PlacesError {
  if (status === 429) {
    return new PlacesRateLimitError(`${what}: rate limited (429)`, 429);
  }
  if (status === 403) {
    return new PlacesDeniedError(`${what}: request denied (403)`, 403);
  }
  if (status === 400) {
    return new PlacesInvalidRequestError(`${what}: invalid request (400)`, 400);
  }
  return new PlacesError(`${what}: unexpected HTTP ${status}`, status);
}

async function getOnce(
  fetchImpl: PlacesFetch,
  url: string,
  what: string,
  timeoutMs: number,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      headers: {},
      body: '',
      signal: controller.signal,
    });

    if (!response.ok) throw classifyHttpFailure(response.status, what);
    return await response.json();
  } catch (err) {
    const aborted =
      controller.signal.aborted ||
      (err instanceof Error && err.name === 'AbortError');
    if (aborted) {
      throw new PlacesTimeoutError(`${what}: timed out after ${timeoutMs}ms`);
    }
    if (err instanceof PlacesError) throw err;
    throw new PlacesNetworkError(
      `${what}: fetch failed — ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    clearTimeout(timer);
  }
}

async function getWithRetry(
  fetchImpl: PlacesFetch,
  url: string,
  what: string,
  opts: { timeoutMs?: number; maxRetries?: number; backoffMs?: number },
): Promise<unknown> {
  const maxRetries = opts.maxRetries ?? DEFAULT_MAX_RETRIES;
  const backoffMs = opts.backoffMs ?? DEFAULT_BACKOFF_MS;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let lastError: PlacesError | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await getOnce(fetchImpl, url, what, timeoutMs);
    } catch (err) {
      if (!(err instanceof PlacesError)) throw err;
      lastError = err;
      const retryable =
        err instanceof PlacesTimeoutError || err instanceof PlacesRateLimitError;
      if (!retryable || attempt === maxRetries) throw err;
      await new Promise((resolve) => setTimeout(resolve, backoffMs * 2 ** attempt));
    }
  }
  throw lastError; // unreachable — loop always returns or throws
}

function buildTextSearchUrl(apiKey: string, opts: PlacesSearchOptions): string {
  const params = new URLSearchParams();
  params.set('query', opts.textQuery);
  if (opts.languageCode) params.set('language', opts.languageCode);
  if (opts.regionCode) params.set('region', opts.regionCode);
  params.set('key', apiKey);
  return `${LEGACY_BASE_URL}/textsearch/json?${params.toString()}`;
}

function buildDetailsUrl(apiKey: string, placeId: string, languageCode?: string): string {
  const params = new URLSearchParams();
  params.set('place_id', placeId);
  params.set('fields', ENTERPRISE_FIELDS);
  if (languageCode) params.set('language', languageCode);
  params.set('key', apiKey);
  return `${LEGACY_BASE_URL}/details/json?${params.toString()}`;
}

function buildFindPlaceUrl(apiKey: string, input: string, languageCode?: string): string {
  const params = new URLSearchParams();
  params.set('input', input);
  params.set('inputtype', 'textquery');
  params.set('fields', ESSENTIALS_FIELDS);
  if (languageCode) params.set('language', languageCode);
  params.set('key', apiKey);
  return `${LEGACY_BASE_URL}/findplacefromtext/json?${params.toString()}`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Places legacy Text Search. Reads GOOGLE_PLACES_API_KEY from env (never logged),
 * classifies failures, retries only OVER_QUERY_LIMIT + timeout with exponential
 * backoff, and filters results through the module-level Place-ID dedup set.
 * Enterprise tier additionally issues one legacy Details call per new place to
 * fill phoneNumber/websiteUri when the search result did not carry them.
 */
export async function searchPlaces(
  opts: PlacesSearchOptions,
): Promise<PlacesSearchResult> {
  if (!opts.textQuery || opts.textQuery.trim() === '') {
    throw new PlacesInvalidRequestError(
      'Places legacy Text Search: textQuery is required',
    );
  }

  const apiKey = getApiKey();
  const tier = opts.tier ?? 'essentials';

  const cap = getCallCap();
  if (callCount >= cap) {
    throw new PlacesCallCapExceededError(
      `Places legacy Text Search: call cap exceeded (${cap} calls)`,
    );
  }
  callCount += 1;

  const fetchImpl = opts.fetch ?? defaultFetch;
  const url = buildTextSearchUrl(apiKey, opts);

  const raw = await getWithRetry(fetchImpl, url, 'Places legacy Text Search', opts);
  const parsed = parseLegacySearchResults(raw);

  const places: PlacesDiscoveryPlace[] = [];
  let duplicatesRemoved = 0;
  for (const place of parsed) {
    if (seenPlaceIds.has(place.id)) {
      duplicatesRemoved += 1;
      continue;
    }
    seenPlaceIds.add(place.id);
    places.push(place);
  }

  if (tier === 'enterprise') {
    for (const place of places) {
      if (place.phoneNumber !== undefined && place.websiteUri !== undefined) continue;
      if (callCount >= cap) {
        throw new PlacesCallCapExceededError(
          `Places legacy Details: call cap exceeded (${cap} calls)`,
        );
      }
      callCount += 1;
      const detailsUrl = buildDetailsUrl(apiKey, place.id, opts.languageCode);
      const detailsRaw = await getWithRetry(
        fetchImpl,
        detailsUrl,
        'Places legacy Details',
        opts,
      );
      const details = parseLegacyDetails(detailsRaw);
      if (details.phoneNumber !== undefined && place.phoneNumber === undefined) {
        place.phoneNumber = details.phoneNumber;
      }
      if (details.websiteUri !== undefined && place.websiteUri === undefined) {
        place.websiteUri = details.websiteUri;
      }
    }
  } else {
    // Essentials tier never surfaces contact fields even if the API sent them.
    for (const place of places) {
      delete place.phoneNumber;
      delete place.websiteUri;
    }
  }

  return { places, rawCount: parsed.length, duplicatesRemoved };
}

/**
 * Places legacy Details for a single place_id.
 * Returns id, displayName, formattedAddress plus phone/website when present.
 */
export async function getPlaceDetails(
  opts: PlacesDetailsOptions,
): Promise<PlacesDiscoveryPlace> {
  if (!opts.placeId || opts.placeId.trim() === '') {
    throw new PlacesInvalidRequestError(
      'Places legacy Details: placeId is required',
    );
  }

  const apiKey = getApiKey();
  const cap = getCallCap();
  if (callCount >= cap) {
    throw new PlacesCallCapExceededError(
      `Places legacy Details: call cap exceeded (${cap} calls)`,
    );
  }
  callCount += 1;

  const fetchImpl = opts.fetch ?? defaultFetch;
  const url = buildDetailsUrl(apiKey, opts.placeId, opts.languageCode);
  const raw = await getWithRetry(fetchImpl, url, 'Places legacy Details', opts);
  return parseLegacyDetails(raw);
}

/**
 * Places legacy Find Place From Text.
 * Returns essentials (id/displayName/formattedAddress) for the query.
 */
export async function findPlaceFromText(
  opts: PlacesSearchOptions,
): Promise<PlacesSearchResult> {
  if (!opts.textQuery || opts.textQuery.trim() === '') {
    throw new PlacesInvalidRequestError(
      'Places legacy Find Place: textQuery is required',
    );
  }

  const apiKey = getApiKey();
  const cap = getCallCap();
  if (callCount >= cap) {
    throw new PlacesCallCapExceededError(
      `Places legacy Find Place: call cap exceeded (${cap} calls)`,
    );
  }
  callCount += 1;

  const fetchImpl = opts.fetch ?? defaultFetch;
  const url = buildFindPlaceUrl(apiKey, opts.textQuery, opts.languageCode);
  const raw = await getWithRetry(fetchImpl, url, 'Places legacy Find Place', opts);

  if (raw === null || typeof raw !== 'object') {
    throw new PlacesInvalidResponseError(
      'Places legacy Find Place: response body is not an object',
    );
  }
  const err = legacyStatusError(raw, 'Places legacy Find Place');
  if (err) throw err;
  const candidates = (raw as { candidates?: unknown }).candidates;
  if (candidates === undefined || candidates === null) {
    return { places: [], rawCount: 0, duplicatesRemoved: 0 };
  }
  if (!Array.isArray(candidates)) {
    throw new PlacesInvalidResponseError(
      'Places legacy Find Place: "candidates" is not an array',
    );
  }

  const parsed: PlacesDiscoveryPlace[] = [];
  for (let i = 0; i < candidates.length; i++) {
    const entry = candidates[i];
    if (entry === null || typeof entry !== 'object') {
      throw new PlacesInvalidResponseError(
        `Places legacy Find Place: candidates[${i}] is not an object`,
      );
    }
    const rec = entry as Record<string, unknown>;
    if (typeof rec.place_id !== 'string' || rec.place_id.trim() === '') {
      throw new PlacesInvalidResponseError(
        `Places legacy Find Place: candidates[${i}].place_id is missing or not a non-empty string`,
      );
    }
    const displayName =
      typeof rec.name === 'string' ? rec.name : readDisplayName(rec.displayName);
    if (displayName.trim() === '') {
      throw new PlacesInvalidResponseError(
        `Places legacy Find Place: candidates[${i}].name is missing or empty`,
      );
    }
    if (
      typeof rec.formatted_address !== 'string' ||
      rec.formatted_address.trim() === ''
    ) {
      throw new PlacesInvalidResponseError(
        `Places legacy Find Place: candidates[${i}].formatted_address is missing or empty`,
      );
    }
    parsed.push({
      id: rec.place_id,
      displayName,
      formattedAddress: rec.formatted_address,
    });
  }

  const places: PlacesDiscoveryPlace[] = [];
  let duplicatesRemoved = 0;
  for (const place of parsed) {
    if (seenPlaceIds.has(place.id)) {
      duplicatesRemoved += 1;
      continue;
    }
    seenPlaceIds.add(place.id);
    places.push(place);
  }

  return { places, rawCount: parsed.length, duplicatesRemoved };
}
