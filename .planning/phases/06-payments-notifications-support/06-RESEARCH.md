# Phase 6 Research: Payments, Notifications & Support Operations

## Summary

All database schema tables required for Phase 6 already exist in
`packages/db/src/schema/marketplace.ts` and `packages/db/src/schema/support.ts`.
No new migrations are needed. The work is purely domain-service extraction,
contract addition, and handler wiring.

---

## 1. Existing Infrastructure Inventory

### Payment Webhook Adapter (READY)

`packages/api/src/payments/webhooks/cloudpayments/adapter.ts`

- `CloudPaymentsWebhookAdapter` class: `authenticateWebhook()`, `parseWebhookBody()`, `processWebhook()`
- Supports webhook types: `check`, `pay`, `fail`, `confirm`, `refund`, `cancel`
- Basic Auth against publicId / apiSecret
- **Critical gap**: `processWebhook()` currently returns `{ code: number }` with zero DB writes. Reconciliation logic (inserting `paymentWebhookEvent`, updating `bookingPaymentAttempt` and `booking.paymentStatus`) must be an extracted domain service called from the handler.

### Payments Handler (THIN — needs extension)

`packages/api/src/handlers/payments.ts`

Only 2 routes exist: `providers` (public) and `createMockChargeNotification` (operator-scoped).
Routes to add: `connectProvider`, `getOrgConfig`, `receiveWebhook`.

### Relevant Schema Tables (ALL EXIST)

| Table | Key Columns | Notes |
|-------|-------------|-------|
| `organizationPaymentConfig` | `organizationId`, `provider` (UNIQUE together), `webhookEndpointId` (UNIQUE), `validationStatus` | upsert on `(organizationId, provider)` |
| `paymentWebhookEvent` | `endpointId`, `organizationId`, `webhookType`, `status`, `payload` | no idempotency unique — must query before insert |
| `bookingPaymentAttempt` | `idempotencyKey` (UNIQUE w/ bookingId), `providerIntentId` (UNIQUE w/ provider), `status` | upsert target for webhook reconciliation |
| `bookingRefund` | `externalRefundId` (UNIQUE w/ provider), `status`, `amountCents` | insert on cancellation apply |
| `bookingCancellationRequest` | UNIQUE on `bookingId`; dual `customerDecision` + `managerDecision` fields | `status` enum: requested / pending_review / approved / rejected / applied / cancelled |
| `cancellationPolicy` | `freeWindowHours`, `penaltyBps`, `latePenaltyBps`, `latePenaltyWindowHours`, `scope` (listing \| organization) | listing scope overrides org scope |
| `supportTicket` | `organizationId`, `bookingId` (nullable), `customerUserId`, `status`, `priority`, `source` | status enum: open / pending_customer / pending_operator / escalated / resolved / closed |
| `supportTicketMessage` | `ticketId`, `organizationId`, `authorUserId`, `channel`, `body`, `isInternal` | channel: web / internal / email |

`organizationSettings` also carries fallback cancellation policy:
`cancellationFreeWindowHours` (default 24h) and `cancellationPenaltyBps` (default 0).

### Notification System (READY)

`notificationsPusher()` from `@my-app/notifications/pusher` is already used in `payments.ts`.
Pattern: call `notificationsPusher({ input: EmitNotificationEventInput, queue?: QueueProducer })`.
Notification is idempotent via `idempotencyKey` — duplicate calls with the same key are no-ops.
Context provides `context.notificationQueue` (optional — may be undefined in tests).

### Event Bus (READY — not used for Phase 6)

`packages/api/src/lib/event-bus.ts` has a collect-and-flush `EventBus` class but it is NOT
wired for Phase 6 notifications. Direct `notificationsPusher` calls in handlers (same pattern
as `createMockChargeNotification`) are the correct approach for BOOK-04.

---

## 2. Domain Services to Create

### `packages/payment/` (new)

Service functions:
- `connectPaymentProvider(input, db)` — upsert `organizationPaymentConfig`
- `getOrgPaymentConfig(organizationId, db)` — single row by org
- `reconcilePaymentWebhook(endpointId, webhookType, payload, db)` — idempotent processing

