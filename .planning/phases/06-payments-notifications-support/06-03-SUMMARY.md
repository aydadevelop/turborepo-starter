# Phase 06-03 Summary: Cancellation Policy Engine & API Wiring

## What Was Built

### Cancellation Reason Catalog: `packages/booking/src/cancellation-reasons.ts`

5 reason codes with actor restrictions and optional refund overrides:

| Code | Allowed Actors | Requires Evidence | Refund Override |
|------|---------------|------------------|-----------------|
| `CUSTOMER_CHANGE_OF_PLANS` | customer | No | – |
| `CUSTOMER_HEALTH_ISSUE` | customer | No | customer: 100% |
| `MANAGER_OPERATIONAL_ISSUE` | manager | No | manager: 100% |
| `MANAGER_WEATHER_ISSUE` | manager | No | manager: 100% |
| `MANAGER_SAFETY_REJECTION` | manager | Yes (photo/doc) | manager: 0% |

### Extended Types: `packages/booking/src/types.ts`

Added:
- `CancellationRequestRow` — inferred from `bookingCancellationRequest.$inferSelect`
- `CancellationEvidence` — `{ type, url, description? }`
- `CancellationPolicyOutcome` — computed refund outcome (actor, policyCode, percentages, amounts)
- `RequestCancellationInput` — service input interface

### Cancellation Service: `packages/booking/src/cancellation-service.ts`

**Private helpers:**
- `resolveCancellationPolicy` — listing → org → org settings fallback chain
- `fetchCapturedAmountCents` — SUM of captured payment attempts
- `fetchProcessedRefundSumCents` — SUM of processed refunds
- `resolveDefaultPolicyByActor` — time-window based policy resolution
- `resolveReasonOverride` — per-actor override from reason catalog

**Exported functions:**
- `computeCancellationPolicyOutcome` — pure computation, no DB side effects
- `requestCancellation` — validates state, checks duplicate, inserts request row with snapshot
- `applyCancellation` — db.transaction: updates request → cancels booking → inserts refund (if any)
- `getActiveCancellationRequest` — returns non-rejected/cancelled request for booking
- `listOrgCancellationRequests` — all requests for org, ordered by requestedAt desc

### API Contract Extension: `packages/api-contract/src/routers/booking.ts`

Added 4 routes:
- `requestCancellation` — preview: validates + inserts request, returns `{request, outcome}`
- `applyCancellation` — commit: returns `{requestId, refundId}`
- `getActiveCancellationRequest` — returns nullable request
- `listCancellationRequests` — returns array of requests

### API Handler Extension: `packages/api/src/handlers/booking.ts`

- Added `notificationsPusher` import and side-effect to `updateStatus` for "confirmed" / "cancelled" transitions (non-blocking; failure is swallowed)
- Added `formatCancellationRequest` helper
- Added 4 handler entries with appropriate error translations:
  - `INVALID_STATE` → 400 BAD_REQUEST
  - `DUPLICATE_REQUEST` → 409 CONFLICT
  - `EVIDENCE_REQUIRED` → 400 BAD_REQUEST
  - `REASON_CODE_NOT_ALLOWED` → 403 FORBIDDEN

## Key Schema Adaptations

The `bookingCancellationRequest` table uses different column names than originally planned:
- Stores `bookingTotalPriceCents` (= capturedAmount snapshot)
- Stores `penaltyAmountCents` (= captured - suggestedRefund)
- Stores `refundAmountCents` (= suggestedRefundCents)
- Has a unique index on `bookingId` alone (enforces 1 request per booking total)

`bookingRefund` idempotency: unique index on `(provider, externalRefundId)` pair — used with `onConflictDoNothing`.

## Tests
- `cancellation-service.test.ts`: 9 tests, all pass
  - Customer free window → 100% refund
  - Customer penalty window (3h) → 80% refund
  - Customer late window (30min) → 0% refund
  - Manager-initiated → 100% refund
  - CUSTOMER_HEALTH_ISSUE reason override → 100% regardless of time
  - MANAGER_SAFETY_REJECTION without evidence → throws EVIDENCE_REQUIRED
  - MANAGER_SAFETY_REJECTION with evidence → 0% refund
  - No captured payments → refundId=null from applyCancellation
  - Duplicate request guard → throws DUPLICATE_REQUEST

## Artifacts

| File | Status |
|------|--------|
| `packages/booking/src/cancellation-reasons.ts` | Created |
| `packages/booking/src/cancellation-service.ts` | Created |
| `packages/booking/src/__tests__/cancellation-service.test.ts` | Created |
| `packages/booking/src/types.ts` | Extended (+4 types) |
| `packages/booking/src/index.ts` | Extended (+2 exports) |
| `packages/api-contract/src/routers/booking.ts` | Extended (+4 routes) |
| `packages/api/src/handlers/booking.ts` | Extended (+notification hook, +4 handlers) |
