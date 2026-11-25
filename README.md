# LeadJin

Regional intelligence platform for the Saudi market: React 19 + Vite front end, Express + SQLite
back end, and a KSA company registry leg behind the scenes.

## Layout

| Path | What it is |
|------|------------|
| `app/` | The application: `server.ts` (Express), `src/` (React + services), `tests/`, build config |
| `docs/` | Design and task documentation |
| `extension/` | Browser extension assets |
| `infra/` | Deployment notes and infrastructure material |
| `mobile/` | Mobile shell material |

The application keeps its own git history; changes land here under `app/`. Runtime artifacts are
not tracked: `node_modules/`, `dist/`, `coverage/`, `*.db*`, `.env` (only `.env.example` is),
`*.bak*`.

## Run the app

```sh
cd app
npm install
cp .env.example .env          # fill in the values you need
npm run dev                   # tsx server.ts on port 3001
npm run lint                  # tsc --noEmit
npm run build                 # vite build
npm test                      # vitest run
```

## Status

The production readiness audit lives beside the application repository and names the open
security, observability and rollback gaps.
