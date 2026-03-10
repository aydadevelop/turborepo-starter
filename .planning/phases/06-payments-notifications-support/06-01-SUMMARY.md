# Phase 06-01 Summary: Payment Package & API Wiring

## What Was Built

### New Package: `packages/payment`

A standalone domain package for payment provider integration and webhook reconciliation.

**Files created:**
- `packages/payment/package.json` — `@my-app/payment`, deps: `@my-app/db`, `drizzle-orm`
- `packages/payment/tsconfig.json`
- `packages/payment/vitest.config.ts`
- `packages/payment/src/types.ts` — `Db`, `OrgPaymentConfigRow`, `PaymentWebhookEventRow`, `BookingPaymentAttemptRow`, `ConnectPaymentProviderInput`, `ReconcileWebhookResult`
- `packages/payment/src/payment-service.ts` — 3 exported functions
- `packages/payment/src/__tests__/payment-service.test.ts` — 3 tests

### API Contract Extension: `packages/api-contract/src/routers/payments.ts`

Added schemas and 3 new contract routes:
- `orgPaymentConfigOutputSchema`, `connectProviderInputSchema`, `receiveWebhookInputSchema`, `receiveWebhookOutputSchema`
- `connectProvider` — upserts org payment config (payment:create permission)
- `getOrgConfig` — returns current org payment config (payment:read permission)
- `receiveWebhook` — public endpoint for inbound provider webhooks

### API Handler Extension: `packages/api/src/handlers/payments.ts`

Added 3 handler entries to `paymentsRouter`:
- `connectProvider` → `connectPaymentProvider()` from `@my-app/payment`
- `getOrgConfig` → `getOrgPaymentConfig()`, returns null if not configured
- `receiveWebhook` → `reconcilePaymentWebhook()`, translates `ENDPOINT_NOT_FOUND` → `ORPCError("NOT_FOUND")`

### API Package Dependencies

Added to `packages/api/package.json`:
- `@my-app/payment: workspace:*`
- `@my-app/support: workspace:*`

## Key Implementation Decisions

### Idempotency Check Approach
The webhook reconciliation idempotency check uses `requestSignature` column (set to `${endpointId}:${webhookType}:${transactionId}`) instead of a JSON-path SQL query. The JSON-path approach (`payload->>'TransactionId'`) proved unreliable in PGlite tests due to transaction rollback behavior in the test harness.

### Provider Type
`ConnectPaymentProviderInput.provider` is typed as `"cloudpayments" | "stripe"` matching the DB `paymentProviderEnum`. Contract input uses `z.enum(["cloudpayments", "stripe"])`.

## Tests
- `payment-service.test.ts`: 3 tests, all pass
  - Process pay webhook, verify booking marked paid, idempotent duplicate returns `{idempotent: true}`
  - Unknown endpointId throws `ENDPOINT_NOT_FOUND`
  - connectPaymentProvider upserts (no duplicate rows on second call)

## Artifacts

| File | Status |
|------|--------|
| `packages/payment/src/payment-service.ts` | Created |
| `packages/payment/src/types.ts` | Created |
| `packages/api-contract/src/routers/payments.ts` | Extended (+3 routes) |
| `packages/api/src/handlers/payments.ts` | Extended (+3 handlers) |
| `packages/api/package.json` | Extended (+2 deps) |