### `packages/support/` (new)

Service functions:
- `createSupportTicket(input, db)` — insert into `supportTicket`
- `addTicketMessage(input, db)` — insert into `supportTicketMessage`
- `getTicket(id, organizationId, db)` — fetch with NOT_FOUND guard
- `listOrgTickets(organizationId, filters, db)` — paginated list

### `packages/booking/src/cancellation-service.ts` (extend existing package)

Service functions:
- `requestCancellation(input, db)` — compute penalty, insert request + refund row, update booking
- `applyCancellation(requestId, organizationId, approvedByUserId, db)` — finalize in transaction
- `getActiveCancellationRequest(bookingId, organizationId, db)` — fetch active request

---

## 3. Reconciliation Design (BOOK-03)

**Idempotency approach**: `paymentWebhookEvent` has no unique constraint for idempotency.
Before inserting a new event row, query for existing row where:
```
endpointId = ? AND webhookType = ? AND payload->>'TransactionId' = ?
```
If found with `status = 'processed'`, return early (`{ idempotent: true }`).

**Payload field mapping** (CloudPayments webhook body):
- `TransactionId` → `providerIntentId` on `bookingPaymentAttempt`
- `InvoiceId` → `bookingId` (by convention: the invoice ID is the booking ID)
- `Amount` → `amountCents` (multiply by 100, round)
- `Currency` → `currency`
- `Status` (within payload) → internal status mapping

**Status transitions on webhook type**:
- `pay` / `confirm` → `bookingPaymentAttempt.status = 'captured'`; `booking.paymentStatus = 'paid'`
- `fail` → `bookingPaymentAttempt.status = 'failed'`; `booking.paymentStatus = 'failed'`
- `refund` → `booking.paymentStatus = 'refunded'`; `booking.refundAmountCents = payload.Amount * 100`
- `check` / `cancel` → record event, update status to 'processed', no booking mutation

---

## 4. Cancellation Policy Computation (BOOK-05)

Policy lookup order (listing overrides org):
1. `SELECT * FROM cancellationPolicy WHERE listingId = booking.listingId AND isActive = true`
2. If none: `SELECT * FROM cancellationPolicy WHERE organizationId = ? AND scope = 'organization' AND isActive = true`
3. If none: use `organizationSettings.cancellationFreeWindowHours` / `cancellationPenaltyBps` as fallback

Penalty calculation:
```
hoursUntilStart = (booking.startsAt - now) / 3_600_000
if hoursUntilStart >= policy.freeWindowHours:
  penaltyAmountCents = 0
else if hoursUntilStart < policy.latePenaltyWindowHours:
  penaltyAmountCents = Math.round(booking.totalPriceCents * policy.latePenaltyBps / 10_000)
else:
  penaltyAmountCents = Math.round(booking.totalPriceCents * policy.penaltyBps / 10_000)
refundAmountCents = booking.totalPriceCents - penaltyAmountCents
```

---

## 5. Wave Ordering & File Conflicts

| Plan | Wave | Reason |
|------|------|--------|
| 06-01 | 1 | Independent — creates new package, extends payments contract/handler |
| 06-02 | 2 | Depends on 06-01: both touch `packages/api/package.json` |
| 06-03 | 3 | Depends on 06-02: both touch `packages/api/src/handlers/booking.ts` |

Sequential ordering is required to prevent shared file conflicts on `api/package.json`
(06-01 and 06-02 both add a new workspace dep) and on `booking.ts` handler
(06-02 adds notification call; 06-03 adds cancellation routes).

---

## 6. Standard Stack Confirmed

| Concern | Library/Pattern |
|---------|----------------|
| DB access | `drizzle-orm` via `@my-app/db` |
| ID generation | `crypto.randomUUID()` |
| Timestamps | Drizzle default `now()` — no manual `Date.now()` needed in most inserts |
| Error protocol | `throw new Error("SCREAMING_SNAKE")` in service, translate to `ORPCError` in handler |
| Date serialization | `.toISOString()` for non-null, `?.toISOString() ?? null` for nullable |
| Permission guard | `organizationPermissionProcedure({...})` for operators, `protectedProcedure` for customers |
