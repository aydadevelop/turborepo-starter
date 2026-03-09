# Architecture Research: Brownfield Extraction Sequencing

**Project:** Travel commerce marketplace brownfield extraction
**Researched:** 2026-03-09
**Confidence:** HIGH

## Executive Recommendation

The system should be structured as a **thin-transport, package-owned domain monorepo** where the active repo is the only runtime, legacy repositories are reference material only, and each extraction lands as a **small vertical slice**: one contract subtree, one domain package seam, one repository surface, one event set, and one workflow boundary at a time.

The key sequencing principle is: **stabilize orchestration and persistence seams before extracting high-risk business behavior**. In practice that means the order should be:

1. foundation packages and reproducible state,
2. pure business logic domains,
3. stateful booking/catalog flows,
4. external integrations behind providers,
5. disputes and messaging,
6. optional admin extensibility.

Legacy code should supply **behavioral truth** and **edge cases**, but it should not dictate the new package graph. Boat-era route layout, service names, and inline side effects are useful as migration evidence, not as target structure. The new boundaries should follow the target marketplace domains documented in the ADRs, not the accidental shape of the legacy apps.

## Recommended System Structure

The target layering should remain:

`apps/* transport` → `packages/api-contract` → `packages/api` thin handlers → `domain packages` → `repositories/providers` → `packages/events` / `packages/workflows` / `packages/queue`

That structure keeps transport replaceable, business logic testable, and side effects observable.

### Component Boundaries and Allowed Dependencies

| Component | Owns | Allowed dependencies | Must not depend on |
|-----------|------|----------------------|--------------------|
| `apps/web` | UI, route loads, typed clients, cache invalidation | `@my-app/api-contract`, `@my-app/assistant`, `@my-app/ui`, `@my-app/ai-chat`, env/client libraries | domain packages, `@my-app/db`, provider SDKs, legacy code |
| `apps/server` | HTTP transport, auth mount, webhook ingress, worker bootstrap | `@my-app/api`, `@my-app/auth`, `@my-app/db`, `@my-app/env`, `@my-app/queue` | domain logic, direct provider SDK orchestration, legacy code |
| `apps/assistant` | assistant transport/runtime shell | `@my-app/assistant`, `@my-app/auth`, `@my-app/env` | marketplace domain logic outside assistant package, legacy code |
| `apps/notifications` | notification worker/runtime shell | `@my-app/notifications`, `@my-app/db`, `@my-app/env`, `@my-app/queue` | booking/payment/calendar business rules, legacy code |
| `packages/api-contract` | typed contracts, schemas, route metadata | Zod/oRPC only | DB, auth state, provider SDKs, side effects |
| `packages/api` | auth-aware handler wiring, request context, contract implementation | `@my-app/api-contract`, `@my-app/auth`, `@my-app/db`, `@my-app/events`, domain packages | provider SDKs, heavy business rules, inline compensation, legacy code |
| `packages/events` | typed domain events, event pusher registration | no internal domain deps | direct domain imports, transport concerns, queue implementation details |
| `packages/workflows` | multi-step orchestration, compensation, execution logs | `@my-app/events`, `@my-app/db` | transport code, provider-specific logic |
| `packages/db` | schema, relations, migrations, seeds/snapshots | Drizzle/Postgres only | contracts, transport, provider logic |
| `packages/auth` | session/authn/authz, org access model | DB/auth framework | marketplace domain rules, transport-specific branching |
| `packages/catalog` | listing CRUD, publication state, search/filter semantics | `@my-app/db`, `@my-app/events` | payment/calendar SDKs, booking workflow internals, legacy imports |
| `packages/pricing` | pricing engine, pricing profiles, commission rules | `@my-app/db` | transport, auth, provider SDKs, boat-specific entity assumptions |
| `packages/booking` | booking state machine, availability, slot logic, booking workflows | `@my-app/db`, `@my-app/events`, `@my-app/workflows`, `@my-app/pricing` | direct calendar/payment/messaging SDK calls, auth checks |
| `packages/calendar` | calendar provider interface, adapter registry, sync handlers | `@my-app/db`, `@my-app/events` | imports from `packages/api`, inline booking mutations |
| `packages/payments` | payment provider interface, webhook adapters, payment state transitions | `@my-app/db`, `@my-app/events` | imports from `packages/api`, booking state mutations outside explicit workflows |
| `packages/disputes` | cancellation policy, dispute flow, refund orchestration | `@my-app/db`, `@my-app/events`, `@my-app/workflows`, `@my-app/booking`, `@my-app/payments` | transport code, direct notification/calendar SDK usage |
| `packages/messaging` | inbound/outbound channel adapters, message intake routing | `@my-app/db`, `@my-app/events` | booking/payment rules, transport wiring |
| `packages/notifications` | notification intent mapping, preference resolution, delivery processing | `@my-app/db`, `@my-app/events`, `@my-app/queue` | booking/payment/domain decision-making |
| `legacy/*` and `docs/*` | reference implementations and migration evidence | none at runtime | active runtime dependency graph |

