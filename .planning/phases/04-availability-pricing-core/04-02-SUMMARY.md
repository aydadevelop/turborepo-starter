# 04-02 Summary: Pricing Package Scaffold (TDD)

## Status: COMPLETE
**Commit:** 91b9e11
**Tests:** 10/10 passing (3 quote-service + 7 pricing-service)

## What Was Built

### `packages/pricing/`

New domain package `@my-app/pricing` providing pricing profiles, rules, and quote calculation.

**`src/types.ts`**: Core types
- `Db` — drizzle-orm db client type alias
- `PricingProfileRow`, `PricingRuleRow` — DB row shapes
- `QuoteBreakdown` — quote output with baseCents, adjustmentCents, serviceFeeCents, taxCents, totalCents
- `QuoteInput` — listingId, startsAt, endsAt, passengers
- `CreatePricingProfileInput`, `UpdatePricingProfileInput`, `CreatePricingRuleInput`

**`src/rule-resolver.ts`**: Pure functions, no DB imports
- `RuleType` union: "dayHourRange" | "passengerCount" | "dateRange" | "duration" | "dayOfWeek" | "hourRange"
- `PRICING_RULE_BEHAVIORS` — maps rule types to behavior (explicit/time, explicitExclusive/date, stackable/bookingAttribute)
- `getRuleBehavior(ruleType)` — returns behavior, falls back to stackable/other
- `resolveApplicableRules<T>(rules, applies)` — conflict resolution: explicitExclusive → highest priority wins; explicit → one highest; stackable → best per primaryCategory

**`src/pricing-service.ts`**: CRUD functions (all accept `db: Db` as last param)
- `createPricingProfile(input, db)` — verifies listing ownership; sets prior defaults to false when `isDefault=true`
- `updatePricingProfile(input, db)` — throws `Error("NOT_FOUND")` if not found
- `listPricingProfiles(listingId, organizationId, db)` — ordered by isDefault DESC, createdAt ASC; filters archivedAt IS NULL
- `createPricingRule(input, db)` — verifies profile ownership
- `deletePricingRule(id, organizationId, db)` — throws `Error("NOT_FOUND")`

**`src/quote-service.ts`**: `calculateQuote(input, db): Promise<QuoteBreakdown>`
1. Find default profile (isDefault=true, archivedAt IS NULL) → throws `Error("NO_PRICING_PROFILE")`
2. Load active rules for profile
3. `durationMinutes = Math.round((endsAt - startsAt) / 60000)`
4. `baseCents = Math.round(profile.baseHourlyPriceCents * durationMinutes / 60)`
5. `resolveApplicableRules` with predicate (alwaysApply, days array, minPassengers, minDurationMinutes)
6. adjustments: percent → `Math.round(baseCents * value / 100)`; flat_cents → value
7. `serviceFeeCents = Math.round(subtotal * serviceFeeBps / 10000)`
8. `taxCents = Math.round((subtotal + serviceFeeCents) * taxBps / 10000)`

## Key Decisions & Gotchas

- **`listPricingProfiles` test must be self-contained** — don't rely on state from `createPricingProfile` describe blocks; create its own seed profiles in beforeAll.
- **Rule resolver ported from legacy** — adapted from `pricingRuleBehaviorMeta.ts` and `pricingRuleResolver.ts` in legacy codebase.
- Unused `inArray` import removed from pricing-service.ts.

## Artifacts

```
packages/pricing/
  package.json
  tsconfig.json
  vitest.config.ts
  src/
    types.ts
    rule-resolver.ts
    pricing-service.ts
    quote-service.ts
    index.ts
    __tests__/
      pricing-service.test.ts
      quote-service.test.ts
```
