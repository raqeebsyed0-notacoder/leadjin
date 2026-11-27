# LeadJin dual-database topology

Phase 3 (2026-11-27). Both databases are legitimate and both stay available.
Nothing in this topology merges, copies over, or discards either one.

| | PRODUCTION / ORIG | RUNTIME / MIG |
|---|---|---|
| Canonical path | `/home/euphoria/LEADJIN COMPLETE FOLDER/LEADJIN SEPERATE BUSINESS MODULE/leadjin/leadjin/data/leadjin.db` | `/home/euphoria/euphoria-v2/work/leadjin/app/leadjin.db` |
| Purpose | Preserved production history, data of record for historical rows | Live application DB used by `app/server.ts` |
| Default access | Read-only | Read/write by the live service |
| User tables | 37 | 36 |
| `leads` | 867 | 335 |
| `intent_signals` | 8,333 | 34 |
| `users` | 3 (real) | 257 (252 test-only) |
| `email_templates` | 55 (all the same default subject+body) | 1 |
| `suppression_list` | 2 | absent |
| `jin_chat_messages` | 60 | absent |
| Size | 13,729,792 B | 1,847,296 B (plus WAL) |
| Integrity | `ok` | `ok` |

Counts above are live reads from `describeDatabases()` on 2026-11-27; a table that
does not exist is reported as the string `absent`, never as `0`.

## Why two databases

The original business module accumulated the real production history. The
migrated app was rebuilt around a smaller, cleaner runtime DB and gained
columns the ORIG schema never had (`leads.meeting_ready`, `leads.verified_real`,
`leads.provenance_url`) plus the `mail_accounts` table. Neither file can replace
the other: ORIG holds the history, MIG holds the running product's state and
newer schema.

## Table ownership and readers

- **ORIG-owned history**: `suppression_list`, `jin_chat_messages`, the 55
  `email_templates`, and the 867 `leads` rows. The original module's
  `server.ts` and `jinCompleteRoutes.ts` are the historical writers. That tree
  is READ-ONLY for this whole exercise.
- **RUNTIME-owned**: `mail_accounts` (read/written by `app/server.ts` around
  lines 3858-3884), 257 `users`, 335 current `leads`, and the newer lead
  columns. `app/server.ts` opens this DB at line 714 using
  `DATABASE_PATH || DB_PATH || "leadjin.db"` and passes the handle to services.
- `src/services/dbTopology.ts` is the **only** module that knows about both
  databases. It is not imported by `server.ts` in this wave (another lane owns
  `server.ts`); it is a standalone, auditable API plus a CLI.

## The symlink

`app/data/leadjin.db` is a symlink to the ORIG DB. It was dangling because its
target omitted the `COMPLETE FOLDER` path segment. It has been repaired to:

```
/home/euphoria/euphoria-v2/work/leadjin/app/data/leadjin.db
  -> /home/euphoria/LEADJIN COMPLETE FOLDER/LEADJIN SEPERATE BUSINESS MODULE/leadjin/leadjin/data/leadjin.db
```

The link is a **read-only discovery path to preserved history**, not the
runtime DB. The running app does not open `app/data/leadjin.db`; it opens
`app/leadjin.db`. `dbTopology.ts` resolves the link with `realpathSync()` to
derive the default `PRODUCTION_DB_PATH`, falling back to the literal ORIG path
if the link is ever broken again. Env overrides: `LEADJIN_PROD_DB_PATH` for the
source, `DATABASE_PATH` / `DB_PATH` for the runtime target.

Repair command if it dangles again:

```sh
ln -sfn "/home/euphoria/LEADJIN COMPLETE FOLDER/LEADJIN SEPERATE BUSINESS MODULE/leadjin/leadjin/data/leadjin.db" \
  /home/euphoria/euphoria-v2/work/leadjin/app/data/leadjin.db
test -e /home/euphoria/euphoria-v2/work/leadjin/app/data/leadjin.db && echo resolved
```

## Import contract (`src/services/dbTopology.ts`)

