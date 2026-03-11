# Parity Guide: Domain Extraction Verification

This document explains how to declare and run parity checks when extracting domain logic from the legacy monolith into dedicated packages.

## What is a Parity Check?

A parity check proves that an extracted function produces the **same output as the legacy implementation** for the same inputs. It's the automated safety net for brownfield extraction — you cannot ship an extracted domain package without verified parity.

The harness lives in `packages/db/src/test/parity.ts` and exposes:
- `ParityDeclaration<TInput, TOutput>` — the interface for declaring a check
- `createParityTest(declaration)` — returns a Vitest test function

## Declaring a Parity Check

In your domain package's `__tests__/parity.test.ts`, import `createParityTest` and declare what you're verifying:

```typescript
import { describe, it } from "vitest"
import { createParityTest } from "@my-app/db/test"

// The legacy implementation (source of truth)
import { legacyGetActiveBookingCount } from "../../legacy/booking-service"
// Your extracted implementation
import { getActiveBookingCount } from "../booking-service"

describe("Booking parity", () => {
  it(
    "parity: bookings.getActiveBookingCount",
    createParityTest({
      domain: "bookings",
      description: "getActiveBookingCount returns same value as legacy",
      inputs: [
        { listingId: "listing-1", status: "confirmed" },
        { listingId: "listing-2", status: "pending" },
      ],
      legacyFn: async (input) => legacyGetActiveBookingCount(input),
      extractedFn: async (input) => getActiveBookingCount(input),
    }),
  )
})
```

The runner calls **both functions on every input** and asserts deep-equal output. A failure message shows the input, legacy output, and extracted output.

## Custom Equality

If the outputs contain timestamps or IDs that differ by design, supply a custom `equals` function:

```typescript
createParityTest({
  // ...
  equals: (legacy, extracted) =>
    legacy.bookingId === extracted.bookingId &&
    legacy.status === extracted.status,
})
```

## Where to Add Declarations

| Domain package | Location |
|---|---|
| `packages/booking` | `packages/booking/src/__tests__/parity.test.ts` |
| `packages/catalog` | `packages/catalog/src/__tests__/parity.test.ts` |
| `packages/booking` cancellation/disputes subdomain | `packages/booking/src/cancellation/__tests__/parity.test.ts` or `packages/booking/src/disputes/__tests__/parity.test.ts` |

One parity test file per domain package. Accumulate all domain-specific checks there.

## How to Run

```bash
# Run parity tests for a specific domain package
bun run test --filter=@my-app/booking

# Run all parity tests across the monorepo
bun run test --filter=@my-app/...

# Run only the db-level canary check
cd packages/db && bun run test -- packages/db/src/__tests__/parity.test.ts
```

## What "Pass" Means

A parity test passes when **every input produces identical output** from both functions. "Identical" means deep JSON equality by default, or custom equality if you provide `equals`.

**Passing ≠ correct.** Parity guarantees the extracted function is behaviorally equivalent to the legacy. If the legacy has a bug, parity doesn't catch it — it only ensures extraction preserves behavior faithfully.

## Maintaining the Schema Baseline

`packages/db/src/__tests__/parity.test.ts` contains `PHASE_1_BASELINE_TABLES` — the hardcoded list of Drizzle tables at the Phase 1 snapshot.

When Phase 3+ domain packages add new Drizzle tables:
1. Add the table to its domain's schema file
2. Export it from `packages/db/src/schema/index.ts`
3. **Add its export name to `PHASE_1_BASELINE_TABLES`** in the canary test
4. Run `cd packages/db && bun run test` to verify the canary passes again

The baseline update documents the schema delta — future readers can see what was added and when.

## Example: Phase 3 Booking Extraction

```typescript
// packages/booking/src/__tests__/parity.test.ts

import { describe, it } from "vitest"
import { createParityTest } from "@my-app/db/test"
import { legacyCalculateFinalPrice } from "@my-app/legacy/marketplace"
import { calculateFinalPrice } from "../pricing"

describe("Booking extraction parity", () => {
  it(
    "parity: booking.calculateFinalPrice",
    createParityTest({
      domain: "booking.pricing",
      description: "calculate final price matches legacy pricing pipeline",
      inputs: [
        {
          baseRateKopeks: 10_000,
          durationDays: 3,
          discountCode: null,
          taxRatePercent: 20,
        },
        {
          baseRateKopeks: 25_000,
          durationDays: 7,
          discountCode: "SUMMER10",
          taxRatePercent: 20,
        },
      ],
      legacyFn: (input) => legacyCalculateFinalPrice(input),
      extractedFn: (input) => calculateFinalPrice(input),
    }),
  )
})
```

## Anti-patterns

**Don't test side effects.** Parity checks pure input→output transformations. Database writes, queue publishes, and external API calls belong in integration tests, not parity checks.

**Don't mock the legacy implementation.** The whole point is comparing against the real legacy behavior. Mocking it defeats parity entirely.

**Don't skip parity when "obviously correct."** The harness exists precisely for cases where extraction looks obviously correct but isn't. Run it always.
