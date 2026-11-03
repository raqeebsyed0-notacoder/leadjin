# LeadJin Trial & Subscription Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce a 14-day Pro trial for new users, then soft-gate harvest/outreach behind an upgrade flow after expiry.

**Architecture:** Add `trial_ends_at` column to users table. New `getSubscriptionStatus()` helper gates write endpoints (harvest, email queue) while keeping read endpoints open. Frontend shows trial countdown banner and upgrade modal on gated actions.

**Tech Stack:** TypeScript, Express, better-sqlite3, React 19, Tailwind CSS, Motion.js

**Spec:** `docs/superpowers/specs/2026-04-01-trial-subscription-design.md`

---

### Task 1: Database Migration — Add `trial_ends_at` Column

**Files:**
- Modify: `server.ts:356` (CREATE TABLE default)
- Modify: `server.ts:459-471` (safe migrations array)

- [ ] **Step 1: Add `trial_ends_at` to CREATE TABLE statement**

In `server.ts`, find the users CREATE TABLE (line ~356). After `subscription_expires_at DATETIME,` add:

```sql
trial_ends_at DATETIME,
```

So lines 356-358 become:
```typescript
    subscription_plan TEXT DEFAULT 'free',
    subscription_expires_at DATETIME,
    trial_ends_at DATETIME,
    monthly_searches_used INTEGER DEFAULT 0,
```

- [ ] **Step 2: Add safe migration for existing DBs**

In the `safeMigrations` array (after line ~465, the gemini_api_key migration), add:

```typescript
  "ALTER TABLE users ADD COLUMN trial_ends_at DATETIME",
```

- [ ] **Step 3: Add backfill migration for existing free users**

After the safeMigrations loop (after line ~480), add a one-time backfill:

```typescript
// Backfill trial_ends_at for existing free users who don't have it set
try {
  db.prepare(`
    UPDATE users 
    SET trial_ends_at = datetime(created_at, '+14 days'),
        subscription_plan = 'trial',
        monthly_searches_limit = -1
    WHERE subscription_plan = 'free' 
      AND is_founder = 0
      AND trial_ends_at IS NULL
  `).run();
} catch (e) { /* already backfilled */ }
```

- [ ] **Step 4: Verify migration works**

Run: `cd ~/leadjin/leadjin && docker compose down && docker compose up -d --build`

Then verify:
```bash
docker exec leadjin node -e "
const db = require('better-sqlite3')('/data/leadjin.db');
const users = db.prepare('SELECT id, email, subscription_plan, trial_ends_at, monthly_searches_limit FROM users').all();
console.log(JSON.stringify(users, null, 2));
"
```

Expected: Both existing users have `trial_ends_at` set to `created_at + 14 days`, `subscription_plan = 'trial'`, `monthly_searches_limit = -1`.

- [ ] **Step 5: Commit**

```bash
git add server.ts
git commit -m "feat: add trial_ends_at column with backfill migration"
```

---

### Task 2: Backend — `getSubscriptionStatus()` Helper

**Files:**
- Modify: `server.ts:24-26` (after isFounder helper)

- [ ] **Step 1: Add the helper function**

After line 26 (`const isFounder = ...`), add:

```typescript
// --- Subscription Status Helper ---
function getSubscriptionStatus(user: any): { status: 'trial' | 'trial_expired' | 'pro' | 'founder'; daysLeft: number; isActive: boolean } {
  if (isFounder(user.email) || user.is_founder) {
    return { status: 'founder', daysLeft: -1, isActive: true };
  }
  if (user.subscription_plan === 'pro') {
    if (user.subscription_expires_at) {
      const expires = new Date(user.subscription_expires_at);
      if (expires > new Date()) {
        return { status: 'pro', daysLeft: Math.ceil((expires.getTime() - Date.now()) / 86400000), isActive: true };
      }
    } else {
      return { status: 'pro', daysLeft: -1, isActive: true };
    }
  }
  if (user.trial_ends_at) {
    const trialEnd = new Date(user.trial_ends_at);
    const daysLeft = Math.ceil((trialEnd.getTime() - Date.now()) / 86400000);
    if (daysLeft > 0) {
      return { status: 'trial', daysLeft, isActive: true };
    }
  }
  return { status: 'trial_expired', daysLeft: 0, isActive: false };
}
```

