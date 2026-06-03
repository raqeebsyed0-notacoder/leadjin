# LeadJin — Production Dockerfile
# Multi-stage: builder compiles TypeScript + Vite frontend,
# production image is lean with non-root user.

# ---- Stage 1: builder ----
FROM node:20-alpine AS builder

# Build tools needed for better-sqlite3 native binding
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy manifests first for layer-cache efficiency
COPY package*.json ./
RUN npm ci

# Copy full source and build
COPY . .
RUN npm run build

# ---- Stage 2: production ----
FROM node:20-alpine AS production

# curl for health checks, chromium for any puppeteer features,
# plus the native binding runtime deps for better-sqlite3
RUN apk add --no-cache \
    curl \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    font-noto-emoji \
    python3 \
    make \
    g++

# Tell Puppeteer to use system Chromium instead of downloading its own
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

WORKDIR /app

# Install production deps + tsx (runs TypeScript directly, matching pm2 setup)
COPY package*.json ./
RUN npm ci --omit=dev && npm install tsx

# Copy built frontend and all server source from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src ./src
COPY --from=builder /app/server.ts ./server.ts
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/vite.config.ts ./vite.config.ts
COPY --from=builder /app/index.html ./index.html

# Pre-create the data directory and set correct ownership before
# dropping to the non-root node user
RUN mkdir -p /app/data && chown -R node:node /app

USER node

ENV NODE_ENV=production
# Internal port — matches server.ts default and the PORT env var
ENV PORT=3001

EXPOSE 3001

# Health check against the Express /api/health endpoint
HEALTHCHECK --interval=30s --timeout=10s --start-period=45s --retries=3 \
    CMD curl -sf http://127.0.0.1:3001/api/health || exit 1

CMD ["npx", "tsx", "server.ts"]