### Dependency Rules

1. **`packages/api-contract` is the public API shape, not the place for business meaning.** It describes input/output and route trees only.
2. **`packages/api` may depend on domains; domains must not depend on `packages/api`.** This keeps handlers replaceable.
3. **Repositories stay query-only.** They do not emit events, perform auth checks, or call providers.
4. **Providers/adapters stay integration-only.** They translate external systems; they do not own booking, pricing, or dispute policy.
5. **Events are the side-effect seam; workflows are the multi-step consistency seam.** Do not collapse them together.
6. **`legacy/` never enters the runtime graph.** If code is worth keeping, it gets re-expressed inside the owning package with tests.

## Data, Event, and Workflow Flow

### Request and Data Flow

The main request path should be:

1. `apps/web` or webhook transport calls a typed contract.
2. `apps/server` resolves auth/session/org context.
3. `packages/api` validates input, applies middleware, and calls a single domain service or workflow.
4. The owning domain package reads/writes through its repository layer in `packages/db`.
5. The domain package returns a typed result and emits domain events for side effects.
6. `packages/api` returns the result without embedding integration logic.

That means the request path should stop being the place where “real work happens.” The handler should mostly answer: **who is acting, what use case is being invoked, and which domain entrypoint owns it?**

### Event Flow

The side-effect path should be:

1. A domain package emits a typed event from `packages/events`.
2. Registered event pushers fan that event out to interested modules.
3. A pusher either:
   - performs a small in-process reaction, or
   - enqueues durable work through `packages/queue`.
4. Worker apps consume queued jobs with schema validation and retry controls.
5. Side-effect packages (`calendar`, `payments`, `notifications`, `messaging`) act independently of the original request transport.

This keeps booking confirmation from turning into a spaghetti bowl of “also send notification, also sync calendar, also update payout schedule” in the same call stack. Spaghetti is delicious for dinner, less so for architecture.

### Workflow Flow

A workflow should be used only when an operation spans multiple mutations or external systems and needs compensation.

Recommended workflow path:

1. `packages/api` creates a `WorkflowContext` with actor/org/idempotency metadata.
2. A domain workflow in `packages/workflows` executes ordered steps.
3. Each step performs **one mutation or one external action**.
4. Step completion is logged.
5. On failure, compensation runs in reverse order where available.
6. Final domain events are emitted once the business transition is committed.

Typical examples:
- create booking: reserve availability → compute price → create booking → charge or authorize payment → emit `booking:created`
- confirm booking: validate state → update booking status → emit `booking:confirmed`
- cancel booking with refund: evaluate policy → compute refund → refund payment → transition booking → emit `booking:cancelled`

### Clear Separation Between Flow Types

| Concern | Best mechanism | Why |
|--------|----------------|-----|
| single-domain CRUD | service + repository | cheapest, easiest to test |
| multi-step domain transition | workflow | compensation and auditability |
| side effects after state change | domain events | decouples notifications/integrations |
| durable async execution | queue worker | retries, backpressure, worker isolation |

