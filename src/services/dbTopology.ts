/**
 * dbTopology.ts — the single place in LeadJin that knows about BOTH databases.
 *
 *  - PRODUCTION / ORIG: preserved production history. Read-only by default.
 *    Reached through the repaired symlink app/data/leadjin.db.
 *  - RUNTIME / MIG: the live application DB (server.ts default ./leadjin.db).
 *
 * Nothing here writes to the ORIG tree. Imports copy missing history rows into
 * the runtime DB, never overwrite or delete anything, and are dry-run by default.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import Database from 'better-sqlite3';

// Phase 3 fixed path (SHARED-RULES.md); absolute so callers cannot resolve
// a different tree when launched from another working directory.
const APP_DIR = '/home/euphoria/euphoria-v2/work/leadjin/app';

/** The repaired symlink: app/data/leadjin.db -> ORIG data/leadjin.db */
export const PRODUCTION_DB_LINK = path.join(APP_DIR, 'data', 'leadjin.db');

/** Last-resort ORIG location if the symlink is ever broken again. */
export const ORIG_DB_ABSOLUTE =
  '/home/euphoria/LEADJIN COMPLETE FOLDER/LEADJIN SEPERATE BUSINESS MODULE/leadjin/leadjin/data/leadjin.db';

function resolveProductionDbPath(): string {
  if (process.env.LEADJIN_PROD_DB_PATH) return process.env.LEADJIN_PROD_DB_PATH;
  try {
    // Default: the ORIG absolute path, resolved via the repaired symlink.
    return fs.realpathSync(PRODUCTION_DB_LINK);
  } catch {
    return ORIG_DB_ABSOLUTE;
  }
}

export const PRODUCTION_DB_PATH = resolveProductionDbPath();
export const RUNTIME_DB_PATH =
  process.env.DATABASE_PATH || process.env.DB_PATH || './leadjin.db';

export const PRODUCTION_ALIAS = 'prod';
/** Provenance marker stamped on lead rows imported from ORIG history. */
export const IMPORT_SOURCE = 'orig-production';

export const TRACKED_TABLES = [
  'leads',
  'intent_signals',
  'users',
  'email_templates',
  'suppression_list',
  'jin_chat_messages',
] as const;
export type TrackedTable = (typeof TRACKED_TABLES)[number];

export const IMPORTABLE_TABLES = [
  'suppression_list',
  'jin_chat_messages',
  'email_templates',
  'leads',
] as const;
export type ImportableTable = (typeof IMPORTABLE_TABLES)[number];

export interface DatabaseDescription {
  path: string;
  exists: boolean;
  /** File size in bytes (null when the file does not exist). */
  size: number | null;
  sizeBytes: number | null;
  /** PRAGMA integrity_check result ("ok" on a healthy DB), null when unreadable. */
  integrity: string | null;
  /** User tables (sqlite_% internal tables excluded), null when unreadable. */
  userTables: number | null;
  /** Row counts; the literal string "absent" means the table does not exist. */
  rows: Record<TrackedTable, number | 'absent'>;
}

function tableExists(db: Database.Database, table: string): boolean {
  return Boolean(
    db.prepare("select 1 from sqlite_master where type='table' and name=?").get(table),
  );
}

function columnsOf(db: Database.Database, table: string): string[] {
  return (db.prepare(`pragma table_info(${table})`).all() as Array<{ name: string }>).map(
    (c) => c.name,
  );
}

function scalar<T>(db: Database.Database, sql: string, ...params: unknown[]): T {
  return db.prepare(sql).get(...params) as T;
}

function describeOne(rawPath: string): DatabaseDescription {
  const resolved = path.resolve(rawPath);
  const exists = fs.existsSync(resolved);
  const rows = {} as Record<TrackedTable, number | 'absent'>;
  for (const t of TRACKED_TABLES) rows[t] = 'absent';
  const description: DatabaseDescription = {
    path: resolved,
    exists,
    size: exists ? fs.statSync(resolved).size : null,
    sizeBytes: exists ? fs.statSync(resolved).size : null,
    integrity: null,
    userTables: null,
    rows,
  };
  if (!exists) return description;

  const db = new Database(resolved, { readonly: true, fileMustExist: true });
  try {
    description.integrity = scalar<{ integrity_check: string }>(
      db,
      'PRAGMA integrity_check',
    ).integrity_check;
    description.userTables = scalar<{ n: number }>(
      db,
      "select count(1) as n from sqlite_master where type='table' and name not like 'sqlite_%'",
    ).n;
    for (const t of TRACKED_TABLES) {
      if (!tableExists(db, t)) {
        rows[t] = 'absent'; // never report 0 for a table that is not there
        continue;
      }
      const cols = columnsOf(db, t);
      const countColumn = cols[0] || 'rowid';
      rows[t] = scalar<{ n: number }>(db, `select count(${countColumn}) as n from ${t}`).n;
    }
  } finally {
    db.close();
  }
  return description;
}

