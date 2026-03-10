---
phase: 01-schema-baseline-replayability
plan: "03"
subsystem: testing
tags: [snapshot, postgres, replayability, verification, cli]

requires:
	- phase: 01-schema-baseline-replayability
		provides: "baseline migrations and deterministic marketplace seed scenario"
provides:
	- "Snapshot export and import scripts for replayable baseline data"
	- "Committed baseline snapshot artifact"
	- "Real-Postgres verification lane for migrate-seed-export-import cycles"
affects: [database, testing, parity, debugging]

tech-stack:
	added: []
	patterns:
		- "Replayable state is captured as committed JSON snapshots, not ad hoc SQL dumps"
		- "Real-Postgres verification exercises reset, migrate, seed, export, import, and assert in one lane"

key-files:
	created:
		- packages/db/scripts/export-snapshot.mjs
		- packages/db/scripts/import-snapshot.mjs
		- packages/db/scripts/verify-postgres-baseline.mjs
		- packages/db/snapshots/phase1-baseline.json
	modified:
		- packages/db/package.json

key-decisions:
	- "Snapshot import pre-serializes JSONB values before passing them to pg"
	- "Baseline verification uses a real Postgres loop instead of relying only on PGlite"

patterns-established:
	- "Committed snapshot artifacts document reproducible baseline state for debugging and parity"
	- "Database acceptance lanes validate restore behavior against real Postgres before release"

requirements-completed:
	- PLAT-03
	- PLAT-04

duration: "n/a"
completed: 2026-03-09
---

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
