# KIMI TASK SHEET — LeadJin Hardening (Apr 4, 2026)

> **Rule:** Execute EXACTLY what is written. Do NOT improvise, skip steps, or add features not listed. If something is unclear, stop and ask — do not guess. Every task has a verification step. Do not mark done until verification passes.

---

## RULES (READ FIRST)

1. **No new files** — edit existing `server.ts` and `src/App.tsx` unless explicitly told to create a file
2. **No refactoring** — fix only what's listed, don't reorganize code around it
3. **Currency is SAR** — never use `$`, `USD`, or `dollars` anywhere in UI text
4. **Test after each task** — run `npm run build` to confirm no TypeScript errors
5. **Commit after each task** — `git commit -m "TASK-XX: description"`
6. **App.tsx is 5,332 lines** — use line numbers from this sheet as approximate guides, search for the exact string
7. **server.ts is 5,528 lines** — same rule

---

## TASK 1: Fix $ → SAR in Quotation UI (4 locations)

**File:** `src/App.tsx`

Search for these exact strings and replace `$` with `SAR `:

1. Line ~1450: `` `Quotation #${data.invoice_id} created — Total: $${data.total.toLocaleString()}` `` → change `$` to `SAR `
2. Line ~2148: PDF HTML quotation template — find `$` before `total` or `amount`, change to `SAR `
3. Line ~4630: Quotation table display — find `$` currency prefix, change to `SAR `
4. Line ~4772: Invoice display — find `$` currency prefix, change to `SAR `

**Verify:** Search entire `App.tsx` for the regex `\$\$\{` — should return 0 matches after fix.

---

## TASK 2: Add Global Refresh Button to Terminal Platform Header

**File:** `/home/euphoria/terminal permanent setup/ui/dist/index.html`

Find the header section (around line 1600-1630, near the notification bell `#notifBell`). Add a refresh button BEFORE the notification bell:

```html
<button id="globalRefresh" title="Refresh all data" style="background:none;border:none;cursor:pointer;padding:6px;margin-right:8px;color:var(--text-secondary);font-size:18px;" onclick="globalRefreshAll()">
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>
</button>
```

Add the JS function near the other header functions (around line 7500-7600):

```javascript
function globalRefreshAll() {
  const btn = document.getElementById('globalRefresh');
  btn.style.transform = 'rotate(360deg)';
  btn.style.transition = 'transform 0.6s ease';
  setTimeout(() => { btn.style.transform = ''; btn.style.transition = ''; }, 700);
  
  // Refresh all data sources
  if (typeof loadNotifications === 'function') loadNotifications();
  if (typeof loadAgentPerformance === 'function') loadAgentPerformance();
  if (typeof loadTokenBurn === 'function') loadTokenBurn();
  if (typeof loadBrainStatus === 'function') loadBrainStatus();
  if (typeof loadTaskHistory === 'function') loadTaskHistory();
  if (typeof loadAuditLog === 'function') loadAuditLog();
  if (typeof fetchOverviewStats === 'function') fetchOverviewStats();
}
```

**Verify:** Button appears in header, clicking it spins and triggers data refresh.

---

## TASK 3: Add Session Uptime Counter to Header

**File:** `/home/euphoria/terminal permanent setup/ui/dist/index.html`

Add after the global refresh button, before the notification bell:

```html
<span id="sessionUptime" title="Session uptime" style="font-size:12px;color:var(--text-secondary);margin-right:12px;font-family:monospace;opacity:0.7;">0:00:00</span>
```

Add JS (near the globalRefreshAll function):

```javascript
(function initSessionUptime() {
  const start = Date.now();
  setInterval(() => {
    const s = Math.floor((Date.now() - start) / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    const el = document.getElementById('sessionUptime');
    if (el) el.textContent = `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
  }, 1000);
})();
```

**Verify:** Counter ticks up every second from 0:00:00 on page load.

---

## TASK 4: Fix LeadJin Quotation $ → SAR Remaining Instances

**File:** `server.ts`

Search for any `$` currency symbols in quotation/invoice-related code. Common locations:
- PDF generation HTML templates
- Email notification templates for quotations
- Invoice summary responses

Replace all `$` with `SAR ` in these contexts. Do NOT touch `${}` template literals — only standalone `$` used as currency.

**Verify:** `grep -n '\\$[0-9]' server.ts` returns 0 matches after fix.

---

## TASK 5: Google Calendar Integration

**File:** `server.ts`

The booking endpoint `POST /api/calendar/book` currently only inserts into SQLite. Add Google Calendar event creation:

1. Find the booking endpoint (search for `/api/calendar/book`)
2. After the SQLite INSERT, add:
```typescript
// Create Google Calendar event if tokens exist
try {
  const tokens = db.prepare('SELECT * FROM google_tokens WHERE user_id = ?').get(req.user.id);
  if (tokens) {
    const oauth2 = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, process.env.GOOGLE_REDIRECT_URI);
    oauth2.setCredentials({ access_token: tokens.access_token, refresh_token: tokens.refresh_token });
    const calendar = google.calendar({ version: 'v3', auth: oauth2 });
    await calendar.events.insert({
      calendarId: 'primary',
      requestBody: {
        summary: `Meeting: ${req.body.title || 'Client Meeting'}`,
        description: req.body.notes || '',
        start: { dateTime: req.body.start_time, timeZone: 'Asia/Riyadh' },
        end: { dateTime: req.body.end_time, timeZone: 'Asia/Riyadh' },
      }
    });
  }
} catch (calErr) { console.error('Calendar sync failed:', calErr.message); }
```

3. Ensure `googleapis` is imported at the top: `import { google } from 'googleapis';`
4. Check `package.json` has `googleapis` — if not, run `npm install googleapis`

**Verify:** `npm run build` passes. Calendar event creation is wrapped in try/catch so it won't break bookings if Calendar fails.

---

## TASK 6: LeadJin View Extraction (App.tsx Monolith Split)

**DO NOT DO THIS TASK.** App.tsx at 5,332 lines works. Splitting risks regressions. Skip entirely.

---

## TASK 7: Fix LeadJin Test Suite

**File:** `server.ts` or test config

The test suite has 51/52 failing tests because rate limiting blocks test requests.

1. Find the `authLimiter` definition (search for `rateLimit` or `authLimiter`)
2. Ensure it checks `NODE_ENV`: `max: process.env.NODE_ENV === 'test' ? 10000 : 100`
3. Run: `NODE_ENV=test npm test` — report results

**Verify:** At least 40/52 tests pass. Report any remaining failures with exact error messages.

---

## TASK 8: Rebuild LeadJin Docker Image

After completing Tasks 1, 4, 5, 7:

```bash
cd /home/euphoria/leadjin
docker build -t leadjin:latest .
docker stop leadjin && docker rm leadjin
docker run -d --name leadjin --restart unless-stopped \
  -p 3001:3000 \
  -v /home/euphoria/leadjin/leadjin/leadjin.db:/app/leadjin.db \
  -v /home/euphoria/leadjin/leadjin/.env:/app/.env \
  leadjin:latest
```

**Verify:** `docker ps | grep leadjin` shows container running. `curl http://localhost:3001/api/health` returns 200.

---

## TASK 9: Terminal Platform Rebuild

After completing Tasks 2, 3:

```bash
cd "/home/euphoria/terminal permanent setup"
pm2 restart terminal-platform
```

**Verify:** `curl http://localhost:4000` returns HTML. Global refresh button and uptime counter visible in header.

---

## PRIORITY ORDER

Execute in this exact order: 1 → 4 → 2 → 3 → 5 → 7 → 8 → 9

**Skip Task 6 entirely.**
