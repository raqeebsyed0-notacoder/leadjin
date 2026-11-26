# Deploy Guide — LeadJin

How to build, release, roll back, and back up the LeadJin application.

> **Prerequisite.** The app is currently **pilot / pre-production**. Several data
> channels (AI harvesting, Gmail, WhatsApp) are gated behind credentials that are
> supplied at deploy time through the `.env` file and are **never committed**.

---

## 1. Build

### Frontend + server (development)

```bash
cd app
npm ci
npm run build:server   # tsc --project tsconfig.server.json
npm run build          # vite build -> app/dist
npm run preview        # preview the production build
```

### Production image (Docker)

The `Dockerfile` is a two-stage build: the first stage compiles the TypeScript server
and the Vite frontend; the second stage is a lean `node:20-alpine` image with a
non-root `node` user.

```bash
cd app
docker build -t leadjin:app .
docker run -p 3002:3001 --env-file .env leadjin:app
```

The production image:

- Exposes port `3001`.
- Runs `npx tsx server.ts` as the `node` user (`NODE_ENV=production`).
- Serves the API at `/api/health` for health checks (also used by docker-compose).

---

## 2. Run (docker-compose)

`docker-compose.yml` binds **external 3002 → internal 3001**, mounts a `./data`
volume for the SQLite database, and injects the remaining environment from
`.env`.

```bash
cd app
cp .env.example .env         # set the values you need
docker compose up -d
```

`docker compose pull && docker compose up -d` for a fresh image pull.

---

## 3. Release tagging

Tags are made on the repo commit that is being released:

```bash
git tag -a v1.2.3 -m "LeadJin 1.2.3"
git push origin v1.2.3
```

The tag is the release candidate for the version noted in the image build and in
any releases log. From the tag, rebuild the production image and redeploy.

---

## 4. Rollback

### Docker Compose deployment

```bash
# Stop the current stack
docker compose down

# Re-run the previously released image (tag is known from the release log)
docker compose up -d --no-recreate

# If the image tag was wrong, pull the prior tag and pin it, e.g.
# docker tag leadjin:app leadjin:previous && docker compose up -d --no-recreate
```

### PM2 deployment (legacy single-host)

PM2 config (`infra/ecosystem.config.cjs`) is named `leadjin` with `autorestart: true`
and `max_restarts: 10`. To roll back:

```bash
cd infra
pm2 stop leadjin && pm2 delete leadjin
# deploy the prior commit or prior image, then
pm2 start ecosystem.config.cjs --env production
pm2 save
```

### Database rollback caveat

Rolling back the application code does **not** roll back the SQLite database. If a
bad release corrupts application logic behind the database, migrate back to the
previous tag and restore the `data/leadjin.db` from the most recent backup (see
below) before redeploying.

---

## 5. Backup

The stateful parts of a deploy are the SQLite database and its WAL/SHM files.

```bash
# From the host (docker-compose mounts ./data -> /app/data)
cd /path/to/leadjin/app
tar -czf backups/leadjin-$(date +%Y%m%dT%H%M%SZ).tar.gz \
    data/leadjin.db data/leadjin.db-wal data/leadjin.db-shm
```

Keep at least one daily backup outside the container (outside the repo backup
directory). Restore by stopping the stack, replacing the contents of `data/` with
the archive, and restarting:

```bash
tar -xzf backups/leadjin-20261124T001500Z.tar.gz -C /path/to/leadjin/app
docker compose up -d
```

Health-check the restored node with `curl http://127.0.0.1:3001/api/health` before
declaring the restore complete.
