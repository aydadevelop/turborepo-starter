# ADR-009: Seed Bootstrap and Scenario Fixtures

**Date:** 2026-03-10  
**Status:** Accepted  
**Authors:** Platform Team  
**Related:** [ADR-002: Architecture Patterns](./002_architecture-patterns.md)

---

## Context

Two different seed problems exist in this repo, and they should not be solved by the same mechanism:

1. **Local developer bootstrap data**
   - A fresh local database should be able to start with useful demo data and known credentials.
   - The current bootstrap entrypoint is `packages/db/scripts/seed-local.mjs`.
   - Docker local startup should be able to populate that demo data on first boot without requiring a second manual command.

2. **Test and E2E scenario data**
   - DB tests and integration/E2E flows should only create the rows a scenario needs.
   - The current mirrored fixture in `packages/db/src/test/fixtures/marketplace.ts` is intentionally aligned with the local demo seed, but it is still one large scenario and should not become the universal test seeding mechanism.
   - Playwright E2E bootstrap now uses a dedicated minimal baseline via `packages/db/src/e2e/seed.ts`, not the full demo seed.
   - Local Playwright runs must target a dedicated database by default (`myapp_e2e`); reusing the shared dev DB requires an explicit `PLAYWRIGHT_ALLOW_SHARED_DB=1` override.

The external pattern worth copying is explicit:

- **Medusa dev seed**
  - explicit manual/demo seed via `medusa exec ./src/scripts/seed.ts`
  - rich bootstrap data for local development
  - workflow-driven, readable, not test-oriented
- **Mercur dev seed**
  - same explicit `seed.ts` model, extended for marketplace demo data
  - optional container boot seeding through `SEED_DEMO_DATA=true`
- **Medusa e2e/integration**
  - does not use the demo seed
  - `medusaIntegrationTestRunner` creates an isolated random database per test run and drops it afterward
  - tests compose only the fixtures they need: `createAdminUser`, `createOrderSeeder`, package-level `__fixtures__`, and similar helpers
  - the pattern is scenario seeding, not global seed replay

That is the pattern this repo should follow.

---

## Decision 1: Separate Demo Bootstrap Seed from Test Fixtures

### Decision

The repo adopts two seed lanes with different purposes:

1. **Demo bootstrap seed**
   - Owned by `packages/db/scripts/seed-local.mjs`
   - Deterministic, human-readable, and safe for local bootstrap
   - Uses the `seed_` namespace and stable credentials
   - May evolve into named bootstrap sections, but remains one operator-facing entrypoint

2. **Scenario fixtures**
   - Owned by DB test fixtures and future E2E helper modules
   - Must create only the data a scenario needs
   - Must not depend on replaying the full demo seed
   - Should grow toward small factories and thin scenario composers as coverage expands

The current mirrored fixture in `packages/db/src/test/fixtures/marketplace.ts` is retained because it still provides value: it keeps DB tests aligned with the human bootstrap dataset. It is not the long-term pattern for all tests.

### Consequences

- The local seed remains a real developer bootstrap story, not a test harness.
- Tests may keep a mirrored baseline fixture where that is useful, but new scenario growth should prefer narrow helpers over a second monolithic seed script.
- E2E tests should seed targeted state through helpers, API setup, or fixtures, not by assuming the demo seed exists.
- Local E2E must default to a dedicated database, so test bootstrap cannot destroy the shared developer DB by accident.

---

## Decision 2: Demo Seed Must Be Deterministic and First-Boot Safe

### Decision

The demo bootstrap seed keeps these rules:

- seeded rows stay in the `seed_` namespace or an equivalent deterministic range
- seeded credentials and identifiers stay stable for local development
- the script must support **first-boot-safe execution**

First-boot-safe means:

- startup may call the seed script automatically
- if the seed namespace is already present, the script exits without mutating data
- repeated container restarts do not clear or rewrite previously seeded rows unless an operator explicitly runs a destructive reseed path

The existing `--append` option remains the non-destructive write mode. The bootstrap flow may use it together with a seed-presence guard.

### Consequences

- Local Docker startup can seed demo data automatically on first boot.
- Subsequent restarts remain safe.
- Manual reseeding is still possible through the explicit CLI script.

---

## Decision 3: Docker May Optionally Seed Demo Data on Boot

### Decision

The server container may optionally bootstrap demo data on startup when:

- migrations have completed successfully
- `SEED_DEMO_DATA=true`

The startup flow is:

1. run DB migrations
2. if `SEED_DEMO_DATA=true`, run the demo seed in first-boot-safe mode
3. start the server

This behavior is for local developer/demo environments only. It must remain **opt-in** in the shared compose stack so deployment targets do not receive demo data by accident.

### Defaults

- shared Docker Compose default: `SEED_DEMO_DATA=false`
- local developers may opt in with `SEED_DEMO_DATA=true`
- E2E compose must keep `SEED_DEMO_DATA=false`

### Consequences

- A developer can bring up the full stack and get a working dataset immediately.
- Startup remains deterministic because seed execution is guarded by a seed marker.
- CI and E2E continue to control their own setup explicitly.

---

## Target Structure

### Demo bootstrap lane

- `packages/db/scripts/seed-local.mjs`
- deterministic `seed_` namespace
- known demo credentials
- optional Docker-first-boot execution

### Test fixture lane

- E2E bootstrap baseline:
  - `packages/db/src/e2e/seed.ts`
  - `packages/db/src/e2e/bootstrap.ts`
  - `packages/db/src/e2e/ensure-database.ts`
  - targeted auth/org baseline only
- existing mirrored fixture:
  - `packages/db/src/test/fixtures/marketplace.ts`
- target growth path:
  - `packages/db/src/test/fixtures/factories/*`
  - `packages/db/src/test/fixtures/scenarios/*`
  - domain/E2E-specific setup helpers where API-level setup is clearer than direct DB writes

---

## Implementation Notes

- The demo seed remains the fastest way to make a blank local DB useful.
- The first implementation of Docker seeding should use a simple seed marker check, not a new seed registry table.
- If the fixture surface grows materially, extract small entity factories and scenario composers instead of adding more branches to the monolithic mirrored fixture.

---

*Status: Accepted — updated 2026-03-11 to reflect live repo seeding and Docker bootstrap policy.*
