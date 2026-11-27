import Database from 'better-sqlite3';
const db = new Database('/tmp/phase3-sqlcheck.db');
db.exec(`CREATE TABLE IF NOT EXISTS leads (lead_id TEXT PRIMARY KEY, user_id INTEGER, name TEXT, title TEXT, company TEXT, industry TEXT, email TEXT, phone TEXT, linkedin TEXT, twitter TEXT, website TEXT, lead_score INTEGER, email_source TEXT, created_at TEXT)`);
const sql = `INSERT OR IGNORE INTO leads
      (lead_id, user_id, name, title, company, industry, email, phone, linkedin, twitter, website, lead_score, email_source, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
try {
  const stmt = db.prepare(sql);
  const info = stmt.run('x1', 1, 'n', 't', 'c', 'i', 'e', 'p', 'l', 'tw', 'w', 0, 'src', new Date().toISOString());
  console.log(JSON.stringify({ ok: true, changes: info.changes, count: (db.prepare('select count(lead_id) as c from leads').get() as any).c }));
} catch (e: any) {
  console.log(JSON.stringify({ ok: false, error: String(e?.message) }));
}
db.close();
