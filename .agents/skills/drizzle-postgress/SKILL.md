---
name: postgres-drizzle
description: Proactively apply when working on this repository's PostgreSQL + Drizzle beta16 stack. Triggers on PostgreSQL, Postgres, Drizzle, drizzle-kit, schema, tables, columns, indexes, queries, mutations, upsert, transaction, migration, PGlite, bootstrapTestDatabase, timestamp, date, jsonb, relations, cache, typebox. Use when writing or reviewing DB schemas, queries, tests, migrations, or domain mutations backed by @my-app/db.
---

# PostgreSQL + Drizzle ORM

Repository-scoped guidance for `drizzle-orm@1.0.0-beta.16-*` and `drizzle-kit@1.0.0-beta.16-*`.

## Mental model

PostgreSQL is a **transactional, MVCC-based database** and the **system of record** for durable state.

- **PostgreSQL stores authoritative state** — tables, constraints, transactions, and row versions define the committed state.
- **Drizzle is the typed interface** — schema definition, query construction, migrations, and typed results. It does not change database semantics.
- **Reads use snapshots** — MVCC means readers usually do not block writers.
- **Writers still contend on shared rows and indexes** — hot rows, unique constraints, foreign keys, and explicit locks still matter.
- **Caches, search indexes, embeddings, analytics projections, and external provider state are downstream systems** — they are derived from PostgreSQL state and should not be treated as authoritative.
- **Design the write path for correctness first**. Optimize read paths and downstream systems after the write path is correct.

### What this means in practice

- Put invariants in the database when possible: `NOT NULL`, `UNIQUE`, `CHECK`, FKs, partial unique indexes.
- Keep transactions short so MVCC cleanup and lock handoff stay healthy.
- Prefer explicit state transitions and idempotency keys over application-memory assumptions.
- If a system can be rebuilt from PostgreSQL state, treat it as downstream state rather than authoritative state.

## Repository fit

- Central schema and migration ownership lives in `packages/db`.
- Runtime schema entrypoint is `packages/db/src/schema/index.ts`.
- Generated SQL migrations live in `packages/db/src/migrations`.
- Fast DB tests use the PGlite harness in `packages/db/src/test/index.ts`.
- Multi-table business mutations usually live in domain packages such as `packages/booking`, `packages/notifications`, and `packages/calendar`.
- Transport handlers stay thin; database logic belongs in the owning domain/service/workflow layer.

## Use this workflow

1. **Find the owning layer first**
  - Schema or shared DB helpers → `packages/db`
  - Domain read/write logic → owning package (`packages/booking`, `packages/catalog`, etc.)
  - API handlers should call domain code instead of reaching into tables directly unless the handler is an accepted exception.
2. **Classify time semantics before picking a column type**
  - Absolute instant → `timestamp(..., { withTimezone: true, mode: "date" })`
  - Calendar-only day / local business date → prefer `date(..., { mode: "string" })`
  - If a field is named `date`, `day`, or `window` but behaves like an instant, stop and verify the intent.
3. **Choose read vs write path**
  - Read-focused work: start with query shape, indexes, pagination, and explicit filters.
  - Write-focused work: design idempotency, transaction boundaries, side effects, and rollback/compensation first.
  - Concurrency-sensitive work: identify the authoritative row(s), lock scope, and invariant enforcement before writing code.
4. **Pick the right test lane**
  - Schema/query/mutation logic → PGlite via `bootstrapTestDatabase()`
  - Workflow or side-effect orchestration → domain-package tests with fake providers / event pushers
  - Migration or DDL behavior → real Postgres verification lane in `packages/db/scripts/verify-postgres-baseline.mjs`
5. **Verify the full path**
  - Schema changed → generate + review migration SQL
  - Query changed → assert data shape and ordering
  - Mutation changed → assert persisted rows plus side-effect/idempotency behavior

## Beta16-era notes that matter here

- `drizzle-typebox`, `drizzle-zod`, `drizzle-valibot`, and `drizzle-arktype` were deprecated in favor of first-class `drizzle-orm/*` schema generation integrations in the beta line. For new work, prefer the built-in `drizzle-orm/typebox`, `drizzle-orm/zod`, etc.
- Caching is **not automatic**. Drizzle only uses cache when you configure one. Do not assume cached reads, auto-invalidation, or cached relational queries in this repo.
- `drizzle-kit generate` / `migrate` support `--ignore-conflicts` in beta16, but treat that as a repair lever after manual review, not the normal workflow.
- Builder-specific helpers such as `.defaultNow()`, `.generatedAlwaysAsIdentity()`, and `.generatedByDefaultAsIdentity()` belong on concrete builders. Do not hide them behind abstractions that assume every builder supports them.
- Beta mapper fixes changed date/timestamp handling across drivers. In this repo, treat JavaScript `Date` values as **UTC instants**, not local calendar dates.