- [ ] **Step 2: Verify server starts without errors**

Run: `cd ~/leadjin/leadjin && docker compose down && docker compose up -d --build && sleep 3 && docker logs leadjin --tail 5`

Expected: `LEADJIN Engine running at http://localhost:3000`

- [ ] **Step 3: Commit**

```bash
git add server.ts
git commit -m "feat: add getSubscriptionStatus helper"
```

---

### Task 3: Backend — Update Registration to Set Trial Fields

**Files:**
- Modify: `server.ts:661` (non-founder INSERT)

- [ ] **Step 1: Update the non-founder registration INSERT**

Change line 661 from:
```typescript
    db.prepare("INSERT INTO users (email, password_hash, subscription_plan, monthly_searches_limit, plan) VALUES (?, ?, 'free', 10, 'free')").run(email, password_hash);
```

To:
```typescript
    const trialEnds = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().replace('T', ' ').split('.')[0];
    db.prepare("INSERT INTO users (email, password_hash, subscription_plan, monthly_searches_limit, plan, trial_ends_at) VALUES (?, ?, 'trial', -1, 'trial', ?)").run(email, password_hash, trialEnds);
```

- [ ] **Step 2: Update the user SELECT to include trial_ends_at**

Change line 664 from:
```typescript
  const user = db.prepare("SELECT id, email, subscription_plan, monthly_searches_used, monthly_searches_limit, subscription_expires_at, plan, is_founder, is_admin, ramadan_override FROM users WHERE email = ?").get(email) as any;
```

To:
```typescript
  const user = db.prepare("SELECT id, email, subscription_plan, monthly_searches_used, monthly_searches_limit, subscription_expires_at, trial_ends_at, plan, is_founder, is_admin, ramadan_override FROM users WHERE email = ?").get(email) as any;
```

- [ ] **Step 3: Add subscription status to registration response**

Change line 668 from:
```typescript
  res.json({ status: "registered", token, user: { ...user, founder: !!user.is_founder } });
```

To:
```typescript
  const subStatus = getSubscriptionStatus(user);
  res.json({ status: "registered", token, user: { ...user, founder: !!user.is_founder, subscription_status: subStatus.status, subscription_days_left: subStatus.daysLeft, subscription_active: subStatus.isActive } });
```

- [ ] **Step 4: Test registration**

```bash
cd ~/leadjin/leadjin && docker compose down && docker compose up -d --build && sleep 3
curl -s -X POST http://localhost:3001/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"trialtest@example.com","password":"testpass123"}' | node -e "process.stdin.on('data',d=>console.log(JSON.stringify(JSON.parse(d),null,2)))"
```

Expected: `subscription_plan: "trial"`, `trial_ends_at` is 14 days from now, `subscription_status: "trial"`, `subscription_days_left: 14`, `subscription_active: true`.

- [ ] **Step 5: Clean up test user and commit**

```bash
docker exec leadjin node -e "const db=require('better-sqlite3')('/data/leadjin.db'); db.prepare(\"DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%test%example%')\").run(); db.prepare(\"DELETE FROM users WHERE email LIKE '%test%example%'\").run(); console.log('cleaned');"
git add server.ts
git commit -m "feat: new users get 14-day pro trial on registration"
```

---

### Task 4: Backend — Update `/api/auth/me` and Login with Subscription Status

**Files:**
- Modify: `server.ts:680` (login SELECT)
- Modify: `server.ts:684` (login response)
- Modify: `server.ts:745` (auth/me SELECT)
- Modify: `server.ts:746` (auth/me response)

- [ ] **Step 1: Update login SELECT to include `trial_ends_at`**

