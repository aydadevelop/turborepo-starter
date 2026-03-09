# External Integrations

**Analysis Date:** 2026-03-09

## APIs & External Services

**Payments:**
- CloudPayments - current payment webhook/provider integration for the starter repo
  - SDK/Client: custom webhook adapter in `packages/api/src/payments/webhooks/cloudpayments/adapter.ts`; server bootstrap in `apps/server/src/app.ts`; product docs mirrored in `docs/CloudPayments.md`
  - Auth: `CLOUDPAYMENTS_PUBLIC_ID`, `CLOUDPAYMENTS_API_SECRET`, plus `PUBLIC_CLOUDPAYMENTS_PUBLIC_ID` for the web runtime (`packages/env/src/server.ts`, `packages/env/src/web.ts`)
  - State: **partial but live** - webhook auth/parsing/registration exist now; broader dedicated `packages/payments` extraction is still planned in `docs/ADR/001_legacy-extraction.md`
- Polar - placeholder starter env surface only
  - SDK/Client: not detected in current runtime packages; only env hooks exist in `packages/env/src/server.ts`
  - Auth: `POLAR_ACCESS_TOKEN`
  - State: **starter placeholder**, not a primary current integration

**Calendar & availability:**
- Google / Outlook / iCal style calendar providers - modeled in the DB and ADRs, not yet extracted as a standalone runtime package
  - SDK/Client: schema support in `packages/db/src/schema/availability.ts`
  - Auth: no active env contract detected yet for provider credentials in `packages/env/src/*`
  - State: **schema-first / runtime-partial** - `listing_calendar_connection`, `calendar_webhook_event`, and `booking_calendar_link` already exist; `docs/ADR/001_legacy-extraction.md` says mature adapters currently live in legacy sources and should become `packages/calendar`

