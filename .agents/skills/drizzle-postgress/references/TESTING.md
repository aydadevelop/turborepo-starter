# Drizzle Testing Patterns

How to test schema, queries, mutations, and migration behavior in this repository.

---

## Test lanes in this repo

### 1. Fast DB tests with PGlite

The main harness lives in `packages/db/src/test/index.ts`.

What it does:

- boots an in-memory PGlite database
- pushes the live schema with `drizzle-kit/api-postgres`
- exposes `bootstrapTestDatabase()` and `clearTestDatabase()`

Use this for:

- schema constraint tests
- query behavior tests
- local mutation logic tests
- deterministic fixture-driven domain tests

### 2. Domain/workflow tests

Representative example: `packages/booking/src/cancellation/__tests__/cancellation-workflow.test.ts`

Use this lane for:

- provider adapter stubbing
- event emission assertions
- compensation / rollback behavior
- snapshot-authoritative mutation behavior

### 3. Real Postgres verification

Use `packages/db/scripts/verify-postgres-baseline.mjs` when you need confidence in:

- migration replayability
- reset/bootstrap scripts
- seed/export/import behavior
- DDL semantics that PGlite does not model exactly the same way

## Harness patterns

### `beforeEach` seeding

```typescript
const state = bootstrapTestDatabase({
  seedStrategy: 'beforeEach',
  seed: async (db) => {
    // insert minimal fixture rows
  },
});
```

Use when each test needs a clean DB state and the seed is small.

### `beforeAll` seed + per-test rollback

```typescript
const state = bootstrapTestDatabase({
  seedStrategy: 'beforeAll',
  seed: async (db) => {
    // insert stable scenario fixture
  },
});
```

Use when the seed is larger or reused across many tests. The harness wraps each test in a transaction and rolls it back afterward.

## Test data rules

- Prefer fixed IDs over random IDs in tests.
- Prefer fixed anchor timestamps such as `new Date('2026-03-10T12:00:00.000Z')`.
- Keep fixtures minimal but coherent.
- If a scenario models business time, make the time relationship obvious: `NOW`, `FUTURE_START`, `FUTURE_END`.

## What to assert

### Query tests

- selected shape
- sort order
- filtered row count
- null / missing relation behavior

### Mutation tests

- persisted row values
- state transitions
- idempotency on retry
- transaction outcomes

### Workflow tests

- external adapter calls
- emitted events / notifications
- compensation when a downstream step fails
- stored snapshot wins over recalculation when that is the business rule

## Good repo examples

- `packages/db/src/__tests__/database.test.ts` — constraint and schema coverage
- `packages/db/src/test/fixtures/marketplace.ts` — deterministic scenario fixture builder
- `packages/booking/src/cancellation/__tests__/cancellation-workflow.test.ts` — provider + workflow + rollback testing

## Limitations to remember

- PGlite + `pushSchema()` is excellent for fast correctness tests, but it is **not** the final judge of migration SQL behavior.
- Cache behavior should not be asserted unless a cache is explicitly configured.
- Date/time tests should use explicit UTC timestamps; avoid relying on local machine timezone behavior.

## Practical verification sequence

1. Add or update a focused PGlite test
2. Run the owning package tests
3. If schema/migration behavior changed, run the real Postgres verification lane
4. Review generated migration SQL before considering the change done
