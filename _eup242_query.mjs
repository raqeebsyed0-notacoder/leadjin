import Database from "better-sqlite3";
import fs from "fs";

const cache = JSON.parse(fs.readFileSync("tests/.auth-cache.json", "utf8"));
const paths = [
  "leadjin.db",
  "/home/euphoria/LEADJIN COMPLETE FOLDER/LEADJIN SEPERATE BUSINESS MODULE/leadjin/leadjin/data/leadjin.db",
];

for (const p of paths) {
  console.log("\n== " + p + " ==");
  try {
    const db = new Database(p, { readonly: true });
    const tbls = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((r) => r.name);
    const emailMatch = db
      .prepare("SELECT COUNT(*) c FROM users WHERE email = ?")
      .get(cache.email).c;
    const tokenSessions = db
      .prepare("SELECT COUNT(*) c FROM sessions WHERE token = ?")
      .get(cache.token).c;
    console.log("exposed email matches user:", emailMatch);
    console.log("exposed token matches session:", tokenSessions);
    if (tbls.includes("users")) {
      const testUsers = db
        .prepare("SELECT id, email FROM users WHERE email LIKE '%@leadjin-test.com'")
        .all();
      console.log("users with @leadjin-test.com:", testUsers.length);
      for (const u of testUsers) {
        const sessions = db
          .prepare("SELECT COUNT(*) c FROM sessions WHERE user_id = ?")
          .get(u.id).c;
        console.log("   id=" + u.id, "email=" + u.email.slice(0, 5) + "…", "sessions=" + sessions);
      }
      const totalUsers = db.prepare("SELECT COUNT(*) c FROM users").get().c;
      const totalSessions = db.prepare("SELECT COUNT(*) c FROM sessions").get().c;
      console.log("total users:", totalUsers, "total sessions:", totalSessions);
    }
  } catch (e) {
    console.log("ERR", e.message);
  }
}