Change line 680:
```typescript
  const fresh = db.prepare("SELECT id, email, subscription_plan, monthly_searches_used, monthly_searches_limit, subscription_expires_at, plan, is_founder, is_admin, ramadan_override FROM users WHERE id = ?").get(user.id) as any;
```

To:
```typescript
  const fresh = db.prepare("SELECT id, email, subscription_plan, monthly_searches_used, monthly_searches_limit, subscription_expires_at, trial_ends_at, plan, is_founder, is_admin, ramadan_override FROM users WHERE id = ?").get(user.id) as any;
```

- [ ] **Step 2: Update login response to include subscription status**

Change line 684:
```typescript
  res.json({ status: "ok", token, user: { ...fresh, founder: !!fresh.is_founder } });
```

To:
```typescript
  const subStatus = getSubscriptionStatus(fresh);
  res.json({ status: "ok", token, user: { ...fresh, founder: !!fresh.is_founder, subscription_status: subStatus.status, subscription_days_left: subStatus.daysLeft, subscription_active: subStatus.isActive } });
```

- [ ] **Step 3: Update `/api/auth/me` SELECT to include `trial_ends_at`**

Change line 745:
```typescript
  const fresh = db.prepare("SELECT id, email, subscription_plan, monthly_searches_used, monthly_searches_limit, subscription_expires_at, plan, is_founder, is_admin, ramadan_override FROM users WHERE id = ?").get(user.id);
```

To:
```typescript
  const fresh = db.prepare("SELECT id, email, subscription_plan, monthly_searches_used, monthly_searches_limit, subscription_expires_at, trial_ends_at, plan, is_founder, is_admin, ramadan_override FROM users WHERE id = ?").get(user.id) as any;
```

- [ ] **Step 4: Update `/api/auth/me` response**

Change line 746:
```typescript
  res.json({ user: { ...fresh, founder: !!fresh?.is_founder } });
```

To:
```typescript
  const subStatus = getSubscriptionStatus(fresh);
  res.json({ user: { ...fresh, founder: !!fresh.is_founder, subscription_status: subStatus.status, subscription_days_left: subStatus.daysLeft, subscription_active: subStatus.isActive } });
```

- [ ] **Step 5: Rebuild and verify**

```bash
cd ~/leadjin/leadjin && docker compose down && docker compose up -d --build && sleep 3
# Check auth/me for existing trial user
docker exec leadjin node -e "
const db = require('better-sqlite3')('/data/leadjin.db');
const u = db.prepare('SELECT id, email, subscription_plan, trial_ends_at FROM users WHERE id = 1').get();
console.log(JSON.stringify(u, null, 2));
"
```

Expected: User has `subscription_plan: 'trial'` and `trial_ends_at` set.

- [ ] **Step 6: Commit**

```bash
git add server.ts
git commit -m "feat: include subscription status in login and auth/me responses"
```

---

### Task 5: Backend — Add `GET /api/subscription/status` Endpoint

**Files:**
- Modify: `server.ts` (after auth/me endpoint, ~line 747)

- [ ] **Step 1: Add the endpoint**

After the `/api/auth/me` endpoint (after line ~747), add:

```typescript
// Subscription status endpoint
app.get("/api/subscription/status", (req, res) => {
  const user = getUserFromToken(req) as any;
  if (!user) return res.status(401).json({ error: "not authenticated" });
  const fresh = db.prepare("SELECT id, email, subscription_plan, subscription_expires_at, trial_ends_at, is_founder FROM users WHERE id = ?").get(user.id) as any;
  const status = getSubscriptionStatus(fresh);
  res.json(status);
});
```

- [ ] **Step 2: Rebuild and test**

```bash
cd ~/leadjin/leadjin && docker compose down && docker compose up -d --build && sleep 3
# Register test user and check subscription status
RESULT=$(curl -s -X POST http://localhost:3001/api/auth/register -H 'Content-Type: application/json' -d '{"email":"subtest@example.com","password":"testpass123"}')
TOKEN=$(echo "$RESULT" | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).token))")
curl -s http://localhost:3001/api/subscription/status -H "Authorization: Bearer $TOKEN"
```

