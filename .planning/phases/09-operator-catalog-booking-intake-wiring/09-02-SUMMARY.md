---
phase: 09-operator-catalog-booking-intake-wiring
plan: "02"
subsystem: booking
tags: [booking, tdd, orpc, drizzle, marketplace-publication]

requires:
  - phase: 05-booking-core-customer-access
    provides: "booking package createBooking flow and protected booking handler"
  - phase: 03-org-access-catalog-storefront
    provides: "marketplace listing/publication model and public listing publication rules"
provides:
  - "Server-trusted booking context resolution from listingId"
  - "A booking.create contract that no longer accepts organizationId or publicationId from the browser"
  - "Regression coverage for unbookable and publication-mismatch listing states"
affects: [booking, api, api-contract, web-booking-intake]

tech-stack:
  added: []
  patterns:
    - "Booking intake resolves marketplace publication state inside the domain layer before slot and pricing checks"
    - "Transport handlers translate plain domain Error codes into ORPCError responses without reintroducing browser-trusted org context"

key-files:
  created: []
  modified:
    - packages/booking/src/types.ts
    - packages/booking/src/booking-service.ts
    - packages/booking/src/__tests__/booking-service.test.ts
    - packages/api-contract/src/routers/booking.ts
    - packages/api/src/handlers/booking.ts

key-decisions:
  - "The domain layer owns publication and organization resolution so the browser never needs publicationId or organizationId to create a booking"
  - "Bookable listings are defined as active listings with an active `platform_marketplace` publication"
  - "Publication/listing organization mismatches fail explicitly with `PUBLICATION_ORG_MISMATCH` before slot or pricing work proceeds"

patterns-established:
  - "Run booking-service changes as TDD: failing booking-domain tests first, then contract/handler alignment in the green commit"
  - "Keep booking slot checks and quote calculation ordering intact after adding new context resolution logic"

requirements-completed:
  - AUTH-03
  - BOOK-01

duration: "n/a"
completed: 2026-03-10
---

# Phase 09 Plan 02: Booking context hardening summary

**Server-trusted booking intake that resolves marketplace publication context from `listingId` before insert**

## Performance

- **Duration:** n/a
- **Started:** n/a
- **Completed:** 2026-03-10T12:44:17Z
- **Tasks:** 2 TDD commits
- **Files modified:** 5

## Accomplishments

- Added RED coverage proving `createBooking()` must derive organization/publication context from the selected listing instead of trusting browser input.
- Hardened `createBooking()` to look up the active marketplace publication, reject unbookable or mismatched listing/publication state, and persist the resolved context.
- Removed `organizationId` and `publicationId` from the public `booking.create` contract and aligned the protected API handler to the new server-trusted shape.

## Task Commits

1. **RED: Add failing tests for server-trusted booking context** — `a762740` (`test`)
2. **GREEN: Resolve booking publication context server-side** — `9a7fc50` (`feat`)
3. **Plan metadata:** `50c9e45`

## Files Created/Modified

- `packages/booking/src/types.ts` - Removes client-trusted organization/publication fields from `CreateBookingInput`.
- `packages/booking/src/booking-service.ts` - Resolves active marketplace publication/org context before slot and pricing checks.
- `packages/booking/src/__tests__/booking-service.test.ts` - Covers success, not-bookable, org-mismatch, slot-unavailable, and no-pricing scenarios with the final input shape.
- `packages/api-contract/src/routers/booking.ts` - Drops browser-supplied `organizationId` and `publicationId` from `booking.create`.
- `packages/api/src/handlers/booking.ts` - Passes only booking-intake fields into the domain service and maps mismatch/not-bookable errors cleanly.

## Decisions Made

- The booking domain, not the transport layer, now owns marketplace publication lookup and linkage validation.
- `NOT_FOUND` becomes the public “Listing is not bookable” outcome for listings without an active marketplace publication.
- `PUBLICATION_ORG_MISMATCH` is surfaced as a failed precondition so misconfigured supply data does not silently create broken bookings.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Removed an unused import blocking booking package type checks**
- **Found during:** GREEN verification
- **Issue:** `packages/booking/src/__tests__/cancellation-service.test.ts` imported `bookingRefund` without using it, which caused `tsc --noEmit` to fail for `@my-app/booking`.
- **Fix:** Removed the dead import so the targeted package type check could complete.
- **Files modified:** `packages/booking/src/__tests__/cancellation-service.test.ts`
- **Verification:** `bun run check-types --filter=@my-app/booking --filter=@my-app/api --filter=@my-app/api-contract`
- **Committed in:** `9a7fc50`

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** The fix was outside the booking context change itself but necessary to verify the plan cleanly. No scope creep.

## Issues Encountered

- None after the blocking type-check import cleanup.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `09-03` can now call `orpc.booking.create` with booking-intake fields only, without leaking organization/publication context into the browser.
- The booking handler still preserves the Phase 05 guarantees around protected access, slot safety, pricing, and `source: "web"`.

---
*Phase: 09-operator-catalog-booking-intake-wiring*
*Completed: 2026-03-10*
