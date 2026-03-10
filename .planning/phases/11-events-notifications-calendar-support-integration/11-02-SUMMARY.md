---
phase: 11-events-notifications-calendar-support-integration
plan: 02
subsystem: api
tags: [support, booking, svelte, tanstack-query, orpc, sveltekit]

requires:
  - phase: 06-payments-notifications-support
    provides: Support ticket schema (supportTicket, ticketMessage tables), support-service functions, support contract routes
  - phase: 05-booking-core-customer-access
    provides: booking schema with customerUserId

provides:
  - listCustomerTickets, getCustomerTicket, listTicketMessages in support-service.ts
  - listMyTickets, getMyTicket, addMyMessage in api-contract and api handlers (protectedProcedure)
  - /dashboard/bookings SvelteKit page listing customer's bookings with linked support tickets
  - /dashboard/support/[ticketId] SvelteKit page with ticket messages and reply form

affects: [support, api, web, api-contract]

tech-stack:
  added: []
  patterns:
    - Customer-scoped service functions receive customerUserId param (not organizationId)
    - protectedProcedure for customer-facing endpoints (vs organizationPermissionProcedure for org ops)
    - createQuery with enabled: Boolean(id) guard for dynamic route pages

key-files:
  created:
    - apps/web/src/routes/(app)/dashboard/bookings/+page.ts
    - apps/web/src/routes/(app)/dashboard/bookings/+page.svelte
    - apps/web/src/routes/(app)/dashboard/support/[ticketId]/+page.ts
    - apps/web/src/routes/(app)/dashboard/support/[ticketId]/+page.svelte
  modified:
    - packages/support/src/support-service.ts
    - packages/api-contract/src/routers/support.ts
    - packages/api/src/handlers/support.ts
    - packages/support/src/__tests__/support-service.test.ts

key-decisions:
  - "listTicketMessages filters isInternal: false (customer sees only non-internal messages)"
  - "addMyMessage handler verifies ticket ownership via direct DB query before inserting"
  - "bookings page indexes tickets by bookingId via $derived for O(1) lookup"
  - "Ticket reply form hidden when ticket.status is resolved or closed"

patterns-established:
  - "Customer routes use protectedProcedure; org routes use organizationPermissionProcedure"
  - "Dynamic route pages: const id = $derived(page.params.x ?? ''); queryOptions enabled: Boolean(id)"
  - "ticketsByBookingId = $derived(tickets.reduce(...)) for cross-query joins in Svelte"

requirements-completed:
  - AUTH-02
  - OPER-02

duration: 40min
completed: 2025-01-28
---

# Plan 11-02: Customer Support History + Booking Web Surface

**Customer-scoped support ticket endpoints (listMyTickets, getMyTicket, addMyMessage) wired to /dashboard/bookings and /dashboard/support/[ticketId] SvelteKit pages with TanStack Query.**

## Performance

- **Duration:** ~40 min
- **Tasks:** 3 completed
- **Files modified:** 8 (4 created, 4 modified)

## Accomplishments

- Three customer-scoped service functions added: `listCustomerTickets`, `getCustomerTicket`, `listTicketMessages`
- Contract and handler routes added with `protectedProcedure` ownership checks
- `/dashboard/bookings` page shows all customer bookings with linked support ticket subjects
- `/dashboard/support/[ticketId]` page shows messages and reply form (hidden when resolved/closed)

## Task Commits

1. **Task 1: Customer support service + contract + handlers + tests** - `73d261c` (feat)
2. **Task 2: /dashboard/bookings web page** - `b41f661` (feat)
3. **Task 3: /dashboard/support/[ticketId] web page** - `d85e1a2` (feat)

## Files Created/Modified

- `packages/support/src/support-service.ts` - Added listCustomerTickets, getCustomerTicket, listTicketMessages
- `packages/api-contract/src/routers/support.ts` - Added listMyTickets, getMyTicket, addMyMessage
- `packages/api/src/handlers/support.ts` - Added customer handlers with protectedProcedure
- `packages/support/src/__tests__/support-service.test.ts` - Added customer tests (10 tests total)
- `apps/web/src/routes/(app)/dashboard/bookings/+page.svelte` - Bookings list with support link
- `apps/web/src/routes/(app)/dashboard/support/[ticketId]/+page.svelte` - Ticket detail + reply

## Decisions Made

- `listTicketMessages` filters `isInternal: false` so customers only see non-internal messages
- Reply form hidden for resolved/closed tickets to prevent reopening via stale form
- `ticketsByBookingId` derived map computed client-side (no extra API call)

## Issues Encountered

- 2 pre-existing test failures in support-service.test.ts using `expect(() => fn()).rejects.toThrow()` pattern — fixed to `expect(fn()).rejects.toThrow()` (bun test v1.3.10 requires direct promise form)

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Customer-facing support + booking surfaces are live
- Reply flow end-to-end: customer → addMyMessage → DB → re-fetched via invalidateQueries

---
*Phase: 11-events-notifications-calendar-support-integration*
*Completed: 2025-01-28*
