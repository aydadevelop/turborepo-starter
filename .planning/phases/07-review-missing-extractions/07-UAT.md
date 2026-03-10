---
status: testing
phase: 07-review-missing-extractions
source:
  - 07-01-SUMMARY.md
  - 07-02-SUMMARY.md
  - 07-03-SUMMARY.md
  - 07-04-SUMMARY.md
started: 2026-03-10T12:00:00Z
updated: 2026-03-10T12:00:00Z
---

## Current Test

<!-- OVERWRITE each test - shows where we are -->

number: 1
name: Booking package tests — all 44 pass
expected: |
  Run: bun run --filter @my-app/booking test
  All 44 tests in 4 test files pass (action-policy, overlap, slots, booking-service, cancellation-service).
  No test failures or errors.
awaiting: user response

## Tests

### 1. Booking package tests — all 44 pass
expected: Run `bun run --filter @my-app/booking test` — 44 tests in 4 files all pass (action-policy, overlap, slots, booking-service, cancellation-service).
result: pending

### 2. Booking action policy — correct refund window evaluation
expected: Run `bun run --filter @my-app/booking test --reporter=verbose 2>&1 | grep "action-policy"`. Tests for evaluateBookingActionWindow and resolveBookingActionWindowPolicyProfile show 9 passing.
result: pending

### 3. Calendar package typechecks cleanly
expected: Run `npx tsc --noEmit -p packages/calendar/tsconfig.json` — exits with code 0, no output.
result: pending

### 4. FakeCalendarAdapter CRUD works in-memory
expected: The FakeCalendarAdapter class is exported from `@my-app/calendar`. It stores events in a Map — createEvent returns an eventId, getAllEvents(calendarId) returns the stored events, deleteEvent removes them.
result: pending

### 5. GoogleCalendarAdapter is exported and wraps service account key
expected: Run `node -e "import('@my-app/calendar').then(m => console.log(typeof m.GoogleCalendarAdapter))" --input-type=module` inside the package (or check that `packages/calendar/src/google-adapter.ts` exports `GoogleCalendarAdapter` and `GoogleCalendarApiError`). No process.env reads inside any method.
result: pending

### 6. Server starts without crashing (calendar registration wiring)
expected: `apps/server/src/index.ts` registers the Google adapter and `registerBookingLifecycleSync` before the HTTP listener. Run `npx tsc --noEmit -p apps/server/tsconfig.json` — exits with code 0.
result: pending

### 7. Disputes package tests — all 8 pass
expected: Run `bun run --filter @my-app/disputes test` — 8 tests in `cancellation-policy.test.ts` all pass.
result: pending

### 8. evaluateCancellationPolicy — flexible policy, 48h early
expected: With FLEXIBLE_CANCELLATION_POLICY, a customer cancelling 48h before start gets 100% refund (refundPercent: 100, policyCode: "customer_early_full_refund").
result: pending

### 9. evaluateCancellationPolicy — strict policy, late cancellation
expected: With STRICT_CANCELLATION_POLICY, a customer cancelling 12h before start gets 0% refund (refundPercent: 0, policyCode: "customer_late_refund").
result: pending

### 10. evaluateCancellationPolicy — owner always gets 100% regardless of timing
expected: Owner actor with 1h until start returns refundPercent: 100, policyCode: "owner_default_refund" regardless of how late the cancellation is.
result: pending

### 11. processCancellationWorkflow has compensation step
expected: Run `grep "compensate" packages/disputes/src/cancellation-workflow.ts` — compensation callback is present in the apply-refund step. If a downstream step fails, the bookingRefund row status gets set to "rejected".
result: pending

### 12. processDisputeWorkflow — open and resolve both exported
expected: `packages/disputes/src/index.ts` exports `processDisputeWorkflow`. Calling `processDisputeWorkflow(db)` returns an object with `{ open, resolve }` workflow instances.
result: pending

### 13. Full typecheck across all new packages
expected: Run `npx tsc --noEmit -p packages/calendar/tsconfig.json && npx tsc --noEmit -p packages/disputes/tsconfig.json && npx tsc --noEmit -p apps/server/tsconfig.json && echo ALL_CLEAN` — outputs "ALL_CLEAN" with no errors.
result: pending

## Summary

total: 13
passed: 0
issues: 0
pending: 13
skipped: 0

## Gaps

[none yet]
