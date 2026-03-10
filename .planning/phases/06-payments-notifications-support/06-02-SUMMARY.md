---
phase: 06-payments-notifications-support
plan: "02"
subsystem: support
tags: [support, tickets, api, messaging, organization]

requires:
  - phase: 05-booking-core-customer-access
    provides: "booking identifiers and org-scoped booking context"
provides:
  - "@my-app/support package for org-scoped support tickets and messages"
  - "support oRPC contract and thin API handlers"
  - "Date-normalized support ticket/message transport models"
affects: [support, api, booking, customer-follow-up]

tech-stack:
  added: []
  patterns:
    - "Support ticket ownership is validated in package services, with handlers translating NOT_FOUND only"
    - "Org-scoped support APIs are thin wrappers around package-owned services"

key-files:
  created:
    - packages/support/package.json
    - packages/support/tsconfig.json
    - packages/support/vitest.config.ts
    - packages/support/src/types.ts
    - packages/support/src/support-service.ts
    - packages/support/src/index.ts
    - packages/support/src/__tests__/support-service.test.ts
    - packages/api-contract/src/routers/support.ts
    - packages/api/src/handlers/support.ts
  modified:
    - packages/api-contract/src/routers/index.ts
    - packages/api/src/handlers/index.ts

key-decisions:
  - "Support remains org-scoped at this stage; customer-facing history is deferred"
  - "Ticket and message output schemas normalize Date values at the transport edge"

patterns-established:
  - "Support service methods validate booking/ticket org ownership before mutating data"
  - "Thin transport handlers format support artifacts through dedicated helper functions"

requirements-completed: []

duration: "n/a"
completed: 2026-03-10
---

# Phase 06-02 Summary: Support Package & API Wiring

## What Was Built

### New Package: `packages/support`

A standalone domain package for customer support ticket management.

**Files created:**
- `packages/support/package.json` — `@my-app/support`, deps: `@my-app/db`, `drizzle-orm`
- `packages/support/tsconfig.json`
- `packages/support/vitest.config.ts`
- `packages/support/src/types.ts` — `Db`, `SupportTicketRow`, `SupportTicketMessageRow`, `CreateSupportTicketInput`, `AddTicketMessageInput`, `ListTicketsFilter`
- `packages/support/src/support-service.ts` — 4 exported functions
- `packages/support/src/index.ts` — re-exports types + service
- `packages/support/src/__tests__/support-service.test.ts` — 4 tests

### API Contract: `packages/api-contract/src/routers/support.ts` (new file)

Created `supportContract` with 4 routes:
- `createTicket` — opens a new support ticket (support:create permission)
- `addMessage` — appends a message; validates ticket org ownership (support:create permission)
- `getTicket` — fetches ticket by ID (support:read permission)
- `listOrgTickets` — paginated list with optional status/bookingId filter (support:read permission)

Output schemas use `ticketOutput` and `messageOutput` with ISO datetime strings.

### API Contract Index: `packages/api-contract/src/routers/index.ts`

Added `import { supportContract } from "./support"` and `support: supportContract` to `appContract`.

### API Handler: `packages/api/src/handlers/support.ts` (new file)

Created `supportRouter` with 4 handlers:
- `formatTicket()` and `formatMessage()` helpers for Date → ISO string conversion
- Cross-org validation delegated to service layer (`NOT_FOUND` error translation)
- All handlers use `organizationPermissionProcedure` with appropriate scopes

### API Handler Index: `packages/api/src/handlers/index.ts`

Added `import { supportRouter } from "./support"` and `support: supportRouter` to `appRouter`.

## Key Service Functions

| Function | Behavior |
|----------|----------|
| `createSupportTicket` | Inserts ticket row, defaults: priority=normal, source=web, status=open |
| `addTicketMessage` | Validates ticket org ownership, throws `NOT_FOUND` if wrong org |
| `getTicket` | Selects by id + organizationId, throws `NOT_FOUND` if not found |
| `listOrgTickets` | Filters by status and/or bookingId, default ordering by createdAt |

## Tests
- `support-service.test.ts`: 4 tests, all pass
  - Create ticket → status=open
  - addMessage cross-org → throws NOT_FOUND
  - listOrgTickets filters by bookingId
  - getTicket → throws NOT_FOUND for unknown ticket

## Artifacts

| File | Status |
|------|--------|
| `packages/support/src/support-service.ts` | Created |
| `packages/support/src/types.ts` | Created |
| `packages/support/src/index.ts` | Created |
| `packages/api-contract/src/routers/support.ts` | Created |
| `packages/api-contract/src/routers/index.ts` | Extended (+support) |
| `packages/api/src/handlers/support.ts` | Created |
| `packages/api/src/handlers/index.ts` | Extended (+support) |
