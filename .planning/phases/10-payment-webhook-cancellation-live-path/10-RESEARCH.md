# Phase 10: Payment Webhook & Cancellation Live Path - Research

**Researched:** 2026-03-10
**Domain:** Production payment webhook ingress, payment reconciliation, cancellation/refund orchestration, CloudPayments integration
**Confidence:** MEDIUM-HIGH

## Summary

Phase 10 should not invent a new payment surface; it should finish the one the repo already has. The production webhook entrypoint already exists at `apps/server/src/routes/payment-webhook.ts`, and the repo already has a webhook adapter boundary in `packages/api/src/payments/webhooks/` plus a domain reconciliation function in `packages/payment/src/payment-service.ts`. The current gap is that those pieces are not actually connected: the live Hono route authenticates and parses provider requests, but then stops at `adapter.processWebhook()`, which currently just logs and returns `{ code: 0 }`. It never reaches `reconcilePaymentWebhook()` on the live path.

The cancellation side has the same shape of gap. The live API surface in `packages/api/src/handlers/booking.ts` still calls `@my-app/booking`'s direct `applyCancellation()` function, which updates booking state and inserts a refund row, but does not execute the `packages/disputes` workflow that already exists for orchestration and event emission. At the same time, `packages/disputes/src/cancellation-workflow.ts` still assumes policy recalculation at apply time, while the live contract in `packages/api-contract/src/routers/booking.ts` explicitly says apply should use the stored snapshot. That mismatch needs to be resolved deliberately, not papered over.

**Primary recommendation:** keep the public webhook path in Hono, keep webhook auth/body parsing inside `PaymentWebhookAdapter`, move all booking/payment state mutation into the payment domain, and route live cancellation application through `packages/disputes` using a snapshot-backed workflow plus a `PaymentProvider` adapter in `packages/payment` for real refunds.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| OPER-01 | Operator can connect and validate one org-scoped payment provider path for booking collection | Reuse `organizationPaymentConfig`, `webhookEndpointId`, and the existing Hono webhook route; validate the provider path by authenticating a real webhook, reconciling it, and promoting config status from `pending` to `validated` on the live ingress path. |
| BOOK-03 | System can reconcile payment webhooks idempotently and update booking/payment state consistently | Use the existing `reconcilePaymentWebhook()` reconciliation model, but make the live `/api/payments/webhook/:provider/:type` route delegate into it after adapter auth/parse; preserve `paymentWebhookEvent` + `bookingPaymentAttempt` idempotency and add route-level integration coverage. |
| BOOK-05 | System can execute a baseline cancellation and refund flow that applies policy, records refund state, and keeps booking/payment state in sync | Keep preview/policy calculation separate from apply; route live apply through `packages/disputes` with stored request snapshot data and a `PaymentProvider.refund()` adapter so refund execution and booking/payment/refund state transitions stay consistent. |
</phase_requirements>

## Standard Stack

### Core

| Library / Module | Version | Purpose | Why Standard |
|------------------|---------|---------|--------------|
| `hono` | `^4.8.2` | Public webhook ingress in `apps/server` | Already owns the production callback route and preserves raw `Request` access for provider auth and body parsing. |
| `@orpc/server` | `^1.12.2` | Typed internal procedures and app API surface | Good for typed internal seams and operator APIs, but not the canonical provider callback surface. |
| `zod` | `^4.x` | Provider payload parsing + contract validation | Already used in webhook adapters and contracts; consistent with repo boundaries. |
| `drizzle-orm` | `1.0.0-beta.16-2ffd1a5` | Payment event, attempt, booking, and refund persistence | Existing source of truth for idempotent upserts and state transitions. |
| `vitest` | `^4.0.18` | Unit + integration verification | Already configured across `packages/*` and `apps/server`; sufficient for route and domain tests. |
| Built-in `fetch` + Node/Web Crypto | runtime built-in | CloudPayments API calls + HMAC verification | No extra SDK is required for Phase 10; avoids introducing another abstraction layer prematurely. |

### Supporting

