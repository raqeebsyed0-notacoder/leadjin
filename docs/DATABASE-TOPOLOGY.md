status: verified 2026-11-28

# Database topology

## Two databases, never merged

The runtime database and the original production database are separate; they
are never merged, copied, or one replacing the other.

- Runtime database: `app/leadjin.db` (read/write, used by `app/server.ts`).
- Original production database: reached through the `app/data/leadjin.db`
  symlink (read-only discovery path).

`src/services/dbTopology.ts` reads both; each table has one owner.

## Runtime database (`app/leadjin.db`)

| Table | Rows |
|---|---|
| leads | 396 |
| users | 332 |
| outreach_messages | 140 |
| activity_log | 777 |
| intent_signals | 34 |
| company_cache | 199 |
| credit_transactions | 348 |
| sessions | 495 |
| verification_records | 8 |
| email_templates | 1 |

## Original production database (via `app/data/leadjin.db` symlink)

| Table | Rows |
|---|---|
| leads | 867 |
| intent_signals | 8333 |
| email_templates | 55 |
| employee_work_log | 922 |
| users | 3 |

## Ownership

Each table has one owner:

- The runtime DB owns its own tables, and the running product writes
  `outreach_messages`, `activity_log`, `intent_signals`, `company_cache`,
  `credit_transactions`, `sessions`, `verification_records` and
  `email_templates` (1 row).
- The original production DB owns `leads` (867), `intent_signals` (8333),
  `email_templates` (55), `employee_work_log` (922) and `users` (3).

`src/services/dbTopology.ts` is the only module that knows about both
databases.

## Symlink

`app/data/leadjin.db` is a symlink to the original production database. It is
a read-only discovery path to preserved history, not the runtime DB. The
running app opens `app/leadjin.db`; it does not open the symlinked path.

## Consuming both databases

`src/services/dbTopology.ts` resolves both databases. It is the single
module aware of the dual layout; no other module reads the production DB
directly.

## Notes

- A table that does not exist in a database is reported as `absent`, never as
  `0`.
- The runtime DB is created and managed by the live service; production rows
  are preserved history.
