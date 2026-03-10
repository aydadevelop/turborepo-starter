---
phase: 11-events-notifications-calendar-support-integration
type: research
---

# Research: Phase 11 — Events, Notifications, Calendar & Support Integration

## Standard Stack

| Package | Key Exports |
|---------|------------|
| `@my-app/events` | `EventBus`, `emitDomainEvent`, `registerEventPusher`, `clearEventPushers`, `DomainEvent`, `DomainEventMap` |
| `@my-app/notifications` | `notificationsPusher`, `registerNotificationEventPusher`, `EmitNotificationEventInput` |
| `@my-app/calendar` | `registerBookingLifecycleSync(db)`, `registerCalendarAdapter` |
| `@my-app/support` | `createSupportTicket`, `addTicketMessage`, `getTicket`, `listOrgTickets`, `SupportTicketRow`, `SupportTicketMessageRow` |
| `@my-app/db/schema/support` | `supportTicket`, `supportTicketMessage` |

## Architecture Patterns

### Two Event Bus Implementations (The Core Problem)

**Legacy** (`packages/api/src/lib/event-bus.ts`) — accumulate-and-flush:
- `emit()` adds event to internal queue only if `recipients.length > 0`
- `flush(queue?)` sends all queued events to `notificationsPusher` at request end
- Injected by `requireActiveOrganization` middleware via `context.eventBus ?? new EventBus()`
- Flushed by `flushEvents` middleware in the `organizationProcedure` chain
- `EventBus.size` tracks pending count; `flushEvents` only flushes if `size > 0`

**Target** (`packages/events/src/event-bus.ts`) — immediate fan-out:
- `emit(event: DomainEvent)` immediately calls all registered pushers
- `constructor(queue?: QueueProducer)` — queue passed through to `emitDomainEvent`
- No accumulation, no size, no flush — fire-and-forget per emit

**Callers of legacy bus in `packages/api/src/index.ts`:**
```typescript
import { EventBus } from "./lib/event-bus"; // ← DELETE, replace with @my-app/events

const requireActiveOrganization = o.middleware(({ context, next }) => {
  if (!context.activeMembership) throw new ORPCError("FORBIDDEN");
  return next({
    context: {
      activeMembership: context.activeMembership,
      eventBus: context.eventBus ?? new EventBus(), // ← new EventBus() is LEGACY
    },
  });
});

const flushEvents = o.middleware(async ({ context, next }) => {
  const result = await next();
  const eventBus = (context as Context & { eventBus?: EventBus }).eventBus;
  if (eventBus && eventBus.size > 0) {
    await eventBus.flush(context.notificationQueue); // ← DEAD after migration
  }
  return result;
});

export const organizationProcedure = protectedProcedure
  .use(requireActiveOrganization)
  .use(flushEvents); // ← flushEvents must be removed
```

**`context.ts` type import:**
```typescript
import type { EventBus } from "./lib/event-bus"; // ← change to @my-app/events
```

### Legacy Bus Deletion Plan

1. Delete `packages/api/src/lib/event-bus.ts`
2. Delete `packages/api/src/__tests__/event-bus.test.ts` (tests the deleted module; `buildRecipients` is not used in production)
3. In `packages/api/src/context.ts`: change `import type { EventBus } from "./lib/event-bus"` → `import type { EventBus } from "@my-app/events"`
4. In `packages/api/src/index.ts`:
   - Change `import { EventBus } from "./lib/event-bus"` → `import { EventBus } from "@my-app/events"`
   - Delete the entire `flushEvents` middleware const
   - Change `organizationProcedure` to: `protectedProcedure.use(requireActiveOrganization)` (no `.use(flushEvents)`)
   - In `requireActiveOrganization`: change `context.eventBus ?? new EventBus()` to `new EventBus(context.notificationQueue)` — the new EventBus takes queue as constructor arg; always create a fresh instance per request

### Notification Events Bridge — Recipient Resolution