| Library / Module | Purpose | When to Use |
|------------------|---------|-------------|
| `packages/api/src/payments/webhooks/*` | Provider-specific auth + body parsing adapters | Use for webhook ingress only; keep business state changes out of these adapter classes. |
| `@my-app/workflows` | Multi-step cancellation/refund orchestration with compensation | Use for live cancellation apply and refund execution, not for simple preview reads. |
| `.agents/skills/provider-adapters` pattern | Provider registry + concrete adapter structure | Use for charge/refund/cancel/capture provider execution in `packages/payment`. |
| `.agents/skills/workflows` pattern | Step-based orchestration rules | Use to split refund execution, booking update, and event emission into explicit steps. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hono webhook route as canonical ingress | Public oRPC `payments.receiveWebhook` as canonical ingress | Reject for Phase 10. Provider callbacks need raw request semantics and already have a dedicated route; keep oRPC for typed/manual surfaces, not the real provider callback URL. |
| Adapter-owned business logic in `processWebhook()` | Thin adapter + payment-domain reconciliation service | Prefer thin adapter. Keeps provider parsing/auth separate from booking/payment state mutation. |
| Direct DB mutation in `packages/booking.applyCancellation()` | Snapshot-backed disputes workflow + payment provider adapter | Prefer disputes workflow. Better matches repo architecture and Phase 10’s live-path goal. |
| Add a CloudPayments SDK dependency | Built-in `fetch` + HMAC + typed adapter/provider files | Prefer built-ins. Existing repo patterns already favor thin provider adapters over SDK-heavy domain code. |

**Installation:**

No new external package is required for the recommended Phase 10 implementation. Use the existing workspace stack and built-in crypto/fetch primitives.

## Architecture Patterns

### Recommended Project Structure

```text
apps/server/src/
├── app.ts                          # Startup wiring for webhook/provider registration
└── routes/
    └── payment-webhook.ts         # Raw provider ingress only

packages/api/src/
├── handlers/
│   └── booking.ts                 # Thin handler delegates cancellation apply to disputes workflow
└── payments/webhooks/
    ├── registry.ts                # Webhook adapter registry
    └── cloudpayments/adapter.ts   # Auth + parse only

packages/payment/src/
├── payment-service.ts             # Payment config + webhook reconciliation domain logic
├── provider.ts                    # PaymentProvider interface
├── registry.ts                    # register/get/reset payment providers
└── adapters/
    └── cloudpayments.ts           # Refund/capture/cancel execution

packages/disputes/src/
└── cancellation-workflow.ts       # Snapshot-backed apply flow + refund execution + event emission
```

### Pattern 1: Thin production webhook ingress

**What:** Keep `apps/server/src/routes/payment-webhook.ts` as the public CloudPayments callback URL. Let the route resolve the provider adapter, authenticate the request, parse the request body, and then delegate to payment-domain reconciliation.

**When to use:** All real provider callbacks (`check`, `pay`, `fail`, `confirm`, `refund`, `cancel`).

**Why:** The production route already exists, the official CloudPayments docs expect a callback URL outside the app’s typed UI API surface, and the raw `Request` is required for request-body verification.

**Example:**

```typescript
// Source pattern: apps/server/src/routes/payment-webhook.ts
paymentWebhookRoutes.post("/api/payments/webhook/:provider/:type", async (c) => {
  const provider = c.req.param("provider");
  const webhookType = c.req.param("type");
  const request = c.req.raw;

  const adapter = getPaymentWebhookAdapter(provider);
  if (!adapter) return c.json({ error: "Unknown payment provider" }, 404);

  adapter.authenticateWebhook(request); // must validate Basic Auth or HMAC, not header presence only
  const payload = await adapter.parseWebhookBody(request);

  const result = await reconcileIncomingWebhook({
    provider,
    webhookType,
    payload,
  });

  return c.json({ code: 0, ...result }, 200);
});
```

### Pattern 2: Adapter for ingress, domain service for reconciliation

**What:** Keep `PaymentWebhookAdapter` responsible for provider-specific request authentication and payload normalization. Move booking/payment state mutation into the payment domain service.

**When to use:** Any provider webhook implementation now and any future provider additions.

**Why:** The current `CloudPaymentsWebhookAdapter.processWebhook()` is a dead-end seam. The repo’s layering rules and provider-adapters skill both favor “provider integration behind an adapter, domain state in the owning package.”

**Example:**

```typescript
// Source pattern: packages/payment/src/payment-service.ts + provider-adapters skill
export async function reconcileIncomingWebhook(input: {
  provider: "cloudpayments" | "stripe";
  endpointId: string;
  webhookType: string;
  payload: Record<string, unknown>;
}, db: Db) {
  return reconcilePaymentWebhook(input.endpointId, input.webhookType, input.payload, db);
}
```

### Pattern 3: Snapshot-backed cancellation apply through disputes workflow

**What:** Preserve preview-time policy computation in `packages/booking`, but make the live apply path call a disputes workflow that consumes the stored cancellation request snapshot instead of recalculating refund policy at apply time.

