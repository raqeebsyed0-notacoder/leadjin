# LeadJin Trial & Subscription System — Design Spec

**Date:** 2026-04-01
**Status:** Approved
**Author:** Claude (engineering partner)

---

## Problem

LeadJin advertises a 14-day free trial on the landing page but has zero trial enforcement. All users get permanent free-tier access. There is no paywall, no trial expiry, and no upgrade flow. This must change before launch.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Post-trial behavior | **Soft gate** | Users keep read access to CRM/leads/analytics but can't run new harvests or outreach. Seeing their data creates conversion pressure without causing churn. |
| Payment method | **Manual (WhatsApp)** | No payment gateway. Users contact via WhatsApp to upgrade. Admin activates via existing `/api/admin/set-plan`. Manual invoices and quotations only. |
| Trial access level | **Full Pro** | Unlimited harvests, all features for 14 days. Users must experience the real product to convert. |
| Company profile | **Mandatory gate** | Already implemented (this session). B2B product — no anonymous usage. |

## Architecture

### 1. Database Changes

**New column on `users` table:**

```sql
ALTER TABLE users ADD COLUMN trial_ends_at DATETIME;
```

**On registration** — set `trial_ends_at` to 14 days from now:

```sql
INSERT INTO users (..., subscription_plan, trial_ends_at, monthly_searches_limit)
VALUES (..., 'trial', datetime('now', '+14 days'), -1);
```

**Backfill existing free users:**

```sql
UPDATE users 
SET trial_ends_at = datetime(created_at, '+14 days'),
    subscription_plan = 'trial',
    monthly_searches_limit = -1
WHERE subscription_plan = 'free' 
  AND is_founder = 0;
```

### 2. Backend — Subscription Status Helper

New helper function `getSubscriptionStatus(user)`:

```typescript
function getSubscriptionStatus(user: any): {
  status: 'trial' | 'trial_expired' | 'pro' | 'founder';
  daysLeft: number;
  isActive: boolean;
} {
  // Founder always active
  if (isFounder(user.email) || user.is_founder) {
    return { status: 'founder', daysLeft: -1, isActive: true };
  }
  
  // Pro subscriber
  if (user.subscription_plan === 'pro') {
    // Check expiry if set
    if (user.subscription_expires_at) {
      const expires = new Date(user.subscription_expires_at);
      if (expires > new Date()) {
        return { status: 'pro', daysLeft: Math.ceil((expires.getTime() - Date.now()) / 86400000), isActive: true };
      }
      // Pro expired — falls through to trial_expired
    } else {
      return { status: 'pro', daysLeft: -1, isActive: true };
    }
  }
  
  // Trial user
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

### 3. Backend — Endpoint Gating

**New endpoint:** `GET /api/subscription/status`
- Returns `{ status, daysLeft, isActive }` for the authenticated user
- Called by frontend on app load and periodically

**Gated endpoints** (return 403 when `isActive === false`):

| Endpoint | Action | Gate behavior |
|----------|--------|---------------|
| `POST /api/leads/harvest` | Generate leads | Blocked — return `{ error: 'trial_expired', upgrade: true }` |
| `POST /api/email/send` | Send outreach | Blocked |
| `POST /api/email/schedule` | Schedule emails | Blocked |

**Ungated endpoints** (always accessible):

| Endpoint | Action | Why |
|----------|--------|-----|
| `GET /api/leads/*` | View leads | Soft gate — let them see their data |
| `GET /api/crm/*` | View CRM | Soft gate |
| `GET /api/analytics/*` | View analytics | Soft gate |
| `GET /api/user/profile` | View profile | Always needed |
| `PUT /api/user/profile` | Edit profile | Always needed |
| `GET /api/subscription/status` | Check status | Always needed |

**Existing `/api/auth/me` response** — add subscription fields:

```json
{
  "user": {
    "id": 1,
    "email": "user@company.com",
    "subscription_plan": "trial",
    "trial_ends_at": "2026-04-15T00:00:00.000Z",
    "subscription_status": "trial",
    "subscription_days_left": 12,
    "subscription_active": true
  }
}
```

### 4. Frontend — Trial Banner

**During active trial (days 1–14):**
- Top banner (subtle, non-intrusive): `"Pro Trial — 12 days remaining"`
- Accent-colored, dismissible per session
- Full app access, no restrictions

**Trial expiring soon (days 1–3):**
- Banner turns amber/warning: `"Pro Trial ends in 2 days — Upgrade to keep access"`
- Non-dismissible

**Trial expired (day 15+):**
- Persistent upgrade modal on gated actions (harvest, outreach)
- Modal content:
  - "Your 14-day Pro trial has ended"
  - "Upgrade to Pro — SAR 4,999/mo"
  - CTA 1: WhatsApp link (primary) — opens chat with pre-filled message
  - CTA 2: "Contact Sales" — same WhatsApp with different message
- Top banner turns red: `"Trial expired — Upgrade to continue harvesting"`
- Dashboard/CRM/analytics remain accessible (read-only value retention)

**Pro subscriber:**
- No banner, no modals. Clean experience.

**Founder:**
- No banner, no modals, no gates. Full bypass.

### 5. Frontend — Upgrade Modal Component

Single reusable `<UpgradeModal />` component:

```tsx
// Props
interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;  // only closable if trial still active (for "remind later")
  daysLeft: number;
  status: 'trial' | 'trial_expired';
}
```

**WhatsApp CTA:**
- URL: `https://wa.me/966XXXXXXXXX?text=I'd%20like%20to%20upgrade%20to%20LEADJIN%20Pro`
- Opens in new tab

### 6. Admin Panel Changes

**User list** — add columns:
- `trial_ends_at` — visible in admin user list
- `subscription_status` — computed (trial / expired / pro)

**No new admin endpoints needed** — existing `POST /api/admin/set-plan` already handles:
- Setting `subscription_plan = 'pro'`
- Setting `subscription_expires_at`
- Setting `monthly_searches_limit = -1`

### 7. Registration Flow (Updated)

```
User registers
  → subscription_plan = 'trial'
  → trial_ends_at = now + 14 days
  → monthly_searches_limit = -1 (unlimited)
  → Company profile gate (mandatory)
  → Dashboard access (full Pro features)
  → Day 12: banner turns amber
  → Day 15: soft gate activates
  → User contacts via WhatsApp
  → Admin sets plan to 'pro' via admin panel
  → User gets full access back
```

## Files to Modify

| File | Changes |
|------|---------|
| `server.ts` | Add `trial_ends_at` column migration, `getSubscriptionStatus()` helper, `GET /api/subscription/status` endpoint, gate middleware on harvest/email endpoints, update registration to set trial fields, update `/api/auth/me` response |
| `src/App.tsx` | Add trial banner component, upgrade modal component, subscription status check on load, gate harvest/outreach buttons when expired |

## Out of Scope

- Payment gateway integration (removed — manual invoices only)
- Automated email reminders for trial expiry
- Multiple pricing tiers (only Pro for now)
- Proration or plan downgrades
- Invoice generation for subscriptions

## Success Criteria

1. New users get 14-day trial with full Pro access
2. After day 14, harvest/outreach endpoints return 403
3. Frontend shows trial banner with countdown
4. Frontend shows upgrade modal on gated actions after expiry
5. CRM/leads/analytics remain accessible after trial expiry
6. Founder bypasses all gates
7. Admin can manually upgrade users to Pro via existing endpoint
