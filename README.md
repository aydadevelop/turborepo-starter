# full-stack-cf-app

Cloudflare-first full-stack monorepo built with Better-T-Stack.

## Stack

- Frontend: SvelteKit (`apps/web`)
- API server: Hono + oRPC on Workers (`apps/server`)
- Auth: Better Auth (`packages/auth`)
- Database: Drizzle + D1/SQLite (`packages/db`)
- Infra: Alchemy + Cloudflare (`packages/infra`)
- Build system: Turborepo

## Monorepo Layout

```text
full-stack-cf-app/
├── apps/
│   ├── web/
│   └── server/
├── packages/
│   ├── api/
│   ├── auth/
│   ├── config/
│   ├── db/
│   ├── env/
│   ├── infra/
│   ├── tailwind-config/
│   ├── ui/
│   └── vitest-config/
├── turbo.json
└── package.json
```

## Prerequisites

- Node.js 20+
- npm 11+
- Cloudflare account + API token (for deploy)

## Setup

```bash
npm install
```

Create environment files as needed:

- `apps/server/.env` (app runtime values)
- `apps/web/.env` (public frontend values)
- `packages/infra/.env` (deploy/dev infra secrets)

## Stage Model

- `dev`: default local development stage
- `test`: shared remote test stage (optional, for integration/regression)
- `prod`: production stage (CI deploy on `main`)
- `pr-<number>`: preview stage per pull request (created/updated/destroyed by CI)

## Common Commands

- `npm run dev`: Start infra dev runtime and DB Studio
- `npm run dev:web`: Run SvelteKit dev server
- `npm run dev:server`: Run infra-managed server/web dev runtime (`packages/infra`)
- `npm run build`: Build all workspace packages with Turbo
- `npm run lint`: Run workspace Biome checks through Turbo
- `npm run lint:fix`: Apply workspace Biome fixes through Turbo
- `npm run check`: Run `lint` and `check-types` together
- `npm run check-types`: Type-check tasks registered in workspace packages
- `npm run test`: Run unit tests in packages that define `test`
- `npm run test:e2e`: Run Playwright tests (web package)
- `npm run dev:server:e2e`: Start infra runtime for E2E (server/assistant/notifications only)
- `npm run -w web test:e2e:reuse`: Run Playwright against already-running local servers (skip managed startup)
- `npm run test:integration:calendar`: Run live Google Calendar integration test suite (network)
- `npm run db:push`: Push Drizzle schema
- `npm run db:migrate`: Run Drizzle migrations
- `npm run db:generate`: Generate migrations
- `npm run db:seed`: Seed deterministic local scenario data (org, users, boats, pricing, bookings, support)
- `npm run db:seed -- --scenario booking-pressure`: Add booking lifecycle pressure cases
- `npm run db:seed -- --scenario support-escalation`: Add support escalation and callback failure cases
- `npm run db:seed -- --scenario full`: Seed full combined scenario set
- `npm run db:studio`: Open Drizzle Studio
- `npm run db:backup:remote -- --stage <stage>`: Export remote D1 for a stage
- `npm run db:copy:remote -- --from-stage <source> --to-stage <target> --yes`: Copy remote D1 between stages safely
- `npm run deploy`: Deploy Cloudflare resources through `packages/infra`
- `npm run deploy:dev | deploy:test | deploy:prod`: Deploy fixed stages quickly
- `npm run destroy`: Destroy Cloudflare resources through `packages/infra`
- `npm run destroy:dev | destroy:test | destroy:prod`: Destroy fixed stages quickly

For stage-specific operations, pass args through Turbo:

- `npm run deploy -- --stage prod`
- `npm run destroy -- --stage pr-123`

## Development Workflow (TDD + Regression + Manual)

1. Start local runtime.
- `npm run dev`

2. Seed local data when needed.
- `npm run db:seed` (baseline curated fixtures)
- `npm run db:seed -- --scenario booking-pressure` (booking overlap, cancellations, disputes, refunds)
- `npm run db:seed -- --scenario support-escalation` (escalated/closed ticket and webhook edge cases)
- `npm run db:seed -- --scenario full` (all deterministic scenarios combined)

3. Write failing tests first.
- Unit/integration by package: `npx turbo run test --filter=@full-stack-cf-app/db`
- Web end-to-end: `npm run test:e2e`

