# ADR-010: Schema Modernization Constitution

**Date:** 2026-03-11
**Status:** Accepted
**Authors:** Platform Team
**Related:** [ADR-006: PostgreSQL + Drizzle beta16 Best Practices](./006_postgres_drizzle_beta16_best_practices.md), [ADR-007: Schema Hardening and Modularization Roadmap](./007_schema_hardening_and_modularization.md)

---

## Context

This repository already landed meaningful schema hardening after ADR-007:

- shared trigger SQL exists in [`packages/db/src/triggers.ts`](/Users/d/Documents/Projects/turborepo-alchemy/packages/db/src/triggers.ts)
- GiST exclusion constraints are committed in [`packages/db/src/migrations/20260310213000_gist_overlap_safety/migration.sql`](/Users/d/Documents/Projects/turborepo-alchemy/packages/db/src/migrations/20260310213000_gist_overlap_safety/migration.sql)
- availability and related newer tables already use `CHECK` constraints
- the fast `packages/db` Vitest lane currently passes with 47 tests via `bun run test`

ADR-007 captured the right direction, but its audit is now stale. The remaining problems are no longer "add basic hardening everywhere." The remaining problems are:

1. schema ownership is still too monolithic
2. the fast PGlite lane still shapes runtime schema decisions too much
3. the ID strategy is inconsistent across app-owned tables
4. several backrefs and hot lookup paths are still missing support indexes
5. important invariants remain soft in older marketplace and notification tables
6. JSONB is still used for scalar lists and config that should be typed more explicitly
7. some write paths still perform read-before-write uniqueness checks instead of letting constraints arbitrate

This ADR supersedes ADR-007 and acts as the umbrella constitution for the remaining modernization work. It extends ADR-006 instead of repeating it. ADR-006 remains the baseline convention set for PostgreSQL + Drizzle work in this repository.

Because this product is not yet in production, the repo should optimize for the clean launch baseline rather than for backward-compatible retrofit choreography.

## Decision

We adopt the following schema constitution for all non-auth app-owned data:

1. `@my-app/db/schema` remains the stable public barrel, but schema implementation must be decomposed into bounded-context modules.
2. `packages/db/src/relations.ts` remains the stable public relation entrypoint, but it must be assembled from per-context relation fragments instead of a single handwritten catch-all registry.
3. PG18 is the supported runtime and migration baseline for schema capability decisions. PGlite remains the fast correctness lane only.
4. PGlite limitations must not block production schema features, extensions, triggers, or DDL patterns that are supported in PG18.
5. All non-auth app-owned primary and foreign keys standardize on PostgreSQL `uuid` columns with DB-side `uuidv7()` defaults as the target state.
6. Better Auth-owned tables are the compatibility boundary and are excluded from UUID normalization unless the auth integration explicitly supports that change.
7. Pre-production status permits destructive cleanup for non-auth schema: dropping obsolete columns, retyping IDs, replacing JSONB scalar lists, and removing legacy shapes instead of carrying compatibility shims.
8. Internal service interfaces and public oRPC contracts may be cleaned up when schema normalization makes current shapes awkward or misleading.
9. Shared schema helpers become the only approved way to define UUID IDs, audit columns, typed metadata JSONB, native arrays, basis-point checks, money/count checks, and common range/window checks.
10. New app-owned tables may not introduce `serial`, app-assigned text primary keys, or JSONB arrays for homogeneous scalar lists.
11. `jsonb` is reserved for opaque metadata and provider payload storage. Repeatedly queried config and homogeneous scalar lists must move to typed columns, child tables, or native Postgres arrays.
12. GiST exclusion constraints remain the canonical overlap mechanism for bookings and availability. ADR-010 does not switch the repo to `WITHOUT OVERLAPS`.
13. Every foreign key must be indexed or explicitly whitelisted with a documented justification.
14. Unambiguous business invariants belong in DDL, not only in services.
15. Read-before-write uniqueness checks are transitional debt. Constraint-driven writes with `onConflict` or transactional arbitration are the target mutation style.

## Governance Checklist

