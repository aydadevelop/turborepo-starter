# Plan 01-03 Summary

**Phase:** 01-schema-baseline-replayability  
**Plan:** 03 — Snapshot Export/Restore & Real-Postgres Verification Lane  
**Status:** Complete  
**Completed:** 2026-03-09

## What Was Built

Three purpose-built CLI scripts and a committed baseline snapshot give the team reproducible data-state recovery and a real-Postgres acceptance lane, closing Phase 1.

## Key Files

### Created
- `packages/db/scripts/export-snapshot.mjs` — Exports all seed-namespace rows from real Postgres to a structured JSON snapshot (31 rows across 23 tables). Handles all column types including JSONB (returns JS objects from `pg`; serialized as proper JSON in file).
- `packages/db/scripts/import-snapshot.mjs` — Idempotent restore: reads snapshot JSON, serializes object/array values back to JSON strings (required for `pg` JSONB parameters), upserts all rows with `ON CONFLICT DO UPDATE` inside a transaction.
- `packages/db/scripts/verify-postgres-baseline.mjs` — 6-step real-Postgres verification lane: reset→migrate→seed → export → assert → reset→migrate → import → assert. Proves the full baseline cycle reproducibly.
- `packages/db/snapshots/phase1-baseline.json` — Committed baseline snapshot: 31 rows, phase1 source tag, deterministic anchor-date timestamps.

### Modified
- `packages/db/package.json` — Added three discoverable scripts: `db:snapshot:export`, `db:snapshot:import`, `db:verify:postgres`.

## Tasks Completed

| Task | Status | Commit |
|------|--------|--------|
| T1: export-snapshot.mjs + import-snapshot.mjs + snapshots/ | ✓ Done | a7bea83 |
| T2: verify-postgres-baseline.mjs | ✓ Done | a7bea83 |
| T3: Wire into package.json scripts | ✓ Done | a7bea83 |

## Deviations

- **[pg JSONB gotcha]** The `pg` client deserializes JSONB columns into JavaScript objects/arrays on read. On write with parameterized queries, `pg` does NOT auto-serialize back — it treats arrays as PostgreSQL array literals, causing `invalid input syntax for type json`. Fixed: `import-snapshot.mjs` pre-serializes any non-primitive, non-Date value with `JSON.stringify` before passing to `pg`.
- **[existsSync import]** Initial verify script had `existsSync` imported from `node:child_process` instead of `node:fs`. Fixed immediately.

## Verification

- `node packages/db/scripts/verify-postgres-baseline.mjs` — all 6 steps pass ✓
- `bun run test` — 29/29 tests pass ✓
- `bun run check-types` — no errors ✓
- Committed snapshot: `packages/db/snapshots/phase1-baseline.json` (31 rows) ✓
- `db:snapshot:export`, `db:snapshot:import`, `db:verify:postgres` scripts discoverable ✓

## Self-Check: PASSED
