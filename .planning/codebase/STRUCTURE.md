# Codebase Structure

**Analysis Date:** 2026-03-09

## Directory Layout

```text
turborepo-alchemy/
├── apps/                  # Deployable runtimes: web, main API, assistant, notifications
├── packages/              # Shared contracts, libraries, infra adapters, schema, and current domain code
├── docs/                  # ADRs, constitutions, schema analysis, and migration guidance
├── legacy/                # Vendored predecessor monorepo and raw legacy references
├── infra/                 # Pulumi IaC, Grafana provisioning, VPS/Dokku ops assets
├── scripts/               # Repo automation for DB, e2e, deploy helpers, measurement tools
├── .planning/codebase/    # GSD-generated codebase maps
├── apps/web/build/        # Generated frontend build output
├── output/                # Test and Playwright artifacts
├── docker-compose*.yml    # Local and CI stack definitions
├── Dockerfile*            # Container build definitions
├── package.json           # Root workspace scripts and dependency orchestration
└── turbo.json             # Turborepo task graph and env passthrough
```

## Directory Purposes

**apps/:**
- Purpose: Own deployable runtime entrypoints and process-specific composition.
- Contains: Hono servers, SvelteKit app, health routes, queue worker startup, RPC mounting.
- Key files: `apps/server/src/index.ts`, `apps/server/src/app.ts`, `apps/assistant/src/app.ts`, `apps/notifications/src/index.ts`, `apps/web/src/lib/orpc.ts`.

**packages/:**
- Purpose: Hold reusable contracts, libraries, and the active code that apps compose.
- Contains: `api`, `api-contract`, `assistant`, `auth`, `db`, `notifications`, `queue`, `env`, `ui`, `ai-chat`, test/config packages.
- Key files: `packages/api/src/index.ts`, `packages/api/src/handlers/index.ts`, `packages/api-contract/src/routers/index.ts`, `packages/assistant/src/router.ts`, `packages/db/src/schema/marketplace.ts`, `packages/auth/src/index.ts`.

**docs/:**
- Purpose: Record repository intent, migration mapping, and architecture guidance.
- Contains: ADRs, schema analysis, CloudPayments notes, developer docs.
- Key files: `docs/ADR/000_travel-commerce-marketplace.md`, `docs/ADR/001_legacy-extraction.md`, `docs/ADR/002_architecture-patterns.md`, `docs/architecture-constitution.md`, `docs/drizzle-schema-plan.md`.

**legacy/:**
- Purpose: Preserve brownfield reference code and prior monorepo patterns for extraction work.
- Contains: `legacy/full-stack-cf-app/` and, nested inside it, `legacy/full-stack-cf-app/legacy/cf-boat-api/`.
- Key files: `legacy/full-stack-cf-app/README.md`, `legacy/full-stack-cf-app/packages/api/src/routers/booking/`, `legacy/full-stack-cf-app/packages/api/src/calendar/`, `legacy/full-stack-cf-app/docs/legacy-migration-audit.md`.

**infra/:**
- Purpose: Provision and operate the production/staging environment.
- Contains: Pulumi programs, Grafana provisioning, bootstrap scripts, example env files.
- Key files: `infra/pulumi/src/index.ts`, `infra/pulumi/src/dokku-apps.ts`, `infra/pulumi/src/vps-bootstrap.ts`, `infra/grafana/provisioning/`.

**scripts/:**
- Purpose: Run repository-level operational tasks outside a single package.
- Contains: DB bootstrap, e2e orchestration, deployment planning, secret sync helpers.
- Key files: `scripts/ensure-db.mjs`, `scripts/e2e-docker-compose.mjs`, `scripts/plan-deploy.ts`, `scripts/sync-secrets.sh`.

## Key File Locations

