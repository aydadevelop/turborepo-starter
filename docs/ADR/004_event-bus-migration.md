# ADR-004: Architecture Alignment Gaps — Event Bus Migration & Related Wiring

**Date:** 2026-03-10
**Status:** Active — Wave 0 complete, Wave 1 pending
**Authors:** Platform Team
**Related:** [ADR-002: Architecture Patterns §3.1](./002_architecture-patterns.md#31-packagesevents) | [ADR-003: Missing Extractions](./003_missing-extractions-full-stack-cf-app.md)

---

## Table of Contents

1. [Context](#context)
2. [Current State (Wave 0 Baseline)](#current-state-wave-0-baseline)
3. [The Problem — Why the Old Bus Must Go](#the-problem--why-the-old-bus-must-go)
4. [Decision](#decision)
5. [Migration Plan — Wave 1](#migration-plan--wave-1)
   - [Step 1: Wire domain service events into packages/events](#step-1-wire-domain-service-events-into-packagesevents)
   - [Step 2: Register pushers at package startup](#step-2-register-pushers-at-package-startup)
   - [Step 3: Slim down API handlers](#step-3-slim-down-api-handlers)
   - [Step 4: Delete the old EventBus](#step-4-delete-the-old-eventbus)
6. [Concrete Diffs](#concrete-diffs)
7. [Packages Affected](#packages-affected)
8. [Consequences](#consequences)
9. [Full Alignment Audit — Non-Event Gaps](#full-alignment-audit--non-event-gaps)

---

## Context

ADR-002 §3.1 specified a two-wave migration path for the event bus:

> **Wave 0:** Create `packages/events` with the new `DomainEvent<T>` interface. Register a compatibility pusher that maps each new `DomainEvent` to the existing `NotificationRecipient` format. New domain packages use `packages/events` exclusively.
> **Wave 1:** Once `packages/booking` and `packages/catalog` emit via `packages/events`, remove the old `EventBus` class and delete the compatibility pusher.

As of 2026-03-10, **Wave 0 is complete** and **Wave 1 has not started**:

- `packages/events` is implemented correctly with `DomainEventMap`, `registerEventPusher`, `clearEventPushers`, and the structural `QueueProducer` interface.
- `packages/workflows` is implemented correctly with `createStep`, `createWorkflow`, `WorkflowContext` (which carries `eventBus: EventBus`).
- `packages/calendar` is implemented correctly with the `CalendarAdapter` interface and registry.
- **The old `packages/api/src/lib/event-bus.ts` is still live** and all domain side effects flow through it, not through `packages/events`.

---

## Current State (Wave 0 Baseline)

### The old `EventBus` (packages/api/src/lib/event-bus.ts)

```typescript
export class EventBus {
  #events: EventBusEvent[] = []

  emit(event: EventBusEvent): void {   // requires recipients[] to be non-empty upfront
    if (event.recipients.length === 0) return
    this.#events.push(event)
  }

  async flush(queue?: QueueProducer): Promise<void> {
    // Calls notificationsPusher directly — tightly coupled to one output channel
    for (const event of events) {
      await notificationsPusher({ input: { ... }, queue })
    }
  }
}
```

**Callers pattern** (packages/api/src/context.ts):
```typescript
// EventBus attached to context, flushed by flushEvents middleware after every handler
context.eventBus = new EventBus()
// ... handler runs ...
await context.eventBus.flush(context.notificationQueue)
```

**Handler-level violation** (packages/api/src/handlers/booking.ts — updateStatus):
```typescript
// Handler calls notificationsPusher DIRECTLY — bypasses even the old EventBus
await notificationsPusher({
  input: { organizationId: orgId, eventType: "booking.status.confirmed", ... },
  queue: context.notificationQueue,
})
```

### The new `packages/events` (correctly implemented, not yet wired)

```typescript
// packages/events/src/types.ts — DomainEventMap exists with correct event types:
"booking:created"     → { bookingId, listingId, customerId }
"booking:confirmed"   → { bookingId, ownerId }
"booking:cancelled"   → { bookingId, reason, refundAmountKopeks }
"payment:captured"    → { bookingId, paymentId, amountKopeks }
"dispute:opened"      → { disputeId, bookingId }
"calendar:sync-requested" → { bookingId, calendarId }
// ...etc
```

No package currently calls `registerEventPusher` or emits via `DomainEvent`.

---

## The Problem — Why the Old Bus Must Go

### 1. Notification coupling — not an event bus

The old `EventBus` is a notification queue, not a domain event bus. It requires callers to compute `recipients[]` before emitting, coupling business logic to delivery decisions. Side effects other than notifications (calendar sync, analytics, audit logs) cannot be added without modifying handlers.

### 2. Fat handlers violate the thin-handler rule

Because old EventBus is notification-only, handlers have taken to calling `notificationsPusher` directly (see `updateStatus` in `booking.ts`). The hard rule — handlers are ≤10 lines, no business logic — is broken.

### 3. Domain services bypass WorkflowContext

All current domain services take `db: Db` directly and emit no events:
```typescript
// Current (wrong):
export async function createBooking(input: CreateBookingInput, db: Db)
export async function confirmBooking(id: string, orgId: string, db: Db)

// Required by architecture:
export async function confirmBooking(id: string, ctx: WorkflowContext)
// → ctx.eventBus.emit({ type: "booking:confirmed", data: { bookingId: id, ownerId: ctx.actorUserId! } })
```

### 4. Calendar sync is never triggered

`packages/calendar` has a complete adapter and registry, but because no package calls `registerEventPusher`, `booking:confirmed` never triggers calendar event creation. The integration is dead.

### 5. Single pusher — scalability ceiling

Every new side effect (SMS, push notification, analytics, audit) requires a new direct call in a handler. The event-driven model exists to avoid exactly this.

---

## Decision

Execute Wave 1 of the migration plan from ADR-002 §3.1:

1. Thread `WorkflowContext` (carrying `eventBus: EventBus` from `packages/events`) into all domain service functions that cause side effects.
2. Have those services emit typed `DomainEvent` objects instead of calling `notificationsPusher` directly.
3. Register `packages/notifications` and `packages/calendar` as event pushers at application startup via `registerEventPusher`.
4. Slim API handlers down to ≤10 lines (build context → call service/workflow → return result).
5. Delete `packages/api/src/lib/event-bus.ts` and the `flushEvents` middleware once no callers remain.

The `buildRecipients` utility from the old file is worth preserving somewhere (e.g., `packages/notifications/src/recipients.ts`) since it provides useful deduplication logic.

---

## Migration Plan — Wave 1

### Step 1: Wire domain service events into packages/events

For each domain service that produces side-effect-worthy state changes, add `ctx: WorkflowContext` parameter and emit on the new event bus.

**Priority order** (highest coupling first):

| Service | Event(s) to emit |
|---|---|
| `packages/booking` — `createBooking` | `booking:created` |
| `packages/booking` — `updateBookingStatus` (→ confirmed) | `booking:confirmed` |
| `packages/booking` — `updateBookingStatus` (→ cancelled) | `booking:cancelled` |
| `packages/booking` — `applyCancellation` | `booking:cancelled` |
| `packages/payment` — `reconcileWebhookEvent` (→ captured) | `payment:captured` |
| `packages/payment` — `reconcileWebhookEvent` (→ failed) | `payment:failed` |
| `packages/disputes` — cancellation workflow | (already in workflow — verify ctx plumbing) |

Add `@my-app/events` to `packages/booking`, `packages/payment`, `packages/disputes` dependencies.

### Step 2: Register pushers at package startup

Each consuming package's `index.ts` calls `registerEventPusher` once:

```typescript
// packages/notifications/src/index.ts
import { registerEventPusher } from "@my-app/events"
import { notificationsPusher } from "./pusher"

registerEventPusher(async (event, queue) => {
  // Map typed DomainEvent → NotificationRecipientInput
  const input = mapDomainEventToNotificationInput(event)
  if (input) await notificationsPusher({ input, queue })
})
```

```typescript
// packages/calendar/src/index.ts  (currently only exports — add pusher registration)
import { registerEventPusher } from "@my-app/events"
import { syncBookingToCalendar, cancelCalendarEvent } from "./sync"

registerEventPusher(async (event) => {
  if (event.type === "booking:confirmed") await syncBookingToCalendar(event.data.bookingId)
  if (event.type === "booking:cancelled") await cancelCalendarEvent(event.data.bookingId)
})
```

The pusher registrations must execute before the first request is handled. In `apps/server/src/index.ts` (or the Hono startup), import each package's index to trigger registration side effects:

```typescript
import "@my-app/notifications"   // registers notifications pusher
import "@my-app/calendar"        // registers calendar pusher
```

### Step 3: Slim down API handlers

After services emit events, handlers lose all side-effect code:

```typescript
// packages/api/src/handlers/booking.ts — BEFORE (200+ lines, calls notificationsPusher)
updateStatus: organizationPermissionProcedure({ booking: ["update"] })
  .booking.updateStatus.handler(async ({ context, input }) => {
    const row = await updateBookingStatus({ ...input, organizationId: context.activeMembership.organizationId }, db)
    // ... 15 lines of inline notificationsPusher logic ...
    return formatBooking(row)
  })

// AFTER (≤10 lines — service handles the event, pusher handles the notification)
updateStatus: organizationPermissionProcedure({ booking: ["update"] })
  .booking.updateStatus.handler(async ({ context, input }) => {
    const ctx = buildWorkflowContext(context)
    const row = await updateBookingStatus({ ...input, organizationId: ctx.organizationId }, ctx)
    return formatBooking(row)
  })
```

`buildWorkflowContext(context)` is a small helper in `packages/api/src/context.ts` that constructs `WorkflowContext` from the oRPC request context.

### Step 4: Delete the old EventBus

Once no handler or service imports from `packages/api/src/lib/event-bus.ts`:

1. Delete `packages/api/src/lib/event-bus.ts`
2. Remove `flushEvents` middleware from `packages/api/src/index.ts` (or keep it as a no-op adapter if needed for the `context.eventBus` property — see below)
3. Update `packages/api/src/context.ts` to expose `context.eventBus` as an instance of the new `EventBus` from `packages/events`

```typescript
// packages/api/src/context.ts — AFTER
import { EventBus } from "@my-app/events"
import type { QueueProducer } from "@my-app/events"

export interface Context {
  // ...existing fields...
  eventBus: EventBus              // from @my-app/events, not @my-app/api/lib
  notificationQueue?: QueueProducer
}
```

The `flushEvents` middleware can be removed because the new `EventBus.emit()` runs pushers immediately (via `emitDomainEvent`) — there is no accumulation/flush cycle in `packages/events`.

---

## Concrete Diffs

### packages/booking/package.json — add events dependency
```json
"dependencies": {
  "@my-app/availability": "workspace:*",
  "@my-app/db": "workspace:*",
  "@my-app/events": "workspace:*",       ← ADD
  "@my-app/pricing": "workspace:*"
}
```

### packages/booking/src/booking-service.ts — thread WorkflowContext
```typescript
// BEFORE
export async function createBooking(input: CreateBookingInput, db: Db): Promise<BookingRow>

// AFTER
export async function createBooking(
  input: CreateBookingInput,
  db: Db,
  ctx: Pick<WorkflowContext, "eventBus" | "organizationId" | "actorUserId">
): Promise<BookingRow> {
  // ... existing logic ...
  await ctx.eventBus.emit({
    type: "booking:created",
    data: { bookingId: row.id, listingId: input.listingId, customerId: input.customerUserId },
  })
  return row
}
```

> **Note on signature:** Adding `ctx` as a third parameter (rather than replacing `db`) avoids churn in callers that don't need event emission (tests, scripts). The `db` parameter stays because repositories are injected explicitly in this codebase. For multi-step workflows, the step wraps the service call and contributes `ctx` from `WorkflowContext`.

---

## Packages Affected

| Package | Change |
|---|---|
| `packages/booking` | Add `@my-app/events` dep; thread `ctx` into `createBooking`, `updateBookingStatus`, `applyCancellation` |
| `packages/payment` | Add `@my-app/events` dep; emit `payment:captured`, `payment:failed` from `reconcileWebhookEvent` |
| `packages/disputes` | ✅ `cancellation-workflow.ts` already uses `ctx.eventBus.emit()` correctly — no changes needed |
| `packages/calendar` | ✅ `booking-lifecycle-sync.ts` already calls `registerEventPusher` — call `registerBookingLifecycleSync(db)` at startup |
| `packages/notifications` | ✅ `events-bridge.ts` has `registerNotificationEventPusher` — call it at startup |
| `packages/api` | Remove inline `notificationsPusher` calls from handlers; add `buildWorkflowContext` helper; update `context.ts` to instantiate `new EventBus()` from `@my-app/events` |
| `packages/api/src/lib/event-bus.ts` | **DELETE** (after all callers are migrated) |
| `apps/server/src/index.ts` | Call `registerBookingLifecycleSync(db)` and `registerNotificationEventPusher(queue)` at startup |

---

## Consequences

**Positive:**
- All side effects (notifications, calendar sync, future analytics/audit) are decoupled from handlers and driven by domain events.
- Adding a new side effect for any existing event requires only a new `registerEventPusher` — no handler changes.
- Handlers shrink to ≤10 lines, matching the hard rule in ADR-002.
- `packages/calendar`'s complete adapter/registry implementation becomes active.
- Tests can call `clearEventPushers()` in `beforeEach` for full isolation.

**Risks / mitigations:**
- `registerEventPusher` callbacks run synchronously in-process during the request. If a notification or calendar call is slow, it adds latency. **Mitigation:** pushers that do heavy work enqueue a job via `packages/queue` rather than doing the work inline.
- Boot order matters: pusher registrations must complete before the first request. **Mitigation:** explicit calls in `apps/server/src/index.ts` guarantee registration order.
- The old `EventBus.emit()` was a no-op when `recipients` was empty. The new `packages/events` `emitDomainEvent` always fans out to registered pushers. **Mitigation:** pushers must guard on `event.type` — only handle events they care about — which is the required pattern anyway.

---

## Full Alignment Audit — Non-Event Gaps

This section records the complete architecture alignment state as of 2026-03-10. Gaps discovered during audit of the live codebase against the skills (`domain-events`, `domain-packages`, `workflows`, `provider-adapters`) and ADR-002/ADR-003.

### What IS aligned (confirmed by code inspection)

| Package / Area | Evidence |
|---|---|
| `packages/events` | Correct: `DomainEventMap`, `registerEventPusher`, `clearEventPushers`, structural `QueueProducer` |
| `packages/workflows` | Correct: `createStep` with compensation, `createWorkflow` with reverse-order saga, `WorkflowContext` |
| `packages/calendar` adapter/registry | Correct: `CalendarAdapter` interface, `adapter-registry.ts` (register/get/clear), `GoogleCalendarAdapter`, `FakeCalendarAdapter`, `use-cases.ts` |
| `packages/calendar` booking sync | ✅ `booking-lifecycle-sync.ts` calls `registerEventPusher` and handles `booking:confirmed`, `booking:cancelled`, `booking:contact-updated` |
| `packages/disputes` | ✅ `processCancellationWorkflow` and `processDisputeWorkflow` both use `createStep`/`createWorkflow` and call `ctx.eventBus.emit()` correctly |
| `packages/notifications` events-bridge | ✅ `events-bridge.ts` has `registerNotificationEventPusher` wired to `DomainEventMap` types |
| `packages/booking` policy/slots/overlap | ✅ `action-policy.ts`, `slots.ts`, `overlap.ts` all implemented (ADR-003 §2.1 P0 gap filled) |
| `packages/pricing` incl. profile | ✅ `pricing-profile.ts` exists — ADR-003 §2.2 gap is filled |

### Gap 1 — `context.ts`: `eventBus` is `undefined` at runtime (bug)

**Severity: P0 — breaks all workflow execution**

`packages/api/src/context.ts` declares `eventBus?: EventBus` but `createContext()` never sets it:

```typescript
// Current (broken):
return {
  session,
  activeMembership,
  requestUrl,
  requestHostname,
  requestCookies,
  notificationQueue,
  recurringTaskQueue,
  // ← eventBus is never set
}
```

`processCancellationWorkflow` (and any future workflow) calls `ctx.eventBus.emit(...)` — this throws `TypeError: Cannot read properties of undefined` at runtime. Fix is part of the Wave 1 migration: instantiate `new EventBus()` from `@my-app/events` inside `createContext()`.

### Gap 2 — Pusher registration never called at server startup

**Severity: P0 — calendar sync and notifications are silently dead**

`registerBookingLifecycleSync(db)` is exported from `packages/calendar` but never called. `registerNotificationEventPusher(queue)` is exported from `packages/notifications/events-bridge` but never called. Domain events emitted by `packages/disputes` fan out to zero registered pushers.

**Fix:** In `apps/server/src/index.ts`:
```typescript
import { db } from "@my-app/db"
import { notificationQueue } from "./queue"           // existing producer
import { registerBookingLifecycleSync } from "@my-app/calendar"
import { registerNotificationEventPusher } from "@my-app/notifications/events-bridge"

registerBookingLifecycleSync(db)
registerNotificationEventPusher(notificationQueue)
```

### Gap 3 — `packages/payment`: no PaymentProvider interface or registry

**Severity: P1 — `provider-adapters` skill pattern not followed**

The `provider-adapters` skill requires:
```
packages/payment/src/
├── provider.ts       # PaymentProvider interface (charge, refund, capture, cancel)
├── registry.ts       # registerPaymentProvider, getPaymentProvider, resetPaymentRegistry
└── adapters/
    ├── cloudpayments.ts
    └── fake.ts
```

What currently exists in `packages/payment/src/`:
- `payment-service.ts` — DB config management (`connectPaymentProvider`, `reconcilePaymentWebhook`, `getOrgPaymentConfig`)
- `types.ts`, `index.ts`

The `PaymentWebhookAdapter` pattern lives in `packages/api/src/payments/webhooks/` (webhook *intake* side), but there is no `PaymentProvider` interface for the *charge/refund* side. The `applyRefundStep` in `packages/disputes` currently inserts a `bookingRefund` row (status: `requested`) but never calls a payment provider to actually process the refund. The CloudPayments charge/refund API is not wired anywhere in the target architecture.

**Required:** Extract `PaymentProvider` interface + registry + `CloudPaymentsProvider` adapter into `packages/payment/src/` per the skill template. The `applyRefundStep` in `packages/disputes` should call `getPaymentProvider(config.provider).refund(paymentId, amountKopeks)`.

### Gap 4 — `packages/booking`: no `workflows/` directory

**Severity: P1 — multi-step booking creation has no saga story**

ADR-001 §3.1 and the `domain-packages` skill specify:
```
packages/booking/src/workflows/
├── create-booking.ts    # reserve → charge → emit booking:created
├── confirm-booking.ts   # validate → confirm → emit booking:confirmed
├── cancel-booking.ts    # transition → emit booking:cancelled
└── reschedule.ts        # overlap check → reprice → emit booking:rescheduled
```

Currently `createBooking()` is a single flat function in `booking-service.ts` that calls `assertSlotAvailable` + `calculateQuote` + `db.insert` — no compensation story if the insert fails after availability is consumed, no `booking:created` event emitted.

**Required:** Wrap the booking creation path in `createBookingWorkflow` with steps: `reserveAvailabilityStep` (with compensate: release block), `chargePaymentStep` (with compensate: refund), `persistBookingStep`, then emit `booking:created`.

### Gap 5 — `packages/messaging` does not exist

**Severity: P2 — ADR-003 §1.2 pending**

`ChannelAdapterRegistry`, `TelegramAdapter`, `AvitoAdapter`, `EmailAdapter`, `WebAdapter`, `SputnikAdapter` are specified in ADR-003 §1.2. No `packages/messaging` directory exists. Inbound channel normalization and outbound dispatch are not extractable until this package is created.

### Gap 6 — Missing API contract routes and handlers

**Severity: P2 — feature surface incomplete**

Present in `packages/api-contract/src/routers/`: admin, availability, booking, consent, listing, notifications, payments, pricing, storefront, support, tasks, todo.

Missing per ADR-003 §3.1 / §3.3:

| Missing Contract | Missing Handler | Source in legacy |
|---|---|---|
| `routers/booking/affiliate.ts` | `handlers/booking/affiliate.ts` | `routers/booking/affiliate.ts` |
| `routers/booking/discount.ts` | `handlers/booking/discount.ts` | `routers/booking/discount/router.ts` |
| `routers/booking/shift.ts` | `handlers/booking/shift.ts` | `routers/booking/shift.ts` |
| `routers/booking/refund.ts` | `handlers/booking/refund.ts` | `routers/booking/refund.ts` |
| `routers/boat/amenity.ts` | `handlers/boat/amenity.ts` | `routers/boat/amenity.ts` |
| `routers/boat/asset.ts` | `handlers/boat/asset.ts` | `routers/boat/asset.ts` |
| `routers/boat/dock.ts` | `handlers/boat/dock.ts` | `routers/boat/dock.ts` |
| `routers/boat/min-duration.ts` | `handlers/boat/min-duration.ts` | `routers/boat/min-duration.ts` |
| `routers/calendar.ts` | `handlers/calendar.ts` | calendar application use-cases |

### Priority Summary

| # | Gap | Severity | Blocks |
|---|---|---|---|
| 1 | `context.ts` never instantiates `EventBus` | **P0** | All workflow event emission |
| 2 | Pusher registration never called at startup | **P0** | Calendar sync, notifications |
| 3 | `packages/payment` no PaymentProvider interface | **P1** | Actual charge/refund execution |
| 4 | `packages/booking` no `workflows/` directory | **P1** | Booking saga/compensation |
| 5 | `packages/messaging` missing | **P2** | Multi-channel outbound |
| 6 | Missing API routes and handlers | **P2** | Feature completeness |