`importProductionHistory({ dryRun = true, tables? })` copies production history
that the runtime DB is missing **into the runtime DB only**. It never writes to
ORIG, never updates or deletes a row, and is idempotent.

- **Guard**: `dryRun:false` requires `LEADJIN_ALLOW_PROD_IMPORT=1`; otherwise it
  throws without opening a write handle. Dry runs are always allowed and open
  the runtime DB with `readonly:true`.
- **`suppression_list`** — email-keyed hard list. Target table is absent, so
  apply creates it from the ORIG DDL, then `INSERT OR IGNORE` on `email`.
- **`jin_chat_messages`** — target absent; created from ORIG DDL, then
  `INSERT OR IGNORE` on `id`.
- **`email_templates`** — rows whose `subject`+`body` already exist in the
  runtime DB are skipped (`IS` comparison, NULL-safe). Live result: all 55 ORIG
  rows are duplicates of the one runtime default template, so 0 candidates.
- **`leads`** — only rows whose `lead_id` is absent from the runtime DB, via
  `INSERT OR IGNORE` on that natural key. Rows with an email matching `%test%`
  (and rows belonging to a source user whose email matches `%test%`) are
  skipped. Live result: 859 candidates from 867; 3 IDs already exist and 5 are
  test emails. `created_at` is copied verbatim.

**Provenance marker.** The brief calls for `source='orig-production'`. Neither
schema has a column literally named `source`; ORIG's `email_source` and
`source_url` hold real source values and must not be overwritten. The import
therefore stamps `'orig-production'` into the runtime-only
`leads.provenance_url` column, which is exactly the newer provenance field and
is absent from ORIG rows. This is recorded as `IMPORT_SOURCE` in the code and
verified as 859 marked rows in the synthetic apply test.

`attachProductionHistory(db)` attaches ORIG as `prod` and is safe to call twice
(a second call returns `prod` without a duplicate attach). It tries a read-only
URI first; this better-sqlite3 build has URI filenames disabled, so it falls
back to a plain `ATTACH` and enforces read-only by only ever issuing SELECTs
against `prod.*`.

Result shape: `{ attempted, inserted, skipped, written, per_table }`. In a dry
run `inserted` is how many rows *would* be inserted, and `written` is always 0.
Actual application is a parent decision; no `--apply` was run in this wave.

CLI:

```sh
cd /home/euphoria/euphoria-v2/work/leadjin/app
npx tsx scripts/import-production-history.mjs --dry-run
# only with explicit approval:
LEADJIN_ALLOW_PROD_IMPORT=1 npx tsx scripts/import-production-history.mjs --apply
```

## Restore procedure (Phase 3 baseline backup)

The rollback snapshot is read-only; never overwrite it:
`/home/euphoria/euphoria-v2/work/leadjin/backup/phase3-2026-11-27/db/mig-leadjin.db`

```sh
# 1. Stop the live app (never touch hermes-gateway-* units)
systemctl --user stop euphoria-leadjin.service

# 2. Move the live DB and its WAL/SHM aside — do NOT delete them
cd /home/euphoria/euphoria-v2/work/leadjin/app
mkdir -p /tmp/leadjin-rollback-$(date +%F-%H%M)
mv leadjin.db leadjin.db-shm leadjin.db-wal /tmp/leadjin-rollback-$(date +%F-%H%M)/ 2>/dev/null || true

# 3. Restore from the Phase 3 backup
cp /home/euphoria/euphoria-v2/work/leadjin/backup/phase3-2026-11-27/db/mig-leadjin.db leadjin.db

# 4. Start and probe
systemctl --user start euphoria-leadjin.service
curl -s --max-time 5 http://127.0.0.1:3001/api/health
```

The ORIG history DB has its own backup at
`.../backup/phase3-2026-11-27/db/orig-leadjin.db`; if the symlink is repaired
as above, no file copy of ORIG is needed. Moving the `-wal`/`-shm` files aside
with the DB prevents a stale WAL from replaying onto the restored snapshot.
