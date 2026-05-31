# syntax=docker/dockerfile:1

# Single image for the whole monorepo. The same built image runs the API, the
# worker, the web server, and the one-shot migration step; docker compose just
# overrides the command per service. Build stages are layer-cached so the heavy
# install/build runs once and is reused.

FROM node:22-bookworm-slim AS base
# OpenSSL + CA certs are required by the Prisma query engine at runtime.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# ---- deps: install all workspace dependencies (cached on manifest changes) ----
FROM base AS deps
# Toolchain for native modules (argon2). Only present in the build pipeline.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
# Copy only manifests first so `npm ci` is cached unless dependencies change.
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY apps/worker/package.json ./apps/worker/package.json
COPY packages/shared/package.json ./packages/shared/package.json
COPY packages/database/package.json ./packages/database/package.json
RUN npm ci

# ---- build: compile every workspace and generate the Prisma client ----
FROM deps AS build
# NEXT_PUBLIC_* values are inlined into the browser bundle at build time. The
# default targets the API's published host port for a local Docker run; override
# with --build-arg when deploying behind a different public URL.
ARG NEXT_PUBLIC_API_BASE_URL=http://localhost:3001
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
COPY . .
RUN npm run db:generate \
  && npm run build:shared \
  && npm run build:database \
  && npm run build:api \
  && npm run build:worker \
  && npm run build:web

# ---- runtime: lean image without the build toolchain ----
FROM base AS runtime
ENV NODE_ENV=production
# Copy the fully built workspace, including node_modules with the generated
# Prisma client, native argon2 binary, and @nih/* workspace symlinks.
COPY --from=build /app /app
# Default command; each compose service overrides this.
CMD ["node", "apps/api/dist/main.js"]
