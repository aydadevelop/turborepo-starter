---
name: domain-events
description: >
  Emit and subscribe to domain events using packages/events — the typed DomainEvent
  bus with multi-pusher registration. Use when: adding a new event type to DomainEventMap,
  registering a module as an event subscriber (registerEventPusher), emitting events
  from a domain service, writing tests that involve the event bus, or migrating from
  the old EventBus class in packages/api/src/lib/event-bus.ts.
  Trigger terms: domain event, registerEventPusher, clearEventPushers, DomainEventMap,
  event-driven, event subscriber, booking:created, emit event.
---

# Domain Events (`packages/events`)

> **Status:** `packages/events` is live and is the current repo event bus.
> Booking lifecycle emission now happens in `packages/booking`, and server-side subscribers are registered from `apps/server/src/bootstrap.ts`.
> Use this skill for new event types, subscriber registration, or tests that need `clearEventPushers()` / `registerEventPusher()`.

## Core concepts

- **`DomainEventMap`** — Typed discriminated union of all event types and their payloads.
- **`registerEventPusher`** — Modules self-register side-effect handlers at startup; no central import chain needed.
- **`clearEventPushers`** — Test utility. Call in `beforeEach` to prevent cross-test pollution.
- **`QueueProducer`** — Defined as a local structural interface inside `packages/events` (dependency inversion). The concrete `PgBossProducer` from `@my-app/queue/producer` satisfies it structurally.

## Package structure

```
packages/events/src/
├── types.ts          # DomainEventMap + DomainEvent union type
├── event-bus.ts      # registerEventPusher, clearEventPushers, emitDomainEvent, EventBus class
└── index.ts          # Public exports
```

## Defining a new event type

Add to `DomainEventMap` in `packages/events/src/types.ts`:

```typescript
export interface DomainEventMap {
  // existing events
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

// Derived union — do NOT hand-write this
export type DomainEvent = {
  [K in keyof DomainEventMap]: { type: K; data: DomainEventMap[K] }
}[keyof DomainEventMap]
```

**Rule:** Each event payload must be self-contained — include all IDs needed by subscribers.
Subscribers must NOT query context from the emitting service; they use the payload directly.

## Emitting an event

Domain services emit events via `WorkflowContext.eventBus`. Never import an emitter module directly — the bus is injected:

```typescript
// packages/booking/src/service.ts
import type { WorkflowContext } from "@my-app/workflows"

export async function confirmBooking(
  bookingId: string,
  ctx: WorkflowContext
): Promise<void> {
  await db.update(bookings).set({ status: "confirmed" }).where(eq(bookings.id, bookingId))

  // Emit — subscribers handle all side effects
  ctx.eventBus.emit({ type: "booking:confirmed", data: { bookingId, ownerId: ctx.actorUserId! } })
}
```

## Registering a pusher (subscriber)

Call `registerEventPusher` once at application startup (in the package's `index.ts`):

```typescript
// packages/calendar/src/index.ts
import { registerEventPusher } from "@my-app/events"
import { syncCalendarForBooking, deleteCalendarEvent } from "./sync"

registerEventPusher(async (event) => {
  if (event.type === "booking:confirmed") {
    await syncCalendarForBooking(event.data.bookingId)
  }
  if (event.type === "booking:cancelled") {
    await deleteCalendarEvent(event.data.bookingId)
  }
})
```

```typescript
// packages/notifications/src/index.ts
import { registerEventPusher } from "@my-app/events"
import { notificationsPusher } from "@my-app/notifications/pusher"

registerEventPusher(async (event, queue) => {
  // Map domain event → NotificationRecipientInput, then push
  await notificationsPusher({ input: mapEventToNotification(event), queue })
})
```

**Rule:** One pusher function per module concern. Do not merge unrelated side effects into one pusher.

## Emitting from within the event bus implementation

```typescript
// packages/events/src/event-bus.ts

/** Minimal structural interface — satisfied by PgBossProducer without importing @my-app/queue */
export interface QueueProducer {
  send(message: unknown, options?: { delaySeconds?: number }): Promise<void>
}

type EventPusher = (event: DomainEvent, queue?: QueueProducer) => Promise<void>

const pushers: EventPusher[] = []

export const registerEventPusher = (pusher: EventPusher): void => {
  pushers.push(pusher)
}

/** Test-only. Call in beforeEach to reset pusher registrations. */
export const clearEventPushers = (): void => {
  pushers.length = 0
}

export const emitDomainEvent = async (
  event: DomainEvent,
  queue?: QueueProducer
): Promise<void> => {
  // allSettled so one failing pusher cannot block others — each pusher must catch its own errors
  await Promise.allSettled(pushers.map((p) => p(event, queue)))
}

/**
 * Thin class wrapper used as WorkflowContext.eventBus.
 * Constructed at the oRPC handler boundary and injected into domain services.
 */
export class EventBus {
  constructor(private readonly queue?: QueueProducer) {}

  async emit(event: DomainEvent): Promise<void> {
    await emitDomainEvent(event, this.queue)
  }
}
```

## Testing

```typescript
// packages/booking/src/__tests__/confirm-booking.test.ts
import { clearEventPushers, registerEventPusher } from "@my-app/events"
import { vi, beforeEach, expect, it } from "vitest"
import { confirmBooking } from "../service"

beforeEach(() => {
  clearEventPushers() // prevent pushers from other test files from firing
})

it("emits booking:confirmed on success", async () => {
  const pusher = vi.fn()
  registerEventPusher(pusher)

  const ctx = makeMockWorkflowContext()
  await confirmBooking("bkg-1", ctx)

  expect(pusher).toHaveBeenCalledWith(
    expect.objectContaining({ type: "booking:confirmed", data: expect.objectContaining({ bookingId: "bkg-1" }) }),
    undefined
  )
})
```

## Migration: old EventBus → packages/events

**Wave 0 compatibility pusher** (temporary bridge — delete in Wave 1):

```typescript
// packages/events/src/compat-pusher.ts
// Deleted once packages/booking and packages/catalog fully emit via packages/events.
import { buildRecipients } from "@my-app/api/lib/event-bus" // legacy
import { notificationsPusher } from "@my-app/notifications/pusher"

registerEventPusher(async (event, queue) => {
  const recipients = mapEventToLegacyRecipients(event)
  if (recipients.length === 0) return
  await notificationsPusher({ input: { /* ... */ }, queue })
})
```

## Hard rules

- ❌ Never call `registerEventPusher` inside a request handler or service method — only at module startup.
- ❌ Never throw inside a pusher — catch and log; failing one pusher must not prevent others from running.
- ❌ Never import a domain package from `packages/events` — it has **no internal deps**.
- ✅ Always call `clearEventPushers()` in `beforeEach` in unit tests.
- ✅ All monetary amounts in event payloads use integer kopeks (`amountKopeks: number`), never floats.
