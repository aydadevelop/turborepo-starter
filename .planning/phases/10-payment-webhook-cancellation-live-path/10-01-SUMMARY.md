---
phase: 10-payment-webhook-cancellation-live-path
plan: "01"
subsystem: payments
tags: [cloudpayments, webhook, hmac, reconciliation, idempotency]
requires:
  - phase: 06-payments-notifications-support
    provides: payment-domain reconciliation primitives and payment-provider config storage
  - phase: 09-operator-catalog-booking-intake-wiring
    provides: live app/API request paths that can now receive production payment callbacks
provides:
  - production CloudPayments webhook ingress delegates directly to `reconcilePaymentWebhook()` with enforced endpoint resolution
  - CloudPayments webhook authentication validates real SHA-256 HMAC signatures on a cloned request body or valid Basic Auth credentials
  - first successful webhook ingress promotes the matching org payment config to validated and active while preserving idempotent duplicate handling
affects: [10-02-payment-provider-boundary, 10-03-disputes-cancellation-live-path, 10-04-booking-cancellation-handler, 11-events-notifications-calendar-support-integration]
tech-stack:
  added: []
  patterns: [thin transport delegates to payment domain, adapter-owned auth and body parsing, persistence-backed webhook idempotency]
key-files:
  created: []
  modified:
    - apps/server/src/__tests__/payment-webhook.test.ts
    - packages/api/src/__tests__/cloudpayments.test.ts
    - packages/api/src/handlers/internal/server-routes.ts
    - packages/api/src/payments/webhooks/cloudpayments/adapter.ts
    - packages/api/src/payments/webhooks/types.ts
    - packages/payment/src/__tests__/payment-service.test.ts
    - packages/payment/src/payment-service.ts
key-decisions:
  - "The production webhook ingress now resolves endpointId from the live request and calls reconcilePaymentWebhook() directly instead of routing through adapter.processWebhook()."
  - "CloudPayments auth accepts either valid Basic Auth or a verified SHA-256 HMAC, using raw request text for Content-HMAC and decoded form text for X-Content-HMAC."
  - "The payment domain promotes org payment configs on the first successfully processed webhook and leaves validatedAt unchanged on idempotent duplicates."
patterns-established:
  - "Webhook transport pattern: provider/type validation, adapter auth + parse, route-owned endpoint resolution, domain reconciliation."
  - "Signature verification pattern: clone the request for non-destructive auth checks before body parsing."
requirements-completed: [OPER-01, BOOK-03]
duration: 2 min
completed: 2026-03-10
---

# Phase 10 Plan 01: CloudPayments Live Webhook Reconciliation Summary

**Production CloudPayments ingress now authenticates real callbacks, resolves org-scoped endpoint ids, reconciles booking/payment state idempotently, and promotes the org payment config on first successful live ingress.**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-10T14:32:27Z
- **Completed:** 2026-03-10T14:34:59Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- Replaced the scaffold webhook success path with real production delegation from `packages/api/src/handlers/internal/server-routes.ts` to `@my-app/payment`.
- Added actual CloudPayments signature verification so header presence alone no longer authenticates a callback.
- Promoted `organizationPaymentConfig` to `validated` / active on first successful webhook reconciliation while preserving persistence-backed idempotency for duplicate deliveries.

## Task Commits

Each task was committed atomically:

1. **Task 1: RED — add failing live webhook ingress coverage** - `25d8997` (test)
2. **Task 2: GREEN — route production webhooks through payment reconciliation** - `1f878b6` (feat)

_Note: This TDD plan completed in the RED → GREEN cycle without a separate refactor commit._

## Files Created/Modified

- `apps/server/src/__tests__/payment-webhook.test.ts` - live ingress regression coverage for endpoint resolution, direct reconciliation, and duplicate delivery behavior
- `packages/api/src/__tests__/cloudpayments.test.ts` - HMAC and non-destructive auth/body parsing coverage for the CloudPayments adapter
- `packages/api/src/handlers/internal/server-routes.ts` - thin production ingress route that authenticates, parses, resolves endpoint ids, and delegates to the payment domain
- `packages/api/src/payments/webhooks/cloudpayments/adapter.ts` - real Basic Auth / HMAC verification using a cloned request body
- `packages/api/src/payments/webhooks/types.ts` - adapter auth contract widened to support async verification
- `packages/payment/src/__tests__/payment-service.test.ts` - config-promotion and duplicate-row regression coverage
- `packages/payment/src/payment-service.ts` - validation promotion logic for the first successfully processed webhook event
- `.planning/phases/10-payment-webhook-cancellation-live-path/10-USER-SETUP.md` - manual CloudPayments dashboard follow-up for production webhook URLs

## Decisions Made

- Kept provider auth and payload parsing inside the CloudPayments adapter while moving endpoint resolution and domain invocation into the thin internal server route.
- Preserved the CloudPayments HTTP edge contract on successful and duplicate deliveries by always returning HTTP 200 with `{ code: 0 }` after successful reconciliation.
- Returned a clear HTTP 400 when `endpointId` is missing and HTTP 404 when a supplied endpoint id does not map to a known payment config.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

**External service configuration still requires one manual dashboard step.** See [10-USER-SETUP.md](./10-USER-SETUP.md) for the CloudPayments webhook URL configuration needed to exercise the live production path.

## Next Phase Readiness

- `10-02-PLAN.md` can now build on a real production ingress path instead of a scaffold seam.
- The remaining manual task is CloudPayments dashboard configuration so live org-specific callbacks include the correct `endpointId`.

## Self-Check

PASSED.

---
*Phase: 10-payment-webhook-cancellation-live-path*
*Completed: 2026-03-10*