**Entry Points:**
- `apps/server/src/index.ts`: main API server process and recurring-task worker startup.
- `apps/server/src/app.ts`: main Hono composition for auth, webhooks, health, and RPC.
- `apps/assistant/src/index.ts`: assistant process bootstrap.
- `apps/assistant/src/app.ts`: assistant Hono composition and RPC mounting.
- `apps/notifications/src/index.ts`: notifications process bootstrap and queue worker startup.
- `apps/web/src/app.html`: SvelteKit HTML shell.
- `infra/pulumi/src/index.ts`: infrastructure root program.

**Configuration:**
- `package.json`: root scripts and workspace declaration.
- `turbo.json`: shared task graph and environment passthrough.
- `biome.json`: formatting and lint configuration.
- `tsconfig.json`: root TypeScript project settings.
- `apps/*/package.json`: per-app scripts and runtime dependencies.
- `packages/*/package.json`: per-package exports and dependency boundaries.

**Core Logic:**
- `packages/api/src/handlers/`: main API router handlers.
- `packages/api/src/payments/webhooks/`: payment provider webhook adapters and registry.
- `packages/assistant/src/`: assistant contract, router, tools, and transport helpers.
- `packages/notifications/src/`: notification contracts, pusher, processor, preference logic.
- `packages/auth/src/`: Better Auth setup and org access control.
- `packages/db/src/schema/`: canonical data model.

**Testing:**
- `apps/server/src/__tests__/`: app-layer tests for server behavior.
- `packages/api/src/__tests__/`: handler and application tests.
- `packages/db/src/__tests__/` and `packages/db/src/test/`: schema and DB test helpers.
- `apps/web/e2e/`: dev-focused browser flow tests.
- `packages/e2e-web/`: deployment-gate end-to-end suite described in `README.md`.

## Naming Conventions

**Files:**
- Lowercase domain or concern names are the default: `packages/api/src/handlers/payments.ts`, `packages/db/src/schema/marketplace.ts`, `apps/server/src/routes/payment-webhook.ts`.
- Router subtrees use `router.ts` or `index.ts` at package boundaries: `packages/api-contract/src/routers/index.ts`, `packages/api/src/handlers/admin/router.ts`.
- Schema files are grouped by domain, not by table count: `packages/db/src/schema/auth.ts`, `packages/db/src/schema/assistant.ts`, `packages/db/src/schema/marketplace.ts`, `packages/db/src/schema/support.ts`.

**Directories:**
- Top-level deployables live under `apps/<runtime>/`.
- Shared libraries live under `packages/<capability>/`.
- Legacy references stay under `legacy/` and do not mix with active runtime packages.
- ADRs are numerically ordered in `docs/ADR/`.

## Code Flow Between Top-Level Areas

**Active runtime flow:**
1. `apps/web/src/` issues typed RPC calls using `apps/web/src/lib/orpc.ts` and `apps/web/src/lib/assistant.ts`.
2. `apps/server/src/` and `apps/assistant/src/` receive those requests and translate them into package calls.
3. `packages/api-contract/src/routers/index.ts` and `packages/assistant/src/contract.ts` define the request/response contract shape.
4. `packages/api/src/` and `packages/assistant/src/` execute application logic.
5. `packages/db/src/` persists state; `packages/notifications/src/` and `packages/queue/src/` handle side effects.
6. `apps/notifications/src/` consumes queue work and completes asynchronous delivery.

**Planning and brownfield flow:**
1. `docs/ADR/*.md` defines the desired package boundaries and migration rules.
2. `legacy/full-stack-cf-app/` provides concrete prior implementations and folder patterns.
3. `legacy/full-stack-cf-app/legacy/cf-boat-api/` provides raw historical backend evidence.
4. Active code is rewritten or relocated into root `apps/` and `packages/`; runtime code does not import from `legacy/`.

## Where to Add New Code

**New frontend feature:**
- Route/page UI: `apps/web/src/routes/`
- Shared client helpers: `apps/web/src/lib/`
- Shared design components: `packages/ui/src/` or `packages/ai-chat/src/` when chat-specific
- Tests: `apps/web/e2e/` for dev flows, `packages/e2e-web/` for deployment-gate flows

