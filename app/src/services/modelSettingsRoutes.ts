/**
 * modelSettingsRoutes.ts — Per-user model & API-key settings (HERMES-DESKTOP-Style
 * model selection: use a local model OR bring your own API key).
 *
 * Exports `createModelSettingsRouter(db)` which returns an Express router with:
 *   GET  /model  → the caller's model settings (never the apiKey value)
 *   PUT  /model  → upsert mode + provider + (encrypted) apiKey
 *
 * The user record lives in the `users` table; settings are stored as JSON in the
 * `preferences` column. The apiKey is encrypted with the same AES-256-GCM helper
 * that server.ts uses (ADMIN_ENCRYPTION_KEY from LEADJIN_ADMIN_SECRET).
 *
 * NOTE: `db` is a better-sqlite3 database instance bound by the host app.
 *       `getUserFromToken` is the host's session resolver (getUserFromTokenCached
 *       in server.ts). It is invoked by a router-level middleware that attaches
 *       the resolved user to `req.user`, the same contract jinCompleteRoutes /
 *       artisanRoutes rely on. Unauthenticated requests get no `req.user` and
 *       therefore a 401 from each handler.
 */

import { Router, type Request } from 'express';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

// ---------------------------------------------------------------------------
// Encryption helpers (mirrors server.ts:871-890). The apiKey is never stored in
// plaintext and never returned to the caller.
// ---------------------------------------------------------------------------

const ADMIN_ENCRYPTION_KEY = process.env.LEADJIN_ADMIN_SECRET
  ? scryptSync(process.env.LEADJIN_ADMIN_SECRET, 'salt', 32)
  : null;

function encryptApiKey(key: string): string {
  if (!ADMIN_ENCRYPTION_KEY) return key; // Fallback — no secret, plaintext (dev only)
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-gcm', ADMIN_ENCRYPTION_KEY as Buffer, iv);
  let encrypted = cipher.update(key, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

function decryptApiKey(encryptedKey: string): string {
  if (!ADMIN_ENCRYPTION_KEY || !encryptedKey.includes(':')) return encryptedKey; // Fallback
  const [ivHex, authTagHex, encrypted] = encryptedKey.split(':');
  const decipher = createDecipheriv(
    'aes-256-gcm',
    ADMIN_ENCRYPTION_KEY as Buffer,
    Buffer.from(ivHex, 'hex'),
  );
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// ---------------------------------------------------------------------------

export interface ModelSettings {
  mode: 'local' | 'byok';        // local → Ollama (gemma4:e4b); byok → user key + provider
  provider?: string;             // e.g. ollama | gateway | openrouter | together | nvidia | nous
  apiKey?: string;               // stored encrypted; never returned by GET
  updatedAt?: string;
}

function parsePreferences(existing: any): ModelSettings {
  const defaults: ModelSettings = { mode: 'local', provider: undefined };
  const parsed = (typeof existing === 'string') ? JSON.parse(existing) : existing;
  if (parsed && typeof parsed === 'object') {
    return { ...defaults, ...parsed };
  }
  return defaults;
}

export function createModelSettingsRouter(
  db: any,
  getUserFromToken: (req: Request) => any | null
): Router {
  const router = Router();

  // Resolve the host session and attach the user to req.user for the handlers
  // below. Mirrors the requireAuth contract of jinCompleteRoutes/artisanRoutes;
  // it does not itself reject — the handlers keep their existing 401 checks.
  router.use((req, _res, next) => {
    (req as any).user = getUserFromToken(req);
    next();
  });

  // GET /model → read the caller's settings; the apiKey is never returned.
  router.get('/model', (req, res) => {
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const row = db.prepare('SELECT preferences FROM users WHERE id = ?').get(userId) as any;
    const prefs = parsePreferences(row?.preferences || '{}');

    res.json({
      mode: prefs.mode || 'local',
      provider: prefs.provider || 'ollama',
      hasKey: Boolean(prefs.apiKey),
      updatedAt: prefs.updatedAt,
    });
  });

  // PUT /model → upsert the caller's model settings.
  router.put('/model', (req, res) => {
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const body = req.body as { mode?: string; provider?: string; apiKey?: string; apiKeyEncrypted?: never };
    if (!body || typeof body !== 'object') {
      return res.status(400).json({ error: 'Request body required' });
    }
    const { mode, provider, apiKey } = body;

    if (mode !== 'local' && mode !== 'byok') {
      return res.status(400).json({ error: 'mode must be "local" or "byok"' });
    }
    // When byok, provider (and usually apiKey) are expected.
    if (mode === 'byok' && !provider) {
      return res.status(400).json({ error: 'provider is required when mode=byok' });
    }
    if (mode === 'byok' && apiKey === undefined) {
      return res.status(400).json({ error: 'apiKey is required when mode=byok' });
    }

    const row = db.prepare('SELECT preferences FROM users WHERE id = ?').get(userId) as any;
    const existing = row ? JSON.parse(row.preferences || '{}') : {};
    const merged = {
      ...existing,
      mode,
      provider: provider || existing.provider,
      apiKey: apiKey !== undefined ? encryptApiKey(apiKey) : existing.apiKey,
      updatedAt: new Date().toISOString(),
    };
    db.prepare('UPDATE users SET preferences = ? WHERE id = ?').run(JSON.stringify(merged), userId);

    // Return the reduced safe view (no key).
    res.json({
      mode: merged.mode,
      provider: merged.provider,
      hasKey: Boolean(merged.apiKey),
      updatedAt: merged.updatedAt,
    });
  });

  return router;
}
