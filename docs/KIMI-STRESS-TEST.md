# LeadJin v9 — Stress Test & Smoke Test Task Sheet

**For:** Kimi (implementation agent)
**Created:** 2026-03-27 15:10
**Created by:** Claude (audit agent)

---

## BLOCKER — Server Won't Start

The app crashes on startup with `SqliteError: no such column: l.do_not_contact`.

### ROOT CAUSE

Task D-01 removed all ALTER TABLE migrations from server.ts. The new CREATE TABLE statements include all columns. BUT `CREATE TABLE IF NOT EXISTS` does NOT modify an existing table — it only creates if missing. The existing `leadjin.db` was created with the OLD schema that doesn't have many new columns.

### Missing columns in existing database:

**leads table** — missing: `do_not_contact`, `phone`, `twitter`, `website`, `pain_signals`, `outreach_sequence`, `majlis_tips`, `email_verified`, `email_source`, and possibly more.

**users table** — missing: `company_name`, `company_tagline`, `company_email`, `company_phone`, `company_website`, `company_address`, `company_logo`, `name`.

### FIX REQUIRED: Add safe migration block

In `server.ts`, AFTER the CREATE TABLE statements and AFTER `db.pragma('foreign_keys = ON')`, add a migration block that safely adds missing columns to existing databases:

```typescript
// Safe migrations for existing databases — add columns that may not exist yet
const safeMigrations = [
  // leads table
  "ALTER TABLE leads ADD COLUMN do_not_contact INTEGER DEFAULT 0",
  "ALTER TABLE leads ADD COLUMN phone TEXT",
  "ALTER TABLE leads ADD COLUMN twitter TEXT",
  "ALTER TABLE leads ADD COLUMN website TEXT",
  "ALTER TABLE leads ADD COLUMN pain_signals TEXT",
  "ALTER TABLE leads ADD COLUMN outreach_sequence TEXT",
  "ALTER TABLE leads ADD COLUMN majlis_tips TEXT",
  "ALTER TABLE leads ADD COLUMN email_verified INTEGER DEFAULT 0",
  "ALTER TABLE leads ADD COLUMN email_source TEXT",
  // users table
  "ALTER TABLE users ADD COLUMN company_name TEXT",
  "ALTER TABLE users ADD COLUMN company_tagline TEXT",
  "ALTER TABLE users ADD COLUMN company_email TEXT",
  "ALTER TABLE users ADD COLUMN company_phone TEXT",
  "ALTER TABLE users ADD COLUMN company_website TEXT",
  "ALTER TABLE users ADD COLUMN company_address TEXT",
  "ALTER TABLE users ADD COLUMN company_logo TEXT",
  "ALTER TABLE users ADD COLUMN name TEXT",
];

for (const migration of safeMigrations) {
  try {
    db.exec(migration);
  } catch (e: any) {
    // Column already exists — ignore
    if (!e.message?.includes('duplicate column')) {
      console.warn(`[Migration] ${migration}: ${e.message}`);
    }
  }
}
console.log('[Migration] Safe column migrations complete.');
```

**IMPORTANT:** Cross-reference ALL columns in the CREATE TABLE statements against the existing DB. The list above may not be complete. Check every table:
- `leads` — compare CREATE TABLE columns vs `PRAGMA table_info(leads)`
- `users` — compare CREATE TABLE columns vs `PRAGMA table_info(users)`
- `email_queue` — compare vs `PRAGMA table_info(email_queue)`
- `email_templates` — compare vs `PRAGMA table_info(email_templates)`
- `invoices` — compare vs `PRAGMA table_info(invoices)`
- `bookings` — compare vs `PRAGMA table_info(bookings)`
- `activity_log` — compare vs `PRAGMA table_info(activity_log)`
- `google_tokens` — compare vs `PRAGMA table_info(google_tokens)`
- `service_catalog` — compare vs `PRAGMA table_info(service_catalog)`
- `proposals` — compare vs `PRAGMA table_info(proposals)`
- `email_events` — compare vs `PRAGMA table_info(email_events)`

Add ALL missing columns to the safeMigrations array. Test by starting the server with the existing DB.

---

## SMOKE TESTS (Run After Blocker Fix)

Start the server with `npm run dev`. Run each test below. Mark PASS or FAIL.

### 1. Server Startup
```bash
npm run dev
# Expected: Server starts without errors
# Check: "Server running on port 3001" in console
# Check: No SqliteError messages
```
- [ ] Server starts cleanly
- [ ] No database errors in console
- [ ] Email queue processor starts