The checklist is also tracked as a standalone repo artifact at
[`docs/schema-governance-checklist.md`](/Users/d/Documents/Projects/turborepo-alchemy/docs/schema-governance-checklist.md).

Every schema change must answer these questions:

- Does the table use the approved UUID helper, or is it an explicitly exempt auth-owned table?
- Is every foreign key indexed, or explicitly whitelisted with justification?
- Are scalar lists stored as native arrays instead of JSONB?
- Is JSONB limited to metadata or provider payloads?
- Are non-negative money and count fields protected with `CHECK` constraints?
- Are basis-point fields constrained to `0..10000`?
- Are time-window invariants encoded in DDL where the rule is unambiguous?
- Does the write path rely on constraints instead of pre-read uniqueness checks?
- Does the fast PGlite lane still pass?
- Does the change require PG18 migration replay or trigger/extension verification?

## Current Audit Targets

### 1. Bounded-context decomposition is in progress

Phase 2 has already started:

- [`packages/db/src/schema/marketplace.ts`](/Users/d/Documents/Projects/turborepo-alchemy/packages/db/src/schema/marketplace.ts) is now a stable barrel over `packages/db/src/schema/marketplace/*`
- [`packages/db/src/relations.ts`](/Users/d/Documents/Projects/turborepo-alchemy/packages/db/src/relations.ts) is now a stable merger over `packages/db/src/relations/*`

Remaining work is no longer "split the root files once." The remaining work is:

- continue the same bounded-context treatment where other schema areas still rely on large single-file ownership
- move more common column and invariant patterns behind shared helpers
- keep the public barrels stable while internal ownership keeps getting narrower

Target structure:

- `auth`
- `availability`
- `marketplace/listings`
- `marketplace/pricing`
- `marketplace/payments`
- `marketplace/bookings`
- `marketplace/reviews`
- `marketplace/staffing`
- `support`
- `notifications`
- `workflow`
- `system`

External import paths remain stable through the existing public barrels.

### 2. Fast test lane pressure on production schema

[`packages/db/src/schema/marketplace.ts`](/Users/d/Documents/Projects/turborepo-alchemy/packages/db/src/schema/marketplace.ts) still documents extension-backed omissions because [`packages/db/src/test/index.ts`](/Users/d/Documents/Projects/turborepo-alchemy/packages/db/src/test/index.ts) pushes the full runtime schema into PGlite with `pushSchema`. Trigger behavior is mirrored via [`packages/db/src/triggers.ts`](/Users/d/Documents/Projects/turborepo-alchemy/packages/db/src/triggers.ts).

That is acceptable for the fast lane, but it is no longer acceptable as a reason to avoid production schema features. The constitutional rule is:

> PGlite is the fast lane. PG18 is the DDL truth.

### 3. Inconsistent ID strategy

Current live state:

- most domain tables still use app-supplied `text` IDs
- [`packages/db/src/schema/workflow.ts`](/Users/d/Documents/Projects/turborepo-alchemy/packages/db/src/schema/workflow.ts) uses DB-generated text IDs via `gen_random_uuid()`
- [`packages/db/src/schema/todo.ts`](/Users/d/Documents/Projects/turborepo-alchemy/packages/db/src/schema/todo.ts) still uses `serial`

Target state:

- all non-auth app-owned PKs and FKs use PostgreSQL `uuid`
- new schema uses DB-side `uuidv7()` defaults
- TypeScript and API contracts keep IDs typed as `string`

### 4. Missing support indexes

The first ADR-010 index batch has already landed in
[`packages/db/src/migrations/20260311053438_plain_sway/migration.sql`](/Users/d/Documents/Projects/turborepo-alchemy/packages/db/src/migrations/20260311053438_plain_sway/migration.sql),
covering:

- `workflow_step_log.execution_id`
- `organization_payment_config.provider_config_id`
- `listing_publication.merchant_payment_config_id`
- `listing_publication.pricing_profile_id`
- `booking.publication_id`
- `booking.merchant_organization_id`
- `booking.merchant_payment_config_id`
- `listing_availability_block.calendar_connection_id`
- `support_ticket_message.inbound_message_id`
- `payment_webhook_event.request_signature` via a partial unique idempotency index

