# my-app

Cloudflare-first full-stack monorepo starter.

## Stack

- Frontend: SvelteKit (Svelte 5) + shadcn-svelte patterns
- API server: Hono + oRPC on Workers
- Assistant service: Hono worker + tool-capable assistant package
- Auth: Better Auth
- Database: Drizzle + D1 (SQLite)
- Infra: Alchemy + Cloudflare Workers/Queues
- Build system: Turborepo
- Tests: Vitest

## Monorepo Layout

```text
apps/
  web/             # SvelteKit frontend
  server/          # Main Hono/oRPC worker
  assistant/       # Assistant worker
  notifications/   # Queue consumer worker
packages/
  api/             # oRPC contracts + routers + services
  assistant/       # Assistant contract, tools, transport
  auth/            # Better Auth setup
  db/              # Drizzle schema + migrations + seed scripts
  env/             # Typed env validation
  infra/           # Alchemy infrastructure definition
  notifications/   # Queue contracts + processor helpers
  proxy/           # Optional local tunnel reverse-proxy
  ui/              # Shared Svelte UI components
  vitest-config/   # Shared Vitest config
```

## Prerequisites

- Node.js 20+
- Bun 1.2+
- Cloudflare account and API token for deploys

## Install

```bash
bun install
```

## Local Development

```bash
# Start infra runtime (workers + web + queues)
bun run dev

# Frontend only
bun run dev:web

# Infra runtime only
bun run dev:server

# Optional tunnel mode
bun run dev:tunnel
```

## Environment Flow

- Infra loads env in this order (highest precedence first): shell/CI, stage-specific files, base files.
- Infra file layer: `packages/infra/.env.{stage}` then `packages/infra/.env`.
- App file layer: `apps/server/.env.{stage}` then `apps/server/.env`.
- `STAGE=e2e` (or `ALCHEMY_E2E=1`) enables safe local e2e defaults and local Cloudflare placeholders.
- Deploy URL defaults are derived from your workers.dev subdomain when available; override with `BETTER_AUTH_URL`, `CORS_ORIGIN`, or `CLOUDFLARE_WORKERS_SUBDOMAIN` as needed.

## Quality Gates

```bash
bun run lint
bun run check-types
bun run test
bun run build
```

## Database

```bash
bun run db:generate
bun run db:migrate
bun run db:push
bun run db:seed
bun run db:studio
```

## Deploy

```bash
bun run deploy -- --stage dev
bun run deploy -- --stage test
bun run deploy -- --stage prod
```

## Starter Trim Goal

This branch (`codex/starter-v1`) is focused on converting project-specific product surface into reusable starter defaults while keeping:

- assistant/tooling capabilities
- typed oRPC contracts
- queue + DLQ patterns
- Cloudflare deploy workflow through Alchemy
