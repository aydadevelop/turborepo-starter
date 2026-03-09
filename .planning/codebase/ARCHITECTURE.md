# Architecture

**Analysis Date:** 2026-03-09

## Pattern Overview

**Overall:** Brownfield contract-first monorepo with four deployable app shells, package-owned shared capabilities, PostgreSQL-first persistence, queue-backed side effects, and an ADR-defined extraction path from legacy commerce systems.

**Key Characteristics:**
- Runtime entrypoints stay thin in `apps/server/src/app.ts`, `apps/assistant/src/app.ts`, and `apps/notifications/src/app.ts`; they mostly compose middleware, routes, and worker bootstrapping.
- The main API uses contract-first oRPC via `packages/api-contract/src/routers/index.ts` and `packages/api/src/handlers/index.ts`.
- The marketplace schema already exists in `packages/db/src/schema/marketplace.ts` even though the matching domain packages (`packages/booking`, `packages/catalog`, `packages/payments`, `packages/calendar`, `packages/disputes`, `packages/messaging`, `packages/events`, `packages/workflows`) are documented target packages rather than present directories.
- Side effects currently flow through a notification-oriented event bus in `packages/api/src/lib/event-bus.ts`, a notification publisher in `packages/notifications/src/pusher.ts`, and pg-boss workers started from `apps/server/src/index.ts` and `apps/notifications/src/index.ts`.
- Brownfield knowledge is split across root ADRs in `docs/ADR/*.md`, the repository constitution in `docs/architecture-constitution.md`, the schema analysis in `docs/drizzle-schema-plan.md`, and the vendored intermediary monorepo in `legacy/full-stack-cf-app/`.

## Current Implemented Layering

**Implemented stack in code:**
- **Web client:** `apps/web/src/` uses typed RPC clients from `apps/web/src/lib/orpc.ts` and `apps/web/src/lib/assistant.ts`.
- **Main server transport:** `apps/server/src/rpc/handlers.ts` builds Hono/oRPC/OpenAPI transport around `packages/api`.
- **Assistant transport:** `apps/assistant/src/app.ts` exposes a dedicated RPC process backed by `packages/assistant/src/router.ts`.
- **Notifications transport + worker:** `apps/notifications/src/index.ts` hosts health endpoints and consumes `NOTIFICATION_QUEUE` jobs via `apps/notifications/src/queues/notification-consumer.ts`.
- **Business logic today:** most request-time logic lives in `packages/api/src/handlers/*`, `packages/api/src/payments/webhooks/*`, `packages/assistant/src/router.ts`, and `packages/notifications/src/processor.ts`.
- **Persistence today:** `packages/db/src/schema/*.ts` and `packages/db/src/relations.ts` define the canonical data model, with `packages/db/src/schema/marketplace.ts` already carrying the target travel-commerce schema.

## Target Layering

**Documented target state:** `docs/ADR/002_architecture-patterns.md` defines the intended repo-native layering as:

`packages/api-contract` → `packages/api` handler → domain package service/workflow → repository/provider

**Target characteristics documented in the repo:**
- `packages/api-contract` remains the contract boundary.
- `packages/api` becomes thin transport and authorization wiring.
- Domain logic moves into extracted packages named in `docs/ADR/001_legacy-extraction.md`: `packages/booking`, `packages/pricing`, `packages/catalog`, `packages/calendar`, `packages/payments`, `packages/disputes`, `packages/messaging`.
- Cross-domain orchestration moves into `packages/workflows`.
- Typed multi-subscriber domain events move into `packages/events`.
- External integrations move behind provider/adapter registries modeled after the patterns already visible in `packages/api/src/payments/webhooks/*` and in `legacy/full-stack-cf-app/packages/api/src/calendar/`, `legacy/full-stack-cf-app/packages/api/src/channels/`, and `legacy/full-stack-cf-app/packages/api/src/payments/`.

## Brownfield Sources

**Repository-native architecture references:**
- `README.md` describes the active starter layout and deploy/runtime model.
- `docs/ADR/000_travel-commerce-marketplace.md` defines the travel-commerce marketplace domain and target subdomains.
- `docs/ADR/001_legacy-extraction.md` maps legacy modules into target packages.
- `docs/ADR/002_architecture-patterns.md` defines the Medusa/Mercur-inspired layering, provider, workflow, and event patterns.
- `docs/architecture-constitution.md` records package composition and oRPC adoption, but parts of it lag code when compared against `packages/assistant/src/contract.ts`.
- `docs/drizzle-schema-plan.md` explains how the marketplace schema fits the product model.

