# LeadJin v9 — Final Fix Round

**For:** Kimi (implementation agent)
**Updated:** 2026-03-27 15:00 (Round 5 — post-extraction regression fixes)
**Created by:** Claude (audit agent)

---

## Context

49 original tasks are complete. The monolith split (App.tsx 5,380 → 1,950 lines) introduced 8 regressions. These are the ONLY remaining items before production.

**Fix all 8. Do not refactor anything else. Do not extract anything else.**

---

## CRITICAL — App will crash or silently break

### FIX-1: useMediaQuery called inside JSX (Rules of Hooks violation)
**File:** `src/App.tsx` ~line 1652
**Bug:** `isMobile={!useMediaQuery('(min-width: 768px)')}` calls a hook inside JSX render. React will throw.
**Fix:** The `isDesktop` variable already exists at ~line 375 from the same hook call. Replace:
```tsx
// BEFORE (broken)
isMobile={!useMediaQuery('(min-width: 768px)')}

// AFTER (fixed)
isMobile={!isDesktop}
```

### FIX-2: Quotation form data never reaches the API
**File:** `src/components/LeadDetailPanel.tsx` ~line 47, `src/App.tsx` ~line 1729
**Bug:** `LeadDetailPanel` calls `onCreateQuotation({ items, notes, currency, vat_rate })` with form data. But `handleCreateQuotation` in App.tsx takes zero arguments and uses its own stale state instead. The data collected in the panel's form is silently discarded.
**Fix:** Update `handleCreateQuotation` in App.tsx to accept and use the data parameter:
```tsx
const handleCreateQuotation = async (data: { items: any[]; notes: string; currency: string; vat_rate: number }) => {
  // Use data.items, data.notes, data.currency, data.vat_rate in the POST body
  const res = await authFetch('/api/quotations/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      lead_id: selectedLead?.lead_id,
      items: data.items,
      notes: data.notes,
      currency: data.currency,
      vat_rate: data.vat_rate
    })
  });
  // ... rest of handler
};
```

### FIX-3: Language toggle buttons are no-ops in Settings
**File:** `src/views/SettingsView.tsx` ~lines 335-346
**Bug:** Both language buttons have `onClick={() => {}}`. No `setLanguage` prop exists on `SettingsView`. Clicking EN/AR does nothing.
**Fix:**
1. Add `setLanguage: (lang: 'en' | 'ar') => void` to `SettingsViewProps` interface
2. Destructure `setLanguage` in the component params
3. Pass it through to `SystemTab`
4. Wire the buttons: `onClick={() => setLanguage('en')}` and `onClick={() => setLanguage('ar')}`
5. In App.tsx, pass `setLanguage={setLanguage}` to `<SettingsView>`

### FIX-4: Save Profile button is a stub (authToken not wired)
**File:** `src/views/SettingsView.tsx` ~lines 23, 42
**Bug:** `authToken` is declared in props but never destructured. The GeneralTab's handleSave only calls `onNotify` — it doesn't actually call the API to persist the company profile.
**Fix:**
1. Destructure `authToken` in `SettingsView`
2. Pass it to `GeneralTab`
3. In GeneralTab's handleSave, make the actual API call:
```tsx
const res = await fetch('/api/user/profile', {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
  body: JSON.stringify(companyProfile)
});
if (res.ok) onNotify({ type: 'success', message: 'Profile saved' });
```

---

## HIGH — Security hole or broken feature

### FIX-5: Open redirect in email click tracking
**File:** `server.ts` ~line 2721
**Bug:** `res.redirect(url)` where `url` comes directly from `req.query.url` with no validation. Anyone can craft `/api/email/track/1/click?url=javascript:alert(1)` or redirect to a phishing site.
**Fix:** Add URL validation before redirecting:
```tsx
const url = req.query.url as string;
if (!url) return res.status(400).send('Missing url');

// Block non-HTTP protocols and validate URL format
try {
  const parsed = new URL(url);
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return res.status(400).send('Invalid URL protocol');
  }
} catch {
  return res.status(400).send('Invalid URL');
}

// ... then redirect
res.redirect(url);
```

