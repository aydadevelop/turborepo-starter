# ADR-001: Legacy Extraction Plan — `cf-boat-api` & `full-stack-cf-app` → turborepo-starter

**Date:** 2026-03-09
**Status:** Proposed
**Authors:** Platform Team
**Related:** [ADR-002: Architecture Patterns (Medusa/Mercur)](./002_architecture-patterns.md)

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
   - [3.8 packages/events, packages/workflows, packages/admin-zones, packages/field-registry](#38-packagesevents-packagesworkflows-packagesadmin-zones-packagesfield-registry)
6. [4. What Already Works Well (KEEP AS-IS)](#4-what-already-works-well-keep-as-is)
7. [5. Migration Waves](#5-migration-waves)
8. [Consequences](#consequences)

---

## Context

We are building a travel-commerce marketplace (similar to Sputnik8/Tripster) and are migrating domain logic from two legacy codebases into this turborepo-starter monorepo:

1. **`aydadevelop/cf-boat-api`** — A Cloudflare Workers Hono-based API (approximately 80% already extracted to `full-stack-cf-app`). Contains rich domain logic in `src/services/`, `src/repositories/`, `src/handlers/`, `src/events/`, `src/middleware/`, `src/validation/`, `src/types/`, `src/db/`, `src/clients/`, and `src/utils/`.

2. **`aydadevelop/full-stack-cf-app`** — An intermediate monorepo (npm-based) that acts as the current staging ground and is being superseded by this turborepo. Contains mature provider/adapter patterns (CalendarAdapter, PaymentWebhookAdapter, ChannelAdapterRegistry), a typed DomainEvent system, and a rich `packages/api/src/routers/booking/` hierarchy.

3. **`aydadevelop/turborepo-starter`** (THIS REPO — the target). Already has: oRPC contract-first approach, Turborepo, Bun, Better Auth, Drizzle, Hono, SvelteKit 5, and the marketplace Drizzle schema.

The architectural principles guiding the target package design — including the Medusa/Mercur-inspired patterns, hard rules, anti-patterns, and the design of new foundational packages (`packages/workflows`, `packages/events`, `packages/admin-zones`, `packages/field-registry`) — are documented separately in [ADR-002](./002_architecture-patterns.md).

---

## Decision

We will execute a phased extraction of all domain logic from both legacy repositories into clearly bounded packages within this monorepo, following a contract-first, event-driven, provider-based architecture as defined in [ADR-002](./002_architecture-patterns.md).

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

### New Packages to Create (Legacy-Derived)

The following packages are created by extracting and refactoring code from the legacy repositories:

| Package | Source(s) | Interface Exposed | Dependencies | Priority |
|---|---|---|---|---|
| `packages/booking` | `cf-boat-api/src/services/BookingService.ts` (858 lines), `full-stack-cf-app` booking routers + services | `BookingService`, `createBookingWorkflow`, `cancelBookingWorkflow`, `rescheduleWorkflow`; event types | `@my-app/db`, `@my-app/events`, `@my-app/workflows`, `@my-app/pricing` | **P0** |
| `packages/pricing` | `cf-boat-api/src/services/PriceService.ts`, `PriceComponentsRepository`, `full-stack-cf-app` pricing engine | `PricingEngine`, `PricingProfile`, `applyPricingRules`; entity-agnostic — works for boats, tours, experiences | `@my-app/db` | **P0** |
| `packages/catalog` | `cf-boat-api/src/services/filterService.ts`, `ManageService.ts`, `InsertService.ts`, `BoatRepository` | `ListingService`, `FilterService`, `ListingRepository`; listing CRUD + search | `@my-app/db`, `@my-app/events` | **P0** |
| `packages/calendar` | `cf-boat-api/src/services/Calendar/CalendarService.ts`, `handlers/googleCalendarHandler.ts`, `full-stack-cf-app` calendar adapters | `CalendarProvider` interface, `CalendarAdapterRegistry`, `GoogleCalendarProvider` impl | `@my-app/db`, `@my-app/events` | **P1** |
| `packages/payments` | `cf-boat-api/src/services/PaymentService/`, `full-stack-cf-app` payment webhook adapters | `PaymentProvider` interface, `PaymentAdapterRegistry`, `CloudPaymentsProvider` impl, webhook handler | `@my-app/db`, `@my-app/events` | **P1** |
| `packages/disputes` | `cf-boat-api/src/services/DisputeService.ts`, `CancellationService.ts`, `full-stack-cf-app` cancellation flows | `DisputeService`, `CancellationService`, `processCancellationWorkflow`, `processDisputeWorkflow` | `@my-app/db`, `@my-app/events`, `@my-app/workflows`, `@my-app/booking` | **P1** |
| `packages/messaging` | `cf-boat-api/src/services/messaging/`, `full-stack-cf-app` channel adapters | `OutboundChannelAdapter`, `InboundChannelAdapter`, `ChannelAdapterRegistry`; Telegram, Avito, Email, Web, Sputnik impls | `@my-app/db`, `@my-app/events` | **P2** |

### New Packages to Create (Architectural — No Legacy Source)

These packages have no direct legacy equivalent. Their design is fully specified in [ADR-002](./002_architecture-patterns.md):

| Package | Design ADR | Purpose | Priority |
|---|---|---|---|
| `packages/events` | [ADR-002 §3.1](./002_architecture-patterns.md#31-packagesevents) | Typed `DomainEvent<T>` bus + multi-pusher registry | **P0** |
| `packages/workflows` | [ADR-002 §3.2](./002_architecture-patterns.md#32-packagesworkflows) | `createStep`/`createWorkflow` with compensation + execution log | **P0** |
| `packages/admin-zones` | [ADR-002 §3.3](./002_architecture-patterns.md#33-packagesadmin-zones) | Typed injection zone registry for pluggable admin UI | **P2** |
| `packages/field-registry` | [ADR-002 §3.4](./002_architecture-patterns.md#34-packagesfield-registry) | Typed custom field definitions with Zod schema + permissions | **P2** |

### Existing Packages — Enhance In Place

| Package | Current State | Enhancement Needed |
|---|---|---|
| `packages/api-contract` | ✅ oRPC contract-first with `oc.route()` | Add boat, booking, catalog, calendar, payments, disputes, messaging contracts |
| `packages/api` | ✅ Implements `appContract` with middleware chain | Slim down: move business logic to domain packages; handlers become thin oRPC wiring (≤10 lines each) |
| `packages/db` | ✅ Drizzle schema (`marketplace.ts` already has listings, bookings, pricing, etc.) | Migrate remaining tables from legacy `src/db/`: `supportTickets`, `docks`, `blockedDays`, `pricingAdjustments` if not already present |
| `packages/queue` | ✅ pg-boss abstraction | Used for background tasks (e.g., booking expiry checks, recurring reminders). Workflow steps are in-process — `packages/queue` is NOT the workflow step runner. |
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
│   ├── cancel-booking.ts  # cancelBookingStep: transition booking status → cancelled → emit booking:cancelled
│   └── reschedule.ts     # rescheduleWorkflow: overlap check → reprice → dual-approve → emit booking:rescheduled
├── events.ts             # Event type constants: booking:created, booking:confirmed, booking:cancelled, etc.
├── repository.ts         # BookingRepository — Drizzle queries only, no business logic
└── index.ts              # Public API surface
```

**Event emissions (side effects must NOT be inline):**
- `booking:created` → calendar sync, customer confirmation email
- `booking:confirmed` → owner notification, payout schedule
- `booking:cancelled` → calendar deletion, notification (refund is a prerequisite in `packages/disputes`, not a downstream effect)
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

### 3.8 `packages/events`, `packages/workflows`, `packages/admin-zones`, `packages/field-registry`

These are new packages with no direct legacy source. Their full design — interfaces, implementation patterns, and rationale — is in [ADR-002](./002_architecture-patterns.md).

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
| Register calendar pusher | `packages/calendar` | — | Self-register via `registerEventPusher` in `packages/calendar/src/index.ts`: `booking:confirmed` → calendar sync |
| Register payments pusher | `packages/payments` | — | Self-register via `registerEventPusher` in `packages/payments/src/index.ts`: `booking:confirmed` → payout schedule |

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

## Consequences

### Positive
- **Clear domain boundaries**: Every package owns one domain extracted directly from a legacy module; no shared utility dumping grounds.
- **Testability**: Pure domain services (no oRPC, no HTTP) are trivial to unit-test with a mock `EventBus`.
- **Extensibility**: New listing types (tours, experiences) reuse the pricing engine and booking workflow without modification.
- **Provider swappability**: Replacing CloudPayments with Stripe requires only a new `PaymentProvider` implementation with no domain code changes.

### Negative / Trade-offs
- **Migration cost**: 11 weeks of phased extraction, with temporary duplication during transition.
- **Package proliferation**: Going from ~13 packages to ~24 packages increases `turbo.json` task coordination.
- **Team coordination**: Each domain package has an explicit interface that other packages must respect. Contract breakage is caught at compile time (TypeScript) but requires coordination during extraction.

### Migration Safety Net
- During Wave 1 and Wave 2, existing `packages/api` handlers continue to function using the current implementation.
- Domain packages are extracted behind the existing API surface; no breaking changes to `apps/web` or `apps/server` until all handlers are re-wired.
- Each domain package ships with unit tests covering its core business logic before the `packages/api` handlers are re-wired.
