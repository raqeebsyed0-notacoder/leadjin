# LeadJin v9 — Feature Restoration Task Sheet

**For:** Kimi (implementation agent)
**Created:** 2026-03-27 16:30
**Created by:** Claude (audit agent)
**Priority:** CRITICAL — These are features that existed before the monolith split and were removed during extraction.

---

## Context

The App.tsx monolith split (5,380 → 1,950 lines) accidentally removed 13 features from the UI. The state variables and API endpoints still exist in App.tsx and server.ts — only the JSX rendering was lost during extraction to view files.

**Reference file:** `src/App.tsx.backup` (4,007 lines) — this is the ground truth for how features should look.

**Do NOT modify App.tsx state or handlers.** Only restore the JSX in the extracted view files.

---

## RESTORE-1: Industry Dropdowns in HarvestView (CRITICAL)

**File:** `src/views/HarvestView.tsx`
**Reference:** `App.tsx.backup` lines 1852-1947

The harvest form needs TWO `<select>` dropdowns with 21 GCC-specific industries:

**A) "Your Industry" select** — bound to `userIndustry` / `setUserIndustry` props (already passed):
```
Information Technology & AI
Financial Services & Fintech
General Trading & Distribution
Food & Beverage (Restaurants, Cafes)
Retail, Malls & Boutiques
Energy, Oil & Gas
Renewable Energy
Mining & Metals
Petrochemicals & Materials
Healthcare & Life Sciences
Tourism, Hospitality & Entertainment
Real Estate & Mega-Projects
Construction & Contracting
Logistics, Aviation & Transportation
Defense & Security
Education & EdTech
Public Sector & Government
Consumer Retail & E-commerce
Sports & Events
Telecommunications & Media
Agriculture & Food Security
```

**B) "Target Industry" select** — bound to `targetIndustry` / `setTargetIndustry` props:
Same 21 options PLUS a first option: `✨ Any / Auto-Match (AI Driven)`

Replace the current plain `<input>` for industries with these two structured selects. The `userIndustry` and `targetIndustry` props already exist in HarvestView's interface but are never rendered — wire them to selects.

---

## RESTORE-2: Missing ICP Fields in HarvestView

**File:** `src/views/HarvestView.tsx`
**Reference:** `App.tsx.backup` lines 1882-1909

Add back these two fields to the harvest form:

**A) "Killer Case Study / Metric"** — text input bound to `userCaseStudy` / `setUserCaseStudy`
- Placeholder: `e.g. Reduced shipping costs by 22%...`

**B) "Top Competitors"** — text input bound to `userCompetitors` / `setUserCompetitors`
- Placeholder: `e.g. DHL, FedEx`

Both props are already declared in HarvestViewProps and passed from App.tsx.

---

## RESTORE-3: Outreach Template Selector in HarvestView

**File:** `src/views/HarvestView.tsx`
**Reference:** `App.tsx.backup` lines 1983-1994

Add a `<select>` at the bottom of the ICP form labeled "Outreach Template (Optional)":
```tsx
<select value={selectedTemplateId || ''} onChange={e => setSelectedTemplateId(e.target.value ? Number(e.target.value) : null)}>
  <option value="">AI Generated (Default)</option>
  {emailTemplates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
</select>
```

Props `emailTemplates`, `selectedTemplateId`, `setSelectedTemplateId` need to be added to HarvestViewProps and passed from App.tsx.

---

## RESTORE-4: Two-Section Form Layout in HarvestView

**File:** `src/views/HarvestView.tsx`
**Reference:** `App.tsx.backup` lines 1847-1916

Organize the form into two visual sections:
- **"1. Your Company Profile"** — Your Industry, Your Services, Killer Case Study, Top Competitors
- **"2. Target Market (ICP)"** — Target Industry, Company Size, Geography, Job Titles, Limit

Use a `grid grid-cols-1 md:grid-cols-2` layout as in the backup.

---

## RESTORE-5: Outreach & AI Settings Tab (CRITICAL)

**File:** `src/views/SettingsView.tsx`
**Reference:** `App.tsx.backup` lines 2476-2894

Add back the "Outreach & AI" tab with TWO sections:

**A) Email Templates CRUD** — full create/edit/delete:
- List all templates with name + subject preview
- Edit button → inline form (name, subject, body textarea)
- Delete button with confirm dialog → `DELETE /api/templates/:id`
- "Create New Template" button
- Variable docs: `{{name}}`, `{{company}}`, `{{industry}}`
- API calls: `GET /api/templates`, `POST /api/templates`, `PUT /api/templates/:id`, `DELETE /api/templates/:id`

**B) Regional Intelligence toggles:**
- Majlis Mode toggle — `majlisModeEnabled` / `setMajlisModeEnabled`
- Vision 2030 toggle — `vision2030Enabled` / `setVision2030Enabled`

