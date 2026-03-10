---
phase: 07-review-missing-extractions
plan: "04"
subsystem: disputes
tags: [disputes, cancellation, workflow, refunds, policy]

requires:
  - phase: 06-payments-notifications-support
    provides: "booking cancellation/refund data model and payment/support context"
  - phase: 02-events-workflows-parity-foundations
    provides: "workflow engine and typed event bus"
provides:
  - "Pure cancellation policy evaluation service"
  - "Cancellation workflow factory with refund and booking-status steps"
  - "Dispute open/resolve workflow factories"
affects: [disputes, booking, payment, events]

tech-stack:
  added: []
  patterns:
    - "Workflow factories close over db so step execution stays typed without global state"
    - "Cancellation policy logic stays pure and reusable outside workflow execution"

key-files:
  created:
    - packages/disputes/package.json
    - packages/disputes/src/policy-templates.ts
    - packages/disputes/src/cancellation-policy-service.ts
    - packages/disputes/src/cancellation-workflow.ts
    - packages/disputes/src/dispute-workflow.ts
    - packages/disputes/src/__tests__/cancellation-policy.test.ts
    - packages/disputes/src/index.ts
  modified: []

key-decisions:
  - "Refund initiation is deferred; workflows currently record requested refunds instead of calling a provider SDK"
  - "Dispute workflows are split into open and resolve variants because their input shapes differ materially"

patterns-established:
  - "Pure policy services feed workflow steps so business rules can be tested without DB setup"
  - "Workflow compensation writes enum-valid statuses rather than inventing new rollback states"

requirements-completed:
  - EXTR-04

duration: "n/a"
completed: 2026-03-10
---

# Phase 07-04 Summary: packages/disputes scaffold

## Objective
Create the `packages/disputes` package with pure CancellationPolicyService, policy templates, and two workflow factories for cancellation and dispute lifecycle management.

## Artifacts Created

### `packages/disputes/package.json`
- Package name: `@my-app/disputes`
- Dependencies: `@my-app/booking`, `@my-app/db`, `@my-app/events`, `@my-app/workflows`
- No `@my-app/payment` dependency (refund initiation via `bookingRefund` table — no CloudPayments SDK)

### `packages/disputes/src/policy-templates.ts`
- Three exported policy profiles: `FLEXIBLE_CANCELLATION_POLICY`, `MODERATE_CANCELLATION_POLICY`, `STRICT_CANCELLATION_POLICY`
- `defaultBookingCancellationPolicyProfile` = MODERATE (24h full refund, 6h partial at 50%)
- `bookingCancellationReasonCatalog` — all 7 reason codes with actor restrictions and refund overrides
- `BookingCancellationPolicyProfile`, `BookingCancellationPolicyActor`, `BookingCancellationReasonCode` types

### `packages/disputes/src/cancellation-policy-service.ts`
- **Pure domain logic — zero DB or HTTP dependencies**
- `evaluateCancellationPolicy(input: CancellationPolicyInput): CancellationPolicyDecision`
- Applies time-based customer refund tiers, owner/system actor defaults, reason-code overrides
- Clamps percentages and prevents refund > refundable base
- Throws structured errors for invalid actor/reason combinations

### `packages/disputes/src/cancellation-workflow.ts`
- `processCancellationWorkflow(db: Db)` factory → returns `createWorkflow` instance
- Steps (with auto-compensation via `createStep`):
  1. `evaluate-cancellation-policy` — calls pure `evaluateCancellationPolicy`
  2. `apply-refund` — inserts `bookingRefund` row (status: requested); compensates by setting to `rejected` on downstream failure
  3. `update-booking-cancelled` — calls `updateBookingStatus` from `@my-app/booking`
  4. `emit-booking-cancelled` — emits `booking:cancelled` via `ctx.eventBus`

### `packages/disputes/src/dispute-workflow.ts`
- `processDisputeWorkflow(db: Db)` factory → returns `{ open, resolve }` workflows
- `open`: inserts `bookingDispute` row + emits `dispute:opened`
- `resolve`: updates dispute to `resolved` + emits `dispute:resolved`

### `packages/disputes/src/__tests__/cancellation-policy.test.ts`
- 8 pure unit tests, no DB mocking
- Covers: flexible/strict timing tiers, owner 100% override, reason-code override, already-refunded subtraction, zero refundable base, system before-start default, invalid actor/reason error

### `packages/disputes/src/index.ts`
Barrel exports all public types and functions.

## Verification
- `bun run --filter @my-app/disputes test` → 8/8 tests pass
- `npx tsc --noEmit -p packages/disputes/tsconfig.json` → clean
- Committed: `aa21c14`

## Key Decisions
- **Factory pattern** for workflows (close over `db`) since `WorkflowContext` doesn't include `db`
- **Compensation status**: `"rejected"` (not `"reversed"`) — must match `refundStatusValues` enum
- **No CloudPayments SDK call**: inserts `bookingRefund` with `status: "requested"` — payment processing is deferred to `@my-app/payment` when that package exports `initiateRefund`
- `processDisputeWorkflow` returns `{ open, resolve }` object since the two operations have distinct incompatible input shapes
