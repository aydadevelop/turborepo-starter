---
phase: 05-booking-core-customer-access
plan: "03"
subsystem: api
tags: [booking, orpc, handlers, auth, transport]

requires:
	- phase: 05-booking-core-customer-access
		provides: "booking read and mutation services"
provides:
	- "booking oRPC contracts for customer and operator surfaces"
	- "thin handlers for booking creation, org review, lifecycle updates, and my-bookings lookup"
	- "date-normalized booking transport models"
affects: [api, booking, web, auth]

tech-stack:
	added: []
	patterns:
		- "Protected procedures derive customer identity from the session instead of client-supplied user IDs"
		- "Transport handlers normalize Date values and translate package domain errors to ORPCError codes"

key-files:
	created:
		- packages/api-contract/src/routers/booking.ts
	modified:
		- packages/api/src/handlers/booking.ts
		- packages/api-contract/src/routers/index.ts
		- packages/api/src/handlers/index.ts
		- packages/api/package.json

key-decisions:
	- "listMyBookings is session-scoped and accepts no userId from the client"
	- "booking.create currently records organization linkage but does not yet validate live publication ownership"

patterns-established:
	- "Operator review routes use organizationPermissionProcedure while customer booking history uses protectedProcedure"
	- "Booking transport schemas share a single output formatter for ISO-normalized date fields"

requirements-completed: []

duration: "n/a"
completed: 2026-03-10
---

# Phase 05-03 Summary: Booking oRPC Contracts + Thin Handlers

## What Was Built

### `packages/api-contract/src/routers/booking.ts` — 5 Procedure Contracts

**Shared `bookingOutput` Zod schema** covers all BookingRow fields with dates as `z.string().datetime()` and nullable dates as `.nullable()`.

**5 procedures**:
1. `booking.create` — input: listingId, publicationId, organizationId, startsAt/endsAt (datetime), optional passengers/contact/currency; output: bookingOutput
2. `booking.listOrgBookings` — input: optional listingId, status, limit, offset; output: bookingOutput[]
3. `booking.getBooking` — input: id; output: bookingOutput
4. `booking.updateStatus` — input: id, status enum, optional cancellationReason/cancelledByUserId; output: bookingOutput
5. `booking.listMyBookings` — input: empty object (derived from session); output: bookingOutput[]

### `packages/api/src/handlers/booking.ts` — 5 Thin Handlers

**`formatBooking`** helper converts Date fields to ISO strings with `?.toISOString() ?? null` for nullable cancelledAt.

**Procedure types used**:
- `booking.create` → `protectedProcedure` (customerUserId from `context.session!.user!.id`)
- `booking.listOrgBookings` → `organizationPermissionProcedure({ booking: ["read"] })`
- `booking.getBooking` → `organizationPermissionProcedure({ booking: ["read"] })`
- `booking.updateStatus` → `organizationPermissionProcedure({ booking: ["update"] })`
- `booking.listMyBookings` → `protectedProcedure` (AUTH-02: strictly scoped to session user)

**Error translations**:
- `SLOT_UNAVAILABLE` → `ORPCError("CONFLICT")`
- `NO_PRICING_PROFILE` → `ORPCError("PRECONDITION_FAILED")`
- `NOT_FOUND` → `ORPCError("NOT_FOUND")`
- `INVALID_TRANSITION` → `ORPCError("BAD_REQUEST")`

### wiring changes
- `packages/api-contract/src/routers/index.ts` — added `booking: bookingContract`
- `packages/api/src/handlers/index.ts` — added `booking: bookingRouter`
- `packages/api/package.json` — added `@my-app/booking: "workspace:*"`

## AUTH-02 Compliance
`booking.listMyBookings` uses `protectedProcedure` and calls `listCustomerBookings(context.session!.user!.id, db)` — scoped strictly to the authenticated user. No parameter for userId is accepted from the client; it is always derived from the verified session.

## AUTH-03 Compliance
`booking.create` stores `organizationId` (the merchant org) on every booking record, establishing the customer-to-merchant relationship.

## Commit
`e4a1ccb` — feat(05-03): add booking oRPC contracts and thin handlers

## Verification
- `bun run check-types --filter=@my-app/api-contract` → 1 successful ✅
- `bun run check-types --filter=@my-app/api` → 1 successful ✅
- `bun run test --filter=@my-app/booking --filter=@my-app/auth --filter=@my-app/availability --filter=@my-app/pricing` → all tests pass ✅