**New main API surface:**
- Contract: `packages/api-contract/src/routers/` or its child contract modules
- Handler: `packages/api/src/handlers/`
- Shared auth/context work: `packages/api/src/index.ts` or `packages/api/src/context.ts`
- Persistence: `packages/db/src/schema/` plus `packages/db/src/relations.ts`

**New assistant capability:**
- Assistant contract changes: `packages/assistant/src/contract.ts`
- Assistant request handling: `packages/assistant/src/router.ts`
- Tool definitions: `packages/assistant/src/tools/` and `packages/assistant/src/tools.ts`
- Web client usage: `apps/web/src/lib/assistant.ts`

**New background processing:**
- Queue abstraction or producer changes: `packages/queue/src/`
- Notification processing: `packages/notifications/src/`
- Worker bootstrap: `apps/server/src/queues/` or `apps/notifications/src/queues/`

**New infrastructure behavior:**
- Provisioning logic: `infra/pulumi/src/`
- Local stack or container behavior: root `docker-compose*.yml`, `Dockerfile`, `Dockerfile.web`
- Operational automation: `scripts/`

**New extracted commerce domain (ADR-driven):**
- Current practical home: keep logic in the owning area under `packages/api/src/handlers/` or `packages/api/src/payments/` until the package exists.
- Target home from ADRs: create the dedicated package named in `docs/ADR/001_legacy-extraction.md` and wire it back into `packages/api` as thin transport.

## Brownfield Source Relationship

**`cf-boat-api` knowledge:**
- Raw original backend logic is referenced in `docs/ADR/001_legacy-extraction.md` and physically preserved under `legacy/full-stack-cf-app/legacy/cf-boat-api/`.
- Use it as evidence for business rules, field semantics, and missing verticals.
- Do not treat it as an importable dependency for root runtime code.

**`full-stack-cf-app` patterns:**
- The embedded monorepo under `legacy/full-stack-cf-app/` is the intermediary pattern library.
- Its `packages/api/src/routers/booking/`, `packages/api/src/calendar/`, `packages/api/src/channels/`, and `packages/api/src/payments/` folders show the adapter and route shapes that ADR-001 wants extracted into dedicated packages.
- When the ADRs say “bring as-is,” this directory is the concrete source of truth.

**New starter ownership:**
- The active starter is the repository root: `apps/`, `packages/`, `docs/`, `infra/`, and root config files.
- New production code lands here, follows root package boundaries, and deploys through the Dokku/Pulumi path defined in `infra/pulumi/src/index.ts`.
- `legacy/` and `docs/` inform the rewrite; they are not part of the runtime dependency graph.

## Special Directories

**`docs/ADR/`:**
- Purpose: numbered architecture decisions that define the target state.
- Generated: No.
- Committed: Yes.

**`legacy/full-stack-cf-app/`:**
- Purpose: vendored predecessor monorepo used as extraction/reference material.
- Generated: No.
- Committed: Yes.

**`legacy/full-stack-cf-app/legacy/cf-boat-api/`:**
- Purpose: raw historical Cloudflare Worker backend preserved inside the vendored monorepo.
- Generated: No.
- Committed: Yes.

**`infra/pulumi/`:**
- Purpose: typed infrastructure program for VPS, Dokku, DNS, and CI secret sync.
- Generated: No.
- Committed: Yes.

**`apps/web/build/` and `output/`:**
- Purpose: generated build and test artifacts.
- Generated: Yes.
- Committed: repository state includes them now, but treat them as outputs rather than authoring targets.

**`.planning/codebase/`:**
- Purpose: GSD-generated mapping documents for planning and execution agents.
- Generated: Yes.
- Committed: Yes when the planning workflow wants the docs tracked.

---

*Structure analysis: 2026-03-09*
