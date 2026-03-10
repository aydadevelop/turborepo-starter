---
status: testing
phase: 06-payments-notifications-support
source:
  - 06-01-SUMMARY.md
  - 06-02-SUMMARY.md
  - 06-03-SUMMARY.md
started: 2026-03-10T00:00:00.000Z
updated: 2026-03-10T00:00:00.000Z
---

## Current Test
<!-- OVERWRITE each test - shows where we are -->

number: 1
name: Connect payment provider
expected: |
  Calling connectProvider with a valid orgId, provider ("cloudpayments" or "stripe"),
  and endpoint credentials upserts the org's payment config in the DB.
  Calling it a second time with updated credentials replaces the row (no duplicate rows).
  Running the payment-service tests confirms: npx vitest run packages/payment shows 3/3 passing.
awaiting: user response

## Tests

### 1. Connect payment provider
expected: |
  Calling connectProvider with a valid orgId, provider ("cloudpayments" or "stripe"),
  and endpoint credentials upserts the org's payment config in the DB.
  Calling it a second time with updated credentials replaces the row (no duplicate rows).
  Running the payment-service tests confirms: npx vitest run packages/payment shows 3/3 passing.
result: pending

### 2. Get org payment config
expected: |
  Calling getOrgConfig for an org that has a connected provider returns the config row.
  Calling getOrgConfig for an org with no config returns null (not an error).
result: pending

### 3. Webhook reconciliation — pay event marks booking paid
expected: |
  Sending a valid webhook payload to receiveWebhook with a known endpointId, webhookType,
  and transactionId inserts a payment attempt row and marks the booking as paid.
  Sending the exact same webhook a second time returns { idempotent: true } with no duplicate rows.
result: pending

### 4. Webhook reconciliation — unknown endpoint returns NOT_FOUND
expected: |
  Sending a webhook with an unknown endpointId causes receiveWebhook to throw
  an oRPC NOT_FOUND error (ENDPOINT_NOT_FOUND translated from the service).
result: pending

### 5. Create support ticket
expected: |
  Calling createTicket with a valid orgId and bookingId inserts a ticket row
  with status=open, priority=normal, source=web by default.
  The created ticket ID is returned in the response.
  Running: npx vitest run packages/support shows 4/4 passing.
result: pending

### 6. Add message to ticket — cross-org guard
expected: |
  Calling addMessage with a ticketId owned by a different org throws NOT_FOUND.
  Calling addMessage with a ticketId owned by the correct org appends the message
  and returns the new message row.
result: pending

### 7. List org tickets with filters
expected: |
  Calling listOrgTickets without filters returns all tickets for the org.
  Passing status="open" filters to open tickets only.
  Passing bookingId filters to tickets tied to that booking.
result: pending

### 8. Cancellation policy preview — customer free window
expected: |
  Calling requestCancellation as a customer within the free window (e.g., >24h before)
  returns a policy outcome showing 100% refund and inserts a cancellation request row.
  The response includes { request, outcome } with outcome.customerRefundPct = 100.
  Running: npx vitest run packages/booking shows 9/9 cancellation tests passing.
result: pending

### 9. Cancellation policy preview — late window penalty
expected: |
  Calling requestCancellation as a customer within the late window (e.g., <30min before)
  returns a policy outcome showing 0% refund.
  outcome.customerRefundPct = 0 and outcome.penaltyAmountCents equals the full captured amount.
result: pending

### 10. Apply cancellation with refund
expected: |
  Calling applyCancellation on an accepted cancellation request:
  - Updates the cancellation request status to applied
  - Sets the booking status to cancelled
  - Inserts a refund row (if refundAmountCents > 0)
  - Returns { requestId, refundId }
  If there are no captured payments, refundId is null.
result: pending

### 11. Cancellation guards
expected: |
  Submitting a second requestCancellation for the same booking throws DUPLICATE_REQUEST (translated to 409 CONFLICT in the API).
  Submitting MANAGER_SAFETY_REJECTION without evidence throws EVIDENCE_REQUIRED (translated to 400 BAD_REQUEST).
  Submitting CUSTOMER_CHANGE_OF_PLANS as a manager actor throws REASON_CODE_NOT_ALLOWED (403 FORBIDDEN).
result: pending

### 12. Booking status notification hook
expected: |
  Updating a booking status to "confirmed" or "cancelled" via the updateStatus handler
  triggers a non-blocking notification side-effect (notificationsPusher).
  If the push fails, the booking update still succeeds (failure is swallowed).
  The handler does NOT trigger notifications for other status transitions.
result: pending

## Summary

total: 12
passed: 0
issues: 0
pending: 12
skipped: 0

## Gaps

[none yet]
