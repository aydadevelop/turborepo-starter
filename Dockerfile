# Multi-stage Dockerfile for Hono Node.js apps (server, assistant, notifications)
# Build with: docker build --build-arg APP=server -t my-app-server .
#
# Uses `turbo prune --docker` so the package.json list never needs manual updates.

ARG NODE_VERSION=22
FROM oven/bun:1 AS base
WORKDIR /app

# ── prune: isolate the target workspace and its dependencies ───────────────
FROM base AS prune
ARG APP=server
RUN bun add -g turbo@^2
COPY . .
RUN turbo prune ${APP} --docker

# ── deps: install ALL dependencies (devDeps needed for build) ──────────────
FROM base AS deps
COPY --from=prune /app/out/json/ .
RUN bun install --frozen-lockfile

# ── prod-deps: production-only dependencies for runtime ────────────────────────────
FROM base AS prod-deps
COPY --from=prune /app/out/json/ .
RUN bun install --frozen-lockfile --production

# ── build ──────────────────────────────────────────────────────────────────
FROM deps AS build
ARG APP=server
COPY --from=prune /app/out/full/ .
WORKDIR /app/apps/${APP}
RUN bun run build

# ── runtime ────────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-slim AS runtime
RUN addgroup --system --gid 1001 app && \
    adduser --system --uid 1001 --ingroup app app
WORKDIR /app

ARG APP=server
COPY --from=build --chown=app:app /app/apps/${APP}/dist ./dist
COPY --from=prod-deps --chown=app:app /app/node_modules ./node_modules

USER app
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "dist/index.mjs"]