### FIX-6: background.js missing 401 token clearing
**File:** `extension/background.js`
**Bug:** When the server returns 401 (expired session), background.js silently stops working. Token stays in storage, follow-up reminders permanently break with no user indication.
**Fix:** In both `checkFollowupReminders` and `addLeadToBackend`, after the fetch, add:
```js
if (res.status === 401) {
  chrome.storage.local.remove('leadjinToken');
  chrome.action.setBadgeText({ text: '!' });
  chrome.action.setBadgeBackgroundColor({ color: '#dc2626' });
  return;
}
```

---

## MEDIUM — Will cause console errors or type issues

### FIX-7: React namespace used without import in view files
**Files:** `src/views/HarvestView.tsx`, `src/views/CRMView.tsx`, `src/views/AnalyticsView.tsx`
**Bug:** These files use `React.FC`, `React.FormEvent`, `React.MouseEvent` without importing React. Will fail with `'React' refers to a UMD global` error.
**Fix:** Add to the top of each file:
```tsx
import React from 'react';
```
Or replace with named imports:
```tsx
import type { FC, FormEvent, MouseEvent } from 'react';
```

### FIX-8: SortableLeadCard in DragOverlay causes dnd-kit warnings
**File:** `src/views/CRMView.tsx` ~lines 145-149
**Bug:** `DragOverlay` renders `<SortableLeadCard>` which calls `useSortable` — but DragOverlay is outside `SortableContext`. Produces console errors during drag.
**Fix:** Create a simple presentational card for the overlay that does NOT call `useSortable`:
```tsx
// Inside CRMView or in a shared file
function DragOverlayCard({ lead, language, arabicCardMode }: { lead: any; language: string; arabicCardMode: boolean }) {
  return (
    <div className="bg-white dark:bg-zinc-800 rounded-lg shadow-lg p-3 opacity-90 border border-blue-400">
      <div className="font-medium text-sm">{lead.name}</div>
      <div className="text-xs text-zinc-500">{lead.company}</div>
    </div>
  );
}
```
Use `<DragOverlayCard>` instead of `<SortableLeadCard>` inside `<DragOverlay>`.

---

## LOW — Cleanup (do if time permits)

### CLEANUP-1: Remove duplicate unsubscribe endpoint
**File:** `server.ts` ~line 2650
There are two unsubscribe endpoints (GET at ~1992, POST at ~2650). The POST version has a dead ALTER TABLE. Remove the POST endpoint entirely.

### CLEANUP-2: Remove dead AppContext localStorage typo
**File:** `src/context/AppContext.tsx`
Uses `leadjin_lang` while App.tsx uses `leadgin_lang`. Since AppContext isn't wired, this is dead code. Either fix the key to match App.tsx (`leadgin_lang`) or leave it — it's not mounted.

---

## Execution Order

1. FIX-1 (30 seconds — one line change)
2. FIX-7 (1 minute — add imports to 3 files)
3. FIX-3 (5 minutes — wire setLanguage prop)
4. FIX-4 (5 minutes — wire authToken + API call)
5. FIX-2 (5 minutes — pass quotation data through)
6. FIX-5 (3 minutes — URL validation)
7. FIX-6 (3 minutes — 401 handling in background.js)
8. FIX-8 (5 minutes — create overlay card)

**Total estimated: ~30 minutes.**

---

## Verification After All Fixes

- [ ] `npx tsc --noEmit` — zero errors
- [ ] `npm run build` — succeeds
- [ ] Language toggle in Settings actually changes the language
- [ ] Save Profile in Settings actually persists to backend
- [ ] Creating a quotation from lead detail panel sends the form data to API
- [ ] Email click tracking rejects `javascript:` URLs
- [ ] Chrome extension: expired token gets cleared, badge shows "!"
- [ ] Drag overlay in CRM doesn't produce console errors

---

*8 fixes. ~30 minutes of work. Then LeadJin is production-ready.*