## Repository rules

- Treat PostgreSQL as the system of record; everything else is a projection, cache, integration, or derivative artifact.
- Reuse `packages/db/src/schema/columns.ts` for common timestamps.
- Index foreign keys and high-cardinality filter columns.
- Prefer `jsonb()` over `json()` or stringified JSON for structured PostgreSQL payloads.
- Use `returning()` on writes when the next step depends on persisted state.
- Use DB transactions for multi-row mutations; use workflows when compensation and side effects matter.
- Design for MVCC: short transactions, narrow updates, and explicit locking only when invariants require it.
- Avoid `drizzle-kit push` in committed or reproducibility-critical flows. This repo's baseline verification is migration-first.
- Keep test data deterministic: fixed IDs, fixed anchor dates, explicit timestamps.

## Locking best practices

- Let **constraints** prevent duplicates and invalid states before reaching for explicit locks.
- Lock the **smallest authoritative row set** that protects the invariant.
- Keep lock duration short: load → validate → write → commit.
- Acquire locks in a **consistent order** across code paths to reduce deadlocks.
- Avoid read-then-write races outside a transaction when business correctness depends on current state.
- Use queue-friendly patterns such as `SKIP LOCKED` only for true work queues, not for user-visible business state shortcuts.
- MVCC implications:
  - readers usually do not block writers
  - writers on the same rows do block each other
  - long transactions delay cleanup and increase bloat risk

## Indexing and optimizer guidance

- Index for **predicates, joins, and sort order**, not for completeness alone.
- Composite indexes should follow access pattern order: equality filters first, then range/order columns.
- Partial indexes are excellent for hot subsets like active, pending, or non-deleted rows.
- Expression indexes only help if the query expression matches.
- The optimizer is cost-based and statistics-driven; stale stats or wrong row estimates lead to bad plans.
- Always compare **estimated rows vs actual rows** when reading an execution plan.
- Optimize selectivity before heavy operators: pre-filter before JSONB, BM25, or vector search.

## Extensions and specialization

- General PostgreSQL + Drizzle modeling stays in this skill.
- Vector similarity search belongs in the sibling [`pgvector`](../pgvector/SKILL.md) skill.
- BM25 / keyword text search belongs in the sibling [`pg-textsearch`](../pg-textsearch/SKILL.md) skill.
- Use those skills when work involves embeddings, ANN indexes, BM25, hybrid search, or search-specific ranking behavior.

## Observability

- If a query is slow, inspect the **execution plan**.
- If a transaction is stuck, inspect **locks and blocking sessions**, not just application logs.
- If the optimizer surprises you, inspect **stats freshness, row estimates, and filter selectivity**.
- At minimum, know how to use:
  - `EXPLAIN (ANALYZE, BUFFERS)`
  - `pg_stat_activity`
  - `pg_stat_statements`
  - lock monitoring queries
  - autovacuum / dead tuple visibility

## Reference Documentation

| File | Purpose |
|------|---------|
| [references/SCHEMA.md](references/SCHEMA.md) | Beta16-aware schema conventions, timestamp/date guidance, indexes, constraints |
| [references/QUERIES.md](references/QUERIES.md) | Read-query patterns, filtering, joins, ordering, pagination |
| [references/MUTATIONS.md](references/MUTATIONS.md) | Insert/update/delete/upsert/transaction/idempotency patterns |
| [references/TESTING.md](references/TESTING.md) | PGlite harness, fixture strategy, workflow/provider testing, migration verification |
| [references/MIGRATIONS.md](references/MIGRATIONS.md) | Repo migration workflow, SQL review, baseline verification, beta16 caveats |
| [references/POSTGRES.md](references/POSTGRES.md) | PostgreSQL mental model, MVCC, locking, schemas, extensions, observability |
| [references/PERFORMANCE.md](references/PERFORMANCE.md) | Indexing, optimizer behavior, N+1 avoidance, query tuning |
| [references/CHEATSHEET.md](references/CHEATSHEET.md) | Quick lookup for common commands and patterns |

## Essential Commands

```bash
npx drizzle-kit generate   # Generate migration from schema changes
npx drizzle-kit migrate    # Apply pending migrations
npx drizzle-kit push       # Push schema directly (dev only!)
npx drizzle-kit studio     # Open database browser
```

## Decision guides

### "How do I model this relationship?"

```
Relationship type?
├─ One-to-many (user has posts)     → FK on "many" side + relations()
├─ Many-to-many (posts have tags)   → Junction table + relations()
├─ One-to-one (user has profile)    → FK with unique constraint
└─ Self-referential (comments)      → FK to same table
```

### "Why is my query slow?"

