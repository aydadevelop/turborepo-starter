# Phase 10: User Setup Required

**Generated:** 2026-03-10
**Phase:** 10-payment-webhook-cancellation-live-path
**Status:** Incomplete

Complete these items for the live CloudPayments webhook validation path to function in production. Everything automatable in the codebase is already done; this remaining step requires access to the CloudPayments dashboard.

## Environment Variables

None - this plan reuses the existing CloudPayments runtime credentials already configured for the application.

## Dashboard Configuration

- [ ] **Point CloudPayments notifications at the live production webhook with the org-specific endpoint id**
  - Location: CloudPayments dashboard → Notifications / Webhooks
  - Set each live notification URL to:
    - `https://[your-domain]/api/payments/webhook/cloudpayments/check?endpointId=[ORG_WEBHOOK_ENDPOINT_ID]`
    - `https://[your-domain]/api/payments/webhook/cloudpayments/pay?endpointId=[ORG_WEBHOOK_ENDPOINT_ID]`
    - `https://[your-domain]/api/payments/webhook/cloudpayments/fail?endpointId=[ORG_WEBHOOK_ENDPOINT_ID]`
    - `https://[your-domain]/api/payments/webhook/cloudpayments/confirm?endpointId=[ORG_WEBHOOK_ENDPOINT_ID]`
    - `https://[your-domain]/api/payments/webhook/cloudpayments/refund?endpointId=[ORG_WEBHOOK_ENDPOINT_ID]`
    - `https://[your-domain]/api/payments/webhook/cloudpayments/cancel?endpointId=[ORG_WEBHOOK_ENDPOINT_ID]`
  - Notes:
    - Use the `webhookEndpointId` stored on the target org's `organizationPaymentConfig` row.
    - The production ingress also accepts `x-endpoint-id`, but the planned live path expects the query-string form above.

## Verification

After completing setup, verify with:

```bash
# Trigger or wait for a real CloudPayments callback, then confirm the org payment config was promoted
# and the booking/payment state changed through the live ingress path.
```

Expected results:
- The webhook request reaches `/api/payments/webhook/cloudpayments/:type` with the correct `endpointId`
- Invalid signatures are rejected with HTTP 401
- A successful first live webhook promotes the matching org payment config to `validated` and `isActive = true`
- Duplicate callbacks continue returning HTTP 200 `{ code: 0 }` without creating duplicate webhook or payment-attempt rows

---

**Once all items complete:** Mark status as "Complete" at top of file.
