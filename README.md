# my-app

Full-stack monorepo starter — Hono APIs, SvelteKit frontend, PostgreSQL, deployed to a VPS via Dokku.

## Stack

- **Frontend**: SvelteKit (Svelte 5) + shadcn-svelte
- **API server**: Hono + oRPC (contract-first)
- **Assistant service**: Hono + tool-capable AI assistant
- **Notifications**: Hono queue consumer
- **Auth**: Better Auth
- **Database**: Drizzle + PostgreSQL (pgvector)
- **Build system**: Turborepo + Bun
- **Tests**: Vitest (unit) + Playwright (e2e)
- **Infra**: Dokku (PaaS on VPS) + Loki + Grafana
- **CI/CD**: GitHub Actions → GHCR → Dokku deploy to VPS

## Monorepo Layout

```text
apps/
  web/             # SvelteKit frontend
  server/          # Main Hono/oRPC API
  assistant/       # AI assistant service
  notifications/   # Queue consumer / email service
packages/
  api/             # oRPC contracts + routers + services
  api-contract/    # Shared oRPC contract types
  assistant/       # Assistant contract, tools, transport
  auth/            # Better Auth setup
  db/              # Drizzle schema + migrations + seed scripts
  env/             # Typed env validation
  infra/           # Docker/VPS infrastructure scripts
  notifications/   # Queue contracts + processor helpers
  proxy/           # Optional local tunnel reverse-proxy
  ui/              # Shared Svelte UI components
  vitest-config/   # Shared Vitest config
```

## Prerequisites

- Bun 1.2+
- Node.js 22+
- Docker + Compose plugin (local dev and VPS)

## Install

```bash
bun install
```

## Local Development

```bash
# Start all services (Hono servers + SvelteKit)
bun run dev

# Frontend only
bun run dev:web

# Backend services only (server + assistant + notifications)
bun run dev:server
```

Local services use the `.env` file at the repo root. Copy `.env.example` (or the bootstrap template) and fill in values.

### Docker dev stack

```bash
# Start everything in containers including Postgres, Loki, Grafana, smtp4dev
bun run deploy:docker:local

# First local boot with demo data
SEED_DEMO_DATA=true bun run deploy:docker:local

# Grafana: http://localhost:3110
# smtp4dev (captured emails): http://localhost:5025
```

When `SEED_DEMO_DATA=true`, the `server` container runs migrations and then bootstraps the demo dataset only if the seed namespace is not already present. The first boot can come up ready-to-use; normal restarts do not reseed or wipe data.

## Quality Gates

```bash
bun run lint
bun run check-types
bun run test
bun run build
bun run test:e2e   # deployment-gate stories (packages/e2e-web, host-managed services)
bun run test:e2e:docker  # deployment-like gate (Docker Compose stack + Playwright)
bun run ci:preflight     # one-shot local mirror of CI gates
```

### Local GHA parity (optional)

```bash
# Validate workflow schema + expression wiring locally
act -W .github/workflows/ci.yml --validate
act -W .github/workflows/deploy-docker.yml --validate

# Dry-run deploy workflow graph (no real SSH/deploy)
act -W .github/workflows/deploy-docker.yml -n workflow_dispatch --input environment=staging

# Run real deploy job locally through the same workflow definition
# (uses your local secret/var files and real SSH target from those values)
act -W .github/workflows/deploy-docker.yml workflow_dispatch \
  -j deploy \
  --input environment=staging \
  --secret-file .env.staging.secrets \
  --var-file .env.staging.vars
```

### E2E Suite Roles

- `packages/e2e-web` is the deployment-gate suite used by CI. It runs hardened cross-service user stories against near-production backend startup (`start:test`, no file watch/HMR).
- `apps/web` uses Vitest Browser Mode for fast local browser interaction tests while building features.
- `apps/web` Playwright remains only for heavyweight local checks such as performance guardrails.
- `bun run test:e2e:docker` starts `db/server/assistant/notifications/web` via Docker Compose (same Dockerfiles as deploy), runs the same `packages/e2e-web` stories, and tears everything down.
- Local `bun run test:e2e` defaults to a dedicated `myapp_e2e` database. Override with `PLAYWRIGHT_ALLOW_SHARED_DB=1` only if you intentionally want to reuse the shared dev DB.

