---
phase: 02-events-workflows-parity-foundations
plan: 01
subsystem: events
tags: [domain-events, event-bus, event-driven, notifications]

requires: []
provides:
  - "@my-app/events package with DomainEvent discriminated union, EventBus, registerEventPusher, clearEventPushers, emitDomainEvent"
  - "notifications bridge via registerNotificationEventPusher that maps DomainEvents to notificationsPusher"
affects: [workflows, booking, catalog, disputes, payments, calendar]

tech-stack:
  added: ["@my-app/events (new package)"]
  patterns:
    - "registerEventPusher/clearEventPushers module-level pushers array pattern"
    - "Promise.allSettled for fire-and-forget fan-out to all registered pushers"
    - "Discriminated union DomainEvent<T extends DomainEventType> for compile-time event type safety"
    - "Events bridge pattern: domain package self-registers by calling registerNotificationEventPusher() at startup"

key-files:
  created:
    - packages/events/src/types.ts
    - packages/events/src/event-bus.ts
    - packages/events/src/index.ts
    - packages/events/src/__tests__/event-bus.test.ts
    - packages/events/package.json
    - packages/events/tsconfig.json
    - packages/events/vitest.config.ts
    - packages/notifications/src/events-bridge.ts
    - packages/notifications/src/__tests__/events-bridge.test.ts
  modified:
    - packages/notifications/package.json

key-decisions:
  - "QueueProducer is a local structural interface in event-bus.ts (not imported from @my-app/queue) to avoid circular deps"
  - "registerNotificationEventPusher is NOT called at module import time — the app startup calls it explicitly"
  - "DomainEvent<T> generic for type-safe event.data access; emitting uses DomainEvent (base type)"
  - "Silent events (dispute:opened, calendar:sync-requested, etc.) return null from mapEventToNotificationInput"

patterns-established:
  - "Event pusher registration: registerEventPusher(async (event, queue) => { ... }) — call once at app startup"
  - "Test isolation: call clearEventPushers() in beforeEach for any test that registers pushers"
  - "New event types: add to DomainEventMap in packages/events/src/types.ts; bridge mapping in events-bridge.ts"

requirements-completed:
  - OPER-03

duration: 15min
completed: 2026-03-09
---

# Phase 02-01: Events Package Summary

**Typed discriminated-union DomainEvent bus established — notifications wired as first event pusher; side effects now decoupled from inline handler logic.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-03-09T21:49Z
- **Completed:** 2026-03-09T21:51Z
- **Tasks:** 2 completed
- **Files modified:** 9

## Accomplishments

### Task 1: packages/events scaffold

Created `@my-app/events` — a zero-external-dependency package providing:
- `DomainEventMap` discriminated union with 9 event types (booking:*, payment:*, dispute:*, calendar:*)
- `DomainEvent<T>` generic type for type-safe data access
- `registerEventPusher` / `clearEventPushers` module-level pusher registration
- `emitDomainEvent` using `Promise.allSettled` for fire-and-forget delivery (pusher errors do not propagate)
- `EventBus` class that wraps `emitDomainEvent` with a stored queue reference
- 5 unit tests cover: pusher invocation, clearEventPushers isolation, allSettled swallows errors, queue forwarding, multi-pusher fan-out

### Task 2: notifications bridge

Created `packages/notifications/src/events-bridge.ts` with `registerNotificationEventPusher()`:
- Maps 5 event types to `EmitNotificationEventInput` (booking:created, booking:confirmed, booking:cancelled, payment:captured, payment:failed)
- Silent events return null (not dispatched to notifications)
- Recipients are empty `[]` — domain-specific pusher logic ships in Phase 3+
- Added `@my-app/events: workspace:*` to notifications dependencies
- 3 unit tests cover: booking:created mapping, dispute:opened silence, queue passthrough

## Self-Check

- ✅ All must_haves verified: pushers fire on emit, clearEventPushers isolates tests, Promise.allSettled absorbs errors, notifications bridge maps events
- ✅ `bun run test` passes in packages/events (5/5) and packages/notifications (3/3)
- ✅ `bun run check-types` passes in both packages — 0 errors
- ✅ OPER-03: side effects can now be wired to domain events without inline handler logic