/** Live description of both databases. Pure reads; opens no read-write handle. */
export function describeDatabases(): {
  production: DatabaseDescription;
  runtime: DatabaseDescription;
} {
  return {
    production: describeOne(PRODUCTION_DB_PATH),
    runtime: describeOne(RUNTIME_DB_PATH),
  };
}

function readOnlyUri(filename: string): string {
  // encodeURI keeps '/' but escapes the spaces in the ORIG path.
  return `file:${encodeURI(filename)}?mode=ro`;
}

/**
 * ATTACH the production DB as `prod`. Idempotent: a second call returns the
 * alias without attaching twice. Tries a read-only URI first (when the driver
 * build accepts URI filenames), then falls back to a plain path; in either
 * case the code only ever SELECTs from `prod.*` and never writes to it.
 */
export function attachProductionHistory(db: Database.Database): string {
  const already = (db.prepare('PRAGMA database_list').all() as Array<{ name: string }>).some(
    (row) => row.name === PRODUCTION_ALIAS,
  );
  if (already) return PRODUCTION_ALIAS;

  let attachedWithUri = false;
  try {
    db.prepare(`ATTACH DATABASE ? AS ${PRODUCTION_ALIAS}`).run(
      readOnlyUri(PRODUCTION_DB_PATH),
    );
    attachedWithUri = true;
  } catch {
    // This better-sqlite3 build has SQLITE_USE_URI off; plain ATTACH still
    // gives us a read-only-by-convention handle to the preserved history.
    db.prepare(`ATTACH DATABASE ? AS ${PRODUCTION_ALIAS}`).run(PRODUCTION_DB_PATH);
  }

  const bound = (
    db.prepare('PRAGMA database_list').all() as Array<{ name: string; file: string }>
  ).find((row) => row.name === PRODUCTION_ALIAS);
  if (!bound) throw new Error('ATTACH succeeded but the prod alias is not present');
  const boundFile = path.resolve(bound.file || '');
  const expected = path.resolve(PRODUCTION_DB_PATH);
  if (!attachedWithUri && boundFile !== expected) {
    throw new Error(`prod alias is bound to ${boundFile}, expected ${expected}`);
  }
  return PRODUCTION_ALIAS;
}

export interface ImportOptions {
  /** Dry-run performs every SELECT and writes nothing. Default true. */
  dryRun?: boolean;
  /** Restrict the copy to these tables. Default: all four importable tables. */
  tables?: ImportableTable[];
}

export interface PerTableResult {
  sourceCount: number;
  attempted: number;
  inserted: number;
  skipped: number;
  sample: string[];
  targetCreated: boolean;
  note?: string;
}

export interface ImportResult {
  dryRun: boolean;
  source: string;
  target: string;
  attempted: number;
  /** Dry-run: how many rows WOULD be inserted. Apply: rows actually inserted. */
  inserted: number;
  skipped: number;
  /** Rows actually written. Always 0 in a dry run. */
  written: number;
  per_table: Record<string, PerTableResult>;
}

function normalizeTables(tables?: ImportableTable[]): ImportableTable[] {
  if (!tables || tables.length === 0) return [...IMPORTABLE_TABLES];
  const unknown = tables.filter((t) => !IMPORTABLE_TABLES.includes(t));
  if (unknown.length) throw new Error(`Unknown import tables: ${unknown.join(', ')}`);
  return [...tables];
}

/** SQL filter identifying production rows the runtime is missing. */
function missingFilter(
  table: ImportableTable,
  targetExists: boolean,
  sourceHasUsers: boolean,
): string {
  const conditions: string[] = [];
  if (table === 'leads') {
    if (targetExists) {
      conditions.push('NOT EXISTS (SELECT 1 FROM main.leads m WHERE m.lead_id = s.lead_id)');
    }
    conditions.push("(s.email IS NULL OR lower(s.email) NOT LIKE '%test%')");
    if (sourceHasUsers) {
      conditions.push(
        "NOT EXISTS (SELECT 1 FROM prod.users u WHERE u.id = s.user_id AND lower(u.email) LIKE '%test%')",
      );
    }
  } else if (table === 'email_templates' && targetExists) {
    // Subject+body identity: skip templates already present in the runtime DB.
    conditions.push(
      'NOT EXISTS (SELECT 1 FROM main.email_templates m WHERE m.subject IS s.subject AND m.body IS s.body)',
    );
  } else if (targetExists) {
    const key = table === 'suppression_list' ? 'email' : 'id';
    conditions.push(
      `NOT EXISTS (SELECT 1 FROM main.${table} m WHERE m.${key} = s.${key})`,
    );
  }
  return conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';
}

