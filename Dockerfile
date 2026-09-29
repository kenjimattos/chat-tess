# syntax=docker/dockerfile:1

# ── Build: compila o frontend e gera o bundle da API ─────────────────────────
FROM node:24-slim AS build
WORKDIR /app

# Só os manifestos primeiro, para aproveitar o cache da instalação.
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN npm ci --ignore-scripts

COPY tsconfig.base.json ./
COPY packages packages
COPY apps apps
RUN npm run db:generate && npm run build

# Mantém apenas as dependências de produção da API.
RUN npm prune --omit=dev --ignore-scripts

# ── Runtime ──────────────────────────────────────────────────────────────────
FROM node:24-slim AS runtime
ENV NODE_ENV=production \
    PORT=8080 \
    WEB_DIST_DIR=/app/web
WORKDIR /app/api

COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/apps/api/dist ./dist
COPY --from=build /app/apps/api/package.json ./
COPY --from=build /app/apps/api/prisma ./prisma
COPY --from=build /app/apps/api/prisma.config.ts ./
COPY --from=build /app/apps/web/dist /app/web

USER node
EXPOSE 8080

# Aplica as migrações pendentes e sobe a API.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