**Vendored brownfield sources:**
- `legacy/full-stack-cf-app/` is the embedded intermediate monorepo. Its `README.md` shows the predecessor starter shape, and its `packages/api/src/routers/` tree shows concrete booking/helpdesk/calendar/channel/payment organization.
- `legacy/full-stack-cf-app/legacy/cf-boat-api/` holds the older Cloudflare Worker backend source referenced by `legacy/full-stack-cf-app/docs/legacy-migration-audit.md`.

**Relationship between legacy sources and the new starter:**
- **`cf-boat-api` knowledge** is the raw original domain source. In this repo it appears as documented extraction targets in `docs/ADR/001_legacy-extraction.md` and as vendored evidence under `legacy/full-stack-cf-app/legacy/cf-boat-api/`.
- **`full-stack-cf-app` patterns** are the already-partially-refactored adapter/router/event patterns. In this repo they are directly inspectable under `legacy/full-stack-cf-app/packages/api/src/`.
- **The new starter** is the active root workspace under `apps/`, `packages/`, and `infra/`. It is the only runtime code that is built and deployed from this repository.

## Layers

**Transport layer:**
- Purpose: Expose HTTP/RPC surfaces, wire middleware, and start queue workers.
- Location: `apps/server/src`, `apps/assistant/src`, `apps/notifications/src`, `apps/web/src`.
- Contains: Hono apps, RPC handlers, health routes, worker bootstrapping, browser RPC clients.
- Depends on: `packages/api`, `packages/assistant`, `packages/queue`, `packages/auth`, `packages/env`.
- Used by: Browser clients, webhooks, workers, operations tooling.

**Contract layer:**
- Purpose: Define typed RPC input/output contracts.
- Location: `packages/api-contract/src/routers/index.ts`, `packages/assistant/src/contract.ts`.
- Contains: `oc.route()` contracts, shared Zod schemas, generated contract client types.
- Depends on: `@orpc/contract`, `zod`.
- Used by: `packages/api`, `packages/assistant`, `apps/web`.

**Application/router layer:**
- Purpose: Apply auth/org middleware and connect contracts to handlers.
- Location: `packages/api/src/index.ts`, `packages/api/src/handlers/index.ts`, `packages/assistant/src/router.ts`.
- Contains: oRPC procedure instances, routers, role guards, request context usage.
- Depends on: `packages/api-contract`, `packages/auth`, `packages/db`, `packages/notifications`, `packages/queue`.
- Used by: `apps/server/src/rpc/handlers.ts`, `apps/assistant/src/rpc/handlers.ts`.

**Current domain/integration layer:**
- Purpose: Hold business rules and adapter logic that have not yet been extracted into dedicated domain packages.
- Location: `packages/api/src/handlers/*`, `packages/api/src/payments/webhooks/*`, `packages/notifications/src/*`, `packages/assistant/src/tools/*`.
- Contains: notification listing/streaming, recurring task scheduling, payment webhook adapters, assistant tools, notification processing.
- Depends on: `packages/db`, `packages/auth`, `packages/queue`, external APIs.
- Used by: the router layer and queue workers.

**Persistence layer:**
- Purpose: Define schema, relations, triggers, and runtime DB connection.
- Location: `packages/db/src/index.ts`, `packages/db/src/schema/*.ts`, `packages/db/src/relations.ts`.
- Contains: auth schema, assistant schema, notifications schema, marketplace schema, support schema, affiliate schema.
- Depends on: PostgreSQL via Drizzle.
- Used by: `packages/api`, `packages/assistant`, `packages/notifications`, `packages/auth`.

**Infrastructure/operations layer:**
- Purpose: Provision and operate the runtime environment.
- Location: `infra/pulumi/src`, `docker-compose*.yml`, `Dockerfile`, `scripts/*`.
- Contains: VPS provisioning, Dokku app setup, DNS management, CI secret sync, local compose helpers.
- Depends on: Pulumi, Dokku, Docker, Cloudflare, GHCR.
- Used by: deploy workflows and operators.

**Reference layer:**
- Purpose: Preserve migration context and canonical brownfield examples without participating in runtime builds.
- Location: `docs/`, `legacy/full-stack-cf-app/`.
- Contains: ADRs, migration audits, old package layouts, prior Cloudflare-era code.
- Depends on: None at runtime.
- Used by: planning and extraction work.

## Data Flow

**Main API RPC request:**
1. `apps/web/src/lib/orpc.ts` sends a browser request to `/rpc`.
2. `apps/server/src/rpc/handlers.ts` creates context via `packages/api/src/context.ts`.
3. `packages/api/src/index.ts` applies `publicProcedure`, `sessionProcedure`, `protectedProcedure`, `organizationProcedure`, or `organizationPermissionProcedure`.
4. `packages/api/src/handlers/*` performs the handler logic.
5. Handlers read/write via `packages/db/src/index.ts` and optionally emit notification events through `packages/api/src/lib/event-bus.ts` or directly via `packages/notifications/src/pusher.ts`.

