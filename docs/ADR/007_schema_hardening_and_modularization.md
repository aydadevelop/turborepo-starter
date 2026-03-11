# ADR-007: Database Schema Hardening and Modularization Roadmap

**Date:** 2026-03-10
**Status:** Superseded by [ADR-010: Schema Modernization Constitution](./010_schema_modernization_constitution.md)
**Authors:** Platform Team
**Related:** [ADR-006: PostgreSQL + Drizzle beta16 Best Practices](./006_postgres_drizzle_beta16_best_practices.md), [ADR-010: Schema Modernization Constitution](./010_schema_modernization_constitution.md)

---

## Context

Implementation status:

- Wave 1-4 rollout landed on 2026-03-10.
- `updated_at` safety is now backed by shared trigger SQL for the touched tables.
- low-risk `CHECK` constraints, partial unique indexes, onboarding persistence, and date-only availability exceptions are implemented.
- notification payload/metadata columns are being normalized to `jsonb`.
- overlap safety is committed as a dedicated GiST/exclusion migration artifact.

`packages/db` already follows several strong baseline practices:

- shared schema ownership lives in one package
- enum-heavy state modeling is used instead of ad hoc string unions in many newer tables
- migrations are committed and a real-Postgres verification lane exists
- most foreign keys on hot paths already have at least a basic supporting index

The current schema still carries structural debt that will keep leaking into service code unless PostgreSQL takes on more of the invariant enforcement burden.

The largest current audit targets are:

