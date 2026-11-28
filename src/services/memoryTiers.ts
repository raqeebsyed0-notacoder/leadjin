/**
 * memoryTiers.ts — Jin's three memory tiers.
 *
 *  T1 product memory: product_memory in the caller's runtime DB handle.
 *  T2 audit:          memory_audit, append-only, one row per T1 write with
 *                     actor, at, before and after. There is deliberately no
 *                     update/delete helper for the audit table.
 *  T3 operator notes: an interface with a no-op local adapter used whenever
 *                     the operator store is absent — no network call and no
 *                     stored secret in that path.
 *
 * Schema is created here, idempotently, on first use. The module never opens
 * its own connection and never migrates an existing table's columns.
 */
import type Database from 'better-sqlite3';

export const T1_TABLE = 'product_memory';
export const T2_TABLE = 'memory_audit';

export interface MemoryRow {
  key: string;
  value: string;
  updated_at: string;
}

export interface AuditRow {
  id: number;
  key: string;
  actor: string;
  at: string;
  before: string | null;
  after: string | null;
}

/** T3. Implementations must not persist secrets; values are opaque notes. */
export interface OperatorNotes {
  put(note: string): Promise<void>;
  search(q: string): Promise<string[]>;
}

export interface WriteResult {
  ok: true;
  key: string;
  before: string | null;
  after: string | null;
  at: string;
}

/** Idempotent schema for T1 + T2. Safe to call on every public entry point. */
export function ensureSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS product_memory (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS memory_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT NOT NULL,
      actor TEXT NOT NULL,
      at TEXT NOT NULL,
      before TEXT,
      after TEXT
    );
  `);
}

function checkKey(key: string): void {
  if (typeof key !== 'string' || key.trim().length === 0) {
    throw new TypeError('memory key must be a non-empty string');
  }
}

/** T1 read. Returns null for an absent key; never fabricates a value. */
export function readMemory(db: Database.Database, key: string): string | null {
  checkKey(key);
  ensureSchema(db);
  const row = db.prepare(`SELECT value FROM ${T1_TABLE} WHERE key = ?`).get(key) as
    | { value: string }
    | undefined;
  return row ? row.value : null;
}

/** All T1 rows, ordered by key — a bounded, deterministic read. */
export function listMemory(db: Database.Database): MemoryRow[] {
  ensureSchema(db);
  return db.prepare(`SELECT key, value, updated_at FROM ${T1_TABLE} ORDER BY key`).all() as MemoryRow[];
}

/** T1 write + exactly one T2 audit row, atomically. */
export function writeMemory(
  db: Database.Database,
  key: string,
  value: string,
  actor = 'system',
): WriteResult {
  checkKey(key);
  if (typeof value !== 'string') throw new TypeError('memory value must be a string');
  const run = db.transaction((): WriteResult => {
    ensureSchema(db);
    const previous = db.prepare(`SELECT value FROM ${T1_TABLE} WHERE key = ?`).get(key) as
      | { value: string }
      | undefined;
    const before = previous ? previous.value : null;
    const at = new Date().toISOString();
    db.prepare(
      `INSERT INTO ${T1_TABLE} (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    ).run(key, value, at);
    db.prepare(
      `INSERT INTO ${T2_TABLE} (key, actor, at, before, after) VALUES (?, ?, ?, ?, ?)`,
    ).run(key, actor, at, before, value);
    return { ok: true, key, before, after: value, at };
  });
  return run();
}

/** T1 delete + one T2 audit row whose `after` is null. */
export function deleteMemory(
  db: Database.Database,
  key: string,
  actor = 'system',
): WriteResult {
  checkKey(key);
  const run = db.transaction((): WriteResult => {
    ensureSchema(db);
    const previous = db.prepare(`SELECT value FROM ${T1_TABLE} WHERE key = ?`).get(key) as
      | { value: string }
      | undefined;
    const before = previous ? previous.value : null;
    const at = new Date().toISOString();
    db.prepare(`DELETE FROM ${T1_TABLE} WHERE key = ?`).run(key);
    db.prepare(
      `INSERT INTO ${T2_TABLE} (key, actor, at, before, after) VALUES (?, ?, ?, ?, ?)`,
    ).run(key, actor, at, before, null);
    return { ok: true, key, before, after: null, at };
  });
  return run();
}

/** T2 read for verification: append-only rows in insertion order. */
export function listAudit(db: Database.Database, key?: string): AuditRow[] {
  ensureSchema(db);
  if (key !== undefined) {
    return db
      .prepare(`SELECT id, key, actor, at, before, after FROM ${T2_TABLE} WHERE key = ? ORDER BY id`)
      .all(key) as AuditRow[];
  }
  return db
    .prepare(`SELECT id, key, actor, at, before, after FROM ${T2_TABLE} ORDER BY id`)
    .all() as AuditRow[];
}

/** The no-op local adapter: writes nothing, returns no notes, touches no network. */
export const noopOperatorNotes: OperatorNotes = Object.freeze({
  async put(_note: string): Promise<void> {
    return;
  },
  async search(_q: string): Promise<string[]> {
    return [];
  },
});

/** T3 resolution: absent operator store means the no-op adapter, never a stub network call. */
export function resolveOperatorNotes(store?: OperatorNotes | null): OperatorNotes {
  return store ?? noopOperatorNotes;
}
