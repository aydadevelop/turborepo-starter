# Phase 4 Research: Availability & Pricing Core

**Researched:** 2026-03-10
**Requirements:** AVPR-01, AVPR-02, AVPR-03, AVPR-04

---

## Domain Understanding

### What Phase 4 Must Deliver

1. **AVPR-01** — Operator CRUD for availability rules (recurring weekly windows) and one-off blocks.
2. **AVPR-02** — Slot availability check: no overlapping active bookings; clean `SLOT_UNAVAILABLE` error.
3. **AVPR-03** — Customer gets a transparent quote breakdown (base + adjustments + fees) for a candidate slot before booking.
4. **AVPR-04** — Operator manages pricing profiles and rules through domain code, not inline handler logic.

---

## Schema Landscape (Already Committed)

All tables live in `packages/db/src/schema/availability.ts` (periodic rules, exceptions, blocks, calendar) and `packages/db/src/schema/marketplace.ts` (pricing profiles, rules, booking).

### Availability tables

| Table | Purpose |
|---|---|
| `listing_availability_rule` | Recurring weekly windows: `(listingId, dayOfWeek, startMinute, endMinute)` |
| `listing_availability_exception` | One-off date overrides: `(listingId, date, isAvailable, startMinute?, endMinute?)` |
| `listing_availability_block` | Explicit blocked periods: `(listingId, source, startsAt, endsAt)` |
| `listing_minimum_duration_rule` | Min-duration constraints per time window (AVPR-01 stretch — skip for v1, not required) |

### Pricing tables

| Table | Purpose |
|---|---|
| `listing_pricing_profile` | Pricing profile per listing: `baseHourlyPriceCents`, fee BPS columns, `isDefault`, `validFrom/To` |
| `listing_pricing_rule` | Adjustments per profile: `ruleType`, `conditionJson`, `adjustmentType`, `adjustmentValue`, `priority` |

### Booking table (for overlap detection)

`booking` has `listingId`, `startsAt`, `endsAt`, `status`. Overlap check: select bookings where not-cancelled and intervals overlap.

---

## Legacy Behavioral Reference

### `pricingRuleMeta.ts`

Canonical `RuleType` union: `dayHourRange | passengerCount | dateRange | duration | dayOfWeek | hourRange`.

`PricingRuleBehavior.conflictMode`:
- `explicit` — take highest-priority, one per category
- `explicitExclusive` — overrides all others in category (dateRange holidays)
- `stackable` — one per `primaryCategory`, highest priority wins

### `pricingRuleResolver.ts`

`resolveApplicableRules(rules, applies)` — pure function, no DB dependency. Port as-is to `packages/pricing/src/rule-resolver.ts`. Already unit-testable.

### Legacy `PriceService` pattern

```
finalPrice = baseHourly * hours
adjustment = apply resolved rules (percentage or flat-cent delta)
fees = (base + adj) * (serviceFee + tax + acquiring) BPS / 10000
total = base + adjustment + fees
```

All amounts in integer cents. Fee rates stored in BPS (basis points).

---

## Architecture Decisions

### Two New Domain Packages

Following the `packages/catalog` template exactly:

**`packages/availability` (`@my-app/availability`)**
- `src/types.ts` — `Db`, row types, input interfaces
- `src/availability-service.ts` — CRUD for rules, exceptions, blocks + `checkSlotAvailable` / `assertSlotAvailable`
- `src/index.ts` — barrel export
- `src/__tests__/availability-service.test.ts` — PGlite tests

**`packages/pricing` (`@my-app/pricing`)**
- `src/types.ts` — `Db`, row types, `QuoteBreakdown`, input interfaces
- `src/rule-resolver.ts` — ported `resolveApplicableRules` (pure, no DB)
- `src/pricing-service.ts` — CRUD for profiles and rules
- `src/quote-service.ts` — `calculateQuote(input, db)` → `QuoteBreakdown`
- `src/index.ts` — barrel export
- `src/__tests__/pricing-service.test.ts` — PGlite tests for CRUD
- `src/__tests__/quote-service.test.ts` — TDD unit tests for `calculateQuote` (pure logic, minimal DB seed)

### Overlap Detection Strategy