## Sequencing for Manageable, Testable Slices

The extraction should land in **behavior-first slices**, not package-big-bang waves. Each slice should follow this shape:

1. capture parity behavior from legacy code,
2. isolate the owning domain seam,
3. extract pure logic or repository code first,
4. introduce events/workflows only where needed,
5. rewire one contract subtree or handler family,
6. prove parity with focused tests,
7. only then move to the next slice.

### Recommended Build Order

#### Slice 0 — Stabilize the Foundation

**Goal:** make every later extraction safe and observable.

Build first:
- `packages/events`
- `packages/workflows`
- workflow execution log tables
- deterministic migrations, seeds, and state snapshots
- notification compatibility bridge from new events to existing notification pipeline

Why first:
- booking, payments, calendar, and disputes all depend on the same orchestration and side-effect seams
- without deterministic state, parity testing becomes guesswork
- without event/workflow seams, teams will be tempted to keep inline side effects during migration

Testing emphasis:
- event registration isolation
- workflow compensation behavior
- queue contract validation
- seed/snapshot repeatability

#### Slice 1 — Extract Pure Commerce Logic Before High-Churn Transport Rewires

**Goal:** move logic that is easiest to verify without touching risky integrations.

Recommended order:
1. `packages/pricing`
2. read-only or low-side-effect parts of `packages/catalog`
3. pure booking helpers (`slots`, overlap detection, policy evaluation)

Why here:
- pricing and availability rules are high-value and usually testable with pure inputs/outputs
- they create reusable building blocks for later booking workflows
- they reduce risk before payment/calendar concerns enter the picture

Testing emphasis:
- table-driven parity tests against legacy examples
- edge cases from boat-era seasonality, duration rules, and pricing overrides
- entity-agnostic pricing behavior so boats do not hard-code the future architecture

#### Slice 2 — Extract Catalog as the Stable Upstream Domain

**Goal:** establish the listing model and search/publication behavior the rest of the marketplace depends on.

Scope:
- listing CRUD and repository seams
- publication state and management flows
- search/filter semantics
- contract subtree rewired from thin handlers to `packages/catalog`

Why before full booking:
- booking depends on listing availability, pricing profile, and publication state
- catalog is a lower-volatility upstream boundary than payment or dispute flows

Testing emphasis:
- repository integration tests
- contract-to-domain wiring tests
- publication/search parity tests against legacy behavior

#### Slice 3 — Extract Booking Core Without Inline Side Effects

**Goal:** move booking state transitions and availability ownership into `packages/booking` while keeping side effects out.

Scope:
- booking repository
- booking service/state machine
- booking create/confirm/reschedule workflows
- `booking:*` events emitted instead of direct notification/calendar/payment calls

Why here:
- booking is the center of the marketplace and should be extracted only after pricing/catalog/foundation seams exist
- trying to port booking earlier usually recreates the old monolith under a new folder name

Testing emphasis:
- booking lifecycle unit tests
- idempotent workflow tests
- integration tests against DB state transitions
- parity tests for booking action policy and time-window rules

#### Slice 4 — Layer in External Integrations Behind Providers

**Goal:** attach the outside world only after internal business state is stable.

Recommended order:
1. `packages/payments`
2. `packages/calendar`
3. `packages/notifications` event subscription cleanup
4. `packages/messaging`

Why this order:
- payments usually gate booking completion and refund correctness
- calendar should react to confirmed/cancelled booking events, not drive booking state
- messaging is valuable but less central than payment correctness

Testing emphasis:
- provider contract tests
- webhook adapter tests
- fake providers for domain workflows
- event subscriber tests proving the booking package does not know integration details

#### Slice 5 — Extract Disputes and Cancellation Policy as a Layer Above Booking

**Goal:** keep cancellation/refund/dispute logic from re-entangling booking.

Scope:
- cancellation policy evaluation
- refund orchestration through payments
- dispute opening/review/resolution
- workflow composition that calls booking steps instead of owning booking state directly

