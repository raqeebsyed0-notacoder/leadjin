# Email safety — hard suppression gate

Every outbound path in LEADJIN is gated on the recipient address itself. An
address in `suppression_list` is blocked even when there is no `leads` row for
it. This closes the hole left by the old `LEFT JOIN leads ... do_not_contact`
queue filter, which let lead-less addresses through.

## The three gates

1. **Suppression list** — `isSuppressed(db, email)` does a case-insensitive
   exact match on `suppression_list.email`. This is a hard block, independent of
   any lead row. `assertSendable` returns `{ok:false, reason:'suppressed'}`.
2. **`leads.do_not_contact`** — checked only when a matching lead row exists
   (case-insensitive email match). Returns `{ok:false, reason:'do_not_contact'}`.
3. **Unsubscribe HMAC token** — `GET`/`POST /api/unsubscribe` verify
   `createHmac('sha256', LEADJIN_ADMIN_SECRET).update(email).digest('hex').slice(0,16)`
   before making any change. This check is unchanged. Both routes now also
   insert the address into `suppression_list` with reason `unsubscribed`, so an
   address with no lead row stays suppressed.

`assertSendable` also applies a trivial format check
(`{ok:false, reason:'invalid_email'}`). Order inside the gate: format →
suppression → do_not_contact. No send path proceeds on `{ok:false}`.

## Every outbound path and its gate

| Path | Send call | Gate |
|---|---|---|
| System queue (`lead_id='system'`, SMTP) | `server.ts:3958 transporter.sendMail` | `NOT EXISTS` in the SELECT (`server.ts:3927`) **and** `assertSendable` at `server.ts:3934` |
| User queue via Gmail API | `server.ts:4053 gmail.users.messages.send` | `NOT EXISTS` in the SELECT (`server.ts:3991`) **and** `assertSendable` at `server.ts:3998`, upstream of both branches |
| User queue via SMTP fallback | `server.ts:4065 transporter.sendMail` | same gate at `server.ts:3998` |
| Google connection self-test | `server.ts:4275 gmail.users.messages.send` | `assertSendable` at `server.ts:4246` |
| Artisan `POST /outreach/send` (records outreach as sent; no direct SMTP call) | `src/services/artisanRoutes.ts:187` | `assertSendable` at `artisanRoutes.ts:204`; blocked sends are never inserted into `outreach_messages` |

A suppressed queue item is skipped (`continue`), an `email_events` row is
written with `event_type='suppressed'` and `metadata.reason` (`suppressed`,
`do_not_contact`, or `invalid_email`), and the queue row is set to `CANCELLED`
so it cannot be retried. The artisan route and the connection test have no
queue id, so their skip is recorded in `activity_log` with type
`EMAIL_SUPPRESSED`. No real email is sent on any of these paths when gated.

## DB tables

- `suppression_list` — `email TEXT PRIMARY KEY COLLATE NOCASE, reason TEXT,
  source TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))`, plus index
  `idx_suppression_list_email`. Created on boot by `ensureSuppressionSchema(db)`
  at `server.ts:978`, immediately after the core `CREATE TABLE IF NOT EXISTS`
  block.
- `leads` — existing `email` and `do_not_contact` columns are read, never
  weakened. Unsubscribe still sets `do_not_contact = 1` on matching lead rows.
- `email_queue` — `status` becomes `CANCELLED` on a gated skip.
- `email_events` / `activity_log` — existing tables used to record the skip.

`suppress(db, email, reason, source)` and `unsuppress(db, email)` are
admin-only helpers in `src/services/suppressionGate.ts`; no public route calls
them. Unsubscribe uses `suppress(..., 'unsubscribed', 'unsubscribe_get|post')`.

## Proof that no path bypasses the gates

Static: `grep -n "assertSendable\\|isSuppressed" server.ts src/services/artisanRoutes.ts`
must show a gate for all five outbound sites listed above; both queue SELECTs
must show the `NOT EXISTS` suppression predicate.

Dynamic (temporary DB only — **never** the live `leadjin.db`): a probe opens
`/tmp/phase3-email-test.db`, creates a minimal `leads` table, calls
`ensureSuppressionSchema`, inserts `blocked@example.com` into
`suppression_list`, inserts a `do_not_contact=1` lead, then asserts:

- `assertSendable(db, 'blocked@example.com')` → `{ok:false, reason:'suppressed'}`
- `assertSendable(db, 'dnc@example.com')` → `{ok:false, reason:'do_not_contact'}`
- `assertSendable(db, 'clean@example.com')` → `{ok:true}`

Because every send site calls the same `assertSendable`, and both queue SELECTs
also exclude suppressed addresses in SQL, no path can reach a send call for a
suppressed address. `npx tsc --noEmit` must add no errors.

Actual command output for this run is recorded in the lane handoff under
`work/audit/leadjin-phase3-2026-11-27/handoffs/email.md`.
