status: verified 2026-11-28

# Operations

## Running the app

The app is an Express + TypeScript server with a React 19 SPA built into
`app/dist`. Run it with:

```sh
cd app
npm run dev        # tsx server.ts, PORT default 3001
```

Production-style: `NODE_ENV=production tsx server.ts` on `PORT` 3001.

## Health

`GET /api/health` returns `status` / `provider` / `db`. A running service is
the health signal for the systemd unit.

## Deployment

Deployed as a systemd user unit `euphoria-leadjin.service`, with
WorkingDirectory `/home/euphoria/euphoria-v2/work/leadjin/app` (or the
canonical checkout), `PORT 3001`, `NODE_ENV=production`, `tsx server.ts`.
Operated privately on localhost/tailnet.

Environment variables are referenced by name only; no values are stored in
this repository. Names: LEADJIN_PROVIDER, LEADJIN_MODEL,
LEADJIN_ADMIN_SECRET, DATABASE_PATH, PORT, NODE_ENV, OLLAMA_BASE_URL,
WATHQ_CONSUMER_KEY, GOOGLE_PLACES_API_KEY, SMTP_*, GOOGLE_CLIENT_ID,
GOOGLE_CLIENT_SECRET, MAIL_CRED_KEY, WHATSAPP_*, TINYFISH_*, AGENT_REACH_*.

## Environment

- `LEADJIN_PROVIDER` (`ollama` | `byok`): provider selection; `LEADJIN_MODEL`
  selects the model.
- `OLLAMA_BASE_URL`: Ollama endpoint (127.0.0.1:11434 in the local setup).
- `WATHQ_CONSUMER_KEY`: optional; keyless-degrading when absent.
- `GOOGLE_PLACES_API_KEY`: optional discovery enhancer.
- `SMTP_*`: email queue delivery.
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`: Gmail sending and calendar.
- `MAIL_CRED_KEY`: mail credentials.
- `WHATSAPP_*`: WhatsApp status/send bridge.
- `TINYFISH_*`: agent-side web research.
- `AGENT_REACH_*`: outbound outreach tooling.

## Tests

- `npm test` (live).
- `npm run test:isolated` (throwaway DB on port 3456).
- `npx tsc --noEmit`.
- `npm run build`.

## Observability

Autopilot observability records cost, latency, engines used and failure
reasons. A failed stage with no reason is refused. The autopilot tick
scheduler runs on goals; `runHistory.ts` keeps `autopilot_runs` and
`decision_inbox`, every row user-scoped.

## Consent and suppression checks in production

Before any send path the PDPL gate is called; `GET /api/pdpl/send-sites`
lists the live send inventory. Suppression is email-keyed and blocks any
address with no lead row too; unsubscribe links carry HMAC tokens.

## Red flags

- No live send has been turned on (owner approval required).
- First live campaign requires counsel sign-off (PDPL reading) and owner
  acceptance that the customer is the controller.
