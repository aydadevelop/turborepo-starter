---
applyTo: "**/*.{ts,tsx,js,jsx,svelte,mjs,cjs,sh,yml,yaml,dockerfile,Dockerfile}"
---

# Full-Stack VPS App Instructions

This monorepo is a full-stack starter deployed to a VPS via Docker Compose:

- SvelteKit (Svelte 5) + shadcn-svelte
- Hono + oRPC contract-first APIs
- Better Auth
- Drizzle + PostgreSQL (pgvector)
- Docker Compose + Traefik (SSL) + Loki + Grafana + smtp4dev
- Turborepo + Bun
- Vitest (unit) + Playwright (e2e)
- GitHub Actions CI/CD → GHCR → SSH deploy to VPS

## Working Model

- Keep task scripts in workspace `package.json` files.
- Root scripts only delegate (`turbo run <task>`).
- Register task behavior in `turbo.json`; do not hide task logic in root scripts.
- Keep one package manager per branch/repo.
  - This repo runs Bun.
  - Do not reintroduce npm lockfiles or npm-only scripts.

## Architecture Boundaries

- `apps/web`: UI composition and client integration.
- `apps/server`: Hono transport adapters and API entrypoint.
- `apps/assistant`: AI assistant Hono service.
- `apps/notifications`: Queue consumer and email dispatch service.
- `packages/api`: oRPC contracts, routers, and domain services.
- `packages/api-contract`: Shared oRPC contract types consumed by client and server.
- `packages/db`: Drizzle schema, migrations, and DB scripts (PostgreSQL).
- `packages/infra`: Docker/VPS infrastructure scripts and Grafana provisioning.
- `packages/ui`: shared shadcn-svelte components.

## Docker + Infra

- `docker-compose.yml` is the base config for both local dev and VPS.
- `docker-compose.prod.yml` is the production overlay: activates Traefik SSL (Let's Encrypt), removes raw port exposure, adds Traefik labels.
- Use `turbo prune --docker` to generate the minimal dependency graph for each Docker image; never maintain manual `COPY` lists of packages.
- All app services run as non-root user (`uid 1001`).
- Healthchecks are required on all app services; `--wait` blocks deploys until healthy.
- smtp4dev captures all outgoing email in dev/staging — never configure it to relay externally.
- In production, override `SMTP_HOST`/`SMTP_USER`/`SMTP_PASS` in `.env` to use a real relay.

## Svelte + shadcn-svelte

- Use Svelte 5 runes (`$state`, `$derived`, `$props`).
- Prefer modern DOM handlers (`onclick`) over legacy syntax.
- Use shadcn-svelte import patterns consistently.
- Keep shared design system pieces in `packages/ui`.

## Hono + oRPC

- Keep endpoint transport thin in server files.
- Put validation and business logic in package-level routers/services.
- Use Zod schemas for request/response boundaries.
- Favor contract-first usage from client and server; avoid ad-hoc fetch for core RPC flows.
- Every Hono app must expose `GET /health` returning `{ ok: true }` — required by Docker healthchecks.

## Queues

- Define queue message schemas in shared package contracts.
- Validate message payloads with `safeParse` before processing.
- Use explicit retry limits and DLQ strategy.
- Acknowledge/retry deterministically; do not leave ambiguous outcomes.

## Testing

- Use shared Vitest config from `packages/vitest-config`.
- Co-locate unit tests with package code.
- Keep e2e tests isolated in `packages/e2e-web`.
- Do not merge code with `.only` or `.skip` test controls enabled.

## Security and Reliability

- Never commit secrets or local credential files (`.env`, `acme.json`).
- Validate env inputs with typed schemas (`packages/env`).
- Prefer explicit error handling with structured logs over silent failures.
- All infra changes are in code (`docker-compose*.yml`, `infra/scripts/`); avoid manual server edits.
- VPS firewall: only ports 22, 80, 443 open externally; Grafana, Loki, Traefik dashboard are internal-only.
- Docker socket is mounted read-only (`/var/run/docker.sock:ro`) on Traefik.
- Do not add `--no-verify` to git commands or bypass CI checks.