**Payment webhook ingestion:**
1. `apps/server/src/routes/payment-webhook.ts` accepts `/api/payments/webhook/:provider/:type`.
2. It invokes internal server procedures implemented under `packages/api`.
3. Provider-specific parsing/authentication comes from `packages/api/src/payments/webhooks/*`.
4. Resulting notifications or status effects flow through `packages/notifications/src/pusher.ts` and `packages/api/src/lib/event-bus.ts`.

**Assistant request:**
1. `apps/web/src/lib/assistant.ts` calls the assistant RPC endpoint.
2. `apps/assistant/src/app.ts` forwards to `packages/assistant/src/router.ts`.
3. `packages/assistant/src/router.ts` persists chat state directly with `packages/db/src/schema/assistant.ts` tables.
4. Assistant tools call the main server through `context.serverClient`, which is typed from `packages/api-contract/src/routers/index.ts`.

**Notification delivery:**
1. A handler or bus calls `packages/notifications/src/pusher.ts`.
2. The pusher writes `notification_event` rows through `packages/db` and publishes a `NOTIFICATION_QUEUE` message.
3. `apps/notifications/src/queues/notification-consumer.ts` validates the queue message.
4. `packages/notifications/src/processor.ts` resolves preferences and provider delivery.
5. In-app rows land in `notification_in_app`; external channels are sent by provider implementations in `packages/notifications/src/processor.ts`.

**State Management:**
- Browser server-state caching uses TanStack Query in `apps/web/src/lib/orpc.ts`.
- Assistant chat history is stored in `assistant_chat` and `assistant_message` via `packages/assistant/src/router.ts`.
- Queue-backed state transitions are explicit for notifications and recurring tasks via `@my-app/queue`.

## Domain Boundaries

**Current package boundaries in active runtime code:**
- **Auth boundary:** `packages/auth/src/index.ts` owns Better Auth configuration and organization role/access setup.
- **Main API boundary:** `packages/api/src/` owns the main app router, org middleware, and a mix of business/application logic.
- **Assistant boundary:** `packages/assistant/src/` owns assistant contracts, chat persistence, tools, and model orchestration.
- **Notifications boundary:** `packages/notifications/src/` owns notification contracts, publishing, preference resolution, and delivery processing.
- **Queue boundary:** `packages/queue/src/` owns pg-boss producers and worker helpers.
- **Database boundary:** `packages/db/src/` owns all schema and relations.

**Documented target domain boundaries:**
- `docs/ADR/001_legacy-extraction.md` defines dedicated domain packages for booking, pricing, catalog, calendar, payments, disputes, and messaging.
- `docs/ADR/002_architecture-patterns.md` defines foundational packages for typed events and workflows.
- `packages/db/src/schema/marketplace.ts` already reflects those future domains at the table level.

## Key Abstractions

**oRPC contract + implementation pair:**
- Purpose: Keep input/output typing centralized.
- Examples: `packages/api-contract/src/routers/index.ts`, `packages/api/src/handlers/index.ts`, `packages/assistant/src/contract.ts`, `packages/assistant/src/router.ts`.
- Pattern: Contract-first RPC with separate transport adapters.

**Organization-aware request context:**
- Purpose: Resolve active organization and role before handlers run.
- Examples: `packages/api/src/context.ts`, `packages/api/src/index.ts`, `packages/auth/src/organization-access.ts`.
- Pattern: Middleware-enforced multitenancy.

**Notification event bus:**
- Purpose: Buffer request-scoped notification events and flush them to the notification pipeline.
- Examples: `packages/api/src/lib/event-bus.ts`, `packages/notifications/src/pusher.ts`.
- Pattern: Notification-recipient event accumulation, not yet the typed multi-pusher `packages/events` model from ADR-002.

**Payment webhook adapter registry:**
- Purpose: Normalize provider-specific webhook auth/parsing/processing.
- Examples: `packages/api/src/payments/webhooks/registry.ts`, `packages/api/src/payments/webhooks/cloudpayments/adapter.ts`.
- Pattern: Adapter registry that serves as the canonical precursor to a future standalone `packages/payments`.

**Queue producer abstraction:**
- Purpose: Hide pg-boss specifics from callers.
- Examples: `packages/queue/src/producer.ts`, `packages/api/src/context.ts`.
- Pattern: Infrastructure boundary reused by server and worker apps.

## Entry Points

**Main API server:**
- Location: `apps/server/src/index.ts`
- Triggers: local dev, `start:test`, deployment container startup.
- Responsibilities: serve HTTP, start recurring-task worker, manage shutdown.