**When to use:** `booking.applyCancellation` on the live API surface.

**Why:** The public contract already says apply uses stored snapshot. The current disputes workflow recalculates policy, which risks drift between preview and apply. The workflow should orchestrate refund execution, booking/payment updates, and event emission using the stored request row.

**Example:**

```typescript
// Recommended target shape for the live handler
const request = await getCancellationRequestForApply(input.requestId, orgId, db);
const workflow = processCancellationWorkflow(db);

const result = await workflow.execute(
  {
    bookingId: request.bookingId,
    organizationId: request.organizationId,
    reason: request.reason ?? undefined,
    snapshot: {
      refundAmountCents: request.refundAmountCents,
      currency: request.currency,
      reasonCode: request.reasonCode ?? undefined,
    },
  },
  makeWorkflowContext(context),
);
```

### Pattern 4: Provider registry for real refund execution

**What:** Add a `PaymentProvider` interface plus registry in `packages/payment`, separate from webhook adapters. Use it for refund/capture/cancel execution.

**When to use:** Live refund execution, later payment capture/cancel flows, and fake provider injection in tests.

**Why:** The repo already has a webhook adapter registry on the ingress side. Phase 10 needs the matching provider registry on the execution side so disputes workflows can call `refund()` without importing provider-specific code.

**Example:**

```typescript
// Source pattern: .agents/skills/provider-adapters/SKILL.md
export interface PaymentProvider {
  readonly providerId: "cloudpayments" | "stripe";
  refund(paymentId: string, amountKopeks: number): Promise<{ refundId: string }>;
  capture(paymentId: string): Promise<void>;
  cancel(paymentId: string): Promise<void>;
}
```

### Anti-Patterns to Avoid

- **Webhook business logic inside `adapter.processWebhook()`:** bad separation of concerns and exactly the seam that currently bypasses live reconciliation.
- **Recalculating policy during apply:** risks snapshot drift; preview/apply must not disagree after the request is created.
- **Refund execution inside handlers:** violates repo layering and makes rollback/idempotency harder.
- **Reading env vars from domain methods:** provider credentials should be injected at startup, not looked up ad hoc in workflows.
- **Treating `Content-HMAC` presence as verification:** official docs say compute and compare the HMAC; a header’s mere existence is not proof.

## Don't Hand-Roll

| Problem | Don’t Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Provider webhook routing/auth/body parsing | Custom parsing/auth inline in Hono route | Existing `PaymentWebhookAdapter` registry and provider adapter files | Keeps raw request handling centralized and provider-specific. |
| Refund provider execution | Direct `fetch` calls scattered through booking/disputes handlers | `PaymentProvider` interface + registry in `packages/payment` | Preserves one execution boundary and makes tests/fakes straightforward. |
| Cancellation orchestration | Inline multi-query handler logic | `@my-app/workflows` in `packages/disputes` | Gives explicit step boundaries, compensation hooks, and cleaner verification. |
| Webhook dedupe | In-memory request cache | `paymentWebhookEvent` + `bookingPaymentAttempt` persistence-based idempotency | Survives retries and process restarts; matches production behavior. |
| HMAC verification helper package | Third-party webhook verifier for a single provider | Built-in crypto HMAC using the CloudPayments rules | No extra dependency needed; the verification algorithm is documented. |

**Key insight:** Phase 10 is mostly about connecting already-existing boundaries, not introducing new frameworks. The only meaningful new abstraction is the missing `PaymentProvider` execution-side adapter in `packages/payment`.

## Common Pitfalls

### Pitfall 1: Live route still stops at adapter `processWebhook()`

**What goes wrong:** The app returns `200 { code: 0 }`, but booking/payment state never changes because the route never calls the payment-domain reconciliation logic.

**Why it happens:** The current server route was tested as a webhook ingress shell, not as the actual reconciliation path.

**How to avoid:** Make the Hono route integration test assert database side effects (webhook event row, payment attempt row, booking payment status), not just HTTP response status.

**Warning signs:** Route tests only stub adapter methods; no test inserts a booking and then verifies `paymentStatus` after hitting `/api/payments/webhook/...`.

### Pitfall 2: Header presence treated as webhook verification

**What goes wrong:** Any request with a `Content-HMAC` header can pass authentication even if the signature is wrong.

**Why it happens:** The current adapter checks for header existence rather than computing and comparing the HMAC.