Props needed: `authToken`, `emailTemplates`, `setEmailTemplates`, `editingTemplate`, `setEditingTemplate`, `majlisModeEnabled`, `setMajlisModeEnabled`, `vision2030Enabled`, `setVision2030Enabled`, `onNotify`

---

## RESTORE-6: Real Gmail OAuth in Integrations Tab

**File:** `src/views/SettingsView.tsx`
**Reference:** `App.tsx.backup` lines 2588-2750

Replace the "coming soon" stubs with the real OAuth flow:

**Connected state** (when `gmailConnected === true`):
- Show Gmail name + email
- "Test Connection" button → `POST /api/auth/google/test`
- "Disconnect" button → `POST /api/auth/google/disconnect`

**Disconnected state:**
- "Connect Gmail Account" button → fetches `GET /api/auth/google` to get OAuth URL, opens popup: `window.open(data.url, 'google_auth', 'width=600,height=700')`
- Listen for popup close and check connection status

**Gemini API Key entry** (for non-founder accounts):
- Input field for API key
- Save to `PUT /api/user/profile` with `gemini_api_key` field

Props needed: `authToken`, `gmailConnected`, `setGmailConnected`, `gmailEmail`, `gmailName`, `currentUser`, `onNotify`

---

## RESTORE-7: Account Widget with Progress Bar

**File:** `src/views/SettingsView.tsx` — Integrations tab
**Reference:** `App.tsx.backup` lines 2595-2634

Add back the account section with:
- Plan badge (Pro/Basic/Free) with colored indicator dot
- "Monthly Searches: X / Y" with a progress bar
- Sign Out button wired to `onLogout`

---

## RESTORE-8: Legal/IP Section + Clear Data Button

**File:** `src/views/SettingsView.tsx` — General tab
**Reference:** `App.tsx.backup` lines 2543-2584

Add back:
- "Legal & IP Protection" section: Patent Pending badge
- "Technical Whitepaper" button → `onShowWhitepaper()`
- "Privacy Controls" section: "Clear All Local Data" button → `onClearData()`

Props needed: `onShowWhitepaper`, `onClearData`

---

## RESTORE-9: System Tab — Case Study Simulation + GSSE Panel

**File:** `src/views/SettingsView.tsx` — System tab
**Reference:** `App.tsx.backup` lines 2897-2968

Add back:
- "Case Study Simulation" button → `onRunSimulation()`
- GSSE Patent Blueprint panel (Spatial/Semantic/Cultural layers card)
- Mobile PWA / Chrome Extension install guide

---

## RESTORE-10: Service Catalog Persistence

**File:** `src/views/SettingsView.tsx` — Services tab
**Current:** Local state only, resets on refresh
**Fix:** Wire to backend API:
- Load: `GET /api/services` on mount
- Add: `POST /api/services`
- Update: `PUT /api/services/:id`
- Delete: `DELETE /api/services/:id`
- Make service name and price editable inline

Props needed: `authToken`, `services`, `setServices`, `onNotify`

---

## RESTORE-11: Whitepaper Modal

**File:** `src/App.tsx` — add back the modal JSX
**Reference:** `App.tsx.backup` lines 3807-3909

The `showWhitepaper` state already exists in App.tsx. Add back the modal JSX with the four sections: Executive Summary, Architecture, Cryptographic Proof, Strategic Advantage.

---

## Execution Order

1. RESTORE-1 + RESTORE-2 + RESTORE-3 + RESTORE-4 (HarvestView) — restore the ICP form
2. RESTORE-5 (Outreach & AI tab) — this is the biggest missing piece
3. RESTORE-6 + RESTORE-7 (Integrations tab) — Gmail OAuth + account widget
4. RESTORE-8 + RESTORE-9 (General + System tabs) — legal section + simulation
5. RESTORE-10 (Service persistence) — wire to API
6. RESTORE-11 (Whitepaper modal) — add modal back to App.tsx

## Verification

After all restorations:
- [ ] Harvest form shows two industry dropdowns with 21 options each
- [ ] "Killer Case Study" and "Top Competitors" fields visible in harvest form
- [ ] Outreach Template selector visible at bottom of harvest form
- [ ] Settings has 5 tabs: General, Integrations, Outreach & AI, Services, System
- [ ] Email Templates CRUD works (create, edit, delete)
- [ ] Gmail OAuth connect button opens popup (needs Google credentials to fully test)
- [ ] Account shows plan + usage progress bar
- [ ] Clear Data button exists in General settings
- [ ] Whitepaper button opens modal
- [ ] Service catalog persists across page refresh
- [ ] `npx tsc --noEmit` passes

---

*The backup file `src/App.tsx.backup` is the reference. Copy JSX from there and adapt for the extracted component props.*
