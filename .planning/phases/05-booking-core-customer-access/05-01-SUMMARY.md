# Phase 05-01 Summary: Booking Package Scaffold + RBAC + Read Service

## What Was Built

### RBAC Extension (`packages/auth/src/organization-access.ts`)
Added `booking` resource to all 7 permission locations:
- `organizationStatements`: `booking: ["create","read","update","delete"]`
- `orgOwnerAc`, `orgAdminAc`, `managerAc`: full CRUD
- `agentAc`, `memberAc`: `["read"]`
- `customerAc`: `[]` (customer access via protected procedures, not org RBAC)

### Booking Package (`packages/booking/`)
New domain package `@my-app/booking` scaffolded following the availability/pricing pattern.

**`src/types.ts`** — Core types:
- `Db` — drizzle db instance type
- `BookingRow` — inferred from `booking.$inferSelect`
- `CreateBookingInput` — full booking creation shape (used by 05-02)
- `UpdateBookingStatusInput` — status transition shape (used by 05-02)
- `ListOrgBookingsFilter` — optional listingId, status, limit, offset

**`src/booking-service.ts`** — Read functions:
- `listOrgBookings(organizationId, filters, db)` — filters by org + optional listingId/status, desc(createdAt), limit 50
- `getOrgBooking(id, organizationId, db)` — throws `Error("NOT_FOUND")` if not found or wrong org
- `listCustomerBookings(customerUserId, db)` — desc(createdAt), limit 100

**`src/index.ts`** — barrel re-export

### Tests (`src/__tests__/booking-service.test.ts`)
11 tests covering:
- `listOrgBookings`: returns 2 org-1 bookings, isolates org-2, status filter, listingId filter, empty filter
- `getOrgBooking`: happy path, wrong org throws NOT_FOUND, missing id throws NOT_FOUND
- `listCustomerBookings`: user-1 isolation, cross-user isolation, multi-org for user-2

## Key Decisions
- Service functions accept `db: Db` as last argument (matches availability/pricing pattern)
- `getOrgBooking` uses `AND(id, organizationId)` for org-scoped lookup — no separate auth check needed
- Test slugs prefixed with `bk-` to avoid collision with other package test data
- Two listings + two publications seeded to enable meaningful `listingId` filter test

## Artifacts
- `packages/auth/src/organization-access.ts` — modified
- `packages/booking/package.json` — created
- `packages/booking/tsconfig.json` — created
- `packages/booking/vitest.config.ts` — created
- `packages/booking/src/types.ts` — created
- `packages/booking/src/booking-service.ts` — created
- `packages/booking/src/index.ts` — created
- `packages/booking/src/__tests__/booking-service.test.ts` — created

## Verification
- `bun run check-types --filter=@my-app/auth` → 1 successful ✅
- `bun run check-types --filter=@my-app/booking` → 1 successful ✅
- `bun run test --filter=@my-app/booking` → 11 passed ✅

## Commit
`39ab3e0` — feat(05-01): scaffold booking package, add RBAC booking resource, and read service
