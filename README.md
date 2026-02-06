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
- `npm run format-and-lint`: Alias of `npm run lint`
- `npm run format-and-lint:fix`: Alias of `npm run lint:fix`
- `npm run check`: Run `lint` and `check-types` together
- `npm run check-types`: Type-check tasks registered in workspace packages
- `npm run test`: Run unit tests in packages that define `test`
- `npm run test:e2e`: Run Playwright tests (web package)
- `npm run db:push`: Push Drizzle schema
- `npm run db:migrate`: Run Drizzle migrations
- `npm run db:generate`: Generate migrations
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

2. Write failing tests first.
- Unit/integration by package: `npx turbo run test --filter=@full-stack-cf-app/db`
- Web end-to-end: `npm run test:e2e`

3. Implement until tests pass, then run fast quality gates.
- `npm run check`
- `npm run test`

4. Run full regression before pushing.
- `npm run build`
- `npm run test:e2e`

5. Do manual verification of critical flows.
- App URL: `http://localhost:5173`
- API URL: `http://localhost:3000`
- Verify auth, core CRUD/API paths, and any changed UI behavior.

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
