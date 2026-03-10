---
phase: 04-availability-pricing-core
plan: "01"
subsystem: availability
tags: [availability, rbac, scheduling, overlap, domain-package]

requires:
  - phase: 03-org-access-catalog-storefront
    provides: "listing domain foundation and organization-scoped permissions"
provides:
  - "@my-app/availability service package for rules, blocks, exceptions, and slot checks"
  - "availability and pricing RBAC resources across organization roles"
  - "test coverage for ownership and overlap protection behavior"
affects: [availability, pricing, booking, operator-surfaces]

tech-stack:
  added: []
  patterns:
    - "Availability services verify listing ownership through the listing table instead of duplicating org columns"
    - "Package services throw plain domain errors and accept db as the final argument"

key-files:
  created:
    - packages/availability/src/types.ts
    - packages/availability/src/availability-service.ts
    - packages/availability/src/index.ts
    - packages/availability/src/__tests__/availability-service.test.ts
  modified:
    - packages/auth/src/organization-access.ts

key-decisions:
  - "Duplicate-date detection is handled with a pre-check query because PGlite hides useful constraint names"
  - "Availability ownership is derived through listing joins because listingAvailabilityRule has no organizationId column"

patterns-established:
  - "Availability CRUD belongs in package-owned services with explicit org/listing validation"
  - "RBAC resource additions ship alongside focused permission tests"

requirements-completed:
  - AVPR-01
  - AVPR-02

duration: "n/a"
completed: 2026-03-10
---

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
