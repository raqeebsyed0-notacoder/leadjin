/**
 * Enrichment Cache Service — SQLite persistence for enrichment results
 * and domain pattern learning.
 *
 * Replaces in-memory-only caching with durable storage across restarts.
 */

import type { EnrichmentOutput } from './enrichmentEngine.js';

// ---------------------------------------------------------------------------
// Table initialization
// ---------------------------------------------------------------------------

export function initEnrichmentTables(db: any): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS enrichment_cache (
      lead_id TEXT PRIMARY KEY,
      email TEXT,
      email_confidence REAL,
      email_source TEXT,
      phone TEXT,
      phone_type TEXT,
      whatsapp_verified INTEGER DEFAULT 0,
      linkedin_url TEXT,
      company_x_handle TEXT,
      company_snapchat TEXT,
      company_tiktok TEXT,
      enriched_at TEXT,
      duration_ms INTEGER
    );

    CREATE TABLE IF NOT EXISTS domain_patterns (
      domain TEXT PRIMARY KEY,
      pattern TEXT,
      mx_provider TEXT,
      is_catchall INTEGER DEFAULT 0,
      sample_count INTEGER DEFAULT 0,
      last_verified TEXT
    );
  `);
}

// ---------------------------------------------------------------------------
// Enrichment result cache
// ---------------------------------------------------------------------------

export function getCachedResult(db: any, leadId: string): EnrichmentOutput | null {
  try {
    const row = db
      .prepare('SELECT * FROM enrichment_cache WHERE lead_id = ?')
      .get(leadId);

    if (!row) return null;

    return {
      leadId: row.lead_id,
      email: row.email ?? null,
      emailConfidence: row.email_confidence ?? 0,
      emailSource: row.email_source ?? '',
      phone: row.phone ?? null,
      phoneType: row.phone_type ?? null,
      phoneSource: null,
      whatsappVerified: Boolean(row.whatsapp_verified),
      linkedinUrl: row.linkedin_url ?? null,
      companyXHandle: row.company_x_handle ?? null,
      companySnapchat: row.company_snapchat ?? null,
      companyTiktok: row.company_tiktok ?? null,
      confidenceLabel: '', // Caller can recompute if needed
      layersUsed: [],
      durationMs: row.duration_ms ?? 0,
      enrichedAt: row.enriched_at ?? new Date().toISOString(),
    };
  } catch (err: any) {
    console.error('[EnrichmentCache] getCachedResult failed:', err.message);
    return null;
  }
}

export function setCachedResult(db: any, leadId: string, result: EnrichmentOutput): void {
  try {
    const stmt = db.prepare(`
      INSERT INTO enrichment_cache (
        lead_id, email, email_confidence, email_source,
        phone, phone_type, whatsapp_verified,
        linkedin_url, company_x_handle, company_snapchat, company_tiktok,
        enriched_at, duration_ms
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      )
      ON CONFLICT(lead_id) DO UPDATE SET
        email = excluded.email,
        email_confidence = excluded.email_confidence,
        email_source = excluded.email_source,
        phone = excluded.phone,
        phone_type = excluded.phone_type,
        whatsapp_verified = excluded.whatsapp_verified,
        linkedin_url = excluded.linkedin_url,
        company_x_handle = excluded.company_x_handle,
        company_snapchat = excluded.company_snapchat,
        company_tiktok = excluded.company_tiktok,
        enriched_at = excluded.enriched_at,
        duration_ms = excluded.duration_ms
    `);

    stmt.run(
      leadId,
      result.email ?? null,
      result.emailConfidence ?? 0,
      result.emailSource ?? '',
      result.phone ?? null,
      result.phoneType ?? null,
      result.whatsappVerified ? 1 : 0,
      result.linkedinUrl ?? null,
      result.companyXHandle ?? null,
      result.companySnapchat ?? null,
      result.companyTiktok ?? null,
      result.enrichedAt ?? new Date().toISOString(),
      result.durationMs ?? 0,
    );
  } catch (err: any) {
    console.error('[EnrichmentCache] setCachedResult failed:', err.message);
  }
}

// ---------------------------------------------------------------------------
// Domain pattern persistence
// ---------------------------------------------------------------------------

export function getDomainPatternFromDb(db: any, domain: string): { pattern: string; mxProvider: string } | null {
  try {
    const row = db
      .prepare('SELECT pattern, mx_provider FROM domain_patterns WHERE domain = ?')
      .get(domain.toLowerCase());

    if (!row) return null;

    return {
      pattern: row.pattern,
      mxProvider: row.mx_provider,
    };
  } catch (err: any) {
    console.error('[EnrichmentCache] getDomainPatternFromDb failed:', err.message);
    return null;
  }
}

export function setDomainPatternInDb(
  db: any,
  domain: string,
  pattern: string,
  mxProvider: string,
): void {
  try {
    const stmt = db.prepare(`
      INSERT INTO domain_patterns (
        domain, pattern, mx_provider, is_catchall, sample_count, last_verified
      ) VALUES (?, ?, ?, 0, 1, ?)
      ON CONFLICT(domain) DO UPDATE SET
        pattern = excluded.pattern,
        mx_provider = excluded.mx_provider,
        sample_count = sample_count + 1,
        last_verified = excluded.last_verified
    `);

    stmt.run(domain.toLowerCase(), pattern, mxProvider, new Date().toISOString());
  } catch (err: any) {
    console.error('[EnrichmentCache] setDomainPatternInDb failed:', err.message);
  }
}