Future audits should treat these as the baseline and focus on whatever FK or hot-path gaps remain after that batch.

### 5. Remaining soft invariants

The repo already has some meaningful checks. The remaining important soft invariants include:

- booking non-negative money/count fields and `starts_at < ends_at`
- booking shift request price, passenger, and decision-state consistency
- booking refund status-aligned timestamps and actor columns
- `listing_review.rating` bounds
- `listing_location.latitude` / `listing_location.longitude` bounds
- `notification_preference.quiet_hours_start` / `quiet_hours_end` bounds

#### Invariant matrix

The following rules are constitutional defaults for app-owned tables where the semantics are unambiguous:

- money and count fields are non-negative
- basis points are in `0..10000`
- ratings are bounded to the supported scale
- latitude is in `-90..90`
- longitude is in `-180..180`
- `starts_at < ends_at`
- terminal or decision states require the relevant actor and timestamp
- cancellation and refund timestamps align with lifecycle status
- processed and resolved timestamps align with processed/resolved states

### 6. JSONB scalar-list misuse

Current live examples include:

- `defaultAmenityKeys`
- `requiredFields`
- `supportedPricingModels`
- `supportedCurrencies`
- `daysOfWeek`

These should move to native arrays or more explicit typed structures. Generic metadata blobs should not carry repeatedly queried config.

### 7. Mutation paths that still rely on pre-read uniqueness

Named current exemplars:

- [`packages/booking/src/availability/availability-service.ts`](/Users/d/Documents/Projects/turborepo-alchemy/packages/booking/src/availability/availability-service.ts)
- [`packages/payment/src/payment-service.ts`](/Users/d/Documents/Projects/turborepo-alchemy/packages/payment/src/payment-service.ts)

These paths should migrate toward constraint-driven writes, `onConflict` handling, and transactional arbitration rather than read-before-write duplicate detection.

## Roadmap

### Phase 1: Constitution and governance

- author ADR-010
- mark ADR-007 superseded
- add and adopt the schema governance checklist

### Phase 2: Bounded-context decomposition

- split `packages/db/src/schema` into bounded-context modules
- split relation ownership into per-context fragments
- keep public import paths stable through the existing barrels

Status:

- marketplace schema barrel landed
- relation fragments landed
- governance meta-tests now pin both decompositions

### Phase 3: Foundational destructive migrations

Group migrations by concern, not by file split:

- UUID normalization for non-auth tables
- native-array adoption
- missing FK and hot-path indexes
- invariant checks
- removal of obsolete fields and legacy shapes

Status:

- the initial hot-path index migration batch has landed
- UUID normalization, native-array adoption, and the remaining destructive cleanup are still pending

### Phase 4: Write-path and contract cleanup

- update domain services to rely on constraints as the source of truth
- remove redundant read-before-write uniqueness checks
- normalize idempotent upsert patterns
- clean up internal service and oRPC shapes where the normalized schema makes old shapes undesirable

### Phase 5: Test-lane rebalance

- keep PGlite as the fast lane
- make PG18 migration replay and DDL verification the default CI lane for extension-backed work, triggers, exclusion constraints, and UUID-sensitive migrations
- stop allowing PGlite limitations to block production schema features

### Phase 6: Schema meta-tests

Add lint-style or meta-test assertions that fail when new schema reintroduces:

- unindexed foreign keys
- `serial`
- non-auth text primary keys
- JSONB scalar arrays

## Consequences

### Positive

- the schema converges toward a cleaner launch baseline before production
- schema ownership becomes easier to reason about by bounded context
- PG18 becomes the real DDL authority instead of the fast-lane test harness
- service code sheds defensive uniqueness checks that should live in constraints
- new schema work gets a much stricter and more reusable governance model

### Tradeoffs

- UUID normalization and destructive cleanup will create broad migration churn
- some internal service and public oRPC contracts will change before launch
- the fast lane will remain useful, but more DDL-sensitive work will require PG18 replay by default