**How to avoid:** Compute the HMAC using the raw request body and the provider secret, compare against `X-Content-HMAC`/`Content-HMAC`, and only then continue.

**Warning signs:** `authenticateWebhook()` returns successfully without comparing computed signature bytes.

### Pitfall 3: Refund policy drift between preview and apply

**What goes wrong:** The refund amount shown at request time differs from the amount used at apply time.

**Why it happens:** `packages/disputes/src/cancellation-workflow.ts` currently recalculates policy from input, while the public contract says apply uses stored snapshot.

**How to avoid:** Pass the stored cancellation request snapshot into the apply workflow and treat it as authoritative for apply-time refund amount.

**Warning signs:** Apply path re-reads `startsAt`, `capturedAmountCents`, or policy profile to recompute instead of using request snapshot values.

### Pitfall 4: Float/ruble conversion leaks into domain state

**What goes wrong:** Refunds or captured amounts become inconsistent due to `Amount` values crossing boundaries as strings/floats/rubles instead of integer cents/kopeks.

**Why it happens:** CloudPayments payloads and API bodies use decimal rubles, while repo domain state uses integer cents/kopeks.

**How to avoid:** Convert at the provider boundary only; keep all domain state and events as integers.

**Warning signs:** `amountCents` or `refundAmountCents` derived deep inside workflows from strings or decimals rather than normalized provider payloads.

### Pitfall 5: Payment config never becomes “validated” on the live path

**What goes wrong:** Operators can connect a provider config, but it remains `pending` / inactive forever, so the org-scoped provider path is not truly validated.

**Why it happens:** `connectPaymentProvider()` initializes `validationStatus: "pending"` and `isActive: false`, and no current live path updates those fields.

**How to avoid:** On the first successfully authenticated and reconciled webhook for a config, promote the config to `validationStatus: "validated"` and `isActive: true`, or introduce an explicit validation transition executed on the same live ingress path.

**Warning signs:** End-to-end tests pass booking/payment state updates but leave `organizationPaymentConfig.validationStatus` unchanged.

## Code Examples

Verified repo-native patterns to reuse:

### Webhook ingress stays raw, domain logic stays downstream

```typescript
// Source: apps/server/src/routes/payment-webhook.ts + packages/payment/src/payment-service.ts
paymentWebhookRoutes.post("/api/payments/webhook/:provider/:type", async (c) => {
  const provider = c.req.param("provider");
  const webhookType = c.req.param("type");
  const endpointId = c.req.query("endpointId") ?? c.req.header("x-endpoint-id") ?? "";
  const adapter = getPaymentWebhookAdapter(provider);

  if (!adapter) return c.json({ error: "Unknown payment provider" }, 404);

  adapter.authenticateWebhook(c.req.raw);
  const payload = await adapter.parseWebhookBody(c.req.raw);

  const result = await reconcilePaymentWebhook(endpointId, webhookType, payload, db);
  return c.json({ code: 0, ...result }, 200);
});
```

### Refund execution belongs behind a provider registry

```typescript
// Source: provider-adapters skill, adapted to this repo
const provider = getPaymentProvider(config.provider);
const refund = await provider.refund(paymentAttempt.providerIntentId, request.refundAmountCents);

await tx.update(bookingRefund).set({
  status: "processed",
  externalRefundId: refund.refundId,
  processedAt: new Date(),
});
```

### Apply-time workflow should consume stored request snapshot

```typescript
// Source: booking apply contract + disputes workflow gap analysis
const workflow = processCancellationWorkflow(db);
await workflow.execute(
  {
    bookingId: request.bookingId,
    organizationId: request.organizationId,
    reason: request.reason ?? undefined,
    snapshot: {
      refundAmountCents: request.refundAmountCents,
      currency: request.currency,
      reasonCode: request.reasonCode ?? undefined,
    },
  },
  ctx,
);
```

## State of the Art

| Old / Current Repo Approach | Current Recommended Approach | Evidence | Impact |
|-----------------------------|------------------------------|----------|--------|
| Server webhook route ends at `adapter.processWebhook()` | Server webhook route authenticates/parses, then delegates into payment-domain reconciliation | `apps/server/src/routes/payment-webhook.ts`, `packages/api/src/handlers/internal/server-routes.ts`, `packages/payment/src/payment-service.ts` | Closes the “live ingress bypass” gap for BOOK-03. |
| `booking.applyCancellation()` directly mutates DB and inserts refund row | Live apply path delegates to disputes workflow backed by stored request snapshot | `packages/booking/src/cancellation-service.ts`, `packages/disputes/src/cancellation-workflow.ts`, booking contract docs | Closes the scaffold-only cancellation/refund gap for BOOK-05. |
| Webhook adapter accepts `Content-HMAC` header presence | Compute and compare HMAC per CloudPayments notification docs | `docs/CloudPayments.md` §"Проверка уведомлений" | Prevents false-positive webhook authentication on the live path. |
| No execution-side provider abstraction in `packages/payment` | Add `PaymentProvider` interface + registry + CloudPayments provider adapter | provider-adapters skill + ADR gap notes | Enables real refunds/capture/cancel without provider logic in handlers/workflows. |

