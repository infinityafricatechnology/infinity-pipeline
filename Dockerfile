# syntax=docker/dockerfile:1.7
# Infinity Pipeline : une seule image, API + interface web, base SQLite sur un volume.
# Node 24 est requis : exécution directe du TypeScript (type stripping) et module node:sqlite.

ARG NODE_VERSION=24.18.1

# ---------- Dépendances et compilation de l'interface ----------
FROM node:${NODE_VERSION}-bookworm-slim AS build
WORKDIR /app
RUN npm install -g pnpm@11.10.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile
COPY apps/web apps/web
RUN pnpm --filter @iat/web build

# ---------- Dépendances de production de l'API ----------
FROM node:${NODE_VERSION}-bookworm-slim AS deps
WORKDIR /app
RUN npm install -g pnpm@11.10.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --prod --filter @iat/api

# ---------- Image finale ----------
FROM node:${NODE_VERSION}-bookworm-slim
ENV NODE_ENV=production \
    PORT=8300 \
    HOST=0.0.0.0 \
    DATABASE_PATH=/data/iat.db \
    SEED_PATH=/app/seed/seed.json \
    WEB_DIST=/app/apps/web/dist
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY package.json ./
COPY apps/api/package.json apps/api/
COPY apps/api/src apps/api/src
COPY --from=build /app/apps/web/dist apps/web/dist
# Données de départ tirées du classeur (pnpm import) : chargées au premier démarrage seulement.
COPY data/seed.json seed/seed.json
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN mkdir -p /data && chown node:node /data && chmod +x /usr/local/bin/entrypoint.sh
USER node
VOLUME ["/data"]
EXPOSE 8300
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
