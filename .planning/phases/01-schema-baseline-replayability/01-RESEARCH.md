# Phase 1 Research — Schema Baseline & Replayability

**Phase:** 1
**Phase name:** Schema Baseline & Replayability
**Date:** 2026-03-09
**Source inputs:** `.planning/PROJECT.md`, `.planning/ROADMAP.md`, `.planning/STATE.md`, `.planning/codebase/*`, `packages/db/**`, `docker-compose*.yml`

## Objective

Answer: **What does this repo need in order to plan Phase 1 well?**

This phase is not generic database setup. The repo already has a substantial Drizzle/Postgres schema draft, local seed/bootstrap scripts, a PGlite test harness, and Dockerized Postgres. The work is to convert that into a reproducible baseline that can be migrated, seeded, replayed, and verified consistently before domain extraction starts.

## Current repo facts

### Migration state
- `packages/db/drizzle.config.ts` and `packages/db/drizzle.config.dev.ts` both point to `./src/migrations`.
- `packages/db/src/migrations/` is not present in the current workspace snapshot.
- Current scripts expose `db:push`, `db:migrate`, and `db:generate`, but the local/e2e bootstrap currently uses `drizzle-kit push` through `packages/db/scripts/bootstrap-local-e2e.mjs`.
- `packages/db/src/triggers.ts` is a placeholder with `POST_MIGRATION_TRIGGERS_SQL = ""`.

### Seed / fixture state
- `packages/db/scripts/seed-local.mjs` is deterministic by anchor date, but it currently seeds mostly auth, notifications, assistant, and demo todo data.
- The seed path does **not** yet model representative marketplace listing / booking / payment / support states at the depth required by the roadmap.
- `packages/db/src/test/index.ts` provides a PGlite-backed Drizzle harness with `seedStrategy` support (`beforeAll` / `beforeEach`).

### Verification state
- `packages/db/src/__tests__/database.test.ts` verifies schema behavior in PGlite.
- `packages/db/src/schema/marketplace.ts` explicitly defers extension-backed fields/indexes because the current test harness is PGlite-based.
- `docker-compose.yml` and `docker-compose.e2e.yml` already provide real Postgres containers using `pgvector/pgvector:pg18`.
- `packages/db/scripts/bootstrap-local-e2e.mjs` already waits for Docker Postgres and applies schema + seed, so it is the natural bridge for a real-Postgres verification lane.

## Planning implications

1. **Baseline migrations must be committed first.**
   The repo already models the desired schema in code, but without committed migration artifacts the state is not reproducible across environments.

2. **PGlite stays, but it cannot be the only truth.**
   PGlite remains useful for fast DB tests. Real Postgres must become the acceptance lane for anything sensitive to extensions, migration order, or trigger / constraint behavior.

3. **Seeds need to become scenario-driven, not starter-driven.**
   The current deterministic seed script is a good foundation, but it needs representative marketplace scenarios (org, listing, availability, booking, payment, support) to support parity work and future phase execution.

4. **Replayable snapshots should be repo-native.**
   The safest first snapshot system is a committed JSON or SQL replay artifact plus import/export scripts in `packages/db/scripts/`, not an ad hoc manual restore process.

5. **Phase 1 should avoid extension-scope creep.**
   The phase should create the baseline and the real-Postgres verification lane, but it should not try to fully ship pgvector / pg_textsearch / geo behavior yet. That belongs to later extraction/search work.

## Recommended build order inside the phase

1. **Migration baseline**
   - Commit initial migration artifacts from the current exported schema.
   - Align bootstrap scripts to use migration-backed flows instead of `push` where reproducibility matters.
   - Preserve an explicit post-migration hook surface for future trigger/extension SQL.

2. **Deterministic marketplace seeds**
   - Refactor seed generation into reusable scenario builders.
   - Expand data to include representative marketplace records, not only starter/demo rows.
   - Reuse the same seed primitives in local scripts and DB tests.

3. **Snapshots + real Postgres verification**
   - Add export/import snapshot scripts for replayable baseline states.
   - Add a real-Postgres verification command that proves reset → migrate → seed → restore works against Docker Postgres.

## Validation Architecture

### Fast lane
- `packages/db/src/__tests__/database.test.ts`
- `packages/db/src/test/index.ts`
- Goal: keep schema/unit feedback quick with PGlite.

### Acceptance lane
- Docker Postgres from `docker-compose.yml` / `docker-compose.e2e.yml`
- Migration-backed bootstrap through `packages/db/scripts/bootstrap-local-e2e.mjs` (or successor scripts)
- Snapshot import/export verification through new `packages/db/scripts/*` commands
- Goal: prove the baseline works on real Postgres before Phase 1 is considered done.

## Risks to plan around

- Using `db:push` as the default reproducibility path will leave migration history ambiguous.
- Keeping seeds starter-only will make later booking/payment phases look green while missing the real brownfield scenarios.
- Trying to solve extensions and search in the same phase will dilute the baseline objective.
- Replacing the PGlite harness entirely would slow the repo down; the correct move is adding a second lane, not deleting the first.

## Recommended plan shape

Three sequential plans fit the roadmap and the repo:
1. **01-01** — baseline migration chain + migration-backed bootstrap
2. **01-02** — deterministic marketplace seed scenarios + reusable fixture builders
3. **01-03** — snapshot export/import + real-Postgres verification lane

## Constraint reminders for the planner

- Keep diffs in the DB package and related scripts focused.
- Prefer existing package-local scripts over new root-task logic.
- Use TDD-managed progress wherever behavior can be asserted.
- Do not introduce target-state `packages/events` / `packages/workflows` work here; those are Phase 2 foundations.

---
*Research completed: 2026-03-09*
*Ready for planning: yes*