Expected: `{"status":"trial","daysLeft":14,"isActive":true}`

- [ ] **Step 3: Clean up and commit**

```bash
docker exec leadjin node -e "const db=require('better-sqlite3')('/data/leadjin.db'); db.prepare(\"DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%test%example%')\").run(); db.prepare(\"DELETE FROM users WHERE email LIKE '%test%example%'\").run();"
git add server.ts
git commit -m "feat: add GET /api/subscription/status endpoint"
```

---

### Task 6: Backend — Gate Harvest and Email Endpoints

**Files:**
- Modify: `server.ts:1397-1405` (harvest endpoint)
- Modify: `server.ts:2284-2286` (email queue endpoint)

- [ ] **Step 1: Add trial gate to harvest endpoint**

In the `/api/leads/harvest` handler (line ~1401), after `resetMonthlyIfNeeded(user.id);` and the fresh SELECT, add trial check BEFORE the existing quota check:

After line 1401 (`const fresh = ...`), add:
```typescript
  // Trial/subscription gate
  const subStatus = getSubscriptionStatus(fresh);
  if (!subStatus.isActive) {
    return res.status(403).json({ error: "trial_expired", message: "Your 14-day Pro trial has ended. Upgrade to continue harvesting leads.", upgrade: true });
  }
```

- [ ] **Step 2: Add trial gate to email queue endpoint**

In the `/api/email/queue` handler (line ~2286), after `if (!user) return;`, add:

```typescript
  // Trial/subscription gate
  const emailUser = db.prepare("SELECT email, subscription_plan, subscription_expires_at, trial_ends_at, is_founder FROM users WHERE id = ?").get(user.id) as any;
  const emailSubStatus = getSubscriptionStatus(emailUser);
  if (!emailSubStatus.isActive) {
    return res.status(403).json({ error: "trial_expired", message: "Your 14-day Pro trial has ended. Upgrade to continue sending outreach.", upgrade: true });
  }
```

- [ ] **Step 3: Rebuild and test gating**

```bash
cd ~/leadjin/leadjin && docker compose down && docker compose up -d --build && sleep 3

# Create a user with expired trial for testing
docker exec leadjin node -e "
const db = require('better-sqlite3')('/data/leadjin.db');
const bcrypt = require('bcryptjs');
const hash = bcrypt.hashSync('testpass123', 10);
try { db.prepare(\"INSERT INTO users (email, password_hash, subscription_plan, monthly_searches_limit, trial_ends_at) VALUES ('expired@test.com', ?, 'trial', -1, '2026-03-01 00:00:00')\").run(hash); } catch(e) {}
console.log('created expired user');
"

# Login as expired user
RESULT=$(curl -s -X POST http://localhost:3001/api/auth/login -H 'Content-Type: application/json' -d '{"email":"expired@test.com","password":"testpass123"}')
TOKEN=$(echo "$RESULT" | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).token))")

# Try harvest — should be 403
echo "=== Harvest (should be 403):"
curl -s -w "\nHTTP %{http_code}" -X POST http://localhost:3001/api/leads/harvest -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"niche":"test","location":"test"}'

# Try email queue — should be 403
echo ""
echo "=== Email queue (should be 403):"
curl -s -w "\nHTTP %{http_code}" -X POST http://localhost:3001/api/email/queue -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"to_email":"test@test.com","subject":"test","body":"test"}'

# Check subscription status — should be expired
echo ""
echo "=== Sub status (should be expired):"
curl -s http://localhost:3001/api/subscription/status -H "Authorization: Bearer $TOKEN"
```

Expected: Both harvest and email return HTTP 403 with `error: "trial_expired"`. Subscription status shows `status: "trial_expired"`, `isActive: false`.

- [ ] **Step 4: Clean up test user and commit**

