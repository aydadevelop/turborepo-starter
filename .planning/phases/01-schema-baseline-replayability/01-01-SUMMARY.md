# Plan 01-01 Summary

**Phase:** 01-schema-baseline-replayability  
**Plan:** 01 — Baseline Migration Chain & Migrate-Backed Bootstrap  
**Status:** Complete  
**Completed:** 2026-03-09

## What Was Built

Committed the first Drizzle migration chain from the current exported schema and replaced push-first bootstrap with a fully reproducible migrate-backed flow.

## Key Files

### Created
- `packages/db/src/migrations/20260309174754_wooden_hex/migration.sql` — Baseline DDL migration covering all 8 schema modules (affiliate, assistant, auth, availability, consent, marketplace, notification, support, todo) with all ENUMs, tables, indexes, and FK constraints
- `packages/db/src/migrations/20260309174754_wooden_hex/snapshot.json` — Drizzle schema snapshot for future migration generation
- `packages/db/src/__tests__/migrations.test.ts` — Artifact smoke check: verifies migration directory, SQL content, and presence of core tables

### Modified
- `packages/db/scripts/bootstrap-local-e2e.mjs` — Replaced `pushSchema` with `resetAndMigrateSchema`: drops public schema AND drizzle journal, then applies committed migrations
- `packages/db/scripts/reset-local.mjs` — Upgraded from table-only drop to `DROP/CREATE SCHEMA public` (clears types/sequences too)
- `packages/db/package.json` — Added `db:generate:dev` and `db:migrate:dev` scripts for dev-config workflows

## Tasks Completed

| Task | Status | Commit |
|------|--------|--------|
| T1: Commit baseline migration chain | ✓ Done | 5a72dfc |
| T2: Migrate-backed bootstrap | ✓ Done | 5a72dfc |
| T3: Migration smoke check test | ✓ Done | 5a72dfc |

## Deviations

- **[Rule 1 - Bug]** `reset-local.mjs` only dropped tables, leaving ENUMs behind — causing `drizzle-kit migrate` to fail on existing types. Fixed by using `DROP SCHEMA public CASCADE` instead.
- **[Rule 1 - Bug]** `__drizzle_migrations` lives in a separate `drizzle` schema, not `public`, so it survived the schema wipe. Added `DROP SCHEMA IF EXISTS drizzle CASCADE` to the reset so `drizzle-kit migrate` re-applies all migrations to the clean DB.
- Dynamic import of `src/triggers.ts` from `.mjs` removed — Node.js can't import TypeScript files natively. The `POST_MIGRATION_TRIGGERS_SQL` hook remains accessible via `src/triggers.ts` for TypeScript callers; the bootstrap documents the hook point as a comment.

## Verification

- `drizzle-kit generate` produced migration from full schema ✓
- Migration applies cleanly to a fresh Postgres database ✓
- `bootstrap-local-e2e.mjs` completes: reset → migrate → seed ✓
- `bun run test` — 25/25 tests pass (5 new migration smoke checks + 20 existing) ✓
- `bun run check-types` — no errors ✓

## Self-Check: PASSED