### 2. Authentication Flow
```bash
# Register
curl -s -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@leadjin.dev","password":"TestPass123!"}' | jq .

# Login
curl -s -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@leadjin.dev","password":"TestPass123!"}' | jq .

# Save the token from login response as TOKEN
# Validate session
curl -s http://localhost:3001/api/auth/me \
  -H "Authorization: Bearer TOKEN" | jq .
```
- [ ] Register returns success with token
- [ ] Login returns success with token
- [ ] /api/auth/me returns user object
- [ ] Password under 8 chars rejected with 400

### 3. Lead Harvesting (Core Feature)
```bash
curl -s -X POST http://localhost:3001/api/leads/harvest \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "targetIndustry": "Real Estate",
    "geography": "Saudi Arabia",
    "jobTitles": ["CEO", "CTO"],
    "companySize": "50-200",
    "limit": 3
  }' | jq '.leads | length'
```
- [ ] Returns leads (may be 0 if Gemini API key missing — that's ok)
- [ ] No hallucinated emails (check `email_verified` field)
- [ ] Leads have `lead_id` using UUID format
- [ ] No `past_interactions` in response

### 4. CRM CRUD
```bash
# Get leads
curl -s http://localhost:3001/api/leads \
  -H "Authorization: Bearer TOKEN" | jq '.leads | length'

# Update lead status
curl -s -X POST http://localhost:3001/api/leads/status \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"lead_id":"LEAD_ID","status":"CONTACTED"}' | jq .

# Update lead fields
curl -s -X PUT http://localhost:3001/api/leads/LEAD_ID \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Updated Name","company":"Updated Co"}' | jq .

# Delete lead
curl -s -X DELETE http://localhost:3001/api/leads/LEAD_ID \
  -H "Authorization: Bearer TOKEN" | jq .

# Invalid status rejected
curl -s -X POST http://localhost:3001/api/leads/status \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"lead_id":"LEAD_ID","status":"INVALID_STATUS"}' | jq .
```
- [ ] GET /api/leads returns leads with `value` field
- [ ] Status update works for valid statuses
- [ ] Invalid status returns 400
- [ ] PUT updates lead fields
- [ ] DELETE cascade removes lead + related records

### 5. Email Queue
```bash
# Queue an email
curl -s -X POST http://localhost:3001/api/email/queue \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "lead_id": "LEAD_ID",
    "to_email": "test@example.com",
    "subject": "Test Subject",
    "body": "<p>Test body</p>"
  }' | jq .

# Invalid email rejected
curl -s -X POST http://localhost:3001/api/email/queue \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "lead_id": "LEAD_ID",
    "to_email": "not-an-email",
    "subject": "Test",
    "body": "Test"
  }' | jq .
```
- [ ] Valid email queued successfully
- [ ] Invalid email format rejected with 400
- [ ] Email body is sanitized (no script tags in stored body)

### 6. Email Tracking
```bash
# Open tracking (should return 1x1 pixel)
curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/api/email/track/1/open

# Click tracking with valid URL
curl -s -o /dev/null -w "%{http_code} %{redirect_url}" http://localhost:3001/api/email/track/1/click?url=https://example.com

# Click tracking with javascript: URL (should be blocked)
curl -s -o /dev/null -w "%{http_code}" "http://localhost:3001/api/email/track/1/click?url=javascript:alert(1)"
```
- [ ] Open tracking returns 200
- [ ] Click tracking returns 302 redirect to valid URL
- [ ] javascript: URL returns 400 (open redirect blocked)

### 7. Unsubscribe
```bash
# Test unsubscribe page loads
curl -s "http://localhost:3001/api/unsubscribe?email=test@example.com&token=VALID_TOKEN" | head -5
```
- [ ] Unsubscribe endpoint responds
- [ ] Invalid token is rejected

### 8. Security Checks
```bash
# Admin without is_admin flag
curl -s http://localhost:3001/api/admin/dashboard \
  -H "x-admin-secret: YOUR_SECRET" \
  -H "Authorization: Bearer TOKEN" | jq .

# No admin secret
curl -s http://localhost:3001/api/admin/dashboard | jq .

# Short password
curl -s -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"weak@test.com","password":"short"}' | jq .
```
- [ ] Admin endpoint requires both secret AND is_admin=1
- [ ] No secret returns 401/403
- [ ] Short password (< 8 chars) returns 400

### 9. Quotation System
```bash
# Create quotation
curl -s -X POST http://localhost:3001/api/quotations/create \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "lead_id": "LEAD_ID",
    "items": [{"description":"Web Design","quantity":1,"unit_price":5000}],
    "currency": "SAR",
    "vat_rate": 15,
    "notes": "Test quotation"
  }' | jq .
```
- [ ] Quotation created with correct VAT calculation
- [ ] Quotation appears in GET /api/quotations/LEAD_ID

### 10. Frontend Loads
```bash
# Check Vite dev server
curl -s http://localhost:5173 | grep -c "root"
```
- [ ] Frontend HTML loads
- [ ] No console errors on page load
- [ ] Login form renders
- [ ] After login: sidebar, views render

### 11. Frontend Functional Tests (Manual in Browser)

Open http://localhost:5173 in a browser:

- [ ] Register a new account
- [ ] Login succeeds
- [ ] Harvest view: ICP form submits (may need Gemini API key)
- [ ] CRM view: leads display in Kanban columns
- [ ] CRM: drag a card between columns — status updates
- [ ] CRM: click a card — lead detail panel opens
- [ ] Lead detail: email/LinkedIn/Twitter/website links are clickable
- [ ] Lead detail: create a quotation — data saves to server
- [ ] Lead detail: download quotation PDF — Arabic text renders correctly
- [ ] Analytics: charts render with data
- [ ] Settings > General: change company name, click Save — persists after page reload
- [ ] Settings > System: click Arabic — UI switches to RTL
- [ ] Settings > System: click English — UI switches back to LTR
- [ ] Sidebar responsive: resize window below 768px — sidebar collapses

---

## STRESS TESTS (Run After Smoke Tests Pass)

### S1. Concurrent Lead Harvests
```bash
# Fire 5 harvest requests simultaneously
for i in {1..5}; do
  curl -s -X POST http://localhost:3001/api/leads/harvest \
    -H "Authorization: Bearer TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"targetIndustry":"Tech","geography":"UAE","jobTitles":["CEO"],"limit":3}' &
done
wait
```
- [ ] All 5 return responses (not crashes)
- [ ] Enrichment concurrency stays at 5 (check server logs)

### S2. Rapid CRM Updates
```bash
# Rapidly change a lead's status 20 times
for status in NEW CONTACTED REPLIED MEETING PROPOSAL CLOSED NEW CONTACTED REPLIED MEETING PROPOSAL CLOSED NEW CONTACTED REPLIED MEETING PROPOSAL CLOSED NEW CONTACTED; do
  curl -s -X POST http://localhost:3001/api/leads/status \
    -H "Authorization: Bearer TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"lead_id\":\"LEAD_ID\",\"status\":\"$status\"}" &
done
wait
```
- [ ] No database lock errors
- [ ] Lead ends up in a valid state

### S3. Email Queue Burst
```bash
# Queue 50 emails rapidly
for i in {1..50}; do
  curl -s -X POST http://localhost:3001/api/email/queue \
    -H "Authorization: Bearer TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"lead_id\":\"LEAD_ID\",\"to_email\":\"test${i}@example.com\",\"subject\":\"Stress ${i}\",\"body\":\"<p>Body ${i}</p>\"}" &
done
wait
```
- [ ] All 50 queued without error
- [ ] Queue processor handles them (check `attempt_count` doesn't double-increment)

### S4. Auth Rate Limiting
```bash
# Hit login endpoint 15 times rapidly (limit is 10/15min)
for i in {1..15}; do
  curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3001/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"test@leadjin.dev","password":"wrong"}' &
done
wait
```
- [ ] First 10 return 401 (bad credentials)
- [ ] Requests 11-15 return 429 (rate limited)

### S5. Large Payload Rejection
```bash
# Send a massive body
python3 -c "print('{\"email\":\"a@b.com\",\"password\":\"' + 'A'*1000000 + '\"}')" | \
  curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3001/api/auth/register \
    -H "Content-Type: application/json" -d @-
```
- [ ] Returns 413 or 400 (not a crash)

### S6. Session Cache Performance
```bash
# Hit an authenticated endpoint 100 times rapidly
time (for i in {1..100}; do
  curl -s -o /dev/null http://localhost:3001/api/leads \
    -H "Authorization: Bearer TOKEN" &
done; wait)
```
- [ ] Completes in under 5 seconds
- [ ] Session cache reduces DB hits (check if faster than expected)

---

## Execution Order

1. **Fix the blocker** (migration block for existing databases)
2. **Verify server starts** (test 1)
3. **Run smoke tests 2-11**
4. **Run stress tests S1-S6**
5. **Report all PASS/FAIL results**

---

*Fix the blocker first. Nothing else works until the server starts.*
