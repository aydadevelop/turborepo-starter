---
phase: 02-events-workflows-parity-foundations
plan: 03
subsystem: testing
tags: [parity, extraction, brownfield, vitest, drizzle]

requires: []
provides:
  - "createParityTest helper and ParityDeclaration interface in packages/db/src/test/"
  - "Canary parity test verifying Phase 1 schema baseline (57 tables)"
  - "docs/parity-guide.md — definitive reference for declaring parity checks"
affects: [booking, catalog, disputes, payments, calendar]

tech-stack:
  added: []
  patterns:
    - "createParityTest(declaration) returns () => Promise<void> — pass directly to it(...)"
    - "isTable() from drizzle-orm to detect pgTable objects in schema exports"
    - "PHASE_1_BASELINE_TABLES hardcoded sorted array — update when adding tables"

key-files:
  created:
    - packages/db/src/test/parity.ts
    - packages/db/src/__tests__/parity.test.ts
    - docs/parity-guide.md
  modified:
    - packages/db/src/test/index.ts

key-decisions:
  - "Used isTable() from drizzle-orm (not getTableName) to reliably distinguish table objects from enum arrays and other exports"
  - "Canary uses variable export names (camelCase), not SQL table names — matches what domain teams will reference"
  - "createParityTest uses Promise.all (parallel) to call both fns, JSON.stringify for default deep comparison"
  - "inputs typed as TInput[] — canary uses [null as null] since schema enumeration needs no input"

patterns-established:
  - "Parity check per domain: packages/{domain}/src/__tests__/parity.test.ts imports createParityTest from @my-app/db/test"
  - "New DB tables: add export name to PHASE_1_BASELINE_TABLES array in parity.test.ts"
  - "Timing-sensitive outputs: use custom equals function in ParityDeclaration"

requirements-completed:
  - PLAT-05

duration: 10min
completed: 2026-03-09
---

# Phase 02-03: Parity Harness Summary

**Parity test infrastructure established — domain teams can now prove extracted implementations match legacy behavior using a single `createParityTest` call.**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-03-09T21:51Z
- **Completed:** 2026-03-09T21:55Z
- **Tasks:** 2 completed
- **Files modified:** 4

## Accomplishments

### Task 1: createParityTest harness

Created `packages/db/src/test/parity.ts`:
- `ParityDeclaration<TInput, TOutput>` interface with domain, description, inputs[], legacyFn, extractedFn, optional equals
- `ParityResult<TOutput>` for structured failure reporting
- `createParityTest(decl)` returns a `() => Promise<void>` test function — runs both fns in parallel on every input, fails with rich message (domain, description, input, legacy, extracted)
- Exported from `packages/db/src/test/index.ts` alongside existing test utilities

### Task 2: Canary + docs

Created canary parity test (`packages/db/src/__tests__/parity.test.ts`):
- Hardcoded `PHASE_1_BASELINE_TABLES` (57 tables from Phase 1 snapshot)
- Extracted function uses `isTable()` from drizzle-orm to enumerate actual table exports
- Test verifies exact match — catches table additions/removals without baseline update
- All 30 packages/db tests pass (5 migrations + 24 database + 1 parity)

Created `docs/parity-guide.md` — reference documentation covering:
- What parity checks are and when to use them
- How to declare a check with full example
- Custom equality for non-deterministic outputs
- Where to add domain checks
- How to maintain the schema baseline
- Anti-patterns

## Self-Check

- ✅ `createParityTest` returns Vitest-compatible function — passed to it() successfully
- ✅ Canary passes: extracted 57 tables matches baseline exactly
- ✅ `bun run check-types` in packages/db: 0 errors
- ✅ `bun run test` in packages/db: 30/30 passing
- ✅ PLAT-05: automated parity checks ready for Phase 3+ domain extractions
