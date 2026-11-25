import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { discoverCompaniesViaPlaces } from '../src/services/huntOrchestrator.js';

const placesFetch = vi.fn(async (url: string) => {
  const target = String(url);
  if (target.includes('/place/textsearch/json')) {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        status: 'OK',
        results: [{ place_id: 'place-1', name: 'Acme Software', formatted_address: 'Riyadh, Saudi Arabia' }],
      }),
    };
  }
  if (target.includes('/place/details/json')) {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        status: 'OK',
        result: {
          place_id: 'place-1',
          name: 'Acme Software',
          formatted_address: 'Riyadh, Saudi Arabia',
          website: 'https://www.acme.sa/about',
        },
      }),
    };
  }
  return { ok: false, status: 404, json: async () => ({}) };
});

describe('Places wired into the hunt', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', placesFetch);
    process.env.GOOGLE_PLACES_API_KEY = 'test-key-never-used-for-network';
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.GOOGLE_PLACES_API_KEY;
  });

  it('returns real company candidates from Places when the key is present', async () => {
    const result = await discoverCompaniesViaPlaces('software', 'Riyadh', 3);
    expect(result.error).toBeNull();
    expect(result.companies).toEqual([{ name: 'Acme Software', domain: 'acme.sa' }]);
  });

  it('fails closed with no key', async () => {
    delete process.env.GOOGLE_PLACES_API_KEY;
    const result = await discoverCompaniesViaPlaces('software', 'Riyadh', 3);
    expect(result.companies).toEqual([]);
    expect(result.error).toMatch(/not set/);
  });
});
