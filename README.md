# my-app

Full-stack monorepo starter — Hono APIs, SvelteKit frontend, PostgreSQL, deployed to a VPS via Docker Compose.

## Stack

- **Frontend**: SvelteKit (Svelte 5) + shadcn-svelte
- **API server**: Hono + oRPC (contract-first)
- **Assistant service**: Hono + tool-capable AI assistant
- **Notifications**: Hono queue consumer
- **Auth**: Better Auth
- **Database**: Drizzle + PostgreSQL (pgvector)
- **Build system**: Turborepo + Bun
- **Tests**: Vitest (unit) + Playwright (e2e)
- **Infra**: Docker Compose + Traefik (SSL) + Loki + Grafana
- **CI/CD**: GitHub Actions → GHCR → SSH deploy to VPS

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

# Grafana: http://localhost:3110
# smtp4dev (captured emails): http://localhost:5025
# Traefik dashboard: http://localhost:8080
```

## Quality Gates

```bash
bun run lint
bun run check-types
bun run test
bun run build
bun run test:e2e   # deployment-gate stories (packages/e2e-web)
```

### E2E Suite Roles

- `packages/e2e-web` is the deployment-gate suite used by CI. It runs hardened cross-service user stories against near-production backend startup (`start:test`, no file watch/HMR).
- `apps/web` Playwright is dev-only for local progress checks and fast UI flow validation while building features.

```bash
# Dev-only checks while iterating on frontend flows
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

### First-time VPS setup

```bash
# Run once on a fresh Ubuntu 22.04/24.04 VPS:
DOMAIN=example.com ACME_EMAIL=you@example.com GHCR_TOKEN=ghp_xxx GHCR_USER=your-org \
  sudo bash infra/scripts/bootstrap-vps.sh
```

The script installs Docker, Loki log driver, fail2ban, UFW firewall, and creates the app directory with an `.env` template.

### Ongoing deploys

Push to `main` — GitHub Actions builds images, pushes to GHCR, and SSH-deploys to the VPS automatically.

Or deploy manually from the VPS:

```bash
# Production (SSL via Traefik + Let's Encrypt)
bun run deploy:docker

# Tear down (removes volumes)
bun run destroy:docker
```

### Required GitHub secrets

| Secret | Description |
|---|---|
| `SSH_HOST` | VPS IP or hostname |
| `SSH_USER` | Deploy user (e.g. `deploy`) |
| `SSH_PRIVATE_KEY` | Private key for SSH auth |
| `SSH_PORT` | SSH port (optional, default 22) |
| `DEPLOY_PATH` | App directory on VPS (optional, default `~/app`) |

## Observability

- **Logs**: All container stdout/stderr ships to Loki via the Docker log driver. View in Grafana (`grafana.${DOMAIN}` in prod, `localhost:3110` locally).
- **Traefik dashboard**: `localhost:8080` in dev; in prod access via SSH tunnel: `ssh -L 8080:localhost:8080 user@vps`
- **Email (dev)**: smtp4dev captures all outgoing mail at `http://localhost:5025`. In prod, set `SMTP_HOST`/`SMTP_USER`/`SMTP_PASS` to a real relay (SES, Postmark, etc.).