```bash
# Fast browser checks while iterating on frontend flows
cd apps/web
bun run test:e2e:dev
```

## Database

```bash
bun run db:generate   # generate Drizzle migrations
bun run db:migrate    # run migrations
bun run db:push       # push schema without migration files (dev only)
bun run db:seed       # seed with test data
bun run db:studio     # open Drizzle Studio
```

## Deploy

### Infrastructure provisioning (Pulumi)

VPS bootstrap, Dokku app creation, DNS, and secrets are managed as TypeScript IaC in `infra/pulumi/`:

```bash
bun run infra:preview   # dry-run — see what would change
bun run infra:up        # apply changes to VPS
```

Pulumi handles: VPS creation (1gb.ru), Docker + Dokku install, UFW firewall, fail2ban, SSH hardening,
sslh (SSH+HTTPS on port 443), Postgres, Let's Encrypt SSL, Cloudflare DNS, and GitHub Actions secrets sync.

### Ongoing deploys

Push to `main` — GitHub Actions builds Docker images, pushes to GHCR, and deploys to Dokku automatically.

Manual deploy from VPS (if needed):

```bash
sudo dokku git:from-image <app> ghcr.io/<org>/<repo>/<app>:<tag>
```

### Rollback runbook (Dokku)

If a release is unhealthy after deploy, rollback immediately:

```bash
sudo dokku ps:rollback <app>
```

Validate rollback:

- `https://<app-domain>/health` returns `200`.
- `sudo dokku ps:report <app> --deployed` shows the expected prior release.
- Critical path smoke checks pass (auth, API, chat flow).

For multi-app incidents, rollback affected apps one-by-one in dependency order (`server` first, then `assistant` / `notifications` / `web`) and re-check health after each rollback.

### Staging DB backup / restore (early-stage baseline)

This repository is currently in early stage. Keep a simple staging baseline:

- Take regular logical backups before risky schema changes.
- Keep recent dumps locally or in a secure private location.
- Practice restore on staging after major migration changes.

Create a backup dump:

```bash
sudo dokku postgres:export myapp-db > myapp-db-$(date +%Y%m%d-%H%M%S).sql
```

Restore from dump:

```bash
sudo dokku postgres:import myapp-db < myapp-db-YYYYMMDD-HHMMSS.sql
```

After restore:

- Run app health checks (`/health`) for all services.
- Run a quick smoke flow (create chat, send message, verify API writes).
- Re-run migrations only if restore source requires it.

> Note: automation helper scripts for backup/restore are intentionally postponed for now.

### Required GitHub secrets

Managed automatically by `pulumi up` (synced via `gh secret set`).

| Secret | Description |
|---|---|
| `SSH_HOST` | VPS IP address |
| `SSH_USER` | SSH user (usually `root`) |
| `SSH_PORT` | SSH port (443 via sslh) |
| `SSH_PRIVATE_KEY` | ED25519 private key for SSH auth |
| `SSH_PRIVATE_KEY_B64` | Base64-encoded private key |
| `SSH_HOST_KEY` | VPS host key for known_hosts |

## Observability

- **Logs**: All Dokku app stdout/stderr ships to Loki via the Docker log driver. View in Grafana (`grafana.${DOMAIN}`).
- **Grafana**: Access via SSH tunnel in production: `ssh -L 3110:localhost:3110 root@vps`
- **Email (dev)**: smtp4dev captures all outgoing mail at `http://localhost:5025`. In prod, set `SMTP_HOST`/`SMTP_USER`/`SMTP_PASS` via `dokku config:set`.
