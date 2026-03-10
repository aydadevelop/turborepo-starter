---
phase: 11-events-notifications-calendar-support-integration
plan: 01
subsystem: api
tags: [events, notifications, event-bus, drizzle, pusher, booking]

requires:
  - phase: 10-payment-webhook-cancellation-live-path
    provides: EventBus class in @my-app/events, DomainEventMap types, booking status transitions

provides:
  - Typed DomainEvent emission from booking.updateStatus for booking:confirmed and booking:cancelled
  - Async DB-based recipient resolution in events-bridge (looks up customerUserId from booking row)
  - registerNotificationEventPusher wired into apps/server startup with db param
  - Legacy event-bus deleted; EventBus imported exclusively from @my-app/events
  - flushEvents middleware removed; EventBus is constructed per-request in requireActiveOrganization

affects: [notifications, api, server, events]

tech-stack:
  added: []
  patterns:
    - EventBus.emit for typed domain events (replaces notificationsPusher direct call)
    - events-bridge uses async db lookup for recipient resolution
    - Immediate fan-out EventBus (no accumulate-and-flush) - event emitted directly in handler

key-files:
  created:
    - packages/notifications/src/events-bridge.ts (rewritten)
    - packages/notifications/src/__tests__/events-bridge.test.ts (rewritten)
  modified:
    - packages/api/src/handlers/booking.ts
    - packages/api/src/context.ts
    - packages/api/src/index.ts
    - packages/notifications/package.json
    - apps/server/src/index.ts
    - apps/server/package.json
  deleted:
    - packages/api/src/lib/event-bus.ts
    - packages/api/src/__tests__/event-bus.test.ts

key-decisions:
  - "booking:created, payment:captured, payment:failed return null from mapEventToNotificationInput (no push)"
  - "registerNotificationEventPusher accepts optional db param, defaults to defaultDb from @my-app/db"
  - "EventBus constructed per-request in requireActiveOrganization (context.notificationQueue)"
  - "events-bridge exported as subpath @my-app/notifications/events-bridge"

patterns-established:
  - "Domain events emitted via eventBus.emit({ type, data }) in handlers, .catch(() => {}) for non-blocking"
  - "events-bridge mapEventToNotificationInput async with db param for recipient resolution"
  - "Server startup wires event handlers: registerBookingLifecycleSync(db), registerNotificationEventPusher(undefined, db)"

requirements-completed:
  - OPER-03
  - BOOK-04

duration: 45min
completed: 2025-01-28
---

# Plan 11-01: Booking Status Events on Typed Boundary

**Replaces notificationsPusher direct call with typed EventBus.emit and async DB-based recipient resolution in events-bridge, deletes legacy accumulate-and-flush event-bus.**

## Performance

- **Duration:** ~45 min
- **Tasks:** 3 completed
- **Files modified:** 8 (2 deleted, 6 modified/created)

## Accomplishments

- `booking.updateStatus` now emits `booking:confirmed` and `booking:cancelled` typed events via `EventBus.emit` with non-blocking `.catch(() => {})`
- `events-bridge` rewritten to async with DB lookup for customerUserId recipient resolution; silent events (booking:created, payment:*) return `null`
- Legacy `packages/api/src/lib/event-bus.ts` deleted; `flushEvents` middleware removed from `organizationProcedure`

## Task Commits

1. **Task 1: booking.updateStatus typed event emission** - `86dd7f0` (feat)
2. **Task 2: events-bridge async db resolution + server startup** - `7c8f79c` (feat)
3. **Task 3: delete legacy event-bus, remove flushEvents** - `397a4b1` (refactor)

## Files Created/Modified

- `packages/api/src/handlers/booking.ts` - Removed notificationsPusher, added eventBus.emit for confirmed/cancelled
- `packages/notifications/src/events-bridge.ts` - Complete rewrite: async, db param, recipient resolution
- `packages/notifications/src/__tests__/events-bridge.test.ts` - Complete rewrite (5 tests)
- `packages/notifications/package.json` - Added `./events-bridge` subpath export
- `apps/server/src/index.ts` - Added registerNotificationEventPusher(undefined, db) call
- `apps/server/package.json` - Added @my-app/notifications dependency
- `packages/api/src/context.ts` - EventBus import → @my-app/events
- `packages/api/src/index.ts` - EventBus import → @my-app/events, removed flushEvents

## Decisions Made

- `booking:created` silenced (returns null from events-bridge) — not a customer-facing notification trigger
- `registerNotificationEventPusher` takes optional `db` param so tests can inject mocks

## Issues Encountered

- `@my-app/notifications/events-bridge` subpath was missing from package.json exports — added it
- `apps/server` didn't have `@my-app/notifications` as a direct dependency — added it

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Typed event pipeline is end-to-end: handler → EventBus → events-bridge → pusher
- events-bridge test pattern established (chainable drizzle mock via mockLimit)

---
*Phase: 11-events-notifications-calendar-support-integration*
*Completed: 2025-01-28*