/**
 * Idempotent, non-destructive copy of ORIG history into the runtime DB.
 *
 * Guard: --apply-style runs require LEADJIN_ALLOW_PROD_IMPORT === '1';
 * dry runs are always allowed. There is no UPDATE, DELETE or DROP here —
 * only INSERT OR IGNORE into tables the runtime is missing rows from, and
 * CREATE TABLE IF NOT EXISTS for the two tables the runtime lacks entirely.
 */
export function importProductionHistory(options: ImportOptions = {}): ImportResult {
  const dryRun = options.dryRun !== false;
  if (!dryRun && process.env.LEADJIN_ALLOW_PROD_IMPORT !== '1') {
    throw new Error(
      'REFUSED: LEADJIN_ALLOW_PROD_IMPORT must be exactly "1" to apply the production import ' +
        '(dry runs are always allowed).',
    );
  }
  const selected = normalizeTables(options.tables);
  const targetPath = path.resolve(RUNTIME_DB_PATH);
  // Dry run opens the runtime DB read-only: a stray write would throw.
  const db = new Database(targetPath, { readonly: dryRun, fileMustExist: true });
  const result: ImportResult = {
    dryRun,
    source: PRODUCTION_DB_PATH,
    target: targetPath,
    attempted: 0,
    inserted: 0,
    skipped: 0,
    written: 0,
    per_table: {},
  };

  try {
    attachProductionHistory(db);
    const prodHasUsers = Boolean(
      db.prepare("select 1 from prod.sqlite_master where type='table' and name='users'").get(),
    );

    const applyAll = () => {
      for (const table of selected) {
        const targetExists = Boolean(
          db.prepare("select 1 from sqlite_master where type='table' and name=?").get(table),
        );
        // NOTE: the table-valued pragma_table_info() ignores schema qualifiers
        // and would return main's columns. The statement form honours `prod.`.
        const srcCols = (
          db.pragma(`prod.table_info(${table})`) as Array<{ name: string }>
        ).map((c) => c.name);
        const destCols = targetExists ? columnsOf(db, table) : [...srcCols];
        const sourceCount = scalar<{ n: number }>(
          db,
          `select count(1) as n from prod.${table}`,
        ).n;
        const filter = missingFilter(table, targetExists, prodHasUsers);

        // Intersection of source and destination column names; the ORIG and
        // MIG leads schemas differ (MIG adds meeting_ready, verified_real, ...).
        const common = srcCols.filter((c) => destCols.includes(c));
        if (!common.length) throw new Error(`No shared columns for ${table}`);
        const selectExprs = common.map((c) => `s."${c}"`);
        const insertCols = [...common];

        // The brief's source='orig-production' marker. Neither schema has a
        // column literally named `source`; MIG's provenance column is the
        // non-destructive place for it (ORIG email_source/source_url are kept).
        if (
          table === 'leads' &&
          !srcCols.includes('provenance_url') &&
          destCols.includes('provenance_url')
        ) {
          selectExprs.push(`'${IMPORT_SOURCE}' as "provenance_url"`);
          insertCols.push('provenance_url');
        }

        const candidateSql =
          `select ${selectExprs.join(', ')} from prod.${table} s${filter}`;
        const candidates = db.prepare(candidateSql).all() as Array<Record<string, unknown>>;
        const attempted = candidates.length;
        const naturalKey =
          table === 'leads' ? 'lead_id' : table === 'suppression_list' ? 'email' : 'id';
        const sample = candidates
          .slice(0, 3)
          .map((row) => String(row[naturalKey] ?? ''));

        let inserted = attempted; // dry run: what WOULD be inserted
        let written = 0;
        let targetCreated = false;
        let note: string | undefined;

        if (!dryRun) {
          if (!targetExists) {
            const ddl = scalar<{ sql: string } | undefined>(
              db,
              "select sql from prod.sqlite_master where type='table' and name=?",
              table,
            );
            if (!ddl?.sql) throw new Error(`No source DDL for ${table}`);
            db.exec(ddl.sql);
            targetCreated = true;
          }
          const info = db
            .prepare(
              `insert or ignore into ${table} (${insertCols.map((c) => `"${c}"`).join(', ')}) ` +
                candidateSql,
            )
            .run();
          inserted = info.changes;
          written = info.changes;
        } else if (!targetExists) {
          note = 'target table absent; would be created from ORIG schema on apply';
        }

        const skipped = Math.max(0, sourceCount - inserted);
        result.attempted += attempted;
        result.inserted += inserted;
        result.skipped += skipped;
        result.written += written;
        result.per_table[table] = {
          sourceCount,
          attempted,
          inserted,
          skipped,
          sample,
          targetCreated,
          ...(note ? { note } : {}),
        };
      }
    };

    if (dryRun) {
      applyAll(); // SELECTs only; connection is read-only
    } else {
      db.transaction(applyAll)();
    }
    return result;
  } finally {
    db.close();
  }
}
