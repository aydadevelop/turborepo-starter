# ADR-009: Seed Factory Pattern and Workflow Parallelization

**Date:** 2026-03-10
**Status:** Accepted
**Authors:** Platform Team
**Related:** [ADR-002: Architecture Patterns](./002_architecture-patterns.md)

---

## Context

Two related design questions surfaced during expansion of the marketplace seed data:

1. **How should seed/fixture data be structured** as the number of scenarios grows (multi-org, multi-payment-model, excursions with shared calendars)?
2. **Does the workflow engine need a `parallelize()` primitive** similar to Medusa's `parallelize()` for running independent steps concurrently?

---

## Decision 1: Seed Factory Functions over Monolithic Scenarios

### Current State

Two seed patterns exist today:

- **`packages/db/scripts/seed-local.mjs`** — one large `buildSeedData()` returning a flat JSON object, written in a single pass. Not composable.
- **`packages/db/src/test/fixtures/marketplace.ts`** — `seedMarketplaceScenario()`, a single function that inserts everything sequentially with `onConflictDoNothing`. Works, but adding excursion/multi-org/multi-payment scenarios would require duplicating or forking it.

### Decision

Adopt **named factory functions per entity** as the pattern for new and expanded seed work. Each factory:

- accepts required foreign keys and optional overrides
- inserts one logical unit (org, listing, payment config, publication)
- returns the created row (typed)
- uses `onConflictDoNothing` for idempotency

Scenarios are composed by calling factories:

```ts
// packages/db/src/test/fixtures/factories/index.ts
export { createOrg }            from "./org";
export { createListing }        from "./listing";
export { createPaymentConfig }  from "./payment";
export { createPublication }    from "./publication";
export { createBooking }        from "./booking";

// packages/db/src/test/fixtures/scenarios/marketplace-platform.ts
export const seedPlatformScenario = async (db) => {
  const org  = await createOrg(db, { name: "Boat Co" });
  const list = await createListing(db, { orgId: org.id, type: "vessel" });
  const pub  = await createPublication(db, {
    listingId: list.id,
    merchantType: "platform",
    merchantPaymentConfigId: PLATFORM_PAYMENT_CONFIG_ID,
  });
  return { org, list, pub };
};

export const seedLicenseScenario = async (db) => {
  const org     = await createOrg(db, { name: "Licensed Org" });
  const payment = await createPaymentConfig(db, { orgId: org.id });
  const list    = await createListing(db, { orgId: org.id, type: "vessel" });
  const pub     = await createPublication(db, {
    listingId: list.id,
    merchantType: "owner",
    merchantPaymentConfigId: payment.id,
  });
  return { org, payment, list, pub };
};
```

The existing `seedMarketplaceScenario` in `marketplace.ts` is retained as-is (it mirrors `seed-local.mjs` intentionally). New scenarios use factories. Migration of the existing fixture is deferred until it becomes a friction point.

### Rationale

| | Monolithic scenario | Factory functions |
|---|---|---|
| Test isolation | Full scenario or nothing | Call only what the test needs |
| Composition | Fork or duplicate | Mix and match |
| Multi-scenario | Multiple scenario files diverge | Common factories, thin scenario wrappers |
| Typing | Implicit from return | Each factory returns its own typed row |

### Consequ  const payment = await createPaymentConfig(db, { orgId: org.id l  const list    = await createListing(test/fixtures/factories/` and `.../scenarios/`
- `seed-local.mjs` is updated to call scenario composers when expanded, keeping human-readable named blocks
- Factory functions take `db: TestDatabase` as first param, matching the existing fixture convention

---

## Decision 2: No `parallelize()` Prim
### Rationale

| | Monolithic scenario | Factory functions |
|---|---|---|
| Test isolation | Full scenario or nothing | Call only what the test needs |
| Composition | Fork or duplicate | Mix and match |
| Multi- are:

1. **Declare intent** — makes the DAG explicit in code: "these run in parallel"
2. **Compensation tracking** — the Medusa runtime records each parallel step's output for rollback
3. **Type inference** — typed tuple return preserves each step's output type

### Current Workflow Engine

`packages/workflows/s
### Consequ  const payment = await createPaymentConfig(db, { orgId: org.efa- `seed-local.mjs` is updated to call scenario composers when expanded, keeping human-readable named blocks
- Factory funcy** inside any `createWorkflow` `run` function:

```ts
createWorkflow("my-workflow", async (input, ctx) => {
  const [result] = await Promise.all([
    emitEventStep.run(...),
    updateSecondaryRecordStep.run(...),
  ]);
});
```

Both steps push to `__completed` as they settle. Compensation order for paral|---|---|---|
| Test isolation | Full scenarac| ptable becau| Composition | Fork or duplicate | Mix and match |
| Multi- are:

1. **Densat| Multi- are:

1. **Declare intent** — makes thelize()` primitive2** Use `Promise.all` directly.

A named helper `runParallel(steps, ctx)` can be added if deterministic compensation ordering for parallel steps ever becomes a documented requirement or if a DAG visualizer is introduced. Until then, the abstraction adds API surface without runtime benefit.

### When to Use `Promi- Factory funcy** inside any `createWorkflow` `run` function:

```ts
createWorkflow("my-workflow", async (input, ctx) => {
  const [result] = await Promise.all([
    emitEventStep.rth
```ts
createWorkflow("m Failure of one step should prevent the other from starting  

### Consequences

- No new API surface in `packages/workflows`
- Workflow authors opt into concurrency explicitly with `Promise.all`
- Compensation for parallel steps fires in settle order, not declaration order — documented, acceptable

---

## A| Multi- are:

1. **Densat| Multi- are:

1. **Declare intent** — makes thelize()` primitive2**ri
1. **Densatne 
1. **Declare intent** tai
A named helper `runParallel(steps, ctx)` can be added if determilows: Add `parallelize()` now** — Rejected. Without a DAG executor or visualizer there is no runtime benefit. Sequential + `Promise.all` opt-in is simpler and already sufficient.

---

*Status: Accepted — 2026-03-10*