Why after payments:
- disputes depend on refund behavior and payment state fidelity
- cancellation should call booking transitions, not redefine them

Testing emphasis:
- policy matrix tests
- refund calculation tests
- dispute workflow compensation/error handling

#### Slice 6 — Optional Admin/Extension Surfaces After Core Commerce Works

**Goal:** extend rather than destabilize.

Scope:
- `packages/admin-zones`
- `packages/field-registry`
- vendor/admin-specific UI extension points

Why last:
- these are multipliers, not prerequisites for booking correctness
- they should sit on top of stable domain boundaries, not compensate for missing ones

## How Legacy Should Inform Design Without Owning It

Legacy should influence the new architecture in exactly three ways:

1. **Behavioral truth** — business rules, edge cases, and production-proven flows.
2. **Test fixtures** — seed data, scenario coverage, and parity expectations.
3. **Pattern harvesting** — extracting the good abstractions already explored in `full-stack-cf-app`.

Legacy should **not** dictate:

- package names based on old transport or service files,
- boat-specific domain boundaries in a multi-listing marketplace,
- inline side effects inside booking flows,
- route trees as a proxy for bounded contexts,
- direct imports from `legacy/` during runtime,
- keeping auth, notification, or webhook concerns inside marketplace services.

### Practical Boundary Decisions

| Legacy signal | Use it for | Do not use it for |
|---------------|------------|-------------------|
| `cf-boat-api` booking/cancellation behavior | parity rules, policy edge cases, refund semantics | keeping a monolithic `BookingService` shape |
| `cf-boat-api` boat-oriented data model | identifying domain concepts that matter | naming core packages around boats instead of generic listings |
| `full-stack-cf-app` provider/adapter registries | calendar/payment/messaging package design | blindly copying its package placement if the new repo already has a better owner |
| legacy route files | discovering use cases and API coverage | defining package boundaries from route directories |
| legacy notification code | understanding event timing and recipient logic | embedding notification orchestration back into business services |

### Explicit Rule

**Behavior ports forward; structure does not.**

If a legacy behavior matters, rewrite it inside the target owning package with tests. If a legacy structure is merely convenient, leave it in the museum. Nicely labeled, dusted, and never imported.

## Build Order Implications for Roadmapping

The roadmap should be organized by **dependency pressure**, not by which legacy folder looks easiest to copy.

### What must come early

- reproducible DB state and migration safety
- typed domain events
- workflow engine and execution logs
- pricing/catalog/booking core seams

### What should wait until the center is stable

- payment providers
- calendar sync
- message channels
- dispute workflows

### What should come last

- admin injection zones
- custom field registries
- broader extension surfaces

### Why this sequencing works

- It gives every later slice a stable orchestration contract.
- It allows parity tests to target one business seam at a time.
- It minimizes cross-package churn because downstream integrations subscribe to events instead of reaching into booking internals.
- It prevents the classic brownfield mistake of migrating external complexity before internal invariants are trustworthy.

## Slice Acceptance Criteria

Each extraction slice should be considered done only when:

- the new owning package is the only place where that business logic lives,
- `packages/api` handler code becomes thin wiring for that slice,
- side effects moved to events or workflows where appropriate,
- no runtime import from `legacy/` exists,
- parity tests cover the legacy behavior being replaced,
- integration tests prove the new package works with the current DB and queue boundaries,
- the next slice can depend on its public interface without knowing its internals.

## Sources

- `/Users/d/Documents/Projects/turborepo-alchemy/.planning/PROJECT.md`
- `/Users/d/Documents/Projects/turborepo-alchemy/.planning/codebase/ARCHITECTURE.md`
- `/Users/d/Documents/Projects/turborepo-alchemy/docs/ADR/001_legacy-extraction.md`
- `/Users/d/Documents/Projects/turborepo-alchemy/docs/ADR/002_architecture-patterns.md`
- `/Users/d/Documents/Projects/turborepo-alchemy/docs/architecture-constitution.md`