**Main API composition:**
- Location: `apps/server/src/app.ts`
- Triggers: imported by `apps/server/src/index.ts`.
- Responsibilities: configure CORS, auth routes, payment webhooks, health, and RPC/OpenAPI mounting.

**Assistant server:**
- Location: `apps/assistant/src/index.ts`
- Triggers: local dev, assistant deployment startup.
- Responsibilities: serve assistant RPC and manage assistant workerless runtime.

**Notifications server:**
- Location: `apps/notifications/src/index.ts`
- Triggers: local dev, notifications deployment startup.
- Responsibilities: serve health endpoint and run `NOTIFICATION_QUEUE` consumers.

**Infrastructure entrypoint:**
- Location: `infra/pulumi/src/index.ts`
- Triggers: `bun run infra:preview`, `bun run infra:up`.
- Responsibilities: provision VPS, Dokku apps, DNS, and GitHub secrets sync.

## Principal Tensions and Migration Seams

**API package is both transport and application layer:**
- Present state: `packages/api/src/handlers/*` still owns business logic that ADR-001 assigns to future domain packages.
- Migration seam: split logic from handlers into `packages/booking`, `packages/catalog`, `packages/payments`, `packages/calendar`, `packages/disputes`, and `packages/messaging` while keeping `packages/api` as thin wiring.

**Event bus is narrower than the documented target:**
- Present state: `packages/api/src/lib/event-bus.ts` only batches notification recipients.
- Target seam: `docs/ADR/002_architecture-patterns.md` specifies a typed `packages/events` multi-pusher model that can fan out to notifications, tracking, and calendar sync.

**Schema leads service extraction:**
- Present state: `packages/db/src/schema/marketplace.ts` already models listings, pricing, publications, bookings, reviews, disputes, and payment config.
- Tension: `packages/api-contract/src/routers/index.ts` currently exposes admin/consent/notifications/payments/tasks/todo, not the full marketplace contract tree described in the ADRs.

**Current payment adapters live in the API package:**
- Present state: `packages/api/src/payments/webhooks/*` already implements a registry/adapter/provider shape.
- Target seam: ADR-001 designates this as the source pattern for a dedicated `packages/payments` package.

**Assistant architecture has moved ahead of one constitution document:**
- Present state: `packages/assistant/src/contract.ts` defines a contract and `packages/assistant/src/router.ts` implements it.
- Tension: `docs/architecture-constitution.md` still describes the assistant as an inline/non-contract surface, so planners should trust code plus ADRs before reusing that specific statement.

**Legacy reference is embedded but non-runtime:**
- Present state: `legacy/full-stack-cf-app/` and `legacy/full-stack-cf-app/legacy/cf-boat-api/` are committed for analysis.
- Tension: the repo needs them for extraction guidance, but active runtime code must never import from `legacy/`.

## Error Handling

**Strategy:** Transport surfaces normalize errors at the boundary, while queue consumers validate and reject malformed jobs explicitly.

**Patterns:**
- Hono app shells use centralized `app.onError(...)` handlers in `apps/server/src/app.ts`, `apps/assistant/src/app.ts`, and `apps/notifications/src/app.ts`.
- oRPC middleware and handlers throw `ORPCError` from `packages/api/src/index.ts`, `packages/api/src/handlers/*`, and `packages/assistant/src/router.ts`.
- Queue consumers validate with `safeParse`, for example in `apps/notifications/src/queues/notification-consumer.ts`.
- Provider adapters use explicit typed errors, for example `packages/api/src/payments/webhooks/errors.ts`.

## Cross-Cutting Concerns

**Logging:** Hono request logging is enabled in `apps/server/src/app.ts`, `apps/assistant/src/app.ts`, and `apps/notifications/src/app.ts`; deeper services still use `console.*` in files such as `packages/notifications/src/pusher.ts` and `packages/notifications/src/processor.ts`.

**Validation:** RPC contracts and queue contracts rely on Zod in `packages/api-contract/src/routers/index.ts`, `packages/assistant/src/contract.ts`, and `packages/notifications/src/contracts.ts`.

**Authentication:** Better Auth is centralized in `packages/auth/src/index.ts`; org resolution happens in `packages/api/src/context.ts`; permission checks are enforced by middleware in `packages/api/src/index.ts`.

**Multitenancy:** Active org membership is derived in `packages/api/src/context.ts`, then enforced by `organizationProcedure` and `organizationPermissionProcedure` in `packages/api/src/index.ts`.

**Deployment split:** Infra state is defined in `infra/pulumi/src/index.ts`, while runtime images and local stacks are driven by root `Dockerfile`, `Dockerfile.web`, and `docker-compose*.yml`.

---

*Architecture analysis: 2026-03-09*
