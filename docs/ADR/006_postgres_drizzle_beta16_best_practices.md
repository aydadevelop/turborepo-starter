# ADR-006: PostgreSQL + Drizzle beta16 Best Practices

**Date:** 2026-03-10
**Status:** Active
**Authors:** Platform Team
**Related:** [ADR-002: Architecture Patterns](./002_architecture-patterns.md) | [ADR-005: oRPC API Boundary](./005-orpc_api_boundary.md)

---

## Table of Contents

1. [Context](#context)
2. [Decision](#decision)
3. [Schema Conventions](#schema-conventions)
4. [Time and Date Semantics](#time-and-date-semantics)
5. [Query Conventions](#query-conventions)
6. [Mutation Conventions](#mutation-conventions)
7. [Testing Conventions](#testing-conventions)
8. [Migration Conventions](#migration-conventions)
9. [Beta16 Notes](#beta16-notes)
10. [Known Audit Targets](#known-audit-targets)
11. [Consequences](#consequences)

---

## Context

This repository is standardized on `drizzle-orm@1.0.0-beta.16-*` and `drizzle-kit@1.0.0-beta.16-*`, with the shared schema owned by `packages/db` and business logic spread across domain packages.

As the codebase grows, we need a single repo-level source for:

- what belongs in schema vs domain logic vs transport
- how to model timestamps, dates, and business-local calendar concepts
- how to structure read queries and write flows
- how to test fast with PGlite without confusing that for final DDL validation
- how to work safely within Drizzle's beta-era behavior changes

This ADR exists because “dates are hard” is not a strategy, and this repo already has enough time-related columns to manufacture creative bugs at industrial scale.

## Decision

We adopt the following conventions for all new PostgreSQL + Drizzle work in this repository:

1. `packages/db` owns shared schema and migration artifacts.
2. Domain packages own business queries and mutations.
3. `timestamp(..., { withTimezone: true, mode: "date" })` remains the default for **absolute instants**.
4. `date(..., { mode: "string" })` is preferred for **calendar-only** concepts.
5. Multi-row business writes use transactions; multi-step externalized flows use workflows.
6. Migration-first development (`generate` + `migrate`) is the canonical path; `push` is not.
7. PGlite is the fast correctness lane; real Postgres is the DDL verification lane.

## Schema Conventions

- Shared schema entrypoint: `packages/db/src/schema/index.ts`
- Migration output: `packages/db/src/migrations`
- Shared audit timestamps: `packages/db/src/schema/columns.ts`
- Prefer `jsonb()` for structured payloads over stringified JSON.
- Index foreign keys and high-cardinality filter columns.
- Use explicit unique constraints to encode business idempotency where possible.

### Validation schema integrations

In the beta line, legacy standalone packages such as `drizzle-typebox`, `drizzle-zod`, `drizzle-valibot`, and `drizzle-arktype` were deprecated in favor of first-class `drizzle-orm/*` integrations.

For new work, use:

- `drizzle-orm/typebox`
- `drizzle-orm/zod`
- `drizzle-orm/valibot`
- `drizzle-orm/arktype`

Avoid introducing new dependencies on the legacy standalone packages.

## Time and Date Semantics

### Default rule

Use the persisted type that matches the business meaning.

#### Absolute instants

Use:

```ts
timestamp('...', { withTimezone: true, mode: 'date' })
```

Examples:

- `createdAt`
- `updatedAt`
- `processedAt`
- `startsAt`
- `endsAt`
- `expiresAt`

This is **not deprecated** in beta16 and remains appropriate for most audit and scheduling instants in this repo.

#### Calendar-only values

Use:

```ts
date('...', { mode: 'string' })
```

Examples:

- closure day
- holiday date
- billing date
- season start/end day
- local booking day when the time-of-day is not part of the meaning

### Why this distinction matters

JavaScript `Date` values represent instants. They are a poor fit for business concepts that mean “the local day on a calendar” without a timezone-attached wall-clock instant.

Beta-era mapper fixes in Drizzle tightened date/timestamp handling across drivers. That makes semantic mistakes more visible, not less dangerous. The repo rule is therefore:

> **If the concept is a day, store a day. If the concept is an instant, store an instant.**

## Query Conventions

- Keep transport handlers thin; read queries live in domain packages or `packages/db` helpers.
- Use explicit ordering for any query consumed by a UI or pagination path.
- Select only the columns needed across boundaries.
- Treat caching as absent unless a DB cache is explicitly configured.
- Use stable cursor pagination for growing tables and user-facing feeds.
- Keep raw `sql`` usage local to the query helper when operators or expressions are needed.

### Performance rule

If a column participates in a `JOIN`, `WHERE`, or hot `ORDER BY`, justify its indexing story.

## Mutation Conventions

- Use `returning()` when subsequent logic depends on persisted values.
- Use DB transactions for local, multi-table state changes.
- Use workflows for operations that also call external providers or emit rollback-sensitive side effects.
- Encode idempotency with unique constraints plus `onConflictDoNothing()` / `onConflictDoUpdate()` only when the conflict target reflects real business identity.
- Snapshot financial or policy-derived values at request time when later steps must not recalculate them.

Representative repo patterns already exist in:

- `packages/booking/src/cancellation-service.ts`
- `packages/disputes/src/cancellation-workflow.ts`
- `packages/notifications/src/processor.ts`

## Testing Conventions

### PGlite lane

Use `packages/db/src/test/index.ts` for fast schema/query/mutation tests.

Preferred patterns:

- `seedStrategy: "beforeEach"` for small isolated seeds
- `seedStrategy: "beforeAll"` for larger stable fixtures with per-test rollback
- deterministic IDs and fixed UTC timestamps

### Workflow lane

For domain workflows, stub providers and assert:

- persisted DB state
- external adapter calls
- event emission
- compensation behavior on downstream failure

### Real Postgres lane

Use `packages/db/scripts/verify-postgres-baseline.mjs` when validating migration replayability, reset/bootstrap scripts, or DDL behavior that PGlite does not faithfully represent.

## Migration Conventions

- Schema changes are committed through `drizzle-kit generate` + `drizzle-kit migrate`.
- Generated SQL must be reviewed before application.
- `drizzle-kit push` is reserved for scratch/prototyping scenarios, not the canonical repo workflow.
- The repository's reproducibility path is migration-first, not push-first.

### `--ignore-conflicts`

Beta16 introduces `--ignore-conflicts` for `generate` / `migrate`. In this repo it is a recovery tool, not a default switch. Using it without understanding the underlying drift is not a fix; it is a plot twist.

## Beta16 Notes

The following beta-line details matter to repo decisions:

1. **Built-in schema generation integrations** replaced legacy standalone Drizzle schema packages as the preferred path.
2. **Cache is explicit** unless a cache implementation is configured.
3. **Builder-specific methods** such as `.defaultNow()`, `.generatedAlwaysAsIdentity()`, and `.generatedByDefaultAsIdentity()` should only be relied on where the concrete builder supports them.
4. **Date/timestamp mapper fixes** mean code should not rely on vague local-time assumptions when using JavaScript `Date` values.

## Known Audit Targets

The following existing fields deserve semantic review before being used as templates for new work:

- `packages/db/src/schema/availability.ts` → `listingAvailabilityException.date`

This field may be intentionally modeled as an instant, but its table comment and name suggest calendar-day semantics. The ADR does **not** force an immediate migration; it records the audit target so new code does not copy the pattern blindly.

## Consequences

### Positive

- New schema and query work has a clear ownership model.
- Time semantics become explicit, reducing timezone bugs.
- Mutations are easier to test and retry safely.
- Migration review becomes more disciplined.

### Tradeoffs

- Engineers must think about time semantics before reaching for `Date`.
- Some existing fields may require follow-up audits or eventual migrations.
- Real Postgres verification adds a small amount of extra work for DDL-sensitive changes, but it is cheaper than debugging schema drift after the fact.