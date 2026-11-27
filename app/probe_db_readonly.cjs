// Read-only DB probe — no writes. Uses better-sqlite3 in read-only mode.
const Database = require('better-sqlite3');
const path = require('path');
const DB_PATH = path.join(process.env.KANBAN_WORKSPACE_DB || '/home/euphoria/LEADJIN COMPLETE FOLDER/leadjin-prod-ready/leadjin.db');
// read-only handle
const db = new Database(DB_PATH, { readonly: true, fileMustExist: true });

const q = db.prepare(
  `SELECT
     COUNT(*) AS total,
     COALESCE(MAX(id),0) AS max_id,
     COUNT(CASE WHEN status='PENDING' THEN 1 END) AS pending,
     COUNT(CASE WHEN status='SENT' THEN 1 END) AS sent,
     COUNT(CASE WHEN status='FAILED' THEN 1 END) AS failed,
     COUNT(CASE WHEN lead_id='system' THEN 1 END) AS system_rows
   FROM email_queue`
).get();
console.log('=== email_queue aggregate (read-only) ===');
console.log(JSON.stringify(q, null, 2));

// Recent safe rows only — no body, no token
const recent = db.prepare(
  `SELECT id, lead_id, to_email, subject, status, created_at, sent_at, last_error
   FROM email_queue ORDER BY id DESC LIMIT 8`
).all();
console.log('=== recent email_queue rows (safe columns only) ===');
console.log(JSON.stringify(recent, null, 2));

// Targeted: any existing reset email for founder (idempotency check)
const founder = db.prepare(
  `SELECT id, to_email, subject, status, created_at, sent_at, last_error
   FROM email_queue
   WHERE to_email = ? AND subject LIKE '%password%' ESCAPE '\\'
   ORDER BY id DESC LIMIT 5`
).all(['raqeebsyed0@gmail.com']);
console.log('=== existing founder password-reset rows (sanitized) ===');
console.log(JSON.stringify(founder, null, 2));

db.close();
console.log('probe done');
