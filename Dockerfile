# Multi-stage Dockerfile for Hono Node.js apps (server, assistant, notifications)
# Build with: docker build --build-arg APP=server -t my-app-server .
#
# Uses `turbo prune --docker` so the package.json list never needs manual updates.

ARG NODE_VERSION=22
ARG BUN_VERSION=1.3.10
FROM oven/bun:${BUN_VERSION} AS base
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
RUN env -u CI bun install

# ── build ──────────────────────────────────────────────────────────────────
FROM deps AS build
ARG APP=server
COPY --from=prune /app/out/full/ .
WORKDIR /app/apps/${APP}
RUN bun run build

# ── runtime ────────────────────────────────────────────────────────────────
# Reuse the bun image (already pulled in base stage — no extra network pull).
FROM oven/bun:${BUN_VERSION} AS runtime
WORKDIR /app

# Install packages that tsdown cannot bundle (rolldown parse errors in better-auth source).
# Everything else is inlined in dist/ via noExternal:[/.+/].
# Place before COPY so this layer is cached independently of source changes.
RUN echo '{"type":"module"}' > package.json && \
    bun add \
      'better-auth@^1.5.0' \
      '@better-auth/drizzle-adapter@^1.5.0' \
      '@better-auth/passkey@^1.5.0' \
      'better-auth-telegram@^0.3.2'

ARG APP=server
# oven/bun ships with a non-root 'bun' user (uid 1000) — use it directly.
COPY --from=build --chown=bun:bun /app/apps/${APP}/app.json ./app.json
COPY --from=build --chown=bun:bun /app/apps/${APP}/dist ./dist
COPY --from=build --chown=bun:bun /app/packages/db/src/migrations ./migrations

USER bun
ENV NODE_ENV=production
EXPOSE 3000
CMD ["bun", "run", "dist/index.mjs"]
