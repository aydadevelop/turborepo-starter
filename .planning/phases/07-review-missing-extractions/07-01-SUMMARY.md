---
phase: 07-review-missing-extractions
plan: "01"
subsystem: booking
tags: [booking, pricing, extraction, overlap, slots]

requires:
  - phase: 05-booking-core-customer-access
    provides: "booking domain package scaffold and lifecycle services"
  - phase: 04-availability-pricing-core
    provides: "availability and pricing package foundations"
provides:
  - "Booking action-window policy evaluation helpers"
  - "Overlap detection and availability block guards in package-owned booking code"
  - "Slot computation helpers and active pricing profile resolution"
affects: [booking, pricing, calendar, disputes]

tech-stack:
  added: []
  patterns:
    - "Pure booking computations live in package-owned functions with plain Error codes"
    - "Database-backed helpers accept db as a parameter instead of reading module singletons"

key-files:
  created:
    - packages/booking/src/action-policy.ts
    - packages/booking/src/overlap.ts
    - packages/booking/src/slots.ts
    - packages/pricing/src/pricing-profile.ts
    - packages/booking/src/__tests__/action-policy.test.ts
    - packages/booking/src/__tests__/overlap.test.ts
  modified: []

key-decisions:
  - "Booking policy evaluation returns structured results instead of throwing for allowed/blocked decisions"
  - "Overlap detection stays pure while assertNoOverlap handles DB-backed conflict checks"

patterns-established:
  - "Port legacy computation seams into package-owned helpers before wiring them onto live handlers"
  - "Use descriptive plain Error codes instead of transport-layer error types inside domain packages"

requirements-completed:
  - EXTR-01
  - EXTR-02

duration: "n/a"
completed: 2026-03-10
---

# Plan 07-01 Summary — Booking P0 Gap Functions + Pricing Profile

## What Was Built

Ported the three load-bearing booking computation services from the legacy repo into `packages/booking`, plus `resolveActivePricingProfile` into `packages/pricing`.

## Files Created

### packages/booking/src/action-policy.ts
- `BookingActionPolicy` interface (result type with `allowed`, `hoursUntilStart`, `minHoursRequired`)
- `BookingActionPolicyAction`, `BookingActionPolicyActor` types
- `BookingActionWindowPolicyProfile` — the per-org configurable policy shape
- `evaluateBookingActionWindow()` — returns structured result instead of throwing
- `resolveBookingActionWindowPolicyProfile()` — parses org metadata JSON
- `loadOrganizationBookingActionPolicyProfile()` — DB-backed loader (accepts `db` param, no module-level DB)

### packages/booking/src/overlap.ts
- `detectOverlap()` — pure interval overlap check (exclusive-end convention)
- `assertNoOverlap()` — DB-backed, throws `Error("BOOKING_OVERLAP: ...")` if conflict found
- `assertNoAvailabilityBlockOverlap()` — checks `listingAvailabilityBlock` table
- `blockingBookingStatuses` const — `["pending", "awaiting_payment", "confirmed", "in_progress"]`

### packages/booking/src/slots.ts
- `BusyInterval`, `FreeGap`, `TimeSlot` types
- `mergeBusyIntervals()` — sorts and merges overlapping intervals with optional buffer and window clipping
- `findFreeGaps()` — computes free time gaps from a window and busy intervals
- `extractSlotsFromGaps()` — extracts time slots of a given duration with step
- `calculateAvailableSlots()` — full pipeline: merge → gaps → filter by min duration → extract slots

### packages/pricing/src/pricing-profile.ts
- `resolveActivePricingProfile()` — finds active `listingPricingProfile` row for a `listingId` and `startsAt` date
  - Active = not archived, `validFrom ≤ startsAt`, `validTo > startsAt` OR `validTo` is null
  - Throws `Error("PRICING_PROFILE_NOT_FOUND: ...")` if none found

### Test Files
- `packages/booking/src/__tests__/action-policy.test.ts` — 9 tests for `evaluateBookingActionWindow` and `resolveBookingActionWindowPolicyProfile`
- `packages/booking/src/__tests__/overlap.test.ts` — 4 tests for `detectOverlap` pure function

## Key Decisions

- `evaluateBookingActionWindow` returns `BookingActionPolicy` (structured result) not throws — callers can surface restriction appropriately
- `detectOverlap` is pure (no DB), `assertNoOverlap` is DB-backed — clean separation
- ORPCError removed throughout — plain `Error` with descriptive codes used instead
- DB accepted as parameter, no module-level DB singletons
- Schema: `listingId` (not `boatId`), `listingAvailabilityBlock` (not `boatAvailabilityBlock`), `listingPricingProfile` (not `boatPricingProfile`)

## Verification

- `npx tsc --noEmit -p packages/booking/tsconfig.json` — passes (only pre-existing `bookingRefund` warning in cancellation-service.test.ts)
- `npx tsc --noEmit -p packages/pricing/tsconfig.json` — passes cleanly
- `bun run --filter @my-app/booking test` — 44 tests in 4 files, all pass
