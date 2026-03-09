---
phase: 02-events-workflows-parity-foundations
plan: 02
subsystem: workflows
tags: [workflow-engine, compensation, saga, drizzle, database]

requires:
  - phase: 02-01
    provides: "@my-app/events EventBus — used in WorkflowContext and step tests"
provides:
  - "@my-app/workflows package with createStep, createWorkflow, WorkflowContext"
  - "workflow_execution and workflow_step_log Drizzle tables in packages/db"
  - "Migration 20260309190037_oval_adam_warlock — workflow schema tables"
affects: [booking, calendar, disputes, payments]

tech-stack:
  added: ["@my-app/workflows (new package)"]
  patterns:
    - "createStep(name, invoke, compensate) factory — pushes to __completed array for automatic rollback"
    - "createWorkflow(name, run) factory — reverse-iterates __completed on error, swallows compensation failures"
    - "StepFn public API uses WorkflowContext; cast to InternalWorkflowContext internally (runtime guarantee from createWorkflow)"
    - "Best-effort compensation: .catch(() => {}) wrapper ensures all compensations attempt even if some fail"

key-files:
  created:
    - packages/workflows/src/types.ts
    - packages/workflows/src/create-step.ts
    - packages/workflows/src/create-workflow.ts
    - packages/workflows/src/index.ts
    - packages/workflows/src/__tests__/workflow.test.ts
    - packages/workflows/package.json
    - packages/workflows/tsconfig.json
    - packages/workflows/vitest.config.ts
    - packages/db/src/schema/workflow.ts
    - packages/db/src/migrations/20260309190037_oval_adam_warlock/migration.sql
  modified:
    - packages/db/src/schema/index.ts
    - packages/db/src/__tests__/parity.test.ts

key-decisions:
  - "StepFn accepts WorkflowContext (public API), casts to InternalWorkflowContext internally — avoids leaking implementation detail"
  - "Compensation loop uses [...internalCtx.__completed].reverse() — creates copy before reversing to avoid mutation"
  - "Migration generated only (not applied) — db:generate, not db:migrate:dev, per plan spec"
  - "Parity baseline updated: workflowExecution and workflowStepLog added to PHASE_1_BASELINE_TABLES"

patterns-established:
  - "Multi-step operations: createWorkflow(name, async (input, ctx) => { const r1 = await step1(input, ctx); ... })"
  - "Compensation: createStep(name, invoke, async (output, ctx) => { /* rollback */ })"
  - "Compensation is best-effort: errors are swallowed; all compensations run even if some fail"
  - "WorkflowContext carries organizationId, actorUserId, idempotencyKey, eventBus"

requirements-completed:
  - OPER-03

duration: 15min
completed: 2026-03-09
---

# Phase 02-02: Workflows Package Summary

**Workflow engine established — `createStep`/`createWorkflow` with automatic reverse-order compensation is ready for domain packages to compose multi-step marketplace operations.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-03-09T21:56Z
- **Completed:** 2026-03-09T22:02Z
- **Tasks:** 2 completed
- **Files modified:** 13

## Accomplishments

### Task 1: packages/workflows scaffold

Created `@my-app/workflows` implementing exactly the ADR-002 §3.2 spec:
- `WorkflowContext` interface: organizationId, actorUserId, idempotencyKey, eventBus
- `InternalWorkflowContext`: extends WorkflowContext with `__completed` step tracking array
- `StepFn<TIn, TOut>`: public signature uses `WorkflowContext` (internal cast to InternalWorkflowContext)
- `createStep(name, invoke, compensate?)`: assigns step output to `__completed`; compensate stored for rollback
- `createWorkflow(name, run)`: wraps run in try/catch; on error runs `[...completed].reverse()` and calls each `compensate` in `.catch(() => {})` wrapper
- 5 unit tests: happy path sequential execution, failure + single compensation, reverse compensation order, compensation errors swallowed, eventBus accessible in steps

### Task 2: workflow DB schema + migration

Added `packages/db/src/schema/workflow.ts`:
- `workflowStatusEnum`: running | completed | failed  
- `workflowStepStatusEnum`: running | completed | failed
- `workflowExecution` table: id, workflowName, idempotencyKey (unique), status, inputSnapshot, outputSnapshot, error, timestamps, completedAt
- `workflowStepLog` table: id, executionId (FK → workflowExecution cascade), stepName, status, snapshots, error, startedAt, completedAt
- Exported from `packages/db/src/schema/index.ts`
- Migration generated: `20260309190037_oval_adam_warlock/migration.sql` with CREATE TYPE + CREATE TABLE + FK constraint
- Parity baseline updated to include `workflowExecution` and `workflowStepLog`
- All 30 packages/db tests still pass

## Self-Check

- ✅ All must_haves verified: createWorkflow returns {success,output/error}, compensation runs in reverse, swallows errors
- ✅ `bun run test` passes in packages/workflows (5/5) and packages/db (30/30)
- ✅ `bun run check-types` passes in packages/workflows and packages/db — 0 errors
- ✅ Migration artifact generated and committed (workflow_execution + workflow_step_log CREATE TABLE)
- ✅ OPER-03: multi-step operations can now be expressed as createWorkflow with visible compensation semantics
