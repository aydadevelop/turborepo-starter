# Technology Stack

**Analysis Date:** 2026-03-09

## Languages

**Primary:**
- TypeScript 5.9.x - application and package code across `apps/*`, `packages/*`, and `infra/pulumi/` (`package.json`, `apps/web/package.json`, `infra/pulumi/package.json`)

**Secondary:**
- SQL via Drizzle schema definitions - PostgreSQL schema modeled in `packages/db/src/schema/*.ts`
- YAML / Docker config - deployment and local infra in `docker-compose.yml` and `.github/workflows/deploy-docker.yml`
- Shell / Node scripts - operational scripts in `scripts/` and `infra/scripts/`

## Runtime

**Environment:**
- Bun 1.3.10 - workspace package manager and primary local runtime (`package.json`)
- Node.js 22+ - required by the starter docs and adapters (`README.md`)
- Docker + Compose - local stack and Dokku image deployment (`docker-compose.yml`, `README.md`)
- PostgreSQL 18 with pgvector image - database runtime in `docker-compose.yml`

**Package Manager:**
- Bun 1.3.10
- Lockfile: `bun.lock` not present in the provided tree; package manager is still declared explicitly in `package.json`

## Frameworks

**Core:**
- SvelteKit 2.31 + Svelte 5 - frontend app in `apps/web/`
- Hono 4.8 - HTTP transport for `apps/server/`, `apps/assistant/`, and `apps/notifications/`
- oRPC 1.12/1.13 - contract-first RPC between `packages/api-contract/`, `packages/api/`, `apps/server/`, `apps/web/`, and `packages/assistant/`
- Better Auth 1.5 - auth/session/org model in `packages/auth/`
- Drizzle ORM 1.0 beta - schema and DB access in `packages/db/`

**Testing:**
- Vitest 4.0.18 - unit/integration tests across apps and packages (`apps/*/vitest.config.ts`, `packages/api/vitest.config.ts`)
- Playwright 1.58 - browser and deployment-gate e2e tests in `apps/web/` and `packages/e2e-web/`
- PGlite + pg-mem - database-oriented test helpers in `packages/db/package.json`

**Build/Dev:**
- Turborepo 2.8 - workspace task graph in `turbo.json`
- Vite 7.1 + Rolldown-Vite 7.3 - web bundling in `apps/web/package.json`
- tsdown 0.21 - server-side app builds in `apps/server/`, `apps/assistant/`, and `apps/notifications/`
- Biome 2.4.6 + Ultracite - formatting/linting at repo level (`package.json`, `biome.json`)
- Pulumi 3.170 - infra as code in `infra/pulumi/`

## Key Dependencies

**Critical:**
- `@my-app/api-contract` - shared contract boundary; clients import types without server/runtime deps (`packages/api-contract/`, `docs/architecture-constitution.md`)
- `@my-app/api` - main business/router implementation for the server app (`packages/api/`)
- `@my-app/auth` - Better Auth factory and org RBAC boundary (`packages/auth/`)
- `@my-app/db` - Drizzle schema, migrations, seed, and connection boundary (`packages/db/`)
- `@my-app/assistant` - AI router, tool orchestration, and chat persistence boundary (`packages/assistant/`)
- `@my-app/notifications` - notification contracts, preferences, and delivery processor (`packages/notifications/`)
- `@my-app/queue` / `pg-boss` - background queue abstraction used across API and workers (`packages/queue/`)
- `@my-app/env` - typed env schemas for server, assistant, and web runtimes (`packages/env/src/server.ts`, `packages/env/src/assistant.ts`, `packages/env/src/web.ts`)

**Infrastructure:**
- `@pulumi/cloudflare`, `@pulumi/command`, `@pulumi/tls` - DNS/VPS bootstrap automation in `infra/pulumi/package.json`
- `@openrouter/ai-sdk-provider` + `ai` - assistant LLM provider/runtime in `packages/assistant/`
- `pg` - PostgreSQL client in `packages/db/package.json`

## Package Boundaries

**Apps stay thin:**
- `apps/server/` wires auth, payment webhooks, health, and oRPC transport (`apps/server/src/app.ts`)
- `apps/assistant/` hosts the assistant RPC transport and forwards tool calls to the main API (`apps/assistant/src/rpc/handlers.ts`)
- `apps/notifications/` is the worker/process host for queued notification work (`apps/notifications/package.json`)
- `apps/web/` is the SvelteKit client consuming `@my-app/api-contract`, `@my-app/assistant`, `@my-app/ui`, and `@my-app/ai-chat`

**Domain + infra packages own logic:**
- `packages/api-contract/` = contracts only
- `packages/api/` = main API implementation
- `packages/auth/` = auth/org access
- `packages/db/` = schema + persistence
- `packages/assistant/` = AI domain
- `packages/notifications/` = notification domain
- `packages/queue/` = job transport
- `packages/env/` = runtime config
- `packages/ui/` and `packages/ai-chat/` = shared Svelte UI

**Starter vs migrated state:**
- Current repo is already operational for transport, auth, DB schema, notifications, AI assistant, Dokku deploy, and CloudPayments webhook plumbing (`README.md`, `apps/server/src/app.ts`, `packages/notifications/src/processor.ts`)
- Marketplace domain extraction is still partial: the schema is ahead of some runtime packages. `packages/db/src/schema/marketplace.ts` and `packages/db/src/schema/availability.ts` already model payments/calendar/booking domains, while `docs/ADR/001_legacy-extraction.md` says richer `packages/calendar`, `packages/payments`, and broader domain services still come from `legacy/full-stack-cf-app/` and legacy Cloudflare-era sources

## Configuration

**Environment:**
- Typed env validation lives in `packages/env/src/server.ts`, `packages/env/src/assistant.ts`, and `packages/env/src/web.ts`
- Task-level env passthrough is declared in `turbo.json`
- Local runtime expects a repo/root `.env` for scripts and `docker-compose.yml`; production secrets are injected by Dokku / GitHub Actions / Pulumi

**Build:**
- Monorepo orchestration: `turbo.json`
- TypeScript base config: `tsconfig.json`, `packages/config/tsconfig.base.json`
- Container builds: `Dockerfile`, `Dockerfile.web`, `docker-compose.yml`
- Infra provisioning: `infra/pulumi/`

## Platform Requirements

**Development:**
- Bun, Node.js 22+, Docker Compose, and a local PostgreSQL container (`README.md`, `docker-compose.yml`)
- Frontend + API dev loop runs via root scripts in `package.json`

**Production:**
- Docker images deployed to Dokku on a VPS, with GHCR as image registry and Pulumi-managed infrastructure (`README.md`, `.github/workflows/deploy-docker.yml`, `infra/pulumi/`)
- Observability stack (Loki/Grafana) ships alongside containers in `docker-compose.yml`

---

*Stack analysis: 2026-03-09*