4. Implement until tests pass, then run fast quality gates.
- `npm run check`
- `npm run test`

5. Run full regression before pushing.
- `npm run build`
- `npm run test:e2e`

6. Do manual verification of critical flows.
- App URL: `http://localhost:5173`
- API URL: `http://localhost:3000`
- Verify auth, core CRUD/API paths, and any changed UI behavior.

## Live Google Calendar Integration Tests

Network tests are opt-in and disabled during normal `npm run test` runs.

Required env for live test:

- `RUN_NETWORK_TESTS=1`
- `GOOGLE_CALENDAR_CREDENTIALS_PATH` (defaults to `apps/server/.secrets/google-calendar.credentials.json`)
- For webhook watch tests:
  - `RUN_WEBHOOK_NETWORK_TESTS=1`
  - `GOOGLE_CALENDAR_TEST_WEBHOOK_URL` (public HTTPS endpoint)
  - `GOOGLE_CALENDAR_WEBHOOK_TEST_TOKEN` (optional, sent in `X-Goog-Channel-Token`)
- Optional overrides:
  - `GOOGLE_CALENDAR_TEST_FULL_ACCESS_ID`
  - `GOOGLE_CALENDAR_TEST_READ_ONLY_ID`
  - `GOOGLE_CALENDAR_TEST_NO_ACCESS_ID`

Run:

- `npm run test:integration:calendar`
- `npm run test:integration:calendar:webhook` (requires public webhook URL)
- `npm run test:integration:calendar:webhook:tunnel` (starts `cloudflared` quick tunnel and runs webhook test)

Runtime adapter config (server):

- Set `GOOGLE_CALENDAR_CREDENTIALS_JSON` in worker/server env secrets to enable Google adapter in booking sync flow.

Webhook + polling sync runtime:

- Webhook endpoint: `POST /webhooks/calendar/google`
- Optional webhook token validation: set `GOOGLE_CALENDAR_WEBHOOK_SHARED_TOKEN`
- Polling endpoint: `POST /internal/calendar/sync/google` with `Authorization: Bearer <CALENDAR_SYNC_TASK_TOKEN>`
- Watch start endpoint: `POST /internal/calendar/watch/google/start` (registers channel + saves IDs)
- Watch stop endpoint: `POST /internal/calendar/watch/google/stop` (stops channel + clears IDs)
- Polling endpoint is disabled unless `CALENDAR_SYNC_TASK_TOKEN` is configured.

Quick local webhook E2E flow:

1. Set Google credentials + webhook token in `apps/server/.env`:
- `GOOGLE_CALENDAR_CREDENTIALS_JSON=...`
- `GOOGLE_CALENDAR_WEBHOOK_SHARED_TOKEN=...`

2. Run tunnel-assisted webhook integration test:
- `npm run test:integration:calendar:webhook:tunnel`
  - Requires `cloudflared` in PATH (macOS: `brew install cloudflared`)

3. Optional manual polling sync call:
- `curl -X POST http://localhost:3000/internal/calendar/sync/google -H \"Authorization: Bearer $CALENDAR_SYNC_TASK_TOKEN\"`

4. Register and stop watch channels for a connection (optional):
- `curl -X POST http://localhost:3000/internal/calendar/watch/google/start -H \"Authorization: Bearer $CALENDAR_SYNC_TASK_TOKEN\" -H \"Content-Type: application/json\" -d '{\"connectionId\":\"<boat_calendar_connection_id>\",\"webhookUrl\":\"https://<your-tunnel>.trycloudflare.com/webhooks/calendar/google\"}'`
- `curl -X POST http://localhost:3000/internal/calendar/watch/google/stop -H \"Authorization: Bearer $CALENDAR_SYNC_TASK_TOKEN\" -H \"Content-Type: application/json\" -d '{\"connectionId\":\"<boat_calendar_connection_id>\"}'`

## Deploy Workflow

Production deploy (most important):

- Automatic: push to `main` triggers CI deploy to `prod`.
- Manual fallback: `npm run deploy:prod`
- Under the hood this is: `npm run deploy -- --stage prod`

Local/manual stage deploy:

- `npm run deploy:dev`
- `npm run deploy:test`
- `npm run deploy:prod`

Preview stages (manual, if needed):

