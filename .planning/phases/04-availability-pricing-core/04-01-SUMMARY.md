# 04-01 Summary: Availability Package Scaffold + RBAC

## Status: COMPLETE
**Commit:** c24d67a
**Tests:** 15/15 passing

## What Was Built

### `packages/availability/`

New domain package `@my-app/availability` providing service-layer functions for availability management.

**`src/types.ts`**: Core types
- `Db` — drizzle-orm db client type alias
- `AvailabilityRuleRow` — recurring weekly schedule rule
- `AvailabilityBlockRow` — explicit time blocks (manual holds)
- `AvailabilityExceptionRow` — date overrides for availability
- `CreateAvailabilityRuleInput`, `CreateAvailabilityBlockInput`, `CreateAvailabilityExceptionInput`

**`src/availability-service.ts`**: 9 exported functions (all accept `db: Db` as last param)
- `createAvailabilityRule(input, db)` — verifies listing ownership via listing table, inserts rule
- `deleteAvailabilityRule(id, organizationId, db)` — throws `Error("NOT_FOUND")` if not found
- `listAvailabilityRules(listingId, organizationId, db)` — ordered by dayOfWeek ASC, startMinute ASC
- `createAvailabilityBlock(input, db)` — inserts block with source="manual"
- `deleteAvailabilityBlock(id, organizationId, db)`
- `createAvailabilityException(input, db)` — pre-check SELECT for DUPLICATE_DATE (not constraint catching)
- `deleteAvailabilityException(id, organizationId, db)`
- `checkSlotAvailable(listingId, startsAt, endsAt, db): Promise<boolean>`
- `assertSlotAvailable(...)` — throws `Error("SLOT_UNAVAILABLE")`

**`src/__tests__/availability-service.test.ts`**: 15 tests covering all service functions.

### `packages/auth/src/organization-access.ts`

Added `availability` and `pricing` resources to all 6 roles:
- owner/admin/manager: full CRUD on both
- agent/member: read-only on both
- customer: empty arrays for both

## Key Decisions & Gotchas

- **`listingAvailabilityRule` has NO `organizationId` column** — ownership always verified via the `listing` table join (not direct column on rule).
- **DUPLICATE_DATE uses pre-check SELECT** — PGlite wraps constraint violations with generic "Failed query" message hiding the constraint name. Fixed by running a SELECT before INSERT.
- **Date column for exceptions** — `date` field is a date column that returns as a JS Date object.

## Artifacts

```
packages/availability/
  package.json
  tsconfig.json
  vitest.config.ts
  src/
    types.ts
    availability-service.ts
    index.ts
    __tests__/
      availability-service.test.ts
packages/auth/src/organization-access.ts  (modified)
```