```bash
docker exec leadjin node -e "const db=require('better-sqlite3')('/data/leadjin.db'); db.prepare(\"DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE email='expired@test.com')\").run(); db.prepare(\"DELETE FROM users WHERE email='expired@test.com'\").run();"
git add server.ts
git commit -m "feat: gate harvest and email endpoints behind trial/subscription check"
```

---

### Task 7: Frontend — Add Subscription State and Trial Banner

**Files:**
- Modify: `src/App.tsx:725` (currentUser type)
- Modify: `src/App.tsx:~1858` (before sidebar, after onboarding)

- [ ] **Step 1: Update `currentUser` state type to include subscription fields**

Change line 725 from:
```typescript
  const [currentUser, setCurrentUser] = useState<{ id: number; email: string; subscription_plan: string; monthly_searches_used: number; monthly_searches_limit: number; subscription_expires_at?: string } | null>(null);
```

To:
```typescript
  const [currentUser, setCurrentUser] = useState<{ id: number; email: string; subscription_plan: string; monthly_searches_used: number; monthly_searches_limit: number; subscription_expires_at?: string; trial_ends_at?: string; subscription_status?: string; subscription_days_left?: number; subscription_active?: boolean } | null>(null);
```

- [ ] **Step 2: Add trial banner before the sidebar**

In the `AppContent` return, find line ~1858 (after the onboarding AnimatePresence, before `{/* Sidebar Navigation */}`). Add the trial banner:

```tsx
      {/* Trial Banner */}
      {currentUser && currentUser.subscription_status === 'trial' && (
        <div className={`fixed top-0 left-0 right-0 z-[80] text-center py-2 text-xs font-bold uppercase tracking-widest ${
          (currentUser.subscription_days_left || 0) <= 3 
            ? 'bg-amber-500/90 text-black' 
            : 'bg-app-accent/90 text-app-bg'
        }`}>
          Pro Trial — {currentUser.subscription_days_left} day{currentUser.subscription_days_left !== 1 ? 's' : ''} remaining
        </div>
      )}
      {currentUser && currentUser.subscription_status === 'trial_expired' && (
        <div className="fixed top-0 left-0 right-0 z-[80] text-center py-2 text-xs font-bold uppercase tracking-widest bg-red-500/90 text-white">
          Trial expired — Upgrade to Pro to continue harvesting
        </div>
      )}
```

- [ ] **Step 3: Add top padding to main layout when banner is visible**

Find the main layout container that wraps sidebar + content. The sidebar starts at line ~1874 with `<motion.aside`. The parent `<div>` that wraps everything needs a top padding when the banner shows. Find the outermost container div of the dashboard (should be right before the sidebar section). Add conditional padding:

Look for the main return's first div. It should be something like:
```tsx
    return (
      <div className="h-screen flex ...">
```

Add a `pt-8` when trial banner is visible:
```tsx
    return (
      <div className={`h-screen flex ${currentUser?.subscription_status === 'trial' || currentUser?.subscription_status === 'trial_expired' ? 'pt-8' : ''} ...`}>
```

- [ ] **Step 4: Rebuild and verify visually**

```bash
cd ~/leadjin/leadjin && docker compose down && docker compose up -d --build
```

