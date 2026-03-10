---
phase: 10-payment-webhook-cancellation-live-path
plan: "02"
subsystem: payments
tags: [payments, cloudpayments, adapters, registry, refunds]
requires:
  - phase: 06-payments-notifications-support
    provides: "organization payment config storage, booking payment attempts, and webhook-backed payment state"
  - phase: 07-review-missing-extractions
    provides: "runtime credential-passing adapter patterns and disputes workflow target state"
provides:
  - "Execution-side payment provider contract for refund orchestration"
  - "Resettable payment provider registry for runtime resolution and test isolation"
  - "CloudPayments refund adapter using org-scoped runtime credentials and idempotent request headers"
affects: [payment, disputes, booking]
tech-stack:
  added: []
  patterns:
    - "Per-call payment execution config mirrors the calendar package's runtime credential boundary"
    - "Integer cents stay in domain code and convert to provider decimals only inside the adapter"
    - "Provider registries expose reset helpers for deterministic unit tests"
key-files:
  created:
    - packages/payment/src/provider.ts
    - packages/payment/src/registry.ts
    - packages/payment/src/adapters/cloudpayments.ts
    - packages/payment/src/__tests__/cloudpayments-provider.test.ts
  modified:
    - packages/payment/src/index.ts
key-decisions:
  - "CloudPayments credentials are resolved from org-scoped runtime config, not constructor state or process.env"
  - "Refund idempotency is carried via CloudPayments X-Request-ID headers while adapter errors stay explicit and typed by message prefix"
  - "CloudPayments refund requests validate numeric transaction ids and positive integer-cent amounts before crossing the provider boundary"
patterns-established:
  - "Disputes workflows can resolve payment execution adapters through getPaymentProvider(providerId) without importing provider-specific code"
  - "Payment adapters own provider-specific request normalization, auth headers, and response validation locally"
requirements-completed:
  - BOOK-05
duration: "5 min"
completed: 2026-03-10
---

# Phase 10 Plan 02: Payment refund provider boundary Summary

**Execution-side refund provider registry with a CloudPayments adapter that accepts org-scoped runtime credentials, sends idempotent refund requests, and preserves integer-cent boundaries until the provider edge**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-10T14:24:37Z
- **Completed:** 2026-03-10T14:29:56Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Added a package-owned payment execution contract that downstream workflows can call through a registry instead of importing CloudPayments directly.
- Added a resettable provider registry with clear missing-provider failures for deterministic test setup and runtime resolution.
- Implemented a CloudPayments refund adapter that accepts runtime org credentials, converts cents only at the adapter boundary, and fails explicitly for malformed config, HTTP failures, and provider-side errors.
- Extended payment package tests to cover registry behavior, successful refund execution, cent conversion, malformed credential blobs, and provider/API error handling.

## Task Commits

Each task was committed atomically:

1. **Task 1: Define the payment execution contract and resettable registry** - `24b486d` (feat)
2. **Task 2: Implement the CloudPayments refund adapter with org-scoped runtime config** - `b233910` (feat)

## Files Created/Modified

- `packages/payment/src/provider.ts` - Defines the execution-side refund provider contract and per-call runtime config shape.
- `packages/payment/src/registry.ts` - Provides register/get/reset helpers for runtime provider resolution.
- `packages/payment/src/adapters/cloudpayments.ts` - Implements CloudPayments refund execution with Basic Auth, `X-Request-ID`, cents-to-decimal conversion, and explicit adapter errors.
- `packages/payment/src/__tests__/cloudpayments-provider.test.ts` - Covers registry behavior and CloudPayments refund success/error scenarios.
- `packages/payment/src/index.ts` - Re-exports the new provider, registry, and CloudPayments adapter surface.

## Decisions Made

- Reused the calendar package’s per-call runtime config pattern so credentials stay org-scoped and injected at execution time.
- Validated CloudPayments-specific requirements inside the adapter boundary, including numeric transaction ids and positive integer-cent refund amounts.
- Used `X-Request-ID` for CloudPayments request idempotency instead of pushing idempotency concerns into the domain layer.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `10-03` can now resolve `getPaymentProvider(config.provider).refundPayment(...)` from `@my-app/payment` without importing CloudPayments directly.
- The new adapter surface is covered by focused tests and typechecks, so the disputes workflow can integrate it without inventing new provider glue.
- No blockers found for the next payment/cancellation workflow step.

## Self-Check: PASSED

- Verified key implementation files exist on disk.
- Verified task commits `24b486d` and `b233910` exist in git history.
