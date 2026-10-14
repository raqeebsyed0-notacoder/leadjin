import Database from "better-sqlite3";
import fs from "fs";

const path = process.argv[2] || "leadjin.db";
const db = new Database(path, { readonly: true });

const tables = db
  .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
  .all()
  .map((r) => r.name);
console.log("TABLES(" + tables.length + "):", tables.join(", "));

function mask(s, n = 6) {
  if (s == null) return String(s);
  s = String(s);
  return s.slice(0, n) + "…(len=" + s.length + ")";
}

for (const t of ["users", "sessions"]) {
  if (!tables.includes(t)) continue;
  const cols = db.prepare("PRAGMA table_info(" + t + ")").all().map((c) => c.name);
  console.log("\n-- " + t + " columns --", cols.join(", "));
}

if (tables.includes("users")) {
  console.log("\n-- users rows (masked) --");
  for (const u of db.prepare("SELECT * FROM users").all()) {
    const email = u.email ?? u.username ?? u.name;
    console.log(
      "id=" + u.id,
      "email=" + mask(email, 3),
      "hashlen=" + (u.password_hash ? String(u.password_hash).length : "n/a"),
      "created=" + (u.created_at ?? "")
    );
  }
}

if (tables.includes("sessions")) {
  console.log("\n-- sessions rows (masked) --");
  for (const s of db
    .prepare("SELECT * FROM sessions")
    .all()) {
    console.log(
      "user_id=" + s.user_id,
      "token=" + mask(s.token, 4),
      "expires=" + s.expires_at,
      "created=" + (s.created_at ?? "")
    );
  }
}

const cache = JSON.parse(fs.readFileSync("tests/.auth-cache.json", "utf8"));
const u = db.prepare("SELECT * FROM users WHERE email = ?").get(cache.email);
console.log("\nauth-cache email matches a user row:", !!u, u ? "user_id=" + u.id : "");
const s = db.prepare("SELECT * FROM sessions WHERE token = ?").get(cache.token);
console.log(
  "auth-cache token matches a live session:",
  !!s,
  s ? "user_id=" + s.user_id + " expires=" + s.expires_at : ""
);