**Notifications & messaging:**
- Telegram Bot API - outbound notification delivery and Telegram-linked identity
  - SDK/Client: direct HTTP `sendMessage` calls in `packages/notifications/src/processor.ts`; account linking UI in `apps/web/src/routes/(app)/dashboard/settings/+page.svelte`
  - Auth: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_BOT_API_BASE_URL` (`packages/env/src/server.ts`)
  - State: **live for Telegram + in-app; partial elsewhere**
- In-app notifications - first-class current channel
  - SDK/Client: `packages/notifications/src/processor.ts`
  - Auth: session/org context from `packages/auth/`
- Email / SMS / VK / Max - currently mock providers, useful for local/dev pipeline shape
  - SDK/Client: mock implementations in `packages/notifications/src/processor.ts`
  - State: **starter/partial**, not backed by production provider SDKs yet

**Auth & identity:**
- Better Auth - session, organization, anonymous, admin, passkey, phone, and Telegram-linked auth
  - SDK/Client: `packages/auth/`, consumed by `apps/server/`, `apps/assistant/`, and `apps/web/`
  - Auth: `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`
  - State: **live and central**, replaces legacy auth flows

**AI:**
- OpenRouter - LLM provider for the assistant service
  - SDK/Client: `@openrouter/ai-sdk-provider` in `packages/assistant/src/router.ts`; transport/context wiring in `apps/assistant/src/rpc/handlers.ts`
  - Auth: `OPEN_ROUTER_API_KEY`, `AI_MODEL`
  - State: **live**

**Queue / async work:**
- pg-boss - Postgres-backed queue for workers and async delivery
  - SDK/Client: `packages/queue/src/index.ts`, `packages/queue/src/worker.ts`
  - Auth: `DATABASE_URL`
  - State: **live**, replacing older Cloudflare Queue assumptions noted in `docs/architecture-constitution.md`

**Deployment / infra services:**
- Dokku - runtime PaaS on the VPS
  - SDK/Client: deployment workflow in `.github/workflows/deploy-docker.yml`
- GHCR - Docker image registry
  - SDK/Client: `.github/workflows/deploy-docker.yml`
- Cloudflare DNS - infra-managed DNS/provider layer
  - SDK/Client: `infra/pulumi/package.json`
- VPS provisioning - Pulumi-managed bootstrap described in `README.md`
  - State: **live for deployment**, not starter-only

**Observability:**
- Loki - centralized log ingestion from Docker log driver
  - SDK/Client: `docker-compose.yml`
- Grafana - dashboards and alerting
  - SDK/Client: `docker-compose.yml`, `infra/grafana/provisioning/`
  - Auth: Grafana admin/SMTP/Telegram alert env is consumed by Compose, not by app packages directly

**Legacy-source dependencies:**
- `legacy/full-stack-cf-app/` - local snapshot of the richer predecessor monorepo
- `docs/ADR/001_legacy-extraction.md` - maps remaining calendar/payment/messaging/domain extractions from `cf-boat-api` and `full-stack-cf-app`
- `docs/architecture-constitution.md` - documents the current repo as the target while still calling out Cloudflare-era leftovers and pending provider-package cleanup
  - State: **reference dependency, not runtime dependency** - crucial for brownfield planning because several integrations are more complete there than in the starter repo

## Data Storage

**Databases:**
- PostgreSQL (Docker image `pgvector/pgvector:pg18`)
  - Connection: `DATABASE_URL`
  - Client: Drizzle ORM + `pg` in `packages/db/`
- Test DB variants
  - Client: PGlite and `pg-mem` in `packages/db/package.json`

**File Storage:**
- Not detected as a live provider integration
- Asset metadata exists in `packages/db/src/schema/marketplace.ts`, but no current S3/R2/GCS adapter is wired in the repo

**Caching:**
- None detected

## Authentication & Identity

**Auth Provider:**
- Better Auth
  - Implementation: shared auth package in `packages/auth/` with org RBAC, passkeys, Telegram linkage, and app/session consumers in `apps/server/`, `apps/assistant/`, and `apps/web/`

## Monitoring & Observability

**Error Tracking:**
- Dedicated SaaS error tracker not detected
- Errors are handled via Hono logging / console plus container logs (`apps/server/src/app.ts`, `packages/notifications/src/processor.ts`)

**Logs:**
- Docker stdout/stderr shipped to Loki and viewed in Grafana (`docker-compose.yml`)

## CI/CD & Deployment

**Hosting:**
- Dokku on a VPS, with Docker images built from `Dockerfile` / `Dockerfile.web`
- Infra provisioning via Pulumi in `infra/pulumi/`

**CI Pipeline:**
- GitHub Actions builds and pushes images to GHCR, then deploys to Dokku (`.github/workflows/deploy-docker.yml`)
- Self-hosted `vps` runner performs deploy and migration jobs

## Environment Configuration

**Required env vars:**
- Core runtime: `DATABASE_URL`, `SERVER_URL`, `CORS_ORIGIN`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`
- AI: `OPEN_ROUTER_API_KEY`, `AI_MODEL`
- Payments: `CLOUDPAYMENTS_PUBLIC_ID`, `CLOUDPAYMENTS_API_SECRET`, `PUBLIC_CLOUDPAYMENTS_PUBLIC_ID`
- Notifications/Auth bridge: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_BOT_API_BASE_URL`
- Frontend wiring: `PUBLIC_SERVER_URL`, `PUBLIC_ASSISTANT_URL`

**Secrets location:**
- Local: repo/root `.env` consumed by root scripts and `docker-compose.yml`
- CI/CD / production: GitHub secrets + Dokku config + Pulumi-managed secret sync (`README.md`, `.github/workflows/deploy-docker.yml`, `infra/pulumi/`)
- Typed source of truth for variable names: `packages/env/src/server.ts`, `packages/env/src/assistant.ts`, `packages/env/src/web.ts`, `turbo.json`

## Webhooks & Callbacks

**Incoming:**
- CloudPayments payment webhooks at `/api/payments/webhook/cloudpayments/{check|pay|fail|confirm|refund|cancel}` (verified by `apps/server/src/__tests__/payment-webhook.test.ts` and registered via `apps/server/src/app.ts`)
- Calendar webhook persistence is modeled in `packages/db/src/schema/availability.ts`, but a current app-level calendar webhook handler is not yet extracted in this repo

**Outgoing:**
- Telegram Bot API `sendMessage` from `packages/notifications/src/processor.ts`
- Assistant-to-main-API RPC calls from `apps/assistant/src/rpc/handlers.ts` to `${SERVER_URL}/rpc`
- Docker log driver pushes app logs to Loki (`docker-compose.yml`)
- GH Actions pushes container images to GHCR before Dokku deploy (`.github/workflows/deploy-docker.yml`)

---

*Integration audit: 2026-03-09*