Current `events-bridge.ts` produces `recipients: []` for all events (placeholder). Fix:
- Take `db` as second parameter to `registerNotificationEventPusher`
- For `booking:confirmed` / `booking:cancelled`: query `booking` table by `bookingId` to get `customerUserId`, build recipient with `channels: ["in_app"]`
- Return `null` for events without resolvable recipients (skips silently)

Startup wiring in `apps/server/src/index.ts`:
```typescript
registerNotificationEventPusher(undefined, db);
// queue=undefined because EventBus passes queue from context via emitDomainEvent
// db provided for recipient lookup
```

### Customer-Scoped Support Queries

Existing handlers use `organizationPermissionProcedure` — requires org membership.
Customer-scoped routes use `protectedProcedure` (auth-only) and filter by `customerUserId`:

```typescript
// Service: filter by customerUserId
eq(supportTicket.customerUserId, customerUserId)

// Handler: get userId from session
const userId = context.session!.user!.id;
```

For `addMyMessage` (customer reply): must look up ticket to get `organizationId` for the `addTicketMessage` call (which requires it for the org-scoping check). Set `isInternal: false, channel: "web"`.

For `getMyTicket`: combine ticket lookup + message fetch. Verify `ticket.customerUserId === userId` before returning — throw NOT_FOUND if mismatch (don't leak existence).

## Don't Hand-Roll

- **Drizzle chain mock pattern** for vitest tests:
  ```typescript
  vi.mock("@my-app/db", () => ({
    db: {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([{ customerUserId: "customer-1" }]),
    },
  }));
  ```
- **All events-bridge tests** use `clearEventPushers` in `beforeEach` to avoid pusher accumulation across tests
- **`formatTicket` / `formatMessage`** helpers already exist in `packages/api/src/handlers/support.ts` — reuse them for new handlers

## Common Pitfalls

1. **`booking:contact-updated`** — completely unimplemented path. Calendar sync listens for it but nothing emits it. Adding it requires a net-new `updateContact` contract route + booking service function. **Deferred to backlog.** Do NOT emit this event from existing routes.

2. **`createMockChargeNotification` in `payments.ts`** — calls `notificationsPusher` directly with real recipients. This is an intentional mock/test utility endpoint. NOT dead code. Do NOT migrate to domain events.

3. **`requireActiveOrganization` queue binding** — `new EventBus()` from legacy had no queue arg. New `EventBus(context.notificationQueue)` ensures the queue is passed to emitters so jobs can be queued rather than sent inline.

4. **`listTicketMessages` for customer view** — filter `isInternal = false`. Customers must never see internal staff notes.

5. **`addMyMessage` organizationId** — customer-scoped endpoint has no `activeMembership`. Must fetch ticket first to get `organizationId` for the `addTicketMessage` service call.

6. **`protectedProcedure` vs `organizationProcedure`** — customer support routes MUST use `protectedProcedure` (not organization-scoped). A customer logging into their own account doesn't have org membership.

## Gap Analysis

### Confirmed In-Scope (Phase 11)

| Gap | Fix |
|-----|-----|
| Legacy `event-bus.ts` still live | Delete file, update context.ts + index.ts |
| `flushEvents` middleware dead code | Remove from `organizationProcedure` |
| `notificationsPusher` called inline in `booking.updateStatus` | Replace with typed EventBus.emit() |
| `registerNotificationEventPusher` never called at startup | Add to `apps/server/src/index.ts` |
| Notification bridge produces `recipients: []` | Resolve from db by bookingId |
| No customer ticket detail/thread endpoint | Add `getMyTicket` + `addMyMessage` contract routes + handlers |
| No customer ticket detail UI | Add `/dashboard/support/[ticketId]` page |

### Deferred

| Gap | Reason |
|-----|--------|
| `booking:contact-updated` not emitted anywhere | Net-new feature (new route + service function). Phase 12+ scope. |
| `booking:created` notification recipients | No customer lookup pattern yet for listing context. Phase 12+. |
| `payment:captured` / `payment:failed` recipients | Requires payment-to-booking lookup. Phase 12+. |