- `npm run deploy -- --stage pr-123`
- `npm run destroy -- --stage pr-123`

CI deploy behavior (matches `.github/workflows/ci.yml`):

- Push to `main` -> deploy `prod`
- PR opened/synchronized/reopened -> deploy `pr-<number>`
- PR closed -> destroy `pr-<number>`

## Safe Remote Database Workflow

All helper commands use Wrangler remote D1 operations (`--remote`) via the `server` workspace.

1. Backup production before any data movement.
- `npm run db:backup:remote -- --stage prod`

2. Copy production data into test safely.
- `npm run db:copy:remote -- --from-stage prod --to-stage test --yes`

Safety behavior:

- `db:copy:remote` requires `--yes`.
- `db:copy:remote` exports source and creates a pre-copy backup of the target before restore.
- Backup files are written to `backups/d1/` by default.

## Legacy Migration

- Legacy audit and migration plan: `/Users/d/Documents/Projects/full-stack-cf-app/docs/legacy-migration-audit.md`
- Scope covered: `legacy/cf-boat-api` and `legacy/boat-app-main`
- Priority: Better Auth migration first, then domain extraction, then calendar webhook migration.

## Audit Snapshot (2026-02-05)

Commands run from repo root:

- `npm run build`: Passes.
- `npm run lint`: Passes.
- `npm run check`: Passes.
- `npm run check-types`: Passes.
- `npm run test`: Passes (20 tests across `packages/db`, `packages/auth`, `packages/api`).
- `npm run test:e2e`: Passes (Playwright with local web server bootstrap).
- `npm run dev:server`: Runs via `@full-stack-cf-app/infra` filter.

Notable warnings observed during build:

- Server build warns on unresolved `cloudflare:workers` import during bundling.
- Web build reports a client chunk larger than 500 kB.

## Best-Practice Backlog

### P0 (Implement first)

- [x] Harden secret handling and env boundaries: removed root `.env` fallback in infra runtime loading.
- [x] Keep secret files out of git permanently: added CI secret scanning (`gitleaks`) and preserved env ignore patterns.

### P1 (High impact)

- [x] Fix Turbo task graph mismatches: added workspace scripts for `lint`, `check-types`, and `db:migrate`.
- [x] Make `dev:server` real: root command now maps to infra dev runtime.
- [x] Expand typecheck coverage: added `check-types` scripts across workspaces with TS/Svelte sources.
- [x] Use affected-only CI for PRs: build/lint/typecheck/test/e2e use `turbo run ... --affected` on PR events.
- [ ] Finish remote cache setup: the project currently reports `Remote caching disabled`, so complete Turbo remote cache linking for local and CI artifact sharing.

### P2 (Quality/perf)

- [x] Add Playwright E2E to CI: CI installs browsers, runs e2e, and uploads the Playwright report artifact.
- [ ] Reduce large frontend chunk(s): use dynamic imports and/or `build.rollupOptions.output.manualChunks` to split heavy bundles.
- [ ] Add quality gates: introduce coverage thresholds for package tests and enforce them in CI.

## Recommended References

- Turborepo run command (`--affected`): [https://turborepo.dev/docs/reference/run](https://turborepo.dev/docs/reference/run)
- Turborepo CI guidance: [https://turborepo.dev/docs/crafting-your-repository/constructing-ci](https://turborepo.dev/docs/crafting-your-repository/constructing-ci)
- Turborepo env guidance: [https://turborepo.dev/docs/crafting-your-repository/using-environment-variables](https://turborepo.dev/docs/crafting-your-repository/using-environment-variables)
- Turborepo caching guidance: [https://turborepo.dev/docs/crafting-your-repository/caching](https://turborepo.dev/docs/crafting-your-repository/caching)
- Turborepo remote caching: [https://turborepo.dev/docs/core-concepts/remote-caching](https://turborepo.dev/docs/core-concepts/remote-caching)
- Cloudflare Workers secrets: [https://developers.cloudflare.com/workers/configuration/secrets/](https://developers.cloudflare.com/workers/configuration/secrets/)
- Playwright CI docs: [https://playwright.dev/docs/ci](https://playwright.dev/docs/ci)
- Vite build chunking strategy: [https://vite.dev/guide/build#chunking-strategy](https://vite.dev/guide/build#chunking-strategy)