```sql
SELECT id FROM booking
WHERE listing_id = $1
  AND status NOT IN ('cancelled')
  AND starts_at < $3  -- candidate endsAt
  AND ends_at > $2    -- candidate startsAt
LIMIT 1
```

Drizzle: `and(eq(booking.listingId, id), not(inArray(booking.status, ['cancelled'])), lt(booking.startsAt, endsAt), gt(booking.endsAt, startsAt))`.

`assertSlotAvailable` throws `Error("SLOT_UNAVAILABLE")` on any hit. Handler translates to `ORPCError("CONFLICT")`.

### Quote Calculation

```typescript
interface QuoteInput { listingId: string; startsAt: Date; endsAt: Date; passengers?: number; }
interface QuoteBreakdown {
  listingId: string; profileId: string;
  durationMinutes: number;
  baseCents: number;        // baseHourlyPriceCents * hours
  adjustmentCents: number;  // resolved rule adjustments
  serviceFeeCents: number;  // serviceFeeBps / 10000 * base
  taxCents: number;         // taxBps / 10000 * (base + adj)
  totalCents: number;
  currency: string;
}
```

`calculateQuote` is a deterministic function — testable with a fully seeded PGlite DB (seed a pricing profile + rules) or even with a mock DB. TDD candidate.

### RBAC Resources

Add to `packages/auth/src/organization-access.ts`:

```typescript
availability: ["create", "read", "update", "delete"],
pricing: ["create", "read", "update", "delete"],
```

Role grants:
- `org_owner` / `org_admin` / `manager` → full CRUD on both
- `agent` → `availability: ["read"]`, `pricing: ["read"]`
- `member` / `customer` → `[]` on both

Quote endpoint (`getQuote`) uses `publicProcedure` — no auth required for storefront quote calculation.

### oRPC contracts

**`packages/api-contract/src/routers/availability.ts`**
- `addRule`, `deleteRule`, `listRules` (tagged `["Availability"]`, org-protected)
- `addBlock`, `deleteBlock` (tagged `["Availability"]`, org-protected)
- `addException`, `deleteException` (tagged `["Availability"]`, org-protected)
- `checkSlot` — public, input `{ listingId, startsAt, endsAt }`, output `{ available: boolean }`

**`packages/api-contract/src/routers/pricing.ts`**
- `createProfile`, `updateProfile`, `listProfiles`, `getProfile` (tagged `["Pricing"]`, org-protected)
- `addRule`, `deleteRule` (tagged `["Pricing"]`, org-protected)
- `getQuote` — public, input `{ listingId, startsAt, endsAt, passengers? }`, output `QuoteBreakdown`

---

## Pitfalls to Avoid

- `listingAvailabilityBlock` has `calendarConnectionId` nullable — don't require it for `source: "manual"` blocks
- `listingAvailabilityException` has unique index on `(listingId, date)` — handle duplicate date upsert-or-conflict
- `listingPricingProfile.isDefault` — when creating, only one profile per listing should be default; use UPDATE to clear others first
- `conditionJson` in `listingPricingRule` is `jsonb` — must match the `ruleType` semantics from legacy `pricingRuleMeta.ts`
- BPS math: divide by 10000, use `Math.round()` to avoid fractional cents
- Booking status enum: values are `pending | confirmed | active | cancelled | completed` — exclude `cancelled` from overlap check, include all others

---

## Validation Architecture

The following automated checks verify Phase 4 is complete:

```bash
# AVPR-01: Availability CRUD
bun run --filter=@my-app/availability test  # all pass

# AVPR-02: Overlap protection  
# availability-service.test.ts must include a test: "assertSlotAvailable throws SLOT_UNAVAILABLE when booking exists"

# AVPR-03: Quote calculation
bun run --filter=@my-app/pricing test  # all pass, includes quote tests

# AVPR-04: Pricing domain code, not handlers
# grep -r "baseHourlyPriceCents\|calculateQuote" packages/api/src/handlers → 0 matches
# All calculation logic must live in packages/pricing

# Type check
bun run check-types --filter=@my-app/availability
bun run check-types --filter=@my-app/pricing
bun run check-types --filter=@my-app/api-contract
bun run check-types --filter=@my-app/api
```
