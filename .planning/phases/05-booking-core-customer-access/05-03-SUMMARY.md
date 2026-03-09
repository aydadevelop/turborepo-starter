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
