---
phase: "06"
phase_name: Payments, Notifications & Support Operations
created_from: gsd-discuss-phase
legacy_reference: legacy/full-stack-cf-app/packages/api/src/routers/booking/cancellation/
---

# Phase 6 Context: Cancellation Policy

## Decisions

### 1. Actor Model — THREE actors, not two

**Locked**: The cancellation policy uses three actor tiers:

- **`customer`** — time-window based refund (free → partial → late)
- **`manager`** (maps to "owner" in policy logic) — always gives the customer full refund; the operator bears the cost. Manager cancellations do NOT go through time windows.
- **`system`** — scoped out of Phase 6 (no auto-expiry or calendar-conflict automation in this phase)

**How this maps to the DB schema**: `bookingCancellationRequest.initiatedByRole` stays `"customer" | "manager"` (existing enum). Policy resolution in the service branches on this.

### 2. Three-Tier Customer Time Windows

**Locked**: Customer cancellations use THREE time tiers, not two. The `cancellationPolicy` table schema already has all required columns:

| Tier | Condition | Refund Percent |
|------|-----------|----------------|
| Free window | `hoursUntilStart >= freeWindowHours` | 100% |
| Penalty window | `latePenaltyWindowHours <= hoursUntilStart < freeWindowHours` | `penaltyBps / 100` % |
| Late window | `hoursUntilStart < latePenaltyWindowHours` | `latePenaltyBps / 100` % |

**Default values** (from `organizationSettings` fallback):
- `freeWindowHours = 24`
- `penaltyBps = 2000` (20%)
- `latePenaltyWindowHours = 2`
- `latePenaltyBps = 10000` (100% penalty = 0% refund)

### 3. Refund Base: Actual Captured Amount, Not totalPriceCents

**Locked**: Refund computation uses **actual payment capture data**, not the booking price snapshot.

```
capturedAmountCents = SUM(bookingPaymentAttempt.amountCents WHERE status = 'captured')
alreadyRefundedCents = SUM(bookingRefund.amountCents WHERE status = 'processed')
refundableBaseCents = MAX(capturedAmountCents - alreadyRefundedCents, 0)
```

If no payments have been captured (`capturedAmountCents = 0`), `refundableBaseCents = 0` and `suggestedRefundCents = 0`. The cancellation request is still created (booking is cancelled), but no refund row is inserted.

The `requestCancellation` service should return a **preview outcome** (computed amounts) WITHOUT committing the actual cancellation — a separate `applyCancellation` call commits. This mirrors the legacy UX where the customer sees "you'll get X back" before confirming.

### 4. Reason Code Catalog — 5 Core Codes

**Locked**: Include reason codes in Phase 6. Five codes cover the core product surface:

| Code | Allowed Actors | Refund Override | Requires Evidence |
|------|---------------|-----------------|-------------------|
| `CUSTOMER_CHANGE_OF_PLANS` | customer, manager | none (uses time window) | no |
| `CUSTOMER_HEALTH_ISSUE` | customer, manager | customer → 100%, manager → 100% | no |
| `MANAGER_OPERATIONAL_ISSUE` | manager | customer → 100% | no |
| `MANAGER_WEATHER_ISSUE` | manager | customer → 100% | no |
| `MANAGER_SAFETY_REJECTION` | manager | customer → 0% | yes (evidence required) |

Evidence shape: `{ type: "photo" | "video" | "document" | "message" | "other", url: string, note?: string }`.

When a reason code provides a refund override for the actor, it **replaces** the time-window calculation entirely.

### 5. Policy Outcome Object (Preview Before Commit)

**Locked**: `requestCancellation` returns a `CancellationPolicyOutcome` that shows the user what will happen. This is stored as a snapshot in the request row. `applyCancellation` uses the snapshot — no recalculation.

```typescript
interface CancellationPolicyOutcome {
  actor: "customer" | "manager";
  policyCode: "customer_early_full_refund" | "customer_standard_partial_refund" | "customer_late_no_refund" | "manager_default_full_refund" | "reason_override_refund";
  policyLabel: string;
  policySource: "default_profile" | "reason_override";
  reasonCode?: string;
  hoursUntilStart: number;
  capturedAmountCents: number;
  alreadyRefundedCents: number;
  refundableBaseCents: number;
  refundPercent: number;
  suggestedRefundCents: number;
}
```

### 6. Idempotent Refund Insertion

**Locked**: `bookingRefund` rows use `externalRefundId = "booking:{bookingId}:policy-auto"` with conflict handling, so `applyCancellation` is safe to retry.

---

## Deferred Ideas

- **System actor** (auto-expiry webhooks, calendar conflict cancellations) → Phase 7+
- **Evidence upload** (S3 presigned URLs for evidence attachments) → separate media phase
- **Dual-approval workflow** (customer decides, manager reviews) → the schema has the fields but Phase 6 is self-service: customer or manager initiates and it's auto-applied
- **Partial cancellations** (cancel one booking in a multi-booking series) → out of scope

---

## Impact on 06-03-PLAN.md

The plan must be updated to:
1. Add reason code catalog (`CancellationReasonCode` type + `cancellationReasonCatalog` constant)
2. Fix `computePenalty` to use three tiers correctly (free → partial → late)
3. Change `requestCancellation` to query actual captured amounts, not `totalPriceCents`
4. Add `reasonCode?: string` + `evidence?: Evidence[]` to `RequestCancellationInput`
5. Return `CancellationPolicyOutcome` from `requestCancellation` (preview, not commit)
6. `applyCancellation` uses the stored snapshot `refundAmountCents` from the request row (no recalc)
7. Branch manager-initiated cancellations to always give 100% refund (bypass time windows)
