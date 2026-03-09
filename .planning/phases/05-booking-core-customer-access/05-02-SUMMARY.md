# Phase 05-02 Summary: TDD createBooking + updateBookingStatus

## What Was Built

### Package Dependencies Updated
Added to `packages/booking/package.json`:
- `@my-app/availability: "workspace:*"` — for `assertSlotAvailable`
- `@my-app/pricing: "workspace:*"` — for `calculateQuote`

### `createBooking(input: CreateBookingInput, db: Db): Promise<BookingRow>`

Step sequence (enforced by implementation):
1. `assertSlotAvailable(listingId, startsAt, endsAt, db)` — throws `Error("SLOT_UNAVAILABLE")`
2. `calculateQuote({ listingId, startsAt, endsAt, passengers }, db)` — throws `Error("NO_PRICING_PROFILE")`
3. `db.insert(booking).values({ id: crypto.randomUUID(), ...input, merchantOrganizationId: organizationId, status: "pending", paymentStatus: "unpaid", calendarSyncStatus: "pending", basePriceCents: quote.baseCents + quote.adjustmentCents, totalPriceCents: quote.totalCents, discountAmountCents: 0, platformCommissionCents: 0, currency: input.currency ?? "RUB" }).returning()`
4. Returns inserted row

### `updateBookingStatus(input: UpdateBookingStatusInput, db: Db): Promise<BookingRow>`

State machine with `VALID_TRANSITIONS` constant (private, not exported):
```typescript
const VALID_TRANSITIONS: Record<string, string[]> = {
  pending: ["awaiting_payment", "confirmed", "rejected", "cancelled"],
  awaiting_payment: ["confirmed", "cancelled"],
  confirmed: ["in_progress", "cancelled"],
  in_progress: ["completed", "cancelled"],
  completed: [], cancelled: [], rejected: [], no_show: [], disputed: [],
};
```

Steps:
1. Fetch current booking by `AND(id, organizationId)` → `Error("NOT_FOUND")` if missing
2. Validate transition → `Error("INVALID_TRANSITION")` if not allowed
3. Build update payload; if cancelling, also sets `cancelledAt`, `cancelledByUserId`, `cancellationReason`
4. `db.update(booking).set(payload).where(AND(id, organizationId)).returning()`

## TDD Commits
- RED: `755ab15` — test(05-02): add failing tests for createBooking and updateBookingStatus
- GREEN: `fb73c21` — feat(05-02): implement createBooking with slot/quote integration and updateBookingStatus state machine

## Key Decisions
- Seed bookings for `updateBookingStatus` tests use `2025-06-01` timestamps to avoid slot conflicts with `createBooking` tests (2030-01-15 onward)
- `merchantOrganizationId` defaults to `organizationId` (web booking scenario; reseller scenario handled later)
- `AND(id, organizationId)` in the update query enforces org isolation atomically — no separate auth check

## Test Coverage
22 tests total (11 from 05-01 + 11 new):
- `createBooking`: success, SLOT_UNAVAILABLE, NO_PRICING_PROFILE
- `updateBookingStatus`: pending→confirmed, pending→rejected, pending→cancelled (with cancelledAt), confirmed→in_progress, in_progress→completed, INVALID_TRANSITION (pending→completed), INVALID_TRANSITION (terminal→confirmed), NOT_FOUND (wrong org)

## Artifacts
- `packages/booking/package.json` — added availability + pricing deps
- `packages/booking/src/booking-service.ts` — added createBooking, updateBookingStatus
- `packages/booking/src/__tests__/booking-service.test.ts` — added 11 new tests

## Verification
- `bun run check-types --filter=@my-app/booking` → 1 successful ✅
- `bun run test --filter=@my-app/booking` → 22 passed ✅
