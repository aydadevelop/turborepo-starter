---
phase: 04-availability-pricing-core
plan: "03"
subsystem: api
tags: [availability, pricing, orpc, handlers, transport]

requires:
	- phase: 04-availability-pricing-core
		provides: "availability and pricing package services"
provides:
	- "oRPC contracts and thin handlers for availability CRUD and slot checks"
	- "oRPC contracts and thin handlers for pricing profile/rule management and quote lookup"
	- "public transport seams for check-slot and get-quote operations"
affects: [api, availability, pricing, web]

tech-stack:
	added: []
	patterns:
		- "Handlers translate plain domain errors into ORPCError codes without embedding business logic"
		- "Public quote and slot-check endpoints stay separate from operator-authenticated CRUD endpoints"

key-files:
	created:
		- packages/api-contract/src/routers/availability.ts
		- packages/api-contract/src/routers/pricing.ts
		- packages/api/src/handlers/availability.ts
		- packages/api/src/handlers/pricing.ts
	modified:
		- packages/api-contract/src/routers/index.ts
		- packages/api/src/handlers/index.ts
		- packages/api/package.json

key-decisions:
	- "Transport wiring exposes getQuote and checkSlot publicly while operator CRUD stays permission-guarded"
	- "Handler formatting normalizes Date columns to ISO strings at the edge"

patterns-established:
	- "oRPC contracts mirror package-owned availability and pricing service boundaries"
	- "Thin handlers are responsible for auth and error translation only"

requirements-completed: []

duration: "n/a"
completed: 2026-03-10
---

# 04-03 Summary: Transport Wiring (oRPC Contracts + Handlers)

## Status: COMPLETE
**Commit:** ef149a9
**Type check:** ✅ @my-app/api, @my-app/api-contract

## What Was Built

### `packages/api-contract/src/routers/availability.ts`

8 oRPC procedure contracts:
- `addRule` — input: listingId, dayOfWeek, startMinute, endMinute; output: AvailabilityRuleRow (ISO dates)
- `deleteRule` — input: id; output: `{ success: true }`
- `listRules` — input: listingId; output: AvailabilityRuleRow[]
- `addBlock` — input: listingId, startsAt (ISO string), endsAt (ISO string), reason?; output: block row (ISO dates)
- `deleteBlock` — input: id; output: `{ success: true }`
- `addException` — input: listingId, date (ISO string), isAvailable, startMinute?, endMinute?, reason?; output: exception row
- `deleteException` — input: id; output: `{ success: true }`
- `checkSlot` — input: listingId, startsAt, endsAt; output: `{ available: boolean }` (public, no auth)

### `packages/api-contract/src/routers/pricing.ts`

6 oRPC procedure contracts:
- `createProfile` — input: listingId, name, baseHourlyPriceCents, serviceFeeBps, taxBps, isDefault?; output: PricingProfileRow
- `updateProfile` — input: id, name?, baseHourlyPriceCents?, isDefault?; output: PricingProfileRow
- `listProfiles` — input: listingId; output: PricingProfileRow[]
- `addRule` — input: profileId, ruleType, conditions, adjustmentType, adjustmentValue, priority?; output: PricingRuleRow
- `deleteRule` — input: id; output: `{ success: true }`
- `getQuote` — input: listingId, startsAt, endsAt, passengers; output: QuoteBreakdown (public, no auth)

### `packages/api-contract/src/routers/index.ts` (updated)

Added `availability: availabilityContract` and `pricing: pricingContract` to `appContract`.

### `packages/api/src/handlers/availability.ts`

8 thin handlers mapping contracts to domain service calls:
- All CRUD handlers use `organizationPermissionProcedure({ availability: [action] })`
- `checkSlot` uses `publicProcedure` (no auth required)
- Error translation: `Error("NOT_FOUND")` → `ORPCError("NOT_FOUND")`, `Error("DUPLICATE_DATE")` → `ORPCError("CONFLICT")`
- Date columns formatted via `.toISOString()`

### `packages/api/src/handlers/pricing.ts`

6 thin handlers:
- All CRUD handlers use `organizationPermissionProcedure({ pricing: [action] })`
- `getQuote` uses `publicProcedure` (no auth required)
- Error translation: `Error("NOT_FOUND")` → `ORPCError("NOT_FOUND")`, `Error("NO_PRICING_PROFILE")` → `ORPCError("NOT_FOUND", { message: "..." })`

### `packages/api/src/handlers/index.ts` (updated)

Added `availability: availabilityRouter` and `pricing: pricingRouter` to `appRouter`.

### `packages/api/package.json` (updated)

Added `@my-app/availability: "workspace:*"` and `@my-app/pricing: "workspace:*"` to dependencies.

## Artifacts

```
packages/api-contract/src/routers/availability.ts  (new)
packages/api-contract/src/routers/pricing.ts       (new)
packages/api-contract/src/routers/index.ts         (modified)
packages/api/src/handlers/availability.ts          (new)
packages/api/src/handlers/pricing.ts               (new)
packages/api/src/handlers/index.ts                 (modified)
packages/api/package.json                          (modified)
```