1. **App-enforced invariants instead of DB-enforced invariants**
   - `updated_at` is maintained through Drizzle's `$onUpdate()` helper in [`packages/db/src/schema/columns.ts`](/Users/d/Documents/Projects/turborepo-alchemy/packages/db/src/schema/columns.ts#L4) while [`packages/db/src/triggers.ts`](/Users/d/Documents/Projects/turborepo-alchemy/packages/db/src/triggers.ts#L1) is empty.
   - default/primary semantics are modeled with booleans but not enforced with partial unique indexes:
     - [`listing_pricing_profile.is_default`](/Users/d/Documents/Projects/turborepo-alchemy/packages/db/src/schema/marketplace.ts#L434)
     - [`listing_asset.is_primary`](/Users/d/Documents/Projects/turborepo-alchemy/packages/db/src/schema/marketplace.ts#L412)
     - [`listing_calendar_connection.is_primary`](/Users/d/Documents/Projects/turborepo-alchemy/packages/db/src/schema/availability.ts#L181)
   - write paths compensate in application code, for example [`packages/pricing/src/pricing-service.ts`](/Users/d/Documents/Projects/turborepo-alchemy/packages/pricing/src/pricing-service.ts#L30).

2. **Scheduling correctness is still vulnerable to race conditions**
   - booking overlap is checked in application code before insert in [`packages/booking/src/booking-service.ts`](/Users/d/Documents/Projects/turborepo-alchemy/packages/booking/src/booking-service.ts#L91).
   - overlapping bookings and availability blocks are detected with read queries in [`packages/booking/src/availability/availability-service.ts`](/Users/d/Documents/Projects/turborepo-alchemy/packages/booking/src/availability/availability-service.ts#L172).
   - the schema does not currently use range types, exclusion constraints, or lock-based write orchestration for these invariants.

3. **Range and numeric invariants are implied, not enforced**
   - examples include:
     - [`listingAvailabilityRule.dayOfWeek/startMinute/endMinute`](/Users/d/Documents/Projects/turborepo-alchemy/packages/db/src/schema/availability.ts#L71)
     - [`listing.workingHoursStart/workingHoursEnd`](/Users/d/Documents/Projects/turborepo-alchemy/packages/db/src/schema/marketplace.ts#L350)
     - [`booking.startsAt/endsAt`](/Users/d/Documents/Projects/turborepo-alchemy/packages/db/src/schema/marketplace.ts#L657)
     - [`listingReview.rating`](/Users/d/Documents/Projects/turborepo-alchemy/packages/db/src/schema/marketplace.ts#L1051)
     - [`cancellationPolicy.penaltyBps/latePenaltyBps`](/Users/d/Documents/Projects/turborepo-alchemy/packages/db/src/schema/marketplace.ts#L1273)
   - the schema currently defines no `check()` constraints in `packages/db/src/schema/**`.

4. **Time semantics are still mixed in calendar-oriented areas**
   - [`listingAvailabilityException.date`](/Users/d/Documents/Projects/turborepo-alchemy/packages/db/src/schema/availability.ts#L95) is stored as `timestamp with time zone` even though the table is described as a one-off date override.

5. **Schema organization is becoming monolithic**
   - [`packages/db/src/schema/marketplace.ts`](/Users/d/Documents/Projects/turborepo-alchemy/packages/db/src/schema/marketplace.ts) is 1309 lines.
   - [`packages/db/src/relations.ts`](/Users/d/Documents/Projects/turborepo-alchemy/packages/db/src/relations.ts) is 976 lines.
   - this increases merge pressure, weakens bounded-context ownership, and makes local review harder than it needs to be.

6. **Structured payloads are stored inconsistently**
   - newer modules use `jsonb`, but some app-owned fields still use `text`:
     - [`notificationEvent.payload`](/Users/d/Documents/Projects/turborepo-alchemy/packages/db/src/schema/notification.ts#L82)
     - [`notificationIntent.metadata`](/Users/d/Documents/Projects/turborepo-alchemy/packages/db/src/schema/notification.ts#L121)
     - [`notificationDelivery.responsePayload`](/Users/d/Documents/Projects/turborepo-alchemy/packages/db/src/schema/notification.ts#L155)
     - [`notificationInApp.metadata`](/Users/d/Documents/Projects/turborepo-alchemy/packages/db/src/schema/notification.ts#L228)
     - [`organization.metadata`](/Users/d/Documents/Projects/turborepo-alchemy/packages/db/src/schema/auth.ts#L130)

7. **A few operational indexes are missing or under-specified**
   - [`workflowStepLog.executionId`](/Users/d/Documents/Projects/turborepo-alchemy/packages/db/src/schema/workflow.ts#L26) has no explicit index.
   - overlap queries currently rely on single-column indexes on `starts_at` rather than composite or range-aware strategies on active booking/block subsets.

## Decision

We will move the schema toward a **database-enforced, bounded-context-oriented** model in phases.

The repo will standardize on the following decisions for new work and for opportunistic refactors:

1. Core business invariants must be enforced in PostgreSQL whenever PostgreSQL can express them.
2. Application services may still validate early, but they must not be the only layer protecting correctness.
3. `packages/db/src/triggers.ts` becomes an active extension point for trigger/functions that Drizzle cannot model directly.
4. Hot scheduling tables will adopt range-aware modeling and exclusion-based protection where overlap rules are authoritative.
5. Boolean "single winner" flags must be backed by partial unique indexes.
6. Schema files and relations must be decomposed by bounded context instead of continuing to grow around one large module.
7. Structured machine-readable payloads in app-owned tables should use `jsonb`, with typed adapters at the boundary.

## Detailed Decisions

### 1. Audit timestamps become DB-enforced

- Keep the shared `timestamps` helper for column declaration ergonomics.
- Stop treating `$onUpdate(() => new Date())` as the authoritative `updated_at` strategy.
- Introduce a shared Postgres trigger function applied through `POST_MIGRATION_TRIGGERS_SQL` for tables that own `updated_at`.
- Continue allowing application-side explicit `updatedAt` writes, but the database becomes the last line of defense.

Rationale:

- raw SQL, import scripts, future admin tooling, and non-Drizzle writers should not bypass audit semantics
- the system of record should own audit correctness, not only the ORM mapper

### 2. Add `CHECK` constraints for obvious domain ranges

Introduce `CHECK` constraints for invariants that are already documented in code comments or business language:

- `day_of_week BETWEEN 0 AND 6`
- minute/hour ranges and `end > start`
- `starts_at < ends_at`
- cents and counts `>= 0` where negative values are nonsensical
- basis-point fields `BETWEEN 0 AND 10000`
- review ratings constrained to the supported scale

Rationale:

- these are low-ambiguity rules
- they reduce defensive code branches
- they keep bad seed, script, and test data from normalizing invalid states

### 3. Use partial unique indexes for "exactly one default/primary" semantics

Add partial unique indexes for rows where only one active/default record should exist within a scope.

Initial targets:

- one default pricing profile per listing
- one primary listing asset per listing and asset kind where relevant
- one primary active calendar connection per listing and provider

Rationale:

- the current app code manually clears old defaults before insert/update
- the DB should reject broken states even if two writers race

### 4. Make scheduling invariants range-aware and race-safe

For booking and availability overlap protection:

- model the interval explicitly using a generated range expression or dedicated range column
- add GiST-backed exclusion constraints where the business rule is "these intervals must not overlap"
- keep cancellation and inactive-state exceptions explicit in the design
- move the booking creation path to a transaction that treats the database constraint as the final arbiter

Initial targets:

- active availability blocks per listing
- confirmed or otherwise capacity-consuming bookings per listing

Rationale:

- current read-then-insert flow can double-book under concurrency
- PostgreSQL already has first-class primitives for temporal conflicts

### 5. Correct calendar-day modeling

- Migrate calendar-only business concepts to `date(..., { mode: "string" })`.
- The first audit target is `listing_availability_exception.date`.
- For changes that affect API shape, provide a compatibility layer in domain services and contracts during rollout.

Rationale:

- day-only business meaning should not be stored as an instant
- this avoids timezone drift and duplicate-key surprises caused by offset-normalized timestamps

### 6. Normalize structured payload columns to `jsonb`

For app-owned tables, prefer `jsonb` over stringified JSON where the payload is machine-readable and later processing may inspect fields.

Initial targets:

- notification event payloads
- notification intent metadata
- delivery provider payloads
- in-app notification metadata

The auth schema must be evaluated case by case because some fields may be constrained by Better Auth compatibility expectations.

### 7. Decompose schema and relations by bounded context

Refactor the current module layout toward:

- `packages/db/src/schema/auth/*.ts`
- `packages/db/src/schema/marketplace/listings.ts`
- `packages/db/src/schema/marketplace/pricing.ts`
- `packages/db/src/schema/marketplace/publications.ts`
- `packages/db/src/schema/marketplace/bookings.ts`
- `packages/db/src/schema/marketplace/reviews.ts`
- `packages/db/src/schema/marketplace/staffing.ts`
- `packages/db/src/schema/availability/*.ts`
- `packages/db/src/relations/<context>.ts`

`packages/db/src/schema/index.ts` remains the public re-export boundary.

Rationale:

- lower merge conflict density
- clearer ownership between packages such as `booking`, `pricing`, `catalog`, `payment`, and `availability`
- smaller review surfaces and easier focused tests

### 8. Tighten index design around real query shapes

Add or revisit indexes for known hot paths:

- `workflow_step_log(execution_id)` and possibly `(execution_id, started_at)`
- booking and availability overlap paths with composite or range-aware indexing
- unread in-app notification lookups with partial indexes on `viewed_at IS NULL`
- pricing profile selection on active, non-archived defaults

Index additions should be justified against actual query shapes and validated with `EXPLAIN (ANALYZE, BUFFERS)` for production-like data volumes.

## Rollout Plan

### Phase 1: Low-risk hardening

- activate `POST_MIGRATION_TRIGGERS_SQL` with shared `updated_at` trigger support
- add missing operational indexes
- add non-controversial `CHECK` constraints
- add schema tests that assert new constraints at the PGlite level where possible and real Postgres where needed

### Phase 2: Default/primary correctness

- add partial unique indexes for default and primary flags
- update service code to rely on transactions and conflict handling instead of blind multi-step toggles
- keep API behavior stable while reducing app-side cleanup logic

### Phase 3: Scheduling correctness

- introduce range-aware schema support for bookings and availability blocks
- add exclusion constraints and supporting GiST indexes
- move booking creation and availability mutation flows to transactionally safe writes
- verify with concurrency-focused tests

### Phase 4: Time-semantics cleanup

- migrate `listing_availability_exception.date` to a calendar-day type
- audit other date-like names for instant-vs-day mismatch
- update contract serialization and fixtures to use deterministic calendar strings where appropriate

### Phase 5: Modularization

- split `marketplace.ts` and `relations.ts` by bounded context
- keep export surfaces stable to avoid downstream churn
- move context-specific schema tests closer to the owning domain package when practical

### Phase 6: Payload normalization

- convert app-owned structured text blobs to `jsonb`
- add typed read/write adapters and migration scripts where legacy text is already persisted
- defer compatibility-sensitive auth fields until the Better Auth contract is verified

## Success Criteria

- no core business invariant relies solely on service-layer discipline when PostgreSQL can enforce it
- no bounded-context schema file exceeds a review-hostile size threshold
- scheduling writes are race-safe under concurrent execution
- machine-readable payloads are queryable and typed as `jsonb`
- `updated_at` stays correct even for non-ORM writers
- hot read paths have explicit indexing stories and plan validation

## Consequences

### Positive

- less duplicate guard logic in services
- lower risk of silent data drift under concurrency
- clearer ownership boundaries in the schema
- better long-term maintainability as the marketplace domain grows

### Tradeoffs

- more migration work in the short term
- some improvements, especially exclusion constraints and calendar-day migrations, need real-Postgres verification rather than only PGlite coverage
- partial indexes and triggers add DDL complexity, but that complexity is cheaper than keeping correctness purely in application code

## Deferred Decisions

The following items are intentionally deferred until after the hardening phases above:

- full ID-type migration from `text` to `uuid`
- generated range columns versus dedicated persisted range columns
- auth-table payload changes that may affect Better Auth interoperability
