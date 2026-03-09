---
applyTo: "**/*.{ts,tsx,js,jsx,svelte,mjs,cjs,sh,yml,yaml,dockerfile,Dockerfile}"
---

# Full-Stack VPS App Instructions

This monorepo is a full-stack starter deployed to a VPS via Dokku:

- SvelteKit (Svelte 5) + shadcn-svelte
- Hono + oRPC contract-first APIs
- Better Auth
- Drizzle + PostgreSQL (pgvector)
- Dokku (Docker PaaS, zero-downtime deploys, SSL, rollback)
- Pulumi (TypeScript IaC — VPS bootstrap, DNS, Dokku config)
- Docker Compose (local dev + E2E only) + Loki + Grafana + smtp4dev
- Turborepo + Bun
- Vitest (unit) + Playwright (e2e)
- GitHub Actions CI/CD → GHCR → Dokku deploy to VPS

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

- **Production/staging**: deployed via Dokku on the VPS. Pulumi (`infra/pulumi/`) bootstraps the VPS and configures Dokku apps. CI deploys images via `dokku git:from-image`.
- **Local dev**: `docker-compose.yml` (Dokku is not used locally).
- `Dockerfile` / `Dockerfile.web`: per-app lean images using `turbo prune --docker`.
- All app services must run as a non-root user. Current Bun runtime images use `uid 1000`; exact numeric UID may vary by base image.
- Dokku handles SSL (Let's Encrypt), reverse proxy (nginx), env vars, and zero-downtime deploys.
- Secrets are set on the VPS via `dokku config:set` (managed by Pulumi). Never committed to git.
- smtp4dev captures all outgoing email in dev/staging — never configure it to relay externally.
- In production, override `SMTP_HOST`/`SMTP_USER`/`SMTP_PASS` via `dokku config:set`.
- Infrastructure changes are TypeScript code in `infra/pulumi/`. Run `pulumi up` to apply.

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
- All infra changes are in code (`infra/pulumi/`, `docker-compose.yml`); avoid manual server edits.
- VPS firewall: only ports 22, 80, 443 open externally; Grafana, Loki are internal-only.
- Deploy via `dokku git:from-image` (CI) or `dokku ps:rollback` (manual). Use `pulumi up` for infra changes.
- Do not add `--no-verify` to git commands or bypass CI checks.


# After task completiong steps
- run subagent `reviewer-agent` with the following prompt:
```Review the changes you just made. Check for any mistakes, security issues, or areas of improvement```