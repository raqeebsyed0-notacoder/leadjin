# LeadJin — Regional Intelligence Platform (KSA)

B2B lead-generation platform built for the Saudi market: find a company, verify it,
work it through a pipeline, write to it, and report on it. An AI employee, **Jin**,
runs the lead lifecycle end to end.

> **Status: pilot / pre-production.** The application builds and its test suite runs.
> It is not deployed to production, and several data channels (AI harvesting, Gmail,
> WhatsApp) are gated behind credentials that are not set in this repository.
> See `docs/architecture/IMPLEMENTATION_STATUS.md`.

## Repository layout

```
app/                     The runnable application
  src/                   React 19 + Vite frontend (dashboard, landing, services)
  server.ts              Node/Express backend (single entry point)
  public/                PWA assets
  tests/                 Vitest test suite
  scripts/               Build / crawl / seeding helpers
  capacitor.config.*     Capacitor shell configuration
docs/
  architecture/          System spec, business module analysis, implementation status
  specs/                 Feature design specs
  plans/                 Feature implementation plans
  api/                   Third-party API contracts (Wathq)
infra/                   Docker, docker-compose, PM2 process configs
  windows/               Windows dev setup scripts
mobile/                  Capacitor Android shell + network-security templates
extension/               Chrome extension (manifest v3)
```

## Running locally

```bash
cd app
npm ci
cp .env.example .env         # fill in the values you need
npm run dev                  # starts the Express server (default port 3001)
```

Frontend build:

```bash
cd app
npm run build                # vite build -> app/dist
npm run preview
```

Tests (they expect the API running on http://localhost:3001):

```bash
cd app
npm run test
```

## Configuration

All configuration is environment-driven; see `app/.env.example`. No credentials are
stored in this repository. The backend reads:

- `PORT`, `DATABASE_PATH` — server + SQLite location
- `SMTP_*` — outreach email delivery
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — Gmail + Calendar OAuth
- `GEMINI_API_KEY` — AI harvesting and enrichment
- `WHATSAPP_TOKEN` / `WHATSAPP_PHONE_ID` — WhatsApp Business API
- `LEADJIN_ADMIN_SECRET` — admin surface

## What this repository is not

- It does **not** contain the production database, credentials, or any customer data.
- It is **not** the deployment target; deployment config lives in `infra/`.
- Internal operational notes are deliberately kept out of this repository.

## Licence

Not yet set by the owner. Until a licence is added, all rights are reserved.
