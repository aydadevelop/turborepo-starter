# ADR-002: Legacy Extraction Plan — `cf-boat-api` & `full-stack-cf-app` → turborepo-starter

**Date:** 2026-03-09
**Status:** Proposed
**Authors:** Platform Team

---

## Table of Contents

1. [Context](#context)
2. [Decision](#decision)
3. [1. Extraction Inventory](#1-extraction-inventory)
4. [2. Domain Package Mapping](#2-domain-package-mapping)
5. [3. Key Module Extraction Details](#3-key-module-extraction-details)
   - [3.1 packages/booking](#31-packagesbooking)
   - [3.2 packages/pricing](#32-packagespricing)
   - [3.3 packages/catalog](#33-packagescatalog)
   - [3.4 packages/calendar](#34-packagescalendar)
   - [3.5 packages/payments](#35-packagespayments)
   - [3.6 packages/disputes](#36-packagesdisputes)
   - [3.7 packages/messaging](#37-packagesmessaging)
   - [3.8 packages/workflows](#38-packagesworkflows-new)
   - [3.9 packages/events](#39-packagesevents-upgrade-from-legacy-eventbus)
   - [3.10 packages/admin-zones](#310-packagesadmin-zones-new)
   - [3.11 packages/field-registry](#311-packagesfield-registry-new)
6. [4. What Already Works Well (KEEP AS-IS)](#4-what-already-works-well-keep-as-is)
7. [5. Migration Waves](#5-migration-waves)
8. [6. Anti-Patterns to Avoid](#6-anti-patterns-to-avoid)
9. [7. Dependency Graph (Target State)](#7-dependency-graph-target-state)
10. [Consequences](#consequences)

---

## Context

We are building a travel-commerce marketplace (similar to Sputnik8/Tripster) and are migrating domain logic from two legacy codebases into this turborepo-starter monorepo:

1. **`aydadevelop/cf-boat-api`** — A Cloudflare Workers Hono-based API (approximately 80% already extracted to `full-stack-cf-app`). Contains rich domain logic in `src/services/`, `src/repositories/`, `src/handlers/`, `src/events/`, `src/middleware/`, `src/validation/`, `src/types/`, `src/db/`, `src/clients/`, and `src/utils/`.

2. **`aydadevelop/full-stack-cf-app`** — An intermediate monorepo (npm-based) that acts as the current staging ground and is being superseded by this turborepo. Contains mature provider/adapter patterns (CalendarAdapter, PaymentWebhookAdapter, ChannelAdapterRegistry), a typed DomainEvent system, and a rich `packages/api/src/routers/booking/` hierarchy.

3. **`aydadevelop/turborepo-starter`** (THIS REPO — the target). Already has: oRPC contract-first approach, Turborepo, Bun, Better Auth, Drizzle, Hono, SvelteKit 5, and the marketplace Drizzle schema.

### Architectural Principles Guiding This Migration

The migration adopts concepts (not frameworks) from Medusa.js and Mercur marketplace patterns:

**From Medusa — adopt concepts:**
- **Workflows** — `createWorkflow` / `createStep` pattern with retries, compensation, idempotency keys, and execution logs. High ROI especially for bookings and payouts.
- **Modules** — Self-contained domain packages with clear interfaces.
- **Providers** — Swappable provider interfaces for external integrations (payment, calendar, notifications, etc.).
- **Admin injection zones** — Zone constants and a registration API for pluggable admin UI panels.
- **Typed extension surfaces** — A Custom Field Registry with schema, zone, renderer, validation, and permissions — not just raw metadata blobs.
- **Subscriber/event model** — Event-driven side effects (already partially present in legacy via `eventBus`).

**From Mercur — adopt thinking:**
- **Marketplace layering** — Multi-vendor architecture concepts.
- **Multi-actor platform thinking** — Multiple user types with different permissions and views.
- **Vendor/operator-oriented architecture** — Owner vs admin vs customer separation.
- **Policy override mindset** — Configurable business rules per vendor/entity.

**Hard Rules:**
- **No generic "shared" dumping grounds** — Every package must have a clear domain boundary.
- **Event-driven side effects** — Notifications, calendar sync, and analytics MUST be triggered via events, never inline.
- **Provider interfaces** — All external integrations sit behind swappable interfaces.
- **Custom Field Registry** — Schema, zone, renderer, validation, permissions — not raw metadata.

---

## Decision

We will execute a phased extraction of all domain logic from both legacy repositories into clearly bounded packages within this monorepo, following a contract-first, event-driven, provider-based architecture.

---

## 1. Extraction Inventory

The following table maps every major module from `cf-boat-api/src/` to its disposition:

| Legacy Module | Path in `cf-boat-api` | Disposition | Target in turborepo-starter |
|---|---|---|---|
| BookingService | `src/services/BookingService.ts` | 🔄 Extract & refactor | `packages/booking` — decompose into workflow steps |
| PriceService | `src/services/PriceService.ts` | 🔄 Extract & refactor | `packages/pricing` |
| FilterService | `src/services/filterService.ts` | 🔄 Extract & refactor | `packages/catalog` |
| ManageService | `src/services/ManageService.ts` | 🔄 Extract & refactor | `packages/catalog` |
| CalendarService | `src/services/Calendar/CalendarService.ts` | 🔄 Extract & refactor | `packages/calendar` (behind CalendarProvider interface) |
| GoogleCalendarHandler | `src/handlers/googleCalendarHandler.ts` | 🔄 Extract & refactor | `packages/calendar` (Google CalendarProvider impl) |
| CancellationService | `src/services/CancellationService.ts` | 🔄 Extract & refactor | `packages/disputes` |
| DisputeService | `src/services/DisputeService.ts` | 🔄 Extract & refactor | `packages/disputes` |
| PaymentService | `src/services/PaymentService/` | 🔄 Extract & refactor | `packages/payments` (behind PaymentProvider interface) |
| AuthService | `src/services/AuthService.ts` | ❌ Drop | Replaced by `packages/auth` (Better Auth) |
| UserService | `src/services/UserService.ts` | 🔄 Extract & refactor | `packages/api` (user procedures within existing router) |
| InsertService | `src/services/InsertService.ts` | 🔄 Extract & refactor | `packages/catalog` |
| TelegramWebhookService | `src/services/messaging/TelegramWebhookService.ts` | 🔄 Extract & refactor | `packages/messaging` |
| TelegramSupportService | `src/services/messaging/TelegramSupportService.ts` | 🔄 Extract & refactor | `packages/messaging` |
| IntakeService | `src/services/messaging/IntakeService.ts` | 🔄 Extract & refactor | `packages/messaging` |
| Normalizers | `src/services/messaging/normalizers/` | 🔄 Extract & refactor | `packages/messaging` |
| bookingRoutes | `src/routes/bookingRoutes.ts` | 🔄 Extract & refactor | `packages/api` (thin oRPC wiring, logic → `packages/booking`) |
| filterRoutes | `src/routes/filterRoutes.ts` | 🔄 Extract & refactor | `packages/api` (thin wiring → `packages/catalog`) |
| paymentRoutes | `src/routes/paymentRoutes.ts` | 🔄 Extract & refactor | `packages/api` (thin wiring → `packages/payments`) |
| manageRoutes | `src/routes/manageRoutes.ts` | 🔄 Extract & refactor | `packages/api` (thin wiring → `packages/catalog`) |
| userRoutes | `src/routes/userRoutes.ts` | 🔄 Extract & refactor | `packages/api` |
| cancellationRoutes | `src/routes/cancellationRoutes.ts` | 🔄 Extract & refactor | `packages/api` (thin wiring → `packages/disputes`) |
| disputeRoutes | `src/routes/disputeRoutes.ts` | 🔄 Extract & refactor | `packages/api` (thin wiring → `packages/disputes`) |
| messagingRoutes | `src/routes/messagingRoutes.ts` | 🔄 Extract & refactor | `packages/api` (thin wiring → `packages/messaging`) |
| insertRoutes | `src/routes/insertRoutes.ts` | 🔄 Extract & refactor | `packages/api` (thin wiring → `packages/catalog`) |
| diagnosticRoutes | `src/routes/diagnosticRoutes.ts` | ❌ Drop | `apps/server` already has `/health` endpoint |
| BookingRepository | `src/repositories/BookingRepository.ts` | 🔄 Extract & refactor | `packages/booking` (repository layer within domain) |
| BoatRepository | `src/repositories/BoatRepository.ts` | 🔄 Extract & refactor | `packages/catalog` |
| UserRepository | `src/repositories/UserRepository.ts` | 🔄 Extract & refactor | `packages/api` (collocated with user procedures) |
| PriceComponentsRepository | `src/repositories/PriceComponentsRepository.ts` | 🔄 Extract & refactor | `packages/pricing` |
| eventBus (emit/types) | `src/events/` | 🔄 Extract & refactor | `packages/events` (upgrade to typed `DomainEvent<T>` + subscriber registry) |
| authMiddleware | `src/middleware/authMiddleware.ts` | ❌ Drop | Replaced by `packages/auth` + oRPC middleware chain |
| Zod schemas | `src/validation/` | 🔄 Extract & refactor | `packages/api-contract` (convert to `oc.route()` contracts) |
| TypeScript types | `src/types/` | 🔄 Extract & refactor | Distributed to relevant domain packages |
| Drizzle schema | `src/db/` | 🔄 Extract & refactor | `packages/db` (merge into existing schema; already partially done) |
| External API clients | `src/clients/` | 🔄 Extract & refactor | Respective provider implementations in domain packages |
| applicationError | `src/utils/applicationError.ts` | ✅ Already exists | `packages/api` already has error handling patterns |
| calendarUtils | `src/utils/calendarUtils.ts` | 🔄 Extract & refactor | `packages/calendar` |
| access roles | `src/utils/access.ts` | ✅ Already exists | `packages/auth` covers role-based access |

**From `full-stack-cf-app`** (all paths below are relative to the `full-stack-cf-app` repo root, not this repo):

| Module | Source (in `full-stack-cf-app`) | Disposition | Target in turborepo-starter |
|---|---|---|---|
| CalendarAdapter + Registry | `full-stack-cf-app: packages/api/src/calendar/` | ✅ Already implemented | Bring to `packages/calendar` as-is |
| PaymentWebhookAdapter + Registry | `full-stack-cf-app: packages/api/src/payments/` | ✅ Already implemented | Bring to `packages/payments` as-is |
| ChannelAdapterRegistry (5 channels) | `full-stack-cf-app: packages/api/src/channels/` | ✅ Already implemented | Bring to `packages/messaging` as-is |
| `DomainEvent<T>` + `DomainEventMap` | `full-stack-cf-app: packages/api/src/lib/event-bus.ts` | ✅ Better than legacy | Promote to `packages/events`, add multi-pusher. Note: this repo's `packages/api/src/lib/event-bus.ts` uses a different interface (`NotificationRecipient`-based) and must be migrated as part of the `packages/events` extraction. |
| Booking pricing engine | `full-stack-cf-app: packages/api/src/routers/booking/services/pricing.ts` | ✅ Already pure functions | Move to `packages/pricing` |
| Booking availability/slots | `full-stack-cf-app: packages/api/src/routers/booking/slots.ts` | ✅ Already pure functions | Move to `packages/booking` |
| Booking action-policy | `full-stack-cf-app: packages/api/src/routers/booking/services/action-policy.ts` | ✅ Sophisticated | Move to `packages/booking` |
| Booking cancellation flows | `full-stack-cf-app: packages/api/src/routers/booking/cancellation/` | 🔄 Extract | Move to `packages/disputes` + workflow steps |
| Inline Zod contracts | `full-stack-cf-app: packages/api/src/contracts/` | 🔄 Extract & refactor | `packages/api-contract` (convert to `oc.route()`) |
| oRPC handlers | `full-stack-cf-app: packages/api/src/routers/booking/core.ts`, etc. | 🔄 Slim down | `packages/api` stays as thin wiring only |
| ai-chat, assistant, config, ui | `full-stack-cf-app: packages/` | ✅ Already exists | Already in turborepo-starter |
| notifications pipeline | `full-stack-cf-app: packages/notifications` | ✅ Already exists | Enhance with event-driven multi-pusher pattern |
| vitest-config, tailwind-config, env, proxy, e2e-web | `full-stack-cf-app: packages/` | ✅ Already exists | No changes needed |

---

## 2. Domain Package Mapping

### New Packages to Create

| Package | Source(s) | Interface Exposed | Dependencies | Priority |
|---|---|---|---|---|
| `packages/booking` | `cf-boat-api/src/services/BookingService.ts` (858 lines), `full-stack-cf-app` booking routers + services | `BookingService`, `createBookingWorkflow`, `cancelBookingWorkflow`, `rescheduleWorkflow`; event types | `@my-app/db`, `@my-app/events`, `@my-app/workflows`, `@my-app/pricing` | **P0** |
| `packages/pricing` | `cf-boat-api/src/services/PriceService.ts`, `PriceComponentsRepository`, `full-stack-cf-app` pricing engine | `PricingEngine`, `PricingProfile`, `applyPricingRules`; entity-agnostic — works for boats, tours, experiences | `@my-app/db` | **P0** |
| `packages/catalog` | `cf-boat-api/src/services/filterService.ts`, `ManageService.ts`, `InsertService.ts`, `BoatRepository` | `ListingService`, `FilterService`, `ListingRepository`; listing CRUD + search | `@my-app/db`, `@my-app/events` | **P0** |
| `packages/calendar` | `cf-boat-api/src/services/Calendar/CalendarService.ts`, `handlers/googleCalendarHandler.ts`, `full-stack-cf-app` calendar adapters | `CalendarProvider` interface, `CalendarAdapterRegistry`, `GoogleCalendarProvider` impl | `@my-app/db`, `@my-app/events` | **P1** |
| `packages/payments` | `cf-boat-api/src/services/PaymentService/`, `full-stack-cf-app` payment webhook adapters | `PaymentProvider` interface, `PaymentAdapterRegistry`, `CloudPaymentsProvider` impl, webhook handler | `@my-app/db`, `@my-app/events` | **P1** |
| `packages/disputes` | `cf-boat-api/src/services/DisputeService.ts`, `CancellationService.ts`, `full-stack-cf-app` cancellation flows | `DisputeService`, `CancellationService`, `processCancellationWorkflow`, `processDisputeWorkflow` | `@my-app/db`, `@my-app/events`, `@my-app/workflows`, `@my-app/booking` | **P1** |
| `packages/messaging` | `cf-boat-api/src/services/messaging/`, `full-stack-cf-app` channel adapters | `OutboundChannelAdapter`, `InboundChannelAdapter`, `ChannelAdapterRegistry`; Telegram, Avito, Email, Web, Sputnik impls | `@my-app/db`, `@my-app/events` | **P2** |
| `packages/workflows` | NEW (inspired by Medusa; built on our stack) | `createWorkflow`, `createStep`, `WorkflowContext`; retries, compensation, idempotency keys, execution logs | `@my-app/events`, `@my-app/db` (for execution log) | **P0** |
| `packages/events` | `cf-boat-api/src/events/`, `full-stack-cf-app/packages/api/src/lib/event-bus.ts` | `DomainEvent<T>`, `DomainEventMap`, `EventBus`, `registerEventPusher`; typed discriminated union events | — | **P0** |
| `packages/admin-zones` | NEW (inspired by Medusa injection zones) | `INJECTION_ZONES` constant map, `registerZoneComponent`; Svelte `ZoneRenderer` component lives in `packages/ui` (see note below) | `@my-app/ui` | **P2** |
| `packages/field-registry` | NEW (inspired by Medusa custom fields) | `CustomFieldRegistry`, `registerField`; Svelte `FieldRenderer` component lives in `packages/ui` (see note below); schema, zone, validation, permissions per field | `@my-app/ui`, `@my-app/auth` | **P2** |

### Existing Packages — Enhance In Place

| Package | Current State | Enhancement Needed |
|---|---|---|
| `packages/api-contract` | ✅ oRPC contract-first with `oc.route()` | Add boat, booking, catalog, calendar, payments, disputes, messaging contracts |
| `packages/api` | ✅ Implements `appContract` with middleware chain | Slim down: move business logic to domain packages; handlers become thin oRPC wiring (≤10 lines each) |
| `packages/db` | ✅ Drizzle schema (`marketplace.ts` already has listings, bookings, pricing, etc.) | Migrate remaining tables from legacy `src/db/`: `supportTickets`, `docks`, `blockedDays`, `pricingAdjustments` if not already present |
| `packages/queue` | ✅ pg-boss abstraction | Wire to `packages/workflows` for workflow step execution and retry logic |
| `packages/notifications` | ✅ Event → intent → delivery pipeline | Enhance: consume events from `packages/events` via multi-pusher `registerEventPusher` |
| `packages/auth` | ✅ Better Auth with role-based RBAC | No changes needed; already superior to legacy JWT approach |

---

## 3. Key Module Extraction Details

### 3.1 `packages/booking`

**Source:** `cf-boat-api/src/services/BookingService.ts` (858 lines of tangled logic).

**Problem:** BookingService.ts performs inline calendar sync, notification dispatch, and payment handling — all side effects that must become events.

**Target structure:**
```
packages/booking/src/
├── service.ts            # Core CRUD — create, read, update booking state machine
├── storefront.ts         # Public-facing booking flow (customer checkout)
├── slots.ts              # Availability slot calculation (already pure functions in full-stack-cf-app)
├── overlap.ts            # Availability overlap detection
├── expiration.ts         # Queue-driven booking expiry (enqueueBookingExpirationCheck)
├── policy.ts             # Action policy — cancellation/shift time windows per actor role
├── pricing-integration.ts # Calls @my-app/pricing; no pricing logic inline
├── workflows/
│   ├── create-booking.ts # createBookingWorkflow: reserve → charge → emit booking:created
│   ├── confirm-booking.ts # confirmBookingWorkflow: validate → confirm → emit booking:confirmed
│   ├── cancel-booking.ts  # cancelBookingWorkflow: policy check → refund → emit booking:cancelled
│   └── reschedule.ts     # rescheduleWorkflow: overlap check → reprice → dual-approve → emit booking:rescheduled
├── events.ts             # Event type constants: booking:created, booking:confirmed, booking:cancelled, etc.
├── repository.ts         # BookingRepository — Drizzle queries only, no business logic
└── index.ts              # Public API surface
```

**Event emissions (side effects must NOT be inline):**
- `booking:created` → calendar sync, customer confirmation email
- `booking:confirmed` → owner notification, payout schedule
- `booking:cancelled` → refund, calendar deletion, notification
- `booking:contact-updated` → re-sync external channels

### 3.2 `packages/pricing`

**Source:** `cf-boat-api/src/services/PriceService.ts`, `PriceComponentsRepository`; `full-stack-cf-app` pricing engine (already pure functions).

**Problem:** PriceService is coupled to the boat entity. Make the pricing engine entity-agnostic for future tour/experience support.

**Target structure:**
```
packages/pricing/src/
├── engine.ts             # Core pricing calculation — entity-agnostic (listing, tour, experience)
├── profile.ts            # Pricing profiles — rules per listing type
├── rules.ts              # Pricing rule evaluation (seasonal, discount, minimum)
├── adjustments.ts        # Dynamic adjustments (surcharges, concessions)
├── repository.ts         # PriceComponentsRepository — Drizzle queries only
└── index.ts
```

### 3.3 `packages/catalog`

**Source:** `cf-boat-api/src/services/filterService.ts`, `ManageService.ts`, `InsertService.ts`, `BoatRepository`.

**Target structure:**
```
packages/catalog/src/
├── listing-service.ts    # CRUD for listings (boats, docks, experiences)
├── filter-service.ts     # Search filters and query building
├── manage-service.ts     # Owner management operations
├── insert-service.ts     # Bulk/import operations
├── repository.ts         # BoatRepository (rename to ListingRepository)
└── index.ts
```

### 3.4 `packages/calendar`

**Source:** `cf-boat-api/src/services/Calendar/CalendarService.ts`, `handlers/googleCalendarHandler.ts`; `full-stack-cf-app` calendar adapters (production-grade — move as-is).

**Target structure:**
```
packages/calendar/src/
├── provider.ts           # CalendarProvider interface (create, update, delete events, list busy slots)
├── registry.ts           # CalendarAdapterRegistry
├── adapters/
│   ├── google.ts         # GoogleCalendarProvider (OAuth2, event mapping)
│   ├── manual.ts         # ManualCalendarProvider (internal blocked days)
│   └── fake.ts           # FakeCalendarProvider (tests)
├── sync/                 # Calendar sync orchestration (event-driven: booking:confirmed → sync)
├── application/          # Application-layer calendar queries (availability windows)
└── index.ts
```

**The CalendarProvider interface:**
```typescript
export interface CalendarProvider {
  createEvent(params: CalendarEventParams): Promise<CalendarEvent>
  updateEvent(id: string, params: Partial<CalendarEventParams>): Promise<CalendarEvent>
  deleteEvent(id: string): Promise<void>
  listBusySlots(range: DateRange): Promise<DateRange[]>
}
```

### 3.5 `packages/payments`

**Source:** `cf-boat-api/src/services/PaymentService/`; `full-stack-cf-app` payment webhook adapters (production-grade — move as-is).

**Target structure:**
```
packages/payments/src/
├── provider.ts           # PaymentProvider interface (charge, refund, capture, cancel)
├── registry.ts           # PaymentAdapterRegistry
├── adapters/
│   └── cloudpayments.ts  # CloudPaymentsProvider (see CloudPayments.md for API reference)
├── webhook-handler.ts    # Inbound webhook processing → emit payment:captured, payment:failed
└── index.ts
```

**The PaymentProvider interface:**
```typescript
// All monetary amounts are integer kopeks (1 RUB = 100 kopeks) to avoid floating-point rounding errors.
export interface PaymentProvider {
  charge(params: ChargeParams): Promise<PaymentResult>   // ChargeParams.amountKopeks: number
  refund(paymentId: string, amountKopeks: number): Promise<RefundResult>  // integer kopeks
  capture(paymentId: string): Promise<CaptureResult>
  cancel(paymentId: string): Promise<void>
}
```

### 3.6 `packages/disputes`

**Source:** `cf-boat-api/src/services/DisputeService.ts`, `CancellationService.ts`; `full-stack-cf-app` cancellation flows.

> **Boundary with `packages/booking`:** `packages/booking` contains the `cancel-booking` workflow step that transitions a booking's status to `cancelled` and emits `booking:cancelled`. `packages/disputes` contains the _policy enforcement and refund computation_ workflows that sit _above_ the booking status change: they check the cancellation window policy, compute the refund amount, call `packages/payments` for the refund, and only then invoke the booking cancellation step. This one-directional dependency (`disputes → booking`) avoids a circular reference.

**Target structure:**
```
packages/disputes/src/
├── cancellation-service.ts      # Cancellation request, review, and processing
├── dispute-service.ts           # Dispute opening, evidence collection, resolution
├── refund-service.ts            # Refund calculation and dispatch
├── workflows/
│   ├── process-cancellation.ts  # policy check → compute refund → payments.refund → booking.cancel → emit
│   └── process-dispute.ts       # openDispute → review → arbitrate → emit
└── index.ts
```

### 3.7 `packages/messaging`

**Source:** `cf-boat-api/src/services/messaging/`; `full-stack-cf-app` channel adapters (5 channels — move as-is).

**Target structure:**
```
packages/messaging/src/
├── outbound-adapter.ts            # OutboundChannelAdapter interface
├── inbound-adapter.ts             # InboundChannelAdapter interface
├── registry.ts                    # ChannelAdapterRegistry
├── adapters/
│   ├── telegram/
│   │   ├── webhook-service.ts     # TelegramWebhookService
│   │   ├── support-service.ts     # TelegramSupportService
│   │   └── normalizers/           # Message normalizers for inbound Telegram payloads
│   ├── avito.ts                   # Avito channel adapter
│   ├── email.ts                   # Email channel adapter
│   ├── web.ts                     # Web/in-app channel adapter
│   └── sputnik.ts                 # Sputnik8 channel adapter
├── intake-service.ts              # IntakeService — routes inbound messages to correct handler
└── index.ts
```

### 3.8 `packages/workflows` (NEW)

**Inspired by Medusa; built on our stack — not a dependency on `@medusajs/workflows-sdk`.**

> **Why not use Medusa's workflow package directly?**
> Medusa's `@medusajs/workflows-sdk` is tightly coupled to Medusa's Module Registry, `MedusaContainer`, and the `@medusajs/orchestration` Redis-backed engine. Our stack uses pg-boss (via `packages/queue`), Drizzle ORM, and oRPC — none of which integrate with Medusa's container system. Additionally, Medusa's workflow engine adds ~2 MB of transitive dependencies. We adopt the *concept* (step + compensation + idempotency key) and implement a minimal version that integrates natively with our `packages/queue` and `packages/db` execution log without external orchestration infrastructure.

```typescript
// packages/workflows/src/types.ts
export interface WorkflowContext {
  organizationId: string
  actorUserId?: string
  idempotencyKey: string
  eventBus: EventBus
}

export interface StepDef<TIn, TOut> {
  name: string
  invoke: (input: TIn, ctx: WorkflowContext) => Promise<TOut>
  compensate?: (output: TOut, ctx: WorkflowContext) => Promise<void>
}

// packages/workflows/src/create-step.ts
export const createStep = <TIn, TOut>(
  name: string,
  invoke: StepDef<TIn, TOut>["invoke"],
  compensate?: StepDef<TIn, TOut>["compensate"]
): StepDef<TIn, TOut> => ({ name, invoke, compensate })

// packages/workflows/src/create-workflow.ts
// The engine invokes each step in sequence, tracks completed steps with their outputs,
// and on failure iterates them in reverse order calling compensate() to roll back.
export const createWorkflow = <TIn, TOut>(
  name: string,
  buildSteps: (ctx: WorkflowContext) => Array<StepDef<unknown, unknown>>,
  run: (steps: Array<StepDef<unknown, unknown>>, input: TIn, ctx: WorkflowContext) => Promise<TOut>
) => ({
  name,
  execute: async (input: TIn, ctx: WorkflowContext) => {
    const steps = buildSteps(ctx)
    const completed: Array<{ step: StepDef<unknown, unknown>; output: unknown }> = []
    try {
      const output = await run(steps, input, ctx)
      return { success: true as const, output }
    } catch (error) {
      // Compensate completed steps in reverse order
      for (const { step, output } of completed.reverse()) {
        if (step.compensate) {
          await step.compensate(output, ctx).catch(() => {
            // Log compensation failure; do not throw — best-effort rollback
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

**Workflow execution log table** (add to `packages/db`):
```
workflow_execution (id, workflow_name, idempotency_key, status, input_snapshot, output_snapshot, error, created_at, completed_at)
workflow_step_log  (id, execution_id, step_name, status, input_snapshot, output_snapshot, error, started_at, completed_at)
```

### 3.9 `packages/events` (upgrade from legacy eventBus)

**Source:** `cf-boat-api/src/events/`; `full-stack-cf-app` `DomainEvent<T>` + `DomainEventMap` (already typed — better than legacy, move as-is).

> **Migration path for existing `packages/api/src/lib/event-bus.ts`:** This repo's current `EventBus` class collects `NotificationRecipient[]` objects and flushes them to the notifications pipeline. It is a different interface from the typed `DomainEvent<T>` system. Migration must be done in two steps to avoid breaking existing consumers:
> 1. **Wave 0:** Create `packages/events` with the new `DomainEvent<T>` interface. Register a compatibility pusher that maps each new `DomainEvent` to the existing `NotificationRecipient` format and calls the existing notifications pipeline. New domain packages use `packages/events` exclusively.
> 2. **Wave 1:** Once `packages/booking` and `packages/catalog` emit via `packages/events`, remove the old `EventBus` class from `packages/api/src/lib/event-bus.ts` and delete the compatibility pusher. All notification flows now go through the event-driven pipeline.

**Enhancement:** Add multi-pusher registration so modules self-register side-effect handlers without coupling. Export `clearEventPushers` for test isolation (prevents pushers registered in one test from leaking into another):

```typescript
// packages/events/src/event-bus.ts
type EventPusher = (event: DomainEvent, queue?: QueueProducer) => Promise<void>

const pushers: EventPusher[] = []

export const registerEventPusher = (pusher: EventPusher): void => {
  pushers.push(pusher)
}

/** For use in tests only — clears all registered pushers to prevent cross-test pollution. */
export const clearEventPushers = (): void => {
  pushers.length = 0
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

> **Test isolation rule:** Unit tests for domain packages must call `clearEventPushers()` in `beforeEach` (or use a mock `EventBus` injected via `WorkflowContext`) so that side-effect pushers from other packages do not fire unexpectedly.

**Event map (typed discriminated union):**
```typescript
export interface DomainEventMap {
  "booking:created":          { bookingId: string; listingId: string; customerId: string }
  "booking:confirmed":        { bookingId: string; ownerId: string }
  "booking:cancelled":        { bookingId: string; reason: string; refundAmount: number }
  "booking:contact-updated":  { bookingId: string; contactDetails: ContactDetails }
  "payment:captured":         { bookingId: string; paymentId: string; amount: number }
  "payment:failed":           { bookingId: string; paymentId: string; error: string }
  "dispute:opened":           { disputeId: string; bookingId: string }
  "dispute:resolved":         { disputeId: string; resolution: string }
  "calendar:sync-requested":  { bookingId: string; calendarId: string }
}
```

### 3.10 `packages/admin-zones` (NEW)

**Inspired by Medusa admin injection zones; adapted for SvelteKit.**

> **Note on Svelte components:** Per the project architecture rule ("Keep shared design system pieces in `packages/ui`"), the Svelte `ZoneRenderer` component that renders registered zone widgets belongs in `packages/ui`. `packages/admin-zones` exports only the TypeScript registry logic (zone constants, `registerZoneComponent`, and the `InjectionZone` type). `apps/web` imports both.

```typescript
// packages/admin-zones/src/constants.ts  (pure TypeScript — no Svelte dependency)
export const INJECTION_ZONES = [
  // Booking management
  "booking.list.before",       "booking.list.after",
  "booking.details.before",    "booking.details.after",
  "booking.details.side.before","booking.details.side.after",
  // Listing management
  "listing.list.before",       "listing.list.after",
  "listing.details.before",    "listing.details.after",
  // Helpdesk / support
  "ticket.details.before",     "ticket.details.after",
  // Dashboard
  "dashboard.overview.before", "dashboard.overview.after",
  // Pricing & availability
  "pricing.details.before",    "pricing.details.after",
] as const

export type InjectionZone = (typeof INJECTION_ZONES)[number]

// packages/admin-zones/src/registry.ts  (pure TypeScript — no Svelte dependency)
// ZoneComponent is opaque at the registry level; the concrete type (Svelte Component constructor)
// is resolved by packages/ui/ZoneRenderer at render time via a dynamic lookup map.
// Consumers register components as: registerZoneComponent("booking.details.after", MyPanel)
// The component value is typed as `object` to accept any Svelte 5 component without creating
// a framework dependency in this TypeScript-only package.
type ZoneComponent = object
export const registerZoneComponent = (zone: InjectionZone, component: ZoneComponent): void => {
  zoneRegistry.set(zone, [...(zoneRegistry.get(zone) ?? []), component])
}

// packages/ui/src/zone-renderer/ZoneRenderer.svelte  (Svelte component — lives in packages/ui)
// Imports zone registry from @my-app/admin-zones, renders registered components for a given zone.
```

### 3.11 `packages/field-registry` (NEW)

**Typed custom field registry — not just metadata blobs.**

> **Note on Svelte components:** The Svelte `FieldRenderer` component that renders field widgets belongs in `packages/ui`. `packages/field-registry` exports only pure TypeScript (field definitions, validation, permissions). This keeps design-system components centralized in `packages/ui` per the project rule.

```typescript
// packages/field-registry/src/types.ts  (pure TypeScript — no Svelte dependency)
export interface FieldDefinition<TValue = unknown> {
  name: string
  zone: InjectionZone           // Which admin zone renders this field
  schema: ZodSchema<TValue>     // Zod schema for validation
  rendererKey: string           // Key used by packages/ui FieldRenderer to look up the Svelte component
  permissions: string[]         // Required roles to view/edit
  defaultValue?: TValue
}

export const registerField = (field: FieldDefinition): void => {
  fieldRegistry.set(field.name, field)
}

// packages/ui/src/field-renderer/FieldRenderer.svelte  (Svelte component — lives in packages/ui)
// Imports field registry from @my-app/field-registry, resolves rendererKey to a Svelte component.
```

---

## 4. What Already Works Well (KEEP AS-IS)

| Item | Why Keep It |
|---|---|
| `packages/api-contract` — oRPC contract-first (`oc.route()`) | Already better than legacy Hono route definitions and inline Zod. The entire migration targets will use this pattern. |
| `packages/auth` — Better Auth with Drizzle adapter | Replaces legacy AuthService + JWT approach. Role model already supports `org_owner`, `org_admin`, `manager`, `agent`, `member`, `customer`. |
| `packages/db` — Drizzle setup + `marketplace.ts` schema | Rich schema already exists (listings, bookings, availability, pricing, affiliates, support). Enhance with missing tables, do not rewrite. |
| `packages/queue` — pg-boss abstraction | Already wired for async job processing. Extend for workflow step execution and retry scheduling. |
| `packages/notifications` — Event → intent → delivery pipeline | Already superior to legacy ad-hoc notification calls. Enhance by consuming from `packages/events` via multi-pusher. |
| `apps/server` — Hono server | Keep as transport layer. Add domain route trees (booking, catalog, payments, etc.) via thin oRPC procedure registration. |
| `DomainEvent<T>` + `DomainEventMap` typed system (from `full-stack-cf-app`) | Already a typed discriminated union — better than Medusa's generic event bus. Promote to `packages/events`. |
| Calendar/Channel/Payment adapter architecture (from `full-stack-cf-app`) | Production-grade provider pattern. Move the entire directory trees as-is; do not redesign. |
| Booking action-policy system (from `full-stack-cf-app`) | Time-window-based cancellation/shift policies per actor. More sophisticated than Mercur. Move to `packages/booking`. |

---

## 5. Migration Waves

### Wave 0 — Foundation (Weeks 1–2)

**Goal:** Lay the infrastructure that all domain packages depend on.

| Task | Package | Notes |
|---|---|---|
| Create `packages/workflows` | 🆕 New | `createStep`, `createWorkflow`, `WorkflowContext`, compensation engine, execution log schema |
| Create `packages/events` | 🆕 New | Promote `DomainEvent<T>` + `DomainEventMap` + `registerEventPusher` multi-pusher + `clearEventPushers` for tests |
| Add workflow execution log tables to `packages/db` | Existing | `workflow_execution`, `workflow_step_log` |
| Wire `packages/notifications` to `packages/events` | Existing | Replace direct call with `registerEventPusher` |

### Wave 1 — Core Commerce (Weeks 3–5)

**Goal:** Full marketplace transaction lifecycle in place.

| Task | Package | Source | Notes |
|---|---|---|---|
| Create `packages/pricing` | 🆕 New | `PriceService.ts` + pricing engine from `full-stack-cf-app` | Entity-agnostic engine; migrate pricing Drizzle tables |
| Create `packages/catalog` | 🆕 New | `filterService`, `ManageService`, `InsertService`, `BoatRepository` | Listing CRUD + search |
| Create `packages/booking` | 🆕 New | `BookingService.ts` + booking routers from `full-stack-cf-app` | Decompose 858-line service into workflow steps |
| Add booking contracts to `packages/api-contract` | Existing | Inline Zod → `oc.route()` | Boats + bookings contract tree |
| Slim down `packages/api` booking handlers | Existing | `routers/booking/core.ts` → 5-line thin wiring | Business logic moves to `packages/booking` |

### Wave 2 — Integrations (Weeks 6–8)

**Goal:** All external service integrations behind provider interfaces.

| Task | Package | Source | Notes |
|---|---|---|---|
| Create `packages/calendar` | 🆕 New | CalendarService + GoogleCalendarHandler + adapters from `full-stack-cf-app` | Move adapter tree as-is; add to event subscriber |
| Create `packages/payments` | 🆕 New | PaymentService + CloudPayments webhook adapter from `full-stack-cf-app` | Move adapter tree as-is; see CloudPayments.md |
| Create `packages/messaging` | 🆕 New | Telegram services + channel adapters from `full-stack-cf-app` | Move 5-channel adapter registry as-is |
| Register calendar pusher in `packages/events` | Existing | — | `booking:confirmed` → calendar sync |
| Register payments pusher in `packages/events` | Existing | — | `booking:confirmed` → payout schedule |

### Wave 3 — Operations (Weeks 9–11)

**Goal:** Disputes, vendor tools, and admin extensibility.

| Task | Package | Source | Notes |
|---|---|---|---|
| Create `packages/disputes` | 🆕 New | `DisputeService` + `CancellationService` + cancellation flows from `full-stack-cf-app` | Workflow-based cancellation and dispute resolution |
| Create `packages/admin-zones` | 🆕 New | — | `INJECTION_ZONES` constants + TypeScript registry; `ZoneRenderer` Svelte component goes in `packages/ui` |
| Create `packages/field-registry` | 🆕 New | — | `FieldDefinition`, `registerField`; `FieldRenderer` Svelte component goes in `packages/ui` |
| Add vendor contract tree | `packages/api-contract` | — | `api-contract/vendor/` with vendor-scoped procedures |
| Admin UI injection zones | `apps/web` | — | Wire `packages/admin-zones` + `packages/ui/ZoneRenderer` into SvelteKit page components |
| Custom field rendering | `apps/web` | — | Wire `packages/field-registry` + `packages/ui/FieldRenderer` into booking/listing detail pages |
| Commission module | extend `packages/pricing` | Mercur-inspired | Platform fee + vendor payout calculation added to the pricing engine; no separate package needed since commission rules are a pricing concern |

---

## 6. Anti-Patterns to Avoid

The following patterns found in the legacy code MUST NOT be carried forward:

### ❌ Monolithic Service with Inline Side Effects
**Legacy:** `BookingService.ts` (858 lines) performs booking creation, calendar sync, Telegram notifications, and payment capture all in a single method.

```typescript
// ❌ LEGACY ANTI-PATTERN (do not carry forward)
async function confirmBooking(bookingId: string) {
  await db.update(bookings).set({ status: "confirmed" }).where(eq(bookings.id, bookingId))
  // Side effects inline — tightly coupled, untestable, no compensation
  await googleCalendar.events.insert({ ... })
  await telegramBot.sendMessage(chatId, "Your booking is confirmed!")
  await cloudPayments.charge({ amount, token })
}

// ✅ TARGET PATTERN
// Domain service: only state transition + event emission
async function confirmBooking(bookingId: string, ctx: WorkflowContext) {
  await db.update(bookings).set({ status: "confirmed" }).where(eq(bookings.id, bookingId))
  ctx.eventBus.emit("booking:confirmed", { bookingId })  // subscribers handle the rest
}

// Calendar module self-registers as a subscriber (no import in booking service)
registerEventPusher(async (event) => {
  if (event.type === "booking:confirmed") await calendarRegistry.getProvider(event.data.listingId).createEvent(...)
})

// Notifications module self-registers separately
registerEventPusher(async (event, queue) => {
  if (event.type === "booking:confirmed") await notificationsPusher({ input: mapEvent(event), queue })
})
```

**Rule:** Each domain service does ONE thing. Side effects (calendar sync, notifications, analytics) are emitted as domain events and handled by registered event pushers. Booking service emits `booking:confirmed`; calendar module and notification module subscribe independently.

### ❌ Direct External Service Calls Inside Business Logic
**Legacy:** `BookingService.ts` calls Google Calendar API directly, inline.

**Rule:** All external integrations go through a `Provider` interface with a registered implementation. The domain service calls `calendarRegistry.getProvider(listingId).createEvent(...)`. The registry resolves the correct provider. Business logic never imports `googleapis` or any external SDK directly.

### ❌ Role Checks Scattered Across Route Files
**Legacy:** `if (user.role !== 'admin') throw new Error('Forbidden')` repeated across `bookingRoutes.ts`, `manageRoutes.ts`, `paymentRoutes.ts`, etc.

**Rule:** All authorization goes through the oRPC middleware chain (`publicProcedure` → `sessionProcedure` → `protectedProcedure` → `organizationProcedure` → `organizationPermissionProcedure`). Domain services receive a pre-authorized context and do not perform role checks.

### ❌ Pricing Engine Coupled to the Boat Entity
**Legacy:** `PriceService.ts` imports `BoatRepository` and applies pricing logic specific to boat properties.

**Rule:** The pricing engine is entity-agnostic. It receives a `ListingType` + `PricingProfile` as inputs, not a `Boat` object. This allows pricing to work for future listing types (tours, experiences, docks) without code changes.

### ❌ Ad-hoc Compensation Logic in Route Handlers
**Legacy:** Compensation code (e.g., "if payment fails, release the availability reservation") is duplicated ad-hoc inside `try/catch` blocks in route handlers.

**Rule:** All multi-step operations with compensation requirements are expressed as `createWorkflow` with `createStep` + `compensate` functions. The workflow engine handles rollback automatically.

### ❌ Generic "shared" or "utils" Packages as Dumping Grounds
**Legacy:** `src/utils/` contains unrelated utilities (error handling, calendar utilities, role constants).

**Rule:** Every package has a single clear domain boundary. Utilities that don't belong in a domain package belong in the package that owns the concept (calendar utils → `packages/calendar`; role constants → `packages/auth`; error types → the package that defines the error).

### ❌ Inline Queue Calls Without Schema Validation
**Legacy:** Queue messages are published as raw objects without Zod validation.

**Rule:** All queue messages must be validated against a Zod schema before enqueue and after dequeue, using `safeParse`. Use explicit retry limits and a dead-letter queue strategy.

---

## 7. Dependency Graph (Target State)

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
                           └── @orpc/server, @orpc/openapi, @orpc/zod

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
                           └── @orpc/server

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

packages/events ───────────└── (no internal deps — foundational)

packages/admin-zones ──────└── @my-app/ui

packages/field-registry ───┬── @my-app/ui
                           └── @my-app/auth

packages/notifications ────┬── @my-app/db
                           ├── @my-app/queue
                           └── @my-app/events  (registered as event pusher)
```

---

## Consequences

### Positive
- **Clear domain boundaries**: Every package owns one domain; no shared utility dumping grounds.
- **Testability**: Pure domain services (no oRPC, no HTTP) are trivial to unit-test with a mock `EventBus`.
- **Extensibility**: New listing types (tours, experiences) reuse the pricing engine and booking workflow without modification.
- **Compensation safety**: Multi-step operations (charge + calendar create + notify) have automatic rollback via workflow compensation steps.
- **Provider swappability**: Replacing CloudPayments with Stripe requires only a new `PaymentProvider` implementation with no domain code changes.
- **Event-driven decoupling**: Calendar, notifications, and messaging teams can work independently once events are published.

### Negative / Trade-offs
- **Migration cost**: 11 weeks of phased extraction, with temporary duplication during transition.
- **Package proliferation**: Going from ~13 packages to ~24 packages increases `turbo.json` task coordination.
- **Workflow overhead**: Simple CRUD operations gain overhead from the workflow engine; reserve it for multi-step, compensation-requiring flows.
- **Team coordination**: Each domain package now has an explicit interface that other packages must respect. Contract breakage is caught at compile time (TypeScript) but requires coordination during extraction.

### Migration Safety Net
- During Wave 1 and Wave 2, existing `packages/api` handlers continue to function using the current implementation.
- Domain packages are extracted behind the existing API surface; no breaking changes to `apps/web` or `apps/server` until all handlers are re-wired.
- Each domain package ships with unit tests covering its core business logic before the `packages/api` handlers are re-wired.
