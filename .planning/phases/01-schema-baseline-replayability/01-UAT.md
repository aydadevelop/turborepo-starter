---
status: testing
phase: 01-schema-baseline-replayability
source:
  - 01-01-SUMMARY.md
  - 01-02-SUMMARY.md
  - 01-03-SUMMARY.md
started: 2026-03-09T18:20:00.000Z
updated: 2026-03-09T18:20:00.000Z
---

## Current Test

number: 1
name: Baseline migration applies to a fresh database
expected: |
  Run: cd packages/db && bun run db:migrate:dev
  The command reads drizzle.config.dev.ts, finds migration
  20260309174754_wooden_hex, and prints:
    [✓] migrations applied successfully!
awaiting: user response

## Tests

### 1. Baseline migration applies to a fresh database
expected: |
  Run: cd packages/db && bun run db:migrate:dev
  The command reads drizzle.config.dev.ts, finds migration
  20260309174754_wooden_hex, and prints:
    [✓] migrations applied successfully!
result: pending

### 2. Bootstrap resets and re-seeds cleanly
expected: |
  Run: DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/myapp node packages/db/scripts/bootstrap-local-e2e.mjs
  Output includes:
    [✓] migrations applied successfully!
    Seeded database: ...
    Listings: 1, bookings: 1
result: pending

### 3. Seed produces marketplace records
expected: |
  Run: DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/myapp node packages/db/scripts/seed-local.mjs
  Output ends with two lines:
    Listings: 1, bookings: 1
    Admin login: admin@admin.com / admin
    Operator login: operator@example.com / operator
result: pending

### 4. Unit test suite: 29 tests pass
expected: |
  Run: cd packages/db && bun run test
  Output shows:
    Test Files  2 passed (2)
    Tests  29 passed (29)
  No test failures.
result: pending

### 5. Snapshot export creates the baseline file
expected: |
  Run: cd packages/db && DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/myapp bun run db:snapshot:export
  Output shows rows exported for the seed tables
  (organization: 2 rows, listing: 1 rows, booking: 1 rows, etc.)
  File packages/db/snapshots/phase1-baseline.json exists.
result: pending

### 6. Full real-Postgres verification lane passes
expected: |
  Run: cd packages/db && DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/myapp bun run db:verify:postgres
  All 6 steps print ✅ or ✓:
    Step 1: Reset → migrate → seed
    Step 2: Export snapshot
    Step 3: Assert seeded state  (✓ for each key table)
    Step 4: Reset → migrate (wipe)
    Step 5: Restore snapshot
    Step 6: Assert restored state (✓ for each key table)
  Final line: ✅  Real-Postgres baseline verification PASSED.
result: pending

## Summary

total: 6
passed: 0
issues: 0
pending: 6
skipped: 0

## Gaps

[none yet]