Open the app in browser — verify trial banner appears at top for trial users.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx
git commit -m "feat: add trial countdown banner to dashboard"
```

---

### Task 8: Frontend — Upgrade Modal on Gated Actions

**Files:**
- Modify: `src/App.tsx` (add state + modal component + wire to harvest button)

- [ ] **Step 1: Add upgrade modal state**

After the `currentUser` state declaration (line ~725), add:

```typescript
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
```

- [ ] **Step 2: Add the UpgradeModal component**

Before the main `return (` in AppContent, add the modal component inline:

```tsx
  const UpgradeModal = () => (
    <AnimatePresence>
      {showUpgradeModal && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[100] flex items-center justify-center p-6"
          onClick={() => currentUser?.subscription_status !== 'trial_expired' && setShowUpgradeModal(false)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            onClick={e => e.stopPropagation()}
            className="w-full max-w-md glass rounded-[24px] p-8 space-y-6 text-center"
          >
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 mb-2">
              <CreditCard className="text-red-400" size={28} />
            </div>
            <h2 className="text-2xl font-light tracking-tight">Your Pro Trial Has Ended</h2>
            <p className="text-sm opacity-60">
              You've used all 14 days of your free Pro trial. Upgrade to keep harvesting leads and sending outreach.
            </p>
            <div className="glass rounded-xl p-4 space-y-1">
              <p className="text-lg font-bold">LEADJIN Pro</p>
              <p className="text-2xl font-light text-app-accent">SAR 4,999<span className="text-xs opacity-40">/month</span></p>
              <p className="text-[10px] uppercase tracking-widest opacity-40">Unlimited harvests · Full CRM · AI outreach</p>
            </div>
            <a
              href="https://wa.me/966583081453?text=I'd%20like%20to%20upgrade%20to%20LEADJIN%20Pro"
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full py-4 bg-emerald-500 text-white rounded-xl font-bold text-sm uppercase tracking-widest hover:bg-emerald-400 transition-colors"
            >
              Upgrade via WhatsApp
            </a>
            <button
              onClick={() => setShowUpgradeModal(false)}
              className="text-xs opacity-40 hover:opacity-60 transition-opacity"
            >
              {currentUser?.subscription_status === 'trial_expired' ? 'Continue with limited access' : 'Maybe later'}
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
```

- [ ] **Step 3: Render the modal in the component**

In the AppContent return, right after the trial banner code (from Task 7), add:

```tsx
      <UpgradeModal />
```

- [ ] **Step 4: Gate the harvest submit button**

Find the `handleGenerate` function (line ~1211). At the top of the function, after the `if (!authToken)` check, add:

```typescript
    // Trial gate — show upgrade modal if expired
    if (currentUser?.subscription_status === 'trial_expired') {
      setShowUpgradeModal(true);
      return;
    }
```

- [ ] **Step 5: Handle 403 responses from harvest and email endpoints**

Find the harvest fetch error handling. In the `handleGenerate` catch block, add a check for trial_expired:

In the catch block of the harvest fetch (where it parses the response), add handling for 403:

Find where the harvest response is parsed (after the fetch call). Look for the response status check and add before the existing error handling:

```typescript
      if (harvestRes.status === 403) {
        const errData = await harvestRes.json();
        if (errData.upgrade) {
          setShowUpgradeModal(true);
          setLoading(false);
          return;
        }
      }
```

- [ ] **Step 6: Rebuild and verify**

```bash
cd ~/leadjin/leadjin && docker compose down && docker compose up -d --build
```

Test by creating an expired trial user and clicking harvest — the upgrade modal should appear.

- [ ] **Step 7: Commit**

```bash
git add src/App.tsx
git commit -m "feat: add upgrade modal for trial-expired users on gated actions"
```

---

### Task 9: Backend — Update Admin `set-plan` to Accept 'trial' Plan Reset

**Files:**
- Modify: `server.ts:897` (set-plan validation)

- [ ] **Step 1: Allow 'trial' in the plan validation**

Change line 897:
```typescript
  if (!['free', 'basic', 'pro'].includes(plan)) return res.status(400).json({ error: "plan must be free, basic, or pro" });
```

To:
```typescript
  if (!['free', 'basic', 'pro', 'trial'].includes(plan)) return res.status(400).json({ error: "plan must be free, basic, pro, or trial" });
```

- [ ] **Step 2: Handle trial plan in limit calculation**

Change line 898:
```typescript
  const limit = plan === 'pro' ? -1 : plan === 'basic' ? 100 : 10;
```

To:
```typescript
  const limit = (plan === 'pro' || plan === 'trial') ? -1 : plan === 'basic' ? 100 : 10;
```

- [ ] **Step 3: Rebuild and commit**

```bash
cd ~/leadjin/leadjin && docker compose down && docker compose up -d --build
git add server.ts
git commit -m "feat: allow trial plan in admin set-plan endpoint"
```

---

### Task 10: Final Integration Test

**Files:** None (testing only)

- [ ] **Step 1: Test full registration → trial → expiry flow**

```bash
# 1. Register new user
RESULT=$(curl -s -X POST http://localhost:3001/api/auth/register -H 'Content-Type: application/json' -d '{"email":"finaltest@example.com","password":"testpass123"}')
TOKEN=$(echo "$RESULT" | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).token))")
echo "=== Registration:"
echo "$RESULT" | node -e "process.stdin.on('data',d=>{const j=JSON.parse(d); console.log('plan:', j.user.subscription_plan, 'status:', j.user.subscription_status, 'days:', j.user.subscription_days_left, 'active:', j.user.subscription_active)})"

# 2. Check subscription status
echo "=== Sub status:"
curl -s http://localhost:3001/api/subscription/status -H "Authorization: Bearer $TOKEN"

# 3. Verify harvest works (should succeed for active trial)
echo ""
echo "=== Harvest (should work):"
curl -s -w "\nHTTP %{http_code}" -X POST http://localhost:3001/api/leads/harvest -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"niche":"test","location":"Riyadh","count":1}'

# 4. Manually expire the trial
docker exec leadjin node -e "const db=require('better-sqlite3')('/data/leadjin.db'); db.prepare(\"UPDATE users SET trial_ends_at='2026-03-01' WHERE email='finaltest@example.com'\").run(); console.log('expired');"

# 5. Check subscription status (should be expired)
echo ""
echo "=== Sub status (should be expired):"
curl -s http://localhost:3001/api/subscription/status -H "Authorization: Bearer $TOKEN"

# 6. Try harvest (should be 403)
echo ""
echo "=== Harvest (should be 403):"
curl -s -w "\nHTTP %{http_code}" -X POST http://localhost:3001/api/leads/harvest -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"niche":"test","location":"Riyadh","count":1}'

# 7. Try email (should be 403)
echo ""
echo "=== Email (should be 403):"
curl -s -w "\nHTTP %{http_code}" -X POST http://localhost:3001/api/email/queue -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"to_email":"t@t.com","subject":"t","body":"t"}'
```

Expected:
- Step 1: `subscription_plan: trial`, `subscription_status: trial`, `subscription_days_left: 14`, `subscription_active: true`
- Step 2: `{"status":"trial","daysLeft":14,"isActive":true}`
- Step 3: Should proceed (may error on Gemini API but not 403)
- Step 5: `{"status":"trial_expired","daysLeft":0,"isActive":false}`
- Step 6: HTTP 403 with `error: "trial_expired"`
- Step 7: HTTP 403 with `error: "trial_expired"`

- [ ] **Step 2: Test founder bypass**

```bash
# Register as founder
RESULT=$(curl -s -X POST http://localhost:3001/api/auth/register -H 'Content-Type: application/json' -d '{"email":"raqeebsyed0@gmail.com","password":"testpass123"}')
TOKEN=$(echo "$RESULT" | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).token))")
echo "=== Founder sub status:"
curl -s http://localhost:3001/api/subscription/status -H "Authorization: Bearer $TOKEN"
```

Expected: `{"status":"founder","daysLeft":-1,"isActive":true}`

- [ ] **Step 3: Clean up test users**

```bash
docker exec leadjin node -e "const db=require('better-sqlite3')('/data/leadjin.db'); db.prepare(\"DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE email IN ('finaltest@example.com','raqeebsyed0@gmail.com'))\").run(); db.prepare(\"DELETE FROM users WHERE email IN ('finaltest@example.com','raqeebsyed0@gmail.com')\").run(); console.log('cleaned');"
```

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: LeadJin trial & subscription system complete — 14-day Pro trial with soft gate"
```
