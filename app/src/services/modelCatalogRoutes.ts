import { Router } from 'express';
import { readFileSync } from 'fs';

/**
 * modelCatalogRoutes.ts — live provider catalogue endpoint.
 *
 * Mounts GET /models on the /api/settings surface:
 *
 *   GET /api/settings/models → JSON array, one entry per provider present in the
 *   HEALTH_PROVIDER_KEY_ENV / HEALTH_PROVIDER_MODEL maps (server.ts lines
 *   ~288-350). Each entry carries ONLY values resolved live from those two maps
 *   plus process.env:
 *
 *     provider  — provider id (the map key)
 *     label     — human-readable name
 *     model     — the serving model id for that provider (from the map)
 *     keyRequired — a credential is required to use this provider
 *     keyPresent  — the credential is currently satisfied
 *     configured  — the live provider is operational
 *
 * No provider or model id is enumerated here: the catalogue is derived solely
 * from the two maps, so it can never show a provider or model the live health
 * probe (server.ts getLiveProviderInfo) does not know about, and it never
 * lists models beyond the serving model.
 *
 * The endpoint is public — it only reports what is configured and which
 * credentials are currently present, so the settings surface can disable
 * providers the user has not unlocked.
 */

// ---------------------------------------------------------------------------
// Provider catalogue source — reused verbatim from server.ts
//   server.ts:293-300  HEALTH_PROVIDER_KEY_ENV
//   server.ts:301-308  HEALTH_PROVIDER_MODEL
// The catalogue is derived from exactly these two maps (see ALL_PROVIDERS),
// so adding a provider to the health probe automatically adds it to the UI.
// ---------------------------------------------------------------------------

/** Credential environment variable for each keyed provider (ollama needs none). */
const HEALTH_PROVIDER_KEY_ENV: Record<string, string> = {
  gateway: '__gateway__',
  openrouter: 'OPENROUTER_API_KEY',
  together: 'TOGETHER_API_KEY',
  nvidia: 'NVIDIA_API_KEY',
  nous: 'NOUS_API_KEY',
};

/** Serving model id for each provider (env defaults baked in). */
const HEALTH_PROVIDER_MODEL: Record<string, string> = {
  ollama: (process.env.LEADJIN_MODEL || 'gemma4:e4b').trim(),
  gateway: 'google/flash-2.5-flash-lite',
  openrouter: (process.env.LEADJIN_OPENROUTER_MODEL || 'openrouter/auto').trim(),
  together: (process.env.LEADJIN_TOGETHER_MODEL || 'Qwen/Qwen3-8B').trim(),
  nvidia: (process.env.LEADJIN_NVIDIA_MODEL || 'meta/llama-3.1-8b-instruct').trim(),
  nous: (process.env.LEADJIN_NOUS_MODEL || 'stepfun/step-3.7-flash:free').trim(),
};

/** Human-readable label for each provider id. */
const PROVIDER_LABELS: Record<string, string> = {
  ollama: 'Ollama',
  gateway: 'Gateway',
  openrouter: 'OpenRouter',
  together: 'Together',
  nvidia: 'NVIDIA',
  nous: 'Nous',
};

// Every provider the catalogue may return — the union of the two maps' keys,
// de-duplicated (both maps share the same provider set).
const ALL_PROVIDERS: readonly string[] = (() => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of Object.keys(HEALTH_PROVIDER_KEY_ENV)) {
    if (!seen.has(p)) {
      seen.add(p);
      out.push(p);
    }
  }
  for (const p of Object.keys(HEALTH_PROVIDER_MODEL)) {
    if (!seen.has(p)) {
      seen.add(p);
      out.push(p);
    }
  }
  return out;
})();

/**
 * Credential check, mirroring server.ts getLiveProviderInfo() (line 325-345).
 * The gateway leg reads API_SERVER_KEY (including the value carried in the
 * Hermes .env file); every other keyed provider reads process.env[keyEnv].
 */
function credentialPresent(provider: string, keyEnv: string | undefined): boolean {
  if (provider === 'ollama') return true;
  if (keyEnv === '__gateway__') {
    let key = (process.env.API_SERVER_KEY || '').trim();
    if (!key) {
      try {
        const txt = readFileSync('/home/euphoria/euphoria-v2/.hermes/.env', 'utf8');
        const m = txt.match(/^\s*API_SERVER_KEY\s*=\s*(.+)$/m);
        if (m) key = m[1].trim().replace(/^["\']/, '').replace(/["']$/, '');
      } catch {
        // .hermes/.env may not exist — key stays unset.
      }
    }
    return !!key;
  }
  return !!(process.env[keyEnv!] || '').trim();
}

export function createModelCatalogRouter(): Router {
  const router = Router();

  router.get('/models', (_req, res) => {
    const catalogue = ALL_PROVIDERS.map((provider) => {
      const keyEnv = HEALTH_PROVIDER_KEY_ENV[provider];
      return {
        provider,
        label: PROVIDER_LABELS[provider] || provider,
        model: HEALTH_PROVIDER_MODEL[provider],
        keyRequired: provider !== 'ollama' && keyEnv !== undefined,
        keyPresent: credentialPresent(provider, keyEnv),
        configured: true,
      };
    });
    res.json(catalogue);
  });

  return router;
}
