# ADR-002: Architecture Patterns — Medusa/Mercur-Inspired Design

**Date:** 2026-03-09
**Status:** Proposed
**Authors:** Platform Team
**Related:** [ADR-001: Legacy Extraction Plan](./001_legacy-extraction.md)

---

## Table of Contents

1. [Context](#context)
2. [Decision](#decision)
3. [1. Patterns Adopted](#1-patterns-adopted)
   - [1.1 From Medusa](#11-from-medusa)
   - [1.2 From Mercur](#12-from-mercur)
4. [2. Hard Rules](#2-hard-rules)
5. [3. New Package Specifications](#3-new-package-specifications)
   - [3.1 packages/events](#31-packagesevents)
   - [3.2 packages/workflows](#32-packagesworkflows)
   - [3.3 packages/admin-zones](#33-packagesadmin-zones)
   - [3.4 packages/field-registry](#34-packagesfield-registry)
6. [4. Anti-Patterns to Avoid](#4-anti-patterns-to-avoid)
7. [5. Dependency Graph (Target State)](#5-dependency-graph-target-state)
8. [Consequences](#consequences)

---

## Context

The legacy extraction plan ([ADR-001](./001_legacy-extraction.md)) defines *what* to move from legacy repositories. This ADR defines *how* to design the target architecture using concepts adopted from Medusa.js and Mercur marketplace patterns.

This covers:
- Which patterns we adopt from Medusa and Mercur (concepts only, not their frameworks)
- The hard rules derived from those patterns
- Full specifications for the four new packages that have no direct legacy source: `packages/events`, `packages/workflows`, `packages/admin-zones`, `packages/field-registry`
- Anti-patterns found in the legacy code that MUST NOT be carried forward
- The target dependency graph across all packages

---

## Decision

We adopt the *concepts* of Medusa.js workflows, modules, providers, injection zones, and typed custom fields — and the *thinking* of Mercur's marketplace layering and multi-actor architecture — as guiding principles. We build minimal implementations of these patterns natively on our stack (pg-boss, Drizzle, oRPC) without taking on Medusa's or Mercur's framework dependencies.

The resulting repo-native layering is:

`packages/api-contract` → `packages/api` handler → domain package service/workflow → repository/provider

This preserves Medusa's separation-of-concerns benefits without copying Medusa's container, workflow DSL, or route APIs.

---

## 1. Patterns Adopted

### 1.1 From Medusa

| Concept | What We Adopt |
|---|---|
| **Workflows** | `createWorkflow` / `createStep` pattern with retries, compensation, idempotency keys, and execution logs. Targeting bookings and payouts. |
| **Modules** | Self-contained domain packages (`packages/booking`, `packages/pricing`, etc.) with clear exported interfaces and no cross-domain imports. |
| **Layered transport boundary** | Thin oRPC handlers call domain services/workflows; contracts live in `packages/api-contract`; repositories remain query-only. |
| **Providers** | Swappable provider interfaces for all external integrations: `CalendarProvider`, `PaymentProvider`, `OutboundChannelAdapter`. Logic never imports an external SDK directly. |
| **Admin injection zones** | Zone constants and a registration API for pluggable admin UI panels. Allows adding panels to admin pages without modifying page code. |
| **Typed extension surfaces** | A Custom Field Registry with Zod schema, zone, renderer key, validation, and permissions — not raw metadata blobs. |
| **Subscriber/event model** | Domain events trigger all side effects. Services emit events; modules self-register as subscribers via `registerEventPusher`. |

> **Why not use Medusa's packages directly?**
> `@medusajs/workflows-sdk` is coupled to Medusa's `MedusaContainer` and the `@medusajs/orchestration` Redis-backed engine. Our stack uses pg-boss (via `packages/queue`), Drizzle ORM, and oRPC — none of which integrate with Medusa's container system. Additionally, Medusa's workflow engine adds ~2 MB of transitive dependencies. We adopt the *concept* and implement a minimal version that integrates natively with `packages/queue` and `packages/db`.

### 1.2 From Mercur

| Thinking | How We Apply It |
|---|---|
| **Marketplace layering** | Multi-vendor architecture: `org_owner`, `org_admin`, `manager`, `agent`, `member`, `customer` roles enforced via oRPC middleware chain in `packages/auth`. |
| **Multi-actor platform thinking** | Different oRPC contract trees per actor: customer procedures, owner procedures, admin procedures — not a single flat API. |
| **Vendor/operator-oriented architecture** | Owner vs admin vs customer separation baked into both the API contract and the domain services. Domain services receive pre-authorized context, never perform role checks inline. |
| **Policy override mindset** | Configurable business rules per vendor/entity — expressed as `PricingProfile`, booking action policy, and cancellation windows in `packages/booking` (already implemented in `full-stack-cf-app`; bring as-is). |
| **Commission model** | Platform fee + vendor payout calculation added to `packages/pricing`; commission rules are a pricing concern, not a separate package. |

---

## 2. Hard Rules

These rules are non-negotiable across all packages:

- **No generic "shared" dumping grounds** — Every package must have a clear domain boundary. If a utility doesn't belong to a domain, it belongs in the package that owns the concept (calendar utils → `packages/calendar`; role constants → `packages/auth`).
- **Contracts and handlers stay thin** — `packages/api-contract` defines schemas and route metadata; `packages/api` handlers build context, call a service/workflow, and return the typed result. No business logic, manual rollback, raw SDK calls, or direct Drizzle queries in handlers.
- **Event-driven side effects** — Notifications, calendar sync, and analytics MUST be triggered via domain events, never inline inside a domain service.
- **Events are not the queue** — `packages/events` is an in-process event bus; `packages/queue` is a durable pg-boss-backed job queue. Event pushers may enqueue jobs for durable async work, but the two concerns stay separate.
- **Provider interfaces** — All external service integrations (Google Calendar, CloudPayments, Telegram, etc.) sit behind a swappable `Provider` interface. Domain logic never imports an external SDK directly.
- **Custom Field Registry** — Schema, zone, renderer key, validation, and permissions per field. Not raw metadata blobs.
- **Workflow for multi-step operations** — Any operation involving more than one external side effect (charge + calendar create + notify) must be expressed as a `createWorkflow` with `createStep` + `compensate`. No ad-hoc try/catch compensation in route handlers.
- **Repo-native workflow model** — Our workflows are imperative async orchestrators. `async` / `await` inside a workflow is correct. Do not copy Medusa-specific DSL primitives (`when`, `transform`, `WorkflowResponse`, hooks) unless we explicitly implement them.
- **Repositories are query-only** — Domain repositories execute Drizzle queries; they do not emit events, talk to providers, or contain orchestration logic.
- **Authorization in middleware** — All role checks go through the oRPC middleware chain. Domain services receive a pre-authorized `WorkflowContext` and do not check roles.
- **Queue message validation** — All queue messages must be validated with `safeParse` before enqueue and after dequeue. Use explicit retry limits and a dead-letter queue strategy.

---

## 3. New Package Specifications

These four packages are **new** — they have no direct legacy counterpart. The legacy extraction packages (`packages/booking`, `packages/pricing`, etc.) are specified in [ADR-001](./001_legacy-extraction.md).

### 3.1 `packages/events`

**Purpose:** Typed, discriminated-union domain event bus with multi-pusher registration. The foundational package all domain packages depend on for side-effect decoupling.

**What it is not:** `packages/events` is not a durable queue. Events are emitted in-process during the current request or workflow execution. If a side effect must survive process restarts or be retried independently, the event pusher hands the work off to `packages/queue` by calling `queue.send(...)`.

**Legacy source:** `cf-boat-api/src/events/` (untyped) and `full-stack-cf-app/packages/api/src/lib/event-bus.ts` (typed `DomainEvent<T>` — better than legacy, move as-is, then extend).

**Migration path for existing `packages/api/src/lib/event-bus.ts`:**
The current `EventBus` in this repo collects `NotificationRecipient[]` objects and flushes to the notifications pipeline. It has a different interface from the typed `DomainEvent<T>` system. Two-step migration:
1. **Wave 0:** Create `packages/events` with the new `DomainEvent<T>` interface. Register a compatibility pusher that maps each new `DomainEvent` to the existing `NotificationRecipient` format. New domain packages use `packages/events` exclusively.
2. **Wave 1:** Once `packages/booking` and `packages/catalog` emit via `packages/events`, remove the old `EventBus` class and delete the compatibility pusher.

```typescript
// packages/events/src/event-bus.ts
export interface QueueProducer {
  send(message: unknown, options?: { delaySeconds?: number }): Promise<void>
}

type EventPusher = (event: DomainEvent, queue?: QueueProducer) => Promise<void>

const pushers: EventPusher[] = []

export const registerEventPusher = (pusher: EventPusher): void => {
  pushers.push(pusher)
}

/** For use in tests only — clears all registered pushers to prevent cross-test pollution. */
export const clearEventPushers = (): void => {
  pushers.length = 0
}

export const emitDomainEvent = async (
  event: DomainEvent,
  queue?: QueueProducer
): Promise<void> => {
  await Promise.allSettled(pushers.map((p) => p(event, queue)))
}

export class EventBus {
  constructor(private readonly queue?: QueueProducer) {}

  async emit(event: DomainEvent): Promise<void> {
    await emitDomainEvent(event, this.queue)
  }
}

// How modules self-register at application startup:
// packages/calendar/src/index.ts
registerEventPusher(async (event) => {
  if (event.type === "booking:confirmed") await syncCalendar(event.data)
  if (event.type === "booking:cancelled") await deleteCalendarEvent(event.data)
})

// packages/notifications/src/index.ts
registerEventPusher(async (event, queue) => {
  await notificationsPusher({ input: mapToNotificationInput(event), queue })
})
```

> **Test isolation rule:** Unit tests must call `clearEventPushers()` in `beforeEach` (or inject a mock `EventBus` via `WorkflowContext`) so pushers registered by other packages don't fire unexpectedly.

**Event map (typed discriminated union):**
```typescript
export interface DomainEventMap {
  "booking:created":          { bookingId: string; listingId: string; customerId: string }
  "booking:confirmed":        { bookingId: string; ownerId: string }
  "booking:cancelled":        { bookingId: string; reason: string; refundAmountKopeks: number }
  "booking:contact-updated":  { bookingId: string; contactDetails: ContactDetails }
  "payment:captured":         { bookingId: string; paymentId: string; amountKopeks: number }
  "payment:failed":           { bookingId: string; paymentId: string; error: string }
  "dispute:opened":           { disputeId: string; bookingId: string }
  "dispute:resolved":         { disputeId: string; resolution: string }
  "calendar:sync-requested":  { bookingId: string; calendarId: string }
}
```

**Dependencies:** None — foundational package. `QueueProducer` is defined as a minimal local structural interface inside `packages/events` (dependency inversion) so that the concrete `PgBossProducer` from `@my-app/queue` satisfies it without creating a circular dep.

---

### 3.2 `packages/workflows`

**Purpose:** Minimal `createStep` / `createWorkflow` engine with sequential step execution, automatic compensation on failure, idempotency key tracking, and a persistent execution log in `packages/db`.

**Execution model:** Unlike Medusa's declarative workflow DSL, our workflows are imperative async orchestrators. `async` / `await` inside the workflow body is expected. We do not assume `when()`, `transform()`, `WorkflowResponse`, `StepResponse`, or workflow hooks unless we later build equivalents.

**Why build our own instead of using Medusa's?** See [§1.1 From Medusa](#11-from-medusa).

```typescript
// packages/workflows/src/types.ts
export interface WorkflowContext {
  organizationId: string
  actorUserId?: string
  idempotencyKey: string
  eventBus: EventBus
}

type CompletedStep = {
  name: string
  output: unknown
  compensate?: (output: unknown, ctx: WorkflowContext) => Promise<void>
}

type InternalWorkflowContext = WorkflowContext & {
  __completed: CompletedStep[]
}

export type StepFn<TIn, TOut> = ((input: TIn, ctx: InternalWorkflowContext) => Promise<TOut>) & {
  stepName: string
  compensate?: (output: TOut, ctx: WorkflowContext) => Promise<void>
}

// packages/workflows/src/create-step.ts
export const createStep = <TIn, TOut>(
  name: string,
  invoke: (input: TIn, ctx: WorkflowContext) => Promise<TOut>,
  compensate?: (output: TOut, ctx: WorkflowContext) => Promise<void>
): StepFn<TIn, TOut> => {
  const step = (async (input: TIn, ctx: InternalWorkflowContext) => {
    const output = await invoke(input, ctx)
    ctx.__completed.push({ name, output, compensate: compensate as CompletedStep["compensate"] })
    return output
  }) as StepFn<TIn, TOut>

  step.stepName = name
  step.compensate = compensate
  return step
}

// packages/workflows/src/create-workflow.ts
export const createWorkflow = <TIn, TOut>(
  name: string,
  run: (input: TIn, ctx: WorkflowContext) => Promise<TOut>
) => ({
  name,
  execute: async (input: TIn, ctx: WorkflowContext) => {
    const internalCtx: InternalWorkflowContext = { ...ctx, __completed: [] }
    try {
      const output = await run(input, internalCtx)
      return { success: true as const, output }
    } catch (error) {
      for (const completed of internalCtx.__completed.reverse()) {
        if (completed.compensate) {
          await completed.compensate(completed.output, ctx).catch(() => {
            // Log compensation failure; do not rethrow — best-effort rollback
          })
        }
      }
      return {
        success: false as const,
        error: error instanceof Error ? error : new Error(String(error)),
      }
    }
  },
})
```

**Layer boundary:** a handler constructs `WorkflowContext` and calls `.execute(...)`; the workflow orchestrates steps; each step performs one mutation or one external side effect; repositories and provider adapters do the low-level work.

**Workflow execution log tables** (add to `packages/db`):
```
workflow_execution (id, workflow_name, idempotency_key, status, input_snapshot, output_snapshot, error, created_at, completed_at)
workflow_step_log  (id, execution_id, step_name, status, input_snapshot, output_snapshot, error, started_at, completed_at)
```

**Dependencies:** `@my-app/events`, `@my-app/db` (execution log).

> **Note on `packages/events` dep status:** `packages/events` itself exposes `QueueProducer` as an optional parameter in `EventPusher`. To keep `packages/events` truly dep-free, define a minimal structural interface locally (`interface QueueProducer { send(message: unknown, options?: { delaySeconds?: number }): Promise<void> }`) rather than importing from `@my-app/queue`. The concrete `PgBossProducer` satisfies it structurally. This avoids a circular dependency: `queue → events → queue`.

---

### 3.3 `packages/admin-zones`

**Purpose:** Typed injection zone registry for pluggable admin UI panels. Allows feature packages to register Svelte components into named zones in admin pages without modifying the page code.

> **Note on Svelte components:** Per the project rule ("Keep shared design system pieces in `packages/ui`"), the `ZoneRenderer` Svelte component that renders registered zone widgets belongs in `packages/ui`. `packages/admin-zones` exports only pure TypeScript (zone constants and registry). `apps/web` imports from both.

```typescript
// packages/admin-zones/src/constants.ts  (pure TypeScript — no Svelte dependency)
export const INJECTION_ZONES = [
  // Booking management
  "booking.list.before",        "booking.list.after",
  "booking.details.before",     "booking.details.after",
  "booking.details.side.before","booking.details.side.after",
  // Listing management
  "listing.list.before",        "listing.list.after",
  "listing.details.before",     "listing.details.after",
  // Helpdesk / support
  "ticket.details.before",      "ticket.details.after",
  // Dashboard
  "dashboard.overview.before",  "dashboard.overview.after",
  // Pricing & availability
  "pricing.details.before",     "pricing.details.after",
] as const

export type InjectionZone = (typeof INJECTION_ZONES)[number]

// packages/admin-zones/src/registry.ts  (pure TypeScript — no Svelte dependency)
// ZoneComponent is opaque here; resolved to a concrete Svelte Component constructor
// by packages/ui/ZoneRenderer at render time via a dynamic lookup map.
type ZoneComponent = object

const zoneRegistry = new Map<InjectionZone, ZoneComponent[]>()

export const registerZoneComponent = (zone: InjectionZone, component: ZoneComponent): void => {
  zoneRegistry.set(zone, [...(zoneRegistry.get(zone) ?? []), component])
}

export const getZoneComponents = (zone: InjectionZone): ZoneComponent[] =>
  zoneRegistry.get(zone) ?? []

// packages/ui/src/zone-renderer/ZoneRenderer.svelte  (Svelte component — lives in packages/ui)
// Imports getZoneComponents from @my-app/admin-zones, renders the registered components.
```

**Dependencies:** None (`packages/admin-zones` is pure TypeScript with no internal monorepo deps). The dependency arrow is reversed: `packages/ui` imports from `packages/admin-zones` to render the `ZoneRenderer` component — `packages/admin-zones` does not import from `packages/ui`.

---

### 3.4 `packages/field-registry`

**Purpose:** Typed custom field definitions with Zod validation schema, admin zone placement, renderer lookup key, and permission requirements. Replaces ad-hoc metadata blobs with a structured, type-safe extension surface.

> **Note on Svelte components:** The `FieldRenderer` Svelte component belongs in `packages/ui`. `packages/field-registry` exports only pure TypeScript.

```typescript
// packages/field-registry/src/types.ts  (pure TypeScript — no Svelte dependency)
import type { InjectionZone } from "@my-app/admin-zones"
import type { ZodSchema } from "zod"

export interface FieldDefinition<TValue = unknown> {
  name: string
  zone: InjectionZone           // Which admin zone renders this field
  schema: ZodSchema<TValue>     // Zod schema for client + server validation
  rendererKey: string           // Key used by packages/ui FieldRenderer to resolve the Svelte component
  permissions: string[]         // Required roles to view/edit this field
  defaultValue?: TValue
}

// packages/field-registry/src/registry.ts
const fieldRegistry = new Map<string, FieldDefinition>()

export const registerField = (field: FieldDefinition): void => {
  fieldRegistry.set(field.name, field)
}

export const getField = (name: string): FieldDefinition | undefined =>
  fieldRegistry.get(name)

export const getAllFields = (): FieldDefinition[] =>
  [...fieldRegistry.values()]

// packages/ui/src/field-renderer/FieldRenderer.svelte  (Svelte component — lives in packages/ui)
// Imports getField from @my-app/field-registry, resolves rendererKey to a Svelte component.
```

**Dependencies:** `@my-app/auth` (for role-constant type imports in `permissions`). The `FieldRenderer` Svelte component lives in `packages/ui` which imports `packages/field-registry` — the arrow is `packages/ui → @my-app/field-registry`, not the reverse. `packages/field-registry` itself does not depend on `packages/ui`.

---

## 4. Anti-Patterns to Avoid

The following patterns found in the legacy code MUST NOT be carried forward into any package in this monorepo:

### ❌ Monolithic Service with Inline Side Effects
**Legacy:** `BookingService.ts` (858 lines) performs booking creation, calendar sync, Telegram notifications, and payment capture all in a single method.

```typescript
// ❌ LEGACY ANTI-PATTERN
async function confirmBooking(bookingId: string) {
  await db.update(bookings).set({ status: "confirmed" }).where(eq(bookings.id, bookingId))
  await googleCalendar.events.insert({ ... })         // ❌ inline side effect
  await telegramBot.sendMessage(chatId, "Confirmed!") // ❌ inline side effect
  await cloudPayments.charge({ amount, token })       // ❌ inline side effect
}

// ✅ TARGET PATTERN
async function confirmBooking(bookingId: string, ctx: WorkflowContext) {
  await bookingRepository.updateStatus(bookingId, "confirmed")
  await ctx.eventBus.emit({ type: "booking:confirmed", data: { bookingId, ownerId: ctx.actorUserId! } })
}

// Calendar module self-registers — no import in booking service
registerEventPusher(async (event) => {
  if (event.type === "booking:confirmed") {
    await calendarRegistry.getProvider(event.data.listingId).createEvent(...)
  }
})
```

**Rule:** Each domain service does ONE thing. Side effects are emitted as domain events, handled independently by registered pushers.

### ❌ Direct External Service Calls Inside Business Logic
**Legacy:** `BookingService.ts` imports `googleapis` and calls Google Calendar API directly.

**Rule:** All external integrations go through a `Provider` interface. The domain service calls `calendarRegistry.getProvider(listingId).createEvent(...)`. Domain logic never imports an external SDK directly.

### ❌ Role Checks Scattered Across Route Files
**Legacy:** `if (user.role !== 'admin') throw new Error('Forbidden')` repeated across route handlers.

**Rule:** All authorization goes through the oRPC middleware chain (`publicProcedure` → `sessionProcedure` → `protectedProcedure` → `organizationProcedure` → `organizationPermissionProcedure`). Domain services receive a pre-authorized `WorkflowContext` and do not perform role checks.

### ❌ Business Logic in Handlers / Route Adapters
**Legacy shape:** transport files create records, call external SDKs, branch on business rules, then try to clean up on failure.

**Rule:** `packages/api` handlers are transport adapters only. They build request context, call a service or workflow, and return typed output. Business rules belong in domain services and workflows; compensation belongs in `createStep` / `createWorkflow`.

### ❌ Pricing Engine Coupled to the Boat Entity
**Legacy:** `PriceService.ts` imports `BoatRepository` and applies pricing logic specific to boat properties.

**Rule:** The pricing engine is entity-agnostic. It receives a `ListingType` + `PricingProfile` as inputs, not a `Boat` object. This allows pricing to work for future listing types (tours, experiences, docks) without modification.

### ❌ Ad-hoc Compensation Logic in Route Handlers
**Legacy:** `try/catch` blocks in route handlers repeat compensation code (e.g., "if payment fails, release the availability reservation").

**Rule:** All multi-step operations requiring compensation are expressed as `createWorkflow` with `createStep` + `compensate`. The workflow engine handles rollback automatically.

### ❌ Copying Medusa Workflow DSL Literally
**Legacy source of confusion:** examples using `when()`, `transform()`, `WorkflowResponse`, `StepResponse`, and declarative workflow blueprints.

**Rule:** We borrow the orchestration idea, not Medusa's runtime API. In this repo, workflows are imperative async functions using our own `createWorkflow` / `createStep` helpers.

### ❌ Generic "shared" or "utils" Packages as Dumping Grounds
**Legacy:** `src/utils/` contains unrelated utilities (error handling, calendar utils, role constants).

**Rule:** Every package has a single clear domain boundary. A utility belongs in the package that owns the concept: calendar utils → `packages/calendar`; role constants → `packages/auth`; error types → the package defining the error.

### ❌ Inline Queue Calls Without Schema Validation
**Legacy:** Queue messages published as raw objects with no validation.

**Rule:** All queue messages must be validated with Zod `safeParse` before enqueue and after dequeue. Use explicit retry limits and a dead-letter queue strategy.

---

## 5. Dependency Graph (Target State)

```
apps/web ──────────────────┬── @my-app/api-contract
                           ├── @my-app/assistant      (RouterClient for AI chat)
                           ├── @my-app/admin-zones
                           ├── @my-app/field-registry
                           ├── @my-app/ui, @my-app/ai-chat
                           ├── @my-app/env
                           └── @orpc/client, @orpc/tanstack-query

apps/assistant ────────────┬── @my-app/assistant
                           ├── @my-app/auth
                           ├── @my-app/env
                           └── @orpc/server

apps/server ───────────────┬── @my-app/api
                           ├── @my-app/auth
                           ├── @my-app/db
                           ├── @my-app/env
                           ├── @my-app/queue
                           └── @orpc/server, @orpc/openapi, @orpc/zod  (OpenAPI spec gen is a transport concern)

packages/api ──────────────┬── @my-app/api-contract
                           ├── @my-app/booking
                           ├── @my-app/catalog
                           ├── @my-app/pricing
                           ├── @my-app/payments
                           ├── @my-app/calendar
                           ├── @my-app/disputes
                           ├── @my-app/messaging
                           ├── @my-app/events
                           ├── @my-app/auth, @my-app/db
                           └── @orpc/server, @orpc/zod

packages/booking ──────────┬── @my-app/db
                           ├── @my-app/events
                           ├── @my-app/workflows
                           └── @my-app/pricing

packages/pricing ──────────└── @my-app/db

packages/catalog ──────────┬── @my-app/db
                           └── @my-app/events

packages/calendar ─────────┬── @my-app/db
                           └── @my-app/events  (self-registers event pusher)

packages/payments ─────────┬── @my-app/db
                           └── @my-app/events  (self-registers event pusher)

packages/disputes ─────────┬── @my-app/db
                           ├── @my-app/events
                           ├── @my-app/workflows
                           └── @my-app/booking

packages/messaging ────────┬── @my-app/db
                           └── @my-app/events  (self-registers event pusher)

packages/workflows ────────┬── @my-app/events
                           └── @my-app/db  (execution log)

packages/events ───────────└── (no internal deps — foundational; defines minimal local QueueProducer interface)

packages/admin-zones ──────└── (no internal deps — pure TypeScript)

packages/field-registry ───└── @my-app/auth  (role constants)

packages/ui ───────────────┬── @my-app/admin-zones  (ZoneRenderer reads zone registry)
                           └── @my-app/field-registry  (FieldRenderer reads field registry)

packages/notifications ────┬── @my-app/db
                           ├── @my-app/queue
                           └── @my-app/events  (registered as event pusher)
```

---

## Consequences

### Positive
- **Testability**: Domain services with injected `EventBus` are trivial to unit-test. `clearEventPushers()` provides clean test isolation.
- **Compensation safety**: Multi-step operations (charge + calendar create + notify) have automatic rollback via workflow compensation steps.
- **Event-driven decoupling**: Calendar, notifications, and messaging modules work independently once domain events are published.
- **Provider swappability**: Replacing CloudPayments with Stripe requires only a new `PaymentProvider` implementation — zero domain code changes.
- **Extensible admin UI**: New panels and custom fields can be added to admin pages by external packages without modifying page code.

### Negative / Trade-offs
- **Workflow overhead**: Simple CRUD operations should NOT use the workflow engine. Reserve it for multi-step operations requiring compensation.
- **Package proliferation**: `packages/events` and `packages/workflows` are foundational dependencies; incorrect design here cascades to all domain packages.
- **Registration ceremony**: Every module that has side effects must `registerEventPusher` at application startup boot order matters.
