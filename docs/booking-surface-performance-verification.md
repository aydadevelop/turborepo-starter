# Booking Surface Performance Verification

**Status:** Active  
**Date:** 2026-03-12  
**Scope:** `boat_rent` public booking surface in `packages/booking`

## Purpose

This document defines how to verify that the public booking surface stays:

- correct
- query-bounded
- module-shaped

The immediate target is [`getPublicBookingSurface`](../packages/booking/src/public-surface.ts), which powers the public `boat_rent` booking panel.

## What We Are Protecting

The booking surface should remain a **composed read model** owned by `packages/booking`.

It may compose:

- listing/publication identity
- availability rules and exceptions
- active blocks
- blocking bookings
- minimum-duration rules
- pricing context
- promotion preview context

It should **not** regress back to slot-by-slot database quote resolution.

## Current Guardrail

The primary regression guard lives in:

- [packages/booking/src/__tests__/public-surface.test.ts](../packages/booking/src/__tests__/public-surface.test.ts)

That test measures executed SQL statement count in the PGlite harness by hooking the underlying client’s `_runExclusiveQuery` method during one `getPublicBookingSurface` call.

This is a statement-count guardrail, not a production latency benchmark.

## Accepted Query Budget

For the seeded `boat_rent` case in the test fixture:

- no discount: `<= 8` SQL statements
- with discount preview: `<= 9` SQL statements

These thresholds are intentionally small and constant.

If they grow with slot count again, the composed read model has likely regressed into an N+1 query shape.

## How To Run It

### Focused booking surface regression

```bash
cd packages/booking
bunx vitest run src/__tests__/public-surface.test.ts -t "keeps booking-surface query count bounded per request"
```

### Full booking surface test file

```bash
cd packages/booking
bunx vitest run src/__tests__/public-surface.test.ts
```

### Supporting package checks

```bash
cd packages/pricing
bunx vitest run src/__tests__/quote-service.test.ts

cd ../promotions
bunx vitest run src/__tests__/service.test.ts

cd ../api
set -a && source ../../.env && set +a && bunx vitest run src/__tests__/storefront.test.ts
```

## What The PGlite Guardrail Means

The PGlite statement count is useful for catching structural regressions:

- repeated pricing profile loads
- repeated pricing rule loads
- repeated promotion code resolution
- accidental slot-by-slot database reads

It does **not** prove:

- real PostgreSQL latency
- planner quality
- index selectivity under larger datasets
- concurrency behavior under load

## When To Run A Real PostgreSQL Check

Run a real Postgres verification pass when:

- the booking-surface query shape changes
- new joins or filters are added
- pricing or promotion applicability becomes more complex
- date-range or slot counts expand materially
- you suspect index or planner regressions

Suggested follow-up checks:

1. run the focused booking surface tests
2. replay the flow against real Postgres
3. capture `EXPLAIN (ANALYZE, BUFFERS)` for the fixed-base queries
4. compare query count and wall time before/after the change

## Boundary Check

When touching the booking surface, verify module ownership too.

### Good shape

- `packages/booking` owns the composed public read model
- `packages/pricing` owns quote logic
- `packages/promotions` owns discount preview and usage policy
- `packages/api-contract` owns the network shape
- `apps/web` only renders the surface

### Watch for drift

- `booking` reaching into pricing repository internals
- `booking` re-implementing promotion validation
- frontend deriving availability/price/discount truth from separate calls
- route-level code rebuilding booking logic outside the backend surface

## Current Known Limitation

The optimized path is query-bounded, but `packages/booking/src/public-surface.ts` still reads pricing persistence rows directly before passing them into `@my-app/pricing`.

That is acceptable for now in the shared-DB model, but the stricter target is:

- `pricing` resolves default pricing context
- `booking` consumes that resolved context only

If that cleanup lands, update this document and keep the same query-budget test.