```
Slow query?
├─ Missing index on WHERE/JOIN columns  → Add index
├─ N+1 queries in loop                  → Use relational queries API or joins
├─ Full table scan                      → EXPLAIN ANALYZE, add/selective index
├─ Bad optimizer estimate               → Check stats, row estimates, filter selectivity
├─ Large result set                     → Add pagination (limit/offset)
└─ Connection overhead                  → Enable connection pooling
```

### "Why is this mutation racing or blocking?"

```
Concurrency problem?
├─ Duplicate rows possible              → Add unique constraint / conflict target
├─ Read-then-write race                 → Wrap in transaction, lock authoritative rows
├─ Deadlocks under load                 → Standardize lock order, shorten transaction
├─ Long lock waits                      → Inspect pg_stat_activity / pg_locks
└─ Side effects out of sync             → Persist first, then workflow / event-driven derivative work
```

### "Which drizzle-kit command?"

```
What do I need?
├─ Schema changed, need SQL migration   → drizzle-kit generate
├─ Apply migrations to database         → drizzle-kit migrate
├─ Quick dev iteration (no migration)   → drizzle-kit push
└─ Browse/edit data visually            → drizzle-kit studio
```

## Directory Structure

```
src/db/
├── schema/
│   ├── index.ts          # Re-export all tables
│   ├── users.ts          # Table + relations
│   └── posts.ts          # Table + relations
├── db.ts                 # Connection with pooling
└── migrate.ts            # Migration runner
drizzle/
└── migrations/           # Generated SQL files
drizzle.config.ts         # drizzle-kit config
```

## Schema Patterns

### Basic Table with Timestamps

```typescript
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
    .default(sql`now()`)
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
    .default(sql`now()`)
    .$onUpdate(() => new Date())
    .notNull(),
});
```

### Foreign Key with Index

```typescript
export const posts = pgTable('posts', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  title: varchar('title', { length: 255 }).notNull(),
}, (table) => [
  index('posts_user_id_idx').on(table.userId), // ALWAYS index FKs
]);
```

### Relations

```typescript
export const usersRelations = relations(users, ({ many }) => ({
  posts: many(posts),
}));

export const postsRelations = relations(posts, ({ one }) => ({
  author: one(users, { fields: [posts.userId], references: [users.id] }),
}));
```

## Query Patterns

### Relational Query (Avoid N+1)

```typescript
// ✓ Single query with nested data
const usersWithPosts = await db.query.users.findMany({
  with: { posts: true },
});
```

### Filtered Query

```typescript
const activeUsers = await db
  .select()
  .from(users)
  .where(eq(users.status, 'active'));
```

### Transaction

```typescript
await db.transaction(async (tx) => {
  const [user] = await tx.insert(users).values({ email }).returning();
  await tx.insert(profiles).values({ userId: user.id });
});
```

## Performance Checklist

| Priority | Check | Impact |
|----------|-------|--------|
| CRITICAL | Index all foreign keys | Prevents full table scans on JOINs |
| CRITICAL | Use relational queries for nested data | Avoids N+1 |
| HIGH | Connection pooling in production | Reduces connection overhead |
| HIGH | `EXPLAIN ANALYZE` slow queries | Identifies missing indexes |
| MEDIUM | Partial indexes for filtered subsets | Smaller, faster indexes |
| MEDIUM | UUIDv7 for PKs (PG18+) | Better index locality |

## Anti-Patterns (CRITICAL)

| Anti-Pattern | Problem | Fix |
|--------------|---------|-----|
| **No FK index** | Slow JOINs, full scans | Add index on every FK column |
| **N+1 in loops** | Query per row | Use `with:` relational queries |
| **No pooling** | Connection per request | Use `@neondatabase/serverless` or similar |
| **`push` in prod** | Data loss risk | Always use `generate` + `migrate` |
| **Storing JSON as text** | No validation, bad queries | Use `jsonb()` column type |
| **Using JS Date for date-only business fields** | Timezone drift and ambiguous semantics | Use `date(..., { mode: 'string' })` for calendar-only data |

## Resources

### Drizzle ORM
- **Official Documentation**: https://orm.drizzle.team
- **GitHub Repository**: https://github.com/drizzle-team/drizzle-orm
- **Drizzle Kit (Migrations)**: https://orm.drizzle.team/kit-docs/overview

### PostgreSQL
- **Official Documentation**: https://www.postgresql.org/docs/
- **SQL Commands Reference**: https://www.postgresql.org/docs/current/sql-commands.html
- **Performance Tips**: https://www.postgresql.org/docs/current/performance-tips.html
- **Index Types**: https://www.postgresql.org/docs/current/indexes-types.html
- **JSON Functions**: https://www.postgresql.org/docs/current/functions-json.html
- **Row Level Security**: https://www.postgresql.org/docs/current/ddl-rowsecurity.html