**Deprecated / outdated for this phase:**

- `adapter.processWebhook()` as the terminal business hook for production webhooks — keep only if it delegates into payment-domain reconciliation.
- Direct refund-row insertion as the whole refund story — insufficient once Phase 10 requires live refund execution and state sync.

## Open Questions

1. **What flips `organizationPaymentConfig` from `pending` to `validated`?**
   - What we know: `connectPaymentProvider()` writes `validationStatus: "pending"` and `isActive: false`; no current live path updates either field.
   - What’s unclear: whether validation should happen on first successful webhook, a dedicated “check” callback, or an operator-triggered verification action.
   - Recommendation: For Phase 10, treat the first successfully authenticated and reconciled provider callback as the validation event unless the planning pass finds an existing explicit validation endpoint pattern.

2. **Should `payments.receiveWebhook` stay after the live route is canonical?**
   - What we know: `packages/api-contract/src/routers/payments.ts` exposes `receiveWebhook`, but the production route is already Hono-based.
   - What’s unclear: whether that contract is still needed for manual testing/admin replay or should become an internal-only seam.
   - Recommendation: Keep it only if Phase 10 planning assigns it a concrete role (admin replay, smoke tests, or dev tooling). Otherwise avoid splitting live webhook ownership across two ingress paths.

3. **How should the disputes workflow accept snapshot authority?**
   - What we know: current disputes workflow recalculates policy from input; live booking contract says apply uses stored snapshot.
   - What’s unclear: whether to extend workflow input with an explicit snapshot payload or split “preview policy” and “apply snapshot” workflows.
   - Recommendation: Favor explicit snapshot input on apply. It preserves contract semantics and hidden-test friendliness.

## Sources

### Primary (HIGH confidence)

- Workspace source: `apps/server/src/routes/payment-webhook.ts` — current production webhook ingress route
- Workspace source: `packages/api/src/handlers/internal/server-routes.ts` — current server-side webhook processing seam
- Workspace source: `packages/payment/src/payment-service.ts` — current payment-domain reconciliation logic and idempotency model
- Workspace source: `packages/booking/src/cancellation-service.ts` — current live cancellation preview/apply implementation
- Workspace source: `packages/disputes/src/cancellation-workflow.ts` — existing orchestration workflow not yet on live path
- Workspace source: `packages/api/src/handlers/booking.ts` — current live handler wiring
- Workspace source: `packages/api-contract/src/routers/payments.ts` and `packages/api-contract/src/routers/booking.ts` — public contract semantics
- Repo skill: `.agents/skills/provider-adapters/SKILL.md` — adapter + registry pattern for provider execution
- Repo skill: `.agents/skills/workflows/SKILL.md` — workflow orchestration rules
- Repo skill: `.agents/skills/domain-packages/SKILL.md` — handler/domain/repository boundary rules

### Secondary (MEDIUM confidence)

- Vendored official docs: `docs/CloudPayments.md`
  - API auth: HTTP Basic Auth for API requests
  - Webhook notifications: `X-Content-HMAC` / `Content-HMAC` verification rules
  - Callback retry semantics: non-zero codes are retried
  - Refund and transaction status behavior
- Repo architecture note: `docs/ADR/004_event-bus-migration.md` — identifies missing `PaymentProvider` execution-side abstraction and cancellation/live-path gaps

### Tertiary (LOW confidence)

- None. This research did not rely on unverified third-party blog posts or community examples.

## Metadata

**Confidence breakdown:**
- Standard stack: **HIGH** — package manifests and existing runtime structure are explicit.
- Architecture: **MEDIUM-HIGH** — current code, repo skills, and ADRs all point in the same direction, but Phase 10 must resolve one real snapshot/workflow mismatch.
- Pitfalls: **HIGH** — directly supported by current source inspection and vendored CloudPayments docs.

**Research date:** 2026-03-10
**Valid until:** 2026-04-09